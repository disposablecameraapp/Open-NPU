import { api } from "./api";
import { MicSession, Player } from "./audio";
import { SentenceChunker, toSpeechText } from "../core/speechText";
import type { VadEvent } from "../core/vad";
import { endSilenceFor } from "../core/endpoint";
import { LiveDecoder, type LiveText } from "../core/live";
import { cleanTranscript } from "../core/transcript";
import type { VoiceSettings } from "../shared/types";

export type VoiceState = "idle" | "listening" | "hearing" | "transcribing" | "thinking" | "speaking";

export interface VoiceHandlers {
  state: (s: VoiceState) => void;
  level: (l: number) => void;
  /** A finished utterance, already transcribed. */
  utterance: (text: string) => void;
  /** The words of what is being said, while it is said (null when nothing is). */
  live: (t: LiveText | null) => void;
  /** The user spoke over the assistant: stop generating. */
  interrupt: () => void;
  error: (message: string) => void;
}

let counter = 0;

type EndEvent = Extract<VadEvent, { type: "end" }>;

/**
 * What the microphone hears turned into text, for the voice chat and for dictation: the words appear while they are said (the audio so far is
 * decoded again as it grows, and each decode may correct the words before it), the pause that ends the utterance follows what was said,
 * and when the last of those decodes already saw everything, it is the answer and the end costs nothing.
 */
class Listening {
  private live: LiveDecoder;
  constructor(private mic: MicSession, private cfg: () => VoiceSettings, onLive: (t: LiveText | null) => void) {
    this.live = new LiveDecoder({
      decode: (s) => api().transcribe(s, 16000, true),
      onText: (t, full) => {
        if (this.cfg().liveText) onLive(t);
        if (this.cfg().smartEnd) mic.setEndSilence(endSilenceFor(full, this.cfg().endSilenceMs));
      }
    });
  }
  /** Settings may change between two utterances. */
  begin() { this.live.reset(); this.mic.configure(this.cfg()); }
  block() { const c = this.cfg(); if (c.liveText || c.smartEnd) void this.live.tick(this.mic.snapshot()); }
  async finish(e: EndEvent): Promise<string> {
    const reuse = this.live.reusable(e.speechSamples);
    const raw = reuse ?? (await api().transcribe(e.samples.subarray(0, e.speechSamples), 16000)) ?? "";
    this.live.reset();
    return cleanTranscript(raw, { rms: e.rms, ms: (e.speechSamples / 16000) * 1000 });
  }
  drop() { this.live.reset(); }
}

/**
 * Live voice conversation: mic + VAD in, transcription out; streamed answer text in, sentence by
 * sentence speech out. Everything heavy happens in the main process / voice worker.
 */
export class VoiceChat {
  private mic: MicSession;
  private listening: Listening;
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
    this.mic = new MicSession({ event: (e) => void this.onVad(e), level: (l) => this.h.level(l), block: () => this.listening.block() });
    this.listening = new Listening(this.mic, cfg, (t) => this.h.live(t));
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
    this.mic.configure(this.cfg());
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
      this.listening.begin();
      if (this.state === "speaking" || this.state === "thinking") {
        if (!this.cfg().allowInterrupt) return;
        this.cancelSpeech();
        this.h.interrupt();
      }
      this.set("hearing");
    } else if (e.type === "discarded") {
      this.listening.drop();
      this.h.live(null);
      this.set(this.speakingNow() ? "speaking" : "listening");
    } else if (e.type === "end") {
      this.set("transcribing");
      try {
        const text = await this.listening.finish(e);
        this.h.live(null);
        if (text) { this.set("thinking"); this.h.utterance(text); }
        else this.set("listening");
      } catch (err) {
        this.h.live(null);
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

export interface DictationHandlers {
  level: (l: number) => void;
  live: (t: LiveText | null) => void;
  /** A finished piece of speech, to be added to the text. */
  commit: (text: string) => void;
}

/**
 * Dictation: listens until stop is pressed (`signal.stopped`) or nothing has been said for a while. Every pause commits what was said so far,
 * so the text builds up as the person talks and a thought does not have to fit between two pauses.
 */
export function dictate(h: DictationHandlers, cfg: () => VoiceSettings, signal: { stopped: boolean }): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let finished = false, stopping = false, heardAny = false;
    let inflight = 0;
    let lastActive = Date.now();
    const done = (err?: Error) => {
      if (finished) return;
      finished = true; clearInterval(poll); mic.stop(); h.live(null);
      if (err) reject(err); else resolve();
    };
    const onEvent = async (e: VadEvent) => {
      if (e.type === "start") { listening.begin(); lastActive = Date.now(); return; }
      if (e.type === "discarded") { listening.drop(); h.live(null); return; }
      inflight++;
      try {
        const t = await listening.finish(e);
        h.live(null);
        if (t) { heardAny = true; h.commit(t); }
      } catch (err) { inflight--; return done(err as Error); }
      inflight--;
      lastActive = Date.now();
      if (stopping && !inflight) done();
    };
    const mic: MicSession = new MicSession({ level: h.level, event: (e) => void onEvent(e), block: () => listening.block() });
    const listening = new Listening(mic, cfg, h.live);
    const poll = setInterval(() => {
      if (!signal.stopped && !mic.speaking && !inflight && Date.now() - lastActive > (heardAny ? 8000 : 15000)) signal.stopped = true; // nothing said for a while
      if (!signal.stopped || stopping) return;
      stopping = true;
      mic.stop(); // flushes an open utterance into the event above
      if (!inflight) done();
    }, 100);
    mic.configure(cfg());
    mic.start().catch((err) => done(err));
  });
}
