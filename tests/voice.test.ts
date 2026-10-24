import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EnergyVad } from "../src/core/vad";
import { SentenceChunker, toSpeechText } from "../src/core/speechText";
import { VOICE_MODELS, defaultVoiceModel, sttConfig, ttsConfig, voiceModelUrl, DEFAULT_VOICE_SETTINGS } from "../src/core/voiceModels";
import { VoiceEngine } from "../src/core/voiceEngine";
import { effectiveHardware, planNpu, voiceNpuGB } from "../src/core/budget";
import { buildProfile } from "../src/core/hardware";
import { CATALOG } from "../src/core/catalog";
import { scoreEntry } from "../src/core/fit";
import { VoiceService } from "../src/main/voice";

const hw = buildProfile({ cpuName: "Snapdragon X Plus", totalRamBytes: 16 * 1024 ** 3, npuDevices: [{ name: "NPU", driverVersion: "30.0.220.3000" }], npuSharedBytes: 7.8 * 1024 ** 3, osArch: "ARM64" }, "arm64");

function tone(ms: number, amp = 0.2, sr = 16000) {
  const n = Math.round((sr * ms) / 1000);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * 220 * i) / sr) + (Math.random() - 0.5) * 0.002;
  return a;
}
const quiet = (ms: number, sr = 16000) => { const a = new Float32Array(Math.round((sr * ms) / 1000)); for (let i = 0; i < a.length; i++) a[i] = (Math.random() - 0.5) * 0.004; return a; };

describe("energy VAD", () => {
  it("detects one utterance with pre-roll and ends after silence", () => {
    const v = new EnergyVad();
    const ev = [...v.push(quiet(600)), ...v.push(tone(900)), ...v.push(quiet(1200))];
    expect(ev.map((e) => e.type)).toEqual(["start", "end"]);
    const end = ev[1] as any;
    expect(end.durationMs).toBeGreaterThan(900 + 700);
    expect(end.samples.length).toBeGreaterThan(16000);
  });
  it("ignores clicks shorter than the minimum and works with odd chunk sizes", () => {
    const v = new EnergyVad();
    const evs = [...v.push(quiet(500)), ...v.push(tone(60)), ...v.push(quiet(1200))];
    expect(evs.some((e) => e.type === "end")).toBe(false);
    const w = new EnergyVad();
    const big = Float32Array.from([...quiet(400), ...tone(800), ...quiet(1000)]);
    const out: string[] = [];
    for (let i = 0; i < big.length; i += 333) out.push(...w.push(big.subarray(i, i + 333)).map((e) => e.type));
    expect(out).toEqual(["start", "end"]);
  });
  it("a stricter ratio ignores quiet speech (barge-in guard)", () => {
    const v = new EnergyVad({ minRms: 0.2 });
    expect(v.push(Float32Array.from([...quiet(300), ...tone(800, 0.1), ...quiet(1000)])).length).toBe(0);
  });
  it("flush closes an open utterance", () => {
    const v = new EnergyVad();
    v.push(quiet(300)); v.push(tone(700));
    expect(v.flush().map((e) => e.type)).toEqual(["end"]);
  });
});

describe("speech text", () => {
  it("strips code, links and markdown", () => {
    const t = toSpeechText("# Title\nHere is **bold** and `code`.\n```js\nlet x = 1;\n```\nSee [docs](https://x.y) or https://z.io now 🙂\n- one\n- two");
    expect(t).toBe("Title\nHere is bold and code.\nSee docs or now\none\ntwo");
  });
  it("drops an unfinished code fence while streaming", () => {
    expect(toSpeechText("Sure.\n```py\nprint(")).toBe("Sure.");
  });
});

