// Types shared by core, main process and renderer.

export type Engine = "llama_cpp" | "qairt";
/** Where a model comes from. */
export type SourceId = "hf" | "docker" | "modelscope" | "aihub";
export type Level = "green" | "amber" | "red";
export type ComputeTarget = "cpu" | "gpu" | "npu" | "hybrid";

/** A job in building files that can be given to a model of its own. */
export type WriterRole = "plan" | "html" | "css" | "js";

export interface Sampling {
  temperature: number;
  top_p: number;
  top_k?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
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
  /** Where it was found; Hugging Face when missing. */
  source?: SourceId;
  /** The Dynamic bundle model this entry was installed for, so the app knows it is that one whatever its repo is called. */
  dynamicRef?: string;
  /** A model run by Microsoft Foundry Local: the hardware its build is made for. */
  foundryDevice?: "NPU" | "GPU" | "CPU";
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

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  /** A plain string, or parts when the message carries images (OpenAI format). */
  content: string | ContentPart[];
}

/** How much the model thinks before it answers. Off only exists for models whose template can switch it off. */
export type Effort = "off" | "low" | "medium" | "high";

export interface ChatOptions {
  effort: Effort | null;
  /** Let the model hand work to sub-agents. */
  subagents: boolean;
  /** First message of a chat: name the chat before answering. */
  title?: boolean;
  /** The project the chat belongs to: its folder, if any, can be explored. */
  projectId?: string | null;
}

/** A file the user added to a message. Images keep their data URL in memory only, never in saved chats. */
export interface Attachment {
  name: string;
  kind: "text" | "image";
  size: number;
  text?: string;
  dataUrl?: string;
}

export interface AgentCall { name: string; task: string }

export interface AgentRun extends AgentCall {
  index: number;
  status: "running" | "done" | "error";
  output: string;
  error?: string;
  /** "web" = a web search, shown as a search card instead of a sub-agent card. */
  kind?: "web";
}

/** One line of the code check shown under an answer: what ran, what failed, what the reviewer changed. */
export interface ReviewStep {
  text: string;
  kind: "info" | "error" | "ok";
  /** The lines this step changed, as "- old / + new" rows: the code is always there to read. */
  diff?: string;
}

export interface ReviewRun {
  status: "running" | "done";
  steps: ReviewStep[];
  /** Small screenshots of the page after the keys and buttons were pressed (data URLs). Not saved with the chat. */
  shots?: string[];
}

/** The automatic improve loop: round by round, what was changed and what was thrown away. */
export interface LoopRun {
  status: "running" | "done";
  /** The round being worked on (1-based) and how many there can be. */
  round: number;
  rounds: number;
  /** When the time budget ends (epoch ms). */
  endsAt: number;
  accepted: number;
  steps: ReviewStep[];
}

/** One stage of the work on a file, or of the test run: what it is, how it went, how long it took. */
export interface BuildStage {
  /** "skeleton" | "spec" | "write" | "edit" | "check" | "run" | "fix" */
  id: string;
  label: string;
  status: "running" | "done" | "error" | "skipped";
  note?: string;
  sec?: number;
  /** A small screenshot of the page after it was run (data URL). Not saved with the chat. */
  shot?: string;
  /** The file this stage is working on: the chat opens its panel on it while the stage runs. */
  file?: string;
  /** The helper that does this stage ("Writer", "Fixer", "Tester"...) and the model it runs on (none for the tester: it runs the page here). */
  agent?: string;
  model?: string;
  /** When the stage started (ms since 1970): the chat counts the running time itself, so the clock moves even while the model is silent. */
  at?: number;
}

/** One file of a build: written new, or changed by edit blocks on the lines concerned. */
export interface BuildStep {
  file: string;
  action: "new" | "edit";
  job: string;
  status: "waiting" | "running" | "done" | "error";
  note?: string;
  /** What an edit changed, as "- old / + new" rows. */
  diff?: string;
  /** The stages this file went through, in order: starting point, rules, writing, check, fix. */
  stages?: BuildStage[];
}

/** Work on files split into short sessions of their own: the plan and how each file is going. */
export interface BuildRun {
  status: "running" | "done";
  steps: BuildStep[];
  /** What is happening right now, in a sentence the chat shows prominently ("Planning the files…", "Writing index.html · part 2 of 3"). */
  phase?: string;
  /** The rules written before the code of a program (what the writer is told to follow). */
  spec?: string;
  /** The planner, before there are files: shown as soon as it starts. */
  start?: BuildStage[];
  /** The test run of the finished page: run it, press its keys and buttons, fix what it shows, run it again. */
  verify?: BuildStage[];
}

