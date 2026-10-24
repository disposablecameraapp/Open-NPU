import { BrowseQuery, CatalogEntry, HardwareProfile, HfInspection, HfSearchResult } from "../shared/types";
import { BROWSE_FIELDS, RawHfModel } from "./browse";
import { readGgufHeader, summarize, RangeFetcher } from "./gguf";
import { GgufChoice, groupModels, pickQuant, isHiddenByDefault } from "./quant";
import { scoreModel } from "./fit";
import { samplingFor, samplingFromGenerationConfig } from "./sampling";

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text?(): Promise<string>;
  headers?: { get(name: string): string | null };
}>;

const HF = "https://huggingface.co";

export class HfClient {
  constructor(private fetchFn: FetchLike, private token?: string) {}

  private headers(extra: Record<string, string> = {}) {
    const h: Record<string, string> = { "User-Agent": "open-npu", ...extra };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async search(query: string, limit = 20): Promise<HfSearchResult[]> {
    const url = `${HF}/api/models?search=${encodeURIComponent(query)}&filter=gguf&sort=downloads&direction=-1&limit=${limit}`;
    const r = await this.fetchFn(url, { headers: this.headers() });
    if (!r.ok) throw new Error(`Hugging Face search failed (${r.status})`);
    const rows: any[] = await r.json();
    return rows.map((m) => ({
      repo: m.id ?? m.modelId,
      downloads: m.downloads ?? 0,
      likes: m.likes ?? 0,
      updated: m.lastModified ?? null
    }));
  }

  /**
   * One page of GGUF repos with what is needed to judge them (architecture, parameter count, file names) in a single
   * request. Hugging Face orders it; `limit` is how far down the list to look (it caps at 1000).
   */
  async browse(q: Pick<BrowseQuery, "query" | "sort" | "limit">): Promise<RawHfModel[]> {
    const sort = { downloads: "downloads", likes: "likes", trending: "trendingScore", recent: "lastModified" }[q.sort];
    const params = [
      "filter=gguf", `sort=${sort}`, "direction=-1", `limit=${Math.min(1000, Math.max(1, Math.floor(q.limit)))}`,
      ...(q.query.trim() ? [`search=${encodeURIComponent(q.query.trim())}`] : []),
      ...BROWSE_FIELDS.map((f) => `expand%5B%5D=${f}`)
    ];
    const r = await this.fetchFn(`${HF}/api/models?${params.join("&")}`, { headers: this.headers() });
    if (!r.ok) throw new Error(`Hugging Face could not be browsed (${r.status})`);
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  }

  /** All files with sizes (the tree endpoint reports LFS sizes). */
  async listFiles(repo: string): Promise<{ path: string; sizeBytes: number }[]> {
    const r = await this.fetchFn(`${HF}/api/models/${repo}/tree/main?recursive=true`, { headers: this.headers() });
    if (r.status === 404) throw new Error(`Repo "${repo}" was not found on Hugging Face.`);
    if (!r.ok) throw new Error(`Could not list files for ${repo} (${r.status})`);
    const rows: any[] = await r.json();
    return rows
      .filter((x) => x.type === "file")
      .map((x) => ({ path: x.path as string, sizeBytes: (x.lfs?.size ?? x.size ?? 0) as number }));
  }

  rangeFetcher(repo: string, path: string): RangeFetcher {
    const url = `${HF}/${repo}/resolve/main/${path.split("/").map(encodeURIComponent).join("/")}`;
    return async (start, end) => {
      const r = await this.fetchFn(url, { headers: this.headers({ Range: `bytes=${start}-${end}` }) });
      if (!r.ok) throw new Error(`Header download failed (${r.status})`);
      return Buffer.from(await r.arrayBuffer());
    };
  }

  async generationConfig(repo: string): Promise<unknown> {
    try {
      const r = await this.fetchFn(`${HF}/${repo}/resolve/main/generation_config.json`, { headers: this.headers() });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  }
}

/** Accepts "org/name", "org/name:Q4_0" or a full huggingface.co URL. */
export function parseRepoInput(input: string): { repo: string; quant: string | null } | null {
  let s = input.trim();
  s = s.replace(/^https?:\/\/(www\.)?huggingface\.co\//i, "").replace(/\/(tree|blob|resolve)\/.*$/, "").replace(/\/+$/, "");
  const m = /^([\w.-]+\/[\w.-]+?)(?::([\w]+))?$/.exec(s);
  return m ? { repo: m[1], quant: m[2] ?? null } : null;
}

/**
 * The "bring your own model" pre-install check: list files, pick the quant, read only the GGUF
 * header, score against this machine, set safe sampling. Never blocks; every failure becomes a note.
 */
export async function inspectRepo(
  hf: HfClient,
  input: string,
  hw: HardwareProfile,
  opts: { showKQuants: boolean } = { showKQuants: false }
): Promise<HfInspection> {
  const parsed = parseRepoInput(input);
  if (!parsed) throw new Error("Paste a Hugging Face repo like org/model-GGUF or its URL.");
  const { repo } = parsed;
  const notes: string[] = [];
  const files = await hf.listFiles(repo);
  let groups = groupModels(files);
  if (groups.length === 0) {
    return { repo, files, chosen: null, gguf: null, verdict: null, entry: null, notes: ["No GGUF files in this repo."] };
  }
  if (parsed.quant) {
    const wanted = groups.filter((g) => g.quant.toUpperCase() === parsed.quant!.toUpperCase());
    if (wanted.length) groups = wanted;
    else notes.push(`Quant ${parsed.quant} was not found in this repo; choosing another.`);
  }
  const hidden = groups.filter((g) => isHiddenByDefault(g.kind));
  const visible = opts.showKQuants ? groups : groups.filter((g) => !isHiddenByDefault(g.kind));

  // first pass without MoE knowledge, refined after the header is read
  let choice: GgufChoice | null = pickQuant(visible, { paramsB: null, isMoe: false });
  if (!choice && hidden.length) {
    choice = pickQuant(hidden, { paramsB: null, isMoe: false });
    notes.push("Only K-quants or IQ quants exist here (hidden by default).");
  }
  if (!choice) {
    return { repo, files, chosen: null, gguf: null, verdict: null, entry: null, notes: [...notes, "No NPU-friendly quant found."] };
  }

  let gguf = null;
  try {
    const meta = await readGgufHeader(hf.rangeFetcher(repo, choice.path));
    gguf = summarize(meta, choice.sizeBytes / 1024 ** 3);
  } catch (e) {
    notes.push(`Could not read the model header (${(e as Error).message}); fit is a guess.`);
  }

  const isMoe = !!gguf?.expertCount && gguf.expertCount > 1;
  const refined = pickQuant(opts.showKQuants ? groups : visible.length ? visible : hidden, { paramsB: gguf?.paramsB ?? null, isMoe });
  if (refined) choice = refined;

  const sizeGB = Math.round((choice.sizeBytes / 1024 ** 3) * 100) / 100;
  const name = repo.split("/")[1].replace(/-?GGUF$/i, "");
  const base = samplingFor(`${repo} ${gguf?.name ?? ""}`);
  const gen = await hf.generationConfig(repo);
  const sampling = samplingFromGenerationConfig(gen, base.sampling);
  if (!base.family) notes.push("Unknown model family: using the safe thinking-model sampling set.");

  const kv =
    gguf?.attentionLayers && gguf.kvHeads && gguf.headDim
      ? { attentionLayers: gguf.attentionLayers, kvHeads: gguf.kvHeads, headDim: gguf.headDim }
      : undefined;
  const wanted = Math.min(gguf?.contextLength ?? 16384, 16384);
  const verdict = scoreModel(
    {
      architecture: gguf?.architecture ?? "unknown",
      fileGB: sizeGB,
      kind: choice.kind,
      paramsB: gguf?.paramsB,
      isMoe,
      kv,
      wantedContext: wanted,
      engine: "llama_cpp"
    },
    hw
  );
  if (choice.note) verdict.reasons.unshift(choice.note);

  const entry: CatalogEntry = {
    id: `custom:${repo}:${choice.quant}`.toLowerCase(),
    name,
    repo,
    quant: choice.quant,
    engine: "llama_cpp",
    role: "Your model",
    architecture: gguf?.architecture ?? "unknown",
    sizeGB,
    paramsB: gguf?.paramsB ?? undefined,
    isMoe,
    kv,
    recommendedContext: verdict.contextTokens || 4096,
    sampling
  };
  return {
    repo,
    files,
    chosen: { path: choice.path, quant: choice.quant, sizeGB, note: choice.note },
    gguf,
    verdict,
    entry,
    notes
  };
}
