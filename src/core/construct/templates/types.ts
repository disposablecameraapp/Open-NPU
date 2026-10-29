import { assemblePage } from "../assemble";
import type { Accepted, Plan, Unit } from "../types";

/** A finished, working program of one kind, kept as the engine's own units: the request then becomes a change to it. */
export interface Template {
  id: string;
  label: string;
  /** A closed yes/no question put to a model about the request. */
  question: string;
  plan: Plan;
  code: Record<string, string>;
}

type Row = { kind: Unit["kind"]; name: string; does: string; serves: string[]; uses?: string[]; signature?: string; examples?: [string, string][]; on?: string; into?: string; shared?: boolean };

/** A unit written short: the template files list many. */
export const unit = (r: Row): Unit => ({ id: r.name, kind: r.kind, name: r.name, does: r.does, serves: r.serves, uses: r.uses ?? [], signature: r.signature, examples: (r.examples ?? []).map(([call, expect]) => ({ call, expect })), on: r.on, into: r.into, shared: r.shared });

/** The page of the template, in the engine's own form (every unit between its marks), ready to be changed by the pipeline. */
export function templatePage(t: Template): string {
  const accepted = new Map<string, Accepted>();
  for (const u of t.plan.units) accepted.set(u.name, { code: t.code[u.name], verified: true, problems: [] });
  return assemblePage(t.plan, accepted, true, []);
}
