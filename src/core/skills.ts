/**
 * A skill is more than a prompt: shared rules plus a series of steps. The steps run one after the other in the conversation, each with a
 * small job, so that a small model never has to hold the whole task at once. No picture: a skill is text only.
 */
export interface SkillStep { title: string; prompt: string }
export interface Skill {
  id: string;
  name: string;
  description: string;
  /** At most MAX_TAGS, lower case, no spaces. */
  tags: string[];
  /** Rules kept in front of the model for every step. */
  instructions: string;
  steps: SkillStep[];
  /** Models that suit this skill, best first (catalog ids). */
  models: string[];
  /** Id of an icon of the library (renderer/skillIcons.tsx); the icon of its category when unset. */
  icon?: string;
  builtin?: boolean;
}

export const MAX_TAGS = 10;
export const MAX_STEPS = 12;
const TOKEN_CHARS = 3.5;

export const tokensOfText = (t: string) => Math.ceil(t.length / TOKEN_CHARS);

/** What the model carries at the heaviest moment: the shared rules and the longest step. */
export function skillTokens(s: Pick<Skill, "instructions" | "steps">): number {
  return tokensOfText(s.instructions) + Math.max(0, ...s.steps.map((x) => tokensOfText(x.prompt)));
}

export type SkillSize = { tokens: number; level: 1 | 2 | 3; label: string; short: string };
/** Size written on the skill: the number of tokens and the models that can carry it (the same three levels as the instructions). */
export function skillSize(s: Pick<Skill, "instructions" | "steps">): SkillSize {
  const tokens = skillTokens(s);
  const level = tokens <= 500 ? 1 : tokens <= 1200 ? 2 : 3;
  const label = `about ${tokens} tokens, ${level === 1 ? "suits every model, even small ones" : level === 2 ? "suits models with a context of 8K or more" : "needs a model with a context of 16K or more"}`;
  return { tokens, level, label, short: `~${tokens} tokens · ${level === 1 ? "any model" : level === 2 ? "8K+ context" : "16K+ context"}` };
}

export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const t of tags) {
    const c = t.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 24);
    if (c) seen.add(c);
  }
  return [...seen].slice(0, MAX_TAGS);
}

export const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "skill";

/** The problems that make a skill unusable; empty when it is fine. */
export function skillProblems(s: Skill): string[] {
  const out: string[] = [];
  if (!s.name.trim()) out.push("it has no name");
  if (!s.description.trim()) out.push("it has no description");
  if (!s.steps.length) out.push("it has no step");
  if (s.steps.length > MAX_STEPS) out.push(`it has more than ${MAX_STEPS} steps`);
  s.steps.forEach((x, i) => { if (!x.prompt.trim()) out.push(`step ${i + 1} is empty`); });
  if (s.tags.length > MAX_TAGS) out.push(`it has more than ${MAX_TAGS} tags`);
  return out;
}

/** Text form (a .md or .txt file): a header between --- lines, the shared rules, then one "## Step: title" per step. */
export function skillToMarkdown(s: Skill): string {
  const head = ["---", `name: ${s.name}`, `description: ${s.description.replace(/\n/g, " ")}`, `tags: ${s.tags.join(", ")}`, ...(s.icon ? [`icon: ${s.icon}`] : []), `models: ${s.models.join(", ")}`, "---"];
  const body = s.steps.map((x) => `## Step: ${x.title}\n${x.prompt.trim()}`);
  return [head.join("\n"), s.instructions.trim(), ...body].filter((x) => x !== "").join("\n\n") + "\n";
}

/** Reads the text form back. A plain text with no header is one skill with one step, named after its first line. */
export function skillFromMarkdown(text: string, id?: string): Skill | string {
  const src = text.replace(/\r\n/g, "\n").trim();
  if (!src) return "the file is empty";
  let meta: Record<string, string> = {}, body = src;
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) {
    body = m[2];
    for (const line of m[1].split("\n")) { const k = line.match(/^([A-Za-z_]+):\s*(.*)$/); if (k) meta[k[1].toLowerCase()] = k[2].trim(); }
  }
  const parts = body.split(/^##\s*Step:\s*/m);
  const instructions = parts[0].trim();
  const steps: SkillStep[] = parts.slice(1).map((p) => { const nl = p.indexOf("\n"); return nl < 0 ? { title: p.trim(), prompt: "" } : { title: p.slice(0, nl).trim(), prompt: p.slice(nl + 1).trim() }; });
  const first = (instructions || body).split("\n")[0].replace(/^#+\s*/, "").trim().slice(0, 60);
  const name = meta.name || first;
  const skill: Skill = {
    id: id ?? slug(name), name, description: meta.description ?? "", tags: cleanTags((meta.tags ?? "").split(/[,\s]+/)),
    instructions: steps.length ? instructions : "", steps: steps.length ? steps : [{ title: "Do it", prompt: body.trim() }],
    icon: meta.icon || undefined,
    models: (meta.models ?? "").split(",").map((x) => x.trim()).filter(Boolean)
  };
  if (!skill.description) skill.description = first;
  const bad = skillProblems(skill);
  return bad.length ? `this skill cannot be used: ${bad.join(", ")}` : skill;
}

/** The first of the skills whose name or tags start with what was typed after "/". */
export function matchSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  if (!q) return skills;
  const score = (s: Skill) => (s.name.toLowerCase().startsWith(q) ? 0 : s.name.toLowerCase().includes(q) ? 1 : s.tags.some((t) => t.startsWith(q)) ? 2 : s.description.toLowerCase().includes(q) ? 3 : 9);
  return skills.filter((s) => score(s) < 9).sort((a, b) => score(a) - score(b));
}

/** The system text of one step: the shared rules, where the work stands, and the job of this step. */
export function stepPrompt(s: Skill, i: number): string {
  const n = s.steps.length;
  return [s.instructions.trim(), `You are doing the skill "${s.name}", step ${i + 1} of ${n}: ${s.steps[i].title}.`, s.steps[i].prompt.trim(), n > 1 ? "Do only this step. The next steps come after." : ""].filter(Boolean).join("\n\n");
}

/** The categories of the list, in the order a skill is placed in the first one whose tags it carries. */
export const SKILL_CATEGORIES = [
  { id: "code", label: "Code", tags: ["code", "debug", "review"] },
  { id: "data", label: "Data & charts", tags: ["data", "chart", "diagram", "table"] },
  { id: "language", label: "Languages", tags: ["language", "translation"] },
  { id: "writing", label: "Writing", tags: ["writing", "editing", "email", "summary"] },
  { id: "study", label: "Study", tags: ["study", "learning", "explain", "quiz"] },
  { id: "everyday", label: "Everyday life", tags: ["food", "home"] },
  { id: "planning", label: "Planning & work", tags: ["planning", "work", "project", "productivity", "decision", "analysis"] },
  { id: "ideas", label: "Ideas", tags: ["ideas", "creative"] },
  { id: "other", label: "Other", tags: [] as string[] }
] as const;
export type SkillCategoryId = (typeof SKILL_CATEGORIES)[number]["id"];

export function categoryOf(s: Pick<Skill, "tags">): SkillCategoryId {
  return SKILL_CATEGORIES.find((c) => c.tags.some((t) => s.tags.includes(t)))?.id ?? "other";
}
