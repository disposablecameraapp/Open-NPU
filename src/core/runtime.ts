import * as fs from "fs";
import * as path from "path";
import { CatalogEntry, ComputeTarget, HardwareProfile, RuntimeSettings } from "../shared/types";

/**
 * The llama.cpp engine: Open NPU's way to run a model on the GPU or the CPU of any PC (Windows, macOS, Linux; x64 or ARM),
 * next to GenieX, which only exists for the NPU of a Snapdragon X. It starts `llama-server`, which speaks the same
 * OpenAI protocol, with the options the person chose (threads, layers on the GPU, memory mapping...).
 */

export const LLAMA_PORT_OFFSET = 1; // GenieX listens on 18181; llama-server on 18183 (18182 is the router)
export const LLAMA_HOST = "127.0.0.1:18183";

export const DEFAULT_RUNTIME: Required<Pick<RuntimeSettings, "mmap" | "mlock" | "kvInRam" | "flashAttn">> = { mmap: true, mlock: false, kvInRam: false, flashAttn: "auto" };

/** Splits a command line the way a shell would for plain cases: spaces separate, quotes group. */
export function splitArgs(text: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (let m; (m = re.exec(text)); ) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const int = (n: unknown): number | null => (typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : null);

/**
 * The command line of `llama-server` for a model file. The options are only added when the person set them, so a plain
 * setup is `-m file -c ctx --host --port` and llama.cpp decides the rest; `target` picks the GPU (all layers) or the CPU (none).
 */
export function llamaArgs(o: { model: string; host: string; ctx: number; target: ComputeTarget; rt?: RuntimeSettings; alias?: string }): string[] {
  const rt = o.rt ?? {};
  const [host, port] = o.host.split(":");
  const args = ["-m", o.model, "--host", host, "--port", port, "-c", String(Math.max(512, int(rt.ctx) || o.ctx))];
  if (o.alias) args.push("--alias", o.alias);
  const threads = int(rt.threads);
  if (threads && threads > 0) args.push("-t", String(threads));
  const tb = int(rt.threadsBatch);
  if (tb && tb > 0) args.push("-tb", String(tb));
  // CPU means no layer on a graphics card; GPU means as many as the person allows (all by default)
  const ngl = o.target === "cpu" ? 0 : int(rt.gpuLayers) ?? -1;
  args.push("-ngl", ngl < 0 ? "999" : String(ngl));
  const b = int(rt.batch);
  if (b && b > 0) args.push("-b", String(b));
  const ub = int(rt.ubatch);
  if (ub && ub > 0) args.push("-ub", String(ub));
  if (rt.flashAttn === "on") args.push("-fa", "on");
  else if (rt.flashAttn === "off") args.push("-fa", "off");
  if (rt.mmap === false) args.push("--no-mmap");
  if (rt.mlock) args.push("--mlock");
  if (rt.kvInRam && o.target !== "cpu") args.push("--no-kv-offload");
  if (rt.kvType && rt.kvType !== "f16") args.push("-ctk", rt.kvType, "-ctv", rt.kvType);
  if (rt.numa) args.push("--numa", rt.numa);
  if (rt.extraArgs?.trim()) args.push(...splitArgs(rt.extraArgs));
  return args;
}

/** Checks the options before they are used, in plain words; an empty list = fine. */
export function runtimeProblems(rt: RuntimeSettings, hw?: Pick<HardwareProfile, "cpuThreads" | "ramGB">): string[] {
  const out: string[] = [];
  const t = int(rt.threads);
  if (t !== null && t < 0) out.push("Threads cannot be negative.");
  if (t && hw?.cpuThreads && t > hw.cpuThreads * 2) out.push(`${t} threads is more than twice the ${hw.cpuThreads} this processor has: it would only slow it down.`);
  const g = int(rt.gpuLayers);
  if (g !== null && g < -1) out.push("GPU layers is -1 (all), 0 (none) or a count.");
  const c = int(rt.ctx);
  if (c !== null && c !== 0 && c < 512) out.push("A context window under 512 tokens is too small to chat.");
  if (rt.mlock && rt.mmap === false && hw?.ramGB) out.push("Locking the model in RAM without memory mapping needs the whole model to fit in RAM.");
  return out;
}

/** What each choice does to memory, for the sentence under the selector. */
export function backendNote(target: ComputeTarget, rt: RuntimeSettings = {}): string {
  if (target === "npu" || target === "hybrid") return "Runs on the NPU of a Snapdragon X with GenieX. Fastest and lightest on the battery.";
  const layers = int(rt.gpuLayers);
  if (target === "gpu") {
    if (layers === 0) return "Graphics card selected, but 0 layers are placed on it: everything runs on the processor.";
    if (layers !== null && layers > 0) return `${layers} layers on the graphics card; the rest stays in RAM and runs on the processor, so a model larger than the video memory still loads (slower).`;
    return "All layers on the graphics card. If the model is bigger than its video memory, lower “Layers on the GPU” so the rest stays in RAM.";
  }
  return rt.mmap === false ? "Runs on the processor, loaded fully into RAM." : "Runs on the processor. The model file is mapped from disk, so a model bigger than the free RAM still starts (slower while it is paged in).";
}

/** How many of a model's layers fit in `vramGB` of video memory (the cache and the working buffers take `reserveGB`). */
export function suggestGpuLayers(modelGB: number, layers: number, vramGB: number, reserveGB = 1.2): number {
  if (!(modelGB > 0) || !(layers > 0) || !(vramGB > 0)) return -1;
  const perLayer = modelGB / layers;
  const fit = Math.floor((vramGB - reserveGB) / perLayer);
  if (fit >= layers) return -1;
  return Math.max(0, fit);
}

// ---- finding and installing llama-server

export const exeName = (platform = process.platform) => (platform === "win32" ? "llama-server.exe" : "llama-server");

/** An explicit path, the app's own copy, then the PATH. */
export function findLlamaServer(opts: { override?: string | null; appDir: string; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; exists?: (p: string) => boolean; listDir?: (p: string) => string[] }): string | null {
  const exists = opts.exists ?? fs.existsSync;
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const name = exeName(platform);
  const cands: string[] = [];
  if (opts.override) cands.push(opts.override);
  if (env.LLAMA_SERVER_PATH) cands.push(env.LLAMA_SERVER_PATH);
  // the release archive unpacks into a folder of its own: look one level down
  cands.push(path.join(opts.appDir, name));
  try { for (const d of (opts.listDir ?? ((p) => fs.readdirSync(p)))(opts.appDir)) cands.push(path.join(opts.appDir, d, name)); } catch { /* none installed */ }
  const sep = platform === "win32" ? ";" : ":";
  for (const dir of (env.PATH ?? env.Path ?? "").split(sep).filter(Boolean)) cands.push(path.join(dir, name));
  return cands.find((c) => exists(c)) ?? null;
}

export type GpuApi = "cuda" | "vulkan" | "metal" | "none";

/** The graphics API to ask the llama.cpp build for, from the cards found. NVIDIA has CUDA; everything else Vulkan; a Mac has Metal inside every build. */
export function pickGpuApi(hw: Pick<HardwareProfile, "gpus">, platform = process.platform, arch = process.arch): GpuApi {
  if (platform === "darwin") return arch === "arm64" ? "metal" : "none";
  const names = (hw.gpus ?? []).map((g) => g.name.toLowerCase());
  if (!names.length) return "none";
  if (platform === "win32" && arch === "x64" && names.some((n) => /nvidia|geforce|rtx|quadro/.test(n))) return "cuda";
  return "vulkan";
}

interface Asset { name: string; url: string; size?: number }

/**
 * Chooses the release archive of llama.cpp for this system and target from the names of a release's files
 * (`llama-b1234-bin-win-cuda-12.4-x64.zip`, `...-win-vulkan-x64.zip`, `...-macos-arm64.zip`, `...-ubuntu-x64.zip`...).
 * Returns the main archive and, for CUDA, the runtime DLLs archive that goes next to it.
 */
export function pickLlamaAsset(assets: Asset[], o: { platform: NodeJS.Platform; arch: string; target: ComputeTarget; api: GpuApi }): { main: Asset; extra?: Asset } | null {
  const arch = o.arch === "arm64" ? "arm64" : "x64";
  const zips = assets.filter((a) => /\.(zip|tar\.gz)$/i.test(a.name) && /^llama-b\d+-bin-/.test(a.name));
  const os = o.platform === "win32" ? "win" : o.platform === "darwin" ? "macos" : "ubuntu";
  const mine = zips.filter((a) => new RegExp(`-bin-${os}-.*${arch}\\.(zip|tar\\.gz)$`, "i").test(a.name) && !/cudart/.test(a.name));
  const flavour = (a: Asset) => (/cuda/i.test(a.name) ? "cuda" : /vulkan/i.test(a.name) ? "vulkan" : /hip|rocm|sycl|opencl|kompute|openvino|aclnn/i.test(a.name) ? "other" : "cpu");
  const want = o.target === "cpu" ? "cpu" : o.api === "cuda" ? "cuda" : o.api === "vulkan" ? "vulkan" : "cpu";
  const newest = (xs: Asset[]) => [...xs].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))[0];
  let list = mine.filter((a) => flavour(a) === want);
  if (want === "cuda") list = list.filter((a) => /cuda-12/.test(a.name)).length ? list.filter((a) => /cuda-12/.test(a.name)) : list; // 12.x runs on the drivers of the last years
  let main = newest(list);
  if (!main && want !== "cpu") main = newest(mine.filter((a) => flavour(a) === "vulkan")) ?? newest(mine.filter((a) => flavour(a) === "cpu"));
  if (!main) main = newest(mine.filter((a) => flavour(a) === "cpu"));
  if (!main) return null;
  let extra: Asset | undefined;
  if (flavour(main) === "cuda") {
    const ver = /cuda-(\d+\.\d+)/.exec(main.name)?.[1];
    extra = assets.find((a) => /^cudart-llama-bin-win-cuda/.test(a.name) && (!ver || a.name.includes(`cuda-${ver}`)) && a.name.includes(arch));
  }
  return { main, extra };
}

