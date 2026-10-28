import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CatalogEntry, ComputeTarget, HardwareProfile, InstallProgress } from "../shared/types";
import { HfClient } from "../core/hf";
import { ggufFolder, entryFile, findLlamaServer, pickGgufFile, pickGpuApi, pickLlamaAsset } from "../core/runtime";
import { diskCheck, freeDiskGB } from "../core/geniex";
import { ref as entryRef } from "../core/catalog";
import { downloadFile } from "./download";

const run = (file: string, args: string[], timeout = 15000): Promise<{ code: number; out: string }> =>
  new Promise((res) => execFile(file, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
    const out = `${stdout ?? ""}${stderr ?? ""}`;
    res({ code: err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0, out });
  }));

/** Graphics cards and their memory where the system can say it: NVIDIA through nvidia-smi, a Mac's unified memory, else names only. */
export async function detectGpus(known: HardwareProfile["gpus"], ramGB: number): Promise<NonNullable<HardwareProfile["gpus"]>> {
  const out: NonNullable<HardwareProfile["gpus"]> = [...(known ?? [])];
  const nv = await run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], 6000);
  if (nv.code === 0) {
    for (const l of nv.out.split(/\r?\n/).filter(Boolean)) {
      const [name, mb] = l.split(",").map((x) => x.trim());
      if (!name) continue;
      const vram = Math.round((parseFloat(mb) / 1024) * 10) / 10 || null;
      const i = out.findIndex((g) => g.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(g.name.toLowerCase()));
      if (i >= 0) out[i] = { name, vramGB: vram }; else out.push({ name, vramGB: vram });
    }
  }
  if (process.platform === "darwin" && !out.length) {
    const sp = await run("system_profiler", ["SPDisplaysDataType", "-detailLevel", "mini"], 8000);
    const name = /Chipset Model:\s*(.+)/.exec(sp.out)?.[1]?.trim();
    // an Apple chip's GPU uses the same memory as the processor
    if (name) out.push({ name, vramGB: /Apple/i.test(name) ? Math.round(ramGB * 0.7 * 10) / 10 : null });
  } else if (process.platform === "linux" && !out.length) {
    const l = await run("lspci", [], 6000);
    for (const line of l.out.split(/\r?\n/)) {
      const m = /(?:VGA compatible controller|3D controller|Display controller):\s*(.+)/i.exec(line);
      if (m) out.push({ name: m[1].replace(/\s*\(rev [0-9a-f]+\)\s*$/i, "").trim(), vramGB: null });
    }
  }
  return out;
}

export const cpuThreads = () => os.cpus().length || 1;

// ---- llama.cpp itself

export interface LlamaInstall { ok: boolean; path?: string; error?: string; version?: string }

