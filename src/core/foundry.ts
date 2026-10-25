import type { BenchTarget } from "./bench";

/**
 * Microsoft Foundry Local as a second engine of the benchmark: the same questions are asked to a model through GenieX and through Foundry Local,
 * so the two can be compared on the same PC. It is driven through its `foundry` command and the OpenAI-compatible server it starts.
 * Written from its documentation and from reports, not tried against a real install: every command's output is kept (`recent`) so a failure can be read.
 */

export interface FoundryVariant {
  alias: string;
  /** CPU, GPU or NPU: the hardware this build of the model is made for. */
  device: string;
  task: string;
  sizeGB: number | null;
  modelId: string;
}

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

/**
 * `foundry model list` prints a table: Alias, Device, Task, File Size, License, Model ID. A model with several builds has its alias on the first
 * row only; the other rows start with the device.
 */
export function parseModelList(out: string): FoundryVariant[] {
  const rows: FoundryVariant[] = [];
  let alias = "";
  // 0.12 prints Alias | Access | Type | Size | Device | Tools | Cached, with no Model ID: the alias is then what is asked for
  const hasId = /Model\s*ID/i.test(out);
  for (const raw of strip(out).replace(/[│┃║|]/g, "  ").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || /^[\s\-=─━|+]+$/.test(line) || /\bAlias\b.*\bDevice\b/i.test(line)) continue;
    const cols = line.trim().split(/\s{2,}/);
    if (cols.length < 3) continue;
    let device: string;
    if (/^(CPU|GPU|NPU)$/i.test(cols[0])) { device = cols[0].toUpperCase(); } else {
      // a newer version may put a column (a status mark, a name) before or after: the device is the first column that is exactly CPU, GPU or NPU
      const at = cols.findIndex((c, i) => i > 0 && /^(CPU|GPU|NPU)$/i.test(c));
      if (at < 0) continue;
      alias = cols[0]; device = cols[at].toUpperCase();
    }
    if (!alias || !/^(CPU|GPU|NPU)$/.test(device)) continue;
    const size = cols.map((c) => c.match(/^([\d.]+)\s*(GB|MB)$/i)).find(Boolean);
    const gb = size ? (size[2].toUpperCase() === "GB" ? parseFloat(size[1]) : parseFloat(size[1]) / 1024) : null;
    const modelId = hasId ? cols[cols.length - 1] : alias;
    if (!modelId || modelId === device) continue;
    const task = cols.find((c) => /chat|completion|speech|transcri|embed|tools/i.test(c)) ?? "";
    rows.push({ alias, device, task, sizeGB: gb, modelId });
  }
  return rows;
}

/**
 * The catalog as the server gives it (`GET /foundry/list`): a list of models with an alias, the hardware they are built for, a size and an id.
 * The field names are read loosely, since versions differ.
 */
export function parseCatalogJson(json: unknown): FoundryVariant[] {
  const list = Array.isArray(json) ? json : (json as { models?: unknown[]; data?: unknown[] } | null)?.models ?? (json as { data?: unknown[] } | null)?.data ?? [];
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => {
    const m = x as Record<string, unknown> & { runtime?: Record<string, unknown> };
    const id = String(m.id ?? m.name ?? m.modelId ?? "");
    const alias = String(m.alias ?? m.displayName ?? m.name ?? "");
    const device = String(m.runtime?.deviceType ?? m.deviceType ?? m.device ?? "").toUpperCase();
    if (!id || !alias) return [];
    const mb = Number(m.fileSizeMb ?? m.fileSizeMB ?? NaN);
    const gb = Number.isFinite(mb) ? mb / 1024 : typeof m.sizeGB === "number" ? m.sizeGB : null;
    return [{ alias, device: /^(CPU|GPU|NPU)$/.test(device) ? device : "", task: String(m.task ?? ""), sizeGB: gb, modelId: id }];
  });
}

/**
 * The models Foundry Local is known to offer, from its documentation and from reports, with an approximate size: used when its catalog cannot be
 * read, so the comparison still runs: each alias is simply asked for, and Foundry Local says if it does not have it.
 */
export const KNOWN_ALIASES: { alias: string; sizeGB: number }[] = [
  { alias: "qwen2.5-0.5b", sizeGB: 0.5 }, { alias: "qwen2.5-1.5b", sizeGB: 1.1 }, { alias: "qwen2.5-7b", sizeGB: 4.7 },
  { alias: "qwen2.5-coder-0.5b", sizeGB: 0.5 }, { alias: "qwen2.5-coder-1.5b", sizeGB: 1.2 }, { alias: "qwen2.5-coder-7b", sizeGB: 4.7 },
  { alias: "phi-3.5-mini", sizeGB: 2.2 }, { alias: "phi-4-mini", sizeGB: 2.4 }, { alias: "phi-4-mini-reasoning", sizeGB: 2.4 },
  { alias: "deepseek-r1-7b", sizeGB: 4.4 }, { alias: "mistral-7b-v0.2", sizeGB: 4.1 }
];
export const knownVariants = (): FoundryVariant[] => KNOWN_ALIASES.map((k) => ({ alias: k.alias, device: "", task: "chat", sizeGB: k.sizeGB, modelId: k.alias }));

