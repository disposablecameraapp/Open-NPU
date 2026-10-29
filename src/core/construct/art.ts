/**
 * The pictures of a program, kept coherent by code. A small model that draws each object on its own gives lines of every thickness,
 * colours that do not belong together and sizes that were shrunk after the fact. So the drawings are DATA in the state
 * (`S.art`: a palette, one stroke width, the real size of each thing, one SVG per thing) and what the model draws is put right here:
 *   - the size is the thing's own size (viewBox and width/height = its w and h), never scaled afterwards, so every line has the same width
 *   - every stroke is the one stroke width of the program
 *   - every colour is a colour of the palette (the nearest one), written `var(--name, #hex)` so a new palette restyles every picture
 *   - nothing that draws no shape: no text, script, image or foreign object
 */
export interface Art {
  stroke: number;
  palette: Record<string, string>;
  sizes: Record<string, [number, number]>;
  sprites: Record<string, string>;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function rgb(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null;
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** The palette entry nearest to a colour (plain distance in RGB), as `[name, hex]`; null when the colour is not a hex code. */
export function nearest(colour: string, palette: Record<string, string>): [string, string] | null {
  const c = rgb(colour);
  if (!c) return null;
  let best: [string, string] | null = null, bestD = Infinity;
  for (const [name, hex] of Object.entries(palette)) {
    const p = rgb(hex);
    if (!p) continue;
    const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = [name, hex]; }
  }
  return best;
}

/** One drawing put into the program's own form: its size, its stroke, its colours. A reply that holds no <svg> gives null. */
export function normalizeSvg(svg: string, art: { stroke: number; palette: Record<string, string> }, size: [number, number]): string | null {
  const m = /<svg\b[\s\S]*<\/svg>/i.exec(svg);
  if (!m) return null;
  let body = m[0]
    .replace(/<(script|text|image|foreignObject|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|text|image|foreignObject)\b[^>]*\/>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "");
  const inner = /<svg\b[^>]*>([\s\S]*)<\/svg>/i.exec(body)?.[1] ?? "";
  if (!/<(rect|circle|ellipse|path|polygon|polyline|line|g)\b/i.test(inner)) return null;
  // colours: the nearest palette colour, written so that a new palette restyles it
  const snap = (v: string) => {
    if (/^var\(/i.test(v) || /^(none|transparent|currentColor)$/i.test(v)) return v;
    const n = nearest(v.trim(), art.palette);
    return n ? `var(--${n[0]}, ${n[1]})` : v;
  };
  body = body.replace(/\b(fill|stroke)\s*=\s*("([^"]*)"|'([^']*)')/gi, (_m, k: string, _q: string, d: string | undefined, s: string | undefined) => `${k}='${snap(d ?? s ?? "")}'`);
  body = body.replace(/\bstroke-width\s*=\s*("[^"]*"|'[^']*')/gi, `stroke-width='${art.stroke}'`);
  const [w, h] = size;
  const head = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}'>`;
  return `${head}${/<svg\b[^>]*>([\s\S]*)<\/svg>/i.exec(body)![1]}</svg>`;
}

/** A state whose `art` holds drawings: every drawing put into the program's form. Anything that is not such a state is returned as it was. */
export function normalizeArt(stateCode: string): string {
  try {
    const o = JSON.parse(stateCode) as { art?: Partial<Art> };
    const a = o?.art;
    if (!a || typeof a !== "object" || !a.sprites || typeof a.sprites !== "object" || !a.palette || typeof a.palette !== "object") return stateCode;
    const stroke = typeof a.stroke === "number" && a.stroke > 0 ? a.stroke : 2;
    const sprites: Record<string, string> = {};
    for (const [name, svg] of Object.entries(a.sprites)) {
      const size = a.sizes?.[name];
      const fixed = typeof svg === "string" && size ? normalizeSvg(svg, { stroke, palette: a.palette as Record<string, string> }, size) : null;
      if (fixed) sprites[name] = fixed;
      else if (typeof svg === "string") sprites[name] = svg; // a drawing that cannot be read stays as it was: the view draws a plain shape when the picture does not load
    }
    return JSON.stringify({ ...o, art: { ...a, stroke, sprites } }, null, 2);
  } catch { return stateCode; }
}

/** What the writer of a change is told when the state holds drawings. */
export const ART_RULES = "S.art holds the pictures: `palette` (names to colours), `stroke` (the ONE line width), `sizes` (the real size of each thing, [w, h]) and `sprites` (one SVG per thing). To change how a thing looks, rewrite its SVG: viewBox exactly `0 0 w h` of its size, single quotes for attributes, every line with the stroke width, colours as var(--name, #hex) with names of the palette, no text and no images, shapes only, drawn as this program's other pictures are drawn. To restyle everything, change the palette values and nothing else.";
