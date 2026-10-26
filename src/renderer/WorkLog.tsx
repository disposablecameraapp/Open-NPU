import { useEffect, useRef, useState } from "react";
import { finishedLine, mergeLedger, phrasesFor, windowOf, type WorkItem, type WorkState } from "../core/workLog";
import { Chevron, Spark, StatusMark, Unfold, clock } from "./Activity";

/** The current time, moved every second while `on`: the clocks of a running task count by themselves, whether or not the model sends anything. */
export function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/** One sentence out of a few, changed every few seconds while `on`; it starts again from the first when `key` changes. */
export function useRotating(list: string[], key: string, on: boolean, ms = 3600): string {
  const [i, setI] = useState(0);
  const n = list.length;
  useEffect(() => { setI(0); }, [key]);
  useEffect(() => {
    if (!on || n < 2) return;
    const t = setInterval(() => setI((v) => v + 1), ms);
    return () => clearInterval(t);
  }, [on, key, n, ms]);
  return list[i % Math.max(1, n)] ?? "";
}

const Mark = ({ s }: { s: WorkState }) => (s === "running" ? <i className="bp-pulse" /> : s === "done" ? <StatusMark s="done" /> : s === "error" ? <StatusMark s="error" /> : <i className="bp-hollow" />);

/**
 * The steps of a task as a short list that reads from the top down: the two last finished (fading), the one running, the next one.
 * Everything else is folded under one quiet line ("3 done · 2 to come") that opens the whole list.
 */
export function WorkLog({ items, now, full = false }: { items: WorkItem[]; now: number; full?: boolean }) {
  const [all, setAll] = useState(false);
  const { places, doneHidden, laterHidden } = windowOf(items);
  const open = full || all;
  const hidden = [doneHidden ? `${doneHidden} done` : "", laterHidden ? `${laterHidden} to come` : ""].filter(Boolean).join(" · ");
  return (
    <div className={`wl ${full ? "full" : ""}`}>
      <ul className="wl-list">
        {items.map((x, i) => {
          const place = places[i];
          const show = open || (place !== "far" && place !== "later");
          const t = x.state === "running" ? Math.max(0, Math.floor((now - (x.at ?? now)) / 1000)) : x.sec ?? 0;
          const finished = x.state === "done" || x.state === "error";
          return (
            <li key={x.id} className={`wl-row ${x.state} ${open ? "all" : place} ${show ? "show" : ""}`} inert={!show}>
              <div className="wl-in">
                <span className="wl-mark"><Mark s={x.state} /></span>
                <span className="wl-text"><span className={x.state === "running" ? "shimmer" : ""}>{finished ? x.label : x.doing}</span>{x.state === "running" && x.note && <span className="wl-note">{x.note}</span>}</span>
                {t >= 1 && x.state !== "waiting" && <em>{clock(t)}</em>}
              </div>
            </li>
          );
        })}
      </ul>
      {!full && (
        <button type="button" className={`wl-more ${hidden || all ? "" : "idle"}`} aria-expanded={all} tabIndex={hidden || all ? 0 : -1} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : hidden || "·"}<Chevron />
        </button>
      )}
    </div>
  );
}

/** The block of a task that is not a build of files (a document, a search, helpers, a code check, a model loading): the same shell as a build, fed by its steps. */
export function WorkCard({ items, running }: { items: WorkItem[]; running: boolean }) {
  const now = useNow(running);
  const ledger = useRef<WorkItem[]>([]);
  const peaks = useRef(new Map<string, number>());
  const [open, setOpen] = useState(false);
  ledger.current = mergeLedger(ledger.current, items, now);
  const list = ledger.current;
  const active = list.find((x) => x.state === "running") ?? list.find((x) => x.state === "waiting");
  const phrase = useRotating(phrasesFor(active?.tag), active?.id ?? "", running);
  if (!list.length) return null;

  const end = finishedLine(list);
  const first = Math.min(now, ...list.map((x) => x.at ?? now));
  const total = running ? Math.max(0, Math.floor((now - first) / 1000)) : Math.round(list.reduce((n, x) => n + (x.sec ?? 0), 0));
  const title = running ? (active?.doing ?? "Working") : end.text;
  const sub = running ? (active?.note ?? phrase) : "";
  const rail = list.map((x) => {
    const el = x.state === "running" ? Math.max(0, (now - (x.at ?? now)) / 1000) : 0;
    const p = x.state === "done" || x.state === "error" ? 1 : x.state === "running" ? Math.min(.9, 1 - Math.exp(-el / 12)) : 0;
    const q = Math.max(p, peaks.current.get(x.id) ?? 0);
    peaks.current.set(x.id, q);
    return { x, pct: q };
  });
  const cls = running ? "live" : end.bad ? "bad" : "done";

  return (
    <div className={`bp wc ${cls}`}>
      <button type="button" className="bp-head" aria-expanded={running || open} disabled={running} title={open ? "Hide the steps" : "Show the steps"} onClick={() => setOpen(!open)}>
        <span className="bp-glyph">{running ? <Spark size={18} /> : <StatusMark s={end.bad ? "error" : "done"} />}</span>
        <span className="bp-main">
          <span className="bp-title"><span key={title} className={`bp-title-text ${running ? "shimmer" : ""}`} aria-live="polite">{title}</span></span>
          {sub && <span className="bp-sub"><span key={sub} className="bp-note bp-phrase">{sub}</span></span>}
        </span>
        <span className="bp-time">{total >= 1 ? clock(total) : ""}</span>
        {!running && <Chevron />}
      </button>
      <Unfold open={running} className="bp-railwrap">
        {list.length > 1 && (
          <div className="bp-rail" role="progressbar" aria-label="Progress of the work" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={list.filter((x) => x.state === "done").length}>
            {rail.map(({ x, pct }) => (
              <span key={x.id} className={`bp-seg-wrap ${x.state === "done" ? "done" : x.state}`}><span className="bp-seg"><i style={{ transform: `scaleX(${pct})` }} /></span></span>
            ))}
          </div>
        )}
        <div className="bp-lane"><WorkLog items={list} now={now} /></div>
      </Unfold>
      <Unfold open={!running && open}>
        <div className="bp-body"><WorkLog items={list} now={now} full /></div>
      </Unfold>
    </div>
  );
}
