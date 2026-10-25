import * as fs from "fs";
import { mappingFailed, serverReason, failureSummary, ladder, type LoadSetting } from "./npuLoad";
export { mappingFailed, serverReason } from "./npuLoad";
import * as os from "os";
import * as path from "path";
import type { CatalogEntry, ChatStats } from "../shared/types";
import type { RunsOn } from "./placement";
import { buildExport } from "./benchExport";
import { CANDIDATE_TAGS } from "./benchCandidates";
import { BENCH_SECTIONS, BenchMode, BenchSection, BenchTarget, BenchTest, ModelResult, TestResult, buildModelReport, buildReport, buildSectionReport, classifyFailure, estimateRun, slug, summarize, testCosts, testsFor } from "./bench";
import { Check } from "./benchChecks";
import { ref as entryRef } from "./catalog";
import { streamChat } from "./chat";
import { cpuBusy, judgePlacement, logPlacement } from "./placement";
import { applyEffort, effectiveEffort, thinkingSupport } from "./effort";

export interface BenchConfig {
  /** Keys of the roster entries to test, in order. */
  keys: string[];
  mode: BenchMode;
  /** Leave the models that were installed for the run installed (by default each one is removed after its tests to make room). */
  keepInstalled: boolean;
  /** Continue the latest run: models that already have a finished result file are skipped. */
  resume: boolean;
  /** Minutes of non-stop writing on the biggest model before the first test, so every model is measured on a NPU that is already warm (0 = none). */
  warmupMin?: number;
}

export type BenchPhase = "idle" | "preparing" | "installing" | "loading" | "warming" | "placing" | "testing" | "removing" | "rechecking" | "done" | "stopped";

/** One second of the run: how hard the machine works, and how fast the model writes. null = not measured (yet). */
export interface BenchSample {
  /** Seconds since the run started. */
  t: number;
  cpu: number | null;
  ramPct: number | null;
  npu: number | null;
  npuMemGB: number | null;
  tokPerSec: number | null;
}

/** What the model in front of the benchmark is saying right now. */
export interface BenchLive {
  model: string;
  testId: string;
  test: string;
  section: BenchSection;
  /** What it was asked (cut). */
  prompt: string;
  answer: string;
  thinking: string;
  tokens: number;
  ttftSec: number | null;
  tokPerSec: number | null;
  elapsedSec: number;
  /** The NPU warm-up, not a test. */
  warmup?: boolean;
  /** The test is over: its score and why. */
  done: boolean;
  score?: number;
  note?: string;
}

/** A finished test of the model being tested, for the strip of coloured cells. */
export interface LiveTestRow {
  id: string;
  title: string;
  section: BenchSection;
  score: number;
  note: string;
  ttftSec: number | null;
  tokPerSec: number | null;
  skipped?: boolean;
  error?: boolean;
}

export interface BenchRow {
  key: string;
  name: string;
  sizeGB: number;
  quality: number | null;
  /** Why the model could not be tested to the end; with a quality, the model was tested in part. */
  skipReason?: string;
  runsOn: RunsOn;
  bySection: Partial<Record<BenchSection, number>>;
  ttftSec: number | null;
  tokPerSec: number | null;
  coldStartSec: number | null;
  ran: number;
  failed: number;
  error?: string;
  /** The model's result file (JSON); the Markdown one sits next to it. */
  file: string;
}

export interface BenchState {
  running: boolean;
  phase: BenchPhase;
  runDir: string | null;
  summaryFile: string | null;
  mode: BenchMode;
  modelIndex: number;
  modelCount: number;
  current: string | null;
  testIndex: number;
  testCount: number;
  currentTest: string | null;
  startedAt: number | null;
  rows: BenchRow[];
  log: string[];
  /** 0 to 100, weighted by how long each model is expected to take. */
  percent: number;
  elapsedSec: number;
  /** null until it can be told. */
  etaSec: number | null;
  /** The last few minutes, one sample a second. */
  series: BenchSample[];
  /** The tests of the model being tested so far. */
  currentTests: LiveTestRow[];
  currentSizeGB: number | null;
  /** Seconds of warm-up left, null when not warming. */
  warmupLeftSec: number | null;
  /** When the current step began (ms since the epoch), so the window can say how long it has lasted. */
  phaseStartedAt: number | null;
  /** The NPU warm-up is still to come. */
  warmupPending: boolean;
}

export interface BenchDeps {
  /** Where runs are written: one folder per run. */
  root: string;
  machine?: string;
  /** The catalog entry of a roster model (found, or looked up on Hugging Face). */
  resolve(t: BenchTarget): Promise<CatalogEntry>;
  isInstalled(e: CatalogEntry): Promise<boolean>;
  install(e: CatalogEntry): Promise<{ ok: boolean; error?: string }>;
  cancelInstall(e: CatalogEntry): void;
  uninstall(e: CatalogEntry): Promise<{ ok: boolean; message: string }>;
  /** A model that stays installed after the run must be known to the app. */
  keep(e: CatalogEntry, t: BenchTarget): void;
  /** Starts (or reuses) the model server for this model and says where it is and how big its window is. */
  start(e: CatalogEntry, setting?: LoadSetting): Promise<{ endpoint: string; nctx: number }>;
  /** A model that only loaded under this setting: kept, so the app starts it that way. */
  remember?(e: CatalogEntry, setting: LoadSetting): void;
  stopServer(): Promise<void>;
  freeDiskGB(): number | null;
  /** One reading of the NPU counters (of the model server's process when they name processes, else of the whole NPU). */
  probe(): Promise<{ util: number | null; memGB: number | null }>;
  /** The latest lines of the model server's log. */
  serverLog(): string[];
  /** What the server is started with: the benchmark measures that. */
  compute(): "npu" | "cpu";
  /** CPU times per core, as os.cpus() gives them (replaced in tests: the real load of a busy machine is not a fixture). */
  cpus?: () => { times: Record<string, number> }[];
  emit(s: BenchState): void;
  /** The words a model writes, as it writes them (not kept in the state: it changes ten times a second). */
  emitLive?(l: BenchLive): void;
  /** Chip, memory, NPU driver, Windows, GenieX and app versions, for the exported report. */
  machineInfo?(): Promise<[string, string][]>;
  /** One line on what the app expects of this model on this PC (memory needed against the NPU budget, window, format), for the log. */
  describe?(e: CatalogEntry): Promise<string>;
  /** How long one model may take before it is given up on, by test set (ms). Default: express 10, quick 35, full 80 minutes. */
  modelBudgetMs?: number;
  /** A model that writes slower than this (tokens/s, median of its first tests) is given up on. Default 1.2. */
  minTokPerSec?: number;
  /** Milliseconds between samples of the machine (1000; shorter in tests). */
  monitorMs?: number;
  /** Memory of the PC, as os.totalmem() and os.freemem() give it. */
  ram?: () => { total: number; free: number };
  fetchFn?: typeof fetch;
  now?: () => number;
  /** Time the NPU is given to let go of a model that failed to load, before one more try and before the next model (ms; 8000, shorter in tests). */
  loadRetryMs?: number;
  /** Time allowed for one test. */
  testTimeoutMs?: number;
}

