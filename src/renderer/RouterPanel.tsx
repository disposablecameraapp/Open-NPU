import { useEffect, useState } from "react";
import { api } from "./api";
import type { RouterStatus } from "../shared/api";
import type { Settings } from "../shared/types";
import { CATEGORY_INFO, type TaskCategory } from "../core/dynamic";
import { TREE } from "../core/router";

/**
 * The router of the Dynamic model: a tiny model that reads each request the words are unsure about and names its kind. It runs on the
 * processor in a server of its own, so the NPU keeps the chat's model and sorting never waits for a model swap.
 */
export function RouterPanel({ settings, onSave }: { settings: Settings; onSave: (p: Partial<Settings>) => void | Promise<void> }) {
  const [st, setSt] = useState<RouterStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("explique moi les interets cumuler avec un diagram interactif");
  const [result, setResult] = useState<string | null>(null);
  const [cands, setCands] = useState<{ chosen: string | null; candidates: { id: string; name: string; sizeGB: number }[] } | null>(null);
  const [bench, setBench] = useState<Awaited<ReturnType<ReturnType<typeof api>["routerBench"]>> | null>(null);
  const refresh = () => { void api().routerStatus().then(setSt).catch(() => undefined); void api().routerCandidates().then(setCands).catch(() => undefined); };
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 4000); return () => clearInterval(t); }, []);
  const install = async () => {
    setBusy(true); setError(null);
    try { const r = await api().routerInstall(); if (!r.done) setError(r.failures.join(" ") || "The download did not finish."); } catch (e) { setError((e as Error).message); }
    setBusy(false); void refresh();
  };
  const findFastest = async () => {
    setBusy(true); setError(null); setBench(null);
    try { setBench(await api().routerBench()); } catch (e) { setError((e as Error).message); }
    setBusy(false); void refresh();
  };
  const test = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await api().routerTest(text);
      const label = (k: string | null) => (k && k in CATEGORY_INFO ? CATEGORY_INFO[k as TaskCategory].label : k ?? "no answer");
      const qa = r.asked.map((a) => `${TREE[a.id]?.ask.replace(/\?$/, "") ?? a.id} → ${a.yes ? "yes" : "no"}`);
      setResult(`Router: ${label(r.kind)}, ${r.asked.length} question${r.asked.length === 1 ? "" : "s"} in ${(r.ms / 1000).toFixed(1)} s${r.asked.length ? ` (${(r.ms / r.asked.length / 1000).toFixed(2)} s each)` : ""}. The words alone said: ${label(r.rules.category)} (${Math.round(r.rules.confidence * 100)} %).${qa.length ? `\n${qa.join("\n")}` : ""}`);
    } catch (e) { setResult((e as Error).message); }
    setBusy(false); void refresh();
  };
  return (
    <div className="router-panel">
      <div className="router-head">
        <strong>Router</strong>
        <span className="muted small">{st ? `${st.model} · ${st.sizeGB} GB · runs on the processor, not on the NPU` : "…"}</span>
        {st?.installed && <span className={`stage ${st.running ? "done" : "skipped"}`}>{st.running ? "ready" : "starts with the first request"}</span>}
      </div>
      <p className="muted small">The words sort most requests at once. When they are unsure, this small model is asked a few simple yes/no questions about the request, each answered in one word, and the answers lead to its kind.</p>
      {st && !st.installed && <div className="row"><button className="primary" disabled={busy} onClick={() => void install()}>{busy ? "Installing…" : `Install the router (${st.sizeGB} GB)`}</button></div>}
      {st?.installed && (
        <>
          <label className="check small"><input type="checkbox" checked={settings.dynamic?.router !== false} onChange={(e) => void onSave({ dynamic: { ...settings.dynamic, router: e.target.checked } })} /> Use the router</label>
          <div className="row">
            <label className="small">Model
              <select value={cands?.chosen ?? ""} onChange={(e) => void Promise.resolve(onSave({ dynamic: { ...settings.dynamic, routerModel: e.target.value || undefined } })).then(refresh)}>
                {(cands?.candidates ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.sizeGB} GB</option>)}
              </select>
            </label>
            <button disabled={busy || (cands?.candidates.length ?? 0) < 2} onClick={() => void findFastest()} title="Asks each small installed model the same few questions and keeps the quickest that answers them all right">{busy ? "Testing…" : "Find the fastest"}</button>
          </div>
          {bench && (
            <div className="small router-bench">
              {bench.rows.map((r) => <div key={r.id} className={r.id === bench.chosen ? "on" : ""}>{r.id === bench.chosen ? "✓ " : ""}{r.name}: {r.error ? `failed (${r.error})` : `${r.ms} ms per question, ${r.right} of ${r.total} right`}</div>)}
              {!bench.chosen && <div className="warn">None answered every question right: the model stays as it was.</div>}
            </div>
          )}
          <div className="row">
            <input className="grow" value={text} onChange={(e) => setText(e.target.value)} aria-label="A request to try the router on" />
            <button disabled={busy || !text.trim()} onClick={() => void test()}>{busy ? "Sorting…" : "Try"}</button>
          </div>
          {result && <pre className="small router-result">{result}</pre>}
          {st.asked > 0 && <div className="muted small">{st.asked} requests sorted · last one {st.lastMs !== null ? `${(st.lastMs / 1000).toFixed(1)} s` : "–"}</div>}
        </>
      )}
      {(error || st?.lastError) && <div className="warn small">{error ?? st?.lastError}</div>}
    </div>
  );
}
