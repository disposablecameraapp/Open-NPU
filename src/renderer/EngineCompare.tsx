import { useEffect, useState } from "react";
import { api } from "./api";
import { CopyLog } from "./CopyLog";
import type { BenchRow, BenchState } from "../core/benchRunner";

type Status = Awaited<ReturnType<ReturnType<typeof api>["foundryStatus"]>>;
type Flow = Awaited<ReturnType<ReturnType<typeof api>["engineCompareState"]>>;
type Mode = "launch" | "express" | "quick";

const num = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "–" : n.toFixed(d));
const MARK = { pending: "·", running: "…", done: "✓", failed: "✗" } as const;

/** What one engine did with a model: not run yet, did not launch, or the figures. */
function Cell({ row }: { row?: BenchRow }) {
  if (!row) return <span className="muted">not run yet</span>;
  if (row.skipReason && !row.launched && row.quality === null) return <span className="warn" title={row.error}>{row.skipReason}</span>;
  return (
    <span title={row.error ?? ""}>
      {row.launched ? "launches" : row.quality === null ? "–" : `quality ${row.quality.toFixed(0)}`} · {row.runsOn === "unknown" ? "?" : row.runsOn.toUpperCase()} · {num(row.tokPerSec)} tok/s · first token {num(row.ttftSec, 2)} s · load {num(row.coldStartSec)} s
    </span>
  );
}

/**
 * Developer settings: the same models through GenieX (llama.cpp, GGUF) and through Microsoft Foundry Local (its own ONNX build), one after
 * the other on this PC, side by side. One button does everything: installs Foundry Local if it is missing, reads its list of models, picks the
 * models both have, and runs the comparison. The benchmark does the work; this page starts it and reads it.
 */