const THINK_ROOM = 1800;
/** Express answers are cut short, and a model that must think gets less room for it. */
const EXPRESS_ANSWER = 160;
const EXPRESS_THINK_ROOM = 700;

/** How the tests are asked of a model: thinking off where it can be, on for the tests that need it. */
export function effortFor(test: BenchTest, entry: CatalogEntry) {
  const support = thinkingSupport(entry);
  const want = test.think ? ("medium" as const) : ("off" as const);
  return { support, level: effectiveEffort(want, support) };
}

const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;

export class BenchRunner {
  private st: BenchState = BenchRunner.idle();
  private ac: AbortController | null = null;
  private entry: CatalogEntry | null = null;
  /** Expected minutes of each model of this run, from its size: the weights of the progress. */
  private weights: number[] = [];
  private monitor: ReturnType<typeof setInterval> | null = null;
  private lastNpu: { util: number | null; memGB: number | null } = { util: null, memGB: null };
  private probing = false;
  private placing = false;
  private liveTps: number | null = null;
  private lastCpu: { times: Record<string, number> }[] | null = null;
  private warmDone = false;
  private warmTotal = 0;
  private runStartedAt = 0;
  private warmSeries: { t: number; tps: number | null }[] = [];
  private refStartTps: number | null = null;
  /** The model that warmed the NPU up: kept until the end so its speed can be measured again. */
  private ref: { target: BenchTarget; entry: CatalogEntry; installedByUs: boolean; keep: boolean } | null = null;

  constructor(private d: BenchDeps) {}

  static idle(): BenchState {
    return { running: false, phase: "idle", runDir: null, summaryFile: null, mode: "quick", modelIndex: 0, modelCount: 0, current: null, testIndex: 0, testCount: 0, currentTest: null, startedAt: null, rows: [], log: [], percent: 0, elapsedSec: 0, etaSec: null, series: [], currentTests: [], currentSizeGB: null, warmupLeftSec: null, phaseStartedAt: null, warmupPending: false };
  }

  state(): BenchState { return this.st; }
  get running() { return this.st.running; }

  private set(p: Partial<BenchState>) {
    this.st = { ...this.st, ...p, ...(p.phase && p.phase !== this.st.phase ? { phaseStartedAt: Date.now() } : {}) };
    this.st = { ...this.st, ...this.progress(this.st) };
    this.d.emit(this.st);
  }

  /** Percent done, time on the clock and time left. The time left is the time so far scaled by what remains, and the sizes before there is anything to scale. */
  private progress(st: BenchState): Pick<BenchState, "percent" | "elapsedSec" | "etaSec"> {
    const elapsedSec = st.startedAt ? Math.round((Date.now() - st.startedAt) / 1000) : 0;
    if (!st.running) return { percent: st.phase === "done" ? 100 : st.percent, elapsedSec: st.running ? elapsedSec : st.elapsedSec, etaSec: null };
    const w = this.weights;
    const total = w.reduce((a, b) => a + b, 0) || 1;
    const done = w.slice(0, Math.max(0, st.modelIndex - 1)).reduce((a, b) => a + b, 0);
    const cur = w[st.modelIndex - 1] ?? 0;
    const inTests = st.testCount ? Math.min(1, st.testIndex / st.testCount) : 0;
    const frac = st.phase === "installing" ? 0.05 : st.phase === "loading" ? 0.1 : st.phase === "warming" ? 0.12 + 0.4 * (this.warmTotal ? 1 - (st.warmupLeftSec ?? 0) / this.warmTotal : 0) : st.phase === "placing" ? 0.55 : st.phase === "testing" ? 0.3 + 0.68 * inTests : st.phase === "removing" ? 0.99 : 0;
    const p = Math.min(0.999, (done + cur * frac) / total);
    const left = p >= 0.02 && elapsedSec >= 20 ? (elapsedSec * (1 - p)) / p : total * 60 * (1 - p);
    return { percent: Math.round(p * 1000) / 10, elapsedSec, etaSec: Math.round(left) };
  }
  private log(line: string) {
    this.set({ log: [...this.st.log, `${new Date().toLocaleTimeString()}  ${line}`].slice(-500) });
  }

  stop() {
    if (!this.st.running) return;
    this.ac?.abort();
    if (this.entry) this.d.cancelInstall(this.entry);
    this.log("Stopping…");
  }

