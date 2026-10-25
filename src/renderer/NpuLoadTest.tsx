import { useEffect, useState } from "react";
import { api } from "./api";
import { CopyLog } from "./CopyLog";
import { LOAD_SETTINGS } from "../core/npuTest";

type Roster = Awaited<ReturnType<ReturnType<typeof api>["npuTestRoster"]>>;
type State = Awaited<ReturnType<ReturnType<typeof api>["npuTestState"]>>;

/**
 * Developer settings: loads models that will not load under a series of settings and reports which ones make them load,
 * with the server's own error for each failure. The benchmark does the same when a model fails, but only inside a run.
 */
export function NpuLoadTest() {
  const [roster, setRoster] = useState<Roster>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [hybrid, setHybrid] = useState(false);
  const [state, setState] = useState<State>({ running: false, lines: [], results: [] });
  const [error, setError] = useState("");
  const [kept, setKept] = useState<NonNullable<import("../shared/types").Settings["loadProfiles"]>>({});
  useEffect(() => { void api().settings().then((s) => { setKept(s.loadProfiles ?? {}); setHybrid(!!s.allowHybridLoad); }); }, [state.running]);
  const forget = async (ref: string) => { const { [ref]: _gone, ...rest } = kept; setKept(rest); await api().saveSettings({ loadProfiles: rest }); };
  useEffect(() => {
    void api().npuTestRoster().then((r) => {
      setRoster(r);
      // at most 3, so the log is clear: of the models that did not load, the smallest, a middle one and the biggest
      const bad = r.filter((m) => m.failedBefore).sort((a, b) => a.sizeGB - b.sizeGB);
      const few = bad.length <= 3 ? bad : [bad[0], bad[Math.floor(bad.length / 2)], bad[bad.length - 1]];
      setPicked(new Set(few.map((m) => m.id)));
    });
    void api().npuTestState().then(setState);
    return api().onNpuTest(setState);
  }, []);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < 3) n.add(id); return n; });
  const start = async () => { setError(""); const r = await api().npuTestStart([...picked], all, hybrid); if (!r.ok) setError(r.error ?? "Could not start."); };
  return (
    <div className="npu-test">
      <p className="muted small">
        Some models will not load on the NPU (the log says <code>Model loading failed</code> or <code>fastrpc_mmap failed</code>). This test loads the models you tick under {LOAD_SETTINGS.length} different
        settings, one after the other, from the one that costs the model the least (several NPU sessions, smaller memory pieces) to the one that costs the most (a small window), all on the NPU; hybrid mode (NPU + CPU), then CPU only, come last and only if you tick it, and tells which make the model load. The first setting that works is kept for that model: the app starts it that way from then on, in the chat and in the benchmark, which does the same by itself when a model will not load. Pick at most 3 models so the log is clear.
        For each try it keeps the server's own error lines, the NPU sessions and buffers it used, and the memory taken. It stops at the first setting that works, unless you tick the box below.
        Nothing is installed or removed. It takes a few minutes per model, and the chat is not available meanwhile.
      </p>
      <details className="small"><summary>What it tries</summary>
        <ol>{LOAD_SETTINGS.map((s) => <li key={s.id}><strong>{s.label}</strong>: {s.why}</li>)}</ol>
      </details>
      {roster.length === 0 ? <div className="muted small">No model is installed.</div> : (
        <div className="small">
          <div className="muted">Installed models, at most 3 at a time. Some that did not load in the last benchmark are ticked: the smallest, a middle one and the biggest.</div>
          {roster.map((m) => (
            <label key={m.id} className="check"><input type="checkbox" checked={picked.has(m.id)} disabled={state.running || (!picked.has(m.id) && picked.size >= 3)} onChange={() => toggle(m.id)} /> {m.name} <span className="muted">({m.sizeGB.toFixed(1)} GB{m.failedBefore ? ", did not load before" : ""})</span></label>
          ))}
        </div>
      )}
      <label className="check small"><input type="checkbox" checked={all} disabled={state.running} onChange={(e) => setAll(e.target.checked)} /> Try every setting even after one worked (slower, shows exactly where the limit is)</label>
      <label className="check small"><input type="checkbox" checked={hybrid} disabled={state.running} onChange={(e) => { setHybrid(e.target.checked); void api().saveSettings({ allowHybridLoad: e.target.checked }); }} /> Also try hybrid mode, then CPU only, as a last resort, here and in the benchmark (the model then gets a Hybrid or CPU badge instead of NPU)</label>
      <div className="row">
        {state.running ? <button onClick={() => void api().npuTestStop()}>Stop</button> : <button className="primary" disabled={!picked.size} onClick={() => void start()}>Test these models</button>}
        {state.lines.length > 0 && <CopyLog lines={state.lines} />}
      </div>
      {error && <div className="error-box">{error}</div>}
      {Object.keys(kept).length > 0 && (
        <div className="small">
          <strong>Kept settings</strong> <span className="muted">(the app starts these models this way)</span>
          {Object.entries(kept).map(([ref, p]) => (
            <div key={ref}>{ref}: {p.label}{p.compute === "hybrid" ? " (NPU + CPU)" : p.compute === "cpu" ? " (CPU only)" : ""}{p.maxCtx ? ` (window up to ${p.maxCtx})` : ""} <button className="linkbtn" onClick={() => void forget(ref)}>Forget</button></div>
          ))}
        </div>
      )}
      {state.results.length > 0 && !state.running && (
        <table className="small"><thead><tr><th>Model</th><th>Setting</th><th>Result</th><th>Window</th><th>Sessions</th></tr></thead>
          <tbody>{state.results.map((r, i) => <tr key={i}><td>{r.model}</td><td>{r.label}</td><td>{r.ok ? "loaded" : r.cause ?? r.error}</td><td>{r.window ?? ""}</td><td>{r.sessions.join(" ")}</td></tr>)}</tbody></table>
      )}
      {state.lines.length > 0 && <details open={state.running}><summary className="small">Log ({state.lines.length} lines)</summary><pre>{state.lines.join("\n")}</pre></details>}
    </div>
  );
}