/** The base URL of the server from `foundry service status` ("running on http://localhost:5273/openai/status"). */
export function parseServiceUrl(out: string): string | null {
  const m = strip(out).match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):(\d+)/i);
  return m ? `http://127.0.0.1:${m[1]}` : null;
}

/** The ids of `GET /v1/models`. */
export function parseModelIds(json: unknown): string[] {
  const data = (json as { data?: { id?: string }[] } | null)?.data;
  return Array.isArray(data) ? data.flatMap((m) => (typeof m?.id === "string" ? [m.id] : [])) : [];
}

/** A model name reduced to what Foundry's aliases look like: "Qwen2.5-0.5B-Instruct" and "qwen2.5-0.5b" meet. */
export function normalizeName(name: string): string {
  const s = name.toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/(^|-)(instruct|it|chat|gguf|hf|q4|q4-0)(?=-|$)/g, "$1")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return DISTILLS[s] ?? s;
}

/** Foundry's short aliases for models whose full name is longer. */
const DISTILLS: Record<string, string> = {
  "deepseek-r1-distill-qwen-7b": "deepseek-r1-7b",
  "deepseek-r1-distill-qwen-14b": "deepseek-r1-14b"
};

/** The build of a model that Foundry would use on a NPU PC: the NPU one, else the GPU, else the CPU. */
export function bestVariant(vs: FoundryVariant[]): FoundryVariant {
  const rank = (d: string) => (d === "NPU" ? 0 : d === "GPU" ? 1 : 2);
  return [...vs].sort((a, b) => rank(a.device) - rank(b.device))[0];
}

/**
 * The Foundry Local side of the benchmark: for every model of the roster that Foundry Local also has, a twin to test with the other engine, and
 * the models only Foundry Local has. Only chat models, none heavier than `maxSizeGB`.
 */
export function foundryTargets(roster: BenchTarget[], variants: FoundryVariant[], maxSizeGB: number): BenchTarget[] {
  const byAlias = new Map<string, FoundryVariant[]>();
  for (const v of variants) {
    if (v.task && !/chat|completion|tools/i.test(v.task)) continue; // speech, embeddings
    byAlias.set(v.alias, [...(byAlias.get(v.alias) ?? []), v]);
  }
  const base = new Map<string, BenchTarget>();
  for (const t of roster) { const k = normalizeName(t.name); if (!base.has(k)) base.set(k, t); }
  const out: BenchTarget[] = [];
  for (const [alias, vs] of byAlias) {
    const v = bestVariant(vs);
    const twin = base.get(normalizeName(alias));
    const sizeGB = v.sizeGB ?? twin?.sizeGB ?? 0;
    if (sizeGB > maxSizeGB) continue;
    out.push({
      key: `foundry:${alias}`,
      name: twin ? `${twin.name} (Foundry Local)` : `${alias} (Foundry Local)`,
      repo: alias, quant: null, sizeGB: Math.round(sizeGB * 100) / 100, paramsB: twin?.paramsB ?? null,
      source: "Foundry Local", engine: "foundry", foundryAlias: alias, foundryModelId: v.modelId, foundryDevice: v.device, twinOf: twin?.key,
      job: twin?.job, specialty: twin?.specialty
    });
  }
  return out;
}

export interface FoundryRun { (args: string[], timeoutMs?: number): Promise<{ code: number; out: string }> }

/** The `foundry` command and the OpenAI-compatible server it starts. */
export class FoundryLocal {
  /** The last lines every command said: what a failure is read from. */
  recent: string[] = [];
  private base: string | null = null;
  private lastAlias: string | null = null;

  constructor(private run: FoundryRun, private fetchFn: typeof fetch = fetch, private logTail: () => Promise<string[]> = async () => [], private killDaemon: () => Promise<void> = async () => undefined) {}

