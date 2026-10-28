import { describe, expect, it } from "vitest";
import { backendChoices, defaultTarget, findLlamaServer, llamaArgs, llamaFailure, pickGgufFile, pickGpuApi, pickLlamaAsset, runtimeProblems, splitArgs, suggestGpuLayers, entryFile, backendNote } from "../src/core/runtime";
import { hardwareProblems, buildProfile } from "../src/core/hardware";
import { scoreModel } from "../src/core/fit";
import { initialSteps } from "../src/core/setup";

const args = (o: Partial<Parameters<typeof llamaArgs>[0]> = {}) => llamaArgs({ model: "m.gguf", host: "127.0.0.1:18183", ctx: 8192, target: "gpu", ...o });

describe("llama-server command line", () => {
  it("is plain by default: all layers on the GPU, nothing else", () => {
    expect(args()).toEqual(["-m", "m.gguf", "--host", "127.0.0.1", "--port", "18183", "-c", "8192", "-ngl", "999"]);
  });
  it("puts no layer on a graphics card on the CPU", () => {
    expect(args({ target: "cpu", rt: { gpuLayers: 20, kvInRam: true } })).toContain("0");
    expect(args({ target: "cpu", rt: { gpuLayers: 20, kvInRam: true } })).not.toContain("--no-kv-offload");
  });
  it("passes the options the person set", () => {
    const a = args({ rt: { threads: 6, threadsBatch: 12, gpuLayers: 20, ctx: 4096, batch: 1024, ubatch: 256, flashAttn: "on", mmap: false, mlock: true, kvInRam: true, kvType: "q8_0", numa: "distribute", extraArgs: '--main-gpu 1 --chat-template "my tpl"' } });
    expect(a.join(" ")).toContain("-t 6 -tb 12 -ngl 20");
    expect(a).toEqual(expect.arrayContaining(["-b", "1024", "-ub", "256", "-fa", "on", "--no-mmap", "--mlock", "--no-kv-offload", "-ctk", "q8_0", "-ctv", "q8_0", "--numa", "distribute", "--main-gpu", "1", "my tpl"]));
    expect(a[a.indexOf("-c") + 1]).toBe("4096");
  });
  it("splits a typed command line with quotes", () => { expect(splitArgs(`-a 1 "b c" 'd e'`)).toEqual(["-a", "1", "b c", "d e"]); });
  it("never asks for a window under 512", () => { expect(args({ ctx: 100 })[7]).toBe("512"); });
});

describe("options are checked", () => {
  it("warns on nonsense and stays quiet on defaults", () => {
    expect(runtimeProblems({})).toEqual([]);
    expect(runtimeProblems({ threads: 64 }, { cpuThreads: 8, ramGB: 16 })).toHaveLength(1);
    expect(runtimeProblems({ gpuLayers: -5 })).toHaveLength(1);
    expect(runtimeProblems({ ctx: 100 })).toHaveLength(1);
  });
  it("suggests how many layers fit a card", () => {
    expect(suggestGpuLayers(8, 32, 24)).toBe(-1); // all fit
    expect(suggestGpuLayers(8, 32, 4)).toBe(11); // (4-1.2)/0.25
    expect(suggestGpuLayers(8, 32, 1)).toBe(0);
    expect(suggestGpuLayers(0, 32, 4)).toBe(-1);
  });
  it("describes spill to RAM", () => {
    expect(backendNote("gpu", { gpuLayers: 12 })).toMatch(/12 layers.*RAM/);
    expect(backendNote("cpu")).toMatch(/mapped from disk/);
  });
});

describe("finding llama-server", () => {
  it("prefers an explicit path, then the app's own copy (also one folder down), then PATH", () => {
    const has = (set: string[]) => (p: string) => set.includes(p);
    expect(findLlamaServer({ override: "/x/ls", appDir: "/app", env: {}, platform: "linux", exists: has(["/x/ls", "/app/llama-server"]) })).toBe("/x/ls");
    expect(findLlamaServer({ appDir: "/app", env: {}, platform: "linux", exists: has(["/app/build/llama-server"]), listDir: () => ["build"] })).toBe("/app/build/llama-server");
    expect(findLlamaServer({ appDir: "/app", env: { PATH: "/a:/usr/bin" }, platform: "linux", exists: has(["/usr/bin/llama-server"]), listDir: () => [] })).toBe("/usr/bin/llama-server");
    expect(findLlamaServer({ appDir: "C:\\app", env: {}, platform: "win32", exists: () => false, listDir: () => [] })).toBeNull();
  });
});

