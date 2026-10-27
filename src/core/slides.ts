// Slides: the text form, themes, ONE layout, and two renderers of that layout (the real .pptx and an HTML preview).
// Because both draw the same shapes, the screenshot taken of the preview is what the file contains.
// Source form (see office.ts): slides separated by a line ---; "Theme: id" in the first block; per slide
//   "# Title", "- bullets", plain lines, a | table | (with "Chart: bar|line|pie" above it, a chart), "Flow: a -> b -> c",
//   "Stats: 930bn | Trade in 2025 ; 180% | of GDP" (big figures), "Column: Heading | point ; point" (up to 3 columns),
//   "![caption](wikimedia:File name.jpg)" for a Wikimedia Commons picture, "Notes: …" for the speaker.
import { escText, esc } from "./xml";
import { toBytes, writeZip, type ZipFiles } from "./zip";
import * as P from "./officeParts";
import { figureKey, type FigureLang } from "./figures";

export const SLIDE_PT = { w: 960, h: 540 };
const EMU = 12700;

// ---------------------------------------------------------------- source

export interface Slide {
  title: string;
  lines: { text: string; level: number; bullet: boolean }[];
  table: string[][] | null;
  notes: string;
  image?: { caption: string; file: string };
  chart?: ChartKind;
  flow?: string[];
  /** This slide's own look: background, accent colour, fonts, size of the text (hex or a colour name). */
  style?: SlideStyle;
  /** Highlighted text blocks (a key message, a quote) above the rest of the slide. */
  blocks?: { kind: "callout" | "quote"; text: string; by?: string }[];
  /** Big figures in cards ("930bn" over "Trade in 2025"), a row above the rest of the slide. */
  stats?: { value: string; label: string }[];
  /** Two or three columns, each a heading and a few short lines (a comparison, parts of a whole); they take the place of the bullets and of the visual. */
  columns?: { head: string; lines: string[] }[];
  /** A diagram (Mermaid) or a chart block the window draws; shown as a picture. */
  figure?: { lang: FigureLang; raw: string };
}
export type ChartKind = "bar" | "line" | "pie";
export interface SlideStyle { bg?: string; accent?: string; font?: string; titleFont?: string; size?: "small" | "large" }

export const FONTS = ["Calibri", "Segoe UI", "Georgia", "Cambria", "Arial", "Verdana", "Trebuchet MS", "Times New Roman", "Garamond", "Consolas"];
const COLOR_NAMES: Record<string, string> = { red: "DC2626", orange: "EA580C", yellow: "F59E0B", gold: "CA8A04", green: "16A34A", teal: "0D9488", cyan: "0891B2", blue: "2563EB", navy: "1E3A8A", purple: "7C3AED", violet: "7C3AED", pink: "DB2777", brown: "92400E", black: "111111", white: "FFFFFF", gray: "6B7280", grey: "6B7280", cream: "FFF8F0", beige: "F5EBDD", sand: "F5EBDD", charcoal: "1F2937", midnight: "0F172A" };
export function colorOf(v: string): string | undefined {
  const x = v.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/.test(x)) return x.toUpperCase();
  if (/^[0-9a-f]{3}$/.test(x)) return x.split("").map((c) => c + c).join("").toUpperCase();
  return COLOR_NAMES[x];
}
const fontOf = (v: string): string | undefined => FONTS.find((f) => f.toLowerCase() === v.trim().toLowerCase().replace(/_/g, " "));
export function parseStyle(line: string): SlideStyle | undefined {
  const st: SlideStyle = {};
  for (const m of line.matchAll(/(\w+)\s*=\s*("[^"]*"|[^\s,;]+)/g)) {
    const k = m[1].toLowerCase(), v = m[2].replace(/^"|"$/g, "");
    if (k === "bg" || k === "background") st.bg = colorOf(v) ?? st.bg;
    else if (k === "accent" || k === "color") st.accent = colorOf(v) ?? st.accent;
    else if (k === "font") st.font = fontOf(v) ?? st.font;
    else if (k === "titlefont") st.titleFont = fontOf(v) ?? st.titleFont;
    else if (k === "size") st.size = /^(small|s)/i.test(v) ? "small" : /^(large|big|l)/i.test(v) ? "large" : st.size;
  }
  return Object.keys(st).length ? st : undefined;
}
const lum = (hex: string) => { const c = [0, 2, 4].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const mix = (a: string, b: string, k: number) => [0, 2, 4].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join("").toUpperCase();
/** The theme with a slide's own look on top: text colours follow the background so it stays readable. */
export function styledTheme(t: Theme, st?: SlideStyle): Theme {
  if (!st) return t;
  const o: Theme = { ...t };
  if (st.bg) {
    o.bg = st.bg; o.dark = lum(st.bg) < 0.3;
    o.text = o.dark ? "F1F5F9" : "1F2937"; o.title = o.dark ? "FFFFFF" : "111827"; o.muted = o.dark ? "B4BED0" : "6B7280";
    o.panel = mix(st.bg, o.dark ? "FFFFFF" : "000000", 0.1);
    if (Math.abs(lum(o.accent) - lum(st.bg)) < 0.12) { o.accent = o.dark ? "22D3EE" : "1F3864"; o.accents = [o.accent, ...t.accents.slice(1)]; }
  }
  if (st.accent && Math.abs(lum(st.accent) - lum(o.bg)) >= 0.12) { o.accent = st.accent; o.accents = [st.accent, ...t.accents.filter((a) => a !== t.accent).slice(0, 3)]; }
  if (st.font) { o.bodyFont = st.font; if (!st.titleFont) o.titleFont = st.font; }
  if (st.titleFont) o.titleFont = st.titleFont;
  return o;
}

export const wikiFile = (href: string): string | null => {
  const m = /^wikimedia:(.+)$/i.exec(href.trim());
  if (!m) return null;
  try { return decodeURIComponent(m[1]).replace(/^File:/i, "").replace(/_/g, " ").trim(); } catch { return m[1].replace(/^File:/i, "").replace(/_/g, " ").trim(); }
};

export function plain(s: string): string { return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/g, "$1").replace(/`([^`]+)`/g, "$1"); }

const cells = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
const isRule = (c: string[]) => c.length > 0 && c.every((x) => /^:?-{2,}:?$/.test(x));

export function themeOf(src: string): Theme {
  const m = /^\s*theme\s*:\s*([\w -]+?)\s*$/im.exec(src.split(/^\s*-{3,}\s*$/m)[0] ?? "");
  const key = (m?.[1] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return THEMES.find((t) => t.id === key || t.name.toLowerCase().replace(/[^a-z]/g, "") === key) ?? THEMES[0];
}

export function slidesOf(src: string): Slide[] {
  const slides: Slide[] = [];
  for (const chunk of src.replace(/ /g, " ").replace(/\r/g, "").split(/^\s*-{3,}\s*$/m)) {
    if (!chunk.trim()) continue;
    const s: Slide = { title: "", lines: [], table: null, notes: "" };
    const lines = chunk.split("\n");
    let inNotes = false, chart: ChartKind | undefined;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m: RegExpExecArray | null;
      if (inNotes) { s.notes += `${s.notes ? "\n" : ""}${line.trim()}`; continue; }
      if (!line.trim()) continue;
      if ((m = /^\s*(?:notes?|speaker notes?)\s*:\s*(.*)$/i.exec(line))) { inNotes = true; s.notes = m[1].trim(); continue; }
      if (/^\s*(theme|layout)\s*:/i.test(line)) continue;
      if ((m = /^\s*```(mermaid|diagram|chart)\s*$/i.exec(line))) {
        const body: string[] = [];
        while (++i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i]);
        if (!s.figure && body.join("").trim()) s.figure = { lang: m[1].toLowerCase() === "chart" ? "chart" : "mermaid", raw: body.join("\n").trim() };
        continue;
      }
      if ((m = /^\s*chart\s*:\s*(\w+)/i.exec(line))) { const k = m[1].toLowerCase(); chart = k.startsWith("pie") || k.startsWith("donut") ? "pie" : k.startsWith("line") || k.startsWith("curve") ? "line" : "bar"; continue; }
      if ((m = /^\s*(?:flow|diagram|process)\s*:\s*(.+)$/i.exec(line))) { const steps = m[1].split(/\s*(?:->|→|=>|>)\s*/).map((x) => plain(x.trim())).filter(Boolean); if (steps.length >= 2) { s.flow = steps.slice(0, 6); continue; } }
      if ((m = /^\s*(?:style|look)\s*:\s*(.+)$/i.exec(line))) { const st = parseStyle(m[1]); if (st) { s.style = st; continue; } }
      if ((m = /^\s*(callout|quote)\s*:\s*(.+)$/i.exec(line))) {
        const [txt, ...by] = m[2].split(/\s+[|—–]\s+/);
        if ((s.blocks?.length ?? 0) < 2) { (s.blocks ??= []).push({ kind: m[1].toLowerCase() as "callout" | "quote", text: plain(txt.trim()), by: by.join(" ").trim() || undefined }); continue; }
      }
      if ((m = /^\s*stats?\s*:\s*(.+)$/i.exec(line))) {
        const st = m[1].split(/\s*;\s*/).map((x) => { const [v, ...l] = x.split("|"); return { value: plain((v ?? "").trim()), label: plain(l.join("|").trim()) }; }).filter((x) => x.value);
        if (st.length) { s.stats = st.slice(0, 4); continue; }
      }
      if ((m = /^\s*column\s*:\s*(.+)$/i.exec(line))) {
        const [h, ...rest] = m[1].split("|");
        const ls = rest.join("|").split(/\s*;\s*/).map((x) => plain(x.trim())).filter(Boolean);
        if ((h ?? "").trim() && (s.columns?.length ?? 0) < 3) { (s.columns ??= []).push({ head: plain(h.trim()), lines: ls.slice(0, 4) }); continue; }
      }
      if ((m = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line))) { const f = wikiFile(m[2]); if (f && !s.image) { s.image = { caption: m[1].trim(), file: f }; continue; } }
      if ((m = /^#{1,6}\s+(.*)$/.exec(line))) { if (!s.title) s.title = plain(m[1].trim()); else s.lines.push({ text: m[1].trim(), level: 0, bullet: false }); continue; }
      if (/^\s*\|/.test(line)) {
        const rows: string[][] = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { const c = cells(lines[i]); if (!isRule(c)) rows.push(c); i++; }
        i--;
        if (rows.length) { s.table = rows; if (chart) s.chart = chart; }
        chart = undefined;
        continue;
      }
      if ((m = /^(\s*)(?:[-*+•]|\d+[.)])\s+(.*)$/.exec(line))) { s.lines.push({ text: m[2].trim(), level: Math.min(1, Math.floor(m[1].replace(/\t/g, "  ").length / 2)), bullet: true }); continue; }
      s.lines.push({ text: line.trim(), level: 0, bullet: false });
    }
    if (s.title || s.lines.length || s.table || s.image || s.flow || s.figure || s.stats || s.columns || s.blocks) slides.push(s);
  }
  return slides;
}

