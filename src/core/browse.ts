import type { BrowseQuery, BrowseResult, BrowseRow, BrowseVariant, HardwareProfile, QuantClass, Verdict } from "../shared/types";
import { RawDockerRepo, RawDockerTag, parseTag } from "./docker";
import { scoreModel } from "./fit";
import { QuantKind, quantFromName } from "./quant";

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

/** Bits per weight: Q4_0 is 4.5, the other 4-bit quants about 4.9, Q8_0 8.5, 16-bit 16. */
const BITS: Record<QuantKind, number> = { q4_0: 4.5, q8_0: 8.5, mxfp4: 4.3, kquant: 4.9, iquant: 4.4, other: 16 };
/** The estimate is made at this context; the real check reads the GGUF header and sizes it exactly. */
const EST_CONTEXT = 4096;

export function quantClass(quant: string): QuantClass {
  const q = quant.toUpperCase();
  if (q === "Q4_0") return "q4_0";
  return /^(Q4_[1K]|IQ4)/.test(q) ? "other4" : "other";
}

/** Parameter count in a model name or tag: "Qwen3-4B", "8B-Q4_0", "gemma-3-270m". Active-expert sizes ("A3B") are skipped. */
export function paramsFromName(name: string): number | null {
  const m = /(?:^|[-_./ ])(\d+(?:\.\d+)?)([bm])(?![a-z0-9])/i.exec(name.replace(/-a\d+(?:\.\d+)?b/i, ""));
  if (!m) return null;
  const n = parseFloat(m[1]) / (m[2].toLowerCase() === "m" ? 1000 : 1);
  return n > 0 && n < 2000 ? n : null;
}

const ARCH_BY_NAME: [RegExp, string][] = [
  [/lfm2/i, "lfm2moe"], [/qwen3[-_.]?5|qwen3[-_.]?next/i, "qwen35"], [/qwen3.*(?:a\d+b|moe)|qwen3[-_.]?coder.*30b/i, "qwen3moe"], [/qwen3/i, "qwen3"], [/qwen2/i, "qwen2"],
  [/gpt-oss/i, "gpt-oss"], [/gemma[-_.]?3n/i, "gemma3n"], [/gemma[-_.]?3/i, "gemma3"], [/gemma[-_.]?2/i, "gemma2"], [/gemma/i, "gemma"],
  [/ministral|mistral[-_.]?3/i, "mistral3"], [/mistral|mixtral/i, "mistral"], [/llama[-_.]?4/i, "llama4"], [/llama|tinyllama|vicuna|smollm2/i, "llama"],
  [/smollm3/i, "smollm3"], [/phi[-_.]?4|phi[-_.]?3/i, "phi3"], [/granite[-_.]?4/i, "granitehybrid"], [/granite/i, "granite"], [/deepseek/i, "deepseek2"],
  [/olmo/i, "olmo2"], [/glm[-_.]?4/i, "glm4"], [/exaone/i, "exaone"], [/internlm/i, "internlm2"], [/nemotron/i, "nemotron"]
];

/** Architecture as the GGUF header would name it, guessed from a name when the header cannot be read (Docker Hub, AI Hub). */
export function guessArchitecture(name: string): string {
  return ARCH_BY_NAME.find(([re]) => re.test(name))?.[1] ?? "unknown";
}

const MOE_NAME = /moe|(^|[-_/])a\d+b\b|gpt-oss/i;

const round1 = (n: number) => Math.round(n * 10) / 10;
const gbFor = (paramsB: number, kind: QuantKind) => round1((paramsB * 1e9 * BITS[kind]) / 8 / 1024 ** 3);

function estimate(arch: string, paramsB: number | null, isMoe: boolean, kind: QuantKind, hw: HardwareProfile, fileGB: number | null): Verdict {
  if (fileGB === null) {
    return { level: "amber", reasons: ["Size unknown: use Check and install to read the file."], contextTokens: 0, estNpuGB: 0, estTokPerSec: null, installAllowed: true };
  }
  const v = scoreModel({ architecture: arch, fileGB, kind, paramsB, isMoe, wantedContext: EST_CONTEXT, maxTestedContext: EST_CONTEXT, engine: "llama_cpp" }, hw);
  if (v.level !== "red") v.reasons.unshift(`About ${fileGB} GB; estimated at a short context, checked exactly before install.`);
  return v;
}

