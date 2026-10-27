import type { Attachment } from "../shared/types";
import { tokensOf } from "./context";

const CHARS_PER_TOKEN = 3.5;
const IMAGE_TOKENS = 800;

export interface ContextPart { id: "system" | "memo" | "you" | "model" | "files" | "draft"; label: string; tokens: number }
export interface ContextUse { usedTokens: number; limitTokens: number; percent: number; level: "ok" | "warn" | "full"; parts: ContextPart[] }

/** How full the model's context is: what the next request would send, estimated from character counts. */
export function contextUse(o: {
  systemChars: number; turns: { role?: "user" | "assistant"; content: string; attachments?: Attachment[] }[]; draftChars: number; draftFiles: Attachment[];
  attachmentBudgetChars: number; limitTokens: number;
  /** Tokens of the summary that stands for the oldest turns (they are not in `turns`). */
  memoTokens?: number;
  /** Tokens of the request as it would really be sent; any part the breakdown cannot see is added to the instructions. */
  sentTokens?: number;
}): ContextUse {
  const files = (list: Attachment[]) => {
    const text = list.filter((a) => a.kind === "text").reduce((n, a) => n + (a.text?.length ?? a.size), 0);
    return Math.min(text, o.attachmentBudgetChars) + list.filter((a) => a.kind === "image").length * IMAGE_TOKENS * CHARS_PER_TOKEN;
  };
  const tokens = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);
  // prose is about 3.5 characters per token, code (artifacts, fences) about 2.8: a chat full of code is fuller than it looks
  let you = 0, model = 0, fileChars = 0;
  for (const t of o.turns) {
    if (t.role === "assistant") model += tokensOf(t.content); else you += tokensOf(t.content);
    fileChars += files(t.attachments ?? []);
  }
  const all: ContextPart[] = [
    { id: "system", label: "Instructions, skills and project knowledge", tokens: tokens(o.systemChars) },
    { id: "memo", label: "Summary of earlier messages", tokens: o.memoTokens ?? 0 },
    { id: "you", label: "Your messages", tokens: you },
    { id: "model", label: "Model replies and files it wrote", tokens: model },
    { id: "files", label: "Attached files and photos", tokens: tokens(fileChars + files(o.draftFiles)) },
    { id: "draft", label: "What you are typing", tokens: tokens(o.draftChars) }
  ];
  // the request really sent carries more fixed text than the prompt rebuilt here (loaded skills, rules of the kind of work):
  // that remainder is shown with the instructions, so the parts always add up to the percentage
  const sum = all.reduce((n, p) => n + p.tokens, 0);
  if (o.sentTokens && o.sentTokens > sum) all[0].tokens += o.sentTokens - sum;
  const used = all.reduce((n, p) => n + p.tokens, 0);
  const limit = Math.max(1, o.limitTokens);
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return { usedTokens: used, limitTokens: limit, percent, level: percent >= 90 ? "full" : percent >= 70 ? "warn" : "ok", parts: all.filter((p) => p.tokens > 0) };
}
