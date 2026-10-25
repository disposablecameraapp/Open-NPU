import { describe, expect, it } from "vitest";
import { fitContext, kvBytesPerToken, maxContextTokens, estimateTokPerSec, npuNeededGB } from "../src/core/memory";
import { parseGgufMetadata, summarize, NeedMoreData, readGgufHeader } from "../src/core/gguf";
import { groupModels, pickQuant, quantFromName } from "../src/core/quant";
import { buildProfile, chipFamily, hardwareProblems, parseRawHardware } from "../src/core/hardware";
import { scoreModel, scoreEntry } from "../src/core/fit";
import { CATALOG, viewCatalog } from "../src/core/catalog";
import { samplingFor, requestSampling } from "../src/core/sampling";
import { friendly, translateError } from "../src/core/errors";
import { classifyArchitecture } from "../src/core/arch";
import { parseRepoInput } from "../src/core/hf";
import { buildGguf } from "./gguf-builder";

const hw16 = buildProfile(
  { cpuName: "Snapdragon(R) X Plus - X1P64100 - Qualcomm(R) Oryon(TM) CPU", totalRamBytes: 16 * 1024 ** 3, npuDevices: [{ name: "Snapdragon(R) X Plus - X1P64100 - Qualcomm(R) Hexagon(TM) NPU", driverVersion: "30.0.220.3000" }], npuSharedBytes: 7.8 * 1024 ** 3, osArch: "ARM64" },
  "arm64"
);

describe("memory math", () => {
  it("matches the KV sizes in the spec", () => {
    expect(kvBytesPerToken({ attentionLayers: 40, kvHeads: 8, headDim: 64 }) / 1024).toBeCloseTo(80, 0);
    expect(kvBytesPerToken({ attentionLayers: 36, kvHeads: 8, headDim: 128 }) / 1024).toBeCloseTo(144, 0);
    expect(kvBytesPerToken({ attentionLayers: 32, kvHeads: 4, headDim: 128 }) / 1024).toBeCloseTo(64, 0);
    expect(kvBytesPerToken({ attentionLayers: 40, kvHeads: 8, headDim: 128 }) / 1024).toBeCloseTo(160, 0);
  });
  it("lands in the measured context ranges on 7.8 GB", () => {
    const qwen = maxContextTokens(2.3, { attentionLayers: 36, kvHeads: 8, headDim: 128 }, 7.8);
    expect(qwen).toBeGreaterThanOrEqual(16 * 1024);
    expect(qwen).toBeLessThan(32 * 1024); // 64K crashed
    const granite8 = maxContextTokens(4.6, { attentionLayers: 40, kvHeads: 8, headDim: 128 }, 7.8);
    expect(granite8).toBeGreaterThanOrEqual(4096);
    expect(granite8).toBeLessThanOrEqual(16 * 1024);
  });
  it("shrinks a context wish and refuses when weights do not fit", () => {
    const kv = { attentionLayers: 36, kvHeads: 8, headDim: 128 };
    expect(fitContext({ fileGB: 2.3, kv, npuBudgetGB: 7.8, wanted: 65536 })).toBeLessThan(65536);
    expect(fitContext({ fileGB: 2.3, kv, npuBudgetGB: 7.8, wanted: 8192 })).toBe(8192);
    expect(fitContext({ fileGB: 7.5, kv, npuBudgetGB: 7.8, wanted: 8192 })).toBe(0);
    expect(fitContext({ fileGB: 2.3, kv, npuBudgetGB: 7.8, wanted: 65536, maxTested: 24576 })).toBe(24576);
  });
  it("estimates speed near measured runs", () => {
    expect(estimateTokPerSec(5.4, false)).toBeGreaterThan(7);
    expect(estimateTokPerSec(5.4, false)).toBeLessThan(9);
    expect(estimateTokPerSec(2.3, false)).toBeGreaterThan(13);
    expect(estimateTokPerSec(2.3, false)).toBeLessThan(15);
    expect(npuNeededGB(4.7, undefined, 4096)).toBeCloseTo(5.6, 1);
  });
});

