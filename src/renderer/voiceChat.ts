import { api } from "./api";
import { MicSession, Player } from "./audio";
import { SentenceChunker, toSpeechText } from "../core/speechText";
import type { VadEvent } from "../core/vad";
import type { VoiceSettings } from "../shared/types";

export type VoiceState = "idle" | "listening" | "hearing" | "transcribing" | "thinking" | "speaking";

export interface VoiceHandlers {
  state: (s: VoiceState) => void;
  level: (l: number) => void;
  /** A finished utterance, already transcribed. */
  utterance: (text: string) => void;
  /** The user spoke over the assistant: stop generating. */
  interrupt: () => void;
  error: (message: string) => void;
}

let counter = 0;

/**
 * Live voice conversation: mic + VAD in, transcription out; streamed answer text in, sentence by
 * sentence speech out. Everything heavy happens in the main process / voice worker.
 */
export class VoiceChat {
  private mic: MicSession;
  private player = new Player();
  private chunker = new SentenceChunker();
  private full = "";
  private fed = "";
  private ids = new Set<string>();
  private streamDone = true;
  private state: VoiceState = "idle";
  private unsubAudio: (() => void) | null = null;
  private generation = 0;

  constructor(private h: VoiceHandlers, private cfg: () => VoiceSettings) {
    this.mic = new MicSession({ event: (e) => void this.onVad(e), level: (l) => this.h.level(l) });
    this.player.onIdle = () => this.maybeFinish();
  }

  private set(s: VoiceState) { if (s !== this.state) { this.state = s; this.h.state(s); } }
  get current() { return this.state; }

  private ensureAudio() {
    if (this.unsubAudio) return;
    this.unsubAudio = api().onVoiceAudio((c) => {
      if (!this.ids.has(c.id)) return;
      if (c.samples.length) this.player.enqueue(c.samples, c.sampleRate);
      if (c.done) { this.ids.delete(c.id); this.maybeFinish(); }
    });
  }

  async start() {
    await this.mic.start();
    this.ensureAudio();
    this.set("listening");
  }

  stop() {
    this.cancelSpeech();
    this.mic.stop();
    this.set("idle");
  }

  dispose() {
    this.stop();
    this.unsubAudio?.();
    this.unsubAudio = null;
  }

  private async onVad(e: VadEvent) {
    if (e.type === "start") {
      if (this.state === "speaking" || this.state === "thinking") {
        if (!this.cfg().allowInterrupt) return;
        this.cancelSpeech();
        this.h.interrupt();
      }
      this.set("hearing");
    } else if (e.type === "discarded") {
      this.set(this.speakingNow() ? "speaking" : "listening");
    } else if (e.type === "end") {
      this.set("transcribing");
      try {
        const text = (await api().transcribe(e.samples, 16000)).trim();
        if (text) { this.set("thinking"); this.h.utterance(text); }
        else this.set("listening");
      } catch (err) {
        this.h.error((err as Error).message);
        this.set("listening");
      }
    }
  }

  private speakingNow() { return this.ids.size > 0 || this.player.playing; }

  // ---------------------------------------------------------------- assistant speech
  beginAnswer() {
    this.cancelSpeech();
    this.generation++;
    this.chunker = new SentenceChunker();
    this.full = ""; this.fed = ""; this.streamDone = false;
    this.mic.setBargeIn(this.cfg().allowInterrupt);
    if (!this.cfg().allowInterrupt) this.mic.mute(false);
  }

  /** Feed streamed answer text (thinking text must not be passed in). */
  feed(delta: string) {
    this.full += delta;
    const clean = toSpeechText(this.full);
    if (clean.startsWith(this.fed)) {
      const add = clean.slice(this.fed.length);
      this.fed = clean;
      for (const s of this.chunker.push(add)) this.say(s);
    }
  }

  endAnswer() {
    for (const s of this.chunker.flush()) this.say(s);
    this.streamDone = true;
    this.maybeFinish();
  }

  /** Read a whole text (the speaker button on a message). */
  readAloud(text: string) {
    this.beginAnswer();
    const c = new SentenceChunker();
    for (const s of [...c.push(toSpeechText(text)), ...c.flush()]) this.say(s);
    this.streamDone = true;
    this.maybeFinish();
  }

  private say(sentence: string) {
    const text = sentence.trim();
    if (!text) return;
    this.ensureAudio();
    const id = `s${Date.now()}-${++counter}`;
    this.ids.add(id);
    this.set("speaking");
    if (!this.cfg().allowInterrupt) this.mic.mute(true);
    api().speak(id, text).catch((e) => { this.ids.delete(id); this.h.error((e as Error).message); this.maybeFinish(); });
  }

  private maybeFinish() {
    if (!this.streamDone || this.ids.size > 0 || this.player.playing) return;
    this.mic.mute(false);
    if (this.state === "speaking" || this.state === "thinking") this.set(this.mic.active ? "listening" : "idle");
  }

  cancelSpeech() {
    for (const id of this.ids) void api().cancelSpeak(id);
    this.ids.clear();
    this.player.stop();
    this.streamDone = true;
    this.mic.mute(false);
  }
}

/** One-shot dictation: record until the speaker pauses (or stop is pressed), return the text. */
export function dictateOnce(onLevel: (l: number) => void, signal: { stopped: boolean }): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let done = false;
    let stopping = false;
    const finish = (fn: () => void) => { if (!done) { done = true; clearInterval(poll); mic.stop(); fn(); } };
    const mic = new MicSession({
      level: onLevel,
      event: (e) => {
        if (e.type === "end") api().transcribe(e.samples, 16000).then((t) => finish(() => resolve(t.trim())), (err) => finish(() => reject(err)));
      }
    });
    const poll = setInterval(() => {
      if (!signal.stopped || stopping) return;
      stopping = true;
      mic.stop(); // flushes an open utterance into the "end" event above
      setTimeout(() => finish(() => resolve("")), 15000); // nothing was said
    }, 100);
    mic.start().catch((err) => finish(() => reject(err)));
  });
}
