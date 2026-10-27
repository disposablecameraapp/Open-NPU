import { ICON_PATHS, ICON_TAGS } from "./icons.generated";

/** Icon names the model can use: a Lucide set curated for websites (ISC license, see icons.generated.ts). */
export const ICON_NAMES = Object.keys(ICON_PATHS);
const norm = (s: string) => s.toLowerCase().trim().replace(/^(?:lucide|icon)[:/ ]/, "").replace(/[_\s]+/g, "-");
/** Text that is not plain ASCII is an emoji (or another symbol): it is shown as it is. */
export const isEmoji = (v: string) => /[^\x00-\x7F]/.test(v);

/** The name of the icon that a word asks for: its exact name, else the best match among names and tags ("secure" finds shield-check). null when nothing is close. */
export function iconFor(value: string): string | null {
  const n = norm(value);
  if (!n || isEmoji(n)) return null;
  if (ICON_PATHS[n]) return n;
  const words = n.split(/[^a-z0-9]+/).filter(Boolean);
  let best: { name: string; score: number } | null = null;
  for (const name of ICON_NAMES) {
    const parts = name.split("-");
    const tags = ICON_TAGS[name] ?? [];
    let score = 0;
    if (tags.includes(n)) score += 6;
    if (name.includes(n)) score += 4;
    for (const w of words) { if (parts.includes(w)) score += 3; else if (tags.includes(w)) score += 2; else if (w.length > 3 && (name.includes(w) || tags.some((t) => t.startsWith(w)))) score += 1; }
    if (score > (best?.score ?? 0)) best = { name, score };
  }
  return best && best.score >= 2 ? best.name : null;
}
/** The inner markup of an icon (a 24 by 24 stroke drawing), for an `<svg viewBox="0 0 24 24">`. */
export const iconMarkup = (name: string): string => ICON_PATHS[name] ?? "";