// ---------------------------------------------------------------- themes

export interface Theme {
  id: string; name: string; hint: string;
  bg: string; text: string; title: string; muted: string; accent: string; accents: string[]; panel: string;
  titleFont: string; bodyFont: string; dark: boolean; deco: "bar" | "top" | "band" | "none";
}
export const THEMES: Theme[] = [
  { id: "clean", name: "Clean", hint: "white, blue accents: business, reports, neutral subjects", bg: "FFFFFF", text: "262626", title: "1F3864", muted: "7F7F7F", accent: "2F5597", accents: ["2F5597", "ED7D31", "70AD47", "FFC000"], panel: "EEF2F9", titleFont: "Calibri", bodyFont: "Calibri", dark: false, deco: "bar" },
  { id: "midnight", name: "Midnight", hint: "dark navy with cyan: technology, science, modern talks", bg: "0F172A", text: "E2E8F0", title: "FFFFFF", muted: "94A3B8", accent: "22D3EE", accents: ["22D3EE", "A78BFA", "34D399", "FBBF24"], panel: "1E293B", titleFont: "Segoe UI", bodyFont: "Segoe UI", dark: true, deco: "top" },
  { id: "sunrise", name: "Sunrise", hint: "warm cream with orange: lifestyle, food, travel, culture, friendly topics", bg: "FFF8F0", text: "3B2F2F", title: "9A3412", muted: "A8967F", accent: "EA580C", accents: ["EA580C", "0F766E", "CA8A04", "BE123C"], panel: "FDEBD8", titleFont: "Georgia", bodyFont: "Calibri", dark: false, deco: "bar" },
  { id: "forest", name: "Forest", hint: "deep green and white: nature, environment, health, education", bg: "F6FAF6", text: "1F2D24", title: "14532D", muted: "6B8574", accent: "16A34A", accents: ["16A34A", "CA8A04", "0EA5E9", "DC2626"], panel: "E2F0E5", titleFont: "Cambria", bodyFont: "Calibri", dark: false, deco: "band" },
  { id: "editorial", name: "Editorial", hint: "black and white with red: history, art, journalism, serious or elegant topics", bg: "FAFAFA", text: "1A1A1A", title: "000000", muted: "757575", accent: "C8102E", accents: ["C8102E", "111827", "6B7280", "D97706"], panel: "EDEDED", titleFont: "Georgia", bodyFont: "Arial", dark: false, deco: "top" },
  { id: "violet", name: "Violet", hint: "deep purple and pink: creative, marketing, startups, music", bg: "1E1B4B", text: "E0E7FF", title: "FFFFFF", muted: "A5B4FC", accent: "F472B6", accents: ["F472B6", "818CF8", "FBBF24", "34D399"], panel: "312E81", titleFont: "Segoe UI", bodyFont: "Segoe UI", dark: true, deco: "bar" }
];

// ---------------------------------------------------------------- pictures

export interface Pic { dataUrl?: string; bytes?: Uint8Array; mime: string; w: number; h: number; credit: string }
/** The picture of a slide's figure, if the window has drawn it. */
export const figurePic = (s: Slide, pics: Pics): Pic | undefined => (s.figure ? pics[figureKey(s.figure.lang, s.figure.raw)] : undefined);
export type Pics = Record<string, Pic>;

/** Pixel size of a JPEG, PNG or GIF from its first bytes; null for anything else. */
export function imageSize(b: Uint8Array): { w: number; h: number; mime: string } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0, mime: "image/png" };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49) return { w: b[6] | b[7] << 8, h: b[8] | b[9] << 8, mime: "image/gif" };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b[i + 5] << 8 | b[i + 6], w: b[i + 7] << 8 | b[i + 8], mime: "image/jpeg" };
      i += 2 + (b[i + 2] << 8 | b[i + 3]);
    }
  }
  return null;
}

/** A picture as the window or the exporter holds it: a data address (from Wikimedia through the app) read back into bytes. */
export function picFromData(dataUrl: string, credit: string): Pic | null {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  let bytes: Uint8Array;
  try { const bin = atob(m[2]); bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0)); } catch { return null; }
  const size = imageSize(bytes);
  return { dataUrl, bytes, mime: size?.mime ?? m[1], w: size?.w ?? 0, h: size?.h ?? 0, credit };
}
export const wikiCredit = (p: { author: string; license: string }) => `Photo: ${p.author}, ${p.license} (Wikimedia Commons)`;

// ---------------------------------------------------------------- layout

export interface TextSpec { s: string; size: number; bold?: boolean; color: string; align?: "l" | "ctr" | "r"; anchor?: "t" | "ctr" | "b"; font: string; italic?: boolean }
export type Prim =
  | { k: "rect" | "round" | "ellipse"; x: number; y: number; w: number; h: number; fill?: string; alpha?: number; line?: string; text?: TextSpec }
  | { k: "pie"; x: number; y: number; w: number; h: number; from: number; to: number; fill: string }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; arrow?: boolean }
  | { k: "poly"; pts: [number, number][]; color: string; width: number }
  | { k: "image"; x: number; y: number; w: number; h: number; file: string; alt: string; contain?: boolean }
  | { k: "text"; x: number; y: number; w: number; h: number; text: TextSpec }
  | { k: "table"; x: number; y: number; w: number; h: number; rows: string[][]; size: number; font: string; head: string; stripe: string; bg: string; text: string; line: string; rowH: number };
export interface Para { text: string; level: number; bullet: boolean; size: number }
export interface Laid {
  bg: string;
  below: Prim[];
  title?: { x: number; y: number; w: number; h: number; spec: TextSpec };
  body?: { x: number; y: number; w: number; h: number; paras: Para[]; color: string; font: string; align: "l" | "ctr" };
  above: Prim[];
  notes: string;
  /** Problems the layout itself can see: text that cannot fit even at the smallest size. */
  overflow: string[];
}

