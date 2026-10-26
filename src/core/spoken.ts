/**
 * What of an answer was really said aloud when the person cut in. Each sentence has the seconds of it that were heard, and its whole length once
 * all its audio has arrived (null while it is still being made: then it is guessed from the text). Sentences are kept up to the one that was
 * cut, which is kept up to the word the voice had reached.
 */
export interface SpokenSentence { text: string; playedSec: number; totalSec: number | null }

/** Characters a voice says in a second, about, for a sentence whose audio is not all there yet. */
const CHARS_PER_SEC = 14;

export function spokenPrefix(sentences: SpokenSentence[]): string {
  const out: string[] = [];
  for (const s of sentences) {
    if (s.playedSec <= 0.05) break;
    const total = s.totalSec ?? Math.max(s.playedSec + 0.3, s.text.length / CHARS_PER_SEC);
    const frac = Math.min(1, s.playedSec / total);
    if (frac >= 0.97) { out.push(s.text); continue; }
    const words = s.text.split(/\s+/).filter(Boolean);
    out.push(words.slice(0, Math.max(1, Math.floor(words.length * frac))).join(" "));
    break;
  }
  return out.join(" ").trim();
}
