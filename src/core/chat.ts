import { ChatEvent, ChatMessage, ChatStats, Sampling } from "../shared/types";
import { CONTINUE_PROMPT, endsOpen, fitMessages, joinContinuation, replyReserve } from "./context";
import { requestSampling } from "./sampling";

/**
 * Splits a streamed completion into hidden thinking and the visible answer.
 * Handles tags broken across chunks and templates that open the thought in the prompt
 * (output starts inside the thought and only a closing </think> appears).
 */
export class ThinkSplitter {
  private buf = "";
  private inThink: boolean;
  private seenAny = false;
  /** A closing </think> was met. */
  closed = false;
  constructor(assumeOpen = false) {
    this.inThink = assumeOpen;
  }

  push(chunk: string): { thinking: string; answer: string } {
    this.buf += chunk;
    let thinking = "";
    let answer = "";
    for (;;) {
      if (!this.inThink && !this.seenAny) {
        // only treat an opening tag as a tag at the very start
        const t = this.buf.trimStart();
        if ("<think>".startsWith(t) && t.length < "<think>".length) break; // might become a tag
      }
      const tag = this.inThink ? "</think>" : "<think>";
      const i = this.buf.indexOf(tag);
      if (i >= 0) {
        const before = this.buf.slice(0, i);
        if (this.inThink) thinking += before;
        else answer += before;
        this.buf = this.buf.slice(i + tag.length);
        if (this.inThink) this.closed = true;
        this.inThink = !this.inThink;
        this.seenAny = true;
        continue;
      }
      // keep a possible partial tag at the end
      let keep = 0;
      for (let k = Math.min(tag.length - 1, this.buf.length); k > 0; k--) {
        if (tag.startsWith(this.buf.slice(-k))) { keep = k; break; }
      }
      const out = this.buf.slice(0, this.buf.length - keep);
      this.buf = this.buf.slice(this.buf.length - keep);
      if (this.inThink) thinking += out;
      else answer += out;
      if (out) this.seenAny = true;
      break;
    }
    return { thinking, answer };
  }

  /** The server sends the thinking in its own field: what is in `content` is the answer. */
  leaveThink() {
    this.inThink = false;
    this.seenAny = true;
  }

  flush(): { thinking: string; answer: string } {
    const rest = this.buf;
    this.buf = "";
    return this.inThink ? { thinking: rest, answer: "" } : { thinking: "", answer: rest };
  }
}

/** Parse one SSE `data:` payload; returns null for [DONE] / keep-alives. */
export function parseSseData(data: string): { content?: string; reasoning?: string; usageTokens?: number; finish?: string } | null {
  const d = data.trim();
  if (!d || d === "[DONE]") return null;
  let j: any;
  try { j = JSON.parse(d); } catch { return null; }
  const delta = j.choices?.[0]?.delta ?? {};
  return {
    content: typeof delta.content === "string" ? delta.content : undefined,
    reasoning: typeof delta.reasoning_content === "string" ? delta.reasoning_content : typeof delta.reasoning === "string" ? delta.reasoning : undefined,
    usageTokens: typeof j.usage?.completion_tokens === "number" ? j.usage.completion_tokens : undefined,
    finish: j.choices?.[0]?.finish_reason ?? undefined
  };
}

export interface StreamOptions {
  endpoint: string; // http://127.0.0.1:18181/v1
  model: string;
  messages: ChatMessage[];
  sampling: Sampling;
  signal?: AbortSignal;
  now?: () => number;
  fetchFn?: typeof fetch;
  /** Extra request fields (thinking switch). Sampling fields win on conflict. */
  body?: Record<string, unknown>;
  /** The chat template opens <think> itself (Thinking / Reasoning releases), so the output starts inside the thought. */
  thinkOpen?: boolean;
}

/**
 * Stream a chat completion, yielding thinking / answer deltas and a final stats event.
 * tok/s is computed on generation time (after the first token); tokens come from usage when
 * the server sends it, otherwise the number of content chunks.
 */
