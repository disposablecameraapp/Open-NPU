import type { CatalogEntry, HardwareProfile, HfInspection, ResolveResult } from "../shared/types";
import { dockerVariants, guessArchitecture, paramsFromName } from "./browse";
import { DockerClient, parseTag } from "./docker";
import { scoreModel } from "./fit";
import { HfClient, inspectRepo } from "./hf";
import { NativeBundle } from "./native";
import { QuantKind, quantFromName } from "./quant";
import { samplingFor } from "./sampling";
import { ModelRef, SOURCE_NAMES, parseModelInput } from "./source";

export interface ResolveDeps {
  hf: HfClient;
  docker: DockerClient;
  native: () => Promise<NativeBundle[]>;
}

const BITS: Record<QuantKind, number> = { q4_0: 4.5, q8_0: 8.5, mxfp4: 4.3, kquant: 4.9, iquant: 4.4, other: 16 };

/** A model from a source that cannot be opened here: the entry is built from what its name and tag say. */
function lite(o: {
  source: "docker" | "modelscope" | "aihub"; repo: string; quant: string | null; name: string; sizeGB: number | null;
  hw: HardwareProfile; notes: string[]; kind?: QuantKind;
}): HfInspection {
  const native = o.source === "aihub";
  const paramsB = paramsFromName(o.name);
  const architecture = guessArchitecture(o.name);
  const kind: QuantKind = o.kind ?? (o.quant ? quantFromName(`x-${o.quant}.gguf`)?.kind ?? "other" : "q4_0");
  const sizeGB = o.sizeGB ?? (paramsB !== null ? Math.round(((paramsB * 1e9 * (native ? 8 : BITS[kind])) / 8 / 1024 ** 3) * 10) / 10 : 2);
  const isMoe = /moe|a\d+b\b/i.test(o.name);
  const verdict = scoreModel({
    architecture, fileGB: sizeGB, kind: native ? "native" : kind, paramsB, isMoe, wantedContext: 4096, maxTestedContext: 4096, engine: native ? "qairt" : "llama_cpp"
  }, o.hw);
  if (!native && kind !== "q4_0" && verdict.level === "green") verdict.level = "amber";
  const entry: CatalogEntry = {
    id: `custom:${o.source}:${o.repo}:${o.quant ?? ""}`.toLowerCase(), name: o.name, repo: o.repo, quant: o.quant,
    engine: native ? "qairt" : "llama_cpp", role: "Your model", architecture, sizeGB, sizeApprox: true, paramsB: paramsB ?? undefined, isMoe,
    recommendedContext: verdict.contextTokens || 4096, sampling: samplingFor(o.name).sampling, source: o.source
  };
  return {
    repo: o.repo, files: [], chosen: { path: o.repo, quant: o.quant ?? "native", sizeGB, note: null },
    gguf: null, verdict, entry, notes: o.notes
  };
}

/**
 * Whatever was pasted into the search box: a link, a command, a repo id or just a name. Models are opened and judged;
 * names (and links that are not models) come back as a search for the caller to run.
 */
export async function resolveModel(deps: ResolveDeps, input: string, hw: HardwareProfile, opts: { showKQuants: boolean } = { showKQuants: false }): Promise<ResolveResult> {
  const ref: ModelRef = parseModelInput(input);
  switch (ref.kind) {
    case "search":
      return { type: "search", query: ref.query, note: ref.note ?? null };
    case "hf": {
      const inspection = await inspectRepo(deps.hf, ref.quant ? `${ref.repo}:${ref.quant}` : ref.repo, hw, opts);
      return { type: "model", inspection };
    }
    case "docker": {
      const tags = await deps.docker.tags(ref.name, ref.namespace);
      const variants = dockerVariants(ref.name, tags, hw, ref.namespace);
      const pick = ref.tag ? variants.find((v) => v.tag === ref.tag) : variants[0];
      const notes = [`${SOURCE_NAMES.docker}: ${variants.length} version${variants.length === 1 ? "" : "s"} of ${ref.namespace}/${ref.name}.`];
      if (!ref.tag && variants.length > 1) notes.push(`Chose ${pick?.tag}, the best fit; paste ${ref.namespace}/${ref.name}:<version> for another.`);
      if (ref.tag && !pick) notes.push(`Version "${ref.tag}" was not found; it is sized from its name.`);
      const tag = pick?.tag ?? ref.tag;
      const quant = tag ?? null;
      const info = lite({
        source: "docker", repo: `docker.io/${ref.namespace}/${ref.name}`, quant, name: `${ref.name}${tag ? ` ${tag}` : ""}`,
        sizeGB: pick?.sizeGB ?? null, hw, notes, kind: tag ? (quantFromName(`x-${parseTag(tag).quant ?? "Q4_0"}.gguf`)?.kind ?? "other") : "q4_0"
      });
      info.entry!.paramsB = pick?.paramsB ?? info.entry!.paramsB;
      return { type: "model", inspection: info };
    }
    case "modelscope": {
      const name = ref.id.split("/")[1];
      return {
        type: "model",
        inspection: lite({
          source: "modelscope", repo: `https://modelscope.cn/models/${ref.id}`, quant: ref.quant ?? "Q4_0", name, sizeGB: null, hw,
          notes: ["ModelScope files are not listed here: the size is estimated from the name and GenieX picks the file. Q4_0 is asked for."]
        })
      };
    }
    case "aihub": {
      const bundles = await deps.native().catch(() => [] as NativeBundle[]);
      const found = bundles.find((b) => b.name.toLowerCase() === ref.name.toLowerCase());
      const notes = found ? [] : ["This bundle is not in `geniex model list` for this chip: it may fail with \"Requested chipset not available\"."];
      return { type: "model", inspection: lite({ source: "aihub", repo: `ai-hub-models/${ref.name}`, quant: null, name: ref.name, sizeGB: found?.sizeGB ?? null, hw, notes }) };
    }
  }
}
