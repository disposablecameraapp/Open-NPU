import { FigureProgress, type FigureSource } from "./FigureProgress";
import { StepIcon } from "./StepIcon";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { diagramKind, healDiagram, mendDiagram } from "../core/diagram";
import { api } from "./api";
import { Code } from "./Code";
import { exportPng, exportSvg } from "./chartExport";

let loaded: Promise<typeof import("mermaid").default> | null = null;
let counter = 0;
/** Diagrams already corrected, kept for the session so that a redraw does not ask again. */
const healed = new Map<string, { text: string; how: string }>();

const css = (name: string, d: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || d;

/** Drawings go one after the other: Mermaid draws in a temporary element of the page, and two at once spoil each other's. */
let queue: Promise<unknown> = Promise.resolve();
const draw = (text: string, light = false): Promise<{ svg: string } | { error: string }> => (queue = queue.then(() => drawNow(text, light), () => drawNow(text, light))) as Promise<{ svg: string } | { error: string }>;
/** A diagram drawn for a file (Word, PowerPoint): the same drawing, always in the light colours, whatever the app shows. */
export const drawDiagram = (text: string) => draw(text, true);

/** Draws a text; the error when it did not draw. */
async function drawNow(text: string, light = false): Promise<{ svg: string } | { error: string }> {
  const id = `npu-diagram-${++counter}`;
  try {
    if (!diagramKind(text)) return { error: "the first line must name the kind of diagram (flowchart TD, sequenceDiagram, mindmap...)" };
    const mermaid = await engine(light);
    return { svg: (await mermaid.render(id, text)).svg };
  } catch (e) {
    // what a failed drawing leaves in the page (its temporary element, and Mermaid's error picture)
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
    return { error: String((e as Error).message ?? e).split("\n").slice(0, 3).join(" ").slice(0, 240) };
  }
}

/** Mermaid is large and needed by few answers: it is loaded the first time a diagram is drawn. */
async function engine(light = false) {
  loaded ??= import("mermaid").then((m) => m.default);
  const mermaid = await loaded;
  const pick = (name: string, d: string) => (light ? d : css(name, d));
  const text = pick("--text", "#141413"), bg = pick("--surface", "#ffffff"), border = pick("--border", "#e5e3da"), accent = pick("--accent", "#4e288f"), muted = pick("--muted", "#6a6963");
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
  const [fixing, setFixing] = useState(false);
  const [fixed, setFixed] = useState<string | null>(null);
  const [theme, setTheme] = useState(0);
  const [source, setSource] = useState<FigureSource | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const liveBody = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  const body = useRef<HTMLDivElement>(null);
  /** While the block is being written: what of it already draws (its last, maybe unfinished, line left out). */
  const [partial, setPartial] = useState<string | null>(null);
  const latest = useRef(raw);
  latest.current = raw;
  // redrawn when the colour scheme changes
  useEffect(() => {
    const q = window.matchMedia?.("(prefers-color-scheme: dark)");
    const again = () => setTheme((n) => n + 1);
    q?.addEventListener?.("change", again);
    const obs = new MutationObserver(again);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => { q?.removeEventListener?.("change", again); obs.disconnect(); };
  }, []);
  // what is new in each partial drawing arrives softly, the rest stays still
  useLayoutEffect(() => {
    const el = liveBody.current;
    if (!el || !partial) return;
    const first = seen.current.size === 0;
    el.querySelectorAll(".node, .edgePath, .actor, .cluster, .messageLine0, .messageLine1, .edgeLabel").forEach((n, i) => {
      const key = `${n.getAttribute("class") ?? ""}|${n.id || i}`;
      if (!seen.current.has(key)) { seen.current.add(key); if (!first) n.classList.add("npu-new"); }
    });
  }, [partial]);
  useEffect(() => {
    if (!live) return;
    let off = false, last = "";
    const tick = async () => {
      const lines = latest.current.split("\n");
      lines.pop();
      const t = mendDiagram(lines.join("\n"));
      if (lines.length < 2 || t === last) return;
      last = t;
      const r = await draw(t);
      if (!off && "svg" in r) setPartial(r.svg);
    };
    void tick();
    const iv = setInterval(tick, 900);
    return () => { off = true; clearInterval(iv); };
  }, [live, theme]);
  useEffect(() => {
    if (live) return;
    let off = false;
    setError(null); setSource(null); setWhy(null);
    (async () => {
      const kept = healed.get(text);
      if (kept) { const r = await draw(kept.text); if (!off && "svg" in r) { setSvg(r.svg); setFixed(kept.how); return; } }
      setFixing(true);
      let last: { svg: string } | null = null;
      const result = await healDiagram(text, async (t) => { const r = await draw(t); if ("svg" in r) { last = r; return null; } if (t === text && !off) { setWhy(r.error); const at = Number(/line (\d+)/i.exec(r.error)?.[1]); if (at >= 1) { const all = text.split("\n"), from = Math.max(0, at - 2); setSource({ lines: all.slice(from, at + 1), at: at - 1 - from }); } } return r.error; }, async (t, why) => api().fixBlock("mermaid", t, why));
      if (off) return;
      if (!("error" in result) && result.how !== "none") {
        // the faulty line is struck and the new one shows for a moment, before the diagram is drawn
        const was = text.split("\n"), now = result.text.split("\n"), k = was.findIndex((l, i) => l !== now[i]);
        if (k >= 0) { setSource({ lines: was.slice(Math.max(0, k - 1), k + 2), at: Math.min(1, k), now: now[k] ?? "" }); await new Promise((r) => setTimeout(r, 1100)); if (off) return; }
      }
      setFixing(false);
      if ("error" in result) { setSvg(null); setError(result.error); return; }
      if (result.how !== "none") healed.set(text, { text: result.text, how: result.how });
      setFixed(result.how === "none" ? null : result.how);
      // the last drawing that worked is the one for the text that was kept
      const r = result.how === "none" || !last ? await draw(result.text) : last;
      if (!off && "svg" in r) setSvg(r.svg);
    })();
    return () => { off = true; };
  }, [text, live, theme]);

  if (live) {
    if (!partial) return <div className="chart-block"><FigureProgress kind="diagram" /></div>;
    return (
      <div className="chart-block diagram-block">
        <div className="chart-head"><strong>Diagram</strong><span className="chart-live"><StepIcon tag="diagram" state="running" /><span className="shimmer">Drawing the diagram</span></span></div>
        <div ref={liveBody} className="diagram-svg" dangerouslySetInnerHTML={{ __html: partial }} />
      </div>
    );
  }
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
      {fixing && !svg && <FigureProgress kind="diagram" fixing why={why} source={source} />}
      {fixed && svg && <div className="chart-note">{fixed === "model" ? "Corrected automatically by the assistant." : fixed === "trimmed" ? "Corrected automatically: a line that could not be drawn was left out." : "Corrected automatically."}</div>}
      {error && <div className="chart-note">This diagram could not be drawn, even after being corrected: {error}.</div>}
      {(showCode || error) ? <div className="codeblock"><pre><code><Code text={text} lang="text" /></code></pre></div>
        : fixing ? null : svg ? <div ref={body} className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <FigureProgress kind="diagram" />}
    </div>
  );
}