describe("sentence chunker", () => {
  it("emits sentences as they complete, not before", () => {
    const c = new SentenceChunker(10);
    expect(c.push("Hello there, how are")).toEqual([]);
    expect(c.push(" you today? I am fine")).toEqual(["Hello there, how are you today?"]);
    expect(c.push(". Thanks!")).toEqual(["I am fine."]);
    expect(c.flush()).toEqual(["Thanks!"]);
  });
  it("does not split decimals or abbreviations", () => {
    const c = new SentenceChunker(10);
    const out = [...c.push("The value is 3.5 percent, said Dr. Smith. Next one."), ...c.flush()];
    expect(out).toEqual(["The value is 3.5 percent, said Dr. Smith.", "Next one."]);
  });
  it("breaks the first long chunk at a comma to start speaking sooner", () => {
    const c = new SentenceChunker(10, 40);
    const first = c.push("This is a rather long opening clause that keeps going, and then more text");
    expect(first).toHaveLength(1);
    expect(first[0].endsWith(",")).toBe(true);
  });
});

describe("voice model configs", () => {
  const f = (...n: string[]) => n.map((x) => "/m/" + x);
  it("catalog has one default per kind, Kokoro for read-aloud, and valid URLs", () => {
    expect(defaultVoiceModel("tts").family).toBe("kokoro");
    expect(defaultVoiceModel("stt").languages).toMatch(/French/);
    expect(voiceModelUrl(defaultVoiceModel("tts"))).toBe("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_1.tar.bz2");
    expect(new Set(VOICE_MODELS.map((m) => m.id)).size).toBe(VOICE_MODELS.length);
  });
  it("builds whisper / moonshine / parakeet / kokoro / piper configs and picks int8", () => {
    const whisper = sttConfig(VOICE_MODELS.find((m) => m.id === "stt-whisper-base")!, f("base-encoder.onnx", "base-encoder.int8.onnx", "base-decoder.int8.onnx", "base-tokens.txt"), "fr") as any;
    expect(whisper.modelConfig.whisper.encoder).toMatch(/encoder\.int8/);
    expect(whisper.modelConfig.whisper.language).toBe("fr");
    expect(whisper.modelConfig.provider).toBe("cpu");
    const moon = sttConfig(VOICE_MODELS.find((m) => m.family === "moonshine")!, f("preprocess.onnx", "encode.int8.onnx", "uncached_decode.int8.onnx", "cached_decode.int8.onnx", "tokens.txt")) as any;
    expect(moon.modelConfig.moonshine.cachedDecoder).toMatch(/cached_decode/);
    const para = sttConfig(VOICE_MODELS.find((m) => m.family === "transducer")!, f("encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"), "", "npu") as any;
    expect(para.modelConfig.modelType).toBe("nemo_transducer");
    expect(para.modelConfig.provider).toBe("qnn");
    const kok = ttsConfig(VOICE_MODELS.find((m) => m.id === "tts-kokoro-multi")!, [...f("model.int8.onnx", "voices.bin", "tokens.txt", "lexicon-us-en.txt", "lexicon-zh.txt"), "/m/espeak-ng-data/"]) as any;
    expect(kok.model.kokoro.model).toMatch(/model\.int8\.onnx/);
    expect(kok.model.kokoro.dataDir).toBe("/m/espeak-ng-data");
    expect(kok.model.kokoro.lexicon).toContain(",");
    const piper = ttsConfig(VOICE_MODELS.find((m) => m.family === "vits")!, [...f("fr_FR-siwis-medium.onnx", "tokens.txt"), "/m/espeak-ng-data/"]) as any;
    expect(piper.model.vits.model).toMatch(/siwis/);
  });
  it("says what is missing instead of crashing later", () => {
    expect(() => sttConfig(VOICE_MODELS.find((m) => m.family === "whisper")!, f("tokens.txt"))).toThrow(/encoder/);
    expect(() => ttsConfig(VOICE_MODELS.find((m) => m.family === "kokoro")!, f("tokens.txt", "model.onnx"))).toThrow(/voices\.bin/);
  });
});

