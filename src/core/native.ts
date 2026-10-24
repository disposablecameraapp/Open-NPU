import type { BrowseRow, HardwareProfile } from "../shared/types";
import { guessArchitecture, paramsFromName } from "./browse";
import { scoreModel } from "./fit";

export interface NativeBundle { name: string; sizeGB?: number }

/**
 * `geniex model list`: the precompiled Qualcomm AI Hub bundles for this chip. The output format is not documented, so
 * only the identifiers (`ai-hub-models/<name>`) are read, with a size when the same line has one.
 */
export function parseModelList(out: string): NativeBundle[] {
  const seen = new Map<string, NativeBundle>();
  for (const line of out.split(/\r?\n/)) {
    const m = /ai-hub-models\/([\w.-]+)/i.exec(line);
    if (!m || seen.has(m[1].toLowerCase())) continue;
    const size = /(\d+(?:\.\d+)?)\s*(GB|MB)/i.exec(line);
    seen.set(m[1].toLowerCase(), { name: m[1], sizeGB: size ? (size[2].toUpperCase() === "GB" ? parseFloat(size[1]) : parseFloat(size[1]) / 1024) : undefined });
  }
  return [...seen.values()];
}

/** A native bundle as a browse row: NPU only, size from the name (about 1 GB per billion parameters in the ones measured). */
export function nativeRow(b: NativeBundle, hw: HardwareProfile): BrowseRow {
  const paramsB = paramsFromName(b.name);
  const architecture = guessArchitecture(b.name);
  const estGB = b.sizeGB ?? (paramsB !== null ? Math.round(paramsB * 10) / 10 : null);
  const verdict = scoreModel({ architecture, fileGB: estGB ?? 2, kind: "native", paramsB, wantedContext: 4096, engine: "qairt" }, hw);
  return {
    source: "aihub", repo: `ai-hub-models/${b.name}`, ref: `ai-hub-models/${b.name}`, url: `https://aihub.qualcomm.com/models`,
    engine: "qairt", downloads: 0, likes: 0, updated: null, description: "Precompiled for the Hexagon NPU: runs on the NPU only.",
    paramsB, architecture, isMoe: false, pipeline: null, tags: [], quants: [], quant: null, hasQ4_0: false, estGB, needsVersion: false, verdict
  };
}
