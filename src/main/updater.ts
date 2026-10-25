import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateState } from "../shared/api";

const HOUR = 60 * 60 * 1000;

/**
 * Keeps the installed app current from the GitHub "latest" release (the CI publishes
 * latest.yml next to the installer there). Checks at start and every few hours, downloads
 * in the background and installs when the app quits, or at once if the user clicks.
 */
export class Updater {
  private state: UpdateState = { status: "idle", version: null, percent: null, error: null };
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly onState: (s: UpdateState) => void) {
    autoUpdater.setFeedURL({ provider: "generic", url: "https://github.com/disposablecameraapp/Open-NPU/releases/download/latest" });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => this.set({ status: "checking", error: null }));
    autoUpdater.on("update-available", (i) => this.set({ status: "downloading", version: i.version, percent: 0 }));
    autoUpdater.on("update-not-available", () => this.set({ status: "current", percent: null }));
    autoUpdater.on("download-progress", (p) => this.set({ status: "downloading", percent: Math.round(p.percent) }));
    autoUpdater.on("update-downloaded", (i) => this.set({ status: "ready", version: i.version, percent: 100 }));
    autoUpdater.on("error", (e) => this.set({ status: "error", error: e?.message ?? String(e) }));
  }

  get current(): UpdateState { return this.state; }

  /** Only a packaged build can update itself. */
  get enabled(): boolean { return app.isPackaged && process.platform === "win32"; }

  start(): void {
    if (!this.enabled) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), 4 * HOUR);
  }

  stop(): void { if (this.timer) clearInterval(this.timer); }

  async check(): Promise<UpdateState> {
    if (!this.enabled || this.state.status === "checking" || this.state.status === "downloading" || this.state.status === "ready") return this.state;
    try { await autoUpdater.checkForUpdates(); } catch (e) { this.set({ status: "error", error: (e as Error).message }); }
    return this.state;
  }

  install(): void {
    if (this.state.status === "ready") autoUpdater.quitAndInstall(true, true);
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }
}
