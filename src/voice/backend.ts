import type { SttHandle, TtsHandle, VoiceBackend } from "../core/voiceEngine";

/** Real backend: sherpa-onnx-node (native, ARM64 on Windows on Arm). Loaded lazily so tests never need it. */
export function sherpaBackend(): VoiceBackend {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sherpa = require("sherpa-onnx-node");
  return {
    async createStt(config): Promise<SttHandle> {
      const rec = new sherpa.OfflineRecognizer(config);
      return {
        async decode(samples, sampleRate) {
          const stream = rec.createStream();
          stream.acceptWaveform({ samples, sampleRate });
          await rec.decodeAsync(stream);
          return String(rec.getResult(stream).text ?? "");
        }
      };
    },
    async createTts(config): Promise<TtsHandle> {
      const tts = await sherpa.OfflineTts.createAsync(config);
      return {
        sampleRate: tts.sampleRate,
        async generate({ text, sid, speed, onChunk }) {
          await tts.generateAsync({
            text, sid, speed, enableExternalBuffer: false,
            onProgress: ({ samples }: { samples: Float32Array }) => (onChunk(new Float32Array(samples)) ? 1 : 0)
          });
        }
      };
    }
  };
}

/** Deterministic stand-in used by tests (OPENNPU_FAKE_VOICE=1): no models, same protocol. */
export function fakeBackend(): VoiceBackend {
  return {
    async createStt(config): Promise<SttHandle> {
      if (JSON.stringify(config).includes('"provider":"qnn"') && process.env.OPENNPU_FAKE_QNN_FAIL) throw new Error("QNN provider not available");
      return { decode: async (s) => `heard ${s.length} samples` };
    },
    async createTts(config): Promise<TtsHandle> {
      if (JSON.stringify(config).includes('"provider":"qnn"') && process.env.OPENNPU_FAKE_QNN_FAIL) throw new Error("QNN provider not available");
      return {
        sampleRate: 24000,
        async generate({ text, onChunk }) {
          for (let i = 0; i < 3; i++) {
            await new Promise((r) => setTimeout(r, 10));
            if (!onChunk(new Float32Array(2400).fill(0.1 * (i + 1)))) return;
          }
          void text;
        }
      };
    }
  };
}
