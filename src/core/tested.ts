import type { CatalogEntry } from "../shared/types";
import { normalizeName, prettyAlias } from "./foundry";

/**
 * The models the app's own benchmark ran, written in the app: they are listed (with their measured speed, quality and where they ran, which
 * `scores.json` holds) whatever the PC has installed, so a model that was tested is always there to install, also when it does not run
 * fully on the NPU. The ones that run partly or wholly elsewhere are shown apart, never recommended.
 */

const SAMPLING = { temperature: 0.7, top_p: 0.8, top_k: 20, max_tokens: 4096 };

/** GGUF files (Q4_0) of tested models that are in no other list; the repo and the file were checked on Hugging Face. */
const GENIEX: { name: string; repo: string; alt?: string; sizeGB: number; paramsB: number; arch: string; role: string }[] = [
  { name: "Qwen2.5-0.5B-Instruct", repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF", alt: "bartowski/Qwen2.5-0.5B-Instruct-GGUF", sizeGB: 0.43, paramsB: 0.5, arch: "qwen2", role: "Smallest Qwen2.5: instant replies" },
  { name: "Qwen2.5-1.5B-Instruct", repo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF", sizeGB: 1.07, paramsB: 1.5, arch: "qwen2", role: "Small general model" },
  { name: "Qwen2.5-Coder-0.5B-Instruct", repo: "Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF", sizeGB: 0.43, paramsB: 0.5, arch: "qwen2", role: "Smallest code model" },
  { name: "Qwen2.5-Coder-3B-Instruct", repo: "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF", sizeGB: 2.0, paramsB: 3.1, arch: "qwen2", role: "Small code model" }
];

export const testedGeniexEntries = (): CatalogEntry[] => GENIEX.map((m) => ({
  id: `tested:${normalizeName(m.name)}`, name: m.name, repo: m.repo, quant: "Q4_0", engine: "llama_cpp", role: m.role, architecture: m.arch,
  sizeGB: m.sizeGB, paramsB: m.paramsB, recommendedContext: 4096, sampling: SAMPLING
} as CatalogEntry));

/** Foundry Local models that were tested, by alias: the size is what its catalog says (about, for the ones its list did not give) and the device its build is made for. */
const FOUNDRY: { alias: string; sizeGB: number; device: "NPU" | "GPU" }[] = [
  { alias: "phi-4-mini", sizeGB: 2.4, device: "NPU" }, { alias: "qwen3.5-2b", sizeGB: 1.3, device: "NPU" }, { alias: "qwen3.5-0.8b", sizeGB: 0.6, device: "GPU" },
  { alias: "qwen3-1.7b", sizeGB: 1.1, device: "GPU" }, { alias: "qwen2.5-3b", sizeGB: 2.0, device: "NPU" }, { alias: "qwen2.5-coder-3b", sizeGB: 2.0, device: "NPU" },
  { alias: "smollm3-3b", sizeGB: 1.9, device: "NPU" }, { alias: "qwen2.5-1.5b", sizeGB: 1.1, device: "NPU" }, { alias: "qwen2.5-0.5b", sizeGB: 0.5, device: "NPU" },
  { alias: "qwen2.5-coder-0.5b", sizeGB: 0.5, device: "NPU" }
];

export const testedFoundryEntries = (): CatalogEntry[] => FOUNDRY.map((m) => {
  const params = m.alias.match(/(\d+(?:\.\d+)?)b\b/i);
  return {
    id: `foundry:${m.alias}`, name: `${prettyAlias(m.alias)} (Foundry Local)`, repo: m.alias, quant: null, engine: "llama_cpp",
    role: `Run by Microsoft Foundry Local, on its ${m.device} build`, architecture: "foundry", sizeGB: m.sizeGB, sizeApprox: true,
    paramsB: params ? parseFloat(params[1]) : undefined, recommendedContext: 4096, sampling: { temperature: 0.6, top_p: 0.95, max_tokens: 2048 }, foundryDevice: m.device
  } as CatalogEntry;
});
