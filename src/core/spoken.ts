import { forVoice } from "./speakNumbers";
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
    // a voice takes longer on a long word and pauses on punctuation: the share of the sentence heard is a share of that weight, not of the word count
    const weight = words.map((w) => forVoice(w, "en").replace(/[^\p{L}\p{N}]/gu, "").length + 1 + (/[,;:]$/.test(w) ? 2 : /[.!?…]$/.test(w) ? 4 : 0));
    const sum = weight.reduce((a, b) => a + b, 0);
    let n = 0, acc = 0;
    while (n < words.length && acc + weight[n] <= frac * sum) acc += weight[n++];
    out.push(words.slice(0, Math.max(1, n)).join(" "));
    break;
  }
  return out.join(" ").trim();
}

/** The mark put in an answer the person cut into, where the voice had reached: what comes before it was heard, what follows was not said. */
export const INTERRUPT_MARK = "[The user interrupted here: they heard everything before this mark and nothing after it. If they ask you to go on, resume from this point.]";

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * The whole answer with the interruption marked where it happened. `heardWords` is how many words of `prose` (the answer as the voice reads
 * it) were said aloud; the same point is found in `content` (the answer as written, with its marks and blocks) by following the words of
 * `prose` through it. When the point cannot be found the mark goes at the end of the heard part's best match, or at the very start for none.
 */
export function markInterruption(content: string, heardWords: number, prose: string): string {
  const spoken = prose.split(/\s+/).map(norm).filter(Boolean);
  if (heardWords <= 0) return `${INTERRUPT_MARK} ${content}`.trim();
  let k = 0, at = -1;
  for (const m of content.matchAll(/\S+/g)) {
    const w = norm(m[0]);
    if (!w) continue;
    if (w === spoken[k]) { k++; if (k >= Math.min(heardWords, spoken.length)) { at = m.index! + m[0].length; break; } }
  }
  if (at < 0) return `${content} ${INTERRUPT_MARK}`.trim();
  return `${content.slice(0, at)} ${INTERRUPT_MARK}${content.slice(at)}`;
}
