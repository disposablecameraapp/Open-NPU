import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { BenchState } from "../core/benchRunner";
import { estimateRun } from "../core/benchEstimate";
import { BenchDashboard } from "./BenchDashboard";

type Roster = Awaited<ReturnType<ReturnType<typeof api>["benchRoster"]>>;

export const PHASE: Record<BenchState["phase"], string> = {
  idle: "Ready", preparing: "Preparing", installing: "Downloading", loading: "Loading the model", warming: "Warming the NPU up", placing: "Checking NPU or CPU", rechecking: "Measuring the speed again", testing: "Testing", removing: "Removing to free space", done: "Finished", stopped: "Stopped"
};

const n = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "–" : v.toFixed(d));

/**
 * Developer settings: a loop that installs candidate models one after the other, runs a set of tests on each (mails,
 * summaries, strict formats, maths, code that is run, facts, translation, web search...), records quality and speed, writes a
 * result file per model, and removes the model again to make room.
 */
export function Benchmark() {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [state, setState] = useState<BenchState | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"express" | "quick" | "full">("express");
  const [keep, setKeep] = useState(false);
  const [resume, setResume] = useState(false);
  const [warmup, setWarmup] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<{ ok: boolean; dir?: string; error?: string } | null>(null);

  useEffect(() => {
    void api().benchRoster().then((r) => { setRoster(r); setPicked(new Set(r.targets.filter((t) => !t.tested).map((t) => t.key))); });
    void api().benchState().then(setState);
    return api().onBench(setState);
  }, []);
  const running = !!state?.running;

  const groups = useMemo(() => {
    const g = new Map<string, Roster["targets"]>();
    for (const t of roster?.targets ?? []) g.set(t.source, [...(g.get(t.source) ?? []), t]);
    return [...g.entries()];
  }, [roster]);

  if (!roster) return <div className="muted small">Loading…</div>;
  const chosen = roster.targets.filter((t) => picked.has(t.key));
  const biggest = Math.max(0, ...chosen.map((t) => t.sizeGB));
  const toggle = (keys: string[], on: boolean) => setPicked((p) => { const x = new Set(p); keys.forEach((k) => (on ? x.add(k) : x.delete(k))); return x; });
  const start = async () => {
    setError(null);
    const r = await api().benchStart({ keys: roster.targets.filter((t) => picked.has(t.key)).map((t) => t.key), mode, keepInstalled: keep, resume, warmupMin: warmup });
    if (!r.ok) setError(r.error ?? "Could not start.");
  };
  const testsPer = roster.tests[mode];
  const est = estimateRun(chosen, mode, roster.costs[mode]);
  if (chosen.length && warmup) { est.inferenceMin += warmup + 3; est.totalMin += warmup + 3; }
  const hours = (m: number) => (m >= 90 ? `${(m / 60).toFixed(1)} h` : `${m} min`);
  const reveal = (file: string | null) => void api().benchReveal(file);
  const exportReport = async () => setExported(await api().benchExport());

  return (
    <div className="bench">
      <p className="muted small">
        Installs each model you tick, one at a time, runs {testsPer} tests on it (writing, translation, maths, logic, facts, data, web search, safety, and code split into Python, JavaScript, HTML, CSS, SQL, shell, fixing and explaining), writes a result file per model, a file per section comparing every model, and the summary, then removes the model to free the space.
        Each model is also checked for where it really runs, NPU or CPU, from the NPU counters and the CPU load while it answers. Every raw answer is kept. Answers are scored by checks, not by a model: exact values, formats, code that is run, facts.
        The models are those of the Dynamic packs up to 9B, your catalog and custom models, and a list of specialists picked for being acclaimed at one kind of work (translation, tool calling, maths, code, extraction, medicine, long context...), none over 7 GB. Express screens many models fast: run it on everything, then Quick or Full on the best. Chat is paused during a run; leave the PC on power.
      </p>

      {!running && (
        <>
          <div className="row">
            <label className="small">Tests
              <select value={mode} onChange={(e) => setMode(e.target.value as "quick" | "full")}>
                <option value="express">Express: {roster.tests.express} short tests, to screen many models</option>
                <option value="quick">Quick: {roster.tests.quick} tests per model</option>
                <option value="full">Full: {roster.tests.full} tests per model</option>
              </select>
            </label>
            <label className="small" title="The biggest model you ticked writes without stopping for this long, then is tested first, so every model is measured on a NPU that is already warm. At the end of the run its speed is measured again to show whether the NPU slowed down.">Warm the NPU up first
              <select value={warmup} onChange={(e) => setWarmup(Number(e.target.value))}>
                <option value={0}>No</option><option value={5}>5 minutes</option><option value={10}>10 minutes (recommended)</option><option value={20}>20 minutes</option><option value={30}>30 minutes</option>
              </select>
            </label>
            <label className="check small"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep the models installed afterwards</label>
            <label className="check small"><input type="checkbox" checked={resume} onChange={(e) => setResume(e.target.checked)} /> Continue the latest run (skip models already done)</label>
          </div>

          <div className="row">
            <strong className="small">{chosen.length} of {roster.targets.length} models</strong>
            <button className="ghost" onClick={() => toggle(roster.targets.map((t) => t.key), true)}>All</button>
            <button className="ghost" onClick={() => toggle(roster.targets.map((t) => t.key), false)}>None</button>
            <button className="ghost" onClick={() => setPicked(new Set(roster.targets.filter((t) => t.source === "Specialists").map((t) => t.key)))}>Specialists only</button>
            <button className="ghost" title="Models of 3 GB or less: the quickest to download and to test" onClick={() => setPicked(new Set(roster.targets.filter((t) => t.sizeGB <= 3).map((t) => t.key)))}>3 GB or less</button>
            <button className="ghost" title="Leave out the models already tested to the end in an earlier run" onClick={() => setPicked(new Set(roster.targets.filter((t) => !t.tested).map((t) => t.key)))}>Not tested yet</button>
            <button className="ghost" onClick={() => setPicked(new Set(roster.targets.filter((t) => !t.installed).map((t) => t.key)))}>Not installed yet</button>
            {(state?.rows.length ?? 0) > 0 && <button className="ghost" title="Tick the models with the best quality in the results below, then pick Quick or Full to test them properly" onClick={() => setPicked(new Set([...state!.rows].filter((r) => r.quality !== null).sort((a, b) => b.quality! - a.quality!).slice(0, 12).map((r) => r.key)))}>Best 12 of the results</button>}
          </div>
          {groups.map(([source, list]) => (
            <div key={source} className="bench-group">
              <label className="check small"><input type="checkbox" checked={list.every((t) => picked.has(t.key))} onChange={(e) => toggle(list.map((t) => t.key), e.target.checked)} /> <strong>{source}</strong></label>
              <div className="bench-models">
                {list.map((t) => (
                  <label key={t.key} className="check small">
                    <input type="checkbox" checked={picked.has(t.key)} onChange={(e) => toggle([t.key], e.target.checked)} />
                    <span title={t.specialty ?? ""}>{t.name}{t.specialty && <span className="muted small"> · {t.specialty}</span>}</span>
                    <span className="muted">{t.sizeGB.toFixed(1)} GB{t.tested ? " · tested" : ""}{t.installed ? " · installed" : ""}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {chosen.length > 0 && <div className="small"><strong>About {hours(est.totalMin)}</strong> <span className="muted">for {chosen.length} model{chosen.length === 1 ? "" : "s"}: {hours(est.inferenceMin)} of testing plus {est.downloadGB} GB to download (about {hours(est.downloadMin)} at 50 MB/s). A guess from the file sizes: the real speeds of your NPU replace it as models are run.</span></div>}
          {biggest > 0 && roster.freeGB !== null && (
            <div className={`small ${roster.freeGB < biggest * 1.15 ? "warn" : "muted"}`}>
              One model is on disk at a time: the biggest ticked needs {biggest.toFixed(1)} GB, {roster.freeGB.toFixed(0)} GB are free.{keep ? " Keeping them all installed needs more." : ""}
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
          <div className="row">
            <button className="primary" disabled={!chosen.length} onClick={() => void start()}>Start the benchmark</button>
            <span className="muted small">Results are saved in <code>{roster.folder}</code></span>
          </div>
        </>
      )}

      {state && (running || state.phase === "done" || state.phase === "stopped") && state.modelCount > 0 && (
        <BenchDashboard state={state} phase={PHASE[state.phase]} onStop={() => void api().benchStop()} exportReport={() => void exportReport()} />
      )}
      {exported && <div className={`small ${exported.ok ? "ok" : "warn"}`}>{exported.ok ? <>Report written to <code>{exported.dir}</code>: <code>report.html</code> to open, <code>report.md</code> to paste on GitHub or Reddit, <code>charts/</code>, <code>results.csv</code>, <code>models/</code> with every raw answer.</> : exported.error}</div>}

      {state && state.rows.length > 0 && (
        <>
          <div className="bench-table" role="table">
            <div className="bench-row bench-head small muted" role="row"><span>Model</span><span>Runs on</span><span>Quality</span><span>First token</span><span>Tokens/s</span><span>Load</span><span /></div>
            {[...state.rows].sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1)).map((r) => (
              <div key={r.key} className="bench-row small" role="row" title={r.error ?? ""}>
                <span>{r.name}<span className="muted"> · {r.sizeGB.toFixed(1)} GB</span>{r.skipReason ? <span className="warn" title={r.error}> · {r.quality === null ? "skipped" : "tested in part"}: {r.skipReason}</span> : r.error ? <span className="warn"> · {r.error}</span> : null}</span>
                <span className={`runs-on ${r.runsOn}`} title="Measured while the model answered: NPU counters and CPU load">{r.runsOn === "unknown" ? "unknown" : r.runsOn.toUpperCase()}</span>
                <span className="bench-q"><span className="track"><span className="fill" style={{ width: `${r.quality ?? 0}%` }} /></span>{r.quality === null ? "–" : r.quality.toFixed(0)}</span>
                <span>{n(r.ttftSec, 2)} s</span>
                <span>{n(r.tokPerSec)}</span>
                <span>{n(r.coldStartSec)} s</span>
                <button className="ghost" onClick={() => reveal(r.file.replace(/\.json$/, ".md"))}>Show file</button>
              </div>
            ))}
          </div>
          <div className="row">
            {state.summaryFile && <button className="ghost" onClick={() => reveal(state.summaryFile)}>Show the summary file</button>}
            <button className="ghost" onClick={() => reveal(null)}>Open the results folder</button>
          </div>
        </>
      )}

      <NpuDiagnostics />

      {state && state.log.length > 0 && <details><summary className="small">Log</summary><pre>{state.log.join("\n")}</pre></details>}
    </div>
  );
}

/** Why the NPU meters read n/a: what Windows exposes about the NPU on this PC. */
function NpuDiagnostics() {
  const [d, setD] = useState<Awaited<ReturnType<ReturnType<typeof api>["npuDiagnostics"]>> | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="bench-diag">
      <div className="row">
        <button className="ghost" disabled={busy} onClick={async () => { setBusy(true); try { setD(await api().npuDiagnostics()); } finally { setBusy(false); } }}>{busy ? "Reading…" : "Check the NPU counters"}</button>
        <span className="muted small">Shows whether Windows reports NPU load and memory on this PC, which the NPU meters and the "Runs on" column depend on.</span>
      </div>
      {d && (
        <div className="small">
          {d.windows && <div className="muted">Windows build {d.windows}{d.windowsHasNpuMonitoring === false ? ": older than 26100.8524 (24H2), the first build Microsoft lists with NPU monitoring in Task Manager. Run Windows Update, then the Qualcomm NPU driver update, and check again." : d.windowsHasNpuMonitoring ? ": new enough for NPU monitoring." : "."}</div>}
          {d.ok ? <div className="ok">NPU counters work: load {d.util === null ? "n/a" : `${d.util}%`}, memory {d.memGB === null ? "n/a" : `${d.memGB} GB`}.</div> : <div className="warn">{d.problem}</div>}
          {d.sets.length > 0 && <div className="muted">Counter sets used: {d.sets.join(", ")}{d.adapter ? ` · adapter: ${d.adapter}` : ""}</div>}
          {d.topUtil.length > 0 && <details><summary>Highest load values read (raw)</summary><pre>{d.topUtil.join("\n")}</pre></details>}
          {d.adapters.length > 0 && <details><summary>Graphics and compute adapters in the DirectX registry</summary><pre>{d.adapters.join("\n")}</pre></details>}
          {d.allSets.length > 0 && <details><summary>All {d.allSets.length} counter sets Windows has (look for the NPU's)</summary><pre>{d.allSets.join("\n")}</pre></details>}
          {d.sample.length > 0 && <details><summary>Values read ({d.sample.length} shown)</summary><pre>{d.sample.join("\n")}</pre></details>}
        </div>
      )}
    </div>
  );
}
