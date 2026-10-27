/**
 * A drawing that is still being written, made whole enough to show: cut at its last complete tag, with the tags still open closed.
 * Colours given as `var(--name)` are filled from the palette of the page, because a picture shown on its own has no page around it.
 * Nothing that runs is kept (script, event attributes), so the result can be shown as an image.
 */
const VOID = /^(?:path|rect|circle|ellipse|line|polyline|polygon|stop|use|image|feBlend|feOffset|feFlood)$/i;

export function paletteOf(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g)) out[m[1]] = m[2].trim();
  return out;
}

export function partialSvg(text: string, palette: Record<string, string> = {}): string | null {
  const from = text.search(/<svg\b/i);
  if (from < 0) return null;
  let s = text.slice(from);
  const cut = s.lastIndexOf(">");
  if (cut < 0) return null;
  s = s.slice(0, cut + 1)
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_m, name: string, fallback?: string) => palette[name] ?? fallback?.trim() ?? "#888");
  const stack: string[] = [];
  for (const m of s.matchAll(/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)([^<>]*?)(\/?)>/g)) {
    if (!m[2]) continue;
    const name = m[2];
    if (m[1]) { const at = stack.lastIndexOf(name); if (at >= 0) stack.length = at; continue; }
    if (m[4] || VOID.test(name)) continue;
    stack.push(name);
  }
  s += stack.reverse().map((n) => `</${n}>`).join("");
  if (!/^<svg[^>]*\sxmlns=/i.test(s)) s = s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}

export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
