import { VoiceModel } from "../shared/types";

const RELEASES = "https://github.com/k2-fsa/sherpa-onnx/releases/download";

/**
 * Speech models, run by sherpa-onnx in a separate process. Each one has its own CPU / NPU switch:
 * CPU leaves the NPU to the chat model; NPU is faster when the memory budget (core/budget.ts) allows
 * chat + dictation + read-aloud to sit there together. An NPU load that fails falls back to the CPU.
 * Sizes are approximate archive sizes; archive names follow the sherpa-onnx release pages and
 * were not re-checked from the build sandbox (no access to GitHub there).
 */
export const VOICE_MODELS: VoiceModel[] = [
  // ----- dictation (speech to text)
  { id: "stt-whisper-base", kind: "stt", name: "Whisper base (multilingual)", family: "whisper", archive: "sherpa-onnx-whisper-base", sizeMB: 160, languages: "99 languages incl. French", note: "Good default: small, handles many languages and auto-detects.", default: true },
  { id: "stt-whisper-tiny", kind: "stt", name: "Whisper tiny (multilingual)", family: "whisper", archive: "sherpa-onnx-whisper-tiny", sizeMB: 110, languages: "99 languages", note: "Fastest Whisper; more mistakes." },
  { id: "stt-whisper-small", kind: "stt", name: "Whisper small (multilingual)", family: "whisper", archive: "sherpa-onnx-whisper-small", sizeMB: 360, languages: "99 languages", note: "More accurate, slower on CPU." },
  { id: "stt-moonshine-base-en", kind: "stt", name: "Moonshine base (English)", family: "moonshine", archive: "sherpa-onnx-moonshine-base-en-int8", sizeMB: 280, languages: "English", note: "Built for live use: short audio is decoded fast." },
  { id: "stt-moonshine-tiny-en", kind: "stt", name: "Moonshine tiny (English)", family: "moonshine", archive: "sherpa-onnx-moonshine-tiny-en-int8", sizeMB: 120, languages: "English", note: "Smallest and quickest." },
  { id: "stt-parakeet-v3", kind: "stt", name: "Parakeet TDT 0.6B v3", family: "transducer", archive: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8", sizeMB: 640, languages: "25 European languages incl. French", note: "Best accuracy here, but the largest; uses ~1 GB of RAM." },

  // ----- read aloud (text to speech)
  {
    id: "tts-kokoro-multi-full", kind: "tts", name: "Kokoro (multilingual, full quality)", family: "kokoro", archive: "kokoro-multi-lang-v1_1", sizeMB: 350,
    languages: "English, French, Spanish, Italian, Portuguese, Hindi, Japanese, Chinese", note: "The same voice without the int8 compression: cleaner and less muffled. Default.", default: true, sidCount: 103
  },
  {
    id: "tts-kokoro-multi", kind: "tts", name: "Kokoro (multilingual, int8)", family: "kokoro", archive: "kokoro-int8-multi-lang-v1_1", sizeMB: 140,
    languages: "English, French, Spanish, Italian, Portuguese, Hindi, Japanese, Chinese", note: "Compressed: a third of the size, a slightly degraded sound.", sidCount: 103
  },
  {
    id: "tts-kokoro-en", kind: "tts", name: "Kokoro (English v0.19)", family: "kokoro", archive: "kokoro-en-v0_19", sizeMB: 310, languages: "English", note: "The original Kokoro: English only, named voices.",
    voices: [
      { sid: 0, name: "Default" }, { sid: 1, name: "Bella" }, { sid: 2, name: "Nicole" }, { sid: 3, name: "Sarah" }, { sid: 4, name: "Sky" },
      { sid: 5, name: "Adam" }, { sid: 6, name: "Michael" }, { sid: 7, name: "Emma (UK)" }, { sid: 8, name: "Isabella (UK)" }, { sid: 9, name: "George (UK)" }, { sid: 10, name: "Lewis (UK)" }
    ]
  },
  { id: "tts-piper-fr-upmc", kind: "tts", name: "Piper UPMC (French, medium)", family: "vits", archive: "vits-piper-fr_FR-upmc-medium", sizeMB: 80, languages: "French", note: "A second French voice, two speakers (Jessica and Pierre).", voices: [{ sid: 0, name: "Jessica" }, { sid: 1, name: "Pierre" }] },
  { id: "tts-piper-en-lessac-high", kind: "tts", name: "Piper Lessac (English, high quality)", family: "vits", archive: "vits-piper-en_US-lessac-high", sizeMB: 115, languages: "English", note: "The high-quality Piper build: clear and steady." },
  { id: "tts-piper-fr", kind: "tts", name: "Piper Siwis (French)", family: "vits", archive: "vits-piper-fr_FR-siwis-medium", sizeMB: 75, languages: "French", note: "Light French voice." },
  { id: "tts-piper-en", kind: "tts", name: "Piper Amy (English)", family: "vits", archive: "vits-piper-en_US-amy-low", sizeMB: 65, languages: "English", note: "Very light and fast, flatter than Kokoro." }
];

export function voiceModelUrl(m: VoiceModel): string {
  return `${RELEASES}/${m.kind === "stt" ? "asr-models" : "tts-models"}/${m.archive}.tar.bz2`;
}

export function voiceModel(id: string | null | undefined): VoiceModel | undefined {
  return VOICE_MODELS.find((m) => m.id === id);
}

export function defaultVoiceModel(kind: "stt" | "tts"): VoiceModel {
  return VOICE_MODELS.find((m) => m.kind === kind && m.default)!;
}

export const DEFAULT_VOICE_SETTINGS = {
  sttModelId: null as string | null,
  ttsModelId: null as string | null,
  ttsSid: 0,
  ttsSpeed: 1.0,
  readAloud: false,
  allowInterrupt: true,
  autoSend: true,
  sttLanguage: "",
  sttCompute: "cpu" as "cpu" | "npu",
  ttsCompute: "cpu" as "cpu" | "npu",
  minLevel: 0.015,
  interruptLevel: 0.056,
  interruptMs: 1000,
  micDeviceId: "",
  minSpeechMs: 300,
  endSilenceMs: 700,
  smartEnd: true,
  liveText: true,
  voiceModelId: "",
  waitMs: 2500
};

/** The range each microphone setting can take: the settings page and the saved values are held to it. */
export const VOICE_LIMITS = {
  minLevel: { min: 0.002, max: 0.125 },
  minSpeechMs: { min: 80, max: 2000 },
  endSilenceMs: { min: 200, max: 4000 },
  waitMs: { min: 500, max: 10000 },
  interruptLevel: { min: 0.01, max: 0.125 },
  interruptMs: { min: 200, max: 4000 }
} as const;

export function clampVoice<K extends keyof typeof VOICE_LIMITS>(key: K, v: number): number {
  const l = VOICE_LIMITS[key];
  return Math.min(l.max, Math.max(l.min, Number.isFinite(v) ? v : DEFAULT_VOICE_SETTINGS[key]));
}

// ---------------------------------------------------------------- sherpa-onnx configs

/** Paths found in an extracted model folder; directories end with "/". */
export type FileList = string[];

function pick(files: FileList, re: RegExp, preferInt8 = true): string | undefined {
  const hits = files.filter((f) => re.test(f.replace(/\\/g, "/").split("/").pop()!));
  if (!hits.length) return undefined;
  if (preferInt8) {
    const q = hits.find((f) => /int8/i.test(f));
    if (q) return q;
  }
  return hits.sort((a, b) => a.length - b.length)[0];
}

function need(v: string | undefined, what: string): string {
  if (!v) throw new Error(`Voice model folder is missing ${what}. Delete the model and download it again.`);
  return v;
}

const THREADS = 4;

/** sherpa-onnx provider name for a compute target. "qnn" is the Qualcomm NPU execution provider. */
export const providerFor = (c: "cpu" | "npu") => (c === "npu" ? "qnn" : "cpu");

/** Recognizer config for sherpa-onnx-node. */
export function sttConfig(m: VoiceModel, files: FileList, language = "", compute: "cpu" | "npu" = "cpu"): Record<string, unknown> {
  const tokens = need(pick(files, /tokens\.txt$/, false), "tokens.txt");
  const base = { tokens, numThreads: THREADS, provider: providerFor(compute), debug: 0 };
  const feat = { sampleRate: 16000, featureDim: 80 };
  switch (m.family) {
    case "whisper":
      return {
        featConfig: feat,
        modelConfig: {
          ...base,
          whisper: {
            encoder: need(pick(files, /encoder.*\.onnx$/), "the encoder"),
            decoder: need(pick(files, /decoder.*\.onnx$/), "the decoder"),
            language: m.id.includes("-en") ? "en" : language,
            task: "transcribe",
            tailPaddings: -1
          }
        }
      };
    case "moonshine":
      return {
        featConfig: feat,
        modelConfig: {
          ...base,
          moonshine: {
            preprocessor: need(pick(files, /preprocess.*\.onnx$/), "the preprocessor"),
            encoder: need(pick(files, /^encode.*\.onnx$/), "the encoder"),
            uncachedDecoder: need(pick(files, /uncached_decode.*\.onnx$/), "the uncached decoder"),
            cachedDecoder: need(pick(files, /^cached_decode.*\.onnx$/), "the cached decoder")
          }
        }
      };
    case "transducer":
      return {
        featConfig: feat,
        modelConfig: {
          ...base,
          transducer: {
            encoder: need(pick(files, /^encoder.*\.onnx$/), "the encoder"),
            decoder: need(pick(files, /^decoder.*\.onnx$/), "the decoder"),
            joiner: need(pick(files, /^joiner.*\.onnx$/), "the joiner")
          },
          modelType: "nemo_transducer"
        }
      };
    default:
      throw new Error(`${m.family} is not a speech-to-text family`);
  }
}

export function ttsConfig(m: VoiceModel, files: FileList, compute: "cpu" | "npu" = "cpu"): Record<string, unknown> {
  const tokens = need(pick(files, /tokens\.txt$/, false), "tokens.txt");
  const dataDir = files.find((f) => /(^|[\\/])espeak-ng-data[\\/]?$/.test(f));
  const common = { numThreads: THREADS, provider: providerFor(compute), debug: 0, maxNumSentences: 1 };
  if (m.family === "kokoro") {
    const lexicons = files.filter((f) => /lexicon.*\.txt$/.test(f.split(/[\\/]/).pop()!));
    return {
      ...common,
      model: {
        ...common,
        kokoro: {
          model: need(pick(files, /^model.*\.onnx$/), "the model"),
          voices: need(pick(files, /^voices\.bin$/, false), "voices.bin"),
          tokens,
          ...(dataDir ? { dataDir: dataDir.replace(/[\\/]$/, "") } : {}),
          ...(lexicons.length ? { lexicon: lexicons.join(",") } : {})
        }
      }
    };
  }
  if (m.family === "vits") {
    const model = need(files.find((f) => /\.onnx$/.test(f) && !/int8/.test(f)) ?? pick(files, /\.onnx$/), "the model");
    return {
      ...common,
      model: { ...common, vits: { model, tokens, ...(dataDir ? { dataDir: dataDir.replace(/[\\/]$/, "") } : {}) } }
    };
  }
  throw new Error(`${m.family} is not a text-to-speech family`);
}
