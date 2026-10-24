import type { SetupState, StepId } from "../core/setup";
import {
  SpeakChunk, VoiceDownloadProgress, VoiceModelView, VoiceSettings, VoiceStatus,
  CatalogEntry, ChatEvent, ChatMessage, FriendlyError, HardwareProfile, HfInspection, HfSearchResult,
  InstallProgress, InstalledModel, Meters, ServerStatus, Settings, Verdict
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
  hfInspect(input: string): Promise<HfInspection>;
  install(entry: CatalogEntry): Promise<void>;
  cancelInstall(ref: string): Promise<void>;
  uninstall(entry: CatalogEntry): Promise<{ ok: boolean; message: string }>;
  selectModel(id: string): Promise<void>;
  server(): Promise<ServerStatus>;
  stopServer(): Promise<void>;
  serverLog(): Promise<string[]>;
  chat(id: string, modelId: string, messages: ChatMessage[]): Promise<void>;
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
  onInstall(cb: (p: InstallProgress) => void): () => void;
  onChat(cb: (e: ChatEvent) => void): () => void;
  onServer(cb: (s: ServerStatus) => void): () => void;
}

export type { FriendlyError };