/** Downloads the llama.cpp release that fits this PC and target into `appDir`, and returns where llama-server is. */
export async function installLlamaServer(o: { appDir: string; target: ComputeTarget; hw: HardwareProfile; progress: (percent: number | null, message: string) => void; fetchFn?: typeof fetch; token?: string }): Promise<LlamaInstall> {
  const f = o.fetchFn ?? fetch;
  try {
    o.progress(null, "Looking for the latest llama.cpp");
    const r = await f("https://api.github.com/repos/ggml-org/llama.cpp/releases/latest", { headers: { "User-Agent": "open-npu", Accept: "application/vnd.github+json", ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) } });
    if (!r.ok) return { ok: false, error: `GitHub did not answer (${r.status}). Download llama-server from github.com/ggml-org/llama.cpp/releases and use “Locate llama-server”.` };
    const rel: any = await r.json();
    const assets = (rel.assets ?? []).map((a: any) => ({ name: a.name as string, url: a.browser_download_url as string, size: a.size as number }));
    const api = pickGpuApi(o.hw);
    const pick = pickLlamaAsset(assets, { platform: process.platform, arch: process.arch, target: o.target, api });
    if (!pick) return { ok: false, error: `This release of llama.cpp has no build for ${process.platform} ${process.arch}. Install llama-server yourself and use “Locate llama-server”.` };
    const disk = diskCheck(freeDiskGB(o.appDir), ((pick.main.size ?? 0) + (pick.extra?.size ?? 0)) / 1024 ** 3 * 2.5);
    if (disk) return { ok: false, error: disk.fix };
    fs.mkdirSync(o.appDir, { recursive: true });
    const tmp = path.join(os.tmpdir(), "open-npu-llama");
    fs.mkdirSync(tmp, { recursive: true });
    const files = [pick.main, ...(pick.extra ? [pick.extra] : [])];
    for (const [i, a] of files.entries()) {
      const dest = path.join(tmp, a.name);
      await downloadFile(a.url, dest, (p) => o.progress(p, `Downloading ${a.name}${files.length > 1 ? ` (${i + 1}/${files.length})` : ""}`));
      o.progress(null, "Unpacking");
      const x = await run("tar", ["-xf", dest, "-C", o.appDir], 300_000);
      if (x.code !== 0 && process.platform !== "win32") { const u = await run("unzip", ["-o", dest, "-d", o.appDir], 300_000); if (u.code !== 0) return { ok: false, error: `The archive could not be unpacked: ${x.out.trim().slice(0, 200)}` }; }
      else if (x.code !== 0) return { ok: false, error: `The archive could not be unpacked: ${x.out.trim().slice(0, 200)}` };
      try { fs.unlinkSync(dest); } catch { /* left in temp */ }
    }
    const exe = findLlamaServer({ appDir: o.appDir, env: {} });
    if (!exe) return { ok: false, error: "The archive was unpacked but llama-server was not in it." };
    if (process.platform !== "win32") try { fs.chmodSync(exe, 0o755); } catch { /* already executable */ }
    return { ok: true, path: exe, version: String(rel.tag_name ?? "") };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function llamaVersion(exe: string): Promise<string | null> {
  const r = await run(exe, ["--version"], 8000);
  const m = /version:\s*(\S+)/i.exec(r.out);
  return r.code === 0 || m ? m?.[1] ?? r.out.trim().split(/\r?\n/)[0] ?? null : null;
}

// ---- the model files of this engine

/** The first GGUF this engine can open for a model: its own download, then the folder GenieX keeps. */
export function findGguf(entry: CatalogEntry, dirs: { own: string; geniex: string }): string | null {
  const q = (entry.quant ?? "").toLowerCase();
  const scan = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (d: string, depth: number) => {
      if (depth > 4) return;
      let names: fs.Dirent[] = [];
      try { names = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const n of names) {
        const p = path.join(d, n.name);
        if (n.isDirectory()) walk(p, depth + 1);
        else if (/\.gguf$/i.test(n.name) && !/mmproj/i.test(n.name)) out.push(p);
      }
    };
    walk(dir, 0);
    return out;
  };
  const folders = [ggufFolder(dirs.own, entry.repo), path.join(dirs.geniex, entry.repo), path.join(dirs.geniex, entry.repo.replace(/\//g, "--")), path.join(dirs.geniex, `models--${entry.repo.replace(/\//g, "--")}`)];
  for (const dir of folders) {
    const files = scan(dir);
    if (!files.length) continue;
    const hit = q ? files.filter((f) => path.basename(f).toLowerCase().includes(q)) : files;
    const pick = entryFile(hit.length ? hit : q ? [] : files);
    if (pick) return pick;
  }
  return null;
}

/** Downloads the GGUF of a catalog entry from Hugging Face into the app's own folder. */
export async function downloadGguf(entry: CatalogEntry, o: { dir: string; hf: HfClient; emit: (p: InstallProgress) => void; signal: { cancelled: boolean } }): Promise<{ ok: boolean; error?: string }> {
  const ref = entryRef(entry);
  const base = { ref, npuBudgetGB: 0, npuUtilPercent: null, ramWarning: false } as const;
  const say = (phase: InstallProgress["phase"], percent: number | null, line?: string, error?: InstallProgress["error"]) => o.emit({ ...base, phase, percent, line, error });
  try {
    if (entry.engine !== "llama_cpp") return { ok: false, error: "This is a precompiled NPU bundle: it only runs on the NPU of a Snapdragon X." };
    say("checking", null, "Looking for the file");
    const files = pickGgufFile(await o.hf.listFiles(entry.repo), entry.quant);
    if (!files.length) return fail(say, `No ${entry.quant ?? "GGUF"} file in ${entry.repo}.`);
    const total = files.reduce((a, f) => a + f.sizeBytes, 0);
    const disk = diskCheck(freeDiskGB(o.dir), total / 1024 ** 3);
    if (disk) { say("error", null, undefined, disk); return { ok: false, error: disk.title }; }
    const dest = ggufFolder(o.dir, entry.repo);
    fs.mkdirSync(dest, { recursive: true });
    let done = 0;
    for (const f of files) {
      const url = `https://huggingface.co/${entry.repo}/resolve/main/${f.path.split("/").map(encodeURIComponent).join("/")}`;
      const base0 = done;
      await downloadFile(url, path.join(dest, path.basename(f.path)), (p) => say("downloading", p === null ? null : Math.round(((base0 + (p / 100) * f.sizeBytes) / total) * 100), `Downloading ${path.basename(f.path)}`), o.signal);
      done += f.sizeBytes;
    }
    say("done", 100);
    return { ok: true };
  } catch (e) {
    const cancelled = o.signal.cancelled;
    say(cancelled ? "cancelled" : "error", null, undefined, cancelled ? undefined : { id: "download", title: "The download failed", fix: "Check the connection and try again: it resumes where it stopped.", raw: (e as Error).message });
    return { ok: false, error: cancelled ? "cancelled" : (e as Error).message };
  }
}
function fail(say: (p: InstallProgress["phase"], pc: number | null, l?: string, e?: InstallProgress["error"]) => void, msg: string) {
  say("error", null, undefined, { id: "no-file", title: "No file to download", fix: msg, raw: msg });
  return { ok: false, error: msg };
}

/** The models downloaded by this engine, as `org/repo` (a repo folder holds `org--repo`). */
export function ownModels(dir: string): { repo: string; files: string[] }[] {
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.flatMap((n) => {
    const files = (() => { try { return fs.readdirSync(path.join(dir, n)).filter((f) => /\.gguf$/i.test(f)); } catch { return []; } })();
    return files.length ? [{ repo: n.replace("--", "/"), files }] : [];
  });
}

export function removeOwn(entry: CatalogEntry, dir: string): boolean {
  const d = ggufFolder(dir, entry.repo);
  if (!fs.existsSync(d)) return false;
  fs.rmSync(d, { recursive: true, force: true });
  return true;
}
