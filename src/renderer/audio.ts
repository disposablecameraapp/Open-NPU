import { EnergyVad, VadEvent } from "../core/vad";
import type { VoiceSettings } from "../shared/types";

/** Microphone -> 16 kHz mono blocks -> energy VAD. One utterance in, one Float32Array out. */
export class MicSession {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  readonly vad = new EnergyVad();
  private muted = false;
  private userMuted = false;
  private minLevel = 0.012;
  private interruptLevel = 0.056;
  private barge = false;
  private deviceId = "";
  private node: AudioWorkletNode | null = null;

  /** `block`: called after every block of audio (about 30 times a second), to drive the live decoding. */
  constructor(private on: { event: (e: VadEvent) => void; level: (l: number) => void; block?: () => void }) {}

  /** The microphone settings: the quietest sound that counts, the shortest speech, the silence that ends an utterance. */
  configure(v: Pick<VoiceSettings, "minLevel" | "minSpeechMs" | "endSilenceMs"> & Partial<Pick<VoiceSettings, "interruptLevel" | "micDeviceId">>) {
    if (v.micDeviceId !== undefined) this.deviceId = v.micDeviceId;
    this.minLevel = v.minLevel;
    if (v.interruptLevel !== undefined) this.interruptLevel = v.interruptLevel;
    this.vad.setMinRms(v.minLevel);
    this.vad.setMinSpeech(v.minSpeechMs);
    this.vad.setEndSilence(v.endSilenceMs);
    if (this.barge) this.setBargeIn(true); // new settings do not undo the stricter detection of an answer being spoken
  }

  /** The audio of the utterance being said, null between two. */
  snapshot() { return this.vad.snapshot(); }
  get speaking() { return this.vad.isSpeaking; }
  get quietMs() { return this.vad.quietMs; }
  setEndSilence(ms: number) { this.vad.setEndSilence(ms); }

  async start(): Promise<void> {
    this.stream = await this.open();
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule("./capture-worklet.js");
    const src = this.ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.ctx, "capture", { numberOfOutputs: 0 });
    node.port.onmessage = (m) => {
      if (this.userMuted) { this.on.level(0); return; }
      if (this.muted) return;
      for (const e of this.vad.push(m.data as Float32Array)) this.on.event(e);
      this.on.level(this.vad.level);
      this.on.block?.();
    };
    src.connect(node);
    this.src = src;
    this.node = node;
    await this.ctx.resume();
  }

  private src: MediaStreamAudioSourceNode | null = null;

  /** The chosen microphone, or the system's when it is not plugged in any more. */
  private async open(): Promise<MediaStream> {
    const base = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (this.deviceId) {
      try { return await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: this.deviceId } } }); } catch { /* unplugged: the default one */ }
    }
    return navigator.mediaDevices.getUserMedia({ audio: base });
  }

  /** Another microphone while the session runs: the stream is swapped, what is being said is dropped. */
  async switchInput(id: string): Promise<void> {
    this.deviceId = id;
    if (!this.ctx || !this.node) return;
    const next = await this.open();
    this.src?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = next;
    this.src = this.ctx.createMediaStreamSource(next);
    this.src.connect(this.node);
    next.getAudioTracks().forEach((t) => { t.enabled = !this.userMuted; });
    this.vad.reset();
  }

  /** The person's own mute button: nothing is heard until it is released. Not undone by the assistant starting or stopping to talk. */
  setUserMute(m: boolean) {
    this.userMuted = m;
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = !m; });
    if (m) { this.vad.reset(); this.on.level(0); }
  }
  get userMute() { return this.userMuted; }

  /** Ignore the mic (assistant talking and interruption disabled). */
  mute(m: boolean) {
    this.muted = m;
    if (m) this.vad.reset();
  }

  /** Stricter detection while the assistant speaks, so its own voice does not trigger a barge-in. */
  setBargeIn(on: boolean) {
    this.barge = on;
    this.vad.setRatio(on ? 6 : 3);
    this.vad.setMinRms(on ? Math.max(this.interruptLevel, this.minLevel) : this.minLevel);
  }

  stop() {
    for (const e of this.vad.flush()) this.on.event(e);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.stream = null;
    this.ctx = null;
    this.vad.reset();
  }

  get active() { return !!this.ctx; }
}

/** Plays streamed TTS chunks back to back. */
export class Player {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private wave: Float32Array<ArrayBuffer> | null = null;
  private smooth = 0;
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  /** When each piece was scheduled to play, by the id of the sentence it belongs to: what was heard of a sentence cut short. */
  private log: { tag: string; start: number; dur: number }[] = [];
  onIdle: (() => void) | null = null;

  get playing() { return this.sources.size > 0; }

  enqueue(samples: Float32Array, sampleRate: number, tag = "") {
    if (!samples.length) return;
    this.ctx ??= new AudioContext();
    const ctx = this.ctx;
    if (ctx.state === "suspended") void ctx.resume();
    const buf = ctx.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.connect(ctx.destination);
      this.wave = new Float32Array(this.analyser.fftSize);
    }
    src.connect(this.analyser);
    const at = Math.max(ctx.currentTime + 0.02, this.next);
    src.start(at);
    this.next = at + buf.duration;
    this.log.push({ tag, start: at, dur: buf.duration });
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0) { this.log = []; this.onIdle?.(); }
    };
  }

  /** How loud the voice being played is right now, 0 to 1, rising fast and falling slowly so it follows the voice without flickering. */
  level(): number {
    if (!this.analyser || !this.wave || !this.playing) { this.smooth *= 0.8; return this.smooth < 0.01 ? 0 : this.smooth; }
    this.analyser.getFloatTimeDomainData(this.wave);
    let sum = 0;
    for (let i = 0; i < this.wave.length; i++) sum += this.wave[i] * this.wave[i];
    const raw = Math.min(1, Math.sqrt(sum / this.wave.length) * 7);
    this.smooth = raw > this.smooth ? this.smooth + (raw - this.smooth) * 0.5 : this.smooth * 0.9;
    return this.smooth;
  }

  /** Seconds of each sentence heard so far. */
  heard(): Map<string, number> {
    const now = this.ctx?.currentTime ?? 0;
    const out = new Map<string, number>();
    for (const l of this.log) out.set(l.tag, (out.get(l.tag) ?? 0) + Math.min(l.dur, Math.max(0, now - l.start)));
    return out;
  }

  /** Holds the voice where it is (the person may be cutting in); `resume` goes on from the same word. */
  pause() { void this.ctx?.suspend(); }
  resume() { void this.ctx?.resume(); }

  stop() {
    this.log = [];
    for (const s of this.sources) { s.onended = null; try { s.stop(); } catch { /* already ended */ } }
    this.sources.clear();
    this.next = 0;
  }
}