const rel = (names: string[]) => names.map((name) => ({ name, url: `https://x/${name}` }));
const assets = rel([
  "llama-b7000-bin-win-cpu-x64.zip", "llama-b7000-bin-win-cpu-arm64.zip", "llama-b7000-bin-win-vulkan-x64.zip", "llama-b7000-bin-win-cuda-12.4-x64.zip", "llama-b7000-bin-win-cuda-13.1-x64.zip",
  "cudart-llama-bin-win-cuda-12.4-x64.zip", "llama-b7000-bin-macos-arm64.tar.gz", "llama-b7000-bin-macos-x64.tar.gz", "llama-b7000-bin-ubuntu-x64.tar.gz", "llama-b7000-bin-ubuntu-vulkan-x64.tar.gz", "llama-b7000-bin-win-hip-radeon-x64.zip"
]);
describe("choosing the llama.cpp download", () => {
  const pick = (platform: NodeJS.Platform, arch: string, target: "cpu" | "gpu", api: "cuda" | "vulkan" | "metal" | "none") => pickLlamaAsset(assets, { platform, arch, target, api });
  it("takes the CPU build for the CPU, whatever the card", () => { expect(pick("win32", "x64", "cpu", "cuda")?.main.name).toBe("llama-b7000-bin-win-cpu-x64.zip"); });
  it("takes CUDA with its runtime DLLs for an NVIDIA card", () => {
    const r = pick("win32", "x64", "gpu", "cuda");
    expect(r?.main.name).toBe("llama-b7000-bin-win-cuda-12.4-x64.zip");
    expect(r?.extra?.name).toBe("cudart-llama-bin-win-cuda-12.4-x64.zip");
  });
  it("takes Vulkan for any other card", () => { expect(pick("win32", "x64", "gpu", "vulkan")?.main.name).toBe("llama-b7000-bin-win-vulkan-x64.zip"); });
  it("falls back to the CPU build when there is no GPU build (Windows on ARM)", () => { expect(pick("win32", "arm64", "gpu", "vulkan")?.main.name).toBe("llama-b7000-bin-win-cpu-arm64.zip"); });
  it("handles Mac and Linux", () => {
    expect(pick("darwin", "arm64", "gpu", "metal")?.main.name).toBe("llama-b7000-bin-macos-arm64.tar.gz");
    expect(pick("linux", "x64", "gpu", "vulkan")?.main.name).toBe("llama-b7000-bin-ubuntu-vulkan-x64.tar.gz");
    expect(pick("linux", "x64", "cpu", "none")?.main.name).toBe("llama-b7000-bin-ubuntu-x64.tar.gz");
  });
  it("picks the graphics API from the cards", () => {
    expect(pickGpuApi({ gpus: [{ name: "NVIDIA GeForce RTX 4070" }] }, "win32", "x64")).toBe("cuda");
    expect(pickGpuApi({ gpus: [{ name: "AMD Radeon RX 7800" }] }, "win32", "x64")).toBe("vulkan");
    expect(pickGpuApi({ gpus: [] }, "linux", "x64")).toBe("none");
    expect(pickGpuApi({ gpus: [] }, "darwin", "arm64")).toBe("metal");
  });
});

describe("model files", () => {
  const files = [{ path: "m-Q4_K_M.gguf", sizeBytes: 4 }, { path: "m-Q8_0.gguf", sizeBytes: 8 }, { path: "mmproj-m.gguf", sizeBytes: 1 }, { path: "README.md", sizeBytes: 1 }];
  it("picks the quantization asked, never a projector", () => {
    expect(pickGgufFile(files, "Q8_0").map((f) => f.path)).toEqual(["m-Q8_0.gguf"]);
    expect(pickGgufFile(files, "q4_k_m").map((f) => f.path)).toEqual(["m-Q4_K_M.gguf"]);
    expect(pickGgufFile(files, "Q2_K")).toEqual([]);
  });
  it("takes every part of a split model and opens the first", () => {
    const parts = ["m-Q4_0-00001-of-00002.gguf", "m-Q4_0-00002-of-00002.gguf", "other-Q4_0.gguf"].map((path) => ({ path, sizeBytes: 1 }));
    const got = pickGgufFile(parts, "Q4_0").map((f) => f.path);
    expect(got).toEqual(["m-Q4_0-00001-of-00002.gguf", "m-Q4_0-00002-of-00002.gguf"]);
    expect(entryFile(got.reverse())).toBe("m-Q4_0-00001-of-00002.gguf");
  });
  it("takes the one file of a repo that has one", () => { expect(pickGgufFile([{ path: "only.gguf", sizeBytes: 1 }], null)).toHaveLength(1); });
});

