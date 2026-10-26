import type { AgentRun, ChatEvent, ChatMessage, ChatStats } from "../shared/types";
import { withAnswer } from "./chat";
import { badCitations } from "./websearch";
import { MAX_FOLDER_ROUNDS, describeCall, folderResult, folderResultsMessage, parseFolderCalls, type FolderCall } from "./folderTools";
import { MAX_AGENT_ROUNDS, WORKER_INSTRUCTIONS, parseImageQueries, parseSearches, parseSubagents, toolResultsMessage } from "./agents";

export interface OrchestrateOptions {
  id: string;
  messages: ChatMessage[];
  subagents: boolean;
  /** Runs one completion. `worker` marks a sub-agent call (own, shorter context). */
  stream: (id: string, messages: ChatMessage[], worker: boolean) => AsyncGenerator<ChatEvent>;
  signal?: AbortSignal;
  /** Runs one web search the model asked for. `text` goes back to the model, `display` is what the card shows. */
  search?: (query: string) => Promise<{ text: string; display: string; sources?: number }>;
  /** Looks up pictures for one query. `text` (the candidates) goes back to the model, `display` is what the card shows. */
  images?: (query: string) => Promise<{ text: string; display: string }>;
  /** Runs one look into the project's folder (list, read, search). Throws a readable message when it fails. */
  folder?: (call: FolderCall) => Promise<string> | string;
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
    if (total.answerSec == null) total.answerSec = s.answerSec;
    if (total.tokPerSec === null) total.tokPerSec = s.tokPerSec;
  };

  let searched = false;   // a search was run in this turn
  let sources = 0;        // how many numbered sources the successful searches gave
  for (let round = 0; ; round++) {
    let answer = "";
    for await (const ev of o.stream(o.id, messages, false)) {
      if (ev.type === "done") { add(ev.stats); continue; }
      answer = withAnswer(answer, ev);
      yield ev;
    }
    const calls = o.subagents && round < MAX_AGENT_ROUNDS ? parseSubagents(answer) : [];
    const queries = o.search && round < MAX_AGENT_ROUNDS ? parseSearches(answer) : [];
    const looks = o.folder && round < MAX_FOLDER_ROUNDS ? parseFolderCalls(answer) : [];
    const pics = o.images && round < MAX_AGENT_ROUNDS ? parseImageQueries(answer) : [];
    if (!calls.length && !queries.length && !looks.length && !pics.length) {
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
          if (ev.type === "answer" || ev.type === "retract") { agent.output = withAnswer(agent.output, ev); yield { id: o.id, type: "agent", agent: { ...agent } }; }
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
    const seen: string[] = [];
    for (const look of looks) {
      if (o.signal?.aborted) throw new Error("aborted");
      const d = describeCall(look);
      const card: AgentRun = { ...d, index: agentCount++, status: "running", output: "" };
      yield { id: o.id, type: "agent", agent: { ...card } };
      try {
        const body = await o.folder!(look);
        card.output = body.length > 4000 ? `${body.slice(0, 4000)}\n[…]` : body;
        card.status = "done";
        seen.push(folderResult(look, body));
      } catch (e) {
        if (o.signal?.aborted) throw e;
        card.status = "error";
        card.error = (e as Error).message;
        seen.push(folderResult(look, card.error, true));
      }
      yield { id: o.id, type: "agent", agent: { ...card } };
    }
    const shown: string[] = [];
    for (const q of pics) {
      if (o.signal?.aborted) throw new Error("aborted");
      const card: AgentRun = { name: `Picture: ${q}`, task: "Looking for a picture on Wikimedia Commons", index: agentCount++, status: "running", output: "", kind: "web" };
      yield { id: o.id, type: "agent", agent: { ...card } };
      try {
        const r = await o.images!(q);
        card.output = r.display;
        card.status = "done";
        shown.push(r.text);
      } catch (e) {
        if (o.signal?.aborted) throw e;
        card.status = "error";
        card.error = (e as Error).message;
        shown.push(`<image_results query="${q.replace(/"/g, "'")}">\n[the search failed: ${card.error}]\nAnswer without a picture.\n</image_results>`);
      }
      yield { id: o.id, type: "agent", agent: { ...card } };
    }
    yield { id: o.id, type: "answer", text: "\n\n" };
    const other = calls.length || queries.length ? toolResultsMessage(results, found, !!queries.length && failures === queries.length) : "";
    const pictures = shown.length ? `${shown.join("\n\n")}\n\nNow write your answer. Put the picture you choose (two at most) on a line of its own where it belongs, as ![caption](wikimedia:FILE NAME). Use only names listed above, or none.` : "";
    const content = [other, seen.length ? folderResultsMessage(seen, round + 1 >= MAX_FOLDER_ROUNDS) : "", pictures].filter(Boolean).join("\n\n");
    messages = [...messages, { role: "assistant", content: answer }, { role: "user", content }];
  }
  yield { id: o.id, type: "done", stats: total };
}
