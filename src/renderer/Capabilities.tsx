import type React from "react";
import type { CatalogEntry } from "../shared/types";
import { CapId, capabilities } from "../core/capabilities";
import { CodeIcon, LongIcon, MoeIcon, NativeIcon, ThinkingIcon, VisionIcon } from "./Icons";

const ICON: Record<CapId, () => React.JSX.Element> = { thinking: ThinkingIcon, vision: VisionIcon, code: CodeIcon, moe: MoeIcon, long: LongIcon, native: NativeIcon };

/** Small icons for what a model can do. `compact` = icons only (menus); otherwise icon and word (model cards). */
export function CapBadges({ entry, compact }: { entry: Pick<CatalogEntry, "id" | "name" | "repo"> & Partial<CatalogEntry>; compact?: boolean }) {
  const caps = capabilities(entry);
  if (!caps.length) return null;
  return (
    <span className={`caps ${compact ? "compact" : ""}`}>
      {caps.map((c) => {
        const Icon = ICON[c.id];
        return <span key={c.id} className={`cap cap-${c.id}`} title={`${c.label}: ${c.hint}`} aria-label={c.label}><Icon />{!compact && <span>{c.label}</span>}</span>;
      })}
    </span>
  );
}
