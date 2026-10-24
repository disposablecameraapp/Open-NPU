import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { CatalogEntry, ChatStats } from "../shared/types";
import type { RunsOn } from "./placement";
import { BENCH_SECTIONS, BenchMode, BenchTarget, BenchTest, ModelResult, TestResult, buildModelReport, buildReport, buildSectionReport, slug, summarize, testsFor } from "./bench";
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
}

export type BenchPhase = "idle" | "preparing" | "installing" | "loading" | "placing" | "testing" | "removing" | "done" | "stopped";

export interface BenchRow {
  key: string;
  name: string;
  sizeGB: number;
  quality: number | null;
  runsOn: RunsOn;
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
  start(e: CatalogEntry): Promise<{ endpoint: string; nctx: number }>;
  stopServer(): Promise<void>;
  freeDiskGB(): number | null;
  /** One reading of the NPU counters (of the model server's process when they name processes, else of the whole NPU). */
  probe(): Promise<{ util: number | null; memGB: number | null }>;
  /** The latest lines of the model server's log. */
  serverLog(): string[];
  /** What the server is started with: the benchmark measures that. */
  compute(): "npu" | "cpu";
  emit(s: BenchState): void;
  fetchFn?: typeof fetch;
  now?: () => number;
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

  constructor(private d: BenchDeps) {}

  static idle(): BenchState {
    return { running: false, phase: "idle", runDir: null, summaryFile: null, mode: "quick", modelIndex: 0, modelCount: 0, current: null, testIndex: 0, testCount: 0, currentTest: null, startedAt: null, rows: [], log: [] };
  }

  state(): BenchState { return this.st; }
  get running() { return this.st.running; }

  private set(p: Partial<BenchState>) {
    this.st = { ...this.st, ...p };
    this.d.emit(this.st);
  }
  private log(line: string) {
    this.set({ log: [...this.st.log, `${new Date().toLocaleTimeString()}  ${line}`].slice(-60) });
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
    this.st = { ...BenchRunner.idle(), running: true, phase: "preparing", runDir, summaryFile: path.join(runDir, "summary.md"), mode: cfg.mode, modelCount: targets.length, startedAt: Date.now(), rows: this.rowsOf(runDir) };
    this.d.emit(this.st);
    void this.loop(cfg, targets, runDir).catch((e) => this.log(`Stopped by an error: ${(e as Error).message}`)).finally(() => {
      this.entry = null;
      this.set({ running: false, phase: this.ac?.signal.aborted ? "stopped" : "done", current: null, currentTest: null });
    });
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
    return { key: r.key, name: r.name, sizeGB: r.sizeGB, quality: r.summary.quality, runsOn: r.placement?.runsOn ?? "unknown", ttftSec: r.summary.ttftSec, tokPerSec: r.summary.tokPerSec, coldStartSec: r.coldStartSec, ran: r.summary.ran, failed: r.summary.failed, error: r.error, file };
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

  private async loop(cfg: BenchConfig, targets: BenchTarget[], runDir: string) {
    const startedAt = new Date().toLocaleString();
    const signal = this.ac!.signal;
    let i = 0;
    for (const t of targets) {
      i++;
      if (signal.aborted) break;
      const file = path.join(runDir, `${slug(t.key)}.json`);
      if (cfg.resume && this.readResults(runDir).some((r) => r.key === t.key && r.finishedAt)) { this.log(`${t.name}: already tested in this run, skipped`); continue; }
      this.set({ modelIndex: i, current: t.name, testIndex: 0, currentTest: null, phase: "preparing" });
      this.log(`— ${t.name} (${t.sizeGB.toFixed(1)} GB)`);
      const result = await this.model(cfg, t, runDir).catch((e): ModelResult => this.failed(t, cfg, (e as Error).message));
      const written = this.writeModel(runDir, result);
      this.set({ rows: [...this.st.rows.filter((r) => r.key !== t.key), this.row(result, written)] });
      this.writeSummary(runDir, cfg, startedAt);
      this.log(`${t.name}: quality ${result.summary.quality === null ? "–" : result.summary.quality.toFixed(0)}/100${result.error ? `, ${result.error}` : ""}`);
    }
    this.writeSummary(runDir, cfg, startedAt);
  }

  private failed(t: BenchTarget, cfg: BenchConfig, error: string): ModelResult {
    return { key: t.key, name: t.name, ref: t.bundleRef ?? t.repo, sizeGB: t.sizeGB, paramsB: t.paramsB, source: t.source, thinking: "none", mode: cfg.mode, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), wasInstalled: false, installSec: null, coldStartSec: null, npuMemGB: null, tests: [], summary: summarize([]), error };
  }

