import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import { ComputeTarget, FriendlyError, ServerStatus } from "../shared/types";
import { friendly, isNoise } from "./errors";

export interface ServerOptions {
  exe: string;
  host?: string; // 127.0.0.1:18181
  compute?: ComputeTarget;
  keepaliveSec?: number;
  maxRestarts?: number;
  readyTimeoutMs?: number;
  pollMs?: number;
  spawnFn?: typeof spawn;
  fetchFn?: typeof fetch;
  /** Extra env (GENIEX_* equivalents). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Keeps `geniex serve` alive as a hidden child process: start, poll /v1/models until ready,
 * restart on crash with a smaller context when the NPU overflowed, stop on app close.
 * One server, one model: GenieX loads on first request and swaps on request.
 */
export class ServerManager extends EventEmitter {
  private child: ChildProcess | null = null;
  private wantRunning = false;
  private nctx: number | null = null;
  private restarts = 0;
  private lastError: FriendlyError | null = null;
  private log: string[] = [];
  private state: ServerStatus["state"] = "stopped";
  private startToken = 0;

  constructor(private o: ServerOptions) {
    super();
  }

  get host() { return this.o.host ?? "127.0.0.1:18181"; }
  get endpoint() { return `http://${this.host}/v1`; }

  status(): ServerStatus {
    return {
      state: this.state,
      endpoint: this.endpoint,
      nctx: this.nctx,
      compute: this.o.compute ?? "npu",
      restarts: this.restarts,
      lastError: this.lastError,
      pid: this.child?.pid ?? null
    };
  }

  recentLog(n = 60): string[] { return this.log.slice(-n); }

  private set(state: ServerStatus["state"]) {
    this.state = state;
    this.emit("status", this.status());
  }

  /** Start (or restart with a different context). Resolves when ready or rejects with the friendly error. */
  async start(nctx: number): Promise<void> {
    if (this.child && this.nctx === nctx && this.state === "ready") return;
    await this.stop();
    this.nctx = nctx;
    this.wantRunning = true;
    this.restarts = 0;
    this.lastError = null;
    await this.launch();
  }

  private async launch(): Promise<void> {
    const token = ++this.startToken;
    this.set(this.restarts > 0 ? "restarting" : "starting");
    const args = ["serve", "--host", this.host, "--compute", this.o.compute ?? "npu", "--keepalive", String(this.o.keepaliveSec ?? 300)];
    if (this.nctx) args.push("--nctx", String(this.nctx));
    const child = (this.o.spawnFn ?? spawn)(this.o.exe, args, { windowsHide: true, env: { ...process.env, ...this.o.env } });
    this.child = child;
    const onData = (b: Buffer) => this.onOutput(b.toString("utf8"));
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    const exited = new Promise<number | null>((res) => {
      child.on("error", (e) => { this.onOutput(`${e.message}\n`); res(-1); });
      child.on("close", (code) => res(code));
    });
    exited.then((code) => {
      if (this.child === child) this.child = null;
      if (token !== this.startToken) return;
      this.onExit(code);
    });

    const ready = await this.waitReady(child, token);
    if (!ready) {
      if (this.state !== "failed" && this.state !== "stopped" && this.state !== "restarting") {
        this.fail(this.lastError ?? { id: "timeout", title: "The model server did not start", fix: "Check the last server error in Settings, then retry.", raw: this.log.slice(-10).join("\n") });
      }
      throw new Error(this.lastError?.title ?? "server did not become ready");
    }
    this.set("ready");
  }

  private async waitReady(child: ChildProcess, token: number): Promise<boolean> {
    const f = this.o.fetchFn ?? fetch;
    const deadline = Date.now() + (this.o.readyTimeoutMs ?? 60000);
    while (Date.now() < deadline) {
      if (token !== this.startToken || this.child !== child) return false;
      try {
        const r = await f(`${this.endpoint}/models`);
        if (r.ok) return true;
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, this.o.pollMs ?? 300));
    }
    return false;
  }

  private onOutput(text: string) {
    for (const part of text.split(/\r?\n/)) {
      const line = part.trim();
      if (!line || isNoise(line)) continue;
      this.log.push(line);
      if (this.log.length > 500) this.log.splice(0, 100);
      const fe = friendly(line);
      if (fe && fe.id !== "unknown" && /error|fail|abort|exception|err\b/i.test(line)) this.lastError = fe;
    }
  }

  private fail(e: FriendlyError) {
    this.lastError = e;
    this.set("failed");
    this.emit("error", e);
  }

  private onExit(code: number | null) {
    if (!this.wantRunning) { this.set("stopped"); return; }
    const max = this.o.maxRestarts ?? 3;
    const tail = this.log.slice(-20).join("\n");
    const known = this.lastError ?? friendly(tail);
    if (this.restarts >= max) {
      this.fail(known ?? { id: "crash", title: "The model server keeps crashing", fix: "Look at the last server error in Settings; try a smaller model or context.", raw: tail });
      return;
    }
    this.restarts++;
    // NPU memory overflow: come back with half the context, never below 2K.
    if (known?.id === "npu-overflow" || known?.id === "npu-sdk-error") {
      this.nctx = Math.max(2048, Math.floor((this.nctx ?? 8192) / 2 / 1024) * 1024);
    }
    this.emit("restart", { code, nctx: this.nctx, attempt: this.restarts });
    setTimeout(() => {
      if (this.wantRunning) this.launch().catch(() => undefined);
    }, Math.min(500 * 2 ** this.restarts, 8000));
  }

  async stop(): Promise<void> {
    this.wantRunning = false;
    this.startToken++;
    const c = this.child;
    this.child = null;
    if (c && c.exitCode === null) {
      await new Promise<void>((res) => {
        const t = setTimeout(() => { c.kill("SIGKILL"); res(); }, 3000);
        c.once("close", () => { clearTimeout(t); res(); });
        c.kill();
      });
    }
    this.set("stopped");
  }
}
