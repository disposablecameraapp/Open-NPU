import type { CatalogEntry, ChatMessage, Effort } from "../shared/types";

export const EFFORTS: { id: Effort; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Answer directly, no thinking" },
  { id: "low", label: "Low", hint: "Think briefly" },
  { id: "medium", label: "Medium", hint: "Model default" },
  { id: "high", label: "High", hint: "Think carefully, check the work" }
];

export type ThinkingSupport = "toggle" | "always" | "none";

/**
 * What a model can do with the thinking level.
 * toggle = the chat template can switch thinking off; always = a "thinking" / "reasoning" release that always thinks
 * (it can still be nudged to think less or more); none = not a thinking model, the menu hides the row.
 */
export function thinkingSupport(entry: Pick<CatalogEntry, "id" | "name" | "repo">): ThinkingSupport {
  const s = `${entry.id} ${entry.name} ${entry.repo}`.toLowerCase();
  if (/thinking|reasoning|nanbeige|deepseek-r1|-r1\b|qwq/.test(s)) return "always";
  if (/qwen[-_ ]?3|nemotron|gpt-oss|smollm3|hermes/.test(s)) return "toggle";
  return "none";
}

export function visionSupport(entry: Pick<CatalogEntry, "id" | "name" | "repo">): boolean {
  return /(^|[-_ ./])vl([-_ ./]|$)|vision|llava|pixtral|smolvlm|minicpm-v|gemma[-_ ]?3|moondream|qwen[-_ ]?3[._]?[5-9]\b|qwen[-_ ]?[4-9]|gemma[-_ ]?4|llama[-_ ]?4|internvl|paligemma|idefics|molmo|glm[-_ ]?4\.?[1-9]?v|kimi[-_ ]?vl|mistral[-_ ]?small[-_ ]?3\.[1-9]|ministral[-_ ]?3|phi[-_ ]?4[-_ ]multimodal/i.test(`${entry.id} ${entry.name} ${entry.repo}`);
}

/**
 * How much a helper session thinks. Writing code is done at low effort (thinking only delays the file); mending a file from an
 * error, where a wrong guess costs a whole round, gets room to think.
 */
export function stageEffort(sid: string, tokPerSec?: number | null): Effort {
  // thinking costs minutes at the speed of a small model on this chip: it is only worth it where tokens come fast
  return /:(?:repair|fix)(?::|$)/.test(sid) && (tokPerSec ?? 0) >= 20 ? "medium" : "low";
}

/** Levels the menu offers for a model. "Off" only exists where the template can really switch thinking off. */
export function effortsFor(support: ThinkingSupport): Effort[] {
  return support === "toggle" ? ["off", "low", "medium", "high"] : support === "always" ? ["low", "medium", "high"] : [];
}

/** A saved level the model cannot do (e.g. Off on an always-thinking model) falls to the nearest one it can. */
export function effectiveEffort(effort: Effort, support: ThinkingSupport): Effort | null {
  const allowed = effortsFor(support);
  if (!allowed.length) return null;
  if (allowed.includes(effort)) return effort;
  return effort === "off" ? "low" : "medium";
}

const HINT: Partial<Record<Effort, string>> = {
  low: "Think only briefly before answering: a few short lines at most.",
  high: "Think carefully and thoroughly before answering, and check your work."
};

/**
 * Extra request fields and message edits for one thinking level.
 * Servers differ on how they take the switch, so the common spellings are sent together and the unknown ones ignored:
 * chat_template_kwargs.enable_thinking (llama.cpp / Qwen3 templates), reasoning_effort (gpt-oss style), and Qwen3's
 * "/no_think" soft switch. Low and High are a best-effort nudge in the system prompt; only Off is a hard switch.
 */
export function applyEffort(
  effort: Effort | null, messages: ChatMessage[], entry: Pick<CatalogEntry, "id" | "name" | "repo">
): { messages: ChatMessage[]; body: Record<string, unknown> } {
  if (!effort) return { messages, body: {} };
  const body: Record<string, unknown> = {};
  let out = messages;
  if (effort === "off") {
    body.chat_template_kwargs = { enable_thinking: false };
    body.reasoning_effort = "none";
    if (/qwen[-_ ]?3/i.test(`${entry.id} ${entry.name}`)) out = appendToLastUser(out, "/no_think");
    if (/nemotron/i.test(entry.id + entry.name)) out = withSystem(out, "detailed thinking off");
  } else {
    body.chat_template_kwargs = { enable_thinking: true };
    body.reasoning_effort = effort;
    const hint = HINT[effort];
    if (hint) out = withSystem(out, hint);
  }
  return { messages: out, body };
}

export function withSystem(messages: ChatMessage[], line: string): ChatMessage[] {
  const i = messages.findIndex((m) => m.role === "system");
  if (i < 0) return [{ role: "system", content: line }, ...messages];
  const m = messages[i];
  const text = typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("");
  return messages.map((x, k) => (k === i ? { ...x, content: `${text}\n\n${line}` } : x));
}

function appendToLastUser(messages: ChatMessage[], line: string): ChatMessage[] {
  const i = [...messages].map((m) => m.role).lastIndexOf("user");
  if (i < 0) return messages;
  const m = messages[i];
  const content = typeof m.content === "string" ? `${m.content} ${line}` : [...m.content, { type: "text" as const, text: line }];
  return messages.map((x, k) => (k === i ? { ...x, content } : x));
}
