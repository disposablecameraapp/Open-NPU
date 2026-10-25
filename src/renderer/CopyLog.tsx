import { useState } from "react";

/** Copies the whole log of the run (errors and the server's last lines included), to paste into a bug report or to Claude. */
export function CopyLog({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="linkbtn" onClick={async () => { try { await navigator.clipboard.writeText(lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ } }}>
      {copied ? "Copied" : "Copy full log"}
    </button>
  );
}
