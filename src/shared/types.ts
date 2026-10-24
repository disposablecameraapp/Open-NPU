// Types shared by core, main process and renderer.

export type Engine = "llama_cpp" | "qairt";
export type Level = "green" | "amber" | "red";
export type ComputeTarget = "cpu" | "gpu" | "npu" | "hybrid";

export interface Sampling {
  temperature: number;
  top_p: number;
  top_k?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  max_tokens: number;
}

export interface HardwareProfile {
  chipName: string;
  /** X1 family = Hexagon HTP v73, X2 = v81 (spec: "Snapdragon X2 profiles" is later work). */
  chipFamily: "x1" | "x2" | "unknown";
  isSnapdragon: boolean;
  ramGB: number;
  npuDetected: boolean;
  npuDriverVersion: string | null;
  /** NPU shared memory ceiling in GB. */
  npuBudgetGB: number;
  /** "measured" = read from the machine or entered by the user; "estimated" = about half of RAM. */
  npuBudgetSource: "measured" | "estimated" | "user";
  detectedAt: string;
  /** Architecture of THIS app process. Open NPU must run native arm64 on Windows. */
  appArch: string;
  /** True when the machine is ARM64 but the app runs emulated (x64). Blocks nothing, but is shown as an error. */
  emulated: boolean;
}

export interface KvShape {
  /** Layers that hold a KV cache (attention layers only; hybrids have few). */
  attentionLayers: number;
  kvHeads: number;
  headDim: number;
}

export interface Verdict {
  level: Level;
  /** One-line reasons, most important first. */
  reasons: string[];
  /** Context size the app will launch the server with. */
  contextTokens: number;
  estNpuGB: number;
  estTokPerSec: number | null;
  /** Install is always allowed (spec: a warning, never a block). */
  installAllowed: true;
}

export interface CatalogEntry {
  id: string;
  name: string;
  /** Hugging Face repo, or AI Hub repo for native bundles. */
  repo: string;
  quant: string | null;
  engine: Engine;
  role: string;
  architecture: string;
  sizeGB: number;
  sizeApprox?: boolean;
  paramsB?: number;
  isMoe?: boolean;
  kv?: KvShape;
  /** Largest context that was actually run on the 7.8 GB test machine. */
  maxTestedContext?: number;
  recommendedContext: number;
  sampling: Sampling;
  measured?: { tokPerSec: number; ttftSec: number };
  testNote?: string;
  /** Needs a newer NPU driver (native bundles above ~1.7B on 30.0.220.3000). */
  needsNewerDriver?: boolean;
  excluded?: boolean;
  excludeReason?: string;
  /** Default model flag per use. */
  default?: boolean;
}

export interface InstalledModel {
  name: string;
  /** Argument for `geniex infer/pull`, "<repo>:<quant>" when known. */
  ref: string;
  sizeGB?: number;
}

export type ServerState = "stopped" | "starting" | "ready" | "restarting" | "failed";

export interface ServerStatus {
  state: ServerState;
  endpoint: string;
  nctx: number | null;
  compute: ComputeTarget;
  restarts: number;
  lastError: FriendlyError | null;
  pid: number | null;
}

export interface FriendlyError {
  id: string;
  title: string;
  fix: string;
  raw: string;
}

export interface InstallProgress {
  ref: string;
  phase: "checking" | "downloading" | "done" | "error" | "cancelled";
  percent: number | null;
  line?: string;
  error?: FriendlyError;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatStats {
  ttftSec: number | null;
  tokPerSec: number | null;
  tokens: number;
  totalSec: number;
}

export type ChatEvent =
  | { id: string; type: "thinking"; text: string }
  | { id: string; type: "answer"; text: string }
  | { id: string; type: "done"; stats: ChatStats }
  | { id: string; type: "error"; error: FriendlyError };

export interface Meters {
  ramPercent: number;
  ramUsedGB: number;
  ramTotalGB: number;
  /** null when Windows exposes no counter for it on this machine. */
  npuMemGB: number | null;
  npuBudgetGB: number;
  npuUtilPercent: number | null;
  ramWarning: boolean;
}

export interface Settings {
  geniexPath: string | null;
  npuBudgetOverrideGB: number | null;
  /** Shown K-quants / IQ quants in search (spec: hide unless the user opts in). */
  showKQuants: boolean;
  compute: ComputeTarget;
  keepaliveSec: number;
  selectedModelId: string | null;
  pinnedGeniexVersion: string | null;
  voice: VoiceSettings;
}

export interface HfSearchResult {
  repo: string;
  downloads: number;
  likes: number;
  updated: string | null;
}

export interface HfInspection {
  repo: string;
  files: { path: string; sizeBytes: number }[];
  chosen: { path: string; quant: string; sizeGB: number; note: string | null } | null;
  gguf: GgufInfo | null;
  verdict: Verdict | null;
  entry: CatalogEntry | null;
  notes: string[];
}

export interface GgufInfo {
  architecture: string;
  name: string | null;
  blockCount: number | null;
  attentionLayers: number | null;
  headCount: number | null;
  kvHeads: number | null;
  headDim: number | null;
  contextLength: number | null;
  expertCount: number | null;
  paramsB: number | null;
}

// ---------------------------------------------------------------- voice

export type VoiceKind = "stt" | "tts";
export type VoiceFamily = "whisper" | "moonshine" | "transducer" | "kokoro" | "vits";

export interface VoiceModel {
  id: string;
  kind: VoiceKind;
  name: string;
  family: VoiceFamily;
  /** Release archive name without ".tar.bz2" (k2-fsa/sherpa-onnx releases). */
  archive: string;
  sizeMB: number;
  languages: string;
  note: string;
  default?: boolean;
  /** Named speaker ids when known; otherwise the UI offers a numeric voice with a preview button. */
  voices?: { sid: number; name: string }[];
  /** Numeric sid range for models whose voice names are not listed here. */
  sidCount?: number;
}

export interface VoiceModelView {
  model: VoiceModel;
  installed: boolean;
}

export interface VoiceSettings {
  sttModelId: string | null;
  ttsModelId: string | null;
  ttsSid: number;
  ttsSpeed: number;
  /** Read every answer aloud. */
  readAloud: boolean;
  /** Voice chat: speaking over the assistant stops it. */
  allowInterrupt: boolean;
  /** Voice chat: send the transcription right away. */
  autoSend: boolean;
  /** Language hint for multilingual dictation; "" = auto-detect. */
  sttLanguage: string;
  /** Where each voice model runs. CPU keeps the NPU free for the chat model; NPU is faster if it fits. */
  sttCompute: "cpu" | "npu";
  ttsCompute: "cpu" | "npu";
}

export interface VoiceStatus {
  worker: "off" | "starting" | "ready" | "failed";
  stt: string | null;
  tts: string | null;
  /** Provider actually in use; differs from the setting when the NPU load failed and CPU took over. */
  sttProvider: "cpu" | "npu" | null;
  ttsProvider: "cpu" | "npu" | null;
  /** Plain-words note, e.g. why a model fell back to the CPU. */
  notice: string | null;
  ttsSampleRate: number | null;
  error: FriendlyError | null;
}

export interface VoiceDownloadProgress {
  id: string;
  phase: "downloading" | "extracting" | "done" | "error" | "cancelled";
  percent: number | null;
  error?: FriendlyError;
}

export interface SpeakChunk {
  id: string;
  samples: Float32Array;
  sampleRate: number;
  done: boolean;
}
