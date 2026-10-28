import { app } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import { downloadFile } from "./download";
import { autoUpdater } from "electron-updater";
import type { UpdateState } from "../shared/api";

const HOUR = 60 * 60 * 1000;
// The x64 build (normal PCs) has its own installer and update channel next to the ARM64 one.
const X64 = process.arch === "x64";
const FORCE_URL = `https://github.com/disposablecameraapp/Open-NPU/releases/download/latest/Open-NPU-Setup${X64 ? "-x64" : ""}.exe`;

/**
 * Keeps the installed app current from the GitHub "latest" release (the CI publishes
 * latest.yml next to the installer there). Checks at start and every few hours, downloads
 * in the background and installs when the app quits, or at once if the user clicks.
 */
export class Updater {
  private state: UpdateState = { status: "idle", version: null, percent: null, error: null, checkedAt: null, installedAt: null };
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly onState: (s: UpdateState) => void) {
    this.state.installedAt = this.noteInstall();
    autoUpdater.setFeedURL({ provider: "generic", url: "https://github.com/disposablecameraapp/Open-NPU/releases/download/latest" });
    if (X64) autoUpdater.channel = "x64";
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => this.set({ status: "checking", error: null, checkedAt: Date.now() }));
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

  /** The installer of the latest release, run even when this version is already the latest (repairs a broken install). */
  async force(): Promise<UpdateState> {
    if (!this.enabled) { this.set({ status: "error", error: "Only the installed app can update itself." }); return this.state; }
    if (this.state.status === "downloading") return this.state;
    const dest = path.join(os.tmpdir(), X64 ? "Open-NPU-Setup-x64.exe" : "Open-NPU-Setup.exe");
    try {
      try { fs.rmSync(dest, { force: true }); fs.rmSync(dest + ".part", { force: true }); } catch { /* nothing to clean */ }
      this.set({ status: "downloading", percent: 0, error: null, checkedAt: Date.now() });
      await downloadFile(FORCE_URL, dest, (p) => this.set({ percent: p }));
      spawn(dest, [], { detached: true, stdio: "ignore" }).unref();
      app.quit();
    } catch (e) { this.set({ status: "error", error: (e as Error).message }); }
    return this.state;
  }

  install(): void {
    if (this.state.status === "ready") autoUpdater.quitAndInstall(true, true);
  }

  /** Remembers when this version first ran: that is the date of the last update. */
  private noteInstall(): number {
    const file = path.join(app.getPath("userData"), "update-info.json");
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { version?: string; installedAt?: number };
      if (saved.version === app.getVersion() && saved.installedAt) return saved.installedAt;
    } catch { /* first run */ }
    const now = Date.now();
    try { fs.writeFileSync(file, JSON.stringify({ version: app.getVersion(), installedAt: now })); } catch { /* read-only profile */ }
    return now;
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }
}
