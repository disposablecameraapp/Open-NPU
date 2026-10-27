// Typing slips and near-misses: a word a few letters away from a known word is taken for it.
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}
export const plainWord = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
/** How many letters may be wrong in a word of this length: none in a short word, one in a middle one, two in a long one. */
export const slack = (len: number) => (len < 4 ? 0 : len < 8 ? 1 : 2);

/** The choice a word stands for: the word itself, else the closest choice a few letters away; null when none is near enough. */
export function snap<T extends string>(word: unknown, choices: readonly T[]): T | null {
  if (typeof word !== "string") return null;
  const w = plainWord(word);
  if (!w) return null;
  let best: { c: T; d: number } | null = null;
  for (const c of choices) {
    const d = editDistance(w, plainWord(c));
    if (d <= slack(Math.max(w.length, c.length)) && (!best || d < best.d)) best = { c, d };
  }
  return best?.c ?? null;
}

/** The words of a text with each one that is a few letters from a known word put right, so the usual word rules can read it. */
export function mendWords(text: string, known: readonly string[]): string {
  const set = new Set(known.map(plainWord));
  return text.replace(/[\p{L}]{6,}/gu, (w) => {
    const p = plainWord(w);
    if (set.has(p)) return w;
    let best: { k: string; d: number } | null = null;
    for (const k of known) {
      if (Math.abs(k.length - p.length) > 2) continue;
      const d = editDistance(p, plainWord(k));
      if (d <= slack(p.length) && (!best || d < best.d)) best = { k, d };
    }
    return best ? best.k : w;
  });
}