describe("NPU budget across chat + dictation + read-aloud", () => {
  const entry = CATALOG.find((e) => e.id === "qwen3-4b-thinking-2507")!;
  const base = { ...DEFAULT_VOICE_SETTINGS, sttModelId: "stt-whisper-base", ttsModelId: "tts-kokoro-multi" };
  const chatEst = scoreEntry(entry, hw).estNpuGB;
  it("all three fit together on 7.8 GB with small models", () => {
    const plan = planNpu({ hw, chat: { entry, compute: "npu", estNpuGB: chatEst }, voice: { ...base, sttCompute: "npu", ttsCompute: "npu" } });
    expect(plan.lines.filter((l) => l.onNpu)).toHaveLength(3);
    expect(plan.fits).toBe(true);
    expect(plan.totalGB).toBeGreaterThan(chatEst);
  });
  it("warns with advice when they do not", () => {
    const big = CATALOG.find((e) => e.id === "ministral-3-8b-reasoning")!;
    const plan = planNpu({ hw, chat: { entry: big, compute: "npu", estNpuGB: 7.0 }, voice: { ...base, sttCompute: "npu", ttsCompute: "npu" } });
    expect(plan.fits).toBe(false);
    expect(plan.advice).toMatch(/Move/);
  });
  it("voice on the CPU costs the NPU nothing", () => {
    const plan = planNpu({ hw, chat: { entry, compute: "npu", estNpuGB: chatEst }, voice: base });
    expect(plan.voiceGB).toBe(0);
    expect(plan.totalGB).toBeCloseTo(chatEst, 1);
    expect(effectiveHardware(hw, base, "npu").npuBudgetGB).toBe(hw.npuBudgetGB);
  });
  it("voice on the NPU shrinks what the chat model may use; chat on CPU is bounded by RAM", () => {
    const eff = effectiveHardware(hw, { ...base, sttCompute: "npu", ttsCompute: "npu" }, "npu");
    expect(eff.npuBudgetGB).toBeLessThan(hw.npuBudgetGB - 0.5);
    expect(scoreEntry(CATALOG.find((e) => e.id === "ministral-3-8b-reasoning")!, eff).contextTokens)
      .toBeLessThanOrEqual(scoreEntry(CATALOG.find((e) => e.id === "ministral-3-8b-reasoning")!, hw).contextTokens);
    expect(effectiveHardware(hw, base, "cpu").npuBudgetGB).toBeCloseTo(8.8, 1);
    expect(voiceNpuGB(VOICE_MODELS.find((m) => m.id === "tts-kokoro-multi")!)).toBeGreaterThan(0.4);
  });
});

describe("voice engine", () => {
  const backend = {
    createStt: async () => ({ decode: async (s: Float32Array) => ` len ${s.length} ` }),
    createTts: async () => ({
      sampleRate: 24000,
      generate: async ({ onChunk }: any) => { for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 5)); if (!onChunk(new Float32Array(10))) return; } }
    })
  };
  it("transcribes, streams audio chunks and honors cancel", async () => {
    const e = new VoiceEngine(backend as any);
    await expect(e.transcribe(new Float32Array(16000), 16000)).rejects.toThrow(/dictation model/);
    await e.loadStt({}); await e.loadTts({});
    expect(await e.transcribe(new Float32Array(16000), 16000)).toBe("len 16000");
    expect(await e.transcribe(new Float32Array(10), 16000)).toBe(""); // too short
    const chunks: number[] = [];
    await e.speak("a", "hi", 0, 1, (c, done) => chunks.push(done ? -1 : c.length));
    expect(chunks).toEqual([10, 10, 10, 10, 10, -1]);
    const got: number[] = [];
    const p = e.speak("b", "hi", 0, 1, (c, done) => got.push(done ? -1 : c.length));
    setTimeout(() => e.cancel("b"), 12);
    await p;
    expect(got.length).toBeLessThan(6);
    expect(got[got.length - 1]).toBe(-1);
  });
});

