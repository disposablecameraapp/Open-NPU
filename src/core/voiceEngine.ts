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
      await this.tts.generate({
        text, sid, speed,
        onChunk: (s) => {
          if (this.cancelled.has(id)) return false;
          emit(s, false);
          return true;
        }
      });
      this.cancelled.delete(id);
      emit(new Float32Array(0), true);
    };
    const p = this.ttsQueue.then(run, run);
    this.ttsQueue = p.catch(() => undefined);
    return p;
  }
}
