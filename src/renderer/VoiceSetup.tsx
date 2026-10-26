import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { LiveText } from "../core/live";
import { MicSession } from "./audio";
import type { VoiceDownloadProgress, VoiceKind, VoiceNeed, VoiceSettings } from "../shared/types";

/** The Dynamic pack a voice chat would be missing a model of: its name, the models still to install and their size. */
export interface VoicePack { id: string; label: string; models: string[]; sizeGB: number }

const KIND_TEXT: Record<VoiceKind, string> = { stt: "Dictation (speech to text)", tts: "Read-aloud voice (text to speech)" };

/**
 * Shown when the microphone or the voice chat is used without the speech models: says which ones, and installs them in one click, with their
 * progress, so nothing has to be looked for in the settings. `onDone` is called once they are there (at once when nothing is missing).
 */
export function VoiceSetup({ kinds, pack, onDone, onCancel, onSettings }: { kinds: VoiceKind[]; pack: VoicePack | null; onDone: (declinedPack?: boolean) => void; onCancel: () => void; onSettings: () => void }) {
  const [needs, setNeeds] = useState<VoiceNeed[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, VoiceDownloadProgress>>({});
  const [withPack, setWithPack] = useState(true);
  const [packStep, setPackStep] = useState<string | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let live = true;
    void api().voiceNeeds(kinds).then((n) => { if (!live) return; if (n.length === 0 && !pack) done.current(); else setNeeds(n); }).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [kinds]);
  useEffect(() => api().onVoiceDownload((p) => setProgress((m) => ({ ...m, [p.id]: p }))), []);
  useEffect(() => api().onDynamicInstall((p) => { if (p.phase === "start") setPackStep(`${p.name} (${p.step}/${p.total})`); }), []);

  const install = async (alt: boolean) => {
    setBusy(true); setError(null);
    try {
      const r = kinds.length ? await api().voiceQuickInstall(kinds, alt) : { ok: true as const, error: undefined };
      if (!r.ok) { setError(r.error ?? "The installation did not finish."); setBusy(false); return; }
      if (pack && withPack) await api().installDynamic(pack.id);
      done.current(!!pack && !withPack);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const alt = needs?.some((n) => n.alt) ?? false;
  const total = (needs?.reduce((n, x) => n + x.model.sizeMB, 0) ?? 0) + (pack && withPack ? Math.round(pack.sizeGB * 1024) : 0);
  const failed = Object.values(progress).find((p) => p.phase === "error");
  return (
    <div className="modal-backdrop voice-setup-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal voice-setup" role="dialog" aria-modal="true" aria-label="Install the voice models" onClick={(e) => e.stopPropagation()}>
        <h2>{kinds.length === 0 && pack ? "Voice chat works best with its fast model" : kinds.length > 1 ? "Voice chat needs two small models" : "Dictation needs a speech model"}</h2>
        {!needs && !error && <div className="muted">Looking at what this PC can run…</div>}
        {needs?.map((n) => {
          const p = progress[n.model.id] ?? (n.alt ? progress[n.alt.id] : undefined);
          const active = busy && p && (p.phase === "downloading" || p.phase === "extracting");
          return (
            <div key={n.kind} className="voice-need">
              <div><strong>{KIND_TEXT[n.kind]}</strong></div>
              <div>{n.model.name}{n.model.device === "NPU" && <span className="tag">NPU</span>} <span className="muted small">~{n.model.sizeMB} MB · {n.model.languages}</span></div>
              <div className="muted small">{n.model.note}</div>
              {active && <div className="install-progress"><div className="track"><div className="fill" style={{ width: `${p.percent ?? 100}%` }} /></div><span className="small muted">{p.phase === "extracting" ? "Unpacking…" : p.percent === null ? "Downloading…" : `${p.percent}%`}</span></div>}
            </div>
          );
        })}
        {pack && needs && (
          <label className="voice-need check">
            <span><input type="checkbox" checked={withPack} disabled={busy} onChange={(e) => setWithPack(e.target.checked)} /> <strong>Install the complete {pack.label} pack</strong> <span className="muted small">~{pack.sizeGB} GB</span></span>
            <span className="muted small">Voice chat answers with Qwen3.5-2B, a small model that runs wholly on the NPU, and it is part of this pack: {pack.models.join(", ")}.{busy && withPack && packStep ? ` Installing ${packStep}…` : ""}</span>
          </label>
        )}
        {(error || failed?.error) && <div className="error-box"><strong>{failed?.error?.title ?? "Could not install"}</strong><div>{failed?.error?.fix ?? error}</div>{failed?.error?.raw && <div className="small muted">{failed.error.raw}</div>}</div>}
        {needs && (
          <div className="voice-setup-actions">
            <button className="primary" disabled={busy} onClick={() => void install(false)}>{busy ? "Installing…" : `Install${total ? ` (~${total >= 1024 ? `${(total / 1024).toFixed(1)} GB` : `${total} MB`})` : ""} and continue`}</button>
            {kinds.length === 0 && pack && <button className="ghost" disabled={busy} onClick={() => done.current(true)}>Continue with my current model</button>}
            {alt && <button className="ghost" disabled={busy} onClick={() => void install(true)}>Use the processor model instead</button>}
            <button className="ghost" disabled={busy} onClick={onSettings}>Choose in settings</button>
            {(kinds.length > 0 || !pack) && <button className="ghost" disabled={busy} onClick={onCancel}>Not now</button>}
          </div>
        )}
        {!needs && error && <div className="voice-setup-actions"><button className="ghost" onClick={onCancel}>Close</button></div>}
      </div>
    </div>
  );
}

/** Words as they are being said: the ones the recognizer agrees on are solid, the last ones still move. */
export function LiveWords({ text, className = "" }: { text: LiveText | null; className?: string }) {
  if (!text || (!text.settled && !text.moving)) return null;
  return <div className={`live-words ${className}`} aria-live="polite">{text.settled && <span>{text.settled} </span>}<span className="moving">{text.moving}</span></div>;
}

/** Settings: the microphone level against the threshold, to set it by looking at it. */
export function MicTest({ voice }: { voice: VoiceSettings }) {
  const [on, setOn] = useState(false);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mic = useRef<MicSession | null>(null);
  const cfg = useRef(voice);
  cfg.current = voice;
  useEffect(() => { mic.current?.configure(voice); }, [voice]);
  useEffect(() => () => mic.current?.stop(), []);
  const toggle = async () => {
    if (on) { mic.current?.stop(); mic.current = null; setOn(false); setLevel(0); return; }
    setErr(null); setHeard(false);
    const m = new MicSession({ level: setLevel, event: (e) => { if (e.type === "end") { setHeard(true); setTimeout(() => setHeard(false), 1200); } } });
    m.configure(cfg.current);
    try { await m.start(); mic.current = m; setOn(true); } catch (e) { setErr((e as Error).message || "Could not open the microphone."); }
  };
  return (
    <div className="mic-test">
      <button type="button" className="ghost" onClick={() => void toggle()}>{on ? "Stop the test" : "Test the microphone"}</button>
      {on && (
        <div className="mic-meter" aria-label="Microphone level">
          <div className="track"><div className="fill" style={{ width: `${Math.round(level * 100)}%` }} /></div>
          <div className="mic-threshold" style={{ left: `${Math.min(100, voice.minLevel * 8 * 100)}%` }} title="Quietest sound that counts" />
          <span className="small muted">{heard ? "Heard: this would be transcribed" : level * 100 > voice.minLevel * 8 * 100 ? "Above the threshold…" : "Below the threshold: ignored"}</span>
        </div>
      )}
      {err && <div className="error-box">{err}</div>}
    </div>
  );
}
