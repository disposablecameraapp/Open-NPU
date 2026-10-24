import type { FetchLike } from "./hf";

const HUB = "https://hub.docker.com/v2/repositories";

export interface RawDockerRepo {
  name?: string;
  namespace?: string;
  description?: string;
  pull_count?: number;
  star_count?: number;
  last_updated?: string;
}

export interface RawDockerTag {
  name?: string;
  full_size?: number;
  last_updated?: string;
}

/**
 * Docker Hub's public API. The `ai` namespace holds GGUF models packaged as OCI artifacts (the Docker Model Runner
 * catalog); GenieX pulls them as `docker.io/ai/<name>[:<tag>]`, and the tag carries the size and the quant ("8B-Q4_0").
 */
export class DockerClient {
  constructor(private fetchFn: FetchLike) {}

  /** Repos of a namespace, most pulled first or most recently updated first, up to `max`. */
  async models(sort: "pulls" | "updated", max = 300, namespace = "ai"): Promise<RawDockerRepo[]> {
    const order = sort === "pulls" ? "-pull_count" : "-last_updated";
    let url: string | null = `${HUB}/${namespace}/?page_size=100&ordering=${order}`;
    const out: RawDockerRepo[] = [];
    while (url && out.length < max) {
      const r = await this.fetchFn(url, { headers: { "User-Agent": "open-npu" } });
      if (!r.ok) throw new Error(`Docker Hub could not be browsed (${r.status})`);
      const j = await r.json();
      out.push(...((j?.results as RawDockerRepo[]) ?? []));
      url = typeof j?.next === "string" ? j.next : null;
    }
    return out.slice(0, max);
  }

  async tags(name: string, namespace = "ai"): Promise<RawDockerTag[]> {
    const r = await this.fetchFn(`${HUB}/${namespace}/${encodeURIComponent(name)}/tags/?page_size=100&ordering=last_updated`, { headers: { "User-Agent": "open-npu" } });
    if (r.status === 404) throw new Error(`"${namespace}/${name}" was not found on Docker Hub.`);
    if (!r.ok) throw new Error(`Docker Hub could not list the versions of ${name} (${r.status})`);
    const j = await r.json();
    return (j?.results as RawDockerTag[]) ?? [];
  }
}

/** "8B-Q4_0", "4B-UD-Q4_K_XL", "30B-A3B-Q4_K_M", "latest": size, active size of a MoE and quant, as far as the tag says. */
export function parseTag(tag: string): { paramsB: number | null; activeB: number | null; quant: string | null } {
  const size = /^(\d+(?:\.\d+)?)([BM])(?:-A(\d+(?:\.\d+)?)B)?/i.exec(tag);
  const paramsB = size ? (size[2].toUpperCase() === "M" ? parseFloat(size[1]) / 1000 : parseFloat(size[1])) : null;
  const q = /(?:^|[-_.])((?:IQ\d[A-Z0-9_]*)|(?:Q\d_K(?:_[A-Z]+)?)|(?:Q\d_[01])|(?:MXFP4(?:_MOE)?)|(?:BF16)|(?:F16)|(?:F32))(?:$|[-_.])/i.exec(tag);
  return { paramsB, activeB: size?.[3] ? parseFloat(size[3]) : null, quant: q ? q[1].toUpperCase() : null };
}
