import type { SetupState, StepId } from "../core/setup";
import {
  SpeakChunk, VoiceDownloadProgress, VoiceModelView, VoiceSettings, VoiceStatus,
  BrowseQuery, BrowseResult, BrowseVariant, ResolveResult, CatalogEntry, ChatEvent, ChatMessage, ChatOptions, FriendlyError, HardwareProfile, HfInspection, HfSearchResult,
  InstallProgress, InstalledModel, Meters, ServerStatus, Settings, Verdict, Project, Artifact, ScheduledTask, RunEvent
} from "./types";

export interface CatalogItem {
  entry: CatalogEntry;
  verdict: Verdict;
  hidden: boolean;
  installed: boolean;
  /** "<repo>:<quant>" argument for geniex. */
  ref: string;
  custom: boolean;
  /** Where this model was seen to run on this PC: all on the NPU, NPU and CPU together, or the CPU only. Unknown until it was tried. */
  runsOn?: "npu" | "hybrid" | "cpu";
}

export interface NpuPlanView {
  lines: { role: "chat" | "stt" | "tts"; name: string; onNpu: boolean; gb: number }[];
  budgetGB: number;
  usableGB: number;
  totalGB: number;
  fits: boolean;
  advice: string | null;
}

export interface UpdateState {
  status: "idle" | "checking" | "current" | "downloading" | "ready" | "error";
  version: string | null;
  percent: number | null;
  error: string | null;
}

export interface AppInfo {
  version: string;
  arch: string;
  platform: string;
  geniexPath: string | null;
  geniexVersion: string | null;
  geniexVersionWarning: string | null;
  problems: string[];
}

