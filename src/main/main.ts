import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { AppInfo, CatalogItem } from "../shared/api";
import { CatalogEntry, ChatEvent, ChatMessage, HardwareProfile, InstallProgress, Settings } from "../shared/types";
import { CATALOG, ref as entryRef } from "../core/catalog";
import { scoreEntry } from "../core/fit";
import { HARDWARE_SCRIPT, buildProfile, hardwareProblems, parseRawHardware, RawHardware } from "../core/hardware";
import { HfClient, inspectRepo } from "../core/hf";
import { DEFAULT_ENDPOINT, diskCheck, findGeniex, freeDiskGB, geniexVersion, listInstalled, modelsDir, pullModel, removeModel, Pull } from "../core/geniex";
import { ServerManager } from "../core/server";
import { streamChat } from "../core/chat";
import { friendly } from "../core/errors";
import { VoiceService } from "./voice";
import { SetupService, installGeniex, realGeniexDeps } from "./setup";
import { defaultVoiceModel } from "../core/voiceModels";
import { effectiveHardware, planNpu } from "../core/budget";
import { DEFAULT_VOICE_SETTINGS, voiceModel } from "../core/voiceModels";
import { NPU_UTIL_SCRIPT, buildMeters, parseNpuCounters } from "../core/perf";


const DEFAULT_SETTINGS: Settings = {
  geniexPath: null,
  npuBudgetOverrideGB: null,
  showKQuants: false,
  compute: "npu",
  keepaliveSec: 300,
  selectedModelId: null,
  pinnedGeniexVersion: null,
  voice: { ...DEFAULT_VOICE_SETTINGS }
};

let win: BrowserWindow | null = null;
let server: ServerManager | null = null;
let serverExe: string | null = null;
let serverCompute = "";
let voice: VoiceService | null = null;
let setup: SetupService | null = null;
let hardwareCache: HardwareProfile | null = null;
let rawHardwareCache: RawHardware | null = null;
const pulls = new Map<string, Pull>();
const chats = new Map<string, AbortController>();
const hf = new HfClient((u, i) => fetch(u, i as any) as any);

const userFile = (n: string) => path.join(app.getPath("userData"), n);
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return fallback; }
}
const writeJson = (file: string, v: unknown) => fs.writeFileSync(file, JSON.stringify(v, null, 2));

let settings: Settings = { ...DEFAULT_SETTINGS };
const loadSettings = () => {
  const saved = readJson<Partial<Settings>>(userFile("settings.json"), {});
  settings = { ...DEFAULT_SETTINGS, ...saved, voice: { ...DEFAULT_VOICE_SETTINGS, ...(saved.voice ?? {}) } };
};
const persist = () => writeJson(userFile("settings.json"), settings);
const customModels = (): CatalogEntry[] => readJson<CatalogEntry[]>(userFile("custom-models.json"), []);
const saveCustom = (e: CatalogEntry) => {
  const all = customModels().filter((x) => x.id !== e.id);
  writeJson(userFile("custom-models.json"), [...all, e]);
};
const allEntries = () => [...CATALOG, ...customModels()];

const send = (channel: string, payload: unknown) => win?.webContents.send(channel, payload);

function ps(script: string, timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") return reject(new Error("PowerShell probes only run on Windows"));
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out) =>
      err ? reject(err) : resolve(out)
    );
  });
}

async function hardware(refresh = false): Promise<HardwareProfile> {
  if (hardwareCache && !refresh) return hardwareCache;
  if (!refresh) {
    const saved = readJson<{ raw: RawHardware } | null>(userFile("hardware.json"), null);
    if (saved) rawHardwareCache = saved.raw;
  }
  if (!rawHardwareCache || refresh) {
    try {
      rawHardwareCache = parseRawHardware(await ps(HARDWARE_SCRIPT));
      writeJson(userFile("hardware.json"), { raw: rawHardwareCache });
    } catch {
      // Not Windows, or the probe failed: describe what Node can see; the checks will say no NPU was found.
      rawHardwareCache = rawHardwareCache ?? {
        cpuName: os.cpus()[0]?.model ?? "Unknown CPU",
        totalRamBytes: os.totalmem(),
        npuDevices: [],
        osArch: process.arch === "arm64" ? "ARM64" : process.arch.toUpperCase()
      };
    }
  }
  hardwareCache = buildProfile(rawHardwareCache!, process.arch, settings.npuBudgetOverrideGB);
  return hardwareCache;
}

