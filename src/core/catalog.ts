import { CatalogEntry, HardwareProfile, Verdict } from "../shared/types";
import { scoreEntry } from "./fit";
import raw from "./catalog.json";

export const CATALOG = raw as CatalogEntry[];

export interface CatalogView {
  entry: CatalogEntry;
  verdict: Verdict;
  /** Hidden on this machine (e.g. needs a newer driver than installed): shown only under "Not for this machine". */
  hidden: boolean;
}

export function ref(e: Pick<CatalogEntry, "repo" | "quant">): string {
  return e.quant ? `${e.repo}:${e.quant}` : e.repo;
}

export function viewCatalog(hw: HardwareProfile, entries: CatalogEntry[] = CATALOG): CatalogView[] {
  return entries
    .map((entry) => ({ entry, verdict: scoreEntry(entry, hw), hidden: !!entry.excluded }))
    .sort((a, b) => {
      const order = { green: 0, amber: 1, red: 2 } as const;
      return Number(a.hidden) - Number(b.hidden) || order[a.verdict.level] - order[b.verdict.level] || Number(!!b.entry.default) - Number(!!a.entry.default);
    });
}
