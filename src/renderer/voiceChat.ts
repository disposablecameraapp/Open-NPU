import { api } from "./api";
import { MicSession, Player } from "./audio";
import { SentenceChunker, settledSpeech, speechAfter, toSpeechText } from "../core/speechText";
import type { VadEvent } from "../core/vad";
import { endSilenceFor } from "../core/endpoint";
import { LiveDecoder, type LiveText } from "../core/live";
import { cleanTranscript, speechWords, stripAnnotations } from "../core/transcript";
import { spokenPrefix } from "../core/spoken";
import type { VoiceSettings } from "../shared/types";

export type VoiceState = "idle" | "listening" | "hearing" | "transcribing" | "thinking" | "speaking";

export interface VoiceHandlers {
  state: (s: VoiceState) => void;
  level: (l: number) => void;
  /** A finished utterance, already transcribed. */
  utterance: (text: string) => void;
  /** The words of what is being said, while it is said (null when nothing is). */
  live: (t: LiveText | null) => void;
  /** The words the assistant has said aloud so far in this answer (what the screen shows under the orb); "" clears them. */
  caption?: (spoken: string) => void;
  /** The user spoke over the assistant: stop generating. `spoken` is what had really been said aloud before the cut. */
  interrupt: (spoken: string) => void;
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
  /** `chat`: the silence before answering is the long one of the voice chat (stopping to think must not trigger it), else dictation's. */
  constructor(private mic: MicSession, private cfg: () => VoiceSettings, onLive: (t: LiveText | null) => void, private chat = false) {
    this.live = new LiveDecoder({
      decode: async (s) => {
        const t = await api().transcribe(s, 16000, true);
        return t == null ? t : stripAnnotations(t);
      },
      onText: (t, full) => {
        if (this.cfg().liveText && !this.hold) onLive(t);
        if (this.cfg().smartEnd) mic.setEndSilence(endSilenceFor(full, this.base(), this.chat ? { done: 0.7, open: 1.2 } : undefined));
      }
    });
  }
  /** While true the words are not shown (a possible interruption not yet confirmed). */
  hold = false;
  private base() { return this.chat ? this.cfg().waitMs : this.cfg().endSilenceMs; }
  /** Settings may change between two utterances. */
  begin() { this.live.reset(); this.mic.configure({ ...this.cfg(), endSilenceMs: this.base() }); }
  /** `force`: decode even when the words are not shown (needed to tell words from a cough before cutting the assistant off). */
  block(force = false) { const c = this.cfg(); if (force || c.liveText || c.smartEnd) void this.live.tick(this.mic.snapshot()); }
  get text() { return this.live.current; }
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
  /** The sentences of the answer being said, in order, with the audio length received for each: what the person heard when they cut in. */
  private said: { id: string; text: string; secs: number; done: boolean }[] = [];
  private streamDone = true;
  private state: VoiceState = "idle";
  private unsubAudio: (() => void) | null = null;
  private generation = 0;

  constructor(private h: VoiceHandlers, private cfg: () => VoiceSettings) {
    this.mic = new MicSession({ event: (e) => void this.onVad(e), level: (l) => { if (this.state !== "speaking") this.h.level(l); }, block: () => this.onBlock() });
    this.listening = new Listening(this.mic, cfg, (t) => this.h.live(t), true);
    this.player.onIdle = () => this.maybeFinish();
  }

  private meter: ReturnType<typeof setInterval> | null = null;

  private set(s: VoiceState) {
    if (s === this.state) return;
    this.state = s;
    this.h.state(s);
    // while the assistant talks the orb follows its own voice, not the microphone
    if (s === "speaking" && !this.meter) this.meter = setInterval(() => { this.h.level(this.player.level()); this.h.caption?.(this.spokenSoFar()); }, 50);
    else if (s !== "speaking" && this.meter) { clearInterval(this.meter); this.meter = null; this.h.level(0); }
  }
  get current() { return this.state; }

  private ensureAudio() {
    if (this.unsubAudio) return;
    this.unsubAudio = api().onVoiceAudio((c) => {
      if (!this.ids.has(c.id)) return;
      const rec = this.said.find((s) => s.id === c.id);
      if (c.samples.length) { this.player.enqueue(c.samples, c.sampleRate, c.id); if (rec) rec.secs += c.samples.length / c.sampleRate; }
      if (c.done) { if (rec) rec.done = true; this.ids.delete(c.id); this.maybeFinish(); }
    });
  }

