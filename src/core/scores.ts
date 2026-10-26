import data from "./scores.json";
import { normalizeName } from "./foundry";

/**
 * What the app's own benchmark measured, shipped with the app so a model card can say how good it is at a glance. One run per model on one PC,
 * on one set of tests: a gap of a few points is not a ranking, and scores of two different sets of tests are never compared.
 */
export interface Score { quality: number; tokPerSec: number | null; runsOn: string }

export const SCORES_NOTE = `Measured by Open NPU on a ${data.machine}: ${data.set}, ${data.asOf}. A gap of a few points between two models is not a ranking.`;

/** A model of the app's list, by name: a Foundry Local one by its alias, a native bundle apart from the GGUF of the same name. */
export function scoreOf(m: { name: string; id?: string; engine?: string }, native = m.engine === "qairt"): Score | null {
  const foundry = !!m.id?.startsWith("foundry:");
  const key = `${foundry ? "foundry" : "geniex"}:${normalizeName(m.name.replace(/\s*\(Foundry Local\)/i, ""))}${!foundry && native ? ":native" : ""}`;
  return (data.scores as Record<string, Score>)[key] ?? null;
}

/** "good" from 70 up, "fair" from 50, else "low": only to colour the chip. */
export const scoreLevel = (q: number) => (q >= 70 ? "good" : q >= 50 ? "fair" : "low");