export interface ChatStats {
  /** Why the model stopped: "stop" = it finished, "length" = the context or the token limit cut it off. */
  finish?: string | null;
  /** From the request to the first token the model sent, thought or word. */
  ttftSec: number | null;
  /** From the request to the first word of the answer: the first token is often a thought, so this is what the person waited for. */
  answerSec?: number | null;
  /** What the app did before the request left: sorting, loading the model, searching. */
  prepSec?: number | null;
  prep?: { name: string; sec: number }[];
  tokPerSec: number | null;
  tokens: number;
  totalSec: number;
}

export type ChatEvent =
  /** A short proper name for the chat, made from its first message. */
  | { id: string; type: "title"; text: string }
  | { id: string; type: "thinking"; text: string }
  | { id: string; type: "answer"; text: string }
  /** The model looped: the answer is cut back to its first `keep` characters, and written again from there. */
  | { id: string; type: "retract"; keep: number }
  /** A sub-agent started, streamed more output, or finished. */
  | { id: string; type: "agent"; agent: AgentRun }
  /** Something was done to the request or the answer that the person should know (older messages left out, a cut answer continued). */
  | { id: string; type: "notice"; text: string }
  /** The improve loop progressed. Carries the whole run so far. */
  | { id: string; type: "loop"; loop: LoopRun }
  /** Files are being built or changed, one session each. Carries the whole run so far. */
  | { id: string; type: "build"; build: BuildRun }
  /** The code check / reviewer progressed. Carries the whole run so far. */
  | { id: string; type: "review"; review: ReviewRun }
  /** The reviewer fixed an artifact: this is the whole answer text from now on. */
  | { id: string; type: "replace"; text: string }
  | { id: string; type: "done"; stats: ChatStats }
  | { id: string; type: "error"; error: FriendlyError };

/** Output of a code artifact run on this computer. */
export type RunEvent = { runId: string; type: "out"; text: string } | { runId: string; type: "exit"; code: number | null; stopped: boolean; error?: string };

export interface Meters {
  ramPercent: number;
  ramUsedGB: number;
  ramTotalGB: number;
  /** null when Windows exposes no counter for it on this machine. */
  npuMemGB: number | null;
  npuBudgetGB: number;
  npuUtilPercent: number | null;
  /** Why the NPU figures are missing, when they are. */
  npuNote?: string | null;
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
  /** Applied to every chat and every scheduled task ("Customize"). */
  customInstructions: string;
  /** Thinking level chosen in the model menu; applied to models that can think. */
  effort: Effort;
  /** Models may delegate to sub-agents. */
  subagents: boolean;
  /** Installed models listed in the quick model menu. Unset = all of them. */
  quickModelIds?: string[];
  /** Run the artifacts the model writes (pages in a hidden window, JS / Python syntax) and send the errors back. */
  autoCheck: boolean;
  /** Bigger, slower model that reads the code and the errors and fixes them. null = the writing model fixes its own errors. */
  reviewerModelId: string | null;
  /** How many check-and-fix rounds at most. */
  reviewRounds: number;
  /** Which model writes what when files are built: the planner, the page, the stylesheet, the script. A role without a model uses the chat model. */
  writers: Partial<Record<WriterRole, string>>;
  /** The Developer tab is shown in Settings. */
  developer: boolean;
  /** Changes to the Dynamic model: which models do which kind of task, and whether the model may be asked to sort a request. */
  /** Models that only load on the NPU under some setting (window, NPU sessions, buffer size), found by the benchmark or the NPU load test: the app starts them that way. */
  /** Models that do not load on the NPU alone may run in hybrid mode (part on the CPU), found by the benchmark or the NPU load test. */
  allowHybridLoad?: boolean;
  /** The NPU is reset by itself when it is stuck (after one permission from Windows). On unless set to false. */
  autoResetNpu?: boolean;
  /** Where each model was seen to run on this PC (by its geniex reference): all on the NPU, NPU and CPU together, or the CPU only. */
  placements?: Record<string, "npu" | "hybrid" | "gpu" | "cpu">;
  loadProfiles?: Record<string, { id: string; label: string; maxCtx?: number; env?: Record<string, string>; compute?: string; at: string; v?: number }>;
  dynamic?: { profile?: string; table?: Record<string, Partial<Record<string, string[]>>>; askModel?: boolean; router?: boolean; routerModel?: string };
  /** The model may search the web (`<websearch>` blocks). */
  webSearch: boolean;
  /** The model may add pictures from Wikimedia Commons to an answer (keywords are sent to Wikimedia when it does). */
  wikimediaImages: boolean;
  /** Search the web for every message before answering, for models too small to ask for it themselves. */
  searchAlways: boolean;
  searchProvider: "duckduckgo" | "brave" | "searxng";
  braveKey: string;
  searxngUrl: string;
  /** A model that reads the pages and keeps the facts, before the writing model answers. null = the writing model reads them. */
  searchModelId: string | null;
  /** After an answer with files, keep improving them round after round. */
  agentLoop: boolean;
  agentRounds: number;
  agentMinutes: number;
  /** What to improve, in the user's words; empty = better in every way. */
  agentGoal: string;
  /** UI size, Ctrl + / Ctrl - / Ctrl 0. */
  uiZoom?: number;
}

