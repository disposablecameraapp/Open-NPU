/**
 * Energy-based voice activity detector for the live voice chat. No model to download, runs on the
 * UI side at 16 kHz. An adaptive noise floor keeps it working in quiet rooms and on fans.
 * (A neural VAD such as Silero would be more robust in noise; this is the dependency-free start.)
 */
export interface VadOptions {
  sampleRate?: number;
  frameMs?: number;
  /** Consecutive voiced frames needed to call it speech (default 6 = 120 ms). */
  startFrames?: number;
  /** Silence that ends an utterance. */
  endSilenceMs?: number;
  /** Audio kept from before the detected start so the first syllable is not clipped. */
  preRollMs?: number;
  minSpeechMs?: number;
  maxUtteranceMs?: number;
  /** Absolute RMS floor; below this is never speech. */
  minRms?: number;
  /** Speech must exceed noise floor x this. Raised while the assistant is talking (barge-in). */
  ratio?: number;
}

export type VadEvent =
  | { type: "start" }
  | { type: "end"; samples: Float32Array; durationMs: number }
  | { type: "discarded" };

export class EnergyVad {
  private o: Required<VadOptions>;
  private frameLen: number;
  private carry: number[] = [];
  private floor = 0.004;
  private voicedRun = 0;
  private silentMs = 0;
  private speaking = false;
  private pre: Float32Array[] = [];
  private cur: Float32Array[] = [];
  private curMs = 0;
  private speechMs = 0;
  /** Latest frame level (0..1) for the UI meter. */
  level = 0;

  constructor(opts: VadOptions = {}) {
    this.o = {
      sampleRate: 16000, frameMs: 20, startFrames: 6, endSilenceMs: 800, preRollMs: 300,
      minSpeechMs: 250, maxUtteranceMs: 30000, minRms: 0.012, ratio: 3, ...opts
    };
    this.frameLen = Math.round((this.o.sampleRate * this.o.frameMs) / 1000);
  }

  get isSpeaking() { return this.speaking; }
  setRatio(r: number) { this.o.ratio = r; }
  setMinRms(r: number) { this.o.minRms = r; }

  reset() {
    this.carry = []; this.voicedRun = 0; this.silentMs = 0; this.speaking = false;
    this.pre = []; this.cur = []; this.curMs = 0; this.speechMs = 0;
  }

  push(samples: Float32Array): VadEvent[] {
    const events: VadEvent[] = [];
    let buf: Float32Array = samples;
    if (this.carry.length) {
      const merged = new Float32Array(this.carry.length + samples.length);
      merged.set(this.carry); merged.set(samples, this.carry.length);
      buf = merged; this.carry = [];
    }
    let i = 0;
    for (; i + this.frameLen <= buf.length; i += this.frameLen) {
      this.frame(buf.subarray(i, i + this.frameLen), events);
    }
    if (i < buf.length) this.carry = Array.from(buf.subarray(i));
    return events;
  }

  private frame(f: Float32Array, events: VadEvent[]) {
    let sum = 0;
    for (let k = 0; k < f.length; k++) sum += f[k] * f[k];
    const rms = Math.sqrt(sum / f.length);
    this.level = Math.min(1, rms * 8);
    const voiced = rms > Math.max(this.o.minRms, this.floor * this.o.ratio);
    // noise floor: follow quiet down fast, creep up slowly, and never learn from speech
    if (!voiced) this.floor = rms < this.floor ? this.floor * 0.9 + rms * 0.1 : this.floor * 0.995 + rms * 0.005;

    const copy = f.slice();
    if (!this.speaking) {
      this.pre.push(copy);
      const maxPre = Math.ceil(this.o.preRollMs / this.o.frameMs) + this.o.startFrames;
      while (this.pre.length > maxPre) this.pre.shift();
      this.voicedRun = voiced ? this.voicedRun + 1 : 0;
      if (this.voicedRun >= this.o.startFrames) {
        this.speaking = true;
        this.cur = this.pre.slice();
        this.pre = [];
        this.curMs = this.cur.length * this.o.frameMs;
        this.speechMs = this.o.startFrames * this.o.frameMs;
        this.silentMs = 0;
        events.push({ type: "start" });
      }
      return;
    }
    this.cur.push(copy);
    this.curMs += this.o.frameMs;
    if (voiced) { this.silentMs = 0; this.speechMs += this.o.frameMs; } else this.silentMs += this.o.frameMs;
    if (this.silentMs >= this.o.endSilenceMs || this.curMs >= this.o.maxUtteranceMs) this.finish(events);
  }

  private finish(events: VadEvent[]) {
    const ok = this.speechMs >= this.o.minSpeechMs;
    const total = this.cur.reduce((n, a) => n + a.length, 0);
    const out = new Float32Array(total);
    let off = 0;
    for (const a of this.cur) { out.set(a, off); off += a.length; }
    const dur = this.curMs;
    this.speaking = false; this.cur = []; this.curMs = 0; this.voicedRun = 0; this.silentMs = 0; this.speechMs = 0;
    events.push(ok ? { type: "end", samples: out, durationMs: dur } : { type: "discarded" });
  }

  /** Force-close the current utterance (push-to-talk released). */
  flush(): VadEvent[] {
    const events: VadEvent[] = [];
    if (this.speaking) this.finish(events);
    return events;
  }
}
