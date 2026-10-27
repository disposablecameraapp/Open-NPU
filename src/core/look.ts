import type { Prim, Theme } from "./slides";
import { LOOK_FONTS as FONTS } from "./fonts";
import { contrast, hex6, inkOn, isHex, mixColor, toward } from "./color";

/**
 * The look of a deck as a small JSON that the model decides, inside rules it cannot break.
 *  - `legalize` keeps every pair of colours readable (contrast of text, titles, accents and panels), whatever was asked.
 *  - `backgroundPrims` draws procedural backgrounds (gradient, mesh, waves, rings, dots, stripes, grid, confetti, blocks) from a
 *    kind and a seed: the same seed gives the same picture, any other seed a new one, so the looks are not a list.
 *  - `lookProblems` / `normalizeLook` check the JSON and say what is wrong, so the model is asked again; what stays wrong is dropped.
 */

export const BG_KINDS = ["plain", "gradient", "mesh", "waves", "rings", "dots", "stripes", "grid", "confetti", "blocks"] as const;
export type BgKind = (typeof BG_KINDS)[number];

/** Every pair of colours of a theme made readable: text 4.5, titles 4.5, accents and muted text 3, text on panels 4.5. */
export function legalize(t: Theme): { theme: Theme; fixes: string[] } {
  const fixes: string[] = [];
  const fix = (name: string, color: string, min: number, against: string): string => { const c = toward(color, against, min); if (c !== color) fixes.push(`${name} made readable on its background`); return c; };
  const o: Theme = { ...t };
  o.title = fix("title", t.title, 4.5, t.bg);
  o.muted = fix("muted text", t.muted, 3, t.bg);
  o.accents = t.accents.map((a, i) => fix(`accent ${i + 1}`, a, 3, t.bg));
  o.accent = o.accents[0] ?? fix("accent", t.accent, 3, t.bg);
  // a panel must show against the page, and the text must stay readable on both
  let panel = t.panel;
  if (contrast(panel, t.bg) < 1.03) { panel = mixColor(t.bg, t.text, 0.09); fixes.push("panel colour recomputed"); }
  o.panel = panel;
  o.text = fix("text", fix("text", t.text, 4.5, t.bg), 4.5, panel);
  if (contrast(o.text, panel) < 4.5) { o.panel = t.bg; fixes.push("panel colour recomputed"); }
  o.dark = contrast("FFFFFF", t.bg) > contrast("000000", t.bg);
  return { theme: o, fixes };
}