describe("GGUF header", () => {
  const buf = buildGguf({ arch: "qwen3", blocks: 36, heads: 32, kvHeads: 8, embed: 2560, keyLength: 128, ctx: 262144, name: "Qwen3 4B" });
  it("parses metadata and computes KV shape", () => {
    const info = summarize(parseGgufMetadata(buf), 2.3);
    expect(info.architecture).toBe("qwen3");
    expect(info.attentionLayers).toBe(36);
    expect(info.kvHeads).toBe(8);
    expect(info.headDim).toBe(128);
    expect(info.contextLength).toBe(262144);
  });
  it("counts only attention layers for per-layer kv arrays (hybrid)", () => {
    const hybrid = buildGguf({ arch: "lfm2moe", blocks: 24, heads: 32, kvHeadsArray: [0, 0, 8, 0, 0, 8, 0, 0, 8, 0, 0, 8, 0, 0, 8, 0, 0, 8, 0, 0, 0, 0, 0, 0], embed: 2048, expertCount: 32 });
    const info = summarize(parseGgufMetadata(hybrid));
    expect(info.attentionLayers).toBe(6);
    expect(info.kvHeads).toBe(8);
    expect(info.expertCount).toBe(32);
  });
  it("asks for more data when truncated, and readGgufHeader retries", async () => {
    expect(() => parseGgufMetadata(buf.subarray(0, 100))).toThrow(NeedMoreData);
    const big = buildGguf({ arch: "llama", blocks: 8, heads: 8, kvHeads: 8, embed: 512, padTokens: 200000 });
    expect(big.length).toBeGreaterThan(512 * 1024);
    let calls = 0;
    const meta = await readGgufHeader(async (s, e) => { calls++; return big.subarray(s, e + 1); });
    expect(calls).toBeGreaterThan(1);
    expect(summarize(meta).architecture).toBe("llama");
  });
  it("rejects non-GGUF", () => {
    expect(() => parseGgufMetadata(Buffer.from("not a gguf file at all"))).toThrow(/not a GGUF/);
  });
});

describe("quant selection", () => {
  const f = (path: string, gb: number) => ({ path, sizeBytes: gb * 1024 ** 3 });
  it("names quants", () => {
    expect(quantFromName("Qwen3-4B-Thinking-2507-Q4_0.gguf")?.kind).toBe("q4_0");
    expect(quantFromName("model-Q4_K_M.gguf")?.kind).toBe("kquant");
    expect(quantFromName("gpt-oss-20b-MXFP4.gguf")?.kind).toBe("mxfp4");
    expect(quantFromName("x-IQ4_XS.gguf")?.kind).toBe("iquant");
  });
  it("prefers Q4_0, then Q8_0 for small, then MXFP4 for MoE, K-quants last with a warning", () => {
    const g = groupModels([f("a-Q4_K_M.gguf", 2.5), f("a-Q8_0.gguf", 4), f("a-Q4_0.gguf", 2.3), f("mmproj-F16.gguf", 1)]);
    expect(pickQuant(g, { paramsB: 4, isMoe: false })?.quant).toBe("Q4_0");
    const noQ4 = groupModels([f("a-Q4_K_M.gguf", 2.5), f("a-Q8_0.gguf", 1.8)]);
    expect(pickQuant(noQ4, { paramsB: 1.5, isMoe: false })?.quant).toBe("Q8_0");
    expect(pickQuant(noQ4, { paramsB: 8, isMoe: false })?.quant).toBe("Q4_K_M");
    expect(pickQuant(noQ4, { paramsB: 8, isMoe: false })?.note).toMatch(/CPU/);
    const moe = groupModels([f("m-MXFP4.gguf", 12), f("m-Q4_K_M.gguf", 14)]);
    expect(pickQuant(moe, { paramsB: 20, isMoe: true })?.quant).toBe("MXFP4");
    expect(pickQuant([], { paramsB: 1, isMoe: false })).toBeNull();
  });
  it("sums split shards", () => {
    const g = groupModels([f("m-Q4_0-00001-of-00002.gguf", 5), f("m-Q4_0-00002-of-00002.gguf", 4)]);
    expect(g).toHaveLength(1);
    expect(g[0].path).toMatch(/00001/);
    expect(g[0].sizeBytes).toBe(9 * 1024 ** 3);
  });
  it("does not count a quant twice when a repo holds it as one file and as shards", () => {
    const g = groupModels([f("q-q4_0-00001-of-00002.gguf", 4), f("q-q4_0-00002-of-00002.gguf", 0.5), f("q-q4_0.gguf", 4.5)]);
    expect(g).toHaveLength(1);
    expect(g[0].path).toBe("q-q4_0.gguf");
    expect(g[0].parts).toEqual(["q-q4_0.gguf"]);
    expect(g[0].sizeBytes).toBe(4.5 * 1024 ** 3);
  });
});