describe("voice worker process (fake backend, real IPC)", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "opennpu-build-"));
  const models = fs.mkdtempSync(path.join(os.tmpdir(), "opennpu-models-"));
  beforeAll(() => {
    const root = path.join(__dirname, "..");
    // run tsc through node so it works on Windows, where "npx" is a .cmd file execFileSync cannot spawn
    execFileSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.main.json", "--outDir", out], { cwd: root, stdio: "pipe" });
    // pretend the models are downloaded
    for (const id of ["stt-whisper-base", "tts-kokoro-multi", "tts-piper-en"]) {
      const d = path.join(models, id);
      fs.mkdirSync(path.join(d, "espeak-ng-data"), { recursive: true });
      for (const f of ["base-encoder.int8.onnx", "base-decoder.int8.onnx", "tokens.txt", "model.int8.onnx", "voices.bin", "amy.onnx"]) fs.writeFileSync(path.join(d, f), "x");
      fs.writeFileSync(path.join(d, ".complete"), "");
    }
  }, 60000);
  afterAll(() => { fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(models, { recursive: true, force: true }); });

  const mk = (env: NodeJS.ProcessEnv = {}) => new VoiceService(models, path.join(out, "voice", "worker.js"), { OPENNPU_FAKE_VOICE: "1", ELECTRON_RUN_AS_NODE: "", ...env });
  const settings = { ...DEFAULT_VOICE_SETTINGS, sttModelId: "stt-whisper-base", ttsModelId: "tts-kokoro-multi" };

  it("loads both models on the CPU, transcribes and streams speech", async () => {
    const v = mk();
    await v.apply(settings);
    const st = v.status();
    expect([st.stt, st.tts, st.sttProvider, st.ttsProvider]).toEqual(["stt-whisper-base", "tts-kokoro-multi", "cpu", "cpu"]);
    expect(st.ttsSampleRate).toBe(24000);
    expect(await v.transcribe(new Float32Array(16000), 16000)).toBe("heard 16000 samples");
    const chunks: any[] = [];
    v.on("audio", (c) => chunks.push(c));
    await v.speak("s1", "Hello", 0, 1);
    expect(chunks.length).toBe(4);
    expect(chunks[0].samples).toBeInstanceOf(Float32Array);
    expect(chunks[chunks.length - 1].done).toBe(true);
    await v.stop();
  }, 20000);

  it("NPU switch: used when it loads, falls back to the CPU with a notice when it does not", async () => {
    const ok = mk();
    await ok.apply({ ...settings, sttCompute: "npu", ttsCompute: "npu" });
    expect([ok.status().sttProvider, ok.status().ttsProvider]).toEqual(["npu", "npu"]);
    await ok.stop();
    const bad = mk({ OPENNPU_FAKE_QNN_FAIL: "1" });
    await bad.apply({ ...settings, sttCompute: "npu", ttsCompute: "npu" });
    expect([bad.status().sttProvider, bad.status().ttsProvider]).toEqual(["cpu", "cpu"]);
    expect(bad.status().notice).toMatch(/could not start on the NPU/);
    expect(await bad.transcribe(new Float32Array(8000), 16000)).toMatch(/heard/);
    await bad.stop();
  }, 20000);

  it("NPU switch: a runtime that exits the process on QNN falls back to the CPU", async () => {
    const v = mk({ OPENNPU_FAKE_QNN_CRASH: "1" });
    await v.apply({ ...settings, sttCompute: "npu", ttsCompute: "npu" });
    expect([v.status().stt, v.status().tts]).toEqual(["stt-whisper-base", "tts-kokoro-multi"]);
    expect([v.status().sttProvider, v.status().ttsProvider]).toEqual(["cpu", "cpu"]);
    expect(v.status().error).toBeNull();
    expect(await v.transcribe(new Float32Array(8000), 16000)).toMatch(/heard/);
    await v.stop();
  }, 20000);

  it("switching a model from CPU to NPU reloads it", async () => {
    const v = mk();
    await v.apply(settings);
    await v.apply({ ...settings, ttsCompute: "npu" });
    expect(v.status().ttsProvider).toBe("npu");
    expect(v.status().sttProvider).toBe("cpu");
    await v.apply({ ...settings, ttsModelId: "tts-piper-en" });
    expect(v.status().tts).toBe("tts-piper-en");
    await v.stop();
  }, 20000);

  it("reports a missing speech model instead of hanging", async () => {
    const v = mk();
    await expect(v.transcribe(new Float32Array(16000), 16000)).rejects.toThrow(/dictation model/);
    await expect(v.speak("x", "hi", 0, 1)).rejects.toThrow(/read-aloud model/);
  });
});
