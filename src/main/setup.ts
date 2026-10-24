import { EventEmitter } from "events";
import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GENIEX_INSTALLER_URL, SetupState, SetupStep, StepId, initialSteps, locateGeniex } from "../core/setup";
import { downloadFile } from "./download";

export interface GeniexInstallDeps {
  download(url: string, dest: string, onPercent: (p: number | null) => void): Promise<void>;
  /** Run the downloaded installer, resolve with its exit code and everything it printed. */
  run(exe: string): Promise<{ code: number; output: string }>;
  exists(p: string): boolean;
  env: NodeJS.ProcessEnv;
  tmpDir: string;
  url?: string;
}

/**
 * Download Qualcomm's installer and run it. Its flags are not documented anywhere reachable,
 * so it runs with none: any window it shows is Qualcomm's own. Afterwards geniex.exe is looked
 * for in the paths the installer printed, the documented folder and PATH.
 */
export async function installGeniex(d: GeniexInstallDeps, progress: (percent: number | null, message: string) => void): Promise<string> {
  fs.mkdirSync(d.tmpDir, { recursive: true });
  const dest = path.join(d.tmpDir, "geniex-cli.exe");
  progress(0, "Downloading GenieX from Qualcomm…");
  await d.download(d.url ?? GENIEX_INSTALLER_URL, dest, (p) => progress(p, "Downloading GenieX from Qualcomm…"));
  progress(null, "Running the GenieX installer… (a Qualcomm window may appear; follow it if so)");
  const r = await d.run(dest);
  const found = locateGeniex(r.output, d.env, d.exists);
  if (found) return found;
  const tail = r.output.trim().split(/\r?\n/).slice(-6).join(" | ").slice(0, 400);
  throw new Error(
    r.code === 0
      ? `The installer finished but geniex.exe was not found. Open a new terminal and run "geniex version", then use Settings → Locate geniex.exe. Installer said: ${tail || "(nothing)"}`
      : `The GenieX installer stopped with code ${r.code}. Installer said: ${tail || "(nothing)"}`
  );
}

export const realGeniexDeps = (): GeniexInstallDeps => ({
  download: (url, dest, cb) => downloadFile(url, dest, cb),
  run: (exe) => new Promise((resolve) => {
    execFile(exe, [], { windowsHide: false, timeout: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof (err as any).code === "number" ? (err as any).code : 1) : 0, output: `${stdout}${stderr}` });
    });
  }),
  exists: fs.existsSync,
  env: process.env,
  tmpDir: path.join(os.tmpdir(), "open-npu-setup")
});

export interface SetupOps {
  /** Path of geniex.exe if it is installed. */
  geniexPath(): string | null;
  /** Install GenieX, return the path found. */
  installGeniex(progress: (percent: number | null, message: string) => void): Promise<string>;
  onGeniexInstalled(path: string): void;
  voiceNeeds(): { stt: boolean; tts: boolean; sttName: string; ttsName: string };
  /** Download + select the default model of that kind. */
  installVoice(kind: "stt" | "tts", progress: (percent: number | null, message: string) => void): Promise<void>;
}

/**
 * First-launch setup: whatever is missing (GenieX, default dictation and read-aloud models) is
 * installed straight away, in order, with progress; failures are shown with a Retry, never block the app.
 */
export class SetupService extends EventEmitter {
  private state: SetupState = { active: false, steps: [] };
  private running = false;
  private skipped = new Set<StepId>();

  constructor(private ops: SetupOps) { super(); }

  status(): SetupState { return { active: this.state.active, steps: this.state.steps.map((s) => ({ ...s })) }; }

  private emitState() { this.emit("state", this.status()); }
  private step(id: StepId) { return this.state.steps.find((s) => s.id === id)!; }
  private set(id: StepId, p: Partial<SetupStep>) { Object.assign(this.step(id), p); this.emitState(); }

  /** Work out what is missing; true when there is something to do. */
  check(): boolean {
    const v = this.ops.voiceNeeds();
    const prev = new Map(this.state.steps.map((s) => [s.id, s.state]));
    const steps = initialSteps({ geniex: !this.ops.geniexPath(), stt: v.stt, tts: v.tts }, { stt: v.sttName, tts: v.ttsName });
    for (const s of steps) if (this.skipped.has(s.id) && s.state === "pending") s.state = "skipped";
    void prev;
    this.state = { active: steps.some((s) => s.state === "pending"), steps };
    this.emitState();
    return this.state.active;
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const s of this.state.steps) {
        if (s.state !== "pending" && s.state !== "error") continue;
        this.set(s.id, { state: "running", percent: null, message: "Starting…", error: null });
        try {
          const progress = (percent: number | null, message: string) => this.set(s.id, { percent, message });
          if (s.id === "geniex") this.ops.onGeniexInstalled(await this.ops.installGeniex(progress));
          else await this.ops.installVoice(s.id === "voice-stt" ? "stt" : "tts", progress);
          this.set(s.id, { state: "done", percent: 100, message: "Installed" });
        } catch (e) {
          this.set(s.id, { state: "error", percent: null, message: null, error: (e as Error).message });
        }
      }
    } finally {
      this.running = false;
      this.state.active = this.state.steps.some((x) => x.state === "pending" || x.state === "running" || x.state === "error");
      this.emitState();
    }
  }

  skip(id: StepId) {
    this.skipped.add(id);
    if (this.step(id).state !== "running") this.set(id, { state: "skipped", error: null, message: "Skipped" });
    this.state.active = this.state.steps.some((x) => x.state === "pending" || x.state === "running" || x.state === "error");
    this.emitState();
  }

  retry(id: StepId) {
    this.skipped.delete(id);
    this.set(id, { state: "pending", error: null, message: null });
    this.state.active = true;
    this.emitState();
    void this.run();
  }

  dismiss() { this.state.active = false; this.emitState(); }
}
