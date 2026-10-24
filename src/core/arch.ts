export type ArchClass = "standard" | "fast-hybrid" | "partial-cpu" | "unloadable" | "unknown";

export interface ArchInfo {
  cls: ArchClass;
  /** Short explanation shown in the badge reason. */
  reason: string;
}

/** Standard transformers: full NPU on the test laptop. */
const STANDARD = new Set(["llama", "qwen2", "qwen3", "mistral", "mistral3", "granite", "gemma2", "gemma3", "phi3"]);
/** MoE variants of standard transformers: expected to work, not measured here. */
const STANDARD_MOE = new Set(["qwen3moe", "gpt-oss", "llama4"]);
/** LFM2 conv + GQA: full NPU, fastest. */
const LFM = new Set(["lfm2", "lfm2moe"]);
/** Gated DeltaNet and other SSM hybrids: NPU in bursts, CPU 68-91%. */
const HYBRID_CPU = new Set(["qwen35", "qwen3next", "qwen35moe", "granitehybrid", "mamba", "mamba2", "jamba", "falcon-h1"]);

export function classifyArchitecture(arch: string): ArchInfo {
  const a = arch.toLowerCase();
  if (STANDARD.has(a)) return { cls: "standard", reason: "standard transformer: runs fully on the NPU" };
  if (LFM.has(a)) return { cls: "fast-hybrid", reason: "LFM2 conv+attention: runs fully on the NPU, fastest" };
  if (STANDARD_MOE.has(a)) return { cls: "standard", reason: "MoE transformer: expected on the NPU, not measured here" };
  if (HYBRID_CPU.has(a)) return { cls: "partial-cpu", reason: "hybrid layers: NPU in bursts, heavy CPU use" };
  return { cls: "unknown", reason: `unknown architecture "${arch}": may not load` };
}
