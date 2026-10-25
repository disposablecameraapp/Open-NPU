import { useState } from "react";
import { api } from "./api";

/** One button that copies what someone helping needs (machine, NPU, versions, bundles, settings, recent logs), so a user can paste it into a bug report. */
export function CopySupport() {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "failed">("idle");
  const copy = async () => {
    setState("busy");
    try {
      await navigator.clipboard.writeText(await api().supportInfo());
      setState("copied");
    } catch { setState("failed"); }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <span>
      <button className="ghost" disabled={state === "busy"} onClick={() => void copy()}>
        {state === "busy" ? "Collecting…" : state === "copied" ? "Copied: paste it in your message" : state === "failed" ? "Could not copy" : "Copy support info"}
      </button>
      <span className="muted small"> Machine, NPU, versions and recent logs, to paste when you ask for help. No chat and no file content in it.</span>
    </span>
  );
}