  /**
   * Everything that can be read about Foundry Local at this moment, as lines: its status, what its server lists, the help of its command groups
   * (so a renamed command can be read), its cache, and the tail of its own log files. Kept in `recent` too, so the page's log has it.
   * `full` adds the slow and long ones (every variant of the catalog, the help texts).
   */
  async diagnose(full = false, alias?: string): Promise<string[]> {
    const out: string[] = [`── Foundry Local state (${new Date().toISOString()}) ──`];
    const take = async (label: string, args: string[], max = 20, timeoutMs = 20_000) => {
      const r = await this.run(args, timeoutMs).catch((e) => ({ code: 1, out: (e as Error).message }));
      const lines = strip(r.out).trim().split(/\r?\n/).filter((l) => l.trim());
      out.push(`$ foundry ${args.join(" ")}  (exit ${r.code})${label ? `  # ${label}` : ""}`, ...lines.slice(0, max).map((l) => `  ${l.slice(0, 200)}`), ...(lines.length > max ? [`  … ${lines.length - max} more lines`] : []));
    };
    await take("daemon", ["server", "status"]);
    await take("global status", ["status"]);
    await take("loaded and cached models", ["cache", "list"], 40);
    if (this.base) {
      for (const path of ["/v1/models", "/openai/status"]) {
        const r = await this.fetchFn(`${this.base}${path}`).then(async (x) => `${x.status} ${(await x.text()).replace(/\s+/g, " ").slice(0, 400)}`).catch((e) => `no answer (${(e as Error).message})`);
        out.push(`GET ${this.base}${path} → ${r}`);
      }
    }
    // the same question through Foundry's own command: if it answers, the fault is in how this app asks; if it fails the same way, it is Foundry's
    if (alias) await take("the same question asked by Foundry's own command, not by this app", ["complete", alias, "Say OK."], 12, 90_000);
    if (full) {
      await take("what the command groups are called in this version", ["--help"], 40);
      await take("", ["model", "--help"], 40);
      await take("", ["server", "--help"], 40);
      await take("every hardware variant of every model", ["model", "list", "--variants"], 80);
      await take("settings", ["config"], 30);
    }
    const files = await this.logTail().catch((e) => [`(its log files could not be read: ${(e as Error).message})`]);
    out.push(...(files.length ? files : ["(no log file of Foundry Local was found)"]));
    this.recent.push(...out);
    if (this.recent.length > 600) this.recent.splice(0, this.recent.length - 500);
    return out;
  }

  private async cmd(args: string[], timeoutMs = 60_000) {
    const r = await this.run(args, timeoutMs).catch((e) => ({ code: 1, out: (e as Error).message }));
    const text = strip(r.out).trim();
    this.recent.push(`$ foundry ${args.join(" ")}  (exit ${r.code})`, ...text.split(/\r?\n/).slice(-12).map((l) => `  ${l}`));
    if (r.code === 2 && /unknown command|unrecognized command/i.test(text)) await this.helpOf(args[0]);
    if (this.recent.length > 300) this.recent.splice(0, 100);
    return { code: r.code, out: text };
  }

  private helped = new Set<string>();
  private group: string | null = null;
  /** A command this version does not know: what it says about itself is kept once, so the right name can be read from the log. */
  private async helpOf(word: string | undefined) {
    for (const w of ["", word ?? ""]) {
      if (this.helped.has(w)) continue;
      this.helped.add(w);
      const h = await this.run(w ? [w, "--help"] : ["--help"], 15_000).catch(() => ({ code: 1, out: "" }));
      this.recent.push(`$ foundry ${w ? `${w} ` : ""}--help`, ...strip(h.out).trim().split(/\r?\n/).slice(0, 25).map((l) => `  ${l}`));
    }
  }

  /** The daemon was ended from outside: the address it had is no longer good. */
  forgetDaemon() { this.base = null; this.lastAlias = null; }

  /** The version, or null when Foundry Local is not installed. */
  async version(): Promise<string | null> {
    const r = await this.cmd(["--version"], 15_000);
    return r.code === 0 && r.out ? r.out.split(/\r?\n/)[0].trim() : null;
  }

  /** Where the catalog came from last: "server", "table", or "none" (it could not be read). */
  catalogFrom: "server" | "table" | "none" = "none";

  async catalog(): Promise<FoundryVariant[]> {
    // the server's own list first (JSON, the same on every version), then the table `foundry model list` prints
    try {
      const base = await this.serviceUrl();
      for (const path of ["/foundry/list", "/openai/models"]) {
        const j = await this.fetchFn(`${base}${path}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        const v = parseCatalogJson(j);
        if (path === "/foundry/list" && v.length) { this.catalogFrom = "server"; this.recent.push(`catalog: ${v.length} builds from ${base}${path}`); return v; }
      }
    } catch (e) { this.recent.push(`catalog: the server could not be asked (${(e as Error).message.slice(0, 120)})`); }
    const r = await this.cmd(["model", "list"], 90_000);
    const v = r.code === 0 ? parseModelList(r.out) : [];
    this.catalogFrom = v.length ? "table" : "none";
    if (!v.length) this.recent.push(`catalog: nothing could be read from "foundry model list" (${r.out.split(/\r?\n/).length} lines, exit ${r.code}); the first lines were:`, ...r.out.split(/\r?\n/).slice(0, 8).map((l) => `  ${l.slice(0, 160)}`));
    return v;
  }

  /** What is on disk, as lower-case words; null when the output could not be read (then nothing is assumed to be missing). */
  async cached(): Promise<Set<string> | null> {
    let r = await this.cmd(["cache", "list"], 30_000);
    if (r.code !== 0) r = await this.cmd(["cache", "ls"], 30_000);
    if (r.code !== 0 || !r.out) return null;
    return new Set(r.out.toLowerCase().split(/[\s,|]+/).filter(Boolean));
  }

  async isInstalled(alias: string, modelId: string): Promise<boolean> {
    const c = await this.cached();
    return c === null ? true : c.has(alias.toLowerCase()) || c.has(modelId.toLowerCase());
  }

  async download(alias: string): Promise<{ ok: boolean; error?: string }> {
    const r = await this.cmd(["model", "download", alias], 3 * 3600_000);
    return r.code === 0 ? { ok: true } : { ok: false, error: r.out.split(/\r?\n/).slice(-3).join(" ").slice(0, 300) || "the download failed" };
  }

  async remove(alias: string): Promise<{ ok: boolean; message: string }> {
    const r = await this.cmd(["cache", "remove", alias], 60_000);
    return { ok: r.code === 0, message: r.out.slice(0, 200) };
  }

  /** Starts the server if needed and says where it listens (the address is chosen by Foundry Local at each start). */
  async serviceUrl(): Promise<string> {
    if (this.base) {
      const alive = await this.fetchFn(`${this.base}/v1/models`).then((r) => r.ok).catch(() => false);
      if (alive) return this.base;
      this.base = null;
    }
    // 0.12 calls it `server`, earlier versions `service`: the one this version knows is used, and remembered
    let url: string | null = null, last = "";
    for (const group of this.group ? [this.group] : ["service", "server"]) {
      const started = await this.cmd([group, "start"], 60_000);
      if (started.code === 2 && /unknown command|unrecognized/i.test(started.out)) { last = started.out; continue; }
      const status = await this.cmd([group, "status"], 20_000);
      url = parseServiceUrl(`${started.out}\n${status.out}`);
      last = status.out || started.out;
      if (url) { this.group = group; break; }
    }
    if (!url) throw new Error(`the Foundry Local server did not say where it runs: ${last.replace(/\s+/g, " ").slice(0, 200) || "no answer"}`);
    this.base = url;
    return url;
  }

  /** Loads a model into the server; says where to ask and under which name. */
  async load(alias: string, modelId: string): Promise<{ endpoint: string; modelId: string }> {
    const base = await this.serviceUrl();
    const r = await this.cmd(["model", "load", alias], 5 * 60_000);
    if (r.code !== 0) {
      // the daemon dies on some models (a Windows "application error" box stays open and the NPU stays held): it is ended so the run can go on
      if (/daemon closed the connection|connection (was )?(closed|reset)|terminated/i.test(r.out)) { this.recent.push("the Foundry Local daemon crashed while loading the model: it is ended by force."); await this.killDaemon().catch(() => undefined); this.base = null; }
      throw new Error(`Foundry Local did not load ${alias}: ${r.out.split(/\r?\n/).filter((l) => l.trim()).slice(-4).join(" | ").slice(0, 420) || `no answer (exit ${r.code})`}`);
    }
    this.lastAlias = alias;
    const ids = await this.fetchFn(`${base}/v1/models`).then((x) => x.json()).then(parseModelIds).catch(() => [] as string[]);
    const want = modelId.toLowerCase();
    const found = ids.find((i) => i.toLowerCase() === want) ?? ids.find((i) => i.toLowerCase().startsWith(want)) ?? ids.find((i) => i.toLowerCase().includes(alias.toLowerCase()));
    this.recent.push(`loaded ${alias}: the server at ${base} lists ${ids.length ? ids.slice(0, 6).join(", ") : "no model"}; asked as ${found ?? modelId}${found ? "" : " (not in that list)"}`);
    return { endpoint: `${base}/v1`, modelId: found ?? modelId };
  }

  /** Frees the NPU: what stopping the GenieX server does on the other side. */
  async unloadLast(): Promise<void> {
    if (!this.lastAlias) return;
    const a = this.lastAlias;
    this.lastAlias = null;
    await this.cmd(["model", "unload", a], 60_000);
    // The daemon keeps gigabytes of the PC's RAM after a model is unloaded, and the NPU works in that same RAM: the next model of the other
    // engine then fails to load (measured: 1.8 GB free of 15.6 GB, GenieX crashed twice). It is stopped, and starts again when asked.
    const stop = await this.cmd(["server", "stop"], 30_000);
    if (stop.code !== 0) await this.killDaemon().catch(() => undefined);
    this.base = null;
  }
}