export async function* streamChat(opts: StreamOptions, id: string): AsyncGenerator<ChatEvent> {
  const now = opts.now ?? (() => performance.now());
  const f = opts.fetchFn ?? fetch;
  const t0 = now();
  const res = await f(`${opts.endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      stream_options: { include_usage: true },
      ...opts.body,
      ...requestSampling(opts.sampling)
    })
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Server error ${res.status}: ${text.slice(0, 400)}`);
  }

  const splitter = new ThinkSplitter(!!opts.thinkOpen);
  let thought = "";
  let viaField = false;
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let sse = "";
  let tFirst: number | null = null;
  let chunks = 0;
  let usageTokens: number | undefined;
  let finish: string | null = null;

  const emit = function* (t: string, a: string): Generator<ChatEvent> {
    if (t) { thought += t; yield { id, type: "thinking", text: t }; }
    if (a) yield { id, type: "answer", text: a };
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    sse += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = sse.indexOf("\n")) >= 0) {
      const line = sse.slice(0, nl).replace(/\r$/, "");
      sse = sse.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const p = parseSseData(line.slice(5));
      if (!p) continue;
      if (p.usageTokens !== undefined) usageTokens = p.usageTokens;
      if (p.finish) finish = p.finish;
      if (p.reasoning) {
        if (!viaField) { viaField = true; splitter.leaveThink(); }
        if (tFirst === null) tFirst = now();
        chunks++;
        yield { id, type: "thinking", text: p.reasoning };
      }
      if (p.content) {
        if (tFirst === null) tFirst = now();
        chunks++;
        const s = splitter.push(p.content);
        yield* emit(s.thinking, s.answer);
      }
    }
  }
  const rest = splitter.flush();
  yield* emit(rest.thinking, rest.answer);
  // assumed an open thought, but it never closed and nothing came apart: it was the answer all along
  if (opts.thinkOpen && !viaField && !splitter.closed && thought.trim()) yield { id, type: "answer", text: thought };

  const tEnd = now();
  const tokens = usageTokens ?? chunks;
  const genSec = tFirst !== null ? (tEnd - tFirst) / 1000 : 0;
  const stats: ChatStats = {
    finish,
    ttftSec: tFirst !== null ? Math.round(((tFirst - t0) / 1000) * 100) / 100 : null,
    tokPerSec: genSec > 0.05 && tokens > 1 ? Math.round(((tokens - 1) / genSec) * 10) / 10 : null,
    tokens,
    totalSec: Math.round(((tEnd - t0) / 1000) * 100) / 100
  };
  yield { id, type: "done", stats };
}

export interface CompleteOptions extends StreamOptions {
  /** The context window of the running server, in tokens. */
  nctx: number;
  /** How many times a cut-off answer is continued. */
  maxContinues?: number;
}

/**
 * streamChat that does not run out of context in the middle of an answer. The request is fitted to the window first
 * (old file versions out, files moved to the end, oldest turns left out), the answer limit is cut to what is left, and an
 * answer that is still cut off (finish "length") is continued from where it stopped, up to a few times, as one stream.
 */
export async function* streamComplete(opts: CompleteOptions, id: string): AsyncGenerator<ChatEvent> {
  const maxContinues = opts.maxContinues ?? 3;
  let all = "";
  let total: ChatStats | null = null;
  let finish: string | null = null;
  for (let n = 0; ; n++) {
    const messages = n === 0 ? opts.messages : [...opts.messages, { role: "assistant" as const, content: all }, { role: "user" as const, content: CONTINUE_PROMPT }];
    const reserve = replyReserve(opts.nctx, opts.sampling.max_tokens);
    const fit = fitMessages(messages, opts.nctx - reserve);
    if (fit.notes.length && n === 0) yield { id, type: "notice", text: fit.notes.join(" ") };
    if (fit.overflow && n === 0) yield { id, type: "notice", text: `Still too long: the request is about ${fit.tokens.toLocaleString()} tokens for a window of ${opts.nctx.toLocaleString()}, so the answer may be cut. A file this long needs a model with a bigger window, or a new chat.` };
    else if (n === 0 && fit.tokens > opts.nctx * 0.4) yield { id, type: "notice", text: `Reading about ${fit.tokens.toLocaleString()} tokens before the first word (window ${opts.nctx.toLocaleString()}): the model re-reads the conversation and the code at every message. Its thoughts are never sent back.` };
    const room = opts.nctx - fit.tokens - 128;
    const sampling = { ...opts.sampling, max_tokens: Math.max(256, Math.min(opts.sampling.max_tokens, room)) };

    let part = "";
    let held = "";      // the start of a continuation, kept until the repeated tail can be cut
    let flushed = n === 0;
    for await (const ev of streamChat({ ...opts, messages: fit.messages, sampling }, id)) {
      if (ev.type === "done") {
        total = total ? { ...ev.stats, tokens: total.tokens + ev.stats.tokens, totalSec: Math.round((total.totalSec + ev.stats.totalSec) * 100) / 100, ttftSec: total.ttftSec ?? ev.stats.ttftSec } : ev.stats;
        finish = ev.stats.finish ?? null;
        continue;
      }
      if (ev.type !== "answer") { yield ev; continue; }
      if (flushed) { part += ev.text; all += ev.text; yield ev; continue; }
      held += ev.text;
      if (held.length < 320) continue;
      flushed = true;
      const joined = joinContinuation(all, held);
      const add = joined.slice(all.length);
      part = held;
      all = joined;
      if (add) yield { id, type: "answer", text: add };
    }
    if (!flushed && held) {
      const joined = joinContinuation(all, held);
      const add = joined.slice(all.length);
      part = held;
      all = joined;
      if (add) yield { id, type: "answer", text: add };
    }
    const more = finish === "length" && all.trim().length > 0 && n < maxContinues && (endsOpen(all) || part.trim().length > 0);
    if (!more) break;
    yield { id, type: "notice", text: `The answer hit the limit and was continued (${n + 1}).` };
  }
  yield { id, type: "done", stats: { ...(total ?? { ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0 }), finish } };
}
