import { useEffect, useMemo, useRef, useState } from "react";
import { diagramKind, mendDiagram } from "../core/diagram";
import { Code } from "./Code";
import { exportPng, exportSvg } from "./chartExport";

let loaded: Promise<typeof import("mermaid").default> | null = null;
let counter = 0;
const css = (name: string, d: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || d;

/** Mermaid is large and needed by few answers: it is loaded the first time a diagram is drawn. */
async function engine() {
  loaded ??= import("mermaid").then((m) => m.default);
  const mermaid = await loaded;
  const text = css("--text", "#141413"), bg = css("--surface", "#ffffff"), border = css("--border", "#e5e3da"), accent = css("--accent", "#4e288f"), muted = css("--muted", "#6a6963");
  // the colours of the app; text labels (no HTML inside the drawing) so that the picture can be saved as SVG and PNG
  mermaid.initialize({
    startOnLoad: false, securityLevel: "strict", theme: "base", htmlLabels: false, flowchart: { htmlLabels: false, curve: "basis" },
    themeVariables: { fontFamily: "inherit", fontSize: "14px", primaryColor: bg, primaryTextColor: text, primaryBorderColor: accent, lineColor: muted, secondaryColor: bg, tertiaryColor: bg, background: bg, mainBkg: bg, nodeBorder: accent, clusterBkg: bg, clusterBorder: border, edgeLabelBackground: bg, textColor: text, titleColor: text, noteBkgColor: bg, noteTextColor: text, noteBorderColor: border, actorBkg: bg, actorBorder: accent, actorTextColor: text, signalColor: muted, signalTextColor: text, labelBoxBkgColor: bg, labelTextColor: text }
  });
  return mermaid;
}

/** A diagram a model wrote as Mermaid, drawn in the chat in the colours of the app. */
export function DiagramBlock({ raw, live }: { raw: string; live?: boolean }) {
  const text = useMemo(() => mendDiagram(raw), [raw]);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  // redrawn when the colour scheme changes
  useEffect(() => {
    const q = window.matchMedia?.("(prefers-color-scheme: dark)");
    const again = () => setTheme((n) => n + 1);
    q?.addEventListener?.("change", again);
    const obs = new MutationObserver(again);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => { q?.removeEventListener?.("change", again); obs.disconnect(); };
  }, []);
  useEffect(() => {
    if (live) return;
    let off = false;
    setError(null);
    (async () => {
      try {
        if (!diagramKind(text)) throw new Error("the first line must name the kind of diagram (flowchart TD, sequenceDiagram, mindmap...)");
        const mermaid = await engine();
        const out = await mermaid.render(`npu-diagram-${++counter}`, text);
        if (!off) setSvg(out.svg);
      } catch (e) {
        document.querySelectorAll('[id^="dnpu-diagram-"]').forEach((n) => n.remove());
        if (!off) { setSvg(null); setError(String((e as Error).message ?? e).split("\n").slice(0, 3).join(" ").slice(0, 240)); }
      }
    })();
    return () => { off = true; };
  }, [text, live, theme]);

  if (live) return <div className="chart-block"><div className="chart-note">Drawing the diagram…</div></div>;
  const kind = diagramKind(text);
  return (
    <div className={`chart-block diagram-block ${error ? "bad" : ""}`}>
      <div className="chart-head">
        <strong>{kind ? kind.replace(/-v2|-beta/, "").replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim() : "Diagram"}</strong>
        <span className="chart-actions">
          {svg && !showCode && <>
            <button className="linkbtn" onClick={() => { const s = body.current?.querySelector("svg"); if (s) exportSvg(s as SVGSVGElement, kind ?? "diagram"); }}>SVG</button>
            <button className="linkbtn" onClick={async () => { const s = body.current?.querySelector("svg"); if (s) { try { await exportPng(s as SVGSVGElement, kind ?? "diagram"); } catch { /* blocked */ } } }}>PNG</button>
          </>}
          <button className="linkbtn" onClick={() => setShowCode((v) => !v)}>{showCode ? "View diagram" : "View code"}</button>
          <button className="linkbtn" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy"}</button>
        </span>
      </div>
      {error && <div className="chart-note">This diagram could not be drawn: {error}. Ask the assistant to correct it.</div>}
      {(showCode || error) ? <div className="codeblock"><pre><code><Code text={text} lang="text" /></code></pre></div>
        : svg ? <div ref={body} className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="chart-note">Drawing the diagram…</div>}
    </div>
  );
}