function exePath(): string | null {
  return findGeniex(settings.geniexPath);
}

async function appInfo(): Promise<AppInfo> {
  const exe = exePath();
  const hw = await hardware();
  const ver = exe ? await geniexVersion(exe) : null;
  let warn: string | null = null;
  if (ver && settings.pinnedGeniexVersion && !ver.includes(settings.pinnedGeniexVersion)) {
    warn = `GenieX is a developer preview. This build was tested with ${settings.pinnedGeniexVersion}, you have ${ver}.`;
  }
  const problems = hardwareProblems(hw);
  if (!exe) problems.push("GenieX is not installed. Open NPU needs the GenieX command line; use Install GenieX in Settings.");
  return { version: app.getVersion(), arch: process.arch, platform: process.platform, geniexPath: exe, geniexVersion: ver, geniexVersionWarning: warn, problems };
}

/** Hardware as the chat model sees it: voice models on the NPU come out of its budget. */
async function chatHardware(): Promise<HardwareProfile> {
  return effectiveHardware(await hardware(), settings.voice, settings.compute);
}

async function catalog(): Promise<CatalogItem[]> {
  const hw = await chatHardware();
  const exe = exePath();
  const installed = exe ? await listInstalled(exe).catch(() => []) : [];
  const names = new Set(installed.map((m) => m.name.toLowerCase()));
  const custom = new Set(customModels().map((c) => c.id));
  const order = { green: 0, amber: 1, red: 2 } as const;
  return allEntries()
    .map((entry) => {
      const r = entryRef(entry);
      return { entry, verdict: scoreEntry(entry, hw), hidden: !!entry.excluded, installed: names.has(r.toLowerCase()) || names.has(entry.repo.toLowerCase()), ref: r, custom: custom.has(entry.id) };
    })
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || order[a.verdict.level] - order[b.verdict.level] || Number(!!b.entry.default) - Number(!!a.entry.default));
}

function getServer(exe: string): ServerManager {
  if (!server || serverExe !== exe || serverCompute !== settings.compute) {
    server?.stop();
    server = new ServerManager({ exe, compute: settings.compute, keepaliveSec: settings.keepaliveSec });
    serverExe = exe;
    serverCompute = settings.compute;
    server.on("status", (s) => send("server", s));
  }
  return server;
}

async function ensureServerFor(entry: CatalogEntry) {
  const exe = exePath();
  if (!exe) throw new Error("GenieX is not installed");
  const hw = await chatHardware();
  const v = scoreEntry(entry, hw);
  if (v.contextTokens === 0 && entry.engine === "llama_cpp") throw new Error(v.reasons[0] ?? "This model does not fit in NPU memory.");
  // Only one model on the NPU: other servers or infer sessions would crash it, so restart rather than add.
  await getServer(exe).start(v.contextTokens || entry.recommendedContext);
  return getServer(exe);
}

async function runChat(id: string, entryId: string, messages: ChatMessage[]) {
  const ac = new AbortController();
  chats.set(id, ac);
  try {
    const entry = allEntries().find((e) => e.id === entryId);
    if (!entry) throw new Error("Pick a model first.");
    const srv = await ensureServerFor(entry);
    for await (const ev of streamChat({ endpoint: srv.endpoint || DEFAULT_ENDPOINT, model: entryRef(entry), messages, sampling: entry.sampling, signal: ac.signal }, id)) {
      send("chat", ev satisfies ChatEvent);
    }
  } catch (e) {
    if (ac.signal.aborted) {
      send("chat", { id, type: "done", stats: { ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0 } } satisfies ChatEvent);
    } else {
      const raw = (e as Error).message;
      const last = server?.status().lastError;
      send("chat", { id, type: "error", error: last ?? friendly(raw) ?? { id: "unknown", title: "Something went wrong", fix: "Try again.", raw } } satisfies ChatEvent);
    }
  } finally {
    chats.delete(id);
  }
}

