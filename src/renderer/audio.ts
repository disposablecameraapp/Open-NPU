import { EnergyVad, VadEvent } from "../core/vad";

/** Microphone -> 16 kHz mono blocks -> energy VAD. One utterance in, one Float32Array out. */
export class MicSession {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  readonly vad = new EnergyVad();
  private muted = false;

  constructor(private on: { event: (e: VadEvent) => void; level: (l: number) => void }) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule("./capture-worklet.js");
    const src = this.ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.ctx, "capture", { numberOfOutputs: 0 });
    node.port.onmessage = (m) => {
      if (this.muted) return;
      for (const e of this.vad.push(m.data as Float32Array)) this.on.event(e);
      this.on.level(this.vad.level);
    };
    src.connect(node);
    await this.ctx.resume();
  }

  /** Ignore the mic (assistant talking and interruption disabled). */
  mute(m: boolean) {
    this.muted = m;
    if (m) this.vad.reset();
  }

  /** Stricter detection while the assistant speaks, so its own voice does not trigger a barge-in. */
  setBargeIn(on: boolean) {
    this.vad.setRatio(on ? 6 : 3);
    this.vad.setMinRms(on ? 0.05 : 0.012);
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
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  onIdle: (() => void) | null = null;

  get playing() { return this.sources.size > 0; }

  enqueue(samples: Float32Array, sampleRate: number) {
    if (!samples.length) return;
    this.ctx ??= new AudioContext();
    const ctx = this.ctx;
    if (ctx.state === "suspended") void ctx.resume();
    const buf = ctx.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.02, this.next);
    src.start(at);
    this.next = at + buf.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0) this.onIdle?.();
    };
  }

  stop() {
    for (const s of this.sources) { s.onended = null; try { s.stop(); } catch { /* already ended */ } }
    this.sources.clear();
    this.next = 0;
  }
}
