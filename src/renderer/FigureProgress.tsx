import { phrasesForFigure, type FigureKind } from "../core/figureWork";
import { clock, useElapsed } from "./Activity";
import { StepIcon } from "./StepIcon";
import { useRotating } from "./WorkLog";

/** The drawing of the figure to come: the parts that carry a class move softly while the chart, diagram or block is written or mended. */
function Sketch({ kind }: { kind: FigureKind }) {
  if (kind === "chart") {
    return (
      <svg viewBox="0 0 260 72" className="fp-svg" aria-hidden>
        <path className="fp-grid" d="M14 22H250M14 42H250" />
        <path className="fp-ax" pathLength={1} d="M14 6V62H250" />
        <path className="fp-ghost" d="M18 52L62 40L106 46L150 24L194 30L240 12" />
        <g className="fp-dots">{[[62, 40], [106, 46], [150, 24], [194, 30], [240, 12]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.600" style={{ animationDelay: `${i * 0.25}s` }} />)}</g>
      </svg>
    );
  }
  if (kind === "diagram") {
    return (
      <svg viewBox="0 0 260 72" className="fp-svg" aria-hidden>
        <path className="fp-ghost" d="M76 21H102M158 21H184M130 32V46" />
        <rect className="fp-n n1" x="20" y="10" width="56" height="22" rx="6" /><rect className="fp-n n2" x="102" y="10" width="56" height="22" rx="6" />
        <rect className="fp-n n3" x="184" y="10" width="56" height="22" rx="6" /><rect className="fp-n n4" x="102" y="46" width="56" height="22" rx="6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 260 72" className="fp-svg" aria-hidden>
      {[[14, 6, 232], [14, 22, 176], [14, 38, 204], [14, 54, 140]].map(([x, y, w], i) => <rect key={i} className={`fp-r r${i + 1}`} x={x} y={y} width={w} height="10" rx="3" />)}
    </svg>
  );
}

/**
 * What shows while a chart, diagram or block is being written or mended: its drawing, a title, a clock and a sentence that changes, so a
 * figure that takes a while never looks stuck. The room it takes is fixed, whatever the stage.
 */
/** The lines around the one that stopped the drawing; once mended, the faulty line is struck and the new one shows under it. */
export interface FigureSource { lines: string[]; at: number; now?: string }

export function FigureProgress({ kind, fixing = false, why, source }: { kind: FigureKind; fixing?: boolean; why?: string | null; source?: FigureSource | null }) {
  const sec = useElapsed(true);
  const stage = fixing ? "fix" : "draw";
  const phrase = useRotating(phrasesForFigure(kind, stage), `${kind}${stage}`, true);
  const noun = kind === "chart" ? "chart" : kind === "diagram" ? "diagram" : kind === "figures" ? "figures" : kind === "cards" ? "cards" : kind === "quiz" ? "quiz" : kind === "checklist" ? "list" : "sheet";
  const verb = fixing ? "Correcting the" : kind === "quiz" || kind === "checklist" || kind === "sheet" ? "Writing the" : "Drawing the";
  return (
    <div className={`fp ${fixing ? "fixing" : ""}`} role="status">
      <div className="fp-line">
        <StepIcon tag={fixing ? "fix" : kind === "chart" ? "chart" : kind === "diagram" ? "diagram" : "table"} state="running" size={16} />
        <span className="shimmer">{verb} {noun}</span>
        {sec >= 2 && <em>{clock(sec)}</em>}
      </div>
      <div key={phrase} className="fp-phrase bp-phrase">{phrase}</div>
      {fixing && why && <div className="fp-why" title={why}>{why.length > 120 ? `${why.slice(0, 118)}…` : why}</div>}
      {fixing && source && (
        <div className="fp-src" aria-hidden>
          {source.lines.map((l, i) => <div key={i} className={i === source.at ? (source.now !== undefined ? "gone" : "err") : ""}>{l || " "}</div>)}
          {source.now !== undefined && <div className="fixed">{source.now || " "}</div>}
        </div>
      )}
      <div className="fp-sketch"><Sketch kind={kind} />{fixing && <i className="fp-scan" />}</div>
    </div>
  );
}
