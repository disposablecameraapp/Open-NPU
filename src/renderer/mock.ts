// Browser-only stand-in for the Electron bridge, used by `npm run dev:renderer` and screenshots.
import { DYNAMIC_DATA } from "../core/dynamic-data";
import type { OpenNpuApi, CatalogItem } from "../shared/api";
import { CATALOG, ref } from "../core/catalog";
import { scoreEntry } from "../core/fit";
import { buildProfile } from "../core/hardware";
import type { Artifact, ChatEvent, Project, ScheduledTask, InstallProgress, ServerStatus, Settings, SpeakChunk, VoiceDownloadProgress, VoiceStatus } from "../shared/types";
import { DEFAULT_VOICE_SETTINGS, VOICE_MODELS } from "../core/voiceModels";
import { planNpu } from "../core/budget";
import { nextRun } from "../core/schedule";
import { textOf } from "../core/attachments";
import { browse, dockerVariants } from "../core/browse";
import { nativeRow } from "../core/native";

export function installMockIfNeeded() {
  if ((window as any).opennpu) return;
  const hw = buildProfile(
    { cpuName: "Snapdragon(R) X Plus - X1P64100 - Qualcomm(R) Oryon(TM) CPU", totalRamBytes: 16 * 1024 ** 3, npuDevices: [{ name: "Hexagon NPU", driverVersion: "30.0.220.3000" }], osArch: "ARM64" },
    "arm64"
  );
  const installed = new Set<string>(["qwen3-4b-thinking-2507", "qwen3-1.7b-native", "lfm2.5-8b-a1b"]);
  let settings: Settings = { geniexPath: "C:\\Users\\demo\\AppData\\Local\\GenieX CLI\\geniex.exe", npuBudgetOverrideGB: null, showKQuants: false, compute: "npu", keepaliveSec: 300, selectedModelId: "qwen3-4b-thinking-2507", pinnedGeniexVersion: null, voice: { ...DEFAULT_VOICE_SETTINGS, sttModelId: "stt-whisper-base", ttsModelId: "tts-kokoro-multi" }, customInstructions: "", effort: "medium", subagents: true, autoCheck: true, reviewerModelId: null, reviewRounds: 2, writers: {}, developer: false, webSearch: false, searchAlways: false, searchProvider: "duckduckgo", braveKey: "", searxngUrl: "", searchModelId: null, agentLoop: false, agentRounds: 6, agentMinutes: 30, agentGoal: "" };
  const vinstalled = new Set<string>(["stt-whisper-base", "tts-kokoro-multi"]);
  let vstatus: VoiceStatus = { worker: "ready", stt: "stt-whisper-base", tts: "tts-kokoro-multi", sttProvider: "cpu", ttsProvider: "cpu", notice: null, ttsSampleRate: 24000, error: null };
  const vl: ((s: VoiceStatus) => void)[] = [], dl: ((p: VoiceDownloadProgress) => void)[] = [], al: ((c: SpeakChunk) => void)[] = [];
  let server: ServerStatus = { state: "ready", endpoint: "http://127.0.0.1:18181/v1", nctx: 16384, compute: "npu", restarts: 0, lastError: null, pid: 1234 };
  const sl: ((s: ServerStatus) => void)[] = [], cl: ((e: ChatEvent) => void)[] = [], il: ((p: InstallProgress) => void)[] = [];
  let projects: Project[] = [], artifacts: Artifact[] = [], tasks: ScheduledTask[] = [];
  const tkl: ((t: ScheduledTask) => void)[] = [];
  const bl: ((s: import("../core/benchRunner").BenchState) => void)[] = [];
  let benchState: import("../core/benchRunner").BenchState = { running: false, phase: "idle", runDir: null, summaryFile: null, mode: "quick", modelIndex: 0, modelCount: 0, current: null, testIndex: 0, testCount: 0, currentTest: null, startedAt: null, rows: [], log: [] };
  let benchTimer: ReturnType<typeof setInterval> | undefined;
  const runMockBench = () => {
    const names = ["Qwen3-1.7B (native NPU bundle)", "Gemma-3-4B-it", "Qwen3-8B"];
    let step = 0;
    benchState = { ...benchState, running: true, phase: "installing", modelCount: names.length, modelIndex: 1, current: names[0], startedAt: Date.now(), rows: [] };
    bl.forEach((f) => f(benchState));
    benchTimer = setInterval(() => {
      step++;
      const mi = Math.min(names.length, Math.floor(step / 6) + 1), ti = step % 6;
      const rows = names.slice(0, mi - 1).map((name, i) => ({ key: name, name, sizeGB: [1.7, 2.4, 4.8][i], quality: [71, 82, 90][i], runsOn: (["npu", "npu", "cpu"] as const)[i], ttftSec: [0.4, 0.9, 1.6][i], tokPerSec: [43, 15.6, 7.7][i], coldStartSec: [6, 9, 15][i], ran: 13, failed: 0, file: `/r/${i}.json` }));
      benchState = { ...benchState, modelIndex: mi, current: names[mi - 1], phase: ti === 0 ? "removing" : "testing", testIndex: ti, testCount: 5, currentTest: "Email in French", rows, log: [...benchState.log, `step ${step}`].slice(-20) };
      if (mi === names.length && ti === 5) { clearInterval(benchTimer); benchState = { ...benchState, running: false, phase: "done", summaryFile: "/r/summary.md" }; }
      bl.forEach((f) => f(benchState));
    }, 700);
  };
  const items = (): CatalogItem[] => CATALOG.map((entry) => ({ entry, verdict: scoreEntry(entry, hw), hidden: !!entry.excluded, installed: installed.has(entry.id), ref: ref(entry), custom: false }));
  const api: OpenNpuApi = {
    appInfo: async () => ({ version: "0.1.0", arch: "arm64", platform: "win32", geniexPath: settings.geniexPath, geniexVersion: "preview", geniexVersionWarning: null, problems: [] }),
    hardware: async () => hw,
    catalog: async () => items(),
    installed: async () => [],
    hfSearch: async () => [{ repo: "unsloth/Qwen3-8B-GGUF", downloads: 120000, likes: 300, updated: null }],
    browse: async (q) => browse({
      hf: [
        { id: "unsloth/Qwen3-4B-Thinking-2507-GGUF", downloads: 410000, likes: 520, lastModified: "2026-09-02T10:00:00Z", pipeline_tag: "text-generation", gguf: { total: 4.02e9, architecture: "qwen3" }, siblings: [{ rfilename: "Qwen3-4B-Thinking-2507-Q4_0.gguf" }, { rfilename: "Qwen3-4B-Thinking-2507-Q8_0.gguf" }] },
        { id: "LiquidAI/LFM2.5-8B-A1B-GGUF", downloads: 98000, likes: 310, lastModified: "2026-10-01T10:00:00Z", pipeline_tag: "text-generation", gguf: { total: 8.3e9, architecture: "lfm2moe" }, siblings: [{ rfilename: "LFM2.5-8B-A1B-Q4_0.gguf" }] },
        { id: "unsloth/Qwen3-VL-8B-Instruct-GGUF", downloads: 150000, likes: 260, lastModified: "2026-09-20T10:00:00Z", pipeline_tag: "image-text-to-text", gguf: { total: 8.2e9, architecture: "qwen3vl" }, siblings: [{ rfilename: "Qwen3-VL-8B-Instruct-Q4_0.gguf" }] },
        { id: "unsloth/Qwen3.5-9B-GGUF", downloads: 80000, likes: 190, lastModified: "2026-10-10T10:00:00Z", gguf: { total: 9e9, architecture: "qwen35" }, siblings: [{ rfilename: "Qwen3.5-9B-Q4_0.gguf" }] },
        { id: "someone/Llama-3.1-8B-GGUF", downloads: 640000, likes: 900, lastModified: "2026-05-02T10:00:00Z", gguf: { total: 8.03e9, architecture: "llama" }, siblings: [{ rfilename: "Llama-3.1-8B-Q4_K_M.gguf" }, { rfilename: "Llama-3.1-8B-Q8_0.gguf" }] }
      ],
      docker: [
        { name: "gemma3", namespace: "ai", description: "Google's Gemma 3 in several sizes", pull_count: 3200000, star_count: 40, last_updated: "2026-08-01T10:00:00Z" },
        { name: "qwen3", namespace: "ai", description: "Qwen3 dense and MoE models", pull_count: 2100000, star_count: 35, last_updated: "2026-09-12T10:00:00Z" }
      ],
      native: [nativeRow({ name: "Qwen3-1.7B" }, hw), nativeRow({ name: "Llama-3.2-1B-Instruct" }, hw)]
    }, hw, q),
    dockerVariants: async (name) => dockerVariants(name, [
      { name: "4B-Q4_0", full_size: 2.4e9, last_updated: "2026-09-01T10:00:00Z" }, { name: "8B-Q4_0", full_size: 4.7e9 }, { name: "8B-Q4_K_M", full_size: 5.0e9 }, { name: "14B-Q4_0", full_size: 8.4e9 }
    ], hw),
    resolveModel: async (input) => ({ type: "search", query: input, note: null }),
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
    chat: async (id, _m, msgs) => {
      const emit = (e: ChatEvent) => cl.forEach((f) => f(e));
      const lastUser = textOf(msgs[msgs.length - 1]?.content ?? "");
      if (/sub-?agent/i.test(lastUser)) {
        const wait = (ms: number) => new Promise((x) => setTimeout(x, ms));
        for (const [index, name] of ["Pros", "Cons"].entries()) {
          const agent = { index, name, task: `List the ${name.toLowerCase()} of running models on an NPU.`, status: "running" as const, output: "" };
          emit({ id, type: "agent", agent: { ...agent } });
          for (const w of `${name}: low power draw, fast first token. `.split(" ")) { await wait(40); agent.output += w + " "; emit({ id, type: "agent", agent: { ...agent } }); }
          emit({ id, type: "agent", agent: { ...agent, status: "done" } });
        }
        for (const w of "Both sub-agents are done: the NPU is quiet and efficient, but memory is the limit.".split(" ")) { await wait(30); emit({ id, type: "answer", text: w + " " }); }
        emit({ id, type: "done", stats: { ttftSec: 1, tokPerSec: 14, tokens: 60, totalSec: 4 } });
        return;
      }
      if (/\b(make|build|create|write)\b/i.test(lastUser)) {
        const reply = `Here is a small page.\n<artifact type="html" title="Pomodoro timer">\n<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:40px"><h1 id="t">25:00</h1><button onclick="go()">Start</button><script>let s=1500;function go(){setInterval(()=>{s--;document.getElementById('t').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0')},1000)}</script></body></html>\n</artifact>\nTell me if you want changes.`;
        for (let i = 0; i < reply.length; i += 12) { await new Promise((x) => setTimeout(x, 25)); emit({ id, type: "answer", text: reply.slice(i, i + 12) }); }
        emit({ id, type: "done", stats: { ttftSec: 1, tokPerSec: 14, tokens: 120, totalSec: 5 } });
        return;
      }
      const think = "The user greeted me. Reply briefly.";
      for (const w of think.split(" ")) { await new Promise((x) => setTimeout(x, 30)); emit({ id, type: "thinking", text: w + " " }); }
      for (const w of "Hello! This is the preview build, so I am a mock. On a Snapdragon X machine this answer comes from the NPU.".split(" ")) { await new Promise((x) => setTimeout(x, 35)); emit({ id, type: "answer", text: w + " " }); }
      emit({ id, type: "done", stats: { ttftSec: 1.2, tokPerSec: 14.1, tokens: 38, totalSec: 3.9 } });
    },
    abortChat: async () => undefined,
    projects: async () => projects,
    saveProject: async (p) => { projects = projects.some((x) => x.id === p.id) ? projects.map((x) => (x.id === p.id ? p : x)) : [...projects, p]; return projects; },
    deleteProject: async (id) => (projects = projects.filter((p) => p.id !== id)),
    artifacts: async () => artifacts,
    saveArtifact: async (a) => { artifacts = artifacts.some((x) => x.id === a.id) ? artifacts.map((x) => (x.id === a.id ? a : x)) : [...artifacts, a]; return artifacts; },
    deleteArtifact: async (id) => (artifacts = artifacts.filter((a) => a.id !== id)),
    exportArtifact: async () => null,
    runCode: async () => undefined,
    stopRun: async () => undefined,
    onRun: () => () => undefined,
    benchRoster: async () => ({
      targets: [...DYNAMIC_DATA.packs["2B"].models, ...DYNAMIC_DATA.packs["4B"].models, ...DYNAMIC_DATA.packs["9B"].models].map((m, i) => ({ key: m.ref, name: m.name, repo: m.repo, quant: m.quant, sizeGB: m.sizeGB, paramsB: m.paramsB, source: `Dynamic ${i < 3 ? "2B" : i < 7 ? "4B" : "9B"}`, bundleRef: m.ref, installed: i % 3 === 0 })).concat([{ key: "spec:lfm2-1.2b-extract", name: "LFM2-1.2B-Extract", repo: "LiquidAI/LFM2-1.2B-Extract-GGUF", quant: "Q4_0", sizeGB: 0.7, paramsB: 1.2, source: "Specialists", specialty: "Structured extraction to JSON/XML/YAML specialist", installed: false } as never]),
      tests: { express: 13, quick: 33, full: 87 }, costs: { express: Array(13).fill({ maxTokens: 120 }), quick: Array(33).fill({ maxTokens: 250 }), full: Array(87).fill({ maxTokens: 300 }) }, freeGB: 142, folder: "C:\\Users\\demo\\AppData\\Roaming\\Open NPU\\benchmarks"
    }),
    benchState: async () => benchState,
    benchStart: async () => { runMockBench(); return { ok: true }; },
    benchStop: async () => { benchTimer && clearInterval(benchTimer); benchState = { ...benchState, running: false, phase: "stopped" }; bl.forEach((f) => f(benchState)); },
    benchReveal: async () => true,
    onBench: (cb) => { bl.push(cb); return () => undefined; },
    dynamicInfo: async () => ({ data: DYNAMIC_DATA, speeds: { "qwen3-1.7b-native": 27 }, profile: "16", autoProfile: "16", installedRefs: ["qwen3-1.7b-native", "qwen3-4b-instruct-2507", "qwen3-4b-thinking-2507"], missing: {} }),
    setDynamicProfile: async () => undefined,
    installDynamic: async () => undefined,
    onDynamicInstall: () => () => undefined,
    launchSite: async () => ({ error: "Opening a site in the browser works in the desktop app." }),
    onSiteNav: () => () => undefined,
    tasks: async () => tasks,
    saveTask: async (t) => {
      const now = Date.now();
      const t2 = { ...t, created: t.created || now, nextRun: t.enabled ? nextRun(t.schedule, now) : null };
      tasks = tasks.some((x) => x.id === t.id) ? tasks.map((x) => (x.id === t.id ? { ...x, ...t2, runs: x.runs } : x)) : [...tasks, t2];
      return tasks;
    },
    deleteTask: async (id) => (tasks = tasks.filter((t) => t.id !== id)),
    runTask: async (id) => {
      const set = (t: ScheduledTask) => { tasks = tasks.map((x) => (x.id === id ? t : x)); tkl.forEach((f) => f(t)); };
      const t = tasks.find((x) => x.id === id)!;
      set({ ...t, running: true });
      await new Promise((x) => setTimeout(x, 1500));
      const at = Date.now();
      set({ ...t, running: false, nextRun: nextRun(t.schedule, at), runs: [{ id: `${id}:${at}`, startedAt: at - 1500, finishedAt: at, status: "ok", output: "Preview result: this is where the task's answer appears.", artifactIds: [] }, ...t.runs] });
    },
    onTasks: (cb) => { tkl.push(cb); return () => tkl.splice(tkl.indexOf(cb), 1); },
    onArtifacts: () => () => undefined,
    settings: async () => settings,
    saveSettings: async (p) => (settings = { ...settings, ...p }),
    pickGeniex: async () => null,
    openGeniexDownload: async () => undefined,
    npuDiagnostics: async () => ({ ok: false, problem: "Windows has no performance counters for the NPU on this PC (mock).", windows: "26100.4061", windowsHasNpuMonitoring: false, sets: [], adapter: null, topUtil: [], adapters: ["Qualcomm(R) Adreno(TM) X1-85 GPU luid_0x00000000_0x0000a1b2"], allSets: ["Processor", "Memory"], sample: [], util: null, memGB: null }),
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
    setupState: async () => ({ active: false, steps: [] }),
    setupSkip: async () => undefined, setupRetry: async () => undefined, setupDismiss: async () => undefined,
    onSetup: () => () => undefined,
    onInstall: (cb) => { il.push(cb); return () => il.splice(il.indexOf(cb), 1); },
    onChat: (cb) => { cl.push(cb); return () => cl.splice(cl.indexOf(cb), 1); },
    onServer: (cb) => { sl.push(cb); return () => sl.splice(sl.indexOf(cb), 1); }
  };
  (window as any).opennpu = api;
}
