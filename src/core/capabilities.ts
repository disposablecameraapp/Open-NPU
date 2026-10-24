import type { CatalogEntry } from "../shared/types";
import { thinkingSupport, visionSupport } from "./effort";

export type CapId = "thinking" | "vision" | "code" | "moe" | "long" | "native";
export interface Capability { id: CapId; label: string; hint: string }

type Named = Pick<CatalogEntry, "id" | "name" | "repo"> & Partial<Pick<CatalogEntry, "role" | "engine" | "isMoe" | "architecture" | "maxTestedContext" | "recommendedContext">> & { tags?: string[]; pipeline?: string | null };

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
  const ctx = e.maxTestedContext ?? e.recommendedContext ?? 0;
  if (ctx >= 32768) out.push({ id: "long", label: `${Math.round(ctx / 1024)}K`, hint: `Long context: tested up to ${Math.round(ctx / 1024)}K tokens.` });
  if (e.engine === "qairt") out.push({ id: "native", label: "Native NPU", hint: "A native Qualcomm bundle: runs entirely on the Hexagon NPU." });
  return out;
}
