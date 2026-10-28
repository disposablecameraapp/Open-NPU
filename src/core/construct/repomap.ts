/**
 * The map of the program a writer is given, read from the code that exists (never from a model): for each key of S the unit
 * touches, who else sets it and who else reads it. It is the "find the references" of a code editor, so a writer sees that the
 * keys it sets are read by someone, that the key it reads is set by someone, and that nobody else does what it is about to do.
 * Units not written yet count by what the wiring planned for them.
 */
import { readsKey, writesKey } from "./stateUse";
import type { Unit } from "./types";

export interface Toucher { name: string; kind: string; code?: string; reads?: string[]; writes?: string[] }

/** How a unit touches a key: from its code when it is written, else from the wiring planned for it. */
export function touches(x: Toucher, key: string): { sets: boolean; reads: boolean } {
  if (x.code !== undefined) return { sets: writesKey(x.code, key), reads: readsKey(x.code, key) };
  return { sets: !!x.writes?.includes(key), reads: !!x.reads?.includes(key) };
}

/** For each key the unit sets or reads: the other units that set it and the other units that read it. Empty when it touches no key. */
export function referencesText(u: Unit, others: Toucher[], keys: string[]): string {
  const mine = new Set([...(u.writes ?? []), ...(u.reads ?? [])].filter((k) => keys.includes(k)));
  const lines: string[] = [];
  // the keys the unit sets come first: they are the ones it is answerable for
  const order = [...mine].sort((a, b) => Number(!!u.writes?.includes(b)) - Number(!!u.writes?.includes(a)));
  for (const k of order) {
    const who = others.filter((x) => x.name !== u.name);
    const sets = who.filter((x) => x.kind === "handler" && touches(x, k).sets).map((x) => x.name);
    const reads = who.filter((x) => (x.kind === "handler" || x.kind === "view") && touches(x, k).reads).map((x) => x.name);
    const parts = [sets.length ? `also set by ${sets.join(", ")}` : u.writes?.includes(k) ? "set by no other unit" : "set by no unit yet", reads.length ? `read by ${reads.join(", ")}` : "read by no other unit"];
    lines.push(`S.${k}${u.writes?.includes(k) ? " (you set it)" : " (you read it)"}: ${parts.join(" · ")}`);
  }
  return lines.join("\n");
}