const AVG = 0.5;
export const wrapLines = (text: string, size: number, width: number) => Math.max(1, Math.ceil((plain(text).length * size * AVG) / Math.max(10, width)));
function paraHeight(p: Para, width: number) { const ind = p.bullet ? p.size * 1.1 + p.level * p.size * 1.1 : 0; return wrapLines(p.text, p.size, width - ind) * p.size * 1.2 + p.size * 0.45; }
export function fitParas(items: { text: string; level: number; bullet: boolean }[], w: number, h: number, max: number, min = 14): { paras: Para[]; fits: boolean } {
  for (let size = max; size >= min; size -= 2) {
    const paras = items.map((l) => ({ ...l, size: l.level ? size - 4 : size }));
    if (paras.reduce((n, p) => n + paraHeight(p, w), 0) <= h) return { paras, fits: true };
  }
  return { paras: items.map((l) => ({ ...l, size: l.level ? min - 2 : min })), fits: false };
}
function fitOne(text: string, w: number, h: number, max: number, min: number): number {
  for (let size = max; size >= min; size -= 2) if (wrapLines(text, size, w) * size * 1.2 <= h) return size;
  return min;
}

const num = (s: string): number | null => { const t = s.replace(/[\s,%$€£]/g, "").replace(/−/g, "-"); return t !== "" && /^-?\d*\.?\d+$/.test(t) ? Number(t) : null; };
const nice = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
const fmt = (n: number) => (Math.abs(n) >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${+(n / 1e3).toFixed(1)}k` : String(+n.toFixed(2)));
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A chart drawn with plain shapes in a region (so it shows in every viewer and edits like any shape). */
export function chartPrims(kind: ChartKind, rows: string[][], x0: number, y0: number, W: number, H: number, t: Theme): Prim[] {
  const head = rows[0] ?? [];
  const body = rows.slice(1).filter((r) => r[0] !== undefined).slice(0, 12);
  const series = Math.max(1, Math.min(3, head.length - 1));
  const data = body.map((r) => ({ label: r[0], v: Array.from({ length: series }, (_, k) => num(r[k + 1] ?? "") ?? 0) }));
  const out: Prim[] = [];
  const font = t.bodyFont;
  if (!data.length) return out;
  const label = (x: number, y: number, w: number, h: number, s: string, size: number, o: Partial<TextSpec> = {}): Prim => ({ k: "text", x, y, w, h, text: { s, size, color: t.muted, font, align: "ctr", anchor: "ctr", ...o } });
  if (kind === "pie") {
    const vals = data.map((d) => Math.max(0, d.v[0]));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const d = Math.min(H - 10, W * 0.52);
    const px = x0 + 6, py = y0 + (H - d) / 2;
    let a = 0;
    vals.forEach((v, i) => { const span = (v / total) * 360; if (span > 0) out.push({ k: "pie", x: px, y: py, w: d, h: d, from: a, to: Math.min(360, a + span) - (span >= 360 ? 0.01 : 0), fill: t.accents[i % t.accents.length] }); a += span; });
    const lx = px + d + 22, lh = Math.min(30, (H - 10) / data.length);
    data.forEach((r, i) => {
      const y = y0 + (H - lh * data.length) / 2 + i * lh;
      out.push({ k: "rect", x: lx, y: y + lh / 2 - 6, w: 12, h: 12, fill: t.accents[i % t.accents.length] });
      out.push({ k: "text", x: lx + 20, y, w: x0 + W - lx - 20, h: lh, text: { s: `${short(r.label, 22)}  ${Math.round((vals[i] / total) * 100)}%`, size: 14, color: t.text, font, anchor: "ctr" } });
    });
    return out;
  }
  const legendH = series > 1 ? 24 : 0;
  const left = 46, bottom = 30;
  const px = x0 + left, py = y0 + legendH + 8, pw = W - left - 6, ph = H - legendH - 8 - bottom;
  const max = nice(Math.max(...data.flatMap((d) => d.v), 0.0001));
  const yOf = (v: number) => py + ph - (Math.max(0, v) / max) * ph;
  for (let g = 0; g <= 4; g++) {
    const y = py + ph - (ph * g) / 4;
    out.push({ k: "line", x1: px, y1: y, x2: px + pw, y2: y, color: t.dark ? "334155" : "D9D9D9", width: g ? 0.5 : 1 });
    out.push(label(x0, y - 9, left - 6, 18, fmt((max * g) / 4), 11, { align: "r" }));
  }
  if (series > 1) head.slice(1, series + 1).forEach((h, k) => {
    const lx = px + k * 150;
    out.push({ k: "rect", x: lx, y: y0 + 6, w: 12, h: 12, fill: t.accents[k] });
    out.push({ k: "text", x: lx + 18, y: y0, w: 126, h: 24, text: { s: short(h, 16), size: 13, color: t.text, font, anchor: "ctr" } });
  });
  const slot = pw / data.length;
  data.forEach((d, i) => {
    const cx = px + slot * i;
    out.push(label(cx - 2, py + ph + 4, slot + 4, 22, short(d.label, Math.max(4, Math.floor(slot / 6.5))), slot < 50 ? 10 : 12));
    if (kind === "bar") {
      const bw = Math.min(54, (slot * 0.7) / series);
      d.v.forEach((v, k) => {
        const bx = cx + slot / 2 - (bw * series) / 2 + bw * k;
        const top = yOf(v);
        out.push({ k: "rect", x: bx, y: top, w: bw - 2, h: Math.max(1, py + ph - top), fill: t.accents[k] });
        if (bw >= 22 || series === 1) out.push(label(bx - 12, top - 20, bw + 22, 18, fmt(v), 11, { color: t.text }));
      });
    }
  });
  if (kind === "line") for (let k = 0; k < series; k++) {
    const pts = data.map((d, i): [number, number] => [px + slot * i + slot / 2, yOf(d.v[k])]);
    out.push({ k: "poly", pts, color: t.accents[k], width: 3 });
    pts.forEach(([x, y], i) => {
      out.push({ k: "ellipse", x: x - 4.5, y: y - 4.5, w: 9, h: 9, fill: t.accents[k] });
      if (series === 1 || k === 0) out.push(label(x - 24, y - 24, 48, 18, fmt(data[i].v[k]), 11, { color: t.text }));
    });
  }
  return out;
}

/** A process drawn as numbered boxes joined by arrows, across a wide region and down a tall one. */
export function flowPrims(steps: string[], x0: number, y0: number, W: number, H: number, t: Theme): Prim[] {
  const n = steps.length, out: Prim[] = [];
  const gap0 = Math.min(40, W / (n * 3));
  const horizontal = W >= H * 1.15 && n * 150 + (n - 1) * gap0 <= W;
  const gap = horizontal ? gap0 : Math.min(34, H / (n * 3));
  const bw = horizontal ? (W - gap * (n - 1)) / n : Math.min(W, 420);
  const bh = horizontal ? Math.min(150, H * 0.62) : (H - gap * (n - 1)) / n;
  const y = horizontal ? y0 + (H - bh) / 2 : y0;
  const x = horizontal ? x0 : x0 + (W - bw) / 2;
  steps.forEach((s, i) => {
    const bx = horizontal ? x + i * (bw + gap) : x, by = horizontal ? y : y0 + i * (bh + gap);
    const longest = Math.max(...s.split(/\s+/).map((w) => w.length));
    const size = Math.max(10, Math.min(fitOne(s, bw - 20, Math.min(bh - 16, 90), 22, 12), Math.floor((bw - 20) / (longest * 0.58))));
    out.push({ k: "round", x: bx, y: by, w: bw, h: bh, fill: i % 2 ? t.panel : t.accent, line: t.accent, text: { s, size, bold: true, color: i % 2 ? t.title : "FFFFFF", font: t.bodyFont, align: "ctr", anchor: "ctr" } });
    if (i < n - 1) out.push(horizontal
      ? { k: "line", x1: bx + bw + 4, y1: by + bh / 2, x2: bx + bw + gap - 4, y2: by + bh / 2, color: t.muted, width: 2.5, arrow: true }
      : { k: "line", x1: bx + bw / 2, y1: by + bh + 3, x2: bx + bw / 2, y2: by + bh + gap - 3, color: t.muted, width: 2.5, arrow: true });
  });
  return out;
}

function tablePrims(rows: string[][], x0: number, y0: number, W: number, H: number, t: Theme): Prim[] {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const shown = rows.slice(0, 12).map((r) => Array.from({ length: cols }, (_, x) => plain(r[x] ?? "")));
  const rowH = Math.min(46, H / shown.length);
  const size = rowH >= 38 && cols <= 4 ? 16 : cols > 5 || shown.length > 8 ? 12 : 14;
  return [{ k: "table", x: x0, y: y0, w: W, h: rowH * shown.length, rows: shown, size, font: t.bodyFont, head: t.accent, stripe: t.panel, bg: t.bg, text: t.text, line: t.dark ? "334155" : "D9D9D9", rowH }];
}

/** Big figures in cards: the value large in the accent colour, its label under it. */
export function statsPrims(stats: { value: string; label: string }[], x0: number, y0: number, W: number, H: number, t: Theme): Prim[] {
  const n = stats.length, gap = 18, cw = (W - gap * (n - 1)) / n, out: Prim[] = [];
  stats.forEach((st, i) => {
    const x = x0 + i * (cw + gap);
    out.push({ k: "round", x, y: y0, w: cw, h: H, fill: t.panel, line: t.accents[i % t.accents.length] });
    const longest = Math.max(1, st.value.length);
    const vsize = Math.max(18, Math.min(H > 150 ? 54 : 40, Math.floor((cw - 20) / (longest * 0.6))));
    out.push({ k: "text", x: x + 8, y: y0 + H * 0.1, w: cw - 16, h: H * 0.5, text: { s: st.value, size: vsize, bold: true, color: t.accents[i % t.accents.length], font: t.titleFont, align: "ctr", anchor: "ctr" } });
    if (st.label) out.push({ k: "text", x: x + 10, y: y0 + H * 0.62, w: cw - 20, h: H * 0.34, text: { s: st.label, size: H > 150 ? 18 : 14, color: t.text, font: t.bodyFont, align: "ctr", anchor: "t" } });
  });
  return out;
}

/** Two or three columns, each a coloured heading over a panel of short lines. */
export function columnsPrims(cols: { head: string; lines: string[] }[], x0: number, y0: number, W: number, H: number, t: Theme): { prims: Prim[]; fits: boolean } {
  const n = cols.length, gap = 20, cw = (W - gap * (n - 1)) / n, out: Prim[] = [], hh = 46;
  let fits = true;
  const need = Math.max(...cols.map((c) => c.lines.reduce((n, l) => n + wrapLines(`• ${l}`, 20, cw - 28) * 24 + 10, hh + 28)));
  const PH = Math.min(H, Math.max(220, need));
  cols.forEach((c, i) => {
    const x = x0 + i * (cw + gap), color = t.accents[i % t.accents.length];
    out.push({ k: "rect", x, y: y0, w: cw, h: PH, fill: t.panel });
    out.push({ k: "rect", x, y: y0, w: cw, h: hh, fill: color, text: { s: c.head, size: fitOne(c.head, cw - 20, hh - 8, 20, 14), bold: true, color: "FFFFFF", font: t.bodyFont, align: "ctr", anchor: "ctr" } });
    let size = 20, ys: number[] = [];
    for (; size >= 14; size -= 2) { let y = y0 + hh + 14; ys = c.lines.map((l) => { const at = y; y += wrapLines(`• ${l}`, size, cw - 28) * size * 1.2 + 10; return at; }); if (y <= y0 + PH - 6) break; }
    let end = y0 + hh + 14;
    c.lines.forEach((l, k) => { const h = wrapLines(`• ${l}`, size, cw - 28) * size * 1.2 + 6; out.push({ k: "text", x: x + 14, y: ys[k], w: cw - 28, h, text: { s: `• ${l}`, size, color: t.text, font: t.bodyFont, anchor: "t" } }); end = ys[k] + h; });
    if (end > y0 + PH + 2) fits = false;
  });
  return { prims: out, fits };
}

export interface LayoutOptions { index: number; count: number; pics: Pics }

export function layoutSlide(s: Slide, theme: Theme, o: LayoutOptions): Laid {
  const t = styledTheme(theme, s.style);
  const W = SLIDE_PT.w, H = SLIDE_PT.h, M = 52;
  const overflow: string[] = [];
  const below: Prim[] = [], above: Prim[] = [];
  const pic = s.image ? o.pics[s.image.file] : undefined;
  const fig = figurePic(s, o.pics);
  const cols = s.columns?.length ? s.columns : null;
  const hasVisual = !cols && !!(s.table || s.flow || (s.image && pic) || fig);
  const bullets = cols ? [] : s.lines;
  const cover = o.index === 0 && !hasVisual && !s.stats && !s.blocks && !cols && bullets.every((l) => !l.bullet) && bullets.length <= 3;
  const hero = !!pic && !s.stats && !s.blocks && !cols && !s.table && !s.flow && bullets.length <= 2 && bullets.every((l) => !l.bullet);
  const out: Laid = { bg: t.bg, below, above, notes: s.notes, overflow };

  if (hero && pic) {
    below.push({ k: "image", x: 0, y: 0, w: W, h: H, file: s.image!.file, alt: s.image!.caption || s.title });
    below.push({ k: "rect", x: 0, y: 0, w: W, h: H, fill: "000000", alpha: 0.5 });
    const tsize = fitOne(s.title, W - 2 * 90, 150, 48, 28);
    out.title = { x: 90, y: 150, w: W - 180, h: 160, spec: { s: s.title, size: tsize, bold: true, color: "FFFFFF", align: "ctr", anchor: "b", font: t.titleFont } };
    if (bullets.length) out.body = { x: 120, y: 330, w: W - 240, h: 110, paras: fitParas(bullets.map((l) => ({ ...l, bullet: false })), W - 240, 110, 24, 16).paras, color: "F1F5F9", font: t.bodyFont, align: "ctr" };
    credit(above, pic, 14, H - 26, W - 28, "FFFFFF");
    return out;
  }
  if (cover) {
    if (t.deco !== "none") below.push({ k: "rect", x: 0, y: H - 18, w: W, h: 18, fill: t.accent });
    below.push({ k: "rect", x: W / 2 - 40, y: 318, w: 80, h: 5, fill: t.accent });
    out.title = { x: 90, y: 120, w: W - 180, h: 180, spec: { s: s.title, size: fitOne(s.title, W - 180, 170, 54, 30), bold: true, color: t.title, align: "ctr", anchor: "b", font: t.titleFont } };
    if (bullets.length) out.body = { x: 120, y: 345, w: W - 240, h: 120, paras: fitParas(bullets.map((l) => ({ ...l, bullet: false })), W - 240, 120, 26, 16).paras, color: t.muted, font: t.bodyFont, align: "ctr" };
    return out;
  }

  // decoration and title
  let titleColor = t.title;
  if (t.deco === "bar") below.push({ k: "rect", x: 0, y: 0, w: 16, h: H, fill: t.accent });
  if (t.deco === "top") below.push({ k: "rect", x: 0, y: 0, w: W, h: 10, fill: t.accent });
  if (t.deco === "band") { below.push({ k: "rect", x: 0, y: 0, w: W, h: 108, fill: t.accent }); titleColor = "FFFFFF"; }
  const tx = t.deco === "bar" ? M + 8 : M;
  const tsize = fitOne(s.title, W - tx - M, 72, 34, 22);
  out.title = { x: tx, y: t.deco === "band" ? 12 : 26, w: W - tx - M, h: t.deco === "band" ? 84 : 76, spec: { s: s.title, size: tsize, bold: true, color: titleColor, anchor: "ctr", font: t.titleFont } };
  if (t.deco !== "band") above.push({ k: "rect", x: tx, y: 106, w: 54, h: 4, fill: t.accent });
  above.push({ k: "text", x: W - M - 60, y: H - 30, w: 60, h: 20, text: { s: `${o.index + 1} / ${o.count}`, size: 11, color: t.muted, font: t.bodyFont, align: "r", anchor: "ctr" } });

  const top = 128, bottom = H - 44;
  const left = tx, right = W - M;
  const area = { x: left, y: top, w: right - left, h: bottom - top };
  if (s.blocks?.length) {
    const alone = !bullets.length && !hasVisual && !cols && !s.stats;
    const size = alone ? 30 : 22, bw = area.w - 20, gap = 16;
    const hs = s.blocks.map((b) => Math.ceil(wrapLines(b.text, size, bw - 40) * size * 1.25) + (b.by ? 26 : 0) + 28);
    const total = hs.reduce((a, b) => a + b, 0) + gap * (hs.length - 1);
    let y = alone ? area.y + Math.max(0, (area.h - total) / 2) : area.y;
    s.blocks.forEach((b, i) => {
      above.push({ k: "rect", x: area.x, y, w: area.w, h: hs[i], fill: t.panel });
      above.push({ k: "rect", x: area.x, y, w: 8, h: hs[i], fill: t.accents[i % t.accents.length] });
      above.push({ k: "text", x: area.x + 28, y: y + 10, w: bw - 28, h: hs[i] - (b.by ? 36 : 20), text: { s: b.kind === "quote" ? `“${b.text}”` : b.text, size, bold: b.kind === "callout", italic: b.kind === "quote", color: t.text, font: b.kind === "quote" ? t.titleFont : t.bodyFont, anchor: "ctr" } });
      if (b.by) above.push({ k: "text", x: area.x + 28, y: y + hs[i] - 30, w: bw - 28, h: 22, text: { s: `— ${b.by}`, size: 14, color: t.muted, font: t.bodyFont, anchor: "ctr" } });
      y += hs[i] + gap;
    });
    if (total > area.h) overflow.push("The text blocks are too long for the slide.");
    if (alone) area.h = 0; else { area.y += total + 18; area.h -= total + 18; }
  }
  if (s.stats?.length) {
    const alone = !bullets.length && !hasVisual && !cols;
    const sh = alone ? Math.min(230, area.h * 0.6) : 118, sy = alone ? area.y + (area.h - sh) / 2 : area.y;
    above.push(...statsPrims(s.stats, area.x, sy, area.w, sh, t));
    if (!alone) { area.y += sh + 20; area.h -= sh + 20; } else { area.h = 0; }
  }
  if (cols && area.h > 0) {
    const r = columnsPrims(cols, area.x, area.y, area.w, area.h, t);
    above.push(...r.prims);
    if (!r.fits) overflow.push("The text of the columns is too long for the slide.");
  }
  const textW = hasVisual && bullets.length ? Math.round(area.w * 0.45) : area.w;
  if (bullets.length) {
    const h = hasVisual && !bullets.length ? 0 : area.h;
    const big = s.style?.size === "large" ? 36 : s.style?.size === "small" ? 20 : 0;
    // a few short lines are set large and centred in the space, never as a small block at the top of an empty page
    const few = bullets.length <= 3 && !s.style?.size;
    const max = big ? (hasVisual ? big - 4 : big) : hasVisual ? (few ? 28 : 24) : few ? 40 : 30;
    const fit = fitParas(bullets, textW - 6, h, max, s.style?.size === "small" ? 12 : 14);
    if (!fit.fits) overflow.push(`The text is too long for the slide (${bullets.length} lines).`);
    const used = Math.min(h, fit.paras.reduce((n, p) => n + paraHeight(p, textW - 6), 0) + 8);
    out.body = { x: area.x, y: area.y + (few ? Math.max(0, (h - used) / 2) : 0), w: textW, h: few ? used : h, paras: fit.paras, color: t.text, font: t.bodyFont, align: "l" };
  }
  if (hasVisual) {
    const vx = bullets.length ? area.x + textW + 28 : area.x, vw = bullets.length ? area.w - textW - 28 : area.w;
    if (s.image && pic) {
      const cap = Math.max(0, pic.credit ? 22 : 0);
      above.push({ k: "image", x: vx, y: area.y, w: vw, h: area.h - cap - 4, file: s.image.file, alt: s.image.caption || s.title });
      if (pic.credit) credit(above, pic, vx, area.y + area.h - cap, vw, t.muted, s.image.caption);
    } else if (s.figure && fig) {
      // a diagram is never cut: it is shown whole, as large as the region allows, centred
      const ar = fig.w > 0 && fig.h > 0 ? fig.w / fig.h : vw / area.h;
      const w = Math.min(vw, area.h * ar), h = w / ar;
      above.push({ k: "image", x: vx + (vw - w) / 2, y: area.y + (area.h - h) / 2, w, h, file: figureKey(s.figure.lang, s.figure.raw), alt: s.title, contain: true });
    } else if (s.flow) above.push(...flowPrims(s.flow, vx, area.y, vw, area.h, t));
    else if (s.table && s.chart) above.push(...chartPrims(s.chart, s.table, vx, area.y, vw, area.h, t));
    else if (s.table) above.push(...tablePrims(s.table, vx, area.y, vw, area.h, t));
  }
  return out;
}
function credit(into: Prim[], pic: Pic, x: number, y: number, w: number, color: string, caption?: string) {
  into.push({ k: "text", x, y, w, h: 20, text: { s: short([caption, pic.credit].filter(Boolean).join(" · "), Math.floor(w / 5.2)), size: 10, color, font: "Calibri", italic: true, anchor: "ctr" } });
}

// ---------------------------------------------------------------- problems a layout can see

/** What is wrong with a slide before it is drawn (limits of the plan, text that cannot fit). */
export const LIMITS = { titleWords: 9, titleChars: 70, bullets: 6, bulletWords: 14, notesWords: 60 };
export function slideProblems(s: Slide, laid?: Laid): string[] {
  const out: string[] = [];
  const words = (x: string) => plain(x).trim().split(/\s+/).filter(Boolean).length;
  if (!s.title) out.push("The slide has no title (a line starting with #).");
  else if (words(s.title) > LIMITS.titleWords || s.title.length > LIMITS.titleChars) out.push(`The title is too long (${words(s.title)} words): at most ${LIMITS.titleWords} words.`);
  const b = s.lines.filter((l) => l.bullet || s.lines.length > 1);
  if (s.lines.length > LIMITS.bullets) out.push(`Too many lines (${s.lines.length}): at most ${LIMITS.bullets}.`);
  const long = b.filter((l) => words(l.text) > LIMITS.bulletWords);
  if (long.length) out.push(`${long.length} line(s) are too long: at most ${LIMITS.bulletWords} words each, for example "${short(plain(long[0].text), 50)}".`);
  if (s.blocks?.some((b) => words(b.text) > 30)) out.push("A text block is too long: at most 30 words.");
  if (s.stats?.some((x) => x.value.length > 10 || words(x.label) > 6)) out.push("A figure is too long: a value of 10 characters at most (\"$27.6bn\") and a label of 6 words at most.");
  if (s.columns?.some((c) => c.lines.length > 3 || c.lines.some((l) => words(l) > 10) || words(c.head) > 4)) out.push("A column is too long: a heading of 4 words at most, 3 lines of 10 words at most.");
  if (words(s.notes) > LIMITS.notesWords) out.push(`The notes are too long: at most ${LIMITS.notesWords} words.`);
  if (laid) out.push(...laid.overflow);
  return out;
}

/** The last resort when a model could not keep to the limits: cut the slide down so it fits. */
const DANGLING = /^(?:a|an|the|of|in|on|at|to|for|from|with|by|and|or|but|as|than|that|which|who|its|their|his|her|is|are|was|were|de|du|des|la|le|les|un|une|et|ou|en|au|aux|pour|par|avec|sur|dans)$/i;
/** A phrase cut to at most `n` words at a place where a thought ends (a comma, a semicolon, a linking word), never in the middle of one and never with "…". */
export function clipPhrase(x: string, n: number): string {
  const text = x.trim().replace(/\s+/g, " ");
  const w = text.split(" ");
  if (w.length <= n) return text;
  const head = w.slice(0, n);
  // the last clause boundary inside the limit, when it keeps at least half of it
  for (let i = head.length - 1; i >= Math.floor(n / 2); i--) {
    if (/[,;:]$/.test(head[i]) || (i + 1 < w.length && /^(?:while|which|but|and|as|because|so|with|after|when|where|mais|et|car|donc|alors|lorsque|quand)$/i.test(w[i + 1]))) return head.slice(0, i + 1).join(" ").replace(/[,;:]$/, "");
  }
  while (head.length > 1 && DANGLING.test(head[head.length - 1].replace(/[^\p{L}]/gu, ""))) head.pop();
  return head.join(" ").replace(/[,;:]$/, "");
}

/** A slide brought within the limits by shortening phrases at a natural place. */
export function trimSlide(s: Slide): Slide {
  const cut = clipPhrase;
  return { ...s, title: cut(s.title, LIMITS.titleWords), lines: s.lines.slice(0, LIMITS.bullets).map((l) => ({ ...l, text: cut(l.text, LIMITS.bulletWords) })), notes: cut(s.notes, LIMITS.notesWords),
    blocks: s.blocks?.map((b) => ({ ...b, text: cut(b.text, 30) })),
    stats: s.stats?.map((x) => ({ value: x.value.slice(0, 10), label: cut(x.label, 6) })),
    columns: s.columns?.map((c) => ({ head: cut(c.head, 4), lines: c.lines.slice(0, 3).map((l) => cut(l, 10)) })) };
}

// ---------------------------------------------------------------- HTML preview

const css = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
const cqw = (pt: number) => `${(pt / 9.6).toFixed(3)}cqw`;
const FONT = (f: string) => `'${f}',Calibri,'Segoe UI',Arial,sans-serif`;
function textStyle(t: TextSpec) {
  return `font:${t.italic ? "italic " : ""}${t.bold ? "700 " : "400 "}${cqw(t.size)}/1.2 ${FONT(t.font)};color:#${t.color};text-align:${t.align === "ctr" ? "center" : t.align === "r" ? "right" : "left"};justify-content:${t.anchor === "ctr" ? "center" : t.anchor === "b" ? "flex-end" : "flex-start"}`;
}
const box = (x: number, y: number, w: number, h: number) => `left:${css(x, SLIDE_PT.w)};top:${css(y, SLIDE_PT.h)};width:${css(w, SLIDE_PT.w)};height:${css(h, SLIDE_PT.h)}`;
const runsHtml = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/g, "<i>$1</i>").replace(/`([^`]+)`/g, "$1");

function svgOf(prims: Prim[]): string {
  const parts: string[] = [];
  for (const p of prims) {
    if (p.k === "rect" || p.k === "round") parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"${p.k === "round" ? ' rx="14"' : ""} fill="${p.fill ? `#${p.fill}` : "none"}"${p.alpha !== undefined ? ` fill-opacity="${p.alpha}"` : ""}${p.line ? ` stroke="#${p.line}" stroke-width="1"` : ""}/>`);
    else if (p.k === "ellipse") parts.push(`<ellipse cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" rx="${p.w / 2}" ry="${p.h / 2}" fill="${p.fill ? `#${p.fill}` : "none"}"/>`);
    else if (p.k === "pie") {
      const r = p.w / 2, cx = p.x + r, cy = p.y + r, a = ((p.from - 90) * Math.PI) / 180, b = ((p.to - 90) * Math.PI) / 180;
      parts.push(`<path d="M${cx} ${cy} L${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)} A${r} ${r} 0 ${p.to - p.from > 180 ? 1 : 0} 1 ${cx + r * Math.cos(b)} ${cy + r * Math.sin(b)} Z" fill="#${p.fill}" stroke="#fff" stroke-width="1"/>`);
    } else if (p.k === "line") {
      parts.push(`<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="#${p.color}" stroke-width="${p.width}"/>`);
      if (p.arrow) { const a = Math.atan2(p.y2 - p.y1, p.x2 - p.x1), s = 9; parts.push(`<polygon points="${p.x2},${p.y2} ${p.x2 - s * Math.cos(a - 0.45)},${p.y2 - s * Math.sin(a - 0.45)} ${p.x2 - s * Math.cos(a + 0.45)},${p.y2 - s * Math.sin(a + 0.45)}" fill="#${p.color}"/>`); }
    } else if (p.k === "poly") parts.push(`<polyline points="${p.pts.map((q) => q.join(",")).join(" ")}" fill="none" stroke="#${p.color}" stroke-width="${p.width}" stroke-linejoin="round"/>`);
  }
  return `<svg viewBox="0 0 ${SLIDE_PT.w} ${SLIDE_PT.h}" preserveAspectRatio="none">${parts.join("")}</svg>`;
}
function htmlPrims(prims: Prim[], pics: Pics): string {
  const shapes = prims.filter((p) => p.k !== "text" && p.k !== "image");
  let out = "";
  // images and shapes in their order: an image under a shade, a shape over a picture
  let batch: Prim[] = [];
  const flush = () => { if (batch.length) { out += svgOf(batch); batch = []; } };
  for (const p of prims) {
    if (p.k === "image") {
      flush();
      const pic = pics[p.file];
      if (pic?.dataUrl) out += `<img alt="${esc(p.alt)}" src="${pic.dataUrl}" style="${box(p.x, p.y, p.w, p.h)};object-fit:${p.contain ? "contain" : "cover"};${p.w < SLIDE_PT.w && !p.contain ? "border-radius:1.2cqw" : ""}">`;
    } else if (p.k === "table") {
      flush();
      const cols = Math.max(1, ...p.rows.map((r) => r.length));
      out += `<table class="grid" style="${box(p.x, p.y, p.w, 0)};height:${css(p.rowH * p.rows.length, SLIDE_PT.h)};font:${cqw(p.size)}/1.2 ${FONT(p.font)};color:#${p.text}">${p.rows.map((r, y) => `<tr style="height:${css(p.rowH, p.rowH * p.rows.length)};background:#${y === 0 ? p.head : y % 2 ? p.stripe : p.bg};${y === 0 ? "color:#fff;font-weight:700" : ""}">${Array.from({ length: cols }, (_, x) => `<td style="border:1px solid #${p.line};padding:0 ${cqw(8)};${/^-?[\d.,%]+$/.test(r[x] ?? "") && y ? "text-align:right" : ""}">${runsHtml(r[x] ?? "")}</td>`).join("")}</tr>`).join("")}</table>`;
    } else if (p.k === "text") { flush(); out += `<div class="t" style="${box(p.x, p.y, p.w, p.h)};${textStyle(p.text)}">${runsHtml(p.text.s)}</div>`; }
    else {
      batch.push(p);
      if ((p.k === "rect" || p.k === "round") && p.text) { flush(); out += `<div class="t" style="${box(p.x, p.y, p.w, p.h)};${textStyle(p.text)};padding:0 0.6cqw">${runsHtml(p.text.s)}</div>`; }
    }
  }
  flush();
  return shapes.length || prims.length ? out : "";
}