  /** One model: install if needed, load, run the tests, remove. The removal happens whatever went wrong. */
  private async model(cfg: BenchConfig, t: BenchTarget, runDir: string): Promise<ModelResult> {
    const now = this.d.now ?? (() => performance.now());
    const signal = this.ac!.signal;
    const entry = await this.d.resolve(t);
    this.entry = entry;
    const r: ModelResult = { ...this.failed(t, cfg, ""), ref: entryRef(entry), thinking: thinkingSupport(entry), finishedAt: null };
    delete r.error;
    r.wasInstalled = await this.d.isInstalled(entry);
    try {
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
      }
      this.set({ phase: "loading" });
      this.log(`Loading (${this.d.compute().toUpperCase()})…`);
      const baseline = await this.d.probe().catch(() => ({ util: null, memGB: null })); // before this model is on the NPU
      const t1 = now();
      const srv = await this.d.start(entry);
      await this.ask(entry, srv.endpoint, [{ role: "user", content: "Say OK." }], 12, null, signal);
      r.coldStartSec = Math.round((now() - t1) / 100) / 10;
      const loaded = await this.d.probe().catch(() => ({ util: null, memGB: null }));
      r.npuMemGB = loaded.memGB;
      this.set({ phase: "placing" });
      this.log("Checking whether it runs on the NPU or the CPU…");
      r.placement = await this.place(entry, srv.endpoint, baseline.memGB, loaded.memGB, signal, cfg.mode === "express");
      this.log(`${t.name}: runs on ${r.placement.runsOn.toUpperCase()} (${r.placement.evidence.join("; ")})`);

      const tests = testsFor(cfg.mode);
      this.set({ phase: "testing", testCount: tests.length });
      let streak = 0;
      let k = 0;
      for (const test of tests) {
        if (signal.aborted) throw new Error("stopped");
        this.set({ testIndex: ++k, currentTest: test.title });
        const res = test.minContext && srv.nctx < test.minContext
          ? this.skipped(test, `window too small (${srv.nctx} tokens, needs ${test.minContext})`)
          : await this.test(entry, srv, test, signal, cfg.mode === "express");
        r.tests.push(res);
        if (res.error) streak++; else streak = 0;
        if (streak >= 3) throw new Error(`three tests in a row failed: ${res.error}`);
        if (res.error) await this.d.start(entry).then((s) => { srv.endpoint = s.endpoint; srv.nctx = s.nctx; }).catch(() => undefined); // the server may have died
        this.writeModel(runDir, r); // partial results survive a crash
      }
      if (!r.tests.some((x) => !x.skipped)) throw new Error("no test could run");
    } catch (e) {
      const msg = (e as Error).message;
      r.error = signal.aborted ? "stopped before the end" : msg;
    } finally {
      r.finishedAt = signal.aborted && r.tests.length === 0 ? null : new Date().toISOString();
      await this.d.stopServer().catch(() => undefined);
      if (!r.wasInstalled) {
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

  /** Generates a short text while watching the NPU counters and the CPU, then judges where the model ran. */
  private async place(entry: CatalogEntry, endpoint: string, baseMem: number | null, loadedMem: number | null, signal: AbortSignal, express: boolean) {
    let peakUtil: number | null = null;
    let peakMem = loadedMem;
    let running = true;
    const poll = (async () => {
      while (running) {
        const x = await this.d.probe().catch(() => null);
        await new Promise((r) => setTimeout(r, 200)); // never a tight loop, whatever the probe's speed
        if (!x) continue;
        if (x.util !== null) peakUtil = Math.max(peakUtil ?? 0, x.util);
        if (x.memGB !== null) peakMem = Math.max(peakMem ?? 0, x.memGB);
      }
    })();
    const cpu0 = os.cpus();
    try {
      await this.ask(entry, endpoint, [{ role: "user", content: "Write a 150-word story about a lighthouse keeper." }], express ? 70 : 220, effectiveEffort("off", thinkingSupport(entry)), signal, 120_000);
    } catch (e) {
      if ((e as Error).message === "stopped") throw e;
    } finally {
      running = false;
    }
    const cpu = cpuBusy(cpu0, os.cpus());
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
  private async ask(entry: CatalogEntry, endpoint: string, messages: BenchTest["messages"], maxTokens: number, level: ReturnType<typeof effortFor>["level"], signal: AbortSignal, timeoutMs = 300_000) {
    const e = applyEffort(level, messages, entry);
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let answer = "";
    let thinking = "";
    let stats: ChatStats | null = null;
    try {
      for await (const ev of streamChat({
        endpoint, model: entryRef(entry), messages: e.messages,
        sampling: { ...entry.sampling, max_tokens: maxTokens }, signal: ac.signal, body: e.body,
        thinkOpen: thinkingSupport(entry) === "always", fetchFn: this.d.fetchFn
      }, "bench")) {
        if (ev.type === "answer") answer += ev.text;
        else if (ev.type === "thinking") thinking += ev.text;
        else if (ev.type === "done") stats = ev.stats;
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
    try {
      const { answer, thinking, stats } = await this.ask(entry, srv.endpoint, test.messages, maxTokens, level, signal, this.d.testTimeoutMs);
      let c: Check;
      try { c = test.check(answer); } catch (e) { c = { score: 0, note: `check failed: ${(e as Error).message}` }; }
      if (c.skip) return this.skipped(test, c.skip);
      if (!answer && thinking) c = { score: 0, note: stats?.finish === "length" ? "ran out of tokens while still thinking" : "only thought, no answer" };
      else if (!answer) c = { score: 0, note: "empty answer" };
      return { ...base, score: Math.round(c.score * 1000) / 1000, note: c.note, answer, thinking, ttftSec: stats?.ttftSec ?? null, tokPerSec: stats?.tokPerSec ?? null, tokens: stats?.tokens ?? 0, totalSec: stats?.totalSec ?? 0, finish: stats?.finish ?? null };
    } catch (e) {
      if ((e as Error).message === "stopped") throw e;
      return { ...base, score: 0, note: "error", answer: "", thinking: "", ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0, finish: null, error: (e as Error).message.slice(0, 200) };
    }
  }
}