function registerIpc() {
  const h = ipcMain.handle.bind(ipcMain);
  h("appInfo", appInfo);
  h("hardware", (_e, refresh?: boolean) => hardware(!!refresh));
  h("catalog", catalog);
  h("installed", async () => { const x = exePath(); return x ? listInstalled(x) : []; });
  h("hfSearch", (_e, q: string) => hf.search(q));
  h("hfInspect", async (_e, input: string) => {
    const r = await inspectRepo(hf, input, await hardware(), { showKQuants: settings.showKQuants });
    if (r.entry) saveCustom(r.entry);
    return r;
  });
  h("install", async (_e, entry: CatalogEntry) => {
    const exe = exePath();
    const ref = entryRef(entry);
    const emit = (p: InstallProgress) => send("install", p);
    if (!exe) return emit({ ref, phase: "error", percent: null, error: { id: "no-geniex", title: "GenieX is not installed", fix: "Install GenieX from Settings first.", raw: "" } });
    emit({ ref, phase: "checking", percent: null, line: "Checking disk space" });
    const disk = diskCheck(freeDiskGB(modelsDir()), entry.sizeGB);
    if (disk) return emit({ ref, phase: "error", percent: null, error: disk });
    const p = pullModel(exe, ref, emit);
    pulls.set(ref, p);
    await p.done;
    pulls.delete(ref);
  });
  h("cancelInstall", (_e, ref: string) => { pulls.get(ref)?.cancel(); });
  h("uninstall", async (_e, entry: CatalogEntry) => {
    const exe = exePath();
    if (!exe) return { ok: false, message: "GenieX is not installed" };
    if (server?.status().state === "ready") await server.stop();
    const r = await removeModel(exe, entryRef(entry));
    return { ok: r.ok, message: r.out.trim() };
  });
  h("selectModel", (_e, id: string) => { settings = { ...settings, selectedModelId: id }; persist(); });
  h("server", () => server?.status() ?? { state: "stopped", endpoint: DEFAULT_ENDPOINT, nctx: null, compute: settings.compute, restarts: 0, lastError: null, pid: null });
  h("stopServer", () => server?.stop());
  h("serverLog", () => server?.recentLog() ?? []);
  h("chat", (_e, id: string, modelId: string, messages: ChatMessage[]) => { void runChat(id, modelId, messages); });
  h("abortChat", (_e, id: string) => { chats.get(id)?.abort(); });
  h("settings", () => settings);
  h("saveSettings", (_e, patch: Partial<Settings>) => {
    settings = { ...settings, ...patch };
    persist();
    if ("npuBudgetOverrideGB" in patch) hardwareCache = null; // rebuilt from the saved probe with the new override
    return settings;
  });
  h("pickGeniex", async () => {
    const r = await dialog.showOpenDialog(win!, { title: "Locate geniex.exe", filters: [{ name: "geniex", extensions: ["exe"] }], properties: ["openFile"] });
    if (r.canceled || !r.filePaths[0]) return null;
    settings = { ...settings, geniexPath: r.filePaths[0] };
    persist();
    return r.filePaths[0];
  });
  h("openGeniexDownload", () => { setup!.check(); setup!.retry("geniex"); });
  // ---- voice
  const vs = () => voice!;
  const ensureVoice = async () => { await vs().apply(settings.voice); };
  h("voiceModels", () => vs().models());
  h("voiceStatus", () => vs().status());
  h("voiceDownload", async (_e, id: string) => { await vs().download(id); });
  h("voiceCancelDownload", (_e, id: string) => vs().cancelDownload(id));
  h("voiceRemove", async (_e, id: string) => {
    await vs().remove(id);
    const v = { ...settings.voice };
    if (v.sttModelId === id) v.sttModelId = null;
    if (v.ttsModelId === id) v.ttsModelId = null;
    settings = { ...settings, voice: v };
    persist();
  });
  h("voiceApply", async () => { try { await ensureVoice(); } catch { /* status carries the error */ } return vs().status(); });
  h("transcribe", async (_e, samples: Float32Array, sampleRate: number) => {
    if (!vs().status().stt) await ensureVoice();
    return vs().transcribe(samples, sampleRate);
  });
  h("speak", async (_e, id: string, text: string) => {
    if (!vs().status().tts) await ensureVoice();
    await vs().speak(id, text, settings.voice.ttsSid, settings.voice.ttsSpeed);
  });
  h("cancelSpeak", (_e, id: string) => vs().cancelSpeak(id));
  h("saveVoice", async (_e, patch: Partial<Settings["voice"]>) => {
    const before = settings.voice;
    settings = { ...settings, voice: { ...before, ...patch } };
    persist();
    const reload = ["sttModelId", "ttsModelId", "sttCompute", "ttsCompute", "sttLanguage"].some((k) => k in patch && (patch as any)[k] !== (before as any)[k]);
    if (reload) void ensureVoice().catch(() => undefined);
    return settings;
  });
  h("npuPlan", async () => {
    const hw = await hardware();
    const entry = allEntries().find((e) => e.id === settings.selectedModelId) ?? null;
    const v = entry ? scoreEntry(entry, effectiveHardware(hw, { ...settings.voice, sttCompute: "cpu", ttsCompute: "cpu" }, settings.compute)) : null;
    return planNpu({ hw, chat: entry && v ? { entry, compute: settings.compute, estNpuGB: v.estNpuGB } : null, voice: settings.voice });
  });
  h("setupState", () => setup!.status());
  h("setupSkip", (_e, id) => setup!.skip(id));
  h("setupRetry", (_e, id) => setup!.retry(id));
  h("setupDismiss", () => setup!.dismiss());
  h("meters", async () => {
    const hw = await hardware();
    let npu = { util: null as number | null, memBytes: null as number | null };
    try { npu = parseNpuCounters(await ps(NPU_UTIL_SCRIPT, 4000)); } catch { /* counters missing: shown as n/a */ }
    return buildMeters(os.totalmem(), os.freemem(), hw.npuBudgetGB, npu);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 860, minHeight: 560, title: "Open NPU", backgroundColor: "#0f1115",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

app.whenReady().then(() => {
  loadSettings();
  voice = new VoiceService(
    path.join(app.getPath("userData"), "voice-models"),
    path.join(__dirname, "..", "voice", "worker.js")
  );
  voice.on("status", (st) => send("voiceStatus", st));
  voice.on("download", (p) => send("voiceDownload", p));
  voice.on("audio", (c) => send("voiceAudio", c));
  setup = new SetupService({
    geniexPath: () => exePath(),
    installGeniex: (progress) => installGeniex(realGeniexDeps(), progress),
    onGeniexInstalled: (p) => { settings = { ...settings, geniexPath: p }; persist(); },
    voiceNeeds: () => {
      const stt = voiceModel(settings.voice.sttModelId) ?? defaultVoiceModel("stt");
      const tts = voiceModel(settings.voice.ttsModelId) ?? defaultVoiceModel("tts");
      return { stt: !voice!.isInstalled(stt), tts: !voice!.isInstalled(tts), sttName: stt.name, ttsName: tts.name };
    },
    installVoice: (kind, progress) => new Promise<void>((resolve, reject) => {
      const m = voiceModel(kind === "stt" ? settings.voice.sttModelId : settings.voice.ttsModelId) ?? defaultVoiceModel(kind);
      const on = (p: { id: string; phase: string; percent: number | null; error?: { fix: string; title: string; raw: string } }) => {
        if (p.id !== m.id) return;
        progress(p.percent, p.phase === "extracting" ? "Unpacking…" : `Downloading ${m.name}…`);
        if (p.phase === "done") {
          voice!.off("download", on);
          settings = { ...settings, voice: { ...settings.voice, ...(kind === "stt" ? { sttModelId: m.id } : { ttsModelId: m.id }) } };
          persist();
          void voice!.apply(settings.voice).catch(() => undefined);
          resolve();
        } else if (p.phase === "error" || p.phase === "cancelled") {
          voice!.off("download", on);
          reject(new Error(p.error ? `${p.error.title}. ${p.error.fix} (${p.error.raw})` : "Download cancelled"));
        }
      };
      voice!.on("download", on);
      void voice!.download(m.id);
    })
  });
  setup.on("state", (st) => send("setup", st));
  registerIpc();
  createWindow();
  win!.webContents.once("did-finish-load", () => { if (setup!.check()) void setup!.run(); });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Stop the hidden geniex process with the app: a stray server holds the NPU.
app.on("before-quit", () => { void server?.stop(); void voice?.stop(); for (const p of pulls.values()) p.cancel(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
