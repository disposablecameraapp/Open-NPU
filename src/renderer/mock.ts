// Browser-only stand-in for the Electron bridge, used by `npm run dev:renderer` and screenshots.
import type { OpenNpuApi, CatalogItem } from "../shared/api";
import { CATALOG, ref } from "../core/catalog";
import { scoreEntry } from "../core/fit";
import { buildProfile } from "../core/hardware";
import type { ChatEvent, InstallProgress, ServerStatus, Settings, SpeakChunk, VoiceDownloadProgress, VoiceStatus } from "../shared/types";
import { DEFAULT_VOICE_SETTINGS, VOICE_MODELS } from "../core/voiceModels";
import { planNpu } from "../core/budget";

export function installMockIfNeeded() {
  if ((window as any).opennpu) return;
  const hw = buildProfile(
    { cpuName: "Snapdragon(R) X Plus - X1P64100 - Qualcomm(R) Oryon(TM) CPU", totalRamBytes: 16 * 1024 ** 3, npuDevices: [{ name: "Hexagon NPU", driverVersion: "30.0.220.3000" }], osArch: "ARM64" },
    "arm64"
  );
  const installed = new Set<string>(["qwen3-4b-thinking-2507"]);
  let settings: Settings = { geniexPath: "C:\\Users\\demo\\AppData\\Local\\GenieX CLI\\geniex.exe", npuBudgetOverrideGB: null, showKQuants: false, compute: "npu", keepaliveSec: 300, selectedModelId: "qwen3-4b-thinking-2507", pinnedGeniexVersion: null, voice: { ...DEFAULT_VOICE_SETTINGS, sttModelId: "stt-whisper-base", ttsModelId: "tts-kokoro-multi" } };
  const vinstalled = new Set<string>(["stt-whisper-base", "tts-kokoro-multi"]);
  let vstatus: VoiceStatus = { worker: "ready", stt: "stt-whisper-base", tts: "tts-kokoro-multi", sttProvider: "cpu", ttsProvider: "cpu", notice: null, ttsSampleRate: 24000, error: null };
  const vl: ((s: VoiceStatus) => void)[] = [], dl: ((p: VoiceDownloadProgress) => void)[] = [], al: ((c: SpeakChunk) => void)[] = [];
  let server: ServerStatus = { state: "ready", endpoint: "http://127.0.0.1:18181/v1", nctx: 16384, compute: "npu", restarts: 0, lastError: null, pid: 1234 };
  const sl: ((s: ServerStatus) => void)[] = [], cl: ((e: ChatEvent) => void)[] = [], il: ((p: InstallProgress) => void)[] = [];
  const items = (): CatalogItem[] => CATALOG.map((entry) => ({ entry, verdict: scoreEntry(entry, hw), hidden: !!entry.excluded, installed: installed.has(entry.id), ref: ref(entry), custom: false }));
  const api: OpenNpuApi = {
    appInfo: async () => ({ version: "0.1.0", arch: "arm64", platform: "win32", geniexPath: settings.geniexPath, geniexVersion: "preview", geniexVersionWarning: null, problems: [] }),
    hardware: async () => hw,
    catalog: async () => items(),
    installed: async () => [],
    hfSearch: async () => [{ repo: "unsloth/Qwen3-8B-GGUF", downloads: 120000, likes: 300, updated: null }],
    hfInspect: async () => { throw new Error("Preview mode: Hugging Face is not reachable."); },
    install: async (e) => {
      const r = ref(e);
      for (const p of [10, 40, 75, 100]) { await new Promise((x) => setTimeout(x, 400)); il.forEach((f) => f({ ref: r, phase: p === 100 ? "done" : "downloading", percent: p })); }
      installed.add(e.id);
    },
    cancelInstall: async () => undefined,
    uninstall: async (e) => { installed.delete(e.id); return { ok: true, message: "" }; },
    selectModel: async (id) => { settings = { ...settings, selectedModelId: id }; },
    server: async () => server,
    stopServer: async () => { server = { ...server, state: "stopped" }; sl.forEach((f) => f(server)); },
    serverLog: async () => ["listening 127.0.0.1:18181"],
    chat: async (id) => {
      const emit = (e: ChatEvent) => cl.forEach((f) => f(e));
      const think = "The user greeted me. Reply briefly.";
      for (const w of think.split(" ")) { await new Promise((x) => setTimeout(x, 30)); emit({ id, type: "thinking", text: w + " " }); }
      for (const w of "Hello! This is the preview build, so I am a mock. On a Snapdragon X machine this answer comes from the NPU.".split(" ")) { await new Promise((x) => setTimeout(x, 35)); emit({ id, type: "answer", text: w + " " }); }
      emit({ id, type: "done", stats: { ttftSec: 1.2, tokPerSec: 14.1, tokens: 38, totalSec: 3.9 } });
    },
    abortChat: async () => undefined,
    settings: async () => settings,
    saveSettings: async (p) => (settings = { ...settings, ...p }),
    pickGeniex: async () => null,
    openGeniexDownload: async () => undefined,
    meters: async () => ({ ramPercent: 62, ramUsedGB: 9.9, ramTotalGB: 16, npuMemGB: 3.1, npuBudgetGB: hw.npuBudgetGB, npuUtilPercent: 4, ramWarning: false }),
    npuPlan: async () => {
      const entry = CATALOG.find((e) => e.id === settings.selectedModelId) ?? null;
      return planNpu({ hw, chat: entry ? { entry, compute: settings.compute, estNpuGB: scoreEntry(entry, hw).estNpuGB } : null, voice: settings.voice });
    },
    voiceModels: async () => VOICE_MODELS.map((model) => ({ model, installed: vinstalled.has(model.id) })),
    voiceStatus: async () => vstatus,
    voiceDownload: async (id) => {
      for (const p of [20, 60, 100]) { await new Promise((x) => setTimeout(x, 300)); dl.forEach((f) => f({ id, phase: p === 100 ? "done" : "downloading", percent: p })); }
      vinstalled.add(id);
    },
    voiceCancelDownload: async () => undefined,
    voiceRemove: async (id) => { vinstalled.delete(id); },
    voiceApply: async () => vstatus,
    transcribe: async () => "Hello from the microphone",
    speak: async (id) => { al.forEach((f) => f({ id, samples: new Float32Array(0), sampleRate: 24000, done: true })); },
    cancelSpeak: async () => undefined,
    saveVoice: async (p) => {
      settings = { ...settings, voice: { ...settings.voice, ...p } };
      vstatus = { ...vstatus, sttProvider: settings.voice.sttCompute, ttsProvider: settings.voice.ttsCompute };
      vl.forEach((f) => f(vstatus));
      return settings;
    },
    onVoiceDownload: (cb) => { dl.push(cb); return () => dl.splice(dl.indexOf(cb), 1); },
    onVoiceAudio: (cb) => { al.push(cb); return () => al.splice(al.indexOf(cb), 1); },
    onVoiceStatus: (cb) => { vl.push(cb); return () => vl.splice(vl.indexOf(cb), 1); },
    onInstall: (cb) => { il.push(cb); return () => il.splice(il.indexOf(cb), 1); },
    onChat: (cb) => { cl.push(cb); return () => cl.splice(cl.indexOf(cb), 1); },
    onServer: (cb) => { sl.push(cb); return () => sl.splice(sl.indexOf(cb), 1); }
  };
  (window as any).opennpu = api;
}
