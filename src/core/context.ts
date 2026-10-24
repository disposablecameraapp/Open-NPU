import type { ChatMessage } from "../shared/types";
import { artifactsIn, replaceArtifact } from "./artifacts";
import { compactHistory, latestArtifacts } from "./review";

/** Prose is about 3.5 characters per token; code and markup about 2.8 (symbols, indentation, short names). */
const TEXT_CPT = 3.5;
const CODE_CPT = 2.8;

/** Tokens of a text, with the code in it (artifact bodies, fenced blocks) counted denser than prose. */
export function tokensOf(text: string): number {
  let code = 0;
  for (const m of text.matchAll(/<artifact[^>]*>([\s\S]*?)(?:<\/artifact>|$)/g)) code += m[1].length;
  for (const m of text.matchAll(/```[\s\S]*?```/g)) code += m[0].length;
  code = Math.min(code, text.length);
  return Math.ceil(code / CODE_CPT + (text.length - code) / TEXT_CPT);
}

const textOf = (m: ChatMessage) => (typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join(""));
const IMAGE_TOKENS = 800;
export function messageTokens(m: ChatMessage): number {
  const imgs = typeof m.content === "string" ? 0 : m.content.filter((p) => p.type === "image_url").length;
  return tokensOf(textOf(m)) + imgs * IMAGE_TOKENS + 4;
}
export const promptTokens = (ms: ChatMessage[]) => ms.reduce((n, m) => n + messageTokens(m), 0);

export interface Fitted {
  messages: ChatMessage[];
  /** What was done to make it fit, in plain words (shown under the answer). */
  notes: string[];
  tokens: number;
  /** Still too long after everything: the request is sent anyway and will probably be cut. */
  overflow: boolean;
}

const placeholder = (title: string) => `(the file "${title}" is under "Current files" at the end)`;

/** Replaces every artifact of a message by a pointer, so the code lives once, at the end, in its newest version. */
function liftFiles(m: ChatMessage): ChatMessage {
  if (m.role !== "assistant" || typeof m.content !== "string") return m;
  let text = m.content;
  const arts = artifactsIn(text);
  if (!arts.length) return m;
  // from the last to the first, so earlier positions stay valid
  for (let i = arts.length - 1; i >= 0; i--) {
    const m2 = [...text.matchAll(/<artifact(?:\s[^>]*)?>[\s\S]*?<\/artifact>/g)][i];
    if (m2?.index !== undefined) text = text.slice(0, m2.index) + placeholder(arts[i].title) + text.slice(m2.index + m2[0].length);
  }
  return { ...m, content: text };
}

/**
 * Makes a request fit the model's context instead of letting it overflow in the middle of an answer.
 * 1. old versions of a file are replaced by a note; 2. the files move out of the history to the end, newest version only;
 * 3. the oldest messages are left out. The system message and the last message are never touched.
 */