export function slideHtml(laid: Laid, pics: Pics, index: number): string {
  const parts: string[] = [htmlPrims(laid.below, pics)];
  if (laid.title) parts.push(`<div class="t title" data-s="${index}" style="${box(laid.title.x, laid.title.y, laid.title.w, laid.title.h)};${textStyle(laid.title.spec)}">${runsHtml(laid.title.spec.s)}</div>`);
  if (laid.body) {
    const b = laid.body;
    const paras = b.paras.map((p) => `<p style="font-size:${cqw(p.size)};margin:0 0 ${cqw(p.size * 0.45)};${p.bullet ? `padding-left:${cqw(p.size * 1.1 * (p.level + 1))};text-indent:${cqw(-p.size * 1.1)}` : ""}">${p.bullet ? `<span style="display:inline-block;width:${cqw(p.size * 1.1)};text-indent:0;color:inherit">${p.level ? "–" : "•"}</span>` : ""}${runsHtml(p.text)}</p>`).join("");
    parts.push(`<div class="t body" data-s="${index}" style="${box(b.x, b.y, b.w, b.h)};font-family:${FONT(b.font)};color:#${b.color};line-height:1.2;text-align:${b.align === "ctr" ? "center" : "left"}">${paras}</div>`);
  }
  parts.push(htmlPrims(laid.above, pics));
  return `<section class="slide" data-i="${index}" style="background:#${laid.bg}">${parts.join("")}</section>${laid.notes ? `<div class="notes">Notes: ${esc(laid.notes)}</div>` : ""}`;
}