// ---------------------------------------------------------------- procedural backgrounds
const rng = (seed: number) => { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/**
 * A background from a kind and a seed. `strength` is 0 to 1: a cover can take it all, a content slide only a faint trace so the
 * text on it stays readable (shapes are translucent and lines are mixed with the page colour, never as dark as the text).
 */
export function backgroundPrims(kind: BgKind, seed: number, t: Theme, strength: number, region?: { x: number; y: number; w: number; h: number }): Prim[] {
  const W = 960, H = 540, r = rng(seed), out: Prim[] = [];
  const R = region ?? { x: 0, y: 0, w: W, h: H };
  const k = Math.max(0, Math.min(1, strength));
  const accent = (i: number) => t.accents[i % t.accents.length];
  const faint = (c: string, a: number) => mixColor(t.bg, c, a * k);
  const px = () => R.x + r() * R.w, py = () => R.y + r() * R.h;
  switch (kind) {
    case "gradient": out.push({ k: "rect", x: R.x, y: R.y, w: R.w, h: R.h, fill: t.bg, grad: { to: mixColor(t.bg, accent(0), 0.1 + 0.25 * k), angle: 30 + Math.round(r() * 120) } }); break;
    case "mesh": for (let i = 0; i < 6; i++) { const d = 220 + r() * 360; out.push({ k: "ellipse", x: px() - d / 2, y: py() - d / 2, w: d, h: d, fill: accent(i), alpha: (0.07 + r() * 0.16) * (0.4 + k) }); } break;
    case "waves": for (let i = 0; i < 4; i++) {
      const base = R.y + R.h * (0.5 + 0.13 * i), amp = 14 + r() * 34, len = 260 + r() * 340, ph = r() * 6.28, pts: [number, number][] = [];
      for (let x = R.x; x <= R.x + R.w + 20; x += 20) pts.push([x, base + Math.sin((x / len) * 6.28 + ph) * amp]);
      out.push({ k: "poly", pts, color: faint(accent(i), 0.5), width: 2.5 });
    } break;
    case "rings": { const cx = R.x + R.w * (0.65 + r() * 0.3), cy = R.y + R.h * (r() * 0.5); for (let i = 1; i <= 6; i++) { const d = i * (90 + r() * 30); out.push({ k: "ellipse", x: cx - d, y: cy - d, w: d * 2, h: d * 2, line: faint(accent(i), 0.55) }); } } break;
    case "dots": { const step = 30 + Math.round(r() * 20); for (let y = R.y + 14; y < R.y + R.h; y += step) for (let x = R.x + 14; x < R.x + R.w; x += step) { const near = (x - R.x) / R.w; if (r() < 0.25 + 0.6 * near) out.push({ k: "ellipse", x, y, w: 5 + r() * 4, h: 5 + r() * 4, fill: accent(0), alpha: (0.1 + 0.3 * near) * (0.4 + k) }); } } break;
    case "stripes": { const gap = 26 + Math.round(r() * 30), slant = 120 + r() * 200; for (let x = R.x - slant; x < R.x + R.w; x += gap) out.push({ k: "line", x1: x + slant, y1: R.y, x2: x, y2: R.y + R.h, color: faint(accent(0), 0.4), width: 1.5 }); } break;
    case "grid": { const g = 40 + Math.round(r() * 30); for (let x = R.x; x <= R.x + R.w; x += g) out.push({ k: "line", x1: x, y1: R.y, x2: x, y2: R.y + R.h, color: faint(t.text, 0.14), width: 0.75 }); for (let y = R.y; y <= R.y + R.h; y += g) out.push({ k: "line", x1: R.x, y1: y, x2: R.x + R.w, y2: y, color: faint(t.text, 0.14), width: 0.75 }); } break;
    case "confetti": for (let i = 0; i < 36; i++) { const d = 8 + r() * 16; out.push({ k: r() < 0.5 ? "ellipse" : "rect", x: px(), y: py(), w: d, h: d, fill: accent(i), alpha: (0.1 + r() * 0.3) * (0.4 + k) }); } break;
    case "blocks": for (let i = 0; i < 6; i++) { const w = 120 + r() * 240, h = 80 + r() * 160; out.push({ k: "round", x: px() - w / 2, y: py() - h / 2, w, h, fill: accent(i), alpha: (0.06 + r() * 0.12) * (0.4 + k) }); } break;
    default: break;
  }
  return out;
}

// ---------------------------------------------------------------- the JSON the model gives
export interface SlideLook { n: number; bg?: string; accent?: string; accent2?: string; background?: BgKind; seed?: number }
export interface Look {
  base?: string;
  colors?: { bg?: string; text?: string; title?: string; accent?: string; accent2?: string; accent3?: string };
  fonts?: { title?: string; body?: string };
  background?: { kind?: BgKind; seed?: number; bg2?: string; power?: number };
  deco?: Theme["deco"]; cover?: Theme["cover"]; pattern?: Theme["pattern"];
  slides?: SlideLook[];
}
const COLOR = { type: "string", pattern: "^[0-9A-Fa-f]{6}$", description: "six hex digits, no #" } as const;
export const LOOK_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    base: { type: "string", description: "a theme name, or 2 to 4 words that describe the look (old warm serif, tech dark, school colourful)" },
    colors: { type: "object", additionalProperties: false, properties: { bg: COLOR, text: COLOR, title: COLOR, accent: COLOR, accent2: COLOR, accent3: COLOR }, description: "2 to 4 colours in all: a background, a main accent and up to two more" },
    fonts: { type: "object", additionalProperties: false, properties: { title: { type: "string", enum: [...new Set(FONTS)] }, body: { type: "string", enum: [...new Set(FONTS)] } } },
    background: { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: [...BG_KINDS] }, seed: { type: "integer", minimum: 0, maximum: 99999 }, bg2: COLOR, power: { type: "number", minimum: 0, maximum: 1 } }, description: "the procedural background: its kind, a seed (another seed, another picture), a second colour for a gradient, its strength" },
    deco: { type: "string", enum: ["bar", "top", "band", "none"] },
    cover: { type: "string", enum: ["deep", "split", "light", "frame"] },
    pattern: { type: "string", enum: ["circles", "grid", "none"] },
    slides: { type: "array", maxItems: 20, description: "optional looks for single slides (a divider, the closing): at most 4 colours each", items: { type: "object", additionalProperties: false, required: ["n"], properties: { n: { type: "integer", minimum: 1 }, bg: COLOR, accent: COLOR, accent2: COLOR, background: { type: "string", enum: [...BG_KINDS] }, seed: { type: "integer", minimum: 0, maximum: 99999 } } } }
  }
} as const;