  /** Starts the loop in the background; the state follows through `emit`. */
  start(cfg: BenchConfig, roster: BenchTarget[]): void {
    if (this.st.running) return;
    const targets = cfg.keys.flatMap((k) => roster.find((t) => t.key === k) ?? []);
    if (!targets.length) return;
    fs.mkdirSync(this.d.root, { recursive: true });
    const runDir = (cfg.resume && this.latestRun()) || path.join(this.d.root, stamp());
    fs.mkdirSync(runDir, { recursive: true });
    this.ac = new AbortController();
    this.st = { ...BenchRunner.idle(), running: true, phase: "preparing", runDir, summaryFile: path.join(runDir, "summary.md"), mode: cfg.mode, modelCount: targets.length, startedAt: Date.now(), rows: this.rowsOf(runDir), phaseStartedAt: Date.now(), warmupPending: (cfg.warmupMin ?? 0) > 0 };
    void this.d.machineInfo?.().then((m) => {
      fs.writeFileSync(path.join(runDir, "machine.json"), JSON.stringify(m));
      this.log(`Machine: ${m.map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    }).catch(() => undefined);
    this.warmDone = false; this.warmTotal = 0; this.warmSeries = []; this.refStartTps = null; this.ref = null;
    this.runStartedAt = Date.now();
    // the biggest model warms the NPU up, so it goes first and its warm-up is followed by its own tests on the same install
    // among the models known to run here (the packs, the catalog) the biggest warms up; an untried architecture is not trusted with it
    const known = (t: BenchTarget) => (t.source.startsWith("Dynamic") || t.source === "Catalog" ? 1 : 0);
    if ((cfg.warmupMin ?? 0) > 0) targets.sort((a, b) => known(b) - known(a) || b.sizeGB - a.sizeGB);
    this.weights = targets.map((t) => Math.max(0.1, estimateRun([{ sizeGB: t.sizeGB }], cfg.mode, testCosts(cfg.mode)).totalMin));
    if ((cfg.warmupMin ?? 0) > 0 && this.weights.length) this.weights[0] += cfg.warmupMin!;
    this.startMonitor();
    this.set({});
    void this.loop(cfg, targets, runDir).catch((e) => this.log(`Stopped by an error: ${(e as Error).message}`)).finally(() => {
      this.entry = null;
      this.stopMonitor();
      this.set({ running: false, phase: this.ac?.signal.aborted ? "stopped" : "done", current: null, currentTest: null });
    });
  }

  /** One sample a second of the CPU, the RAM, the NPU and the writing speed, kept for the graphs. The NPU counters take a second or two to read, so they are read every third sample, and not while the placement check reads them itself. */
  private startMonitor() {
    const cpus = this.d.cpus ?? os.cpus;
    this.lastCpu = cpus();
    this.lastNpu = { util: null, memGB: null };
    let n = 0;
    const t0 = Date.now();
    this.monitor = setInterval(() => {
      n++;
      const now = cpus();
      const cpu = this.lastCpu ? cpuBusy(this.lastCpu, now) : null;
      this.lastCpu = now;
      const ram = (this.d.ram ?? (() => ({ total: os.totalmem(), free: os.freemem() })))();
      if (n % 3 === 1 && !this.probing && !this.placing && this.st.phase !== "installing") {
        this.probing = true;
        this.d.probe().then((x) => { this.lastNpu = x; }).catch(() => undefined).finally(() => { this.probing = false; });
      }
      const sample: BenchSample = {
        t: Math.round((Date.now() - t0) / 100) / 10, cpu, ramPct: ram.total ? Math.round(((ram.total - ram.free) / ram.total) * 1000) / 10 : null,
        npu: this.lastNpu.util, npuMemGB: this.lastNpu.memGB, tokPerSec: this.liveTps
      };
      this.set({ series: [...this.st.series, sample].slice(-180) });
    }, this.d.monitorMs ?? 1000);
  }
  private stopMonitor() {
    if (this.monitor) clearInterval(this.monitor);
    this.monitor = null;
    this.liveTps = null;
  }

  /** The models of this run that are finished, as written to their files. */
  results(): ModelResult[] {
    const dir = this.st.runDir ?? this.latestRun();
    return dir ? this.readResults(dir).filter((r) => r.finishedAt && r.summary.ran > 0) : [];
  }

  /** Keys of the models tested to the end in any past run: the window leaves them unticked, so they are not run again for nothing. */
  testedKeys(): Set<string> {
    const done = new Set<string>();
    try {
      for (const e of fs.readdirSync(this.d.root, { withFileTypes: true })) {
        if (e.isDirectory()) for (const r of this.readResults(path.join(this.d.root, e.name))) if (r.finishedAt && r.summary?.ran > 0 && !r.error) done.add(r.key);
      }
    } catch { /* no run yet */ }
    return done;
  }

  private latestRun(): string | null {
    try {
      const names = fs.readdirSync(this.d.root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
      return names.length ? path.join(this.d.root, names[names.length - 1]) : null;
    } catch { return null; }
  }

  private readResults(runDir: string): ModelResult[] {
    try {
      return fs.readdirSync(runDir).filter((f) => f.endsWith(".json") && f !== "summary.json")
        .flatMap((f) => { try { return [JSON.parse(fs.readFileSync(path.join(runDir, f), "utf8")) as ModelResult]; } catch { return []; } });
    } catch { return []; }
  }

  private rowsOf(runDir: string): BenchRow[] {
    return this.readResults(runDir).filter((r) => r.finishedAt).map((r) => this.row(r, path.join(runDir, `${slug(r.key)}.json`)));
  }

  private row(r: ModelResult, file: string): BenchRow {
    return { key: r.key, name: r.name, sizeGB: r.sizeGB, quality: r.summary.quality, skipReason: r.error && !/^stopped/.test(r.error) ? r.skipReason : undefined, runsOn: r.placement?.runsOn ?? "unknown", bySection: r.summary.bySection, ttftSec: r.summary.ttftSec, tokPerSec: r.summary.tokPerSec, coldStartSec: r.coldStartSec, ran: r.summary.ran, failed: r.summary.failed, error: r.error, file };
  }

  private writeModel(runDir: string, r: ModelResult): string {
    const base = path.join(runDir, slug(r.key));
    r.summary = summarize(r.tests);
    fs.writeFileSync(`${base}.json`, JSON.stringify(r, null, 2));
    fs.writeFileSync(`${base}.md`, buildModelReport(r));
    return `${base}.json`;
  }

  private writeSummary(runDir: string, cfg: BenchConfig, startedAt: string) {
    const all = this.readResults(runDir).filter((r) => r.finishedAt);
    fs.writeFileSync(path.join(runDir, "summary.md"), buildReport(all, { startedAt, mode: cfg.mode, machine: this.d.machine }));
    const sections = path.join(runDir, "sections");
    fs.mkdirSync(sections, { recursive: true });
    for (const sec of BENCH_SECTIONS) {
      if (all.some((r) => r.summary.bySection[sec.id] !== undefined)) fs.writeFileSync(path.join(sections, `${sec.id}.md`), buildSectionReport(sec.id, all));
    }
    fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(all.map((r) => ({ key: r.key, name: r.name, sizeGB: r.sizeGB, ref: r.ref, ...r.summary, coldStartSec: r.coldStartSec, installSec: r.installSec, npuMemGB: r.npuMemGB })), null, 2));
  }

  /** A line for the log, from outside the run (what GenieX answers to --help, for instance). */
  note(line: string) { this.log(line); }

  /** After a server was stopped the NPU can keep memory for a while (2 to 3 GB were seen after a failed load): the next load starts on a NPU that is free, up to 30 s. */
  private async waitNpuFree(signal: AbortSignal) {
    if (this.d.loadRetryMs === 0) return;
    const t0 = Date.now();
    let mem: number | null = null;
    while (!signal.aborted && Date.now() - t0 < 30_000) {
      mem = (await this.d.probe().catch(() => ({ util: null, memGB: null }))).memGB;
      if (mem === null || mem < 0.5) break;
      await this.pause(1000, signal);
    }
    if (mem !== null && mem >= 0.5) this.log(`  the NPU still holds ${mem} GB after 30 s.`);
    else if (Date.now() - t0 > 2500) this.log(`  the NPU was free again after ${Math.round((Date.now() - t0) / 1000)} s.`);
  }

  private pause(ms: number, signal: AbortSignal) {
    return new Promise<void>((res) => { const t = setTimeout(res, ms); signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true }); });
  }

  private async loop(cfg: BenchConfig, targets: BenchTarget[], runDir: string) {
    const startedAt = new Date().toLocaleString();
    const signal = this.ac!.signal;
    let i = 0;
    for (const t of targets) {
      i++;
      if (signal.aborted) break;
      const file = path.join(runDir, `${slug(t.key)}.json`);
      if (cfg.resume && this.readResults(runDir).some((r) => r.key === t.key && r.finishedAt)) { this.log(`${t.name}: already tested in this run, skipped`); continue; }
      this.set({ modelIndex: i, current: t.name, testIndex: 0, currentTest: null, phase: "preparing", currentTests: [], currentSizeGB: t.sizeGB });
      this.log(`— ${t.name} (${t.sizeGB.toFixed(1)} GB): looking it up…`);
      const result = await this.model(cfg, t, runDir).catch((e): ModelResult => this.failed(t, cfg, (e as Error).message));
      const written = this.writeModel(runDir, result);
      this.set({ rows: [...this.st.rows.filter((r) => r.key !== t.key), this.row(result, written)] });
      this.writeSummary(runDir, cfg, startedAt);
      this.log(`${t.name}: quality ${result.summary.quality === null ? "–" : result.summary.quality.toFixed(0)}/100${result.error ? `, ${result.error}` : ""}`);
    }
    this.writeSummary(runDir, cfg, startedAt);
    await this.finishReference(cfg, runDir, signal.aborted);
    if (!signal.aborted) await this.exportReport(runDir).catch(() => undefined);
  }

  /**
   * Writes the report to publish into `<run>/publish`: the Markdown and the HTML versions, the charts as SVG, a CSV of every figure,
   * the statistics, and a copy of every model's and every section's file with the raw answers. Works on a run that is not finished.
   */
  async exportReport(runDir?: string | null): Promise<{ dir: string; report: string; html: string } | null> {
    const dir = runDir ?? this.st.runDir ?? this.latestRun();
    if (!dir) return null;
    const results = this.readResults(dir).filter((r) => r.finishedAt);
    if (!results.some((r) => r.summary.ran > 0)) return null;
    let machine: [string, string][] = [];
    try { machine = JSON.parse(fs.readFileSync(path.join(dir, "machine.json"), "utf8")); } catch { /* not recorded */ }
    const mode = results[0].mode;
    const out = path.join(dir, "publish");
    fs.mkdirSync(path.join(out, "charts"), { recursive: true });
    let warmup = null;
    try { warmup = JSON.parse(fs.readFileSync(path.join(dir, "warmup.json"), "utf8")); } catch { /* no warm-up in this run */ }
    const files = buildExport(results, { startedAt: path.basename(dir).replace("_", " "), mode, machine, tags: CANDIDATE_TAGS, warmup });
    for (const [rel, text] of Object.entries(files)) fs.writeFileSync(path.join(out, rel), text);
    for (const sub of ["models", "sections"]) fs.mkdirSync(path.join(out, sub), { recursive: true });
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".md") && f !== "summary.md") fs.copyFileSync(path.join(dir, f), path.join(out, "models", f));
    try { for (const f of fs.readdirSync(path.join(dir, "sections"))) fs.copyFileSync(path.join(dir, "sections", f), path.join(out, "sections", f)); } catch { /* none */ }
    return { dir: out, report: path.join(out, "report.md"), html: path.join(out, "report.html") };
  }

  private failed(t: BenchTarget, cfg: BenchConfig, error: string): ModelResult {
    return { key: t.key, name: t.name, ref: t.bundleRef ?? t.repo, sizeGB: t.sizeGB, paramsB: t.paramsB, source: t.source, thinking: "none", mode: cfg.mode, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), wasInstalled: false, installSec: null, coldStartSec: null, npuMemGB: null, tests: [], summary: summarize([]), error };
  }

  /** One model: install if needed, load, run the tests, remove. The removal happens whatever went wrong. */
  private async model(cfg: BenchConfig, t: BenchTarget, runDir: string): Promise<ModelResult> {
    const now = this.d.now ?? (() => performance.now());
    const signal = this.ac!.signal;
    let entry = await this.d.resolve(t);
    this.entry = entry;
    const r: ModelResult = { ...this.failed(t, cfg, ""), ref: entryRef(entry), thinking: thinkingSupport(entry), finishedAt: null };
    delete r.error;
    r.wasInstalled = await this.d.isInstalled(entry);
    this.log(r.wasInstalled ? `${t.name} is already installed: no download.` : `${t.name} is not installed: downloading ${t.sizeGB.toFixed(1)} GB.`);
    const modelStart = Date.now();
    const budgetMs = (this.d.modelBudgetMs ?? { express: 10, quick: 35, full: 80 }[cfg.mode] * 60_000) + (!this.warmDone ? (cfg.warmupMin ?? 0) * 60_000 : 0);
    try {
      // A model that will not install or load from one provider often does from another (same file, other quantiser): try each in turn.
      const repos = [t.repo, ...(t.altRepos ?? []).filter((x) => x !== t.repo)];
      let laddered = false;
      let srv!: { endpoint: string; nctx: number };
      let baseline!: { util: number | null; memGB: number | null };
      let t1 = 0;
      for (let attempt = 0; ; attempt++) {
        try {
          if (attempt > 0) {
            entry = await this.d.resolve({ ...t, repo: repos[attempt], entryId: undefined });
            this.entry = entry;
            r.ref = entryRef(entry);
            r.wasInstalled = await this.d.isInstalled(entry);
            this.log(`Trying ${t.name} from ${repos[attempt]} (provider ${attempt + 1} of ${repos.length}).`);
          }
          r.repo = repos[attempt];
          r.triedRepos = repos.slice(0, attempt + 1);
          if (!r.wasInstalled) {
            const free = this.d.freeDiskGB();
            if (free !== null && free < entry.sizeGB * 1.15) throw new Error(`not enough disk space (${free.toFixed(1)} GB free, ${(entry.sizeGB * 1.15).toFixed(1)} GB needed)`);
            this.set({ phase: "installing" });
            this.log(`Installing ${t.name}…`);
            const t0 = now();
            const ins = await this.d.install(entry);
            if (signal.aborted) throw new Error("stopped");
            if (!ins.ok) throw new Error(`install failed: ${ins.error ?? "unknown"}`);
            r.installSec = Math.round((now() - t0) / 100) / 10;
            this.log(`${t.name} downloaded in ${Math.round(r.installSec)} s.`);
          }
          this.set({ phase: "loading" });
          this.log(`Loading ${t.name} onto the ${this.d.compute().toUpperCase()}: a big model can take a minute or two.`);
          const plan = await this.d.describe?.(entry).catch(() => "");
          if (plan) this.log(`  plan: ${plan}`);
          baseline = await this.d.probe().catch(() => ({ util: null, memGB: null })); // before this model is on the NPU
          t1 = now();
          const load = async (setting?: LoadSetting) => {
            const s = await this.within(this.d.start(entry, setting), 180_000, "the model server did not start in 3 minutes");
            await this.ask(entry, s.endpoint, [{ role: "user", content: "Say OK." }], 12, null, signal, 240_000);
            return s;
          };
          try { srv = await load(); } catch (e) {
            if (!signal.aborted && !laddered && mappingFailed(this.d.serverLog())) {
              // the NPU could not map the memory of the model and its window: the provider is not the problem. The settings that cost the model
              // least are tried first, and the first that works is kept, so the app starts this model that way from now on.
              laddered = true;
              let last: unknown = e;
              for (const setting of ladder()) {
                this.log(`${t.name}: the NPU could not map its memory (fastrpc_mmap). Trying: ${setting.label}${setting.env ? ` [${Object.entries(setting.env).map(([k, v]) => `${k}=${v}`).join(" ")}]` : ""}.`);
                await this.d.stopServer().catch(() => undefined);
                await this.waitNpuFree(signal);
                await this.pause(this.d.loadRetryMs ?? 8000, signal);
                try {
                  srv = await load(setting); last = null;
                  r.loadSetting = setting.label;
                  this.log(`${t.name} loaded with: ${setting.label} (window ${srv.nctx} tokens). The app will start it that way.`);
                  this.d.remember?.(entry, setting);
                  break;
                } catch (e2) {
                  last = e2;
                  this.log(`  failed: ${failureSummary((e2 as Error).message, this.d.serverLog())}`);
                  if (signal.aborted) break;
                }
              }
              if (last) throw last;
            } else {
            // on the last provider (the others are tried first), the NPU may still hold the memory of a model that was just taken off it: give it a moment, then try once more
            if (signal.aborted || attempt < repos.length - 1 || !/loading failed|-100201|SDKError/i.test((e as Error).message)) throw e;
            this.log(`${t.name} did not load (${(e as Error).message.slice(0, 100)}): the NPU is given a few seconds, then one more try.`);
            await this.d.stopServer().catch(() => undefined);
            await this.pause(this.d.loadRetryMs ?? 8000, signal);
            srv = await load();
            }
          }
          r.coldStartSec = Math.round((now() - t1) / 100) / 10;
          break;
        } catch (e) {
          const msg = (e as Error).message;
          const more = attempt < repos.length - 1 && !signal.aborted && /^(download failed|did not load)$/.test(classifyFailure(msg));
          if (!more) throw e;
          this.log(`${t.name} from ${repos[attempt]} failed (${msg.slice(0, 120)}): trying the next provider.`);
          await this.d.stopServer().catch(() => undefined);
          if (!r.wasInstalled) await this.d.uninstall(entry).catch(() => undefined);
        }
      }
      this.log(`${t.name} answered after ${r.coldStartSec} s.`);
      const loaded = await this.d.probe().catch(() => ({ util: null, memGB: null }));
      r.npuMemGB = loaded.memGB;
      if (loaded.memGB !== null && baseline.memGB !== null) {
        const used = Math.round((loaded.memGB - baseline.memGB) * 100) / 100;
        this.log(`  NPU memory: grew by ${used} GB for a ${entry.sizeGB.toFixed(1)} GB file${entry.sizeGB > 0 ? ` (${(used / entry.sizeGB).toFixed(1)}x)` : ""}, window ${srv.nctx} tokens.`);
      }
      if ((cfg.warmupMin ?? 0) > 0 && !this.warmDone) {
        this.ref = { target: t, entry, installedByUs: !r.wasInstalled, keep: cfg.keepInstalled };
        await this.warmup(entry, srv.endpoint, cfg.warmupMin!, t, runDir, signal);
      }
      this.set({ phase: "placing" });
      this.log("Checking whether it runs on the NPU or the CPU…");
      r.placement = await this.place(entry, srv.endpoint, baseline.memGB, loaded.memGB, signal, cfg.mode === "express");
      this.log(`${t.name}: runs on ${r.placement.runsOn.toUpperCase()} (${r.placement.evidence.join("; ")})`);

      r.runOffsetMin = Math.round((Date.now() - this.runStartedAt) / 600) / 100;
      const tests = testsFor(cfg.mode);
      this.set({ phase: "testing", testCount: tests.length });
      let streak = 0;
      let k = 0;
      for (const test of tests) {
        if (signal.aborted) throw new Error("stopped");
        if (Date.now() - modelStart > budgetMs) throw new Error(`time budget of ${Math.round(budgetMs / 60000)} minutes reached after ${r.tests.length} of ${tests.length} tests`);
        this.set({ testIndex: ++k, currentTest: test.title });
        const res = test.minContext && srv.nctx < test.minContext
          ? this.skipped(test, `window too small (${srv.nctx} tokens, needs ${test.minContext})`)
          : await this.test(entry, srv, test, signal, cfg.mode === "express");
        r.tests.push(res);
        this.set({ currentTests: [...this.st.currentTests, { id: res.id, title: res.title, section: res.section, score: res.score, note: res.skipped ?? res.error ?? res.note, ttftSec: res.ttftSec, tokPerSec: res.tokPerSec, skipped: !!res.skipped, error: !!res.error }] });
        if (res.error) streak++; else streak = 0;
        if (streak >= 3) throw new Error(`three tests in a row failed: ${res.error}`);
        const speeds = r.tests.map((x) => x.tokPerSec).filter((x): x is number => !!x && x > 0).sort((a, b) => a - b);
        if (speeds.length >= 2 && speeds[Math.floor(speeds.length / 2)] < (this.d.minTokPerSec ?? 1.2)) throw new Error(`too slow: about ${speeds[Math.floor(speeds.length / 2)]} tokens per second, a full run would take hours`);
        if (res.error) await this.d.start(entry).then((s) => { srv.endpoint = s.endpoint; srv.nctx = s.nctx; }).catch(() => undefined); // the server may have died
        this.writeModel(runDir, r); // partial results survive a crash
      }
      if (!r.tests.some((x) => !x.skipped)) throw new Error("no test could run");
    } catch (e) {
      const msg = (e as Error).message;
      r.error = signal.aborted ? "stopped before the end" : msg;
      if (!signal.aborted) { r.skipReason = classifyFailure(msg); this.log(`${t.name} is ${r.tests.some((x) => !x.skipped) ? "tested in part" : "skipped"}: ${r.skipReason}. ${msg.slice(0, 160)}`);
        // the error code is only a wrapper: the reason is in the lines the server wrote just before it
        if (r.skipReason === "did not load" || r.skipReason === "failed") {
          this.log(`  full error: ${msg}`);
          const now2 = await this.d.probe().catch(() => ({ util: null, memGB: null }));
          this.log(`  at the failure: NPU memory in use ${now2.memGB ?? "unknown"} GB, ${entry.sizeGB.toFixed(1)} GB file, provider ${r.repo ?? t.repo}${r.triedRepos && r.triedRepos.length > 1 ? ` (tried: ${r.triedRepos.join(", ")})` : ""}.`);
          const reason = serverReason(this.d.serverLog());
          const key = reason.filter((l) => /\b(ERR|WRN)\b|panic|fatal|error|failed/i.test(l) && !/\[GIN\]/.test(l)).slice(-4);
          if (key.length) this.log(`  cause: ${key.map((l) => l.replace(/^.*?\[ML\]\s*(\[[^\]]*\]\s*)*/, "").slice(0, 200)).join(" | ")}`);
          for (const l of reason) this.log(`  server: ${l.slice(0, 300)}`);
        }
      }
    } finally {
      r.finishedAt = signal.aborted && r.tests.length === 0 ? null : new Date().toISOString();
      await this.d.stopServer().catch(() => undefined);
      await this.waitNpuFree(signal);
      if (!r.wasInstalled && this.ref?.target.key === t.key && !cfg.keepInstalled && !signal.aborted) {
        // kept until the end of the run: its speed is measured again then, to see whether the NPU slowed down
      } else if (!r.wasInstalled) {
        if (cfg.keepInstalled && r.installSec !== null && !r.error?.startsWith("install failed")) this.d.keep(entry, t);
        else {
          this.set({ phase: "removing" });
          this.log(`Removing ${t.name} to free the space…`);
          const u = await this.d.uninstall(entry).catch((e) => ({ ok: false, message: (e as Error).message }));
          if (!u.ok) this.log(`Could not remove ${t.name}: ${u.message}`);
        }
      }
    }
    return r;
  }

  /**
   * Keeps the NPU busy, writing without a pause, for `minutes`, on the biggest model of the run, so the first model measured is not
   * measured on a cold chip while the last is measured on a tired one. Windows gives no temperature for the NPU (Task Manager shows N/D),
   * so the effect is read in the speed: it is sampled through the warm-up, and again with the same short request just after it and at the end of the run.
   */
  private async warmup(entry: CatalogEntry, endpoint: string, minutes: number, t: BenchTarget, runDir: string, signal: AbortSignal) {
    const total = Math.max(1, Math.round(minutes * 60));
    this.warmTotal = total;
    const end = Date.now() + total * 1000;
    const topics = ["the history of the lighthouse", "how bread is made, step by step", "the future of public transport in cities", "a day in the life of a market trader", "how the human heart works", "the rules and the history of chess", "a long travel diary through the Alps", "how electricity reaches a house"];
    this.set({ phase: "warming", warmupLeftSec: total });
    this.log(`Warming the NPU up for ${minutes} minute${minutes === 1 ? "" : "s"} on ${t.name}: it writes without stopping.`);
    this.warmSeries = [];
    let lastSet = 0, failures = 0, i = 0;
    while (Date.now() < end && !signal.aborted && failures < 3) {
      const live: BenchLive = { model: entry.name, testId: "warmup", test: "Warming up the NPU", section: "chat", prompt: `An essay about ${topics[i % topics.length]}, to keep the NPU busy.`, answer: "", thinking: "", tokens: 0, ttftSec: null, tokPerSec: null, elapsedSec: 0, done: false, warmup: true };
      const t0 = performance.now();
      let lastEmit = 0;
      try {
        const out = await this.ask(entry, endpoint, [{ role: "user", content: `Write a very long, detailed, flowing essay about ${topics[i++ % topics.length]}. Keep writing, do not summarise and do not stop early.` }], 1200, effectiveEffort("off", thinkingSupport(entry)), signal, Math.max(3000, end - Date.now() + 2000), (kind, text, st) => {
          if (kind === "answer") live.answer = (live.answer + text).slice(-4000); else live.thinking = (live.thinking + text).slice(-1500);
          live.tokens = st.chunks; live.ttftSec = st.ttftSec; live.tokPerSec = st.tps; this.liveTps = st.tps;
          const now = performance.now();
          live.elapsedSec = Math.round((now - t0) / 100) / 10;
          if (now - lastEmit > 120) { lastEmit = now; this.d.emitLive?.({ ...live }); }
          if (now - lastSet > 900) { lastSet = now; this.set({ warmupLeftSec: Math.max(0, Math.ceil((end - Date.now()) / 1000)) }); }
        });
        failures = 0;
        this.warmSeries.push({ t: Math.round(((Date.now() - (end - total * 1000)) / 60000) * 10) / 10, tps: out.stats?.tokPerSec ?? null });
      } catch (e) {
        const m = (e as Error).message;
        if (m === "stopped") throw e;
        if (m.startsWith("no answer after")) break; // the time is up in the middle of an essay
        failures++;
      }
      this.liveTps = null;
    }
    this.liveTps = null;
    this.set({ warmupLeftSec: null });
    if (signal.aborted) throw new Error("stopped");
    if (!this.warmSeries.length && Date.now() < end - 2000) {
      // it could not write: this model is skipped and the next one will try to warm the NPU up
      this.ref = null;
      throw new Error("did not answer during the warm-up");
    }
    this.warmDone = true;
    this.set({ warmupPending: false });
    this.refStartTps = await this.speedProbe(entry, endpoint, signal);
    this.log(`Warm-up over. Reference speed right after it: ${this.refStartTps === null ? "not measured" : `${this.refStartTps} tokens/s`}.`);
    this.writeWarmup(runDir, { minutes, model: t.name, series: this.warmSeries, startTps: this.refStartTps, endTps: null });
  }

  /** A promise that gives up after `ms`: a server that never comes up must not hold the run. */
  private within<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([p, new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(msg)), ms); })]).finally(() => clearTimeout(timer));
  }

  /** The same short request every time: how fast the model writes right now. */
  private async speedProbe(entry: CatalogEntry, endpoint: string, signal: AbortSignal): Promise<number | null> {
    try {
      const r = await this.ask(entry, endpoint, [{ role: "user", content: "Write the numbers from 1 to 120 separated by commas, and nothing else." }], 200, effectiveEffort("off", thinkingSupport(entry)), signal, 90_000);
      return r.stats?.tokPerSec ?? null;
    } catch (e) {
      if ((e as Error).message === "stopped") throw e;
      return null;
    }
  }

  private writeWarmup(runDir: string, w: { minutes: number; model: string; series: { t: number; tps: number | null }[]; startTps: number | null; endTps: number | null }) {
    try { fs.writeFileSync(path.join(runDir, "warmup.json"), JSON.stringify(w, null, 2)); } catch { /* not kept */ }
  }

  /** At the end of the run: the warm-up model writes the same short text again, to show whether the NPU slowed down, and is removed if it was only there for the run. */
  private async finishReference(cfg: BenchConfig, runDir: string, aborted: boolean) {
    const ref = this.ref;
    if (!ref) return;
    this.ref = null;
    try {
      if (!aborted && this.refStartTps !== null) {
        this.set({ phase: "rechecking", current: ref.target.name, currentTest: "Same speed test as after the warm-up", testIndex: 0, testCount: 0 });
        this.log(`Measuring ${ref.target.name} again to see whether the NPU slowed down during the run…`);
        const srv = await this.d.start(ref.entry);
        const endTps = await this.speedProbe(ref.entry, srv.endpoint, this.ac!.signal);
        let w: { minutes: number; model: string; series: { t: number; tps: number | null }[]; startTps: number | null; endTps: number | null } | null = null;
        try { w = JSON.parse(fs.readFileSync(path.join(runDir, "warmup.json"), "utf8")); } catch { /* none */ }
        if (w) this.writeWarmup(runDir, { ...w, endTps });
        this.log(`Speed at the end: ${endTps === null ? "not measured" : `${endTps} tokens/s`} (after the warm-up: ${this.refStartTps} tokens/s).`);
      }
    } catch { /* the check is a bonus: a failure must not lose the results */ } finally {
      await this.d.stopServer().catch(() => undefined);
      if (ref.installedByUs && !ref.keep) {
        this.set({ phase: "removing" });
        await this.d.uninstall(ref.entry).catch(() => undefined);
      } else if (ref.installedByUs && ref.keep) this.d.keep(ref.entry, ref.target);
    }
  }

  /** Generates a short text while watching the NPU counters and the CPU, then judges where the model ran. */
  private async place(entry: CatalogEntry, endpoint: string, baseMem: number | null, loadedMem: number | null, signal: AbortSignal, express: boolean) {
    let peakUtil: number | null = null;
    let peakMem = loadedMem;
    let running = true;
    this.placing = true;
    const poll = (async () => {
      while (running) {
        const x = await this.d.probe().catch(() => null);
        if (x) this.lastNpu = x;
        await new Promise((r) => setTimeout(r, 200)); // never a tight loop, whatever the probe's speed
        if (!x) continue;
        if (x.util !== null) peakUtil = Math.max(peakUtil ?? 0, x.util);
        if (x.memGB !== null) peakMem = Math.max(peakMem ?? 0, x.memGB);
      }
    })();
    const cpus = this.d.cpus ?? os.cpus;
    const cpu0 = cpus();
    try {
      await this.ask(entry, endpoint, [{ role: "user", content: "Write a 150-word story about a lighthouse keeper." }], express ? 70 : 220, effectiveEffort("off", thinkingSupport(entry)), signal, 120_000);
    } catch (e) {
      if ((e as Error).message === "stopped") throw e;
    } finally {
      running = false;
      this.placing = false;
    }
    const cpu = cpuBusy(cpu0, cpus());
    await poll;
    return judgePlacement({
      asked: this.d.compute(), npuUtilPeak: peakUtil, cpuBusyPct: cpu, logHint: logPlacement(this.d.serverLog()), sizeGB: entry.sizeGB,
      npuMemDeltaGB: peakMem !== null && baseMem !== null ? Math.round((peakMem - baseMem) * 100) / 100 : null
    });
  }

  private skipped(test: BenchTest, why: string): TestResult {
    return { id: test.id, section: test.section, title: test.title, score: 0, note: why, answer: "", thinking: "", asked: { maxTokens: 0, effort: null }, ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0, finish: null, skipped: why };
  }

  /** One request, collected. `level` is the thinking level for models that have one. */
  private async ask(entry: CatalogEntry, endpoint: string, messages: BenchTest["messages"], maxTokens: number, level: ReturnType<typeof effortFor>["level"], signal: AbortSignal, timeoutMs = 300_000, onDelta?: (kind: "answer" | "thinking", text: string, stats: { chunks: number; ttftSec: number | null; tps: number | null }) => void) {
    const e = applyEffort(level, messages, entry);
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let answer = "";
    let thinking = "";
    let stats: ChatStats | null = null;
    const t0 = performance.now();
    let tFirst: number | null = null;
    let chunks = 0;
    try {
      for await (const ev of streamChat({
        endpoint, model: entryRef(entry), messages: e.messages,
        sampling: { ...entry.sampling, max_tokens: maxTokens }, signal: ac.signal, body: e.body,
        thinkOpen: thinkingSupport(entry) === "always", fetchFn: this.d.fetchFn
      }, "bench")) {
        if (ev.type === "answer" || ev.type === "thinking") {
          if (ev.type === "answer") answer += ev.text; else thinking += ev.text;
          chunks++;
          const now = performance.now();
          tFirst ??= now;
          const gen = (now - tFirst) / 1000;
          onDelta?.(ev.type, ev.text, { chunks, ttftSec: Math.round(((tFirst - t0) / 1000) * 100) / 100, tps: gen > 0.4 && chunks > 3 ? Math.round(((chunks - 1) / gen) * 10) / 10 : null });
        } else if (ev.type === "done") stats = ev.stats;
      }
    } catch (err) {
      if (signal.aborted) throw new Error("stopped");
      if (ac.signal.aborted) throw new Error(`no answer after ${Math.round(timeoutMs / 1000)} s`);
      throw err;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
    return { answer: answer.trim(), thinking, stats };
  }

  private async test(entry: CatalogEntry, srv: { endpoint: string; nctx: number }, test: BenchTest, signal: AbortSignal, express: boolean): Promise<TestResult> {
    const { support, level } = effortFor(test, entry);
    const promptTokens = Math.ceil(JSON.stringify(test.messages).length / 3.2);
    const thinks = support === "always" || (support === "toggle" && test.think);
    const wantRoom = (express ? Math.min(test.maxTokens, EXPRESS_ANSWER) : test.maxTokens) + (thinks ? (express ? EXPRESS_THINK_ROOM : THINK_ROOM) : 0);
    const maxTokens = Math.max(64, Math.min(wantRoom, srv.nctx - promptTokens - 160));
    const base = { id: test.id, section: test.section, title: test.title, asked: { maxTokens, effort: level } };
    const prompt = String([...test.messages].reverse().find((m) => m.role === "user")?.content ?? "").slice(0, 700);
    const t0 = performance.now();
    const live: BenchLive = { model: entry.name, testId: test.id, test: test.title, section: test.section, prompt, answer: "", thinking: "", tokens: 0, ttftSec: null, tokPerSec: null, elapsedSec: 0, done: false };
    let lastEmit = 0;
    const push = (force = false) => {
      const now = performance.now();
      if (!force && now - lastEmit < 90) return;
      lastEmit = now;
      live.elapsedSec = Math.round((now - t0) / 100) / 10;
      this.d.emitLive?.({ ...live });
    };
    push(true);
    this.liveTps = null;
    try {
      const { answer, thinking, stats } = await this.ask(entry, srv.endpoint, test.messages, maxTokens, level, signal, this.d.testTimeoutMs, (kind, text, st) => {
        if (kind === "answer") live.answer += text; else live.thinking += text;
        live.tokens = st.chunks; live.ttftSec = st.ttftSec; live.tokPerSec = st.tps;
        this.liveTps = st.tps;
        push();
      });
      this.liveTps = null;
      let c: Check;
      try { c = test.check(answer); } catch (e) { c = { score: 0, note: `check failed: ${(e as Error).message}` }; }
      if (c.skip) return this.skipped(test, c.skip);
      live.answer = answer; live.thinking = thinking; live.done = true; live.score = c.score; live.note = c.note;
      if (stats) { live.tokens = stats.tokens; live.tokPerSec = stats.tokPerSec ?? live.tokPerSec; live.ttftSec = stats.ttftSec ?? live.ttftSec; }
      push(true);
      if (!answer && thinking) c = { score: 0, note: stats?.finish === "length" ? "ran out of tokens while still thinking" : "only thought, no answer" };
      else if (!answer) c = { score: 0, note: "empty answer" };
      return { ...base, score: Math.round(c.score * 1000) / 1000, note: c.note, answer, thinking, ttftSec: stats?.ttftSec ?? null, tokPerSec: stats?.tokPerSec ?? null, tokens: stats?.tokens ?? 0, totalSec: stats?.totalSec ?? 0, finish: stats?.finish ?? null };
    } catch (e) {
      this.liveTps = null;
      if ((e as Error).message === "stopped") throw e;
      live.done = true; live.score = 0; live.note = (e as Error).message.slice(0, 120);
      push(true);
      return { ...base, score: 0, note: "error", answer: "", thinking: "", ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0, finish: null, error: (e as Error).message.slice(0, 200) };
    }
  }
}
