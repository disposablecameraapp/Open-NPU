import { useEffect, useState } from "react";
import { api } from "./api";
import { CopyLog } from "./CopyLog";
import type { BenchRow, BenchState } from "../core/benchRunner";

type Status = Awaited<ReturnType<ReturnType<typeof api>["foundryStatus"]>>;
type Mode = "launch" | "express" | "quick";

const num = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "–" : n.toFixed(d));

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
 * Developer settings: the same models through GenieX (llama.cpp, GGUF) and through Microsoft Foundry Local (its own ONNX build),
 * one after the other on this PC, side by side. The benchmark does the work; this page picks the pairs and reads them.
 */
export function EngineCompare() {
  const [status, setStatus] = useState<Status | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("launch");
  const [state, setState] = useState<BenchState | null>(null);
  const [error, setError] = useState("");
  const [exported, setExported] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try {
      const s = await api().foundryStatus();
      setStatus(s);
      setPicked((p) => (p.size ? p : new Set(s.pairs.filter((x) => x.sizeGB <= 3).slice(0, 8).map((x) => x.key))));
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); void api().benchState().then(setState); return api().onBench(setState); }, []);
  const running = !!state?.running;
  const pairs = status?.pairs ?? [];
  const chosen = pairs.filter((p) => picked.has(p.key));
  const start = async () => {
    setError(""); setExported("");
    const keys = chosen.flatMap((p) => [p.twinKey, p.key]);
    const r = await api().benchStart({ keys, mode, keepInstalled: false, resume: false, warmupMin: 0 });
    if (!r.ok) setError(r.error ?? "Could not start.");
  };
  const rows = new Map((state?.rows ?? []).map((r) => [r.key, r]));
  const toggle = (k: string) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const faster = (g?: BenchRow, f?: BenchRow) => {
    if (!g || !f || !g.tokPerSec || !f.tokPerSec) return "";
    return g.tokPerSec === f.tokPerSec ? "tie" : g.tokPerSec > f.tokPerSec ? "GenieX faster" : "Foundry Local faster";
  };

  return (
    <div className="engine-compare">
      <p className="muted small">
        Microsoft Foundry Local is Microsoft's own way to run models on this PC (ONNX models it prepared itself, on the hardware it picks). GenieX is Qualcomm's (GGUF files, llama.cpp).
        This page asks the <strong>same models</strong> the same things through both, one after the other on this PC, and shows the results side by side: does it launch, on what (NPU, hybrid, CPU), how fast, and, in Express or Quick, how well it answers.
        Each model is downloaded, tested and removed (a model Foundry Local already had is kept). Only one engine uses the NPU at a time.
      </p>
      {!status ? <div className="muted small">Looking for Foundry Local…</div> : !status.installed ? (
        <div className="error-box">
          <strong>Foundry Local was not found.</strong>
          <div>Install it from Microsoft (its documentation explains how), then check that <code>foundry --version</code> answers in PowerShell, and press Refresh. This comparison is written from Foundry Local's documentation and has not been tried against a real install: if a step fails, the log below says what its commands answered.</div>
          <button onClick={() => void refresh()} disabled={loading}>{loading ? "Looking…" : "Refresh"}</button>
        </div>
      ) : (
        <>
          <div className="small">Foundry Local {status.version} · {status.models} models in its catalog on this PC · {pairs.length} of them are also in the benchmark list{status.foundryOnly ? `, ${status.foundryOnly} only Foundry Local has` : ""}. <button className="linkbtn" onClick={() => void refresh()} disabled={loading || running}>Refresh</button></div>
          {pairs.length === 0 && <div className="muted small">None of Foundry Local's models matches a model of the benchmark list by name. The benchmark list (Model benchmark below) still shows the models only Foundry Local has.</div>}
          {pairs.length > 0 && (
            <>
              <div className="row small">
                <label>Tests
                  <select value={mode} disabled={running} onChange={(e) => setMode(e.target.value as Mode)}>
                    <option value="launch">Launch check: does it load, on what, how fast (the quickest)</option>
                    <option value="express">Express: short quality tests too</option>
                    <option value="quick">Quick: more quality tests</option>
                  </select>
                </label>
                <button className="ghost" disabled={running} onClick={() => setPicked(new Set(pairs.map((p) => p.key)))}>All</button>
                <button className="ghost" disabled={running} onClick={() => setPicked(new Set(pairs.filter((p) => p.sizeGB <= 3).map((p) => p.key)))}>3 GB or less</button>
                <button className="ghost" disabled={running} onClick={() => setPicked(new Set())}>None</button>
              </div>
              <table className="small bd-table">
                <thead><tr><th /><th>Model</th><th>Size</th><th>GenieX</th><th>Foundry Local</th><th>Speed</th></tr></thead>
                <tbody>
                  {pairs.map((p) => {
                    const g = rows.get(p.twinKey), f = rows.get(p.key);
                    return (
                      <tr key={p.key}>
                        <td><input type="checkbox" checked={picked.has(p.key)} disabled={running} onChange={() => toggle(p.key)} /></td>
                        <td>{p.name}<span className="muted"> · Foundry builds it for {p.device || "?"}</span></td>
                        <td>{p.sizeGB.toFixed(1)} GB</td>
                        <td><Cell row={g} /></td>
                        <td><Cell row={f} /></td>
                        <td>{faster(g, f)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="row">
                {running ? <button onClick={() => void api().benchStop()}>Stop</button> : <button className="primary" disabled={!chosen.length} onClick={() => void start()}>Compare {chosen.length} model{chosen.length === 1 ? "" : "s"} on both</button>}
                {state && !running && state.rows.length > 0 && <button onClick={async () => { const r = await api().benchExport(); setExported(r.ok ? `Report written: ${r.report}` : r.error ?? "Nothing to export."); }}>Export the report</button>}
                {running && state && <span className="muted small">{state.current ? `${state.current}: ${state.phase}` : state.phase} · {state.modelIndex} of {state.modelCount}</span>}
              </div>
              {exported && <div className="muted small">{exported}</div>}
            </>
          )}
        </>
      )}
      {error && <div className="error-box">{error}</div>}
      {status && status.log.length > 0 && (
        <details className="small"><summary>What the foundry commands answered ({status.log.length} lines)</summary><CopyLog lines={status.log} /><pre>{status.log.join("\n")}</pre></details>
      )}
    </div>
  );
}
