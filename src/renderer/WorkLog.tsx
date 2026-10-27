import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { finishedLine, mergeLedger, phrasesFor, windowOf, type WorkItem } from "../core/workLog";
import { Chevron, GlideLine, Unfold, clock, useElapsed } from "./Activity";
import { StepIcon } from "./StepIcon";

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


/**
 * The steps of a task as a short list that reads from the top down: the two last finished (fading), the one running, the next one.
 * Everything else is folded under one quiet line ("3 done · 2 to come") that opens the whole list.
 */
export function WorkLog({ items, now, full = false }: { items: WorkItem[]; now: number; full?: boolean }) {
  const [all, setAll] = useState(false);
  const peak = useRef(0); // the most rows the window has shown: it only grows, so the block never shrinks and never leaves blank room
  const { places, doneHidden, laterHidden } = windowOf(items);
  peak.current = Math.max(peak.current, places.filter((p) => p !== "far" && p !== "later").length);
  const open = full || all;
  const hidden = [doneHidden ? `${doneHidden} done` : "", laterHidden ? `${laterHidden} to come` : ""].filter(Boolean).join(" · ");
  return (
    <div className={`wl ${full ? "full" : ""}`}>
      <ul className="wl-list" style={full ? undefined : { minHeight: peak.current * 26 }}>
        {items.map((x, i) => {
          const place = places[i];
          const show = open || (place !== "far" && place !== "later");
          const t = x.state === "running" ? Math.max(0, Math.floor((now - (x.at ?? now)) / 1000)) : x.sec ?? 0;
          const finished = x.state === "done" || x.state === "error";
          return (
            <li key={x.id} className={`wl-row ${x.state} ${open ? "all" : place} ${show ? "show" : ""}`} inert={!show}>
              <div className="wl-in">
                <span className="wl-mark"><StepIcon tag={x.tag} state={x.state} /></span>
                <span className="wl-text"><span className={x.state === "running" ? "shimmer" : ""}>{finished ? x.label : x.doing}</span>{x.state === "running" && x.note && <span className="wl-note">{x.note}</span>}</span>
                {t >= 1 && x.state !== "waiting" && <em>{clock(t)}</em>}
              </div>
            </li>
          );
        })}
      </ul>
      {!full && (
        <div className={`wl-morewrap ${items.length > 4 || all ? "open" : ""}`} inert={!(items.length > 4 || all)}>
          <div className="wl-morein">
            <button type="button" className={`wl-more ${hidden || all ? "" : "idle"}`} aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? "Show fewer" : hidden || "·"}<Chevron />
            </button>
          </div>
        </div>
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
        <span className="bp-glyph"><StepIcon tag={running ? (active?.tag ?? "") : (list[list.length - 1]?.tag ?? "")} state={running ? "running" : end.bad ? "error" : "done"} size={16} /></span>
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

/**
 * The steps of a simple task (sorted, a file read, thinking, a search, a look at the project): only the last one shows, as one line with its
 * own moving drawing. The other steps and the cards that hold their details are one click away. Finished, it stays one quiet line.
 */
export function ActivityGroup({ items, running, thought, children }: { items: WorkItem[]; running: boolean; thought: { key: string; text: string } | null; children: ReactNode }) {
  const now = useNow(running);
  const ledger = useRef<WorkItem[]>([]);
  const [open, setOpen] = useState(false);
  ledger.current = mergeLedger(ledger.current, items, now);
  const list = ledger.current;
  const shown = [...list].reverse().find((x) => x.state === "running") ?? list[list.length - 1];
  const live = !!shown && shown.state === "running";
  const phrase = useRotating(phrasesFor(shown?.tag), shown?.id ?? "", live);
  if (!shown) return null;

  const sec = live ? Math.max(0, Math.floor((now - (shown.at ?? now)) / 1000)) : shown.sec ?? 0;
  const title = live ? shown.doing : shown.tag === "think" && sec >= 1 ? `Thought for ${clock(sec)}` : shown.label;
  const loose = list.filter((x) => x.tag === "route" || x.tag === "file"); // the steps no card below tells about
  return (
    <div className={`ag ${live ? "live" : "fin"}`}>
      <button type="button" className="ag-head" aria-expanded={open} title={open ? "Hide the steps" : "Show all the steps"} onClick={() => setOpen(!open)}>
        <StepIcon tag={shown.tag} state={shown.state === "error" ? "error" : live ? "running" : "done"} size={16} />
        <span className="ag-main">
          <span key={title} className={`ag-t ${live ? "shimmer" : ""}`} aria-live="polite">{title}</span>
          {live && (shown.tag === "think" && thought?.text ? <GlideLine k={thought.key} text={thought.text} className="ag-s" /> : <span key={shown.note ?? phrase} className="ag-s bp-phrase">{shown.note ?? phrase}</span>)}
        </span>
        <span className="ag-m">{live ? (sec >= 1 ? clock(sec) : "") : ""}{list.length > 1 && <span>{list.length} steps</span>}<Chevron /></span>
      </button>
      <Unfold open={open}>
        <div className="ag-body">
          {loose.length > 0 && (
            <div className="ag-rows">
              {loose.map((x) => <div key={x.id} className={`ag-row ${x.state}`}><StepIcon tag={x.tag} state={x.state === "error" ? "error" : x.state === "running" ? "running" : "done"} /><span>{x.state === "running" ? x.doing : x.label}</span>{x.sec ? <em>{clock(x.sec)}</em> : null}</div>)}
            </div>
          )}
          {children}
        </div>
      </Unfold>
    </div>
  );
}

/** The model loading onto the NPU: one line with its drawing, a segment that slides (never a made-up percentage), a sentence that changes. */
export function LoadingLine({ tag, label }: { tag: "load" | "clean"; label: string }) {
  const sec = useElapsed(true);
  const phrase = useRotating(phrasesFor(tag), tag, true);
  return (
    <div className="ld" role="status">
      <div className="ld-line"><StepIcon tag={tag} state="running" size={16} /><span className="shimmer">{label}</span>{sec >= 2 && <em>{clock(sec)}</em>}</div>
      <div className="ld-track"><i /></div>
      <div key={phrase} className="ld-phrase bp-phrase">{phrase}</div>
    </div>
  );
}

/** The drawings that stand for the steps: the head icon of each card that tells one. */
const FLY_FROM = ".ag-head > .sico, .think-head .sico, .ws-head .sico, .bp-head .sico, .rc-head .sico, .notice-route .sico";
const tagOf = (e: Element) => /\bt-(\w+)/.exec(e.getAttribute("class") ?? "")?.[1] ?? "work";

/**
 * Everything that happened before the answer. While the turn runs it only holds the cards as they are. Once it is over, two steps or more
 * fold into one quiet line, "Worked for 1m 50s · 4 steps": the card icons fly into a row inside the line (its room is kept from the start,
 * so nothing shifts) while the cards fold away. The cards are one click away.
 */
export function TurnSummary({ count, sec, bad, summarize, children }: { count: number; sec: number; bad: boolean; summarize: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [landed, setLanded] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLSpanElement>(null);
  const flight = useRef<{ icons: SVGElement[]; rects: DOMRect[]; height: number } | null>(null);
  const raf = useRef(0);
  const was = useRef(summarize);
  const clones = useRef<SVGElement[]>([]);

  useLayoutEffect(() => {
    if (!summarize) { was.current = false; setLanded(false); return; }
    const icons = Array.from(wrap.current?.querySelector(".ts-body")?.querySelectorAll<SVGElement>(FLY_FROM) ?? []).slice(0, 7);
    setTags(icons.map(tagOf));
    if (was.current) { setLanded(true); return; } // a turn that was already over when it was drawn: no flight
    const height = wrap.current?.querySelector<HTMLElement>(".ts-body")?.closest<HTMLElement>(".unfold")?.offsetHeight ?? 0;
    flight.current = { icons, rects: icons.map((e) => e.getBoundingClientRect()), height };
    was.current = true;
  }, [summarize]);

  useLayoutEffect(() => {
    const f = flight.current;
    if (!f || !tags.length) return;
    flight.current = null;
    const slots = Array.from(strip.current?.children ?? []).map((c) => c.getBoundingClientRect());
    if (!slots.length || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setLanded(true); return; }
    // the drawings fly inside the scrolling column, so they follow the page when it scrolls (the chat scrolls back up as the cards fold away)
    const host = (wrap.current?.closest(".column") as HTMLElement | null) ?? document.body;
    const hr = host.getBoundingClientRect();
    const anims = f.icons.map((ic, i) => {
      const r = f.rects[i], to = slots[i];
      if (!to || !r.width) return null;
      const c = ic.cloneNode(true) as SVGElement;
      c.setAttribute("class", "sico done");
      Object.assign(c.style, { position: "absolute", left: `${r.left - hr.left}px`, top: `${r.top - hr.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: "0", zIndex: "60", pointerEvents: "none", transformOrigin: "0 0" });
      host.appendChild(c);
      clones.current.push(c);
      return c.animate([{ transform: "translate(0px, 0px) scale(1)" }, { transform: `translate(${to.left - r.left}px, ${to.top - r.top}px) scale(${to.width / r.width})` }], { duration: 620, delay: 120 + i * 60, easing: "cubic-bezier(.45,0,.2,1)", fill: "both" });
    });
    // the emptied room closes in step with the lowest drawing still flying, keeping a small margin under it, so no void is left behind
    const unfold = wrap.current?.querySelector<HTMLElement>(".ts-body")?.closest<HTMLElement>(".unfold") ?? null;
    let stop = () => {};
    if (unfold && f.height > 0) {
      let h = f.height, last = performance.now(), flying = true;
      unfold.style.transition = "none";
      unfold.style.gridTemplateRows = `${h}px`;
      const tick = (now: number) => {
        const dt = Math.max(0, now - last) / 16.7; last = now;
        const top = unfold.getBoundingClientRect().top;
        const low = flying ? Math.max(0, ...clones.current.map((c) => c.getBoundingClientRect().bottom)) : 0;
        const target = flying ? Math.max(0, low - top + 14) : 0;
        h = Math.min(h, h + (target - h) * (1 - Math.pow(1 - 0.14, dt)));
        unfold.style.gridTemplateRows = `${h}px`;
        if (flying || h > 0.5) raf.current = requestAnimationFrame(tick);
        else clear();
      };
      const clear = () => { unfold.style.transition = ""; unfold.style.gridTemplateRows = ""; };
      stop = () => { flying = false; };
      raf.current = requestAnimationFrame(tick);
    }
    void Promise.all(anims.map((a) => a?.finished)).then(() => { stop(); clones.current.forEach((c) => c.remove()); clones.current = []; setLanded(true); }, () => { stop(); setLanded(true); });
  }, [tags]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); clones.current.forEach((c) => c.remove()); }, []);

  return (
    <div ref={wrap} className={`ts ${summarize ? "done" : "live"} ${landed ? "landed" : ""}`}>
      <Unfold open={summarize} className="ts-headwrap">
        <button type="button" className="ag-head" aria-expanded={open} title={open ? "Hide the steps" : "Show all the steps"} onClick={() => setOpen(!open)}>
          <StepIcon tag="work" state={bad ? "error" : "done"} size={14} />
          <span className="ag-main">
            <span className="ag-t">{sec >= 1 ? `Worked for ${clock(sec)}` : "Done"}</span>
            <span ref={strip} className="ts-strip" style={{ width: Math.max(0, tags.length * 17 - 4) }}>{tags.map((t, i) => <StepIcon key={i} tag={t} state="done" size={13} />)}</span>
          </span>
          <span className="ag-m">{bad && <span className="ts-bad">needs a look</span>}<span>{count} steps</span><Chevron /></span>
        </button>
      </Unfold>
      <Unfold open={!summarize || open}><div className="ag-body ts-body">{children}</div></Unfold>
    </div>
  );
}
