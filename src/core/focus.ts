/**
 * Working on a part of a file instead of the whole file: a map of what is in it, the pieces around a spot, and the
 * lines a change touched. This is what keeps a small model's context for the job (the spot) and out of everything else.
 */

export interface Spot { name: string; line: number }
export type Range = [number, number];

/** Files at least this long (characters) are shown to the model in pieces. */
export const FOCUS_FROM = 6000;

const DECL = /^\s{0,4}(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+([\w$]+)|class\s+([\w$]+)|def\s+([\w$]+)|(?:pub\s+)?fn\s+([\w$]+)|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\(|function|[\w$]+\s*=>))/;
const CONST = /^(?:const|let|var)\s+([\w$]+)\s*=/;
const TAG = /^\s*<(script|style|body)\b|^\s*<(?:canvas|section|header|main|footer|nav|div)\b[^>]*\bid=["']([\w-]+)["']/i;
const HEADING = /^\s*(?:\/\/|#|\/\*)\s*[-=─]{2,}\s*(.+?)\s*(?:[-=─]{2,}\s*)?(?:\*\/)?$/;

/** What is where, by line (1-based): functions, classes, top-level constants, script/style/id'd elements, section headings. */
export function outline(content: string): Spot[] {
  const out: Spot[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.length > 400) continue; // minified line: not a landmark
    let name: string | undefined;
    const d = DECL.exec(l);
    if (d) name = d.slice(1).find(Boolean);
    else if ((d === null) && CONST.test(l)) name = CONST.exec(l)![1];
    else {
      const t = TAG.exec(l);
      if (t) name = t[2] ? `#${t[2]}` : `<${t[1].toLowerCase()}>`;
      else { const h = HEADING.exec(l); if (h && h[1].length < 60) name = h[1]; }
    }
    if (name) out.push({ name, line: i + 1 });
  }
  return out;
}

/** The map as the model reads it: one line per landmark, the line it starts on, and how far the file goes. */
export function outlineText(title: string, content: string, spots = outline(content), maxSpots = 120): string {
  const total = content.split("\n").length;
  const step = spots.length > maxSpots ? Math.ceil(spots.length / maxSpots) : 1;
  const shown = spots.filter((_, i) => i % step === 0);
  return `${title} (${total} lines)\n${shown.map((s) => `  ${s.name} — line ${s.line}`).join("\n") || "  (no landmarks)"}`;
}

const MAX_BLOCK_LINES = 90;

/** Ranges (1-based, inclusive) for what the model asked for: landmark names, "120-180", or "Title:name". */
export function resolveSpots(content: string, wanted: string[], spots = outline(content)): Range[] {
  const total = content.split("\n").length;
  const ranges: Range[] = [];
  const lines = content.split("\n");
  /** From the landmark to its closing brace (or, without braces, to the next landmark), at most MAX_BLOCK_LINES. */
  const blockOf = (i: number): Range => {
    const start = spots[i].line;
    const limit = Math.min(start + MAX_BLOCK_LINES - 1, (spots[i + 1]?.line ?? total + 1) - 1, total);
    let depth = 0, opened = false;
    for (let n = start; n <= limit; n++) {
      const l = lines[n - 1].replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "");
      for (const ch of l) { if (ch === "{") { depth++; opened = true; } else if (ch === "}") depth--; }
      if (opened && depth <= 0) return [start, n];
      if (!opened && n - start >= 2) break;
    }
    return [start, limit];
  };
  for (const raw of wanted) {
    const w = raw.replace(/^.*?:\s*(?=[^\s:]+$)/, "").replace(/[`'"()]/g, "").replace(/\bline[s]?\b/gi, "").trim();
    if (!w) continue;
    const r = /^(\d+)\s*(?:-|–|to)\s*(\d+)$/.exec(w);
    if (r) { ranges.push([Math.max(1, +r[1]), Math.min(total, Math.max(+r[1], +r[2]))]); continue; }
    if (/^\d+$/.test(w)) { ranges.push([Math.max(1, +w - 10), Math.min(total, +w + 30)]); continue; }
    const key = w.toLowerCase();
    let i = spots.findIndex((s) => s.name.toLowerCase() === key);
    if (i < 0) i = spots.findIndex((s) => s.name.toLowerCase().includes(key) || key.includes(s.name.toLowerCase()));
    if (i >= 0) ranges.push(blockOf(i));
  }
  return ranges;
}

/**
 * The lines of those ranges (plus a little around each), as the model must copy them in its edit blocks: the code is
 * raw, the line numbers live in the tag. Stops adding pieces when the budget is spent.
 */
export function excerpts(content: string, ranges: Range[], maxChars: number, pad = 2): string {
  const lines = content.split("\n");
  const merged: Range[] = [];
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const lo = Math.max(1, a - pad), hi = Math.min(lines.length, b + pad);
    const prev = merged[merged.length - 1];
    if (prev && lo <= prev[1] + 1) prev[1] = Math.max(prev[1], hi); else merged.push([lo, hi]);
  }
  const out: string[] = [];
  let used = 0;
  for (const [a, b] of merged) {
    let body = lines.slice(a - 1, b).join("\n");
    if (used + body.length > maxChars) {
      if (out.length) break;
      body = body.slice(0, maxChars); // one piece is bigger than the whole budget: keep its start
    }
    used += body.length;
    out.push(`<excerpt lines="${a}-${b}">\n${body}\n</excerpt>`);
  }
  return out.join("\n");
}

/** Line numbers an error message talks about ("line 12", "script.js:12:5", "<anonymous>:12"). */
export function errorLines(errors: string[]): number[] {
  const n = new Set<number>();
  for (const e of errors) {
    for (const m of e.matchAll(/\bline[s]?\s+(\d{1,6})\b|[\w.<>)]:(\d{1,6})(?::\d+)?\b/gi)) n.add(+(m[1] ?? m[2]));
  }
  return [...n].filter((x) => x > 0);
}

/** The lines of `after` that differ from `before`, and the lines of `before` they replace. null when equal. */
export function changeSpan(before: string, after: string): { start: number; endAfter: number; endBefore: number } | null {
  if (before === after) return null;
  const a = before.split("\n"), b = after.split("\n");
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  return { start: s + 1, endBefore: ea, endAfter: eb };
}

/** What changed, in the usual "-old / +new" form, cut to `max` lines. Empty when nothing did. */
export function diffText(before: string, after: string, max = 40): string {
  const span = changeSpan(before, after);
  if (!span) return "";
  const a = before.split("\n").slice(span.start - 1, span.endBefore);
  const b = after.split("\n").slice(span.start - 1, span.endAfter);
  const rows = [...a.map((l) => `- ${l}`), ...b.map((l) => `+ ${l}`)];
  const head = `@@ line ${span.start} @@`;
  return rows.length > max ? `${head}\n${rows.slice(0, max).join("\n")}\n… ${rows.length - max} more lines` : `${head}\n${rows.join("\n")}`;
}
