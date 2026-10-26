import type { CatalogItem } from "../shared/api";
import { normalizeName } from "./foundry";
import { scoreOf } from "./scores";

/**
 * How the list of models is arranged for the screen: the ones that were tested first, one line per model, the faster engine when two were
 * tested; the ones with no score in a fold. The quality of a short test varies from run to run, so it never decides which of two builds is
 * shown: the speed does.
 */
export type SortBy = "score" | "speed" | "size" | "name";
export type EngineFilter = "all" | "geniex" | "foundry";
export interface ListOptions { sortBy: SortBy; engine: EngineFilter; installedOnly: boolean }

export const isFoundryItem = (i: Pick<CatalogItem, "entry">) => i.entry.id.startsWith("foundry:");

/** Where a model was seen to run: on this PC, else in the tests shipped with the app. Nothing when it was never measured: the build says what it is made for, not where it runs. */
export const placementOf = (i: Pick<CatalogItem, "entry" | "runsOn">): CatalogItem["runsOn"] | undefined => i.runsOn ?? (scoreOf(i.entry)?.runsOn as CatalogItem["runsOn"] | undefined);

/** Precompiled for the NPU, and seen running on it alone: an AI Hub bundle, or a Foundry Local build made for the NPU. */
export const isNativeNpu = (i: Pick<CatalogItem, "entry" | "runsOn">) =>
  placementOf(i) === "npu" && (i.entry.engine === "qairt" || (isFoundryItem(i) && i.entry.foundryDevice === "NPU"));

/** The same model whichever engine runs it: "Qwen3-1.7B (native NPU bundle)" and "Qwen3-1.7B (Foundry Local)" meet. */
export const modelKey = (i: Pick<CatalogItem, "entry">) => normalizeName(i.entry.name.replace(/\s*\(Foundry Local\)/i, ""));

const speed = (i: CatalogItem) => scoreOf(i.entry)?.tokPerSec ?? 0;
const quality = (i: CatalogItem) => scoreOf(i.entry)?.quality ?? -1;

function sorted(list: CatalogItem[], by: SortBy): CatalogItem[] {
  const out = [...list];
  const name = (a: CatalogItem, b: CatalogItem) => a.entry.name.localeCompare(b.entry.name);
  if (by === "size") return out.sort((a, b) => a.entry.sizeGB - b.entry.sizeGB || name(a, b));
  if (by === "name") return out.sort(name);
  if (by === "speed") return out.sort((a, b) => speed(b) - speed(a) || quality(b) - quality(a) || name(a, b));
  return out.sort((a, b) => quality(b) - quality(a) || speed(b) - speed(a) || name(a, b));
}

export interface Arranged {
  /** Tested, one line per model. */
  tested: CatalogItem[];
  /** The same models on the engine that was slower: kept apart, not lost. */
  slower: CatalogItem[];
  /** No score yet. */
  unscored: CatalogItem[];
}

export function arrangeModels(items: CatalogItem[], o: ListOptions): Arranged {
  let list = items;
  if (o.engine !== "all") list = list.filter((i) => (o.engine === "foundry") === isFoundryItem(i));
  if (o.installedOnly) list = list.filter((i) => i.installed);
  const groups = new Map<string, CatalogItem[]>();
  const unscored: CatalogItem[] = [];
  for (const i of list) {
    if (!scoreOf(i.entry)) { unscored.push(i); continue; }
    const k = modelKey(i);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const tested: CatalogItem[] = [], slower: CatalogItem[] = [];
  for (const g of groups.values()) {
    const best = [...g].sort((a, b) => speed(b) - speed(a) || quality(b) - quality(a))[0];
    tested.push(best);
    slower.push(...g.filter((x) => x !== best));
  }
  return { tested: sorted(tested, o.sortBy), slower: sorted(slower, o.sortBy), unscored: sorted(unscored, o.sortBy === "size" ? "size" : "name") };
}