export const LOOK_INSTRUCTIONS = [
  "You design the look of a presentation as a small JSON object. You write no slide text.",
  "Choose 2 to 4 colours for the whole deck (a background, a main accent, up to two more), two fonts, a procedural background and its seed. Slides may have a look of their own (a divider, the closing): at most 4 colours on one slide, never a wild change.",
  "The colours must suit the subject and what the person asked for (old, tech, school, elegant, a colour name...). The app corrects contrast automatically, so you can be bold, but a very pale text on a pale background is wasted.",
  "Backgrounds: gradient, mesh (soft blobs), waves, rings, dots, stripes, grid, confetti, blocks, plain. A calm subject takes gradient or waves, a technical one grid or dots, a playful one confetti or blocks. Change the seed to get a different picture.",
  "Reply with the JSON object only."
].join("\n");

const FONT_LOWER = new Map(FONTS.map((f) => [f.toLowerCase(), f]));
/** What is wrong with a reply, in words the model can act on; empty when it can be used. */
export function lookProblems(look: unknown, slideCount = 20): string[] {
  const out: string[] = [];
  if (!look || typeof look !== "object" || Array.isArray(look)) return ["the answer is not a JSON object"];
  const l = look as Look;
  for (const [k, v] of Object.entries(l.colors ?? {})) if (!isHex(v)) out.push(`colors.${k} "${String(v)}" is not a hex colour of six digits`);
  if (l.background?.bg2 !== undefined && !isHex(l.background.bg2)) out.push("background.bg2 is not a hex colour");
  if (l.background?.kind !== undefined && !(BG_KINDS as readonly string[]).includes(l.background.kind)) out.push(`background.kind "${l.background.kind}" is not one of ${BG_KINDS.join(", ")}`);
  for (const k of ["title", "body"] as const) { const f = l.fonts?.[k]; if (f !== undefined && !FONT_LOWER.has(String(f).toLowerCase())) out.push(`fonts.${k} "${f}" is not one of ${[...new Set(FONTS)].join(", ")}`); }
  const colours = Object.values(l.colors ?? {}).filter((v) => isHex(v));
  if (colours.length > 4) out.push(`${colours.length} colours for the deck: use 4 at most`);
  (l.slides ?? []).forEach((s, i) => {
    if (!Number.isInteger(s?.n) || s.n < 1 || s.n > slideCount) out.push(`slides[${i}].n is not a slide number from 1 to ${slideCount}`);
    const n = [s?.bg, s?.accent, s?.accent2].filter((v) => v !== undefined);
    if (n.length > 4) out.push(`slide ${s?.n}: more than 4 colours`);
    for (const [k, v] of Object.entries({ bg: s?.bg, accent: s?.accent, accent2: s?.accent2 })) if (v !== undefined && !isHex(v)) out.push(`slide ${s?.n}: ${k} "${String(v)}" is not a hex colour`);
    if (s?.background !== undefined && !(BG_KINDS as readonly string[]).includes(s.background)) out.push(`slide ${s?.n}: background "${s.background}" is not a known kind`);
  });
  return out;
}

/** The usable part of a look: what is invalid is dropped, fonts are matched without case, colours are written in full. */
export function normalizeLook(raw: unknown, slideCount = 20): Look {
  const l = (raw && typeof raw === "object" ? raw : {}) as Look;
  const col = (v: unknown) => (isHex(v) ? hex6(v) : undefined);
  const font = (v: unknown) => (typeof v === "string" ? FONT_LOWER.get(v.toLowerCase()) : undefined);
  const kind = (v: unknown) => ((BG_KINDS as readonly string[]).includes(String(v)) ? (v as BgKind) : undefined);
  const out: Look = { base: typeof l.base === "string" ? l.base.slice(0, 60) : undefined };
  const c = l.colors ?? {};
  out.colors = { bg: col(c.bg), text: col(c.text), title: col(c.title), accent: col(c.accent), accent2: col(c.accent2), accent3: col(c.accent3) };
  out.fonts = { title: font(l.fonts?.title), body: font(l.fonts?.body) };
  out.background = { kind: kind(l.background?.kind), seed: Number.isInteger(l.background?.seed) ? l.background!.seed : undefined, bg2: col(l.background?.bg2), power: typeof l.background?.power === "number" ? Math.max(0, Math.min(1, l.background.power)) : undefined };
  out.deco = (["bar", "top", "band", "none"] as const).find((x) => x === l.deco);
  out.cover = (["deep", "split", "light", "frame"] as const).find((x) => x === l.cover);
  out.pattern = (["circles", "grid", "none"] as const).find((x) => x === l.pattern);
  out.slides = (l.slides ?? []).filter((s) => Number.isInteger(s?.n) && s.n >= 1 && s.n <= slideCount).slice(0, 20).map((s) => ({ n: s.n, bg: col(s.bg), accent: col(s.accent), accent2: col(s.accent2), background: kind(s.background), seed: Number.isInteger(s.seed) ? s.seed : undefined }));
  return out;
}

