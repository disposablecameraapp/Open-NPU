import { useState, type ReactNode } from "react";
import { Chevron } from "./Activity";

/** A picture in an answer (chart, diagram, figures, Wikimedia picture) the reader can fold into a card: title and kind on the left, a small preview on the right. */
export function Foldable({ title, kind, children, disabled }: { title: string; kind: string; children: ReactNode; disabled?: boolean }) {
  const [folded, setFolded] = useState(false);
  // the picture is still being written: nothing to fold yet
  if (disabled) return <>{children}</>;
  if (folded) {
    return (
      // a div, not a button: the preview holds the real block, which has buttons of its own
      <div className="vis-card" role="button" tabIndex={0} aria-label={`Show: ${title}`} onClick={() => setFolded(false)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFolded(false); } }}>
        <span className="vis-card-text">
          <strong>{title}</strong>
          <span className="muted small">{kind} · click to show</span>
        </span>
        <span className="vis-card-thumb" aria-hidden="true" {...{ inert: true }}><span className="vis-card-scaled">{children}</span></span>
      </div>
    );
  }
  return (
    <div className="vis">
      <button type="button" className="vis-fold" aria-expanded="true" onClick={() => setFolded(true)} title="Fold into a card"><Chevron />Fold</button>
      {children}
    </div>
  );
}