describe("hardware profile", () => {
  it("reads the 16 GB X1 test machine", () => {
    expect(hw16.chipFamily).toBe("x1");
    expect(hw16.ramGB).toBe(16);
    expect(hw16.npuBudgetGB).toBe(7.8);
    expect(hw16.npuBudgetSource).toBe("measured");
    expect(hw16.npuDriverVersion).toBe("30.0.220.3000");
    expect(hardwareProblems(hw16)).toEqual([]);
  });
  it("estimates about half of RAM when the limit is unknown, and says so", () => {
    const hw = buildProfile({ cpuName: "Snapdragon X Elite", totalRamBytes: 16 * 1024 ** 3, npuDevices: [{ name: "NPU" }], osArch: "ARM64" }, "arm64");
    expect(hw.npuBudgetGB).toBeCloseTo(7.8, 1);
    expect(hw.npuBudgetSource).toBe("estimated");
    expect(buildProfile({ cpuName: "Snapdragon X Elite", totalRamBytes: 32 * 1024 ** 3 }, "arm64", 15).npuBudgetSource).toBe("user");
  });
  it("flags an emulated x64 build on an ARM64 machine", () => {
    const hw = buildProfile({ cpuName: "Snapdragon X Plus", totalRamBytes: 16 * 1024 ** 3, npuDevices: [{ name: "NPU" }], osArch: "ARM64" }, "x64");
    expect(hw.emulated).toBe(true);
    expect(hardwareProblems(hw)[0]).toMatch(/ARM64/);
    expect(scoreModel({ architecture: "qwen3", fileGB: 2.3, kind: "q4_0", wantedContext: 8192, engine: "llama_cpp" }, hw).level).toBe("red");
  });
  it("parses the probe JSON, including a single-object device list", () => {
    const raw = parseRawHardware('noise {"cpuName":"X","totalRamBytes":17179869184,"npuDevices":{"name":"NPU","driverVersion":"1.2"},"osArch":"ARM64"}');
    expect(raw.npuDevices).toHaveLength(1);
    expect(chipFamily("Snapdragon(R) X2 Elite")).toBe("x2");
    expect(chipFamily("Intel Core Ultra 7")).toBe("unknown");
  });
});

describe("fit verdicts", () => {
  const base = { architecture: "qwen3", fileGB: 2.3, kind: "q4_0" as const, wantedContext: 16384, engine: "llama_cpp" as const, kv: { attentionLayers: 36, kvHeads: 8, headDim: 128 } };
  it("green for standard arch + Q4_0 that fits", () => {
    const v = scoreModel(base, hw16);
    expect(v.level).toBe("green");
    expect(v.contextTokens).toBe(16384);
    expect(v.installAllowed).toBe(true);
  });
  it("amber for hybrids and K-quants, red for unknown arch and for oversize", () => {
    expect(scoreModel({ ...base, architecture: "qwen35" }, hw16).level).toBe("amber");
    expect(scoreModel({ ...base, kind: "kquant" }, hw16).level).toBe("amber");
    expect(scoreModel({ ...base, architecture: "zaya" }, hw16).level).toBe("red");
    const big = scoreModel({ ...base, fileGB: 12 }, hw16);
    expect(big.level).toBe("red");
    expect(big.installAllowed).toBe(true);
  });
  it("shrinks context and explains", () => {
    const v = scoreModel({ ...base, wantedContext: 65536 }, hw16);
    expect(v.contextTokens).toBeLessThan(65536);
    expect(v.reasons.join(" ")).toMatch(/shrunk/);
  });
  it("native bundles above 1.7B are red on the old driver; small ones are fine", () => {
    expect(scoreModel({ architecture: "qwen3", fileGB: 4, kind: "native", paramsB: 4, wantedContext: 4096, engine: "qairt" }, hw16).level).toBe("red");
    expect(scoreModel({ architecture: "qwen3", fileGB: 1.7, kind: "native", paramsB: 1.7, wantedContext: 4096, engine: "qairt" }, hw16).level).toBe("green");
  });
  it("scores more RAM into a bigger catalog", () => {
    const hw32 = buildProfile({ cpuName: "Snapdragon X Elite", totalRamBytes: 32 * 1024 ** 3, npuDevices: [{ name: "NPU" }], npuSharedBytes: 16 * 1024 ** 3, osArch: "ARM64" }, "arm64");
    const v16 = scoreModel({ ...base, fileGB: 14, architecture: "gpt-oss", kind: "mxfp4", isMoe: true }, hw16);
    const v32 = scoreModel({ ...base, fileGB: 11, architecture: "gpt-oss", kind: "mxfp4", isMoe: true }, hw32);
    expect(v16.level).toBe("red");
    expect(v32.level).not.toBe("red");
  });
});

describe("catalog", () => {
  it("ships the tested models with the right verdicts on the 16 GB machine", () => {
    const view = viewCatalog(hw16);
    const byId = Object.fromEntries(view.map((v) => [v.entry.id, v]));
    expect(byId["qwen3-4b-thinking-2507"].verdict.level).toBe("green");
    expect(byId["qwen3-4b-thinking-2507"].entry.default).toBe(true);
    expect(byId["lfm2.5-8b-a1b"].verdict.level).toBe("green");
    expect(byId["qwen3.5-4b"].verdict.level).toBe("amber");
    expect(byId["qwen3-1.7b-native"].verdict.level).toBe("green");
    expect(byId["granite-4.2-3b"].hidden).toBe(true);
    expect(view[view.length - 1].entry.excluded).toBe(true);
  });
  it("every entry carries explicit sampling", () => {
    for (const e of CATALOG) {
      expect(e.sampling.temperature).toBeGreaterThan(0);
      expect(e.sampling.max_tokens).toBeGreaterThan(1000);
      expect(scoreEntry(e, hw16).reasons.length).toBeGreaterThan(0);
    }
  });
});

