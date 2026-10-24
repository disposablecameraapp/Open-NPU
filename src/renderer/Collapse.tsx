import type { ReactNode } from "react";

/** Height-free collapse: animates grid-template-rows 0fr/1fr, content stays mounted but unreachable while closed. */
export function Collapse({ open, children, className = "" }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={`collapse ${open ? "open" : ""} ${className}`} aria-hidden={!open}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}
