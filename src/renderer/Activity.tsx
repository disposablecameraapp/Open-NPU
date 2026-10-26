import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StepIcon } from "./StepIcon";

/** Seconds since this mounted, counting while `running`; the value is kept once it stops. */
export function useElapsed(running: boolean): number {
  const start = useRef(Date.now());
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const now = () => Math.floor((Date.now() - start.current) / 1000);
    if (!running) { setSec(now()); return; }
    const t = setInterval(() => setSec(now()), 500);
    return () => clearInterval(t);
  }, [running]);
  return sec;
}

export const clock = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);

/** Height-animated section (the row-height trick: no measuring). Closed content is inert, so it cannot be tabbed into. */
export function Unfold({ open, children, className = "" }: { open: boolean; children: ReactNode; className?: string }) {
  return <div className={`unfold ${open ? "open" : ""} ${className}`} inert={!open}><div className="unfold-in">{children}</div></div>;
}

export const Chevron = () => <svg className="chev" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>;

/** The mark of a step: a spinner while it runs, a tick that draws itself, a cross, a warning. */
export function StatusMark({ s }: { s: "running" | "done" | "error" | "info" }) {
  if (s === "running") return <svg className="mark arc" viewBox="0 0 16 16" width="14" height="14" aria-hidden><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" pathLength={1} /></svg>;
  if (s === "done") return <svg className="mark tick" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3.5 8.5l3 3 6-7" pathLength={1} /></svg>;
  if (s === "error") return <svg className="mark cross" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" pathLength={1} /></svg>;
  return <svg className="mark dot-mark" viewBox="0 0 16 16" width="14" height="14" aria-hidden><circle cx="8" cy="8" r="2" fill="currentColor" /></svg>;
}

/** The mark beside "working" text: a small chip whose pins light in turn around a pulsing core. */
const PINS = ["M9.5 3v3.5", "M14.5 3v3.5", "M17.5 9.5H21", "M17.5 14.5H21", "M14.5 17.5V21", "M9.5 17.5V21", "M6.5 14.5H3", "M6.5 9.5H3"];
export const Spark = ({ size = 16 }: { size?: number }) => (
  <svg className="spark-glyph" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.2" />
    <rect className="core" x="10" y="10" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
    {PINS.map((d, i) => <path key={i} className="pin" d={d} style={{ animationDelay: `${i * -0.2}s` }} />)}
  </svg>
);

/** A page being written: its lines draw one after another. */
export const WritingGlyph = ({ live }: { live: boolean }) => (
  <svg className={`writing-glyph ${live ? "live" : ""}`} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 3.5h8l4 4v12a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 4.500 19.500v-14.500A1.500 1.500 0 0 1 6 3.500Z" />
    <path className="wl wl1" d="M8 11h8" pathLength={1} /><path className="wl wl2" d="M8 14.500h8" pathLength={1} /><path className="wl wl3" d="M8 18h5" pathLength={1} />
  </svg>
);

const VERBS = ["Thinking", "Pondering", "Mulling it over", "Connecting the dots", "Working on it", "Almost there"];

/** One quiet line saying what is going on, with a moving mark. With `verbs` the wording changes every few seconds. */
export function Presence({ label, verbs, detail }: { label?: string; verbs?: boolean; detail?: string }) {
  const sec = useElapsed(true);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!verbs) return;
    const t = setInterval(() => setI((v) => (v + 1) % VERBS.length), 2800);
    return () => clearInterval(t);
  }, [verbs]);
  const text = verbs ? VERBS[i] : label;
  return (
    <div className="presence" role="status">
      <Spark />
      <span key={text} className="presence-text shimmer">{text}</span>
      {sec >= 4 && <span className="presence-time">{clock(sec)}</span>}
      {detail && <span className="presence-detail">{detail}</span>}
    </div>
  );
}

/** The latest finished sentence of the thought, for the line under the header while it is folded. */
export function ticker(text: string): { key: string; text: string } {
  const parts = text.trim().split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const pick = (parts.length > 1 ? parts[parts.length - 2] : parts[0]) ?? "";
  return { key: parts.length > 1 ? pick : "first", text: pick.length > 120 ? `${pick.slice(0, 118).trimEnd()}…` : pick };
}

/** One line of text that changes: the new one slides in from below while the old one rises and fades. */
export function GlideLine({ k, text, className = "" }: { k: string; text: string; className?: string }) {
  const [old, setOld] = useState<{ k: string; text: string } | null>(null);
  const last = useRef({ k, text });
  useEffect(() => {
    if (last.current.k === k) { last.current = { k, text }; return; }
    setOld(last.current);
    last.current = { k, text };
    const t = setTimeout(() => setOld(null), 650);
    return () => clearTimeout(t);
  }, [k, text]);
  return (
    <div className={`glide ${className}`}>
      {old && <div key={`o${old.k}`} className="glide-old">{old.text}</div>}
      <div key={k} className="glide-cur">{text}</div>
    </div>
  );
}

/** The model's reasoning: a header that shimmers while it thinks, the latest thought beneath, the whole text on demand. */
export function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const wasLive = useRef(live);
  if (live) wasLive.current = true;
  const sec = useElapsed(live);
  const body = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  useEffect(() => { const el = body.current; if (open && live && follow.current && el) el.scrollTop = el.scrollHeight; }, [text, open, live]);
  const tick = useMemo(() => (live ? ticker(text) : null), [text, live]);
  return (
    <div className={`think ${live ? "live" : ""} ${open ? "open" : ""}`}>
      <button type="button" className="think-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="think-bulb"><StepIcon tag="think" state={live ? "running" : "done"} size={15} /></span>
        <span className={`think-label ${live ? "shimmer" : ""}`}>{live ? "Thinking" : wasLive.current && sec > 0 ? `Thought for ${clock(sec)}` : "Thought process"}</span>
        {live && sec >= 3 && <span className="think-time">{clock(sec)}</span>}
        <Chevron />
      </button>
      {tick && tick.text && !open && <GlideLine k={tick.key} text={tick.text} className="think-tick" />}
      <Unfold open={open}>
        <pre ref={body} onScroll={(e) => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>{text}</pre>
      </Unfold>
    </div>
  );
}
