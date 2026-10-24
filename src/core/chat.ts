import { ChatEvent, ChatMessage, ChatStats, Sampling } from "../shared/types";
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
    ttftSec: tFirst !== null ? Math.round(((tFirst - t0) / 1000) * 100) / 100 : null,
    tokPerSec: genSec > 0.05 && tokens > 1 ? Math.round(((tokens - 1) / genSec) * 10) / 10 : null,
    tokens,
    totalSec: Math.round(((tEnd - t0) / 1000) * 100) / 100
  };
  yield { id, type: "done", stats };
}