const DECK_CSS = "html,body{margin:0}body{font:14px system-ui,sans-serif;background:#d9d9d9;padding:18px}.slide{container-type:inline-size;position:relative;aspect-ratio:16/9;max-width:960px;margin:0 auto 18px;overflow:hidden;box-shadow:0 2px 10px #0004}.slide>svg{position:absolute;inset:0;width:100%;height:100%}.slide>img{position:absolute}.t{position:absolute;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;word-break:break-word}.t.body{display:block}table.grid{position:absolute;border-collapse:collapse;table-layout:fixed}table.grid td{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.notes{max-width:960px;margin:-8px auto 18px;font-size:12px;color:#444;white-space:pre-wrap}";
export function deckHtml(src: string, pics: Pics = {}, only?: number): string {
  const slides = slidesOf(src), t = themeOf(src);
  const body = slides.map((s, i) => (only === undefined || only === i) ? slideHtml(layoutSlide(s, t, { index: i, count: slides.length, pics }), pics, i) : "").join("") || "<p>No slide yet.</p>";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${DECK_CSS}</style></head><body>${body}</body></html>`;
}

/** Everything the layout and the picture lookup need from a slide text, for the pipeline. */
export function layoutAll(src: string, pics: Pics = {}): { slides: Slide[]; laid: Laid[]; theme: Theme } {
  const slides = slidesOf(src), theme = themeOf(src);
  return { slides, theme, laid: slides.map((s, i) => layoutSlide(s, theme, { index: i, count: slides.length, pics })) };
}
export const figuresOfDeck = (src: string) => slidesOf(src).flatMap((s) => (s.figure ? [s.figure] : []));
export const wikiFilesIn = (src: string): string[] => [...new Set(slidesOf(src).flatMap((s) => (s.image ? [s.image.file] : [])))];

// ---------------------------------------------------------------- PPTX

const emu = (pt: number) => Math.round(pt * EMU);
const xfrm = (x: number, y: number, w: number, h: number, extra = "") => `<a:xfrm${extra}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>`;
const fillXml = (c?: string, alpha?: number) => (c ? `<a:solidFill><a:srgbClr val="${c}">${alpha !== undefined ? `<a:alpha val="${Math.round(alpha * 100000)}"/>` : ""}</a:srgbClr></a:solidFill>` : "<a:noFill/>");
const lnXml = (c?: string, w = 0.75) => (c ? `<a:ln w="${emu(w)}"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>");

function runsXml(text: string, size: number, color: string, font: string, bold = false, italic = false): string {
  const parts: { t: string; b?: boolean; i?: boolean }[] = [];
  const re = /\*\*(.+?)\*\*|(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])|`([^`]+)`/g;
  let at = 0;
  for (let m; (m = re.exec(text)); ) { if (m.index > at) parts.push({ t: text.slice(at, m.index) }); parts.push(m[1] !== undefined ? { t: m[1], b: true } : m[2] !== undefined ? { t: m[2], i: true } : { t: m[3] }); at = re.lastIndex; }
  if (at < text.length) parts.push({ t: text.slice(at) });
  return parts.filter((p) => p.t).map((p) => `<a:r><a:rPr lang="en-US" sz="${Math.round(size * 100)}"${bold || p.b ? ' b="1"' : ""}${italic || p.i ? ' i="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${esc(font)}"/></a:rPr><a:t>${escText(p.t)}</a:t></a:r>`).join("") || `<a:endParaRPr lang="en-US" sz="${Math.round(size * 100)}"/>`;
}
const bodyPr = (t: TextSpec | undefined, autofit = false) => `<a:bodyPr wrap="square" lIns="${t ? 45720 : 91440}" rIns="${t ? 45720 : 91440}" tIns="45720" bIns="45720" anchor="${t?.anchor ?? "t"}">${autofit ? "<a:normAutofit/>" : ""}</a:bodyPr>`;

