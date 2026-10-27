import type { ReactNode } from "react";

export type IconState = "running" | "done" | "waiting" | "error";

/** One small drawing for each kind of step. The parts that carry a class move while the step runs; once it is done the drawing holds still. */
const SHAPES: Record<string, ReactNode> = {
  work: <g transform="translate(12 12) scale(.36) translate(-32 -32)"><path className="ico-ring" strokeWidth="4.7" d="M27.24 5.25Q32 2.5 36.76 5.25L52.78 14.5Q57.55 17.25 57.55 22.75L57.55 41.25Q57.55 46.75 52.78 49.5L36.76 58.75Q32 61.5 27.24 58.75L11.22 49.5Q6.45 46.75 6.45 41.25L6.45 22.75Q6.45 17.25 11.22 14.5Z" /><path className="ico-arc" strokeWidth="4.7" pathLength={1} d="M27.24 5.25Q32 2.5 36.76 5.25L52.78 14.5Q57.55 17.25 57.55 22.75L57.55 41.25Q57.55 46.75 52.78 49.5L36.76 58.75Q32 61.5 27.24 58.75L11.22 49.5Q6.45 46.75 6.45 41.25L6.45 22.75Q6.45 17.25 11.22 14.5Z" /><path className="ico-core" fill="currentColor" strokeWidth="3.4" d="M30.27 19.8Q32 18.8 33.73 19.8L41.7 24.4Q43.43 25.4 43.43 27.4L43.43 36.6Q43.43 38.6 41.7 39.6L33.73 44.2Q32 45.2 30.27 44.2L22.3 39.6Q20.57 38.6 20.57 36.6L20.57 27.4Q20.57 25.4 22.3 24.4Z" /></g>,
  think: <><path className="ico-glow" d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" /><path d="M10 19h4M10.800 21.500h2.400" /></>,
  search: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><ellipse className="ico-mer" cx="12" cy="12" rx="4" ry="9" /></>,
  file: <><path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M8.500 12h7M8.500 15.500h7M8.500 19h4" /><path className="ico-scan" d="M5.500 6h12" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path className="ico-dash" d="M8 13h8" /></>,
  load: <><rect x="6.500" y="6.500" width="11" height="11" rx="2.200" /><rect className="ico-core" x="10" y="10" width="4" height="4" rx="1" fill="currentColor" stroke="none" />{["M9.500 3v3.500", "M14.500 3v3.500", "M17.500 9.500H21", "M17.500 14.500H21", "M14.500 17.500V21", "M9.500 17.500V21", "M6.500 14.500H3", "M6.500 9.500H3"].map((d, i) => <path key={i} className="ico-pin" d={d} style={{ animationDelay: `${i * -0.2}s` }} />)}</>,
  clean: <><path className="ico-glow" d="M12 3l1.800 4.700L18.500 9.500l-4.700 1.800L12 16l-1.800-4.700L5.500 9.500l4.700-1.800Z" /><path d="M19 15l.7 1.800 1.800.7-1.800.7L19 20l-.7-1.800-1.800-.7 1.800-.7Z" /></>,
  skill: <><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z" /><path d="M5 17a3 3 0 0 1 3-3h10" /><path className="ico-glow" d="M10 8.500h4" /></>,
  route: <><circle cx="5" cy="12" r="2" /><path className="ico-dash" d="M7 12h4l4-5h5M11 12l4 5h5" /></>,
  agent: <><circle className="ico-glow" cx="12" cy="8" r="3.500" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  review: <><path d="M12 3l7 3v5c0 5-3 8.500-7 10-4-1.500-7-5-7-10V6Z" /><path className="ico-dash" d="M9 12l2 2 4-4" /></>,
  loop: <g className="ico-spin"><path d="M20 12a8 8 0 0 1-14 5.300M4 12a8 8 0 0 1 14-5.300" /><path d="M18 3v4h-4M6 21v-4h4" /></g>,
  write: <><path d="M6 3.500h8l4 4v12a1.500 1.500 0 0 1-1.500 1.500H6a1.500 1.500 0 0 1-1.500-1.500V5A1.500 1.500 0 0 1 6 3.500Z" /><path className="ico-line l1" d="M8 11h8" pathLength={1} /><path className="ico-line l2" d="M8 14.500h8" pathLength={1} /><path className="ico-line l3" d="M8 18h5" pathLength={1} /></>,
  plan: <><path d="M9 6h11M9 12h11M9 18h11" /><circle className="ico-b b1" cx="4.500" cy="6" r="1.100" /><circle className="ico-b b2" cx="4.500" cy="12" r="1.100" /><circle className="ico-b b3" cx="4.500" cy="18" r="1.100" /></>,
  skeleton: <><rect className="ico-b b1" x="4" y="4" width="7" height="7" rx="1.500" /><rect className="ico-b b2" x="13" y="4" width="7" height="7" rx="1.500" /><rect className="ico-b b3" x="4" y="13" width="7" height="7" rx="1.500" /><rect className="ico-b b4" x="13" y="13" width="7" height="7" rx="1.500" /></>,
  fix: <g className="ico-wobble"><path d="M15 5a4 4 0 0 0-3.600 5.600L4 18l2 2 7.400-7.400A4 4 0 0 0 19 9l-2.500 2.500-2-.5-.5-2L16.500 6.500A4 4 0 0 0 15 5Z" /></g>,
  run: <><rect x="3.500" y="4.500" width="17" height="15" rx="2.500" /><path className="ico-glow" d="M10.500 9.500v5l4-2.500Z" /></>,
  chart: <><path d="M4 4v16h16" /><path className="ico-line l1" d="M7.500 15l4-4 3 2 5-6" pathLength={1} /></>,
  diagram: <><rect x="3" y="4" width="7" height="5" rx="1.500" /><rect x="14" y="4" width="7" height="5" rx="1.500" /><rect x="8.500" y="15" width="7" height="5" rx="1.500" /><path className="ico-dash" d="M10 6.500h4M12 9v6" /></>,
  table: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 10h16M4 14.500h16" /><path className="ico-glow" d="M10 10v9" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.010" /></>,
  mic: <><rect className="ico-glow" x="9" y="3" width="6" height="11" rx="3" /><path d="M5.500 11a6.500 6.500 0 0 0 13 0M12 17.500V21" /></>,
  micoff: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.500 11a6.500 6.500 0 0 0 13 0M12 17.500V21M4 4l16 16" /></>,
  speak: <><path d="M4 10v4h3.500L12 18V6L7.500 10Z" /><path className="ico-glow" d="M15 9a4 4 0 0 1 0 6M17.500 6.500a8 8 0 0 1 0 11" /></>,
  end: <path d="M4 15c4.500-4 11.500-4 16 0l-1.800 2.600a1 1 0 0 1-1.300.300l-2.400-1.200a1 1 0 0 1-.600-.900v-1.500c-1.800-.600-3.400-.600-5.200 0V16c0 .400-.200.700-.600.900l-2.400 1.200a1 1 0 0 1-1.300-.300Z" />,
  look: <g className="ico-blink"><path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12Z" /><circle cx="12" cy="12" r="2.800" /></g>
};
const ALIAS: Record<string, string> = { check: "review", art: "write", edit: "write", spec: "plan", baseline: "run", explain: "write", answer: "write", web: "search" };

/** The mark of a step: its own small drawing, in the accent colour and moving while it runs, grey and still once done, faint while it waits. */
export function StepIcon({ tag, state, size = 14 }: { tag: string; state: IconState; size?: number }) {
  const shape = SHAPES[ALIAS[tag] ?? tag] ?? <circle cx="12" cy="12" r="3" />;
  return (
    <svg className={`sico ${state} t-${ALIAS[tag] ?? tag}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      {state === "error" ? <path d="M6 6l12 12M18 6L6 18" /> : shape}
    </svg>
  );
}
