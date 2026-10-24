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
/**
 * Other llama.cpp transformer families built from the same operations (RMSNorm, RoPE attention, SwiGLU / GELU MLP,
 * optionally routed experts). The Hexagon backend runs those operations whatever the model is called, so they are
 * expected to work; none has been measured here.
 */
const LIKELY = new Set([
  "gemma", "gemma2", "gemma3", "phi2", "phi3", "phimoe", "olmo", "olmo2", "olmoe", "internlm2", "starcoder2", "stablelm", "smollm3",
  "exaone", "exaone4", "glm4", "glm4moe", "minicpm", "command-r", "cohere2", "arcee", "dots1", "seed_oss", "apertus", "hunyuan-dense",
  "hunyuan-moe", "ernie4_5", "ernie4_5-moe", "granitemoe", "qwen2moe", "qwen2vl", "baichuan", "orion", "nemotron", "openelm", "llada"
]);
/** Gated DeltaNet and other SSM hybrids: NPU in bursts, CPU 68-91%. */
const HYBRID_CPU = new Set([
  "qwen35", "qwen3next", "qwen35moe", "granitehybrid", "mamba", "mamba2", "jamba", "falcon-h1", "nemotron_h", "nemotron_h_moe", "bamba",
  "plamo2", "rwkv6", "rwkv7", "arwkv7", "gemma3n", "deepseek2", "deepseek"
]);

export function classifyArchitecture(arch: string): ArchInfo {
  const a = arch.toLowerCase();
  if (STANDARD.has(a)) return { cls: "standard", reason: "standard transformer: runs fully on the NPU" };
  if (LFM.has(a)) return { cls: "fast-hybrid", reason: "LFM2 conv+attention: runs fully on the NPU, fastest" };
  if (LIKELY.has(a)) return { cls: "standard", reason: "standard transformer family: expected on the NPU, not measured here" };
  if (STANDARD_MOE.has(a)) return { cls: "standard", reason: "MoE transformer: expected on the NPU, not measured here" };
  if (HYBRID_CPU.has(a)) return { cls: "partial-cpu", reason: "hybrid or unusual layers: NPU in bursts, heavy CPU use" };
  return { cls: "unknown", reason: `unknown architecture "${arch}": may not load` };
}
