/**
 * Working programs of a few kinds, kept as the engine's own units. A request that is one of these kinds starts from the template and
 * becomes a change to it (the engine's usual way of changing a finished program), so a small model rewrites the units the request
 * concerns and adds what is new instead of writing a whole program from nothing. It is an option the person can leave: a request that
 * asks outright for the code from scratch never uses one, and a request that is no kind of any template is built as before.
 */
import { PLATFORMER } from "./platformer";
import { RPG } from "./rpg";
import { templatePage, type Template } from "./types";

export const TEMPLATES: Template[] = [PLATFORMER, RPG];
export { templatePage };
export type { Template };

/** The first template a closed question says the request is, asking in order; null when none. */
export async function pickTemplate(ask: (question: string, label: string) => Promise<boolean | null>): Promise<Template | null> {
  for (const t of TEMPLATES) if ((await ask(`${t.question} (Answer no for anything else.)`, `a template: ${t.label}`)) === true) return t;
  return null;
}
