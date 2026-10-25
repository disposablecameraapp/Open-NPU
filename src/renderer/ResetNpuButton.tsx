import { useState } from "react";
import { api } from "./api";

/** Stops geniex and restarts the NPU's device (Windows asks for permission): what a failed load can need instead of restarting the PC. */
export function ResetNpuButton({ onDone, label = "Reset the NPU" }: { onDone?: () => void; label?: string }) {
  const [state, setState] = useState<"idle" | "busy" | { ok: boolean; message: string }>("idle");
  return (
    <span className="reset-npu">
      <button type="button" disabled={state === "busy"} title="Stops geniex and restarts the NPU's driver. Windows asks for permission. If models still fail afterwards, restart the PC." onClick={async () => { setState("busy"); const r = await api().npuReset(); setState(r); if (r.ok) onDone?.(); }}>
        {state === "busy" ? "Resetting the NPU…" : label}
      </button>
      {typeof state === "object" && <div className={`small ${state.ok ? "muted" : "warn"}`}>{state.message}</div>}
    </span>
  );
}
