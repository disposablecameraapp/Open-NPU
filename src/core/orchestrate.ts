import type { AgentRun, ChatEvent, ChatMessage, ChatStats } from "../shared/types";
import { MAX_AGENT_ROUNDS, WORKER_INSTRUCTIONS, parseSubagents, resultsMessage } from "./agents";

export interface OrchestrateOptions {
  id: string;
  messages: ChatMessage[];
  subagents: boolean;
  /** Runs one completion. `worker` marks a sub-agent call (own, shorter context). */
  stream: (id: string, messages: ChatMessage[], worker: boolean) => AsyncGenerator<ChatEvent>;
  signal?: AbortSignal;
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

  for (let round = 0; ; round++) {
    let answer = "";
    for await (const ev of o.stream(o.id, messages, false)) {
      if (ev.type === "done") { add(ev.stats); continue; }
      if (ev.type === "answer") answer += ev.text;
      yield ev;
    }
    const calls = o.subagents && round < MAX_AGENT_ROUNDS ? parseSubagents(answer) : [];
    if (!calls.length) break;

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
    yield { id: o.id, type: "answer", text: "\n\n" };
    messages = [...messages, { role: "assistant", content: answer }, { role: "user", content: resultsMessage(results) }];
  }
  yield { id: o.id, type: "done", stats: total };
}
