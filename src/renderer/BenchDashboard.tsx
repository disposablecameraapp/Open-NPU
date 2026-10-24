import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { ModelResult } from "../core/bench";
import type { BenchLive, BenchSample, BenchState } from "../core/benchRunner";
import { heatmapSvg, leaderboardSvg, placementSvg, qualitySizeSvg, qualitySpeedSvg, sectionsSvg, speedSizeSvg } from "../core/benchCharts";
import { headline } from "../core/benchExport";
import { SECTION_INFO } from "../core/benchSections";
import { CANDIDATE_TAGS } from "../core/benchCandidates";
import { computeStats, pct } from "../core/benchStats";

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min` : s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
};
const at = (afterSec: number) => new Date(Date.now() + afterSec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function Tile({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return <div className="bd-tile"><div className="bd-val">{value}</div><div className="bd-lab">{label}</div>{sub && <div className="bd-sub">{sub}</div>}</div>;
}

/** One measure over the last minutes: its value now, and a line with a crosshair on hover. Own scale, own chart: never two measures on one axis. */
function Spark({ label, unit, values, times, max, color, digits = 0 }: { label: string; unit: string; values: (number | null)[]; times: number[]; max: number; color: string; digits?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 220, H = 56, n = values.length;
  const x = (i: number) => (n <= 1 ? W : (i / (n - 1)) * W);
  const y = (v: number) => H - 3 - (Math.min(v, max) / (max || 1)) * (H - 8);
  let d = "", area = "", started = false, firstX = 0, lastX = 0;
  values.forEach((v, i) => {
    if (v === null) { if (started) area += `L${lastX} ${H}L${firstX} ${H}Z`; started = false; return; }
    if (!started) { d += `M${x(i)} ${y(v)}`; firstX = x(i); started = true; area += `M${x(i)} ${H}L${x(i)} ${y(v)}`; } else { d += `L${x(i)} ${y(v)}`; area += `L${x(i)} ${y(v)}`; }
    lastX = x(i);
  });
  if (started) area += `L${lastX} ${H}L${firstX} ${H}Z`;
  const cur = [...values].reverse().find((v) => v !== null) ?? null;
  const hv = hover !== null ? values[hover] : null;
  return (
    <div className="bd-spark">
      <div className="bd-spark-head"><span className="muted small">{label}</span><span className="bd-now">{hover !== null ? (hv === null ? "n/a" : `${hv.toFixed(digits)}${unit}`) : cur === null ? "n/a" : `${cur.toFixed(digits)}${unit}`}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))))); }} onMouseLeave={() => setHover(null)} role="img" aria-label={`${label}, now ${cur === null ? "not available" : cur.toFixed(digits) + unit}`}>
        <line x1="0" x2={W} y1={H - 3} y2={H - 3} className="bd-base" />
        {area && <path d={area} fill={color} opacity=".16" />}
        {d && <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} className="bd-cross" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hover !== null && times[hover] !== undefined && <div className="bd-spark-tip small muted">{hv === null ? "n/a" : `${hv.toFixed(digits)}${unit}`} · {clock(times[times.length - 1] - times[hover])} ago</div>}
    </div>
  );
}

const scoreFill = (v: number) => `color-mix(in oklab, var(--viz-seq) ${Math.round(8 + v * 92)}%, var(--surface))`;

function TestStrip({ state }: { state: BenchState }) {
  const done = state.currentTests;
  const pending = Math.max(0, state.testCount - done.length);
  if (!state.testCount && !done.length) return null;
  return (
    <div className="bd-strip" aria-label="Tests of this model">
      {done.map((t) => (
        <span key={t.id} className={`bd-cell ${t.error ? "err" : t.skipped ? "skip" : ""}`} style={!t.error && !t.skipped ? { background: scoreFill(t.score), color: t.score >= 0.55 ? "#fff" : "var(--text)" } : undefined}
          title={`${t.title} (${SECTION_INFO[t.section].label}): ${t.skipped ? "skipped" : t.error ? "error" : `${Math.round(t.score * 100)}/100`} · ${t.note}${t.tokPerSec ? ` · ${t.tokPerSec} tok/s` : ""}`}>
          {t.error ? "!" : t.skipped ? "–" : Math.round(t.score * 100)}
        </span>
      ))}
      {Array.from({ length: pending }, (_, i) => <span key={`p${i}`} className={`bd-cell pending ${i === 0 && state.running && state.phase === "testing" ? "now" : ""}`} />)}
    </div>
  );
}

function LivePanel({ live, state }: { live: BenchLive | null; state: BenchState }) {
  const out = useRef<HTMLPreElement>(null);
  useEffect(() => { if (out.current) out.current.scrollTop = out.current.scrollHeight; }, [live?.answer, live?.thinking]);
  const idle = !live || !state.running;
  return (
    <div className="bd-card bd-live">
      <div className="bd-card-head">
        <strong>{state.running && state.current ? state.current : "Last model"}</strong>
        {live && <span className="muted small">{live.warmup ? "Warming the NPU up: writing without stopping" : `${live.test} · ${SECTION_INFO[live.section].label}`}</span>}
        {live?.done && live.score !== undefined && <span className={`bd-score ${live.score >= 0.7 ? "good" : live.score >= 0.4 ? "mid" : "bad"}`}>{live.score >= 0.7 ? "✓" : live.score >= 0.4 ? "~" : "✗"} {Math.round(live.score * 100)}/100</span>}
      </div>
      {live ? (
        <>
          <details className="bd-prompt"><summary className="small muted">Asked</summary><pre>{live.prompt}</pre></details>
          <pre ref={out} className="bd-out" aria-live="off">{live.answer || (live.thinking ? "" : state.running ? "waiting for the first word…" : "")}{!live.done && state.running && <span className="bd-caret" />}</pre>
          {live.thinking && <details className="bd-think"><summary className="small muted">Thinking ({live.thinking.length.toLocaleString()} characters)</summary><pre>{live.thinking.slice(-1500)}</pre></details>}
          <div className="bd-facts small">
            <span><b>{live.tokens}</b> tokens</span>
            <span><b>{live.tokPerSec !== null ? live.tokPerSec.toFixed(1) : "–"}</b> tok/s</span>
            <span>first word <b>{live.ttftSec !== null ? `${live.ttftSec.toFixed(2)} s` : "–"}</b></span>
            <span><b>{live.elapsedSec.toFixed(1)}</b> s</span>
            {live.done && live.note && <span className="muted">{live.note}</span>}
          </div>
        </>
      ) : <div className="muted small">{idle ? "Nothing is being asked yet." : ""}</div>}
    </div>
  );
}

type Tab = "overview" | "speed" | "sections" | "specialists";

/** The benchmark as it runs: where it stands, what the model in front of it is saying, how hard the machine works, and what the results say so far. */
export function BenchDashboard({ state, phase, onStop, exportReport }: { state: BenchState; phase: string; onStop: () => void; exportReport: () => void }) {
  const [live, setLive] = useState<BenchLive | null>(null);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [full, setFull] = useState(false);
  useEffect(() => api().onBenchLive(setLive), []);
  const finished = state.rows.length;
  useEffect(() => { void api().benchResults().then(setResults).catch(() => undefined); }, [finished, state.running]);
  const stats = useMemo(() => computeStats(results, CANDIDATE_TAGS), [results]);
  const series = state.series;
  const col = (f: (s: BenchSample) => number | null) => series.map(f);
  const times = series.map((s) => s.t);
  const memMax = Math.max(8, ...series.map((s) => s.npuMemGB ?? 0));
  const tpsMax = Math.max(10, ...series.map((s) => s.tokPerSec ?? 0));
  const p = stats.placement;
  const share = (n: number) => `${pct(n, p.total)}%`;

  return (
    <div className={`bd ${full ? "full" : ""}`}>
      <div className="bd-top">
        <div className="bd-pct">
          <div className="bd-bigpct">{state.running || state.phase === "done" ? `${state.percent.toFixed(state.percent >= 10 ? 0 : 1)}%` : state.phase === "stopped" ? `${state.percent.toFixed(0)}%` : "0%"}</div>
          <div className="track bd-track" role="progressbar" aria-valuenow={Math.round(state.percent)} aria-valuemin={0} aria-valuemax={100}><div className="fill" style={{ width: `${state.running ? state.percent : state.phase === "done" ? 100 : state.percent}%` }} /></div>
        </div>
        <Tile value={clock(state.elapsedSec)} label="running for" />
        <Tile value={state.running ? (state.etaSec !== null ? `~${clock(state.etaSec)}` : "…") : "–"} label="left" sub={state.running && state.etaSec !== null ? `done around ${at(state.etaSec)}` : undefined} />
        <Tile value={`${Math.min(state.modelIndex, state.modelCount)} / ${state.modelCount}`} label="models" sub={state.running && state.testCount ? `test ${Math.min(state.testIndex, state.testCount)} / ${state.testCount}` : undefined} />
        <div className="bd-phase"><span className={`bd-dot ${state.running ? "on" : ""}`} /> <strong>{phase}</strong>{state.running && state.current && <span className="muted small"> · {state.current}</span>}{state.phase === "warming" && state.warmupLeftSec !== null && <span className="bd-warm"> · {clock(state.warmupLeftSec)} of warm-up left</span>}</div>
        <div className="bd-actions">
          {state.running && <button className="ghost" onClick={onStop}>Stop</button>}
          <button className="ghost" onClick={() => setFull((f) => !f)}>{full ? "Close full screen" : "Full screen"}</button>
          <button className="primary" disabled={!finished} onClick={exportReport} title="Writes a report to publish: Markdown, a web page, charts, CSV, every raw answer">Export the report</button>
        </div>
      </div>

      <div className="bd-grid2">
        <LivePanel live={live} state={state} />
        <div className="bd-card">
          <div className="bd-card-head"><strong>The machine</strong><span className="muted small">last {clock(times.length ? times[times.length - 1] - times[0] : 0)}</span></div>
          <div className="bd-sparks">
            <Spark label="NPU load" unit="%" values={col((s) => s.npu)} times={times} max={100} color="var(--viz-1)" />
            <Spark label="NPU memory" unit=" GB" digits={1} values={col((s) => s.npuMemGB)} times={times} max={memMax} color="var(--viz-3)" />
            <Spark label="CPU" unit="%" values={col((s) => s.cpu)} times={times} max={100} color="var(--viz-2)" />
            <Spark label="RAM" unit="%" values={col((s) => s.ramPct)} times={times} max={100} color="var(--viz-5)" />
            <Spark label="Writing speed" unit=" tok/s" digits={1} values={col((s) => s.tokPerSec)} times={times} max={tpsMax} color="var(--viz-1)" />
          </div>
          {series.length > 0 && series[series.length - 1].npu === null && <div className="muted small">No NPU reading yet (Windows counters are read every few seconds).</div>}
        </div>
      </div>

      <TestStrip state={state} />

      {finished > 0 && (
        <>
          <div className="bd-tiles">
            <Tile value={share(p.npu)} label="of models ran on the NPU" sub={`${p.npu} of ${p.total}`} />
            <Tile value={share(p.cpu + p.mixed)} label="used the CPU too" sub={`${p.cpu} CPU only · ${p.mixed} both`} />
            <Tile value={stats.quality ? stats.quality.max.toFixed(0) : "–"} label="best quality" sub={stats.quality ? `median ${stats.quality.median.toFixed(0)}` : undefined} />
            <Tile value={stats.speed.medianTokPerSec !== null ? stats.speed.medianTokPerSec.toFixed(1) : "–"} label="median tokens/s" sub={stats.speed.fastest ? `fastest ${stats.speed.fastest.tokPerSec.toFixed(0)} (${stats.speed.fastest.name})` : undefined} />
            <Tile value={stats.tests.toLocaleString()} label="tests run" sub={`${stats.tokens.toLocaleString()} tokens written`} />
          </div>
          <div className="bd-tabs" role="tablist">
            {([["overview", "Overview"], ["speed", "Speed and size"], ["sections", "By kind of work"], ["specialists", "Specialists"]] as [Tab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          {tab === "overview" && (
            <div className="bd-charts">
              <ul className="bd-findings">{headline(stats, results).map((l, i) => <li key={i} dangerouslySetInnerHTML={{ __html: l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />)}</ul>
              <div className="bd-svg" dangerouslySetInnerHTML={{ __html: placementSvg(stats, results) }} />
              <div className="bd-svg" dangerouslySetInnerHTML={{ __html: leaderboardSvg(results, { top: 15 }) }} />
            </div>
          )}
          {tab === "speed" && (
            <div className="bd-charts two">
              <div className="bd-svg" dangerouslySetInnerHTML={{ __html: qualitySpeedSvg(results) }} />
              <div className="bd-svg" dangerouslySetInnerHTML={{ __html: qualitySizeSvg(results) }} />
              <div className="bd-svg" dangerouslySetInnerHTML={{ __html: speedSizeSvg(results) }} />
              <div className="bd-card">
                <strong>Correlations</strong>
                <table className="bd-table small"><tbody>
                  <tr><td>size and quality</td><td>{stats.correlations.sizeQuality ?? "n/a"}</td></tr>
                  <tr><td>size and speed</td><td>{stats.correlations.sizeSpeed ?? "n/a"}</td></tr>
                  <tr><td>speed and quality</td><td>{stats.correlations.speedQuality ?? "n/a"}</td></tr>
                </tbody></table>
                <strong>Most quality per GB</strong>
                <table className="bd-table small"><tbody>{stats.bestPerGB.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.quality.toFixed(0)} in {x.sizeGB.toFixed(1)} GB</td></tr>)}</tbody></table>
              </div>
            </div>
          )}
          {tab === "sections" && (
            <div className="bd-charts">
              <div className="bd-svg scroll" dangerouslySetInnerHTML={{ __html: heatmapSvg(results) }} />
              <div className="bd-svg" dangerouslySetInnerHTML={{ __html: sectionsSvg(stats) }} />
            </div>
          )}
          {tab === "specialists" && (
            <div className="bd-card">
              {stats.specialists.length === 0 ? <div className="muted small">No specialist has been tested yet. Tick some under "Specialists" and run again.</div> : (
                <table className="bd-table small">
                  <thead><tr><th>Model</th><th>Known for</th><th>Score</th><th>Rank</th><th>Median of all</th><th>Best other</th><th /></tr></thead>
                  <tbody>{stats.specialists.map((x) => (
                    <tr key={x.name}><td>{x.name}</td><td>{x.claim.replace(/_/g, " ")}</td><td>{x.score.toFixed(0)}</td><td>{x.rank} of {x.of}</td><td>{x.median.toFixed(0)}</td><td>{x.bestOther ? `${x.bestOther.name} (${x.bestOther.score.toFixed(0)})` : ""}</td>
                      <td><span className={`bd-score ${x.verdict === "confirmed" ? "good" : x.verdict === "average" ? "mid" : "bad"}`}>{x.verdict === "confirmed" ? "✓ confirmed" : x.verdict === "average" ? "~ average" : "✗ disappointing"}</span></td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
