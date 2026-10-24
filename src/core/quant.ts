export type QuantKind = "q4_0" | "q8_0" | "mxfp4" | "kquant" | "iquant" | "other";

export interface HfFile {
  path: string;
  sizeBytes: number;
}

export interface GgufChoice {
  path: string;
  /** All shards when the model is split (name-00001-of-0000N.gguf). */
  parts: string[];
  quant: string;
  kind: QuantKind;
  sizeBytes: number;
  note: string | null;
}

export function quantFromName(name: string): { quant: string; kind: QuantKind } | null {
  const base = name.replace(/\.gguf$/i, "");
  const m = /(?:^|[-_.])((?:IQ\d[A-Z0-9_]*)|(?:Q\d_K(?:_[SML])?)|(?:Q\d_[01])|(?:MXFP4(?:_MOE)?)|(?:BF16)|(?:F16)|(?:F32))(?:$|[-_.])/i.exec(base);
  if (!m) return null;
  const q = m[1].toUpperCase();
  let kind: QuantKind = "other";
  if (q === "Q4_0") kind = "q4_0";
  else if (q === "Q8_0") kind = "q8_0";
  else if (q.startsWith("MXFP4")) kind = "mxfp4";
  else if (/^Q\d_K/.test(q)) kind = "kquant";
  else if (q.startsWith("IQ")) kind = "iquant";
  return { quant: q, kind };
}

const SHARD = /-(\d{5})-of-(\d{5})\.gguf$/i;

/** Group split files into one logical model per quant. Skips multimodal projectors. */
export function groupModels(files: HfFile[]): GgufChoice[] {
  const groups = new Map<string, GgufChoice>();
  for (const f of files) {
    if (!/\.gguf$/i.test(f.path)) continue;
    const leaf = f.path.split("/").pop()!;
    if (/mmproj/i.test(leaf)) continue;
    const q = quantFromName(leaf);
    if (!q) continue;
    const key = leaf.replace(SHARD, ".gguf") + "|" + f.path.split("/").slice(0, -1).join("/");
    const g = groups.get(key);
    if (g) {
      g.parts.push(f.path);
      g.sizeBytes += f.sizeBytes;
      if (SHARD.test(leaf) && /-00001-of-/.test(leaf)) g.path = f.path;
    } else {
      groups.set(key, { path: f.path, parts: [f.path], quant: q.quant, kind: q.kind, sizeBytes: f.sizeBytes, note: null });
    }
  }
  return [...groups.values()].map((g) => ({ ...g, parts: g.parts.sort() }));
}

/**
 * Spec order: Q4_0, then Q8_0 for models under 4B, then MXFP4 for MoE; K-quants last,
 * labeled "may use the CPU". Returns null when the repo has no usable GGUF.
 */
export function pickQuant(choices: GgufChoice[], opts: { paramsB: number | null; isMoe: boolean }): GgufChoice | null {
  const by = (k: QuantKind) => choices.filter((c) => c.kind === k).sort((a, b) => a.sizeBytes - b.sizeBytes)[0];
  const small = opts.paramsB !== null && opts.paramsB < 4;
  const q4 = by("q4_0");
  if (q4) return q4;
  const q8 = by("q8_0");
  if (small && q8) return { ...q8, note: "No Q4_0 in this repo; Q8_0 is fine for a small model." };
  const mx = by("mxfp4");
  if (opts.isMoe && mx) return { ...mx, note: "No Q4_0 in this repo; MXFP4 is the MoE fallback (untested here)." };
  const k = by("kquant") ?? by("iquant");
  if (k) return { ...k, note: "Only K-quants or IQ quants: parts of the model may run on the CPU." };
  const any = by("q8_0") ?? by("mxfp4");
  if (any) return { ...any, note: "No Q4_0 in this repo; using the closest supported quant." };
  return null;
}

export function isHiddenByDefault(kind: QuantKind): boolean {
  return kind === "kquant" || kind === "iquant";
}
