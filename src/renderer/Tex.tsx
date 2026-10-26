import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { texToText } from "../core/math";

/** A formula typeset by KaTeX. Anything KaTeX cannot read is shown as plain text, never as an error. */
export function Tex({ v, display }: { v: string; display?: boolean }) {
  const html = useMemo(() => {
    try { return katex.renderToString(v, { displayMode: !!display, throwOnError: true, strict: "ignore", trust: false, output: "html", maxExpand: 200 }); } catch { return null; }
  }, [v, display]);
  if (html === null) return display ? <div className="math-block">{texToText(v)}</div> : <span className="math">{texToText(v)}</span>;
  return display ? <div className="math-block tex" dangerouslySetInnerHTML={{ __html: html }} /> : <span className="tex" dangerouslySetInnerHTML={{ __html: html }} />;
}
