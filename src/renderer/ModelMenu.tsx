import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CatalogItem } from "../shared/api";
import type { Effort } from "../shared/types";
import { CapBadges } from "./Capabilities";
import { Collapse } from "./Collapse";
import { useExit } from "./usePresence";
import { EFFORTS, effectiveEffort, effortsFor, thinkingSupport } from "../core/effort";
import { isDynamicId, tierOf } from "../core/dynamic";
import { api } from "./api";
import { LanePills } from "./DynamicCard";

export function effortLabel(selected: CatalogItem | null, effort: Effort): string | null {
  if (!selected) return null;
  const level = effectiveEffort(effort, thinkingSupport(selected.entry));
  return level ? EFFORTS.find((e) => e.id === level)!.label : null;
}

/** Model, thinking level and sub-agents in one popover, opened from the model chip in the composer. */
export function ModelMenu(props: {
  items: CatalogItem[]; selected: CatalogItem | null; effort: Effort; subagents: boolean;
  onSelect: (id: string) => void; onEffort: (e: Effort) => void; onSubagents: (on: boolean) => void; onMore: () => void;
  onClose: () => void;
}) {
  const { items, selected, effort, subagents, onSelect, onEffort, onSubagents, onMore } = props;
  const { leaving, close: onClose } = useExit(props.onClose);
  const [sub, setSub] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Dynamic first: it is the recommended choice
  const installed = items.filter((i) => i.installed && !i.hidden).sort((a, b) => Number(isDynamicId(b.entry.id)) - Number(isDynamicId(a.entry.id)));
  const [dyn, setDyn] = useState<Awaited<ReturnType<ReturnType<typeof api>["dynamicInfo"]>> | null>(null);
  useEffect(() => { void api().dynamicInfo().then(setDyn).catch(() => undefined); }, []);
  // The menu opens upward from the model chip: cap its height to the room above the chip, not to the window,
  // because on an empty chat the composer sits mid-page and a window-based cap lets the top rows (Dynamic 4B, 9B) leave the screen.
  const [room, setRoom] = useState<number | undefined>();
  useLayoutEffect(() => {
    const anchor = ref.current?.parentElement;
    if (anchor) setRoom(Math.max(160, anchor.getBoundingClientRect().top - 20));
  }, [installed.length, dyn]);
  const support = selected ? thinkingSupport(selected.entry) : "none";
  const levels = effortsFor(support);
  const level = effectiveEffort(effort, support);

  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") return sub ? setSub(false) : onClose();
      const n = Number(e.key);
      if (!sub && n >= 1 && n <= installed.length) { onSelect(installed[n - 1].entry.id); onClose(); }
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [installed, onClose, onSelect, sub]);

  return (
    <div className="menu" ref={ref} role="menu" data-state={leaving ? "closed" : "open"} style={room ? { maxHeight: room } : undefined}>
      <div className="menu-title">Model · this chat</div>
      {installed.length === 0 && <div className="menu-empty muted small">No model installed yet.</div>}
      {installed.map((i, k) => (
        <button key={i.entry.id} className="menu-row" role="menuitemradio" aria-checked={i.entry.id === selected?.entry.id}
          onClick={() => { onSelect(i.entry.id); onClose(); }}>
          <span className="menu-label">{i.entry.name} {isDynamicId(i.entry.id) ? <><span className="dyn-badge">Recommended</span>{dyn && <LanePills models={dyn.data.models[tierOf(i.entry.id)] ?? []} speeds={dyn.speeds} />}</> : <CapBadges entry={i.entry} compact />}</span>
          <span className={`dot ${i.verdict.level}`} />
          <span className="menu-right">{i.entry.id === selected?.entry.id ? <span className="check">✓</span> : k < 9 ? k + 1 : ""}</span>
        </button>
      ))}
      <div className="menu-sep" />
      {levels.length > 0 ? (
        <div className="menu-row-wrap">
          <button className="menu-row" onClick={() => setSub((v) => !v)} aria-expanded={sub}>
            <span className="menu-label">Thinking</span>
            <span className="menu-right muted">{EFFORTS.find((e) => e.id === level)?.label} ›</span>
          </button>
          <Collapse open={sub}>
            <div className="submenu" role="menu">
              {EFFORTS.filter((e) => levels.includes(e.id)).map((e) => (
                <button key={e.id} className="menu-row" role="menuitemradio" aria-checked={e.id === level} onClick={() => { onEffort(e.id); setSub(false); }}>
                  <span className="menu-label">{e.label}<span className="muted small"> · {e.hint}</span></span>
                  <span className="menu-right">{e.id === level ? <span className="check">✓</span> : ""}</span>
                </button>
              ))}
              {support === "always" && <div className="menu-note muted small">This model always thinks; the level only nudges how much.</div>}
              {support === "toggle" && level !== "off" && level !== "medium" && <div className="menu-note muted small">Low and High are a nudge; Off switches thinking off.</div>}
            </div>
          </Collapse>
        </div>
      ) : (
        <div className="menu-row disabled"><span className="menu-label">Thinking</span><span className="menu-right muted small">Not a thinking model</span></div>
      )}
      <button className="menu-row" role="menuitemcheckbox" aria-checked={subagents} onClick={() => onSubagents(!subagents)}>
        <span className="menu-label">Sub-agents</span>
        <span className={`switch ${subagents ? "on" : ""}`} aria-hidden />
      </button>
      <div className="menu-sep" />
      <button className="menu-row" onClick={() => { onMore(); onClose(); }}>
        <span className="menu-label">More models</span><span className="menu-right muted">›</span>
      </button>
    </div>
  );
}