export function fitMessages(messages: ChatMessage[], budgetTokens: number): Fitted {
  const notes: string[] = [];
  let ms = compactHistory(messages);
  const done = (overflow: boolean): Fitted => ({ messages: ms, notes, tokens: promptTokens(ms), overflow });
  if (promptTokens(ms) <= budgetTokens) return done(false);

  // 2. files out of the history to the end, newest versions only. Only the files that fit are carried, the most recently
  // written first: a chat that made five different games must not send all five every time.
  const all = latestArtifacts(messages);
  if (all.length) {
    const lastUser = [...ms].map((m) => m.role).lastIndexOf("user");
    const bare = ms.map((m, i) => (i === lastUser ? m : liftFiles(m)));
    const base = promptTokens(bare) + 120;
    const room = Math.max(0, budgetTokens - base);
    const fileBlock = (a: (typeof all)[number]) => `<artifact type="${a.kind}"${a.kind === "code" ? ` language="${a.language}"` : ""} title="${a.title.replace(/"/g, "'")}">\n${a.content.replace(/\s+$/, "")}\n</artifact>`;
    const carried: typeof all = [];
    let used = 0;
    for (const a of [...all].reverse()) {
      const t = tokensOf(fileBlock(a));
      if (carried.length === 0 || used + t <= room) { carried.push(a); used += t; }
    }
    const left = all.filter((a) => !carried.includes(a));
    const block = `Current files (newest version, edit these, never start over):\n${carried.reverse().map(fileBlock).join("\n")}${left.length ? `\n(Older files not shown here: ${left.map((a) => a.title).join(", ")}.)` : ""}`;
    ms = bare;
    if (lastUser >= 0) {
      const u = ms[lastUser];
      ms = ms.map((m, i) => (i === lastUser ? { ...u, content: typeof u.content === "string" ? `${u.content}\n\n${block}` : [...u.content, { type: "text" as const, text: `\n\n${block}` }] } : m));
    }
    notes.push(left.length ? `Only the newest file${carried.length === 1 ? "" : "s"} (${carried.map((a) => a.title).join(", ")}) ${carried.length === 1 ? "is" : "are"} sent; ${left.length} older file${left.length === 1 ? "" : "s"} left out.` : "The files were moved to the end of the request, newest version only.");
  }
  if (promptTokens(ms) <= budgetTokens) return done(false);

  // 3. drop the oldest turns (not the system message, not the last user message)
  const sysAt = ms[0]?.role === "system" ? 1 : 0;
  let dropped = 0;
  while (promptTokens(ms) > budgetTokens && ms.length - sysAt > 2) {
    ms = [...ms.slice(0, sysAt), ...ms.slice(sysAt + 1)];
    dropped++;
  }
  if (dropped) {
    ms = [...ms.slice(0, sysAt), { role: "user", content: "[Earlier messages were left out to fit the context.]" }, ...ms.slice(sysAt)];
    // two user messages in a row are fine for the chat templates, but keep the order tidy
    notes.push(`${dropped} earlier message${dropped === 1 ? " was" : "s were"} left out to fit the context.`);
  }
  return done(promptTokens(ms) > budgetTokens);
}

/** The reply a model gave up in the middle of, glued to what it wrote when asked to continue (repeated tail removed). */
export function joinContinuation(prev: string, next: string): string {
  const tail = prev.slice(-300);
  for (let k = Math.min(tail.length, next.length, 300); k >= 12; k--) {
    if (next.startsWith(tail.slice(-k))) return prev + next.slice(k);
  }
  return prev + next;
}

export const CONTINUE_PROMPT = "You were cut off in the middle of your answer. Continue from the last character you wrote and send only the rest: no greeting, no repetition, and close the file with its closing tag when it is finished.";

/** True when the text ends inside an artifact that was never closed. */
export const endsOpen = (text: string) => {
  const opens = (text.match(/<artifact(?:\s[^>]*)?>/g) ?? []).length;
  const closes = (text.match(/<\/artifact>/g) ?? []).length;
  return opens > closes;
};

export { replaceArtifact };

/** Room kept for the answer inside the window: the answer limit, but never more than 30 % of it (at least 2K). */
export const replyReserve = (nctx: number, maxTokens: number) => Math.min(maxTokens, Math.max(2048, Math.floor(nctx * 0.3)));

export interface RequestUse {
  /** Tokens the request would carry once fitted (what is really sent), including `extraTokens`. */
  usedTokens: number;
  /** What the request can hold: the window minus the room kept for the answer. */
  budgetTokens: number;
  percent: number;
  level: "ok" | "warn" | "full";
  /** Something had to be left out or moved to make it fit. */
  fitted: boolean;
  overflow: boolean;
  notes: string[];
}

/** How full the NEXT request is, measured after the same fitting that runs before sending: the number that matters. */
export function requestUse(messages: ChatMessage[], o: { nctx: number; maxTokens: number; extraTokens?: number }): RequestUse {
  const budget = Math.max(512, o.nctx - replyReserve(o.nctx, o.maxTokens));
  const fit = fitMessages(messages, budget - (o.extraTokens ?? 0));
  const used = fit.tokens + (o.extraTokens ?? 0);
  const percent = Math.min(100, Math.round((used / budget) * 100));
  return { usedTokens: used, budgetTokens: budget, percent, level: percent >= 90 ? "full" : percent >= 70 ? "warn" : "ok", fitted: fit.notes.length > 0, overflow: fit.overflow, notes: fit.notes };
}
