/**
 * Speech engine behind the voice worker. The real backend (sherpa-onnx) is injected so the
 * protocol, cancel behaviour and chunk streaming can be tested without models.
 */
export interface SttHandle {
  decode(samples: Float32Array, sampleRate: number): Promise<string>;
}
export interface TtsHandle {
  sampleRate: number;
  /** Calls onChunk for each piece of audio; stop early when it returns false. */
  generate(req: { text: string; sid: number; speed: number; onChunk: (s: Float32Array) => boolean }): Promise<void>;
}
export interface VoiceBackend {
  createStt(config: Record<string, unknown>): Promise<SttHandle>;
  createTts(config: Record<string, unknown>): Promise<TtsHandle>;
}

/** A piece of text the voice has something to say for: at least one letter or digit. Punctuation alone makes the synthesizer return nothing. */
export const hasSpeech = (t: string) => /[\p{L}\p{N}]/u.test(t);

/** The text with what a synthesizer stumbles on taken out: symbols, brackets, repeated punctuation. */
export function plainSpeech(t: string): string {
  return t.replace(/[^\p{L}\p{N}\s.,!?;:'’-]/gu, " ").replace(/([.,!?;:])\1+/g, "$1").replace(/\s+/g, " ").trim();
}

/** A text in two halves cut at the space nearest its middle (null when it has no space). */
export function halves(t: string): [string, string] | null {
  const mid = Math.floor(t.length / 2);
  let at = -1;
  for (let d = 0; d < mid; d++) { if (t[mid - d] === " ") { at = mid - d; break; } if (t[mid + d] === " ") { at = mid + d; break; } }
  return at > 0 ? [t.slice(0, at).trim(), t.slice(at).trim()] : null;
}

export class VoiceEngine {
  private stt: SttHandle | null = null;
  private tts: TtsHandle | null = null;
  private cancelled = new Set<string>();
  /** One recognizer / synthesizer call at a time per kind: they are CPU-bound and not re-entrant. */
  private sttQueue: Promise<unknown> = Promise.resolve();
  private ttsQueue: Promise<unknown> = Promise.resolve();

  constructor(private backend: VoiceBackend) {}

  get ttsSampleRate() { return this.tts?.sampleRate ?? null; }
  get hasStt() { return !!this.stt; }
  get hasTts() { return !!this.tts; }

  async loadStt(config: Record<string, unknown>) { this.stt = null; this.stt = await this.backend.createStt(config); }
  async loadTts(config: Record<string, unknown>) { this.tts = null; this.tts = await this.backend.createTts(config); }
  unloadStt() { this.stt = null; }
  unloadTts() { this.tts = null; }

  private sttPending = 0;

  /**
   * `partial`: a preview of speech still being said. It is skipped (null) when the recognizer is busy, so previews never queue up in front
   * of the decode that ends an utterance, which is always run.
   */
  transcribe(samples: Float32Array, sampleRate: number, partial = false): Promise<string | null> {
    if (partial && this.sttPending > 0) return Promise.resolve(null);
    const run = async () => {
      if (!this.stt) throw new Error("No dictation model is loaded.");
      if (samples.length < sampleRate * 0.1) return "";
      return (await this.stt.decode(samples, sampleRate)).trim();
    };
    this.sttPending++;
    const p = this.sttQueue.then(run, run).finally(() => { this.sttPending--; });
    this.sttQueue = p.catch(() => undefined);
    return p;
  }

  cancel(id: string) { this.cancelled.add(id); }
  cancelAll(ids: string[]) { ids.forEach((i) => this.cancelled.add(i)); }

  speak(id: string, text: string, sid: number, speed: number, emit: (chunk: Float32Array, done: boolean) => void): Promise<void> {
    const run = async () => {
      if (!this.tts) throw new Error("No read-aloud model is loaded.");
      if (this.cancelled.delete(id)) return emit(new Float32Array(0), true);
      const say = async (t: string) => {
        let got = false;
        await this.tts!.generate({
          text: t, sid, speed,
          onChunk: (s) => {
            if (this.cancelled.has(id)) return false;
            if (s.length) got = true;
            emit(s, false);
            return true;
          }
        });
        return got;
      };
      // a piece with nothing to say (only punctuation) is skipped; one the synthesizer made no sound of is tried again in plain words, and skipped
      // if it still gives nothing: a sentence lost is better than an error over the conversation
      // (in halves as a last resort, so that one word the synthesizer chokes on does not take the whole sentence with it)
      const attempt = async (t: string, depth: number): Promise<void> => {
        if (!hasSpeech(t) || this.cancelled.has(id)) return;
        try { await say(t); } catch (e) {
          if (!/no audio/i.test((e as Error).message)) throw e;
          const plain = plainSpeech(t);
          if (hasSpeech(plain) && plain !== t) return attempt(plain, depth);
          const h = depth < 3 ? halves(t) : null;
          if (h) { await attempt(h[0], depth + 1); await attempt(h[1], depth + 1); }
        }
      };
      await attempt(text, 0);
      this.cancelled.delete(id);
      emit(new Float32Array(0), true);
    };
    const p = this.ttsQueue.then(run, run);
    this.ttsQueue = p.catch(() => undefined);
    return p;
  }
}
