import type { ChatMessage } from "../shared/types";
import { messageTokens, promptTokens, replyReserve } from "./context";
import { FILES_MARK, isFilesMessage, isMemoMessage, joinParts, memoBody, memoMessage, splitParts, textOfMessage, type MemoPart } from "./memo";
import { latestArtifacts } from "./review";

/**
 * Compaction: when a conversation outgrows the model's window, its oldest part is folded into a summary that stays with the
 * conversation, so the model keeps reading what was decided and written while the window holds only the recent messages.
 * A summary is made again from the previous summary plus the messages added since (never from scratch), so it can go on forever.
 */

/** From this share of the room for a request, the oldest part is summarized (before the window is full, never in the middle of an answer). */
export const COMPACT_AT = 0.65;
/** What stays word for word after a compaction: the latest messages, up to this share of the room. */
export const KEEP_SHARE = 0.3;

/** Room for a request in a window: all of it minus what is kept for the answer. */
export const requestRoom = (nctx: number, maxTokens: number) => Math.max(512, nctx - replyReserve(nctx, maxTokens));

const norm = (s: string) => s.trim().toLowerCase();

export interface Plan {
  sys: ChatMessage[];
  /** The oldest messages (the previous memo message, if any, comes first): what gets summarized. */
  head: ChatMessage[];
  /** The latest messages, kept as they are. */
  tail: ChatMessage[];
  /** The message being answered. */
  draft: ChatMessage | null;
  /** How many turns of the chat the head holds, not counting the memo and files messages that stand for earlier ones. */
  turns: number;
}

/**
 * Where to cut. `messages` is the request as built: an optional system message, the conversation, and the message being
 * answered last. The tail is the latest part that fits `keepTokens` (never less than the last exchange), starting on a user message.
 * Null when there is nothing worth summarizing.
 */
export function planCompaction(messages: ChatMessage[], keepTokens: number): Plan | null {
  if (messages.length < 3) return null;
  const sysAt = messages[0].role === "system" ? 1 : 0;
  const draft = messages[messages.length - 1];
  const conv = messages.slice(sysAt, messages.length - 1);
  let used = 0;
  let cut = conv.length;
  while (cut > 0 && (conv.length - cut < 2 || used + messageTokens(conv[cut - 1]) <= keepTokens)) { used += messageTokens(conv[cut - 1]); cut--; }
  while (cut < conv.length && conv[cut].role !== "user") cut++;
  const head = conv.slice(0, cut);
  const real = head.filter((m) => !isMemoMessage(m) && !isFilesMessage(m));
  if (real.length < 2) return null;
  return { sys: messages.slice(0, sysAt), head, tail: conv.slice(cut), draft, turns: real.length };
}

/** What replaces the head in the request: the summary, then the newest version of every file written in the head and not rewritten since. */
export function foldHead(head: ChatMessage[], tail: ChatMessage[], summary: string, automatic = false): ChatMessage[] {
  const later = new Set(latestArtifacts(tail).map((a) => norm(a.title)));
  const kept = latestArtifacts(head).filter((a) => !later.has(norm(a.title)));
  const out: ChatMessage[] = [memoMessage(summary, automatic)];
  if (kept.length) {
    const block = (a: (typeof kept)[number]) => `<artifact type="${a.kind}"${a.kind === "code" ? ` language="${a.language}"` : ""} title="${a.title.replace(/"/g, "'")}">\n${a.content.replace(/\s+$/, "")}\n</artifact>`;
    out.push({ role: "assistant", content: `${FILES_MARK}\n${kept.map(block).join("\n")}` });
  }
  return out;
}

// ---------------------------------------------------------------- asking the model for the summary

export const COMPACT_SYSTEM = (words: number) => [
  "You keep the memory of a long conversation between a user and an assistant. Write the summary of the messages you are given, so that the assistant can carry on as if it had read them.",
  "Use the language of the conversation. Be dense and factual: no greeting, no comment on the task, no opinion.",
  "Keep exactly: names, numbers, dates, file names, identifiers, short code that matters, and the user's own wording of any rule or preference.",
  "Sections, only the ones that apply, each a short list of dashes: Goal (what the user is trying to do) / Decisions and facts (what was settled, with the values) / Work done (each file or result the assistant made and its state) / Preferences (how the user wants things done) / Open (what is not finished, the next step, questions still unanswered).",
  `At most ${words} words.`
].join("\n");

export const MERGE_SYSTEM = (words: number) => [
  "You keep the memory of a long conversation. Two summaries of two stretches of it are given, the older first. Write one summary of both, in the language they are written in.",
  "Keep what is still true and what the later part did not replace: names, numbers, file names, identifiers, the user's rules and preferences, what is still open. Drop what was settled and no longer matters, and the small talk.",
  "Same sections as the summaries (Goal / Decisions and facts / Work done / Preferences / Open), short lists of dashes, no greeting. The later part wins where they disagree.",
  `At most ${words} words.`
].join("\n");