export function EngineCompare() {
  const [status, setStatus] = useState<Status | null>(null);
  const [flow, setFlow] = useState<Flow>({ running: false, steps: [] });
  const [state, setState] = useState<BenchState | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("launch");
  const [count, setCount] = useState(6);
  const [error, setError] = useState("");
  const [exported, setExported] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try { setStatus(await api().foundryStatus()); } finally { setLoading(false); }
  };
  useEffect(() => {
    void refresh();
    void api().benchState().then(setState);
    void api().engineCompareState().then(setFlow);
    const offBench = api().onBench(setState);
    const offFlow = api().onEngineCompare((f) => { setFlow(f); if (!f.running) void refresh(); });
    return () => { offBench(); offFlow(); };
  }, []);
  const running = !!state?.running;
  const busy = flow.running || running;
  const pairs = status?.pairs ?? [];
  const rows = new Map((state?.rows ?? []).map((r) => [r.key, r]));
  const shown = pairs.filter((p) => rows.has(p.key) || rows.has(p.twinKey));
  const chosen = pairs.filter((p) => picked.has(p.key));
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const faster = (g?: BenchRow, f?: BenchRow) => {
    if (!g || !f || !g.tokPerSec || !f.tokPerSec) return "";
    return g.tokPerSec === f.tokPerSec ? "tie" : g.tokPerSec > f.tokPerSec ? "GenieX faster" : "Foundry Local faster";
  };
  const go = async () => {
    setError(""); setExported("");
    const r = await api().engineCompareStart({ mode: mode === "launch" ? "launch" : "express", maxPairs: count });
    if (!r.ok) setError(r.error ?? "Could not start.");
  };
  const startPicked = async () => {
    setError(""); setExported("");
    const r = await api().benchStart({ keys: chosen.flatMap((p) => [p.twinKey, p.key]), mode, keepInstalled: false, resume: false, warmupMin: 0 });
    if (!r.ok) setError(r.error ?? "Could not start.");
  };

  return (
    <div className="engine-compare">
      <p className="muted small">
        Microsoft Foundry Local is Microsoft's own way to run models on this PC (ONNX models it prepared itself). GenieX is Qualcomm's (GGUF files, llama.cpp).
        One click installs Foundry Local if it is missing, reads its list of models, picks the models both engines have, and asks them the same things one after the other on this PC.
        You get the two side by side: does it launch, on what (NPU, hybrid, CPU), how fast, and, in the complete mode, how well it answers.
        Each model is downloaded, tested and removed (a model Foundry Local already had is kept). Only one engine uses the NPU at a time.
      </p>

      <div className="row small">
        <button className="primary" disabled={busy || loading} onClick={() => void go()}>{status?.installed ? "Compare GenieX and Foundry Local" : "Install Foundry Local and compare"}</button>
        <label>How
          <select value={mode} disabled={busy} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="launch">Quick: does each model launch, and how fast</option>
            <option value="express">Complete: also short quality tests (slower)</option>
          </select>
        </label>
        <label>Models
          <select value={count} disabled={busy} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={3}>the 3 smallest</option>
            <option value={6}>the 6 smallest</option>
            <option value={12}>the 12 smallest</option>
            <option value={99}>all of them</option>
          </select>
        </label>
        {running && <button onClick={() => void api().benchStop()}>Stop</button>}
      </div>
      {!status?.installed && status && <div className="muted small">Foundry Local is not installed on this PC. The button installs it with winget (Windows asks for permission), which takes a few minutes.</div>}
      {status?.installed && <div className="muted small">Foundry Local {status.version} is installed · {status.models} models in its list{status.source === "known" ? " (its list could not be read: the usual models are asked for by name)" : ""} · {pairs.length} of them are also in the benchmark list. <button className="linkbtn" onClick={() => void refresh()} disabled={loading || busy}>Refresh</button></div>}

      {flow.steps.length > 0 && (
        <ol className="small compare-steps">
          {flow.steps.map((s) => (
            <li key={s.id} className={s.status === "failed" ? "warn" : ""}><strong>{MARK[s.status]} {s.label}</strong>{s.detail ? <span className="muted"> · {s.detail}</span> : null}</li>
          ))}
        </ol>
      )}
      {error && <div className="error-box">{error}</div>}

      {running && state && <div className="muted small">{state.current ? `${state.current}: ${state.phase}` : state.phase} · model {state.modelIndex} of {state.modelCount}</div>}
      {shown.length > 0 && (
        <table className="small bd-table">
          <thead><tr><th>Model</th><th>GenieX</th><th>Foundry Local</th><th>Speed</th></tr></thead>
          <tbody>
            {shown.map((p) => {
              const g = rows.get(p.twinKey), f = rows.get(p.key);
              return (
                <tr key={p.key}>
                  <td>{p.name}<span className="muted"> · {p.sizeGB.toFixed(1)} GB{p.device ? ` · Foundry builds it for ${p.device}` : ""}</span></td>
                  <td><Cell row={g} /></td>
                  <td><Cell row={f} /></td>
                  <td>{faster(g, f)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {state && !running && shown.length > 0 && (
        <div className="row">
          <button onClick={async () => { const r = await api().benchExport(); setExported(r.ok ? `Report written: ${r.report}` : r.error ?? "Nothing to export."); }}>Export the report</button>
          {exported && <span className="muted small">{exported}</span>}
        </div>
      )}

      {pairs.length > 0 && (
        <details className="small">
          <summary>Choose the models yourself</summary>
          <div className="row">
            <button className="ghost" disabled={busy} onClick={() => setPicked(new Set(pairs.map((p) => p.key)))}>All</button>
            <button className="ghost" disabled={busy} onClick={() => setPicked(new Set(pairs.filter((p) => p.sizeGB <= 3).map((p) => p.key)))}>3 GB or less</button>
            <button className="ghost" disabled={busy} onClick={() => setPicked(new Set())}>None</button>
            <button className="primary" disabled={busy || !chosen.length} onClick={() => void startPicked()}>Compare the {chosen.length} ticked on both</button>
          </div>
          {pairs.map((p) => (
            <label key={p.key} className="check"><input type="checkbox" checked={picked.has(p.key)} disabled={busy} onChange={() => toggle(p.key)} /> {p.name} <span className="muted">({p.sizeGB.toFixed(1)} GB)</span></label>
          ))}
        </details>
      )}
      {status && status.log.length > 0 && (
        <details className="small"><summary>What the foundry commands answered ({status.log.length} lines)</summary><CopyLog lines={status.log} /><pre>{status.log.join("\n")}</pre></details>
      )}
    </div>
  );
}
