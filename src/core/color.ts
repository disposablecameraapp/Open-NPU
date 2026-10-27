/** Colour arithmetic for the looks of slides: contrast, lightness, mixing. Colours are six hex digits without "#". */

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.test(v.trim());
export function hex6(v: string): string {
  const x = v.trim().replace(/^#/, "");
  return (x.length === 3 ? x.split("").map((c) => c + c).join("") : x).toUpperCase();
}
const rgb = (h: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const hexOf = (r: number, g: number, b: number) => [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();

export function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio, 1 to 21. 4.5 is the readable minimum for text, 3 for large text and graphics. */
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const mixColor = (a: string, b: string, k: number): string => { const x = rgb(a), y = rgb(b); return hexOf(x[0] * (1 - k) + y[0] * k, x[1] * (1 - k) + y[1] * k, x[2] * (1 - k) + y[2] * k); };

export function toHsl(h: string): [number, number, number] {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hue * 60 + 360) % 360, s * 100, l * 100];
}
export function fromHsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))));
  return hexOf(f(0), f(8), f(4));
}

/**
 * The colour moved along its lightness, keeping its hue, until it reaches a contrast `min` with the background.
 * It goes the way that is faster (lighter on a dark background, darker on a light one); black or white when no lightness is enough.
 */
export function toward(color: string, bg: string, min: number): string {
  if (contrast(color, bg) >= min) return color;
  const [h, s, l] = toHsl(color);
  const lighter = luminance(bg) < 0.4;
  for (let step = 1; step <= 100; step++) {
    const nl = lighter ? l + step : l - step;
    if (nl < 0 || nl > 100) break;
    const c = fromHsl(h, s, nl);
    if (contrast(c, bg) >= min) return c;
  }
  return contrast("FFFFFF", bg) >= contrast("000000", bg) ? "FFFFFF" : "000000";
}
/** Black or white, whichever reads better on this colour. */
export const inkOn = (bg: string): string => (contrast("FFFFFF", bg) >= contrast("111827", bg) ? "FFFFFF" : "111827");