/** Which of a repo's quants to estimate for: the best one among the families the person asked for. */
function pickFor(quants: string[], wanted: QuantClass[]): string | null {
  const ok = quants.filter((q) => wanted.includes(quantClass(q)));
  const rank = (q: string) => {
    const i = ["Q4_0", "Q4_K_M", "Q4_K_S", "IQ4_XS", "Q4_1", "Q8_0", "MXFP4_MOE", "MXFP4"].indexOf(q);
    return i < 0 ? 99 : i;
  };
  return ok.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/** One raw Hugging Face row as a scored browse row. null when it has no file in the wanted quant families. */
export function toBrowseRow(m: RawHfModel, hw: HardwareProfile, wanted: QuantClass[]): BrowseRow | null {
  const repo = m.id ?? m.modelId;
  if (!repo) return null;
  const set = new Set<string>();
  for (const f of m.siblings ?? []) {
    const leaf = (f.rfilename ?? "").split("/").pop() ?? "";
    if (!/\.gguf$/i.test(leaf) || /mmproj/i.test(leaf)) continue;
    const q = quantFromName(leaf);
    if (q) set.add(q.quant);
  }
  const quants = [...set].sort();
  const quant = pickFor(quants, wanted);
  if (!quant) return null;

  const total = m.gguf?.total;
  const paramsB = typeof total === "number" && total > 0 && total < 2e12 ? Math.round((total / 1e9) * 10) / 10 : null;
  const architecture = m.gguf?.architecture ?? null;
  const isMoe = (!!architecture && /moe$/i.test(architecture)) || MOE_NAME.test(repo);
  const kind = quantFromName(`x-${quant}.gguf`)?.kind ?? "other";
  const estGB = paramsB === null ? null : gbFor(paramsB, kind);
  const verdict = estimate(architecture ?? "unknown", paramsB, isMoe, kind, hw, estGB);
  if (kind !== "q4_0" && verdict.level === "green") verdict.level = "amber";

  return {
    source: "hf", repo, ref: `${repo}:${quant}`, url: `https://huggingface.co/${repo}`, engine: "llama_cpp",
    downloads: m.downloads ?? 0, likes: m.likes ?? 0, updated: m.lastModified ?? null, description: null,
    paramsB, architecture, isMoe, pipeline: m.pipeline_tag ?? null, tags: (m.tags ?? []).slice(0, 12),
    quants, quant, hasQ4_0: set.has("Q4_0"), estGB, needsVersion: false, verdict
  };
}

/** A Docker Hub model: the size is in the version (tag), so the row only says what the model is and asks for a version. */
export function toDockerRow(r: RawDockerRepo, hw: HardwareProfile): BrowseRow | null {
  if (!r.name) return null;
  const ns = r.namespace ?? "ai";
  const architecture = guessArchitecture(r.name);
  const isMoe = MOE_NAME.test(r.name);
  const verdict = architecture === "unknown"
    ? estimate(architecture, null, isMoe, "q4_0", hw, 1)
    : estimate(architecture, null, isMoe, "q4_0", hw, null);
  if (architecture === "unknown") { verdict.level = "red"; verdict.reasons = ["Unknown architecture: may not load. Pick a version to see its size."]; }
  else verdict.reasons = ["Pick a version (size and quant are in its name) to see the fit."];
  return {
    source: "docker", repo: `${ns}/${r.name}`, ref: `docker.io/${ns}/${r.name}`, url: `https://hub.docker.com/r/${ns}/${r.name}`, engine: "llama_cpp",
    downloads: r.pull_count ?? 0, likes: r.star_count ?? 0, updated: r.last_updated ?? null, description: r.description ?? null,
    paramsB: paramsFromName(r.name), architecture: architecture === "unknown" ? null : architecture, isMoe, pipeline: null, tags: [],
    quants: [], quant: null, hasQ4_0: false, estGB: null, needsVersion: true, verdict
  };
}

/** The versions of one Docker Hub model, each with the size it really has and the fit that gives. */
export function dockerVariants(name: string, tags: RawDockerTag[], hw: HardwareProfile, namespace = "ai"): BrowseVariant[] {
  const architecture = guessArchitecture(name);
  const out: BrowseVariant[] = [];
  for (const t of tags) {
    if (!t.name) continue;
    const p = parseTag(t.name);
    const paramsB = p.paramsB ?? paramsFromName(name);
    const kind = p.quant ? quantFromName(`x-${p.quant}.gguf`)?.kind ?? "other" : "q4_0";
    const fromHub = t.full_size && t.full_size > 1e6 ? round1(t.full_size / 1024 ** 3) : null;
    const sizeGB = fromHub ?? (paramsB !== null ? gbFor(paramsB, kind) : null);
    const verdict = estimate(architecture, paramsB, MOE_NAME.test(`${name}-${t.name}`), kind, hw, sizeGB);
    if (kind !== "q4_0" && verdict.level === "green") verdict.level = "amber";
    out.push({ tag: t.name, ref: `docker.io/${namespace}/${name}:${t.name}`, quant: p.quant, paramsB, sizeGB, updated: t.last_updated ?? null, verdict });
  }
  const rank = { green: 0, amber: 1, red: 2 } as const;
  return out.sort((a, b) => rank[a.verdict.level] - rank[b.verdict.level] || (a.sizeGB ?? 99) - (b.sizeGB ?? 99));
}

const KEY = { downloads: "downloads", trending: "downloads", likes: "likes", recent: "updated" } as const;

/** Merges the rows of every source into one list: native bundles first (they are the point), then the rest by the chosen order. */
export function browse(sources: { hf?: RawHfModel[]; docker?: RawDockerRepo[]; native?: BrowseRow[] }, hw: HardwareProfile, q: Pick<BrowseQuery, "quants" | "levels" | "sort" | "query">, notes: string[] = []): BrowseResult {
  const rows: BrowseRow[] = [];
  let scanned = 0;
  const words = q.query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  for (const m of sources.hf ?? []) { scanned++; const r = toBrowseRow(m, hw, q.quants); if (r) rows.push(r); }
  for (const d of sources.docker ?? []) {
    scanned++;
    const r = toDockerRow(d, hw);
    if (r && matches(`${r.repo} ${r.description ?? ""}`)) rows.push(r);
  }
  for (const n of sources.native ?? []) { scanned++; if (matches(n.repo)) rows.push(n); }
  const shown = rows.filter((r) => q.levels.includes(r.verdict.level));
  const key = KEY[q.sort];
  const value = (r: BrowseRow) => (key === "updated" ? Date.parse(r.updated ?? "") || 0 : r[key]);
  shown.sort((a, b) => Number(b.source === "aihub") - Number(a.source === "aihub") || value(b) - value(a));
  return { rows: shown, scanned, hidden: scanned - shown.length, notes };
}
