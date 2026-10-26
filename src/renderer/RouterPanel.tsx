import { useEffect, useState } from "react";
import { api } from "./api";
import type { RouterStatus } from "../shared/api";
import type { Settings } from "../shared/types";
import { CATEGORY_INFO, type TaskCategory } from "../core/dynamic";

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
  const refresh = () => api().routerStatus().then(setSt).catch(() => undefined);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 4000); return () => clearInterval(t); }, []);
  const install = async () => {
    setBusy(true); setError(null);
    try { const r = await api().routerInstall(); if (!r.done) setError(r.failures.join(" ") || "The download did not finish."); } catch (e) { setError((e as Error).message); }
    setBusy(false); void refresh();
  };
  const test = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await api().routerTest(text);
      const label = (k: string | null) => (k && k in CATEGORY_INFO ? CATEGORY_INFO[k as TaskCategory].label : k ?? "no answer");
      setResult(`Router: ${label(r.kind)} in ${(r.ms / 1000).toFixed(1)} s. The words alone said: ${label(r.rules.category)} (${Math.round(r.rules.confidence * 100)} %).`);
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
      <p className="muted small">The words sort most requests at once. When they are unsure, this small model reads the request and names its kind in about a second, so the right model answers.</p>
      {st && !st.installed && <div className="row"><button className="primary" disabled={busy} onClick={() => void install()}>{busy ? "Installing…" : `Install the router (${st.sizeGB} GB)`}</button></div>}
      {st?.installed && (
        <>
          <label className="check small"><input type="checkbox" checked={settings.dynamic?.router !== false} onChange={(e) => void onSave({ dynamic: { ...settings.dynamic, router: e.target.checked } })} /> Use the router</label>
          <div className="row">
            <input className="grow" value={text} onChange={(e) => setText(e.target.value)} aria-label="A request to try the router on" />
            <button disabled={busy || !text.trim()} onClick={() => void test()}>{busy ? "Sorting…" : "Try"}</button>
          </div>
          {result && <div className="small">{result}</div>}
          {st.asked > 0 && <div className="muted small">{st.asked} requests sorted · last one {st.lastMs !== null ? `${(st.lastMs / 1000).toFixed(1)} s` : "–"}</div>}
        </>
      )}
      {(error || st?.lastError) && <div className="warn small">{error ?? st?.lastError}</div>}
    </div>
  );
}