describe("what a PC offers", () => {
  const nonSnap = buildProfile({ cpuName: "Intel Core i7-13700", totalRamBytes: 32 * 1024 ** 3, npuDevices: [], osArch: "AMD64", gpus: [{ name: "NVIDIA GeForce RTX 4070", vramGB: 12 }] }, "x64");
  const snap = buildProfile({ cpuName: "Snapdragon X Elite", totalRamBytes: 16 * 1024 ** 3, npuDevices: [{ name: "Hexagon NPU" }], osArch: "ARM64" }, "arm64");
  it("starts a PC with no NPU on its graphics card, a Snapdragon on the NPU, a bare PC on the CPU", () => {
    expect(defaultTarget(backendChoices(nonSnap, { geniex: false, platform: "win32", arch: "x64" }))).toBe("gpu");
    expect(defaultTarget(backendChoices(snap, { geniex: true, platform: "win32", arch: "arm64" }))).toBe("npu");
    expect(defaultTarget(backendChoices({ ...nonSnap, gpus: [] }, { geniex: false, platform: "linux", arch: "x64" }))).toBe("cpu");
  });
  it("does not warn about the NPU when the model runs elsewhere", () => {
    expect(hardwareProblems(nonSnap).length).toBeGreaterThan(0);
    expect(hardwareProblems(nonSnap, "gpu")).toEqual([]);
    expect(hardwareProblems(nonSnap, "cpu")).toEqual([]);
  });
  it("does not call a model red for lacking an NPU when it runs off the NPU", () => {
    const input = { architecture: "llama", fileGB: 2.5, kind: "q4_0", engine: "llama_cpp", wantedContext: 8192, paramsB: 4 } as any;
    expect(scoreModel(input, nonSnap).level).toBe("red");
    expect(scoreModel(input, { ...nonSnap, offNpu: true }).level).not.toBe("red");
  });
  it("only offers GenieX where it exists", () => {
    const steps = initialSteps({ geniex: false, llama: true, stt: false, tts: false }, { stt: "s", tts: "t" });
    expect(steps.find((s) => s.id === "llama")?.state).toBe("pending");
    expect(steps.find((s) => s.id === "geniex")?.state).toBe("done");
  });
});

describe("load failures in words", () => {
  it("names the out-of-memory causes", () => {
    expect(llamaFailure("ggml_vulkan: Device memory allocation failed. vk::Device::allocateMemory: ErrorOutOfDeviceMemory")?.title).toMatch(/graphics card/);
    expect(llamaFailure("llama_model_load: error loading model: unknown model architecture: 'foo'")?.title).toMatch(/could not read/);
    expect(llamaFailure("std::bad_alloc")?.title).toMatch(/RAM/);
    expect(llamaFailure("everything fine")).toBeNull();
  });
});

import { ServerManager } from "../src/core/server";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

describe("ServerManager with another server", () => {
  it("starts it with its own arguments and waits on its health URL", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-llama-"));
    const script = path.join(dir, "srv.js");
    fs.writeFileSync(script, `const [,, ...a]=process.argv;const port=a[a.indexOf("--port")+1];setTimeout(()=>require("http").createServer((q,r)=>{r.statusCode=q.url==="/health"?200:404;r.end(a.join(" "));}).listen(+port,"127.0.0.1"),150);`);
    const seen: string[][] = [];
    const m = new ServerManager({
      exe: process.execPath, host: "127.0.0.1:18993", readyUrl: "http://127.0.0.1:18993/health", pollMs: 50, readyTimeoutMs: 8000,
      argsFn: (host, nctx) => { const a = [script, ...llamaArgs({ model: "x.gguf", host, ctx: nctx ?? 4096, target: "cpu" })]; seen.push(a); return a; }
    });
    try {
      await m.start(4096);
      expect(m.status().state).toBe("ready");
      expect(seen[0]).toContain("-ngl");
      expect(seen[0][seen[0].indexOf("-ngl") + 1]).toBe("0");
    } finally { await m.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
