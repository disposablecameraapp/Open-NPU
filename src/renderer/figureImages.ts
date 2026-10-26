import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { ChartBlock } from "./ChartBlock";
import { drawDiagram } from "./DiagramBlock";
import { svgToPng } from "./chartExport";
import { healDiagram, mendDiagram } from "../core/diagram";
import { figuresIn, type Figure } from "../core/figures";
import { figuresOfDeck, picFromData, type Pics } from "../core/slides";
import { figureKey } from "../core/figures";

/** The pictures already drawn, kept for the session: drawing a diagram takes a moment and the same text always gives the same picture. */
const done = new Map<string, Promise<string | null>>();

const LIGHT = "--bg:#ffffff;--surface:#ffffff;--text:#141413;--muted:#6a6963;--border:#e5e3da;--accent:#4e288f";

/** A hidden corner of the page where a figure is put to be measured and turned into a picture. */
function stage(): HTMLDivElement {
  const div = document.createElement("div");
  div.setAttribute("style", `position:fixed;left:-10000px;top:0;width:680px;pointer-events:none;${LIGHT}`);
  document.body.appendChild(div);
  return div;
}
const frames = (n: number) => new Promise<void>((ok) => { const step = (k: number) => (k ? requestAnimationFrame(() => step(k - 1)) : ok()); step(n); });

async function drawMermaid(raw: string): Promise<string | null> {
  const text = mendDiagram(raw);
  let last: { svg: string } | null = null;
  const result = await healDiagram(text, async (t) => { const r = await drawDiagram(t); if ("svg" in r) { last = r; return null; } return r.error; }, async (t, why) => api().fixBlock("mermaid", t, why));
  if ("error" in result) return null;
  const r = result.how === "none" || !last ? await drawDiagram(result.text) : last;
  if (!("svg" in r)) return null;
  const host = stage();
  try {
    host.innerHTML = r.svg;
    const svg = host.querySelector("svg");
    return svg ? (await svgToPng(svg as SVGSVGElement))?.dataUrl ?? null : null;
  } finally { host.remove(); }
}

async function drawChart(raw: string): Promise<string | null> {
  const host = stage();
  const root = createRoot(host);
  try {
    root.render(createElement(ChartBlock, { raw }));
    await frames(3);
    const svg = host.querySelector("svg.chart-svg");
    return svg ? (await svgToPng(svg as SVGSVGElement))?.dataUrl ?? null : null;
  } finally { root.unmount(); host.remove(); }
}

/** The picture (PNG data address) of one figure, or null when it cannot be drawn. */
export function figureImage(f: Figure): Promise<string | null> {
  let p = done.get(f.key);
  if (!p) { p = (f.lang === "chart" ? drawChart(f.raw) : drawMermaid(f.raw)).catch(() => null); done.set(f.key, p); }
  return p.then((v) => { if (!v) done.delete(f.key); return v; });
}

/** The figures of a text drawn one after the other (a diagram goes through a single drawing queue), as pictures keyed the way slides and Word files look them up. */
export async function renderFigures(figs: Figure[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const f of figs) { const v = await figureImage(f); if (v) out[f.key] = v; }
  return out;
}

export const figuresOfText = (text: string, deck: boolean): Figure[] =>
  deck ? figuresOfDeck(text).map((f) => ({ key: figureKey(f.lang, f.raw), lang: f.lang, raw: f.raw })) : figuresIn(text);

/** Data addresses as the pictures a layout reads. */
export function picsOf(images: Record<string, string>): Pics {
  const out: Pics = {};
  for (const [k, v] of Object.entries(images)) { const p = picFromData(v, ""); if (p) out[k] = p; }
  return out;
}
