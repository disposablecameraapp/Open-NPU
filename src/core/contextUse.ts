import type { Attachment } from "../shared/types";

const CHARS_PER_TOKEN = 3.5;
const IMAGE_TOKENS = 800;

export const estimateTokens = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

export interface ContextUse { usedTokens: number; limitTokens: number; percent: number; level: "ok" | "warn" | "full" }

/** How full the model's context is: what the next request would send, estimated from character counts. */
export function contextUse(o: {
  systemChars: number; turns: { content: string; attachments?: Attachment[] }[]; draftChars: number; draftFiles: Attachment[];
  attachmentBudgetChars: number; limitTokens: number;
}): ContextUse {
  const files = (list: Attachment[]) => {
    const text = list.filter((a) => a.kind === "text").reduce((n, a) => n + (a.text?.length ?? a.size), 0);
    return Math.min(text, o.attachmentBudgetChars) + 0 + list.filter((a) => a.kind === "image").length * IMAGE_TOKENS * CHARS_PER_TOKEN;
  };
  let chars = o.systemChars + o.draftChars + files(o.draftFiles);
  for (const t of o.turns) chars += t.content.length + files(t.attachments ?? []);
  const limit = Math.max(1, o.limitTokens);
  const used = estimateTokens(chars);
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return { usedTokens: used, limitTokens: limit, percent, level: percent >= 90 ? "full" : percent >= 70 ? "warn" : "ok" };
}
