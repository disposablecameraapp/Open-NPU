/**
 * How long to wait in silence before an utterance counts as finished, from what has been heard so far. A finished sentence is answered
 * after a short pause; a sentence that stops on a comma or on a linking word ("and", "et", "parce que") is the person thinking, so the
 * pause is longer. Without punctuation (some models write none) the base value is used.
 */
const OPEN_ENDINGS = new Set([
  "and", "but", "or", "so", "because", "then", "if", "that", "which", "who", "when", "while", "to", "of", "the", "a", "an", "with", "for", "in", "on", "at", "is", "are", "uh", "um", "hmm",
  "et", "mais", "ou", "donc", "car", "que", "qui", "quand", "si", "parce", "pour", "de", "du", "des", "le", "la", "les", "un", "une", "à", "dans", "sur", "avec", "est", "euh", "ben", "alors"
]);

export interface EndFactors { done: number; open: number }

/** `factors`: a finished sentence waits base x done, an open one base x open (both capped). */
export function endSilenceFor(text: string, baseMs: number, factors: EndFactors = { done: 0.45, open: 1.8 }): number {
  const t = text.trim();
  if (!t) return baseMs;
  const lo = Math.max(250, Math.round(baseMs * factors.done));
  const hi = Math.min(Math.max(3000, baseMs), Math.round(baseMs * factors.open));
  if (/[.!?…]["»”)]?$/.test(t)) return lo;
  if (/[,;:\-–—]$/.test(t) || /\.\.\.$/.test(t)) return hi;
  const last = t.toLowerCase().replace(/[^\p{L}\p{N}'’ ]/gu, "").split(/\s+/).pop() ?? "";
  if (OPEN_ENDINGS.has(last) || /^(l|d|j|n|qu|c|s)['’]$/.test(last)) return hi;
  return baseMs;
}