export interface Media { rel: string; target: string }

function primXml(p: Prim, id: () => number, media: (file: string) => string | null): string {
  const nv = (name: string, tx = false) => `<p:cNvPr id="${id()}" name="${name}"/><p:cNvSpPr${tx ? ' txBox="1"' : ""}/><p:nvPr/>`;
  const textBody = (t: TextSpec) => `<p:txBody>${bodyPr(t)}<a:lstStyle/><a:p><a:pPr algn="${t.align ?? "l"}"/>${runsXml(t.s, t.size, t.color, t.font, t.bold, t.italic)}</a:p></p:txBody>`;
  switch (p.k) {
    case "text": return `<p:sp><p:nvSpPr>${nv("npu-label", true)}</p:nvSpPr><p:spPr>${xfrm(p.x, p.y, p.w, p.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>${textBody(p.text)}</p:sp>`;
    case "rect": case "round": case "ellipse": {
      const geom = p.k === "rect" ? "rect" : p.k === "round" ? "roundRect" : "ellipse";
      return `<p:sp><p:nvSpPr>${nv(p.text ? "Box" : "Shape", !!p.text)}</p:nvSpPr><p:spPr>${xfrm(p.x, p.y, p.w, p.h)}<a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>${fillXml(p.fill, p.alpha)}${lnXml(p.line)}</p:spPr>${p.text ? textBody(p.text) : ""}</p:sp>`;
    }
    case "pie": {
      const a1 = Math.round(((p.from - 90 + 360) % 360) * 60000), a2 = Math.round(((p.to - 90 + 360) % 360) * 60000);
      return `<p:sp><p:nvSpPr>${nv("Slice")}</p:nvSpPr><p:spPr>${xfrm(p.x, p.y, p.w, p.h)}<a:prstGeom prst="pie"><a:avLst><a:gd name="adj1" fmla="val ${a1}"/><a:gd name="adj2" fmla="val ${a2}"/></a:avLst></a:prstGeom>${fillXml(p.fill)}<a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></p:spPr></p:sp>`;
    }
    case "line": {
      const fx = p.x2 < p.x1, fy = p.y2 < p.y1;
      return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id()}" name="Line"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(Math.min(p.x1, p.x2), Math.min(p.y1, p.y2), Math.abs(p.x2 - p.x1), Math.abs(p.y2 - p.y1), `${fx ? ' flipH="1"' : ""}${fy ? ' flipV="1"' : ""}`)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${emu(p.width)}"><a:solidFill><a:srgbClr val="${p.color}"/></a:solidFill>${p.arrow ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ""}</a:ln></p:spPr></p:cxnSp>`;
    }
    case "poly": {
      const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
      const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(1, Math.max(...xs) - x), h = Math.max(1, Math.max(...ys) - y);
      const pt = (q: [number, number]) => `<a:pt x="${emu(q[0] - x)}" y="${emu(q[1] - y)}"/>`;
      return `<p:sp><p:nvSpPr>${nv("Line series")}</p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${emu(w)}" h="${emu(h)}" fill="none"><a:moveTo>${pt(p.pts[0])}</a:moveTo>${p.pts.slice(1).map((q) => `<a:lnTo>${pt(q)}</a:lnTo>`).join("")}</a:path></a:pathLst></a:custGeom><a:noFill/><a:ln w="${emu(p.width)}" cap="rnd"><a:solidFill><a:srgbClr val="${p.color}"/></a:solidFill><a:round/></a:ln></p:spPr></p:sp>`;
    }
    case "table": {
      const cols = Math.max(1, ...p.rows.map((r) => r.length)), cw = p.w / cols;
      const ln = (tag: string) => `<a:${tag} w="6350"><a:solidFill><a:srgbClr val="${p.line}"/></a:solidFill></a:${tag}>`;
      const cell = (txt: string, head: boolean, y: number) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>${/^-?[\d.,%]+$/.test(txt) && !head ? '<a:pPr algn="r"/>' : ""}${runsXml(txt || " ", p.size, head ? "FFFFFF" : p.text, p.font, head)}</a:p></a:txBody><a:tcPr anchor="ctr">${ln("lnL")}${ln("lnR")}${ln("lnT")}${ln("lnB")}${fillXml(head ? p.head : y % 2 ? p.stripe : p.bg)}</a:tcPr></a:tc>`;
      return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id()}" name="Table"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(p.x)}" y="${emu(p.y)}"/><a:ext cx="${emu(cw) * cols}" cy="${emu(p.rowH) * p.rows.length}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${Array(cols).fill(`<a:gridCol w="${emu(cw)}"/>`).join("")}</a:tblGrid>${p.rows.map((r, y) => `<a:tr h="${emu(p.rowH)}">${Array.from({ length: cols }, (_, x) => cell(r[x] ?? "", y === 0, y)).join("")}</a:tr>`).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    }
    case "image": {
      const rid = media(p.file);
      return rid ? `<p:pic><p:nvPicPr><p:cNvPr id="${id()}" name="Picture" descr="${esc(p.alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/>@@CROP:${p.file}:${p.w}:${p.h}@@<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(p.x, p.y, p.w, p.h)}<a:prstGeom prst="${p.w < SLIDE_PT.w && !p.contain ? "roundRect" : "rect"}"><a:avLst>${p.w < SLIDE_PT.w && !p.contain ? '<a:gd name="adj" fmla="val 3500"/>' : ""}</a:avLst></a:prstGeom></p:spPr></p:pic>` : "";
    }
  }
}