const q = (v: string) => (/\s/.test(v) ? `"${v}"` : v);
/** The look as the changes of the deck's Theme line, which apply to every slide. */
export function lookTweak(look: Look): string {
  const p: string[] = [], c = look.colors ?? {};
  if (c.bg) p.push(`bg=${c.bg}`);
  if (c.accent) p.push(`accent=${c.accent}`);
  if (c.accent2) p.push(`accent2=${c.accent2}`);
  if (c.accent3) p.push(`accent3=${c.accent3}`);
  if (c.text) p.push(`text=${c.text}`);
  if (c.title) p.push(`title=${c.title}`);
  if (look.fonts?.title) p.push(`titlefont=${q(look.fonts.title)}`);
  if (look.fonts?.body) p.push(`font=${q(look.fonts.body)}`);
  if (look.deco) p.push(`deco=${look.deco}`);
  if (look.cover) p.push(`cover=${look.cover}`);
  if (look.pattern) p.push(`pattern=${look.pattern}`);
  const b = look.background;
  if (b?.kind) p.push(`bgkind=${b.kind}`);
  if (b?.seed !== undefined) p.push(`seed=${b.seed}`);
  if (b?.bg2) p.push(`bg2=${b.bg2}`);
  if (b?.power !== undefined) p.push(`power=${b.power}`);
  return p.join(" ");
}
/** The Style line of one slide's own look. */
export function slideLookStyle(s: SlideLook): string {
  const p: string[] = [];
  if (s.bg) p.push(`bg=${s.bg}`);
  if (s.accent) p.push(`accent=${s.accent}`);
  if (s.accent2) p.push(`accent2=${s.accent2}`);
  if (s.background) p.push(`bgkind=${s.background}`);
  if (s.seed !== undefined) p.push(`seed=${s.seed}`);
  return p.join(" ");
}
export { inkOn };

/** The first JSON object in a reply, however the model wrapped it. */
export function firstJson(reply: string): unknown {
  const t = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, " ").replace(/```(?:json)?/gi, "");
  const from = t.indexOf("{");
  for (let to = t.lastIndexOf("}"); from >= 0 && to > from; to = t.lastIndexOf("}", to - 1)) { try { return JSON.parse(t.slice(from, to + 1)); } catch { /* a shorter cut */ } }
  return null;
}
/** A seed from a text: the same title always gets the same picture, another title another one. */
export const seedOf = (text: string): number => { let h = 7; for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 99991; return h; };

/**
 * The JSON of a reply that is still being written, closed where it stopped: an open string is shut, a dangling key or comma is
 * dropped, open arrays and objects are closed. Used to show a document growing while the model fills it in. null before the first brace.
 */
export function repairJson(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, " ").replace(/```(?:json)?/gi, "");
  const from = t.indexOf("{");
  if (from < 0) return null;
  let s = t.slice(from);
  for (let guard = 0; guard < 40 && s.length > 1; guard++) {
    const stack: string[] = [];
    let inStr = false, esc = false;
    for (const c of s) {
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === "{" || c === "[") stack.push(c); else if (c === "}" || c === "]") stack.pop();
    }
    let body = inStr ? `${s}"` : s;
    body = body.replace(/,\s*$/, "").replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, "").replace(/(?:\btru|\bfals|\bnul)$/, "").replace(/[-+.eE]+$/, "");
    const closed = body + stack.reverse().map((c) => (c === "{" ? "}" : "]")).join("");
    try { return JSON.parse(closed); } catch { /* cut back to the previous comma and try again */ }
    const cut = s.lastIndexOf(",");
    if (cut <= 0) break;
    s = s.slice(0, cut);
  }
  return null;
}
