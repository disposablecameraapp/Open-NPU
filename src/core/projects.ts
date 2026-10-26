import type { Project } from "../shared/types";
import { ARTIFACT_INSTRUCTIONS, VOICE_RULES } from "./artifacts";
import { VISUAL_OVERVIEW, visualRules, type VisualRoute } from "./visualRoute";
import { BLOCK_INSTRUCTIONS } from "./blocks";

export interface PromptParts {
  custom?: string;
  project?: Project | null;
  /** A system prompt typed into the chat itself. */
  extra?: string;
  artifacts?: boolean;
  /** The request is for a picture (chart, calculator, diagram): its rules replace the artifact rules. */
  visual?: VisualRoute | null;
  /** Characters of project knowledge allowed (context is the NPU's scarce resource). */
  knowledgeChars: number;
}

/** Roughly 3.5 characters per token; knowledge may use at most a third of the context window. */
export function knowledgeBudget(contextTokens: number): number {
  return Math.max(2000, Math.floor((contextTokens / 3) * 3.5));
}

export function knowledgeSize(p: Project): number {
  return p.files.reduce((n, f) => n + f.content.length, 0);
}

/** Splits the budget fairly: small files stay whole, big ones are cut. Returns the text and what was left out. */
export function packKnowledge(p: Project, budget: number): { text: string; truncated: string[] } {
  const files = p.files.filter((f) => f.content.trim());
  const truncated: string[] = [];
  let left = budget;
  const parts: string[] = [];
  const order = [...files].sort((a, b) => a.content.length - b.content.length);
  const share = new Map<string, number>();
  order.forEach((f, i) => {
    const fair = Math.floor(left / (order.length - i));
    const take = Math.min(f.content.length, Math.max(fair, 0));
    share.set(f.id, take);
    left -= take;
  });
  for (const f of files) {
    const take = share.get(f.id) ?? 0;
    const cut = take < f.content.length;
    if (cut) truncated.push(f.name);
    parts.push(`<file name="${f.name.replace(/"/g, "'")}">\n${f.content.slice(0, take)}${cut ? "\n[…cut to fit the model's context]" : ""}\n</file>`);
  }
  return { text: parts.join("\n"), truncated };
}

/** The system message for a chat or a scheduled task. Empty string when there is nothing to say. */
export function buildSystemPrompt(o: PromptParts): string {
  const out: string[] = [];
  // a small model takes a first-person note for its own identity ("I'm Fabien, a software engineer" came back as its own answer): say whose it is
  if (o.custom?.trim()) out.push(`Notes the user wrote about themselves and how they like answers. In these notes "I" and "my" are the USER, never you; you are the assistant. Use them quietly, and do not mention them unless they matter:\n"""\n${o.custom.trim()}\n"""`);
  const p = o.project;
  if (p) {
    out.push(`You are working inside the project "${p.name}".${p.description.trim() ? ` ${p.description.trim()}` : ""}`);
    if (p.instructions.trim()) out.push(`Project instructions:\n${p.instructions.trim()}`);
    const k = packKnowledge(p, o.knowledgeChars);
    if (k.text) out.push(`Project knowledge (reference material the user added; use it when relevant):\n${k.text}`);
  }
  if (o.extra?.trim()) out.push(o.extra.trim());
  // a request for a picture gets the rules of that picture and no artifact rules: the model has nothing to write a page for
  if (o.visual) out.push(VOICE_RULES, visualRules(o.visual), BLOCK_INSTRUCTIONS);
  else if (o.artifacts !== false) out.push(VOICE_RULES, ARTIFACT_INSTRUCTIONS, VISUAL_OVERVIEW, BLOCK_INSTRUCTIONS);
  return out.join("\n\n");
}