/** The part of a picture that stays when it is cut to fill a box (a:srcRect, in thousandths of a percent). */
function cropXml(pic: Pic, w: number, h: number): string {
  const ar = w / h, par = pic.w / pic.h;
  if (!(par > 0) || Math.abs(ar - par) < 0.01) return "";
  if (par > ar) { const keep = ar / par, side = Math.round(((1 - keep) / 2) * 100000); return `<a:srcRect l="${side}" r="${side}"/>`; }
  const keep = par / ar, side = Math.round(((1 - keep) / 2) * 100000);
  return `<a:srcRect t="${side}" b="${side}"/>`;
}

function slidePptx(laid: Laid, index: number, pics: Pics, addMedia: (file: string) => string | null): string {
  let n = 1;
  const id = () => ++n;
  const prim = (p: Prim) => primXml(p, id, addMedia).replace(/@@CROP:(.+?):([\d.]+):([\d.]+)@@/g, (_, f, w, h) => (pics[f] ? cropXml(pics[f], Number(w), Number(h)) : ""));
  const parts: string[] = laid.below.map(prim);
  if (laid.title) {
    const t = laid.title;
    parts.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id()}" name="Title ${index + 1}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(t.x, t.y, t.w, t.h)}</p:spPr><p:txBody>${bodyPr(t.spec, true)}<a:lstStyle/><a:p><a:pPr algn="${t.spec.align ?? "l"}"/>${runsXml(t.spec.s, t.spec.size, t.spec.color, t.spec.font, t.spec.bold)}</a:p></p:txBody></p:sp>`);
  }
  if (laid.body) {
    const b = laid.body;
    const paras = b.paras.map((p) => {
      const ind = Math.round(p.size * 1.1 * EMU);
      const pPr = p.bullet
        ? `<a:pPr marL="${ind * (p.level + 1)}" indent="-${ind}" lvl="${p.level}" algn="l"><a:spcBef><a:spcPts val="${Math.round(p.size * 45)}"/></a:spcBef><a:buClr><a:srgbClr val="${b.color}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="${p.level ? "–" : "•"}"/></a:pPr>`
        : `<a:pPr marL="0" indent="0" algn="${b.align === "ctr" ? "ctr" : "l"}"><a:spcBef><a:spcPts val="${Math.round(p.size * 45)}"/></a:spcBef><a:buNone/></a:pPr>`;
      return `<a:p>${pPr}${runsXml(p.text, p.size, b.color, b.font)}</a:p>`;
    }).join("");
    parts.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id()}" name="Content ${index + 1}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(b.x, b.y, b.w, b.h)}</p:spPr><p:txBody>${bodyPr(undefined, true)}<a:lstStyle/>${paras}</p:txBody></p:sp>`);
  }
  parts.push(...laid.above.map(prim));
  return `${P.XML_HEAD}<p:sld ${P.NS_A}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${laid.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${parts.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const notesXml = (text: string) => `${P.XML_HEAD}<p:notes ${P.NS_A}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${text.split("\n").map((l) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escText(l)}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;

const EMBEDDABLE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" };

export async function buildPptx(src: string, pics: Pics = {}): Promise<Uint8Array> {
  const { slides, laid, theme } = layoutAll(src, pics);
  const list = laid.length ? laid : [layoutSlide({ title: "", lines: [], table: null, notes: "" }, theme, { index: 0, count: 1, pics })];
  const withNotes = list.some((l) => l.notes);
  const CT = "application/vnd.openxmlformats-officedocument.presentationml";
  const media: ZipFiles = {};
  const mediaOf = new Map<string, string>(); // picture file -> media path
  const exts = new Set<string>();
  const files: ZipFiles = {};
  list.forEach((l, i) => {
    const relsList: { id: string; type: string; target: string }[] = [{ id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" }];
    let next = 2;
    const mine = new Map<string, string>();
    const addMedia = (file: string): string | null => {
      const pic = pics[file];
      const ext = pic && EMBEDDABLE[pic.mime];
      if (!pic?.bytes || !ext) return null;
      if (!mine.has(file)) {
        if (!mediaOf.has(file)) { const path = `ppt/media/image${mediaOf.size + 1}.${ext}`; media[path] = pic.bytes; mediaOf.set(file, path); exts.add(ext); }
        const rid = `rId${next++}`;
        mine.set(file, rid);
        relsList.push({ id: rid, type: "image", target: `../${mediaOf.get(file)!.replace(/^ppt\//, "")}` });
      }
      return mine.get(file)!;
    };
    const xml = slidePptx(l, i, pics, addMedia);
    if (l.notes) relsList.push({ id: `rId${next++}`, type: "notesSlide", target: `../notesSlides/notesSlide${i + 1}.xml` });
    files[`ppt/slides/slide${i + 1}.xml`] = toBytes(xml);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = toBytes(P.rels(relsList));
    if (l.notes) {
      files[`ppt/notesSlides/notesSlide${i + 1}.xml`] = toBytes(notesXml(l.notes));
      files[`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`] = toBytes(P.rels([{ id: "rId1", type: "notesMaster", target: "../notesMasters/notesMaster1.xml" }, { id: "rId2", type: "slide", target: `../slides/slide${i + 1}.xml` }]));
    }
  });
  const imageTypes: [string, string][] = [...exts].map((e) => [e, e === "jpg" ? "image/jpeg" : `image/${e}`]);
  Object.assign(files, media, {
    "[Content_Types].xml": toBytes(P.contentTypes([...P.DEFAULT_TYPES, ...imageTypes], [
      ["/ppt/presentation.xml", `${CT}.presentation.main+xml`],
      ["/ppt/slideMasters/slideMaster1.xml", `${CT}.slideMaster+xml`],
      ["/ppt/slideLayouts/slideLayout1.xml", `${CT}.slideLayout+xml`],
      ["/ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"],
      ...(withNotes ? [["/ppt/notesMasters/notesMaster1.xml", `${CT}.notesMaster+xml`], ["/ppt/theme/theme2.xml", "application/vnd.openxmlformats-officedocument.theme+xml"]] as [string, string][] : []),
      ...list.map((_, i): [string, string] => [`/ppt/slides/slide${i + 1}.xml`, `${CT}.slide+xml`]),
      ...list.flatMap((l, i): [string, string][] => (l.notes ? [[`/ppt/notesSlides/notesSlide${i + 1}.xml`, `${CT}.notesSlide+xml`]] : []))
    ])),
    "_rels/.rels": toBytes(P.rels([{ id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" }])),
    "ppt/presentation.xml": toBytes(`${P.XML_HEAD}<p:presentation ${P.NS_A}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${withNotes ? `<p:notesMasterIdLst><p:notesMasterId r:id="rId${list.length + 3}"/></p:notesMasterIdLst>` : ""}<p:sldIdLst>${list.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${P.SLIDE_W}" cy="${P.SLIDE_H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": toBytes(P.rels([
      { id: "rId1", type: "slideMaster", target: "slideMasters/slideMaster1.xml" },
      { id: "rId2", type: "theme", target: "theme/theme1.xml" },
      ...list.map((_, i) => ({ id: `rId${i + 3}`, type: "slide", target: `slides/slide${i + 1}.xml` })),
      ...(withNotes ? [{ id: `rId${list.length + 3}`, type: "notesMaster", target: "notesMasters/notesMaster1.xml" }] : [])
    ])),
    "ppt/slideMasters/slideMaster1.xml": toBytes(P.SLIDE_MASTER),
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": toBytes(P.rels([{ id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" }, { id: "rId2", type: "theme", target: "../theme/theme1.xml" }])),
    "ppt/slideLayouts/slideLayout1.xml": toBytes(P.SLIDE_LAYOUT),
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": toBytes(P.rels([{ id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }])),
    "ppt/theme/theme1.xml": toBytes(P.themeXml(theme))
  });
  if (withNotes) {
    files["ppt/notesMasters/notesMaster1.xml"] = toBytes(P.NOTES_MASTER);
    files["ppt/notesMasters/_rels/notesMaster1.xml.rels"] = toBytes(P.rels([{ id: "rId1", type: "theme", target: "../theme/theme2.xml" }]));
    files["ppt/theme/theme2.xml"] = toBytes(P.NOTES_THEME);
  }
  void slides;
  return writeZip(files);
}