describe("sampling", () => {
  it("applies the spec table", () => {
    expect(samplingFor("unsloth/Qwen3-4B-Thinking-2507-GGUF").sampling).toMatchObject({ temperature: 0.6, top_p: 0.95, top_k: 20, presence_penalty: 1.5, max_tokens: 8192 });
    expect(samplingFor("bartowski/granite-4.2-3b-GGUF").sampling.temperature).toBe(1.0);
    expect(samplingFor("nvidia/Nemotron-Cascade-8B").sampling.max_tokens).toBe(6144);
    expect(samplingFor("Nanbeige4.1-3B").sampling.max_tokens).toBe(16384);
    expect(samplingFor("Ministral-3-8B-Reasoning").sampling).toMatchObject({ temperature: 0.7, max_tokens: 6144 });
  });
  it("falls back to the safe set and sends it explicitly", () => {
    const s = samplingFor("someone/unknown-model");
    expect(s.family).toBeNull();
    expect(requestSampling(s.sampling)).toEqual({ temperature: 0.6, top_p: 0.95, max_tokens: 8192, presence_penalty: 1.5 });
  });
});

describe("errors", () => {
  it("translates every error from the spec table", () => {
    const cases: [string, string][] = [
      ["Could not create context from binary ... context index = 3 : err 5000", "bundle-too-big"],
      ["ggml-hex: dspqueue_read failed", "npu-overflow"],
      ["net::ERR_CONNECTION_RESET", "connection-reset"],
      ['requested quant "Q4_0" not found', "quant-missing"],
      ["Requested chipset not available for this model", "no-chipset"],
      ["OSError: [WinError 193] %1 is not a valid Win32 application", "win193"],
      ["SDKError(Unknown error)", "npu-sdk-error"],
      ["Only 0.4 GB of RAM is free and Qwen3-8B needs about 7 GB on the NPU.", "ram-low"]
    ];
    for (const [raw, id] of cases) expect(translateError(raw)?.id).toBe(id);
  });
  it("drops harmless noise", () => {
    expect(translateError("DSP_INFO UNSUPPORTED_KEY: 49")).toBeNull();
    expect(translateError("SoX is not installed")).toBeNull();
    expect(friendly("")).toBeNull();
    expect(friendly("weird failure")?.id).toBe("unknown");
  });
});

describe("misc", () => {
  it("classifies architectures", () => {
    expect(classifyArchitecture("llama").cls).toBe("standard");
    expect(classifyArchitecture("lfm2moe").cls).toBe("fast-hybrid");
    expect(classifyArchitecture("qwen35").cls).toBe("partial-cpu");
    expect(classifyArchitecture("zaya1").cls).toBe("unknown");
  });
  it("parses repo input", () => {
    expect(parseRepoInput("https://huggingface.co/unsloth/Qwen3-4B-GGUF/tree/main")).toEqual({ repo: "unsloth/Qwen3-4B-GGUF", quant: null });
    expect(parseRepoInput("org/m-GGUF:Q4_0")).toEqual({ repo: "org/m-GGUF", quant: "Q4_0" });
    expect(parseRepoInput("nonsense")).toBeNull();
  });
});

import { parseMarkdown, parseInline } from "../src/core/markdown";
describe("markdown", () => {
  it("parses blocks, lists and code (including an unfinished fence)", () => {
    const b = parseMarkdown("# Title\n\nSome **bold** and `code` text with [a link](https://x.io).\n\n- one\n- two\n\n1. first\n2. second\n\n```python\nprint('hi')\n```\n\n> quote\n\n```js\nlet a =");
    expect(b.map((x) => x.t)).toEqual(["h", "p", "ul", "ol", "code", "quote", "code"]);
    expect((b[4] as any).lang).toBe("python");
    expect((b[4] as any).open).toBe(false);
    expect((b[6] as any).open).toBe(true);
    expect((b[2] as any).items).toHaveLength(2);
  });
  it("never produces markup from raw HTML and ignores non-http links", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([{ t: "text", v: "<script>alert(1)</script>" }]);
    expect(parseInline("[x](javascript:alert(1))").some((n) => n.t === "link")).toBe(false);
    expect(parseInline("snake_case_name and 2*3*4")).toEqual([{ t: "text", v: "snake_case_name and 2*3*4" }]);
  });
});
