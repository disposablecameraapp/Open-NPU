import type { Skill } from "./skills";
import defaults from "./skills-default.json";

/** The skills that come with the app, then the ones the person made or imported (a person's skill with the same id replaces the default one). */
export function allSkills(mine: Skill[] | undefined): Skill[] {
  const own = mine ?? [];
  const ids = new Set(own.map((s) => s.id));
  return [...(defaults as Skill[]).filter((s) => !ids.has(s.id)).map((s) => ({ ...s, builtin: true })), ...own];
}