// ---- projects, artifacts, scheduled tasks

export interface ProjectFile {
  id: string;
  name: string;
  content: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  /** Standing instructions: how the assistant should behave inside this project. */
  instructions: string;
  /** Knowledge: text the assistant gets as context in every chat of the project. */
  files: ProjectFile[];
  /** A folder on this computer the assistant may explore (read only) in every chat of the project. */
  folder?: string;
  created: number;
  updated: number;
}

export type ArtifactKind = "html" | "svg" | "markdown" | "code";

export interface Artifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  /** Language of a "code" artifact. */
  language: string;
  content: string;
  projectId: string | null;
  source: { type: "chat" | "task" | "manual"; conversationId?: string; taskId?: string };
  created: number;
  updated: number;
}

export type Schedule =
  | { kind: "once"; at: number }
  | { kind: "interval"; everyMin: number }
  | { kind: "daily"; time: string }
  /** days: 0 = Sunday … 6 = Saturday */
  | { kind: "weekly"; days: number[]; time: string };

export interface TaskRun {
  id: string;
  startedAt: number;
  finishedAt: number;
  status: "ok" | "error";
  output: string;
  error?: string;
  artifactIds: string[];
}

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  projectId: string | null;
  /** null = whichever model is selected when it runs. */
  modelId: string | null;
  schedule: Schedule;
  enabled: boolean;
  created: number;
  nextRun: number | null;
  running: boolean;
  runs: TaskRun[];
}

export interface HfSearchResult {
  repo: string;
  downloads: number;
  likes: number;
  updated: string | null;
}

/** The "Explore" browser: models from several sources, estimated against this machine before anything is downloaded. */
export type BrowseSort = "downloads" | "likes" | "trending" | "recent";
/** Which 4-bit family a file belongs to: Q4_0 runs best on the NPU, the other 4-bit quants may use the CPU, the rest is 8-bit and up. */
export type QuantClass = "q4_0" | "other4" | "other";

export interface BrowseQuery {
  query: string;
  sort: BrowseSort;
  /** How many repos to scan on Hugging Face (more = further down the list). */
  limit: number;
  sources: SourceId[];
  /** A repo shows when it has a file in one of these families. Sources that do not list files are not filtered. */
  quants: QuantClass[];
  /** Estimates to show: green = should run, amber = caution, red = unknown or too big (still installable). */
  levels: Level[];
}

export interface BrowseRow {
  source: SourceId;
  repo: string;
  /** What `geniex pull` is given. For Docker Hub a version still has to be picked. */
  ref: string;
  url: string;
  engine: Engine;
  downloads: number;
  likes: number;
  updated: string | null;
  description: string | null;
  paramsB: number | null;
  architecture: string | null;
  isMoe: boolean;
  pipeline: string | null;
  tags: string[];
  /** Context the model was trained for, from the GGUF header. */
  contextLength?: number | null;
  /** Quants found in the file names, e.g. ["Q4_0", "Q8_0"]. */
  quants: string[];
  /** The quant the estimate is made for. */
  quant: string | null;
  hasQ4_0: boolean;
  /** Estimated size of that file. */
  estGB: number | null;
  /** The size and quant are chosen on a second step (Docker Hub tags). */
  needsVersion: boolean;
  /** Estimate at a short context; the exact check runs on "Check and install". */
  verdict: Verdict;
}

/** One downloadable version of a Docker Hub model: size and quant are in its tag. */
export interface BrowseVariant {
  tag: string;
  ref: string;
  quant: string | null;
  paramsB: number | null;
  sizeGB: number | null;
  updated: string | null;
  verdict: Verdict;
}

export interface BrowseResult {
  rows: BrowseRow[];
  /** Repos looked at before the filters. */
  scanned: number;
  /** Repos left out by the filters. */
  hidden: number;
  /** A source that could not be reached, in plain words. */
  notes: string[];
}

/** What a pasted link, command or name turned into. */
export type ResolveResult =
  | { type: "model"; inspection: HfInspection }
  | { type: "search"; query: string; note: string | null };

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