/** The bridge exposed on window.opennpu by the preload script. */
export interface OpenNpuApi {
  appInfo(): Promise<AppInfo>;
  hardware(refresh?: boolean): Promise<HardwareProfile>;
  catalog(): Promise<CatalogItem[]>;
  installed(): Promise<InstalledModel[]>;
  /** The Dynamic model: its sizes, which model does which kind of task (with the developer's changes), what is known, and what is missing. */
  dynamicInfo(): Promise<{ data: import("../core/dynamic").DynamicData; speeds: Record<string, number>; profile: string; autoProfile: string; installedRefs: string[]; runsOn: Record<string, "npu" | "hybrid" | "cpu">; missing: Record<string, string[]> }>;
  /** The memory configuration the Dynamic packs are shown for (16, 24 or 32 GB). */
  setDynamicProfile(id: string): Promise<void>;
  /** Installs the models of a Dynamic pack that are not there yet. Progress arrives through onDynamicInstall. */
  installDynamic(tier: string): Promise<void>;
  onDynamicInstall(cb: (p: { tier: string; name: string; step: number; total: number; phase: "start" | "done" | "error"; error?: string }) => void): () => void;
  /** The benchmark (Developer settings): the models worth testing here, the number of tests, and where results are written. */
  benchRoster(): Promise<{ targets: (import("../core/bench").BenchTarget & { installed: boolean; tested: boolean })[]; tests: { express: number; quick: number; full: number }; costs: Record<"express" | "quick" | "full", import("../core/benchEstimate").TestCost[]>; freeGB: number | null; folder: string }>;
  benchState(): Promise<import("../core/benchRunner").BenchState>;
  benchStart(cfg: import("../core/benchRunner").BenchConfig): Promise<{ ok: boolean; error?: string }>;
  benchStop(): Promise<void>;
  /** The NPU load test (Developer settings): installed models (those that failed in a benchmark first), start, stop, and its log. */
  npuTestRoster(): Promise<{ id: string; name: string; sizeGB: number; failedBefore: boolean }[]>;
  npuTestState(): Promise<{ running: boolean; lines: string[]; results: import("../core/npuTest").LoadAttempt[] }>;
  npuTestStart(ids: string[], all: boolean, hybrid: boolean): Promise<{ ok: boolean; error?: string }>;
  npuTestStop(): Promise<void>;
  /** Stops geniex and restarts the NPU device node (Windows asks for permission): what a failed load can need, instead of restarting the PC. */
  npuReset(): Promise<{ ok: boolean; message: string }>;
  /** Whether the automatic reset was allowed (the one-time Windows permission) and is on. */
  /** The app found the NPU holding memory with nothing running and is resetting it before loading a model. */
  onNpuClean(cb: (p: { phase: "start" | "done"; gb?: number; ok?: boolean; message?: string }) => void): () => void;
  npuResetStatus(): Promise<{ ready: boolean; auto: boolean }>;
  /** A model the app did not know was installed and is being loaded under the best setting this PC accepts, then badged. */
  onModelCheck(cb: (p: { ref: string; phase: "testing" | "done" | "failed"; step?: string; badge?: "npu" | "hybrid" | "cpu" }) => void): () => void;
  onNpuTest(cb: (s: { running: boolean; lines: string[]; results: import("../core/npuTest").LoadAttempt[] }) => void): () => void;
  /** The finished models of the run (answers left out), for the charts and statistics. */
  benchResults(): Promise<import("../core/bench").ModelResult[]>;
  /** Writes the report to publish (Markdown, HTML, charts, CSV, raw answers) next to the results and shows it in the file manager. */
  benchExport(): Promise<{ ok: boolean; error?: string; dir?: string; report?: string; html?: string }>;
  /** Shows a result file in the file manager, or the results folder when null. */
  benchReveal(file: string | null): Promise<boolean>;
  onBench(cb: (s: import("../core/benchRunner").BenchState) => void): () => void;
  /** The words the model under test is writing, as it writes them. */
  onBenchLive(cb: (l: import("../core/benchRunner").BenchLive) => void): () => void;
  hfSearch(query: string): Promise<HfSearchResult[]>;
  /** Whatever was pasted (link, command, repo id, name): a model is opened and judged, anything else comes back as a search. */
  resolveModel(input: string): Promise<ResolveResult>;
  /** The Explore browser: models from every chosen source, estimated against this machine. */
  browse(q: BrowseQuery): Promise<BrowseResult>;
  /** The versions (size, quant) of one Docker Hub model. */
  dockerVariants(name: string): Promise<BrowseVariant[]>;
  install(entry: CatalogEntry): Promise<void>;
  cancelInstall(ref: string): Promise<void>;
  uninstall(entry: CatalogEntry): Promise<{ ok: boolean; message: string }>;
  selectModel(id: string): Promise<void>;
  server(): Promise<ServerStatus>;
  stopServer(): Promise<void>;
  serverLog(): Promise<string[]>;
  chat(id: string, modelId: string, messages: ChatMessage[], opts: ChatOptions): Promise<void>;
  abortChat(id: string): Promise<void>;
  settings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  pickGeniex(): Promise<string | null>;
  openGeniexDownload(): Promise<void>;
  meters(): Promise<Meters>;
  /** What Windows exposes about the NPU (counter sets, sample values, why nothing is read), for the meters that show n/a. */
  npuDiagnostics(): Promise<{ ok: boolean; problem: string | null; windows: string | null; windowsHasNpuMonitoring: boolean | null; sets: string[]; adapter: string | null; adapters: string[]; topUtil: string[]; allSets: string[]; sample: string[]; util: number | null; memGB: number | null }>;
  setupState(): Promise<SetupState>;
  setupSkip(id: StepId): Promise<void>;
  setupRetry(id: StepId): Promise<void>;
  setupDismiss(): Promise<void>;
  onSetup(cb: (s: SetupState) => void): () => void;
  updateState(): Promise<UpdateState>;
  updateCheck(): Promise<UpdateState>;
  updateInstall(): Promise<void>;
  onUpdate(cb: (s: UpdateState) => void): () => void;
  npuPlan(): Promise<NpuPlanView>;
  voiceModels(): Promise<VoiceModelView[]>;
  voiceStatus(): Promise<VoiceStatus>;
  voiceDownload(id: string): Promise<void>;
  voiceCancelDownload(id: string): Promise<void>;
  voiceRemove(id: string): Promise<void>;
  /** Load the models named in settings, honoring each CPU / NPU switch. */
  voiceApply(): Promise<VoiceStatus>;
  transcribe(samples: Float32Array, sampleRate: number): Promise<string>;
  speak(id: string, text: string): Promise<void>;
  cancelSpeak(id: string): Promise<void>;
  saveVoice(patch: Partial<VoiceSettings>): Promise<Settings>;
  onVoiceDownload(cb: (p: VoiceDownloadProgress) => void): () => void;
  onVoiceAudio(cb: (c: SpeakChunk) => void): () => void;
  onVoiceStatus(cb: (s: VoiceStatus) => void): () => void;
  projects(): Promise<Project[]>;
  saveProject(p: Project): Promise<Project[]>;
  deleteProject(id: string): Promise<Project[]>;
  artifacts(): Promise<Artifact[]>;
  /** Insert or update; chat artifacts use a stable id so a regenerated answer replaces the old one. */
  saveArtifact(a: Artifact): Promise<Artifact[]>;
  deleteArtifact(id: string): Promise<Artifact[]>;
  /** Writes the artifact to a file the user chooses. Resolves to the path, or null if cancelled. */
  exportArtifact(id: string): Promise<string | null>;
  /** Runs a code artifact (Python, JavaScript) on this computer. Output arrives through onRun; resolves when it started or could not start. */
  runCode(runId: string, language: string, code: string): Promise<void>;
  /** Writes the files of a site to a folder and opens its page in the default browser. `entry` is the file to start from. */
  launchSite(files: { title: string; kind: string; language: string; content: string }[], entry: { title: string; kind: string; language: string; content: string }): Promise<{ path?: string; error?: string }>;
  /** The preview frame tried to go to another page of the site (a script set location, or a link was followed). */
  onSiteNav(cb: (to: string) => void): () => void;
  stopRun(runId: string): Promise<void>;
  onRun(cb: (e: RunEvent) => void): () => void;
  tasks(): Promise<ScheduledTask[]>;
  saveTask(t: ScheduledTask): Promise<ScheduledTask[]>;
  deleteTask(id: string): Promise<ScheduledTask[]>;
  runTask(id: string): Promise<void>;
  onTasks(cb: (t: ScheduledTask) => void): () => void;
  onArtifacts(cb: () => void): () => void;
  onInstall(cb: (p: InstallProgress) => void): () => void;
  onChat(cb: (e: ChatEvent) => void): () => void;
  onServer(cb: (s: ServerStatus) => void): () => void;
}

export type { FriendlyError };
