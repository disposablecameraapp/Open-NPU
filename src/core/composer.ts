/** Pure helpers for the composer: per-chat drafts, editing or retrying a turn, starter prompts, textarea growth. */

export const draftKey = (convId: string) => `opennpu.draft.${convId}`;

/** Index of the last user turn, or -1. */
export function lastUserIndex(turns: readonly { role: string }[]): number {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i].role === "user") return i;
  return -1;
}

/** The turns that stay when the user turn at `index` is edited or retried: everything before it. Null if that is not a user turn. */
export function turnsBefore<T extends { role: string }>(turns: readonly T[], index: number): T[] | null {
  return turns[index]?.role === "user" ? turns.slice(0, index) : null;
}

export const STARTERS = [
  { label: "Explain something", prompt: "Explain to me like I'm new to it: " },
  { label: "Write code", prompt: "Write a function that " },
  { label: "Make a web page", prompt: "Make a web page that " },
  { label: "Summarize a file", prompt: "Summarize the attached file in a few bullet points." }
] as const;

/** Textarea height for its content: grows to `maxFrac` of the viewport, then scrolls. */
export function growTo(contentHeight: number, viewportHeight: number, maxFrac = 0.4): { height: number; scroll: boolean } {
  const max = Math.max(80, Math.floor(viewportHeight * maxFrac));
  return { height: Math.min(contentHeight, max), scroll: contentHeight > max };
}
