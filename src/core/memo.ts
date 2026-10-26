import type { ChatMessage } from "../shared/types";

/**
 * The memory of a long conversation: what was said before the messages the model still reads word for word.
 * A leaf module (no imports from the rest of the core) so both the fitting of a request and the compaction can use it.
 */

/** The start of the message that stands for the older messages. */
export const MEMO_MARK = "[Summary of the earlier conversation";
/** The start of the message that carries the files the assistant wrote in those older messages. */
export const FILES_MARK = "(Files written earlier in this conversation.)";

/** A summary kept with a conversation: it covers its first `turns` visible turns, `hash` fingerprints the last of them. */
export interface Memo {
  text: string;
  turns: number;
  hash: string;
  at: number;
}

export const textOfMessage = (m: ChatMessage): string => (typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join(""));

/** A short fingerprint of a text (FNV-1a over its length and characters). */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${s.length.toString(36)}-${h.toString(36)}`;
}

export const isMemoMessage = (m: ChatMessage) => m.role === "user" && typeof m.content === "string" && m.content.startsWith(MEMO_MARK);
export const isFilesMessage = (m: ChatMessage) => m.role === "assistant" && typeof m.content === "string" && m.content.startsWith(FILES_MARK);

export function memoMessage(text: string, automatic = false): ChatMessage {
  const how = automatic ? "a short recap of the messages that no longer fit" : "kept so nothing is lost";
  return { role: "user", content: `${MEMO_MARK}, ${how}. It stands for those messages: rely on it for what was said, decided and written, and do not mention it unless asked.]\n${text.trim()}` };
}

/** The summary inside a memo message. */
export function memoBody(m: ChatMessage): string {
  const t = textOfMessage(m);
  const at = t.indexOf("]\n");
  return at >= 0 ? t.slice(at + 2) : t;
}

/** The memo of a conversation when it still matches its turns (the covered turns are still there, the last of them unchanged), else null. */
export function usableMemo(visible: { content: string }[], memo: Memo | null | undefined): Memo | null {
  if (!memo || typeof memo.text !== "string" || !memo.text.trim() || !(memo.turns > 0) || memo.turns >= visible.length + 1) return null;
  return hashText(visible[memo.turns - 1]?.content ?? "\u0000") === memo.hash ? memo : null;
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1)).trimEnd()}…` : s);

/** One line for a message: the user's first words, the assistant's first sentence and the files it wrote. */
function lineOf(m: ChatMessage, n: number): string {
  const raw = textOfMessage(m);
  const files = [...raw.matchAll(/<artifact[^>]*\btitle="([^"]*)"/g)].map((x) => x[1]);
  const prose = flat(raw.replace(/<artifact[^>]*>[\s\S]*?(?:<\/artifact>|$)/g, " ").replace(/```[\s\S]*?```/g, " [code] ").replace(/<edit[\s\S]*?<\/edit>/gi, " "));
  if (m.role === "user") return `- User: ${clip(prose, n)}`;
  const first = /^[\s\S]*?[.!?](?=\s|$)/.exec(prose)?.[0] ?? prose;
  return `- Assistant: ${clip(first, n)}${files.length ? ` (wrote: ${[...new Set(files)].join(", ")})` : ""}`;
}

/**
 * A recap of messages made without asking a model: one line each, the earliest summary first. It is the floor under the model's
 * summary: when a request has to be cut in a hurry the model still knows what the conversation was about.
 */
export function digestOf(ms: ChatMessage[], maxChars: number): string {
  const memos = ms.filter(isMemoMessage).map(memoBody).filter(Boolean);
  const rest = ms.filter((m) => !isMemoMessage(m) && !isFilesMessage(m) && textOfMessage(m).trim());
  const head = memos.length ? clip(memos.join("\n"), Math.floor(maxChars * 0.6)) : "";
  const room = maxChars - head.length - 1;
  if (!rest.length || room < 80) return clip(head, maxChars);
  let lines: string[] = [];
  for (const n of [200, 120, 70, 40]) {
    lines = rest.map((m) => lineOf(m, n));
    if (lines.join("\n").length <= room) break;
  }
  if (lines.join("\n").length > room) {
    // still too long: the first and the latest lines stay, the middle is counted
    const keep = Math.max(2, Math.floor(room / 48));
    const a = Math.ceil(keep / 2);
    const b = keep - a;
    lines = [...lines.slice(0, a), `- (${lines.length - keep} more messages)`, ...lines.slice(lines.length - b)];
  }
  return clip([head, ...lines].filter(Boolean).join("\n"), maxChars);
}
