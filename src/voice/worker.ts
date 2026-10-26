import { VoiceEngine } from "../core/voiceEngine";
import { fakeBackend, sherpaBackend } from "./backend";

/**
 * Voice worker: runs speech-to-text and text-to-speech away from the UI and the main process.
 * A crash or an NPU hang here cannot take the chat server or the app down with it.
 * Started with child_process.fork (ELECTRON_RUN_AS_NODE) and talks over the IPC channel.
 */
type In =
  | { t: "load"; kind: "stt" | "tts"; config: Record<string, unknown>; cpuConfig: Record<string, unknown>; wantNpu: boolean }
  | { t: "unload"; kind: "stt" | "tts" }
  | { t: "transcribe"; id: string; samples: Float32Array; sampleRate: number; partial?: boolean }
  | { t: "speak"; id: string; text: string; sid: number; speed: number }
  | { t: "cancel"; id: string }
  | { t: "exit" };

const send = (m: unknown) => process.send?.(m);
let engine: VoiceEngine;
try {
  engine = new VoiceEngine(process.env.OPENNPU_FAKE_VOICE ? fakeBackend() : sherpaBackend());
} catch (e) {
  send({ t: "fatal", message: `Could not load the speech runtime: ${(e as Error).message}` });
  process.exit(1);
}

async function load(m: Extract<In, { t: "load" }>) {
  const loader = (c: Record<string, unknown>) => (m.kind === "stt" ? engine.loadStt(c) : engine.loadTts(c));
  let provider: "cpu" | "npu" = m.wantNpu ? "npu" : "cpu";
  let notice: string | null = null;
  try {
    await loader(m.wantNpu ? m.config : m.cpuConfig);
  } catch (e) {
    if (!m.wantNpu) throw e;
    // The NPU provider is not available for this model or build: keep working on the CPU and say so.
    notice = `${m.kind === "stt" ? "Dictation" : "Read-aloud"} could not start on the NPU (${(e as Error).message.slice(0, 160)}); running on the CPU instead.`;
    provider = "cpu";
    await loader(m.cpuConfig);
  }
  send({ t: "loaded", kind: m.kind, provider, notice, sampleRate: m.kind === "tts" ? engine.ttsSampleRate : null });
}

process.on("message", (raw: In) => {
  void (async () => {
    try {
      switch (raw.t) {
        case "load": await load(raw); break;
        case "unload": raw.kind === "stt" ? engine.unloadStt() : engine.unloadTts(); send({ t: "unloaded", kind: raw.kind }); break;
        case "transcribe": {
          const text = await engine.transcribe(raw.samples, raw.sampleRate, !!raw.partial);
          send({ t: "text", id: raw.id, text });
          break;
        }
        case "speak": {
          const rate = engine.ttsSampleRate ?? 24000;
          await engine.speak(raw.id, raw.text, raw.sid, raw.speed, (samples, done) => send({ t: "audio", id: raw.id, samples, sampleRate: rate, done }));
          break;
        }
        case "cancel": engine.cancel(raw.id); break;
        case "exit": process.exit(0);
      }
    } catch (e) {
      send({ t: "error", id: (raw as any).id ?? null, kind: (raw as any).kind ?? null, message: (e as Error).message });
    }
  })();
});

send({ t: "ready" });
