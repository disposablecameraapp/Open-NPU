import type { SetupState } from "../core/setup";
import { api } from "./api";

const ICON = { pending: "○", running: "◐", done: "✓", error: "!", skipped: "–" } as const;

/** First-launch screen: installs what the app needs, shows progress, never traps the user. */
export function SetupScreen({ state }: { state: SetupState }) {
  const busy = state.steps.some((s) => s.state === "running" || s.state === "pending");
  return (
    <div className="setup">
      <div className="setup-card">
        <div className="spark">✺</div>
        <h1 className="serif">{busy ? "Setting things up" : "Almost there"}</h1>
        <p className="muted">Open NPU is installing what it needs. This happens once.</p>
        <div className="steps">
          {state.steps.map((s) => (
            <div key={s.id} className={`step ${s.state}`}>
              <div className="step-icon">{ICON[s.state]}</div>
              <div className="grow">
                <div><strong>{s.label}</strong></div>
                <div className="muted small">{s.state === "running" ? s.message : s.state === "error" ? "" : s.state === "done" || s.state === "skipped" ? s.message : s.detail}</div>
                {s.state === "running" && <div className="track"><div className={`fill ${s.percent === null ? "indet" : ""}`} style={{ width: `${s.percent ?? 40}%` }} /></div>}
                {s.error && <div className="error-box">{s.error}</div>}
              </div>
              <div className="step-actions">
                {s.state === "error" && <button className="primary" onClick={() => void api().setupRetry(s.id)}>Retry</button>}
                {(s.state === "pending" || s.state === "error") && <button className="ghost" onClick={() => void api().setupSkip(s.id)}>Skip</button>}
              </div>
            </div>
          ))}
        </div>
        {!busy && <button className="primary" onClick={() => void api().setupDismiss()}>{state.steps.some((s) => s.state === "error") ? "Continue anyway" : "Start"}</button>}
        <div className="muted small">You can change or reinstall any of this later in Settings.</div>
      </div>
    </div>
  );
}