/** A message as the summarizer reads it: files and code blocks become a line, long text is cut in the middle. */
function readable(m: ChatMessage, max: number): string {
  const raw = textOfMessage(m)
    .replace(/<artifact[^>]*\btitle="([^"]*)"[^>]*>([\s\S]*?)(?:<\/artifact>|$)/g, (_x, t: string, body: string) => `[file "${t}", ${body.split("\n").length} lines]`)
    .replace(/<edit[\s\S]*?<\/edit>/gi, "[edit]")
    .replace(/```[\s\S]*?```/g, (c) => (c.length > 400 ? `${c.slice(0, 300)}\n…\n${c.slice(-80)}` : c))
    .trim();
  const text = raw.length > max ? `${raw.slice(0, Math.floor(max * 0.65))}\n[...]\n${raw.slice(-Math.floor(max * 0.3))}` : raw;
  return `${m.role === "user" ? "User" : "Assistant"}: ${text}`;
}

export function summaryMessages(chunk: ChatMessage[], words: number, perMessage = 1600): ChatMessage[] {
  return [
    { role: "system", content: COMPACT_SYSTEM(words) },
    { role: "user", content: `Messages to summarize:\n\n${chunk.map((m) => readable(m, perMessage)).join("\n\n")}\n\nWrite the summary now, at most ${words} words.` }
  ];
}

export function mergeMessages(older: string, later: string, words: number): ChatMessage[] {
  return [
    { role: "system", content: MERGE_SYSTEM(words) },
    { role: "user", content: `Older part:\n${older}\n\nLater part:\n${later}\n\nWrite the one summary now, at most ${words} words.` }
  ];
}

export interface CompactOptions {
  head: ChatMessage[];
  /** The model's window in tokens: decides how much is summarized in one call. */
  windowTokens: number;
  /** How many turns the summary at the start of `head` stands for (when it is not written in parts). */
  memoTurns?: number;
  ask: (messages: ChatMessage[]) => Promise<string>;
  signal?: AbortSignal;
  /** Called before each call that summarizes a stretch, with (call number from 1, calls in all). */
  onStep?: (n: number, of: number) => void;
}

const clean = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*(summary|updated summary)\s*:\s*/i, "").trim();

/**
 * The summary of `head`, written in parts: the parts of the previous summary (the memo message at its start) stay exactly as they
 * were, and the messages after it are cut into stretches that each get a summary of their own, so a detail is never written over
 * again and again. Only when all the parts together outgrow their share of the window are the two OLDEST merged, until they fit:
 * the recent past stays detailed and the far past gets shorter and shorter.
 */
export async function compactConversation(o: CompactOptions): Promise<string> {
  const part = Math.max(100, Math.min(300, Math.round(o.windowTokens * 0.04)));
  const mergeWords = Math.max(120, Math.min(400, Math.round(o.windowTokens * 0.06)));
  const previous = o.head.find(isMemoMessage);
  const rest = o.head.filter((m) => !isMemoMessage(m) && !isFilesMessage(m));
  const parts: MemoPart[] = previous ? splitParts(memoBody(previous), o.memoTurns ?? 0) : [];
  // one call reads: its instructions, the messages and the new summary
  const chunkTokens = Math.max(400, Math.floor(o.windowTokens * 0.5) - 300 - Math.ceil(part * 1.7));
  const perMessage = Math.max(500, Math.min(1600, chunkTokens * 2));
  const chunks: ChatMessage[][] = [];
  let cur: ChatMessage[] = [];
  let used = 0;
  for (const m of rest) {
    const t = Math.min(messageTokens(m), Math.ceil(perMessage / 2.8) + 8);
    if (cur.length && used + t > chunkTokens) { chunks.push(cur); cur = []; used = 0; }
    cur.push(m); used += t;
  }
  if (cur.length) chunks.push(cur);
  for (const [i, chunk] of chunks.entries()) {
    if (o.signal?.aborted) throw new Error("stopped");
    o.onStep?.(i + 1, chunks.length);
    const reply = clean(await o.ask(summaryMessages(chunk, part, perMessage)));
    if (!reply) throw new Error("the model sent no summary");
    parts.push({ turns: chunk.length, text: reply });
  }
  if (!parts.length) throw new Error("nothing to summarize");
  // the summary must never be what fills the window
  const cap = Math.floor(o.windowTokens * 0.2 * 3.2);
  const size = () => parts.reduce((n, p) => n + p.text.length + 28, 0);
  while (parts.length > 1 && size() > cap) {
    if (o.signal?.aborted) throw new Error("stopped");
    const reply = clean(await o.ask(mergeMessages(parts[0].text, parts[1].text, mergeWords)));
    if (!reply) break; // the model cannot merge: the oldest part is dropped below
    parts.splice(0, 2, { turns: parts[0].turns + parts[1].turns, text: reply });
  }
  while (parts.length > 1 && size() > cap) parts.splice(0, 2, { turns: parts[0].turns + parts[1].turns, text: parts[1].text });
  if (size() > cap) parts[0].text = `${parts[0].text.slice(0, Math.max(200, cap - 28)).trimEnd()}…`;
  return joinParts(parts);
}

/** The request after a compaction: system, the summary (and files), the latest messages, the message being answered. */
export function compacted(plan: Plan, summary: string): ChatMessage[] {
  return [...plan.sys, ...foldHead(plan.head, plan.tail, summary), ...plan.tail, ...(plan.draft ? [plan.draft] : [])];
}

/** True when the conversation (files counted as one line each by `measured`) is past the point where it is summarized. */
export const wantsCompaction = (measured: ChatMessage[], nctx: number, maxTokens: number) => promptTokens(measured) > requestRoom(nctx, maxTokens) * COMPACT_AT;