/** A load failure of llama-server, in words. */
export function llamaFailure(log: string): { title: string; fix: string } | null {
  if (/failed to allocate .*(buffer|memory)|out of memory|cudaMalloc failed|ErrorOutOfDeviceMemory|vk::.*OutOfDeviceMemory/i.test(log))
    return { title: "The model does not fit in the graphics card memory", fix: "Lower “Layers on the GPU” in Settings, Models (the rest then stays in RAM), shrink the context window, or choose the CPU." };
  if (/unable to load model|failed to load model|llama_model_load: error|invalid magic|unknown model architecture/i.test(log))
    return { title: "llama.cpp could not read this model", fix: "The file may be damaged or from a newer architecture than this llama.cpp knows. Reinstall llama.cpp from Settings, or download the model again." };
  if (/bad_alloc|cannot allocate memory|mmap failed|VirtualAlloc failed/i.test(log))
    return { title: "Not enough RAM for this model", fix: "Close other apps, pick a smaller model or a smaller quantization, lower the context window, or leave memory mapping on so the file stays on disk." };
  if (/address already in use|bind: |couldn't bind/i.test(log))
    return { title: "The llama.cpp port is already used", fix: "Another llama-server is running. Close it (or restart Open NPU) and try again." };
  return null;
}

// ---- model files

/** Where the app keeps the GGUF files it downloads for this engine: `<dir>/<org--repo>/<file>.gguf`. */
export const ggufFolder = (dir: string, repo: string) => path.join(dir, repo.replace(/\//g, "--"));

/** The file of a repo that holds this model: the one named for the quantization, else the only plain one. Never a projector or a split part but the first. */
export function pickGgufFile(files: { path: string; sizeBytes: number }[], quant: string | null): { path: string; sizeBytes: number }[] {
  const ggufs = files.filter((f) => /\.gguf$/i.test(f.path) && !/mmproj/i.test(f.path));
  const q = (quant ?? "").toLowerCase();
  const hit = q ? ggufs.filter((f) => path.basename(f.path).toLowerCase().includes(q)) : ggufs;
  const pool = hit.length ? hit : ggufs.length === 1 ? ggufs : [];
  // a model split in parts (-00001-of-00003.gguf) is downloaded whole; llama.cpp opens the first part and finds the others
  const parts = pool.filter((f) => /-\d{5}-of-\d{5}\.gguf$/i.test(f.path));
  if (parts.length) return pool.filter((f) => /-of-(\d{5})\.gguf$/i.test(f.path) && f.path.replace(/-\d{5}-of-\d{5}\.gguf$/i, "") === parts[0].path.replace(/-\d{5}-of-\d{5}\.gguf$/i, "")).sort((a, b) => a.path.localeCompare(b.path));
  return pool.slice(0, 1);
}

/** The file to give `-m`: the first part of a split model, else the file. */
export const entryFile = (files: string[]): string | null => files.find((f) => /-00001-of-\d{5}\.gguf$/i.test(f)) ?? files.find((f) => /\.gguf$/i.test(f)) ?? null;

/** A machine-readable summary for the selector: which targets this PC can offer and why not. */
export function backendChoices(hw: Pick<HardwareProfile, "npuDetected" | "isSnapdragon" | "gpus">, o: { geniex: boolean; platform: NodeJS.Platform; arch: string }): { id: "npu" | "gpu" | "cpu"; available: boolean; note: string }[] {
  const npuOk = o.platform === "win32" && o.arch === "arm64" && hw.isSnapdragon && hw.npuDetected;
  const gpus = hw.gpus ?? [];
  return [
    { id: "npu", available: npuOk, note: npuOk ? (o.geniex ? "Snapdragon NPU, through GenieX." : "Snapdragon NPU. GenieX will be installed on first use.") : "Needs a Windows PC with a Snapdragon X (ARM64) and its NPU driver." },
    { id: "gpu", available: gpus.length > 0 || o.platform === "darwin", note: gpus.length ? gpus.map((g) => g.name + (g.vramGB ? ` (${g.vramGB} GB)` : "")).join(", ") : o.platform === "darwin" ? "Apple GPU, through Metal." : "No graphics card found; the CPU option always works." },
    { id: "cpu", available: true, note: "Works on every PC." }
  ];
}

/** Which target a fresh install should start with: the NPU where there is one, else the graphics card, else the processor. */
export function defaultTarget(choices: ReturnType<typeof backendChoices>): ComputeTarget {
  return choices.find((c) => c.id === "npu" && c.available) ? "npu" : choices.find((c) => c.id === "gpu" && c.available) ? "gpu" : "cpu";
}

export const isLlamaEntry = (e: Pick<CatalogEntry, "engine" | "id">) => e.engine === "llama_cpp" && !e.id.startsWith("foundry:");
