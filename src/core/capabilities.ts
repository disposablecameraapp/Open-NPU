import type { CatalogEntry } from "../shared/types";
import { thinkingSupport, visionSupport } from "./effort";

export type CapId = "thinking" | "vision" | "code" | "moe" | "long" | "native" | "tools" | "multilingual" | "math" | "roleplay" | "uncensored" | "audio" | "distilled" | "embedding";
export interface Capability { id: CapId; label: string; hint: string }

type Named = Pick<CatalogEntry, "id" | "name" | "repo"> & Partial<Pick<CatalogEntry, "role" | "engine" | "isMoe" | "architecture" | "maxTestedContext" | "recommendedContext">> & { tags?: string[]; pipeline?: string | null; contextLength?: number | null };

/** Every kind of model the filters offer, in the order they are shown. */
export const CAP_INFO: { id: CapId; label: string; hint: string }[] = [
  { id: "native", label: "Native NPU", hint: "A native Qualcomm bundle: runs entirely on the Hexagon NPU." },
  { id: "thinking", label: "Thinking", hint: "Reasons before it answers (always, or switchable)." },
  { id: "moe", label: "MoE", hint: "Mixture of experts: big in memory, fast for its size." },
  { id: "code", label: "Code", hint: "Made or recommended for writing code." },
  { id: "vision", label: "Vision", hint: "Understands images." },
  { id: "audio", label: "Audio", hint: "Speech or audio in or out." },
  { id: "tools", label: "Tools", hint: "Trained to call tools and functions (agents)." },
  { id: "math", label: "Math", hint: "Tuned for maths and proofs." },
  { id: "multilingual", label: "Multilingual", hint: "Built for many languages, not only English." },
  { id: "long", label: "Long context", hint: "Handles 32K tokens or more." },
  { id: "roleplay", label: "Roleplay", hint: "Fine-tuned for characters and creative writing." },
  { id: "uncensored", label: "Uncensored", hint: "Refusals removed (abliterated or uncensored fine-tunes)." },
  { id: "distilled", label: "Distilled", hint: "Trained from a bigger model's outputs." },
  { id: "embedding", label: "Embedding", hint: "Turns text into vectors for search; does not chat." }
];

/**
 * What a model is for, from its name, architecture and catalog entry. It is a guide, not a guarantee:
 * the names are what Hugging Face and the catalog say, nothing is probed.
 */
export function capabilities(e: Named): Capability[] {
  const text = `${e.id} ${e.name} ${e.repo}`.toLowerCase();
  const out: Capability[] = [];
  const think = thinkingSupport(e);
  if (think === "always") out.push({ id: "thinking", label: "Thinking", hint: "Always thinks before it answers. Slower, better on hard questions and code." });
  else if (think === "toggle") out.push({ id: "thinking", label: "Thinking", hint: "Can think before it answers; the thinking level in the model menu switches it." });
  if (visionSupport(e) || e.pipeline === "image-text-to-text" || e.tags?.includes("image-text-to-text")) out.push({ id: "vision", label: "Vision", hint: "Understands images: add a photo or screenshot with the + button." });
  if (/coder|code|devstral|starcoder/.test(text) || /coder/i.test(e.role ?? "")) out.push({ id: "code", label: "Code", hint: "Made or recommended for writing code." });
  if (e.isMoe || /moe|a\d+b\b/.test(`${e.architecture ?? ""} ${text}`)) out.push({ id: "moe", label: "MoE", hint: "Mixture of experts: big in memory, but only a small part works on each token, so it is fast for its size." });
  const ctx = e.maxTestedContext ?? e.recommendedContext ?? e.contextLength ?? 0;
  if (ctx >= 32768) out.push({ id: "long", label: `${Math.round(ctx / 1024)}K`, hint: `Long context: ${e.maxTestedContext || e.recommendedContext ? "tested" : "trained"} up to ${Math.round(ctx / 1024)}K tokens.` });
  const all = `${text} ${(e.tags ?? []).join(" ").toLowerCase()} ${e.pipeline ?? ""}`;
  const has = (re: RegExp) => re.test(all);
  const embedding = has(/embed|(^|[-_/ ])(bge|e5|gte|minilm)([-_ ]|$)|nomic|feature-extraction|sentence-similarity/);
  if (embedding) out.push({ id: "embedding", label: "Embedding", hint: "Turns text into vectors for search; does not chat." });
  if (!embedding && has(/tool|function[-_ ]?call|hermes|xlam|gpt-oss|qwen3|granite[-_ ]?[34]|ministral|nemotron|devstral|lfm2/)) out.push({ id: "tools", label: "Tools", hint: "Trained to call tools and functions; a guide from the name." });
  if (has(/math|numina|openmath|qwq|deepseek[-_ ]?r1|nemotron[-_ ]?cascade/)) out.push({ id: "math", label: "Math", hint: "Tuned for maths and proofs." });
  if (has(/multilingual|\baya\b|bloom|mgpt|gemma[-_ ]?3|qwen3|glm|exaone|granite[-_ ]?4|mistral|ministral|smollm3|lfm2/)) out.push({ id: "multilingual", label: "Multilingual", hint: "Built for many languages; a guide from the name." });
  if (has(/audio|whisper|voxtral|speech|asr|tts|omni|text-to-speech|automatic-speech-recognition/)) out.push({ id: "audio", label: "Audio", hint: "Speech or audio in or out." });
  if (has(/roleplay|[-_ ]rp[-_ ]|stheno|euryale|lumimaid|mythomax|dolphin|hermes|story|erp/)) out.push({ id: "roleplay", label: "Roleplay", hint: "Fine-tuned for characters and creative writing." });
  if (has(/uncensored|abliterat|obliterat|dolphin|heretic|lorablated|unfiltered/)) out.push({ id: "uncensored", label: "Uncensored", hint: "Refusals removed (abliterated or uncensored fine-tunes)." });
  if (has(/distill/)) out.push({ id: "distilled", label: "Distilled", hint: "Trained from a bigger model's outputs." });
  if (e.engine === "qairt") out.push({ id: "native", label: "Native NPU", hint: "A native Qualcomm bundle: runs entirely on the Hexagon NPU." });
  return out;
}
