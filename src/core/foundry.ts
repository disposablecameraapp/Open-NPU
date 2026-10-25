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
  for (const raw of strip(out).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || /^[\s\-=─━|+]+$/.test(line) || /\bAlias\b.*\bDevice\b/i.test(line)) continue;
    const cols = line.trim().split(/\s{2,}/);
    if (cols.length < 3) continue;
    let device: string;
    if (/^(CPU|GPU|NPU)$/i.test(cols[0])) { device = cols[0].toUpperCase(); } else { alias = cols[0]; device = (cols[1] ?? "").toUpperCase(); }
    if (!alias || !/^(CPU|GPU|NPU)$/.test(device)) continue;
    const size = cols.map((c) => c.match(/^([\d.]+)\s*(GB|MB)$/i)).find(Boolean);
    const gb = size ? (size[2].toUpperCase() === "GB" ? parseFloat(size[1]) : parseFloat(size[1]) / 1024) : null;
    const modelId = cols[cols.length - 1];
    if (!modelId || modelId === device) continue;
    const task = cols.find((c) => /chat|completion|speech|transcri|embed|tools/i.test(c)) ?? "";
    rows.push({ alias, device, task, sizeGB: gb, modelId });
  }
  return rows;
}

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

  constructor(private run: FoundryRun, private fetchFn: typeof fetch = fetch) {}

  private async cmd(args: string[], timeoutMs = 60_000) {
    const r = await this.run(args, timeoutMs).catch((e) => ({ code: 1, out: (e as Error).message }));
    const text = strip(r.out).trim();
    this.recent.push(`$ foundry ${args.join(" ")}  (exit ${r.code})`, ...text.split(/\r?\n/).slice(-12).map((l) => `  ${l}`));
    if (this.recent.length > 300) this.recent.splice(0, 100);
    return { code: r.code, out: text };
  }

  /** The version, or null when Foundry Local is not installed. */
  async version(): Promise<string | null> {
    const r = await this.cmd(["--version"], 15_000);
    return r.code === 0 && r.out ? r.out.split(/\r?\n/)[0].trim() : null;
  }

  async catalog(): Promise<FoundryVariant[]> {
    const r = await this.cmd(["model", "list"], 90_000);
    return r.code === 0 ? parseModelList(r.out) : [];
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
    await this.cmd(["service", "start"], 60_000);
    const s = await this.cmd(["service", "status"], 20_000);
    const url = parseServiceUrl(s.out);
    if (!url) throw new Error(`the Foundry Local server did not say where it runs: ${s.out.slice(0, 160) || "no answer"}`);
    this.base = url;
    return url;
  }

  /** Loads a model into the server; says where to ask and under which name. */
  async load(alias: string, modelId: string): Promise<{ endpoint: string; modelId: string }> {
    const base = await this.serviceUrl();
    const r = await this.cmd(["model", "load", alias], 5 * 60_000);
    if (r.code !== 0) throw new Error(`Foundry Local did not load ${alias}: ${r.out.split(/\r?\n/).slice(-2).join(" ").slice(0, 240)}`);
    this.lastAlias = alias;
    const ids = await this.fetchFn(`${base}/v1/models`).then((x) => x.json()).then(parseModelIds).catch(() => [] as string[]);
    const want = modelId.toLowerCase();
    const found = ids.find((i) => i.toLowerCase() === want) ?? ids.find((i) => i.toLowerCase().startsWith(want)) ?? ids.find((i) => i.toLowerCase().includes(alias.toLowerCase()));
    return { endpoint: `${base}/v1`, modelId: found ?? modelId };
  }

  /** Frees the NPU: what stopping the GenieX server does on the other side. */
  async unloadLast(): Promise<void> {
    if (!this.lastAlias) return;
    const a = this.lastAlias;
    this.lastAlias = null;
    await this.cmd(["model", "unload", a], 60_000);
  }
}
