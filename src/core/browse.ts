import type { BrowseQuery, BrowseResult, BrowseRow, HardwareProfile } from "../shared/types";
import { classifyArchitecture } from "./arch";
import { scoreModel } from "./fit";
import { quantFromName } from "./quant";

/** The fields asked of the Hugging Face list endpoint (`expand[]`): enough to judge a repo without opening it. */
export const BROWSE_FIELDS = ["gguf", "siblings", "downloads", "likes", "lastModified", "pipeline_tag", "tags"] as const;

export interface RawHfModel {
  id?: string;
  modelId?: string;
  downloads?: number;
  likes?: number;
  lastModified?: string;
  pipeline_tag?: string;
  tags?: string[];
  gguf?: { total?: number; architecture?: string; context_length?: number };
  siblings?: { rfilename?: string }[];
}

/** Q4_0 is 4.5 bits per weight; the other 4-bit quants are about 4.9. */
const BITS = { q4_0: 4.5, other4: 4.9 };
/** The estimate is made at this context; the real check reads the GGUF header and sizes it exactly. */
const EST_CONTEXT = 4096;

const isFourBit = (q: string) => /^(Q4_[01K]|IQ4)/i.test(q);

const MOE_NAME = /moe|(^|[-_/])a\d+b\b|gpt-oss/i;

/** One raw Hugging Face row as a scored browse row. null when the repo has no GGUF 4-bit file at all. */
export function toBrowseRow(m: RawHfModel, hw: HardwareProfile, opts: { q4Only: boolean }): BrowseRow | null {
  const repo = m.id ?? m.modelId;
  if (!repo) return null;
  const quants = new Set<string>();
  for (const f of m.siblings ?? []) {
    const leaf = (f.rfilename ?? "").split("/").pop() ?? "";
    if (!/\.gguf$/i.test(leaf) || /mmproj/i.test(leaf)) continue;
    const q = quantFromName(leaf);
    if (q) quants.add(q.quant);
  }
  const list = [...quants].sort();
  const hasQ4_0 = quants.has("Q4_0");
  const hasOther4 = list.some((q) => q !== "Q4_0" && isFourBit(q));
  if (!hasQ4_0 && !(hasOther4 && !opts.q4Only)) return null;

  const total = m.gguf?.total;
  const paramsB = typeof total === "number" && total > 0 && total < 2e12 ? Math.round((total / 1e9) * 10) / 10 : null;
  const architecture = m.gguf?.architecture ?? null;
  const isMoe = !!architecture && /moe$/i.test(architecture) || MOE_NAME.test(repo);
  const bits = hasQ4_0 ? BITS.q4_0 : BITS.other4;
  const estGB = paramsB === null ? null : Math.round(((paramsB * 1e9 * bits) / 8 / 1024 ** 3) * 10) / 10;

  const verdict = estGB === null
    ? { level: "amber" as const, reasons: ["Size unknown: use Check and install to read the file."], contextTokens: 0, estNpuGB: 0, estTokPerSec: null, installAllowed: true as const }
    : scoreModel({
      architecture: architecture ?? "unknown",
      fileGB: estGB,
      kind: hasQ4_0 ? "q4_0" : "kquant",
      paramsB,
      isMoe,
      wantedContext: EST_CONTEXT,
      maxTestedContext: EST_CONTEXT,
      engine: "llama_cpp"
    }, hw);
  if (estGB !== null && verdict.level !== "red") verdict.reasons.unshift(`About ${estGB} GB at ${hasQ4_0 ? "Q4_0" : "4-bit"}; estimated at a short context, checked exactly before install.`);
  if (!hasQ4_0 && verdict.level === "green") verdict.level = "amber";

  return {
    repo, downloads: m.downloads ?? 0, likes: m.likes ?? 0, updated: m.lastModified ?? null,
    paramsB, architecture, isMoe, pipeline: m.pipeline_tag ?? null, tags: (m.tags ?? []).slice(0, 12),
    quants: list, hasQ4_0, estGB, verdict
  };
}

/** Filters and orders the rows of one Hugging Face page. The order from Hugging Face (by downloads, likes…) is kept. */
export function browse(raw: RawHfModel[], hw: HardwareProfile, q: Pick<BrowseQuery, "q4Only" | "fitsOnly">): BrowseResult {
  const rows: BrowseRow[] = [];
  for (const m of raw) {
    const r = toBrowseRow(m, hw, q);
    if (!r) continue;
    if (q.fitsOnly) {
      const arch = r.architecture ? classifyArchitecture(r.architecture).cls : "unknown";
      if (r.verdict.level === "red" || arch === "unknown" || arch === "unloadable") continue;
    }
    rows.push(r);
  }
  return { rows, scanned: raw.length, hidden: raw.length - rows.length };
}
