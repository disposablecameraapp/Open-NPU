import type { AgentRun, ChatEvent, ChatMessage, ChatStats } from "../shared/types";
import { badCitations } from "./websearch";
import { MAX_AGENT_ROUNDS, WORKER_INSTRUCTIONS, parseSearches, parseSubagents, toolResultsMessage } from "./agents";

export interface OrchestrateOptions {
  id: string;
  messages: ChatMessage[];
  subagents: boolean;
  /** Runs one completion. `worker` marks a sub-agent call (own, shorter context). */
  stream: (id: string, messages: ChatMessage[], worker: boolean) => AsyncGenerator<ChatEvent>;
  signal?: AbortSignal;
  /** Runs one web search the model asked for. `text` goes back to the model, `display` is what the card shows. */
  search?: (query: string) => Promise<{ text: string; display: string; sources?: number }>;
}

/**
 * One assistant turn, possibly with sub-agents. The model answers; if its answer holds <subagent> blocks each one runs
 * as its own completion, one after another (the NPU holds a single model), and the results go back to the model, which
 * then writes the final answer. Events of the model's own rounds pass through; sub-agent progress is sent as "agent".
 */
export async function* orchestrate(o: OrchestrateOptions): AsyncGenerator<ChatEvent> {
  let messages = o.messages;
  let agentCount = 0;
  const total: ChatStats = { ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0 };
  const add = (s: ChatStats) => {
    total.tokens += s.tokens;
    total.totalSec = Math.round((total.totalSec + s.totalSec) * 100) / 100;
    if (total.ttftSec === null) total.ttftSec = s.ttftSec;
    if (total.tokPerSec === null) total.tokPerSec = s.tokPerSec;
  };

  let searched = false;   // a search was run in this turn
  let sources = 0;        // how many numbered sources the successful searches gave
  for (let round = 0; ; round++) {
    let answer = "";
    for await (const ev of o.stream(o.id, messages, false)) {
      if (ev.type === "done") { add(ev.stats); continue; }
      if (ev.type === "answer") answer += ev.text;
      yield ev;
    }
    const calls = o.subagents && round < MAX_AGENT_ROUNDS ? parseSubagents(answer) : [];
    const queries = o.search && round < MAX_AGENT_ROUNDS ? parseSearches(answer) : [];
    if (!calls.length && !queries.length) {
      if (searched) {
        const bad = badCitations(answer, sources);
        if (bad.length) yield { id: o.id, type: "notice", text: sources ? `The answer cites ${bad.map((n) => `[${n}]`).join(", ")}, which is not among the ${sources} sources found. Treat those claims as unverified.` : "The answer cites web sources, but no web search succeeded. Treat those citations as made up." };
      }
      break;
    }

    const results: { name: string; task: string; output: string; error?: string }[] = [];
    for (const call of calls) {
      if (o.signal?.aborted) throw new Error("aborted");
      const agent: AgentRun = { ...call, index: agentCount++, status: "running", output: "" };
      yield { id: o.id, type: "agent", agent: { ...agent } };
      try {
        const worker: ChatMessage[] = [{ role: "system", content: WORKER_INSTRUCTIONS }, { role: "user", content: call.task }];
        for await (const ev of o.stream(`${o.id}:agent:${agent.index}`, worker, true)) {
          if (ev.type === "answer") { agent.output += ev.text; yield { id: o.id, type: "agent", agent: { ...agent } }; }
          else if (ev.type === "done") add(ev.stats);
        }
        agent.status = "done";
      } catch (e) {
        if (o.signal?.aborted) throw e;
        agent.status = "error";
        agent.error = (e as Error).message;
      }
      yield { id: o.id, type: "agent", agent: { ...agent } };
      results.push({ name: call.name, task: call.task, output: agent.output, error: agent.error });
    }
    const found: string[] = [];
    let failures = 0;
    for (const query of queries) {
      if (o.signal?.aborted) throw new Error("aborted");
      const card: AgentRun = { name: `Web: ${query}`, task: "Searching the web", index: agentCount++, status: "running", output: "", kind: "web" };
      yield { id: o.id, type: "agent", agent: { ...card } };
      try {
        const r = await o.search!(query);
        card.output = r.display;
        card.status = "done";
        found.push(r.text);
        sources = Math.max(sources, r.sources ?? 0);
      } catch (e) {
        if (o.signal?.aborted) throw e;
        card.status = "error";
        card.error = (e as Error).message;
        failures++;
        found.push(`<search_results query="${query.replace(/"/g, "'")}">\n[search failed: ${card.error}]\n</search_results>`);
      }
      yield { id: o.id, type: "agent", agent: { ...card } };
    }
    if (queries.length) searched = true;
    yield { id: o.id, type: "answer", text: "\n\n" };
    messages = [...messages, { role: "assistant", content: answer }, { role: "user", content: toolResultsMessage(results, found, !!queries.length && failures === queries.length) }];
  }
  yield { id: o.id, type: "done", stats: total };
}
