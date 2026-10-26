import type { ReactNode } from "react";

export type IconState = "running" | "done" | "waiting" | "error";

/** One small drawing for each kind of step. The parts that carry a class move while the step runs; once it is done the drawing holds still. */
const SHAPES: Record<string, ReactNode> = {
  think: <><path className="ico-glow" d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" /><path d="M10 19h4M10.800 21.500h2.400" /></>,
  search: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><ellipse className="ico-mer" cx="12" cy="12" rx="4" ry="9" /></>,
  file: <><path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M8.500 12h7M8.500 15.500h7M8.500 19h4" /><path className="ico-scan" d="M5.500 6h12" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path className="ico-dash" d="M8 13h8" /></>,
  load: <><rect x="6.500" y="6.500" width="11" height="11" rx="2.200" /><rect className="ico-core" x="10" y="10" width="4" height="4" rx="1" fill="currentColor" stroke="none" />{["M9.500 3v3.500", "M14.500 3v3.500", "M17.500 9.500H21", "M17.500 14.500H21", "M14.500 17.500V21", "M9.500 17.500V21", "M6.500 14.500H3", "M6.500 9.500H3"].map((d, i) => <path key={i} className="ico-pin" d={d} style={{ animationDelay: `${i * -0.2}s` }} />)}</>,
  clean: <><path className="ico-glow" d="M12 3l1.800 4.700L18.500 9.500l-4.700 1.800L12 16l-1.800-4.700L5.500 9.500l4.700-1.800Z" /><path d="M19 15l.7 1.800 1.800.7-1.800.7L19 20l-.7-1.800-1.800-.7 1.800-.7Z" /></>,
  route: <><circle cx="5" cy="12" r="2" /><path className="ico-dash" d="M7 12h4l4-5h5M11 12l4 5h5" /></>,
  agent: <><circle className="ico-glow" cx="12" cy="8" r="3.500" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  review: <><path d="M12 3l7 3v5c0 5-3 8.500-7 10-4-1.500-7-5-7-10V6Z" /><path className="ico-dash" d="M9 12l2 2 4-4" /></>,
  loop: <g className="ico-spin"><path d="M20 12a8 8 0 0 1-14 5.300M4 12a8 8 0 0 1 14-5.300" /><path d="M18 3v4h-4M6 21v-4h4" /></g>,
  write: <><path d="M6 3.500h8l4 4v12a1.500 1.500 0 0 1-1.500 1.500H6a1.500 1.500 0 0 1-1.500-1.500V5A1.500 1.500 0 0 1 6 3.500Z" /><path className="ico-line l1" d="M8 11h8" pathLength={1} /><path className="ico-line l2" d="M8 14.500h8" pathLength={1} /><path className="ico-line l3" d="M8 18h5" pathLength={1} /></>,
  plan: <><path d="M9 6h11M9 12h11M9 18h11" /><circle className="ico-b b1" cx="4.500" cy="6" r="1.100" /><circle className="ico-b b2" cx="4.500" cy="12" r="1.100" /><circle className="ico-b b3" cx="4.500" cy="18" r="1.100" /></>,
  skeleton: <><rect className="ico-b b1" x="4" y="4" width="7" height="7" rx="1.500" /><rect className="ico-b b2" x="13" y="4" width="7" height="7" rx="1.500" /><rect className="ico-b b3" x="4" y="13" width="7" height="7" rx="1.500" /><rect className="ico-b b4" x="13" y="13" width="7" height="7" rx="1.500" /></>,
  fix: <g className="ico-wobble"><path d="M15 5a4 4 0 0 0-3.600 5.600L4 18l2 2 7.400-7.400A4 4 0 0 0 19 9l-2.500 2.500-2-.5-.5-2L16.500 6.500A4 4 0 0 0 15 5Z" /></g>,
  run: <><rect x="3.500" y="4.500" width="17" height="15" rx="2.500" /><path className="ico-glow" d="M10.500 9.500v5l4-2.500Z" /></>,
  look: <g className="ico-blink"><path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12Z" /><circle cx="12" cy="12" r="2.800" /></g>
};
const ALIAS: Record<string, string> = { check: "review", art: "write", edit: "write", spec: "plan", baseline: "run", explain: "write", answer: "write", web: "search", work: "load" };

/** The mark of a step: its own small drawing, in the accent colour and moving while it runs, grey and still once done, faint while it waits. */
export function StepIcon({ tag, state, size = 14 }: { tag: string; state: IconState; size?: number }) {
  const shape = SHAPES[ALIAS[tag] ?? tag] ?? <circle cx="12" cy="12" r="3" />;
  return (
    <svg className={`sico ${state} t-${ALIAS[tag] ?? tag}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      {state === "error" ? <path d="M6 6l12 12M18 6L6 18" /> : shape}
    </svg>
  );
}
