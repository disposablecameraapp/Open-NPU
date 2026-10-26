/**
 * The words of an utterance while it is still being said. The recognizer decodes the audio so far again and again; every new decode may
 * correct the words before it (it now knows more of the sentence). The part that two decodes in a row agree on is shown as settled, the
 * rest as still moving.
 */
export interface LiveText { settled: string; moving: string }

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function stabilize(prev: string, next: string): LiveText {
  const a = words(prev), b = words(next);
  let n = 0;
  while (n < a.length && n < b.length && norm(a[n]) === norm(b[n])) n++;
  // the last agreed word may still grow ("heli" → "hello"): it stays moving
  const keep = Math.max(0, n - 1);
  return { settled: b.slice(0, keep).join(" "), moving: b.slice(keep).join(" ") };
}

export interface LiveOptions {
  /** Decodes the audio so far; null when the recognizer was busy and skipped it. */
  decode: (samples: Float32Array) => Promise<string | null>;
  onText: (t: LiveText, full: string) => void;
  sampleRate?: number;
  /** Least new audio before decoding again. */
  growMs?: number;
  /** Least time between two decodes starting. */
  gapMs?: number;
  now?: () => number;
}

/**
 * Drives the partial decodes of one utterance. `tick` is called as often as audio arrives and does nothing while a decode is running or
 * while there is too little new sound; nothing here uses a timer. The last decode is kept: when the utterance ends having covered all its
 * speech, that text is the answer and no second decode is needed.
 */
export class LiveDecoder {
  private busy = false;
  private covered = 0;
  private text = "";
  private gen = 0;
  private lastStart = -Infinity;
  private rate: number;
  private grow: number;

  constructor(private o: LiveOptions) {
    this.rate = o.sampleRate ?? 16000;
    this.grow = Math.round(((o.growMs ?? 450) * this.rate) / 1000);
  }

  get current() { return this.text; }

  /** A new utterance starts: what was kept is forgotten, and a decode still running for the last one is ignored when it ends. */
  reset() { this.gen++; this.busy = false; this.covered = 0; this.text = ""; this.lastStart = -Infinity; }

  async tick(snapshot: Float32Array | null): Promise<void> {
    if (!snapshot || this.busy || snapshot.length - this.covered < this.grow) return;
    const now = this.o.now?.() ?? Date.now();
    if (now - this.lastStart < (this.o.gapMs ?? 350)) return; // a skipped or quick decode is not asked again at once
    this.lastStart = now;
    const gen = this.gen;
    this.busy = true;
    try {
      const out = await this.o.decode(snapshot);
      if (gen !== this.gen || out === null) return;
      const full = out.trim();
      if (full) { this.o.onText(stabilize(this.text, full), full); this.text = full; }
      this.covered = snapshot.length;
    } catch { /* a partial that fails is only a missing preview: the final decode reports real errors */ } finally {
      if (gen === this.gen) this.busy = false;
    }
  }

  /** The text of the last partial decode when it saw all of the speech (within `slackMs`), else null: the final decode must run. */
  reusable(speechSamples: number, slackMs = 120): string | null {
    if (!this.text || this.busy) return null;
    return this.covered >= speechSamples - Math.round((slackMs * this.rate) / 1000) ? this.text : null;
  }
}
