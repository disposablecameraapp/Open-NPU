import type { AgentCall } from "../shared/types";

export const MAX_AGENTS_PER_ROUND = 6;
export const MAX_AGENT_ROUNDS = 3;

export const SUBAGENT_INSTRUCTIONS = [
  "You can delegate work to sub-agents. A sub-agent is a fresh copy of you that sees only the task you write for it, works alone, and sends back its answer.",
  "Use them when the user asks for it, or when a job splits into independent parts (researching several items, drafting several sections, comparing options).",
  'To delegate, write one block per sub-agent: <subagent name="short title">a complete, self-contained task</subagent>',
  `Write all blocks together (at most ${MAX_AGENTS_PER_ROUND}), then stop. The results come back to you in the next message and you write the final answer from them.`,
  "Do not delegate small questions you can answer yourself."
].join("\n");

export const WORKER_INSTRUCTIONS =
  "You are a sub-agent. Do exactly the task you are given, alone, and reply with the result only: no greeting, no questions, no mention of being a sub-agent. Be complete but compact; your answer is read by another assistant.";

const OPEN = "<subagent";
const CLOSE = "</subagent>";

function nameOf(tag: string): string {
  const m = tag.match(/name\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

/** Sub-agent blocks in a finished answer. A block without its closing tag (cut off by the token limit) is ignored. */
export function parseSubagents(text: string): AgentCall[] {
  const out: AgentCall[] = [];
  let pos = 0;
  for (;;) {
    const i = text.indexOf(OPEN, pos);
    if (i < 0) break;
    const gt = text.indexOf(">", i);
    if (gt < 0 || !/[\s>]/.test(text[i + OPEN.length] ?? " ")) break;
    const end = text.indexOf(CLOSE, gt);
    if (end < 0) break;
    const task = text.slice(gt + 1, end).trim();
    if (task) out.push({ name: nameOf(text.slice(i, gt)) || `Agent ${out.length + 1}`, task });
    pos = end + CLOSE.length;
  }
  return out.slice(0, MAX_AGENTS_PER_ROUND);
}

/** The answer without sub-agent blocks, also while a block is still streaming (held back, not shown as text). */
export function stripSubagents(text: string): string {
  let out = text.replace(/<subagent(?:\s[^>]*)?>[\s\S]*?<\/subagent>/gi, "");
  const open = out.search(/<subagent(?:\s|>|$)/i);
  if (open >= 0) out = out.slice(0, open);
  for (let k = Math.min(OPEN.length - 1, out.length); k > 0; k--) {
    if (OPEN.startsWith(out.slice(-k))) { out = out.slice(0, out.length - k); break; }
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** The user message that hands the sub-agents' results back to the model. */
export function resultsMessage(results: { name: string; task: string; output: string; error?: string }[]): string {
  const body = results.map((r) =>
    `<result name="${r.name.replace(/"/g, "'")}">\n${r.error ? `[failed: ${r.error}]` : r.output.trim() || "[empty answer]"}\n</result>`).join("\n");
  return `The sub-agents finished.\n${body}\nNow write your final answer for the user from these results. Do not delegate again.`;
}
