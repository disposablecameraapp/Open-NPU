/**
 * A model that falls into a loop writes the same few words again and again until its limit. This finds where the loop starts
 * in what was written so far, so the looping text can be taken out and the answer started again from there.
 */

const MIN_UNIT = 8;
const MAX_UNIT = 600;
/** The part that repeats must be at least this long, and at least two more copies of its unit after the first. */
const MIN_REPEATED = 160;
const WINDOW = MAX_UNIT * 3 + MIN_REPEATED;

/** Where the looping text begins (the start of its first copy) when the end of `text` is the same unit repeated; otherwise null. */
export function findLoop(text: string): number | null {
  const n = text.length;
  if (n < MIN_REPEATED + MIN_UNIT) return null;
  const base = Math.max(0, n - WINDOW);
  const t = base ? text.slice(base) : text;
  const len = t.length;
  for (let p = MIN_UNIT; p <= MAX_UNIT && p * 2 <= len; p++) {
    let run = 0;
    while (run < len - p && t.charCodeAt(len - 1 - run) === t.charCodeAt(len - 1 - run - p)) run++;
    if (run < Math.max(MIN_REPEATED, 2 * p)) continue;
    const unit = t.slice(len - p);
    const solid = unit.replace(/\s/g, "");
    if (solid.length < 4 || new Set(solid).size < 2) continue;
    // the shortest unit is the loop (twice or three times that unit repeats just as well)
    return base + len - (run + p);
  }
  return null;
}
