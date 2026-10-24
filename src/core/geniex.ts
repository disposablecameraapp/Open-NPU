import { ChildProcess, spawn, execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { FriendlyError, InstalledModel, InstallProgress } from "../shared/types";
import { friendly, isNoise } from "./errors";

export const DEFAULT_ENDPOINT = "http://127.0.0.1:18181/v1";

/** %LOCALAPPDATA%\GenieX CLI\geniex.exe, or an explicit override. */
export function findGeniex(override: string | null, env = process.env, exists = fs.existsSync): string | null {
  const candidates: string[] = [];
  if (override) candidates.push(override);
  if (env.GENIEX_PATH) candidates.push(env.GENIEX_PATH);
  if (env.LOCALAPPDATA) candidates.push(path.join(env.LOCALAPPDATA, "GenieX CLI", "geniex.exe"));
  return candidates.find((c) => exists(c)) ?? null;
}

export function modelsDir(env = process.env): string {
  const home = env.USERPROFILE ?? env.HOME ?? "";
  return path.join(env.GENIEX_DATADIR ?? path.join(home, ".cache", "geniex"), "models");
}

export function run(exe: string, args: string[], timeoutMs = 30000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(exe, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? ((err as any).code as number) || 1 : 0;
      resolve({ code: typeof code === "number" ? code : 1, out: `${stdout}${stderr}` });
    });
  });
}

export async function geniexVersion(exe: string): Promise<string | null> {
  const r = await run(exe, ["version"], 10000);
  if (r.code !== 0) return null;
  return r.out.trim().split(/\r?\n/)[0] || null;
}

/** Output format of `geniex list` is not documented; accept "name [size]" lines and ignore decoration. */
export function parseList(out: string): InstalledModel[] {
  const models: InstalledModel[] = [];
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(name|model|-+|=+|no models)/i.test(line)) continue;
    const m = /([\w.-]+(?:\/[\w.-]+)+(?::[\w.-]+)?)/.exec(line);
    if (!m) continue;
    const size = /(\d+(?:\.\d+)?)\s*(GB|MB)/i.exec(line);
    models.push({
      name: m[1],
      ref: m[1],
      sizeGB: size ? (size[2].toUpperCase() === "GB" ? parseFloat(size[1]) : parseFloat(size[1]) / 1024) : undefined
    });
  }
  return models;
}

export async function listInstalled(exe: string): Promise<InstalledModel[]> {
  const r = await run(exe, ["list"]);
  return parseList(r.out);
}

/** `geniex remove` may ask "are you sure?" on stdin, so an answer is always supplied rather than waiting for it. */
function runConfirmed(exe: string, args: string[], timeoutMs = 60000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = execFile(exe, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? ((err as any).code as number) || 1 : 0;
      resolve({ code: typeof code === "number" ? code : 1, out: `${stdout}${stderr}` });
    });
    child.stdin?.on("error", () => { /* the command did not read its input */ });
    child.stdin?.end("y\n");
  });
}

/** The folder of a model under the models directory: `org/name`, `org--name` or `models--org--name` variants of its ref. */
export function modelFolders(name: string, dir = modelsDir(), exists = fs.existsSync): string[] {
  const base = name.replace(/:[^/:]*$/, "");
  const flat = base.replace(/\//g, "--");
  const names = [base, flat, `models--${flat}`, name.replace(/[/:]/g, "--")];
  return [...new Set(names)].map((n) => path.join(dir, n)).filter((p) => exists(p));
}

/** Terminal control sequences (cursor, colours, "?25l") and stray control characters, so an error reads as text. */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "").replace(/\[\?\d+[a-z]/g, "").replace(/[\u0000-\u0008\u000b-\u001f\ufffd]/g, "").replace(/\s+/g, " ").trim();
}

/** The flags that skip the "Are you sure?" prompt, tried in turn; the first the CLI accepts wins. */
const CONFIRM_FLAGS = ["--yes", "-y", "--force", "-f"];
const UNKNOWN_FLAG = /unknown|unrecognized|invalid (?:flag|option)|no such (?:flag|option)|usage:/i;

export async function removeModel(exe: string, name: string, dir = modelsDir()): Promise<{ ok: boolean; out: string }> {
  let last = { code: 1, out: "" };
  for (const flag of CONFIRM_FLAGS) {
    last = await runConfirmed(exe, ["remove", name, flag]);
    if (last.code === 0) return { ok: true, out: stripAnsi(last.out) };
    if (!UNKNOWN_FLAG.test(stripAnsi(last.out))) break; // it understood the flag and failed for another reason
  }
  // The command refused or failed: delete the model's own folder.
  const folders = modelFolders(name, dir);
  for (const f of folders) {
    try { fs.rmSync(f, { recursive: true, force: true }); } catch (e) { return { ok: false, out: `${stripAnsi(last.out)} ${(e as Error).message}`.trim() }; }
  }
  if (folders.length) return { ok: true, out: stripAnsi(last.out) };
  return { ok: false, out: stripAnsi(last.out) || "geniex could not remove this model" };
}

export function parsePercent(line: string): number | null {
  const m = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(line);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return v >= 0 && v <= 100 ? v : null;
}

export interface Pull {
  cancel(): void;
  done: Promise<void>;
}

/**
 * `geniex pull <ref>` with progress. The progress format is undocumented, so a percentage is
 * taken from any line that has one and the raw line is always passed on. Pull is resumable:
 * calling it again after cancel continues the download.
 */
export function pullModel(
  exe: string,
  ref: string,
  onProgress: (p: InstallProgress) => void,
  spawnFn: typeof spawn = spawn
): Pull {
  let child: ChildProcess | null = null;
  let cancelled = false;
  let tail = "";
  const done = new Promise<void>((resolve) => {
    child = spawnFn(exe, ["pull", ref], { windowsHide: true });
    const feed = (b: Buffer) => {
      for (const part of b.toString("utf8").split(/[\r\n]+/)) {
        const line = part.trim();
        if (!line) continue;
        tail = (tail + "\n" + line).slice(-4000);
        onProgress({ ref, phase: "downloading", percent: parsePercent(line), line });
      }
    };
    child.stdout?.on("data", feed);
    child.stderr?.on("data", feed);
    child.on("error", (e) => {
      onProgress({ ref, phase: "error", percent: null, error: friendly(e.message) ?? undefined });
      resolve();
    });
    child.on("close", (code) => {
      if (cancelled) onProgress({ ref, phase: "cancelled", percent: null });
      else if (code === 0) onProgress({ ref, phase: "done", percent: 100 });
      else onProgress({ ref, phase: "error", percent: null, error: friendly(tail) ?? { id: "pull", title: "Download failed", fix: "Check your connection and disk space, then try again; the download resumes.", raw: tail } });
      resolve();
    });
  });
  return {
    cancel() {
      cancelled = true;
      child?.kill();
    },
    done
  };
}

export function freeDiskGB(dir: string): number | null {
  try {
    let d = dir;
    while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
    const s = (fs as any).statfsSync(d);
    return (s.bavail * s.bsize) / 1024 ** 3;
  } catch {
    return null;
  }
}

/** Spec: disk-space check before install. Needs the file plus 15% headroom. */
export function diskCheck(freeGB: number | null, needGB: number): FriendlyError | null {
  if (freeGB === null) return null;
  if (freeGB < needGB * 1.15) {
    return {
      id: "disk",
      title: "Not enough disk space",
      fix: `This model needs about ${needGB.toFixed(1)} GB; only ${freeGB.toFixed(1)} GB is free. Free some space and retry.`,
      raw: ""
    };
  }
  return null;
}

export { isNoise };