  async start() {
    this.mic.configure({ ...this.cfg(), endSilenceMs: this.cfg().waitMs });
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

  /**
   * Sound heard while the assistant talks or thinks: it only cuts in once real words have been said without a break for `interruptMs`
   * (a cough, a laugh, a "hmm", a door or the assistant's own voice coming back never do). Until then the assistant carries on.
   */
  private candidate: { since: number } | null = null;

  private onBlock() {
    const c = this.candidate;
    if (!c) { this.listening.block(); return; }
    this.listening.block(true);
    if (this.mic.quietMs > 400) return; // a break: the one second starts again with the next sound
    const now = Date.now();
    if (!this.mic.speaking) { this.candidate = null; return; }
    if (now - c.since < this.cfg().interruptMs) return;
    const words = speechWords(this.listening.text);
    if (!words.length || this.isEcho(words)) { c.since = Math.max(c.since, now - this.cfg().interruptMs + 250); return; }
    this.candidate = null;
    this.cutIn();
  }

  /** Only words the assistant itself said (its voice picked up by the microphone). */
  private isEcho(words: string[]) {
    if (words.length < 3) return false;
    const said = new Set(this.said.flatMap((s) => s.text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}']/gu, ""))));
    return words.every((w) => said.has(w));
  }

  /** The voice is held, not stopped: it is only cut when what was said turns out to be words (`commitCut`), and goes on if it was not. */
  private paused = false;

  private cutIn() {
    this.player.pause();
    this.paused = true;
    this.listening.hold = false;
    this.set("hearing");
    this.h.live({ settled: "", moving: this.listening.text });
  }

  private commitCut() {
    this.paused = false;
    const spoken = this.spokenSoFar();
    this.cancelSpeech();
    this.h.caption?.(spoken);
    this.h.interrupt(spoken);
  }

  /** Nothing was said to the assistant after all (a cough, a noise): it goes on from the word where it was held. */
  private resumeSpeech() {
    this.paused = false;
    this.listening.drop();
    this.h.live(null);
    this.player.resume();
    this.set(this.speakingNow() ? "speaking" : "listening");
    this.maybeFinish();
  }

  private async onVad(e: VadEvent) {
    if (e.type === "start") {
      this.listening.begin();
      if (this.state === "speaking" || this.state === "thinking") {
        if (!this.cfg().allowInterrupt) return;
        this.candidate = { since: Date.now() };
        this.listening.hold = true;
        return;
      }
      this.h.caption?.("");
      this.set("hearing");
    } else if (e.type === "discarded") {
      this.candidate = null;
      this.listening.hold = false;
      if (this.paused) { this.resumeSpeech(); return; }
      this.listening.drop();
      this.h.live(null);
      this.set(this.speakingNow() ? "speaking" : "listening");
    } else if (e.type === "end") {
      if (this.candidate) {
        // the sound stopped before the assistant was cut: while it speaks it is ignored; while it only thinks it is the next message
        this.candidate = null;
        this.listening.hold = false;
        if (this.state !== "thinking" || !speechWords(this.listening.text).length) { this.listening.drop(); this.h.live(null); return; }
        this.cutIn();
      }
      this.set("transcribing");
      try {
        const text = await this.listening.finish(e);
        this.h.live(null);
        if (text) { if (this.paused) this.commitCut(); this.set("thinking"); this.h.utterance(text); }
        else if (this.paused) this.resumeSpeech();
        else this.set("listening");
      } catch (err) {
        this.h.live(null);
        this.h.error((err as Error).message);
        if (this.paused) this.resumeSpeech(); else this.set("listening");
      }
    }
  }

  /** Mute or unmute the microphone during the conversation; what is being said at that moment is dropped. */
  setMuted(m: boolean) {
    this.mic.setUserMute(m);
    if (m) {
      this.listening.drop();
      this.h.live(null);
      if (this.state === "hearing" || this.state === "transcribing") this.set("listening");
    }
  }
  get muted() { return this.mic.userMute; }

  /** The words of the answer that were said aloud up to this moment, cut at the word the voice had reached. */
  private spokenSoFar(): string {
    const heard = this.player.heard();
    return spokenPrefix(this.said.map((s) => ({ text: s.text, playedSec: heard.get(s.id) ?? 0, totalSec: s.done ? s.secs : null })));
  }

  private speakingNow() { return this.ids.size > 0 || this.player.playing; }

  // ---------------------------------------------------------------- assistant speech
  beginAnswer() {
    this.cancelSpeech();
    this.generation++;
    this.chunker = new SentenceChunker();
    this.said = [];
    this.full = ""; this.fed = ""; this.streamDone = false;
    this.mic.configure({ ...this.cfg(), endSilenceMs: this.cfg().waitMs });
    this.mic.setBargeIn(this.cfg().allowInterrupt);
    this.h.caption?.("");
    if (!this.cfg().allowInterrupt) this.mic.mute(false);
  }

  /** Feed streamed answer text (thinking text must not be passed in). */
  feed(delta: string) {
    this.full += delta;
    this.push(false);
  }

  /** What is settled of the answer so far goes to the chunker; markdown that is still being written is held back, never skipped. */
  private push(final: boolean) {
    const clean = settledSpeech(toSpeechText(this.full), final);
    const add = speechAfter(clean, this.fed);
    if (!add && !(final && clean !== this.fed)) return;
    this.fed = clean.length >= this.fed.length ? clean : this.fed;
    for (const s of this.chunker.push(add)) this.say(s);
  }

  endAnswer() {
    this.push(true);
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
    this.said.push({ id, text, secs: 0, done: false });
    this.set("speaking");
    if (!this.cfg().allowInterrupt) this.mic.mute(true);
    api().speak(id, text).catch((e) => { this.ids.delete(id); this.h.error((e as Error).message); this.maybeFinish(); });
  }

  private maybeFinish() {
    if (!this.streamDone || this.ids.size > 0 || this.player.playing) return;
    this.mic.mute(false);
    this.mic.setBargeIn(false);
    if (this.state === "speaking") this.h.caption?.(this.said.map((s) => s.text).join(" "));
    if (this.state === "speaking" || this.state === "thinking") this.set(this.mic.active ? "listening" : "idle");
  }

  cancelSpeech() {
    this.paused = false;
    this.candidate = null;
    this.listening.hold = false;
    for (const id of this.ids) void api().cancelSpeak(id);
    this.ids.clear();
    this.player.stop();
    this.streamDone = true;
    this.mic.mute(false);
    this.mic.setBargeIn(false);
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
