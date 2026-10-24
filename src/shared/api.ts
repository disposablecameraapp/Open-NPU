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
}

export interface NpuPlanView {
  lines: { role: "chat" | "stt" | "tts"; name: string; onNpu: boolean; gb: number }[];
  budgetGB: number;
  usableGB: number;
  totalGB: number;
  fits: boolean;
  advice: string | null;
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
  setupState(): Promise<SetupState>;
  setupSkip(id: StepId): Promise<void>;
  setupRetry(id: StepId): Promise<void>;
  setupDismiss(): Promise<void>;
  onSetup(cb: (s: SetupState) => void): () => void;
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
