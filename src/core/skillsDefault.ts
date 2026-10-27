import type { Skill } from "./skills";
import defaults from "./skills-default.json";

/** Every skill that comes with the app, removed ones included. */
export const defaultSkills = (): Skill[] => (defaults as Skill[]).map((s) => ({ ...s, builtin: true }));

/** The skills that come with the app (except the ones the person uninstalled), then the ones the person made or imported (a person's skill with the same id replaces the default one). */
export function allSkills(mine: Skill[] | undefined, removed?: string[]): Skill[] {
  const own = mine ?? [];
  const ids = new Set([...own.map((s) => s.id), ...(removed ?? [])]);
  return [...defaultSkills().filter((s) => !ids.has(s.id)), ...own];
}
