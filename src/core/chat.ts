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
  /** Fields this server refused earlier: not sent again. Filled in when a server refuses one, so the caller keeps it for the next request. */
  refused?: Set<string>;
  /** Called when the server refused optional fields and the request was sent again without them. */
  onDropped?: (fields: string[], serverSaid: string) => void;
}

/** Optional request fields: leaving one out changes how the answer is written, not what is asked. */
const OPTIONAL_FIELDS = ["stream_options", "top_k", "presence_penalty", "frequency_penalty", "repetition_penalty", "top_p"];

/** The optional fields a 400 answer complains about; with no field named, the penalties and `top_k`, which are the usual ones. */
export function droppableFields(errorText: string, body: Record<string, unknown>): string[] {
  if (!/unsupported|unknown|not supported|unrecognized|invalid/i.test(errorText)) return [];
  const present = OPTIONAL_FIELDS.filter((k) => k in body);
  const named = present.filter((k) => errorText.includes(k) || (/penalt/i.test(errorText) && /penalty/.test(k)));
  return named.length ? named : present.filter((k) => k !== "top_p" && k !== "stream_options");
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
  // A server that does not know an optional field answers 400 and names it (Foundry Local refuses a non-zero penalty): the fields that are
  // only a preference are dropped, and the request is sent again, rather than the whole test failing for a setting.
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    stream_options: { include_usage: true },
    ...opts.body,
    ...requestSampling(opts.sampling)
  };
  for (const k of opts.refused ?? []) delete body[k];
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await f(`${opts.endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify(body)
    });
    if (res.ok && res.body) break;
    const text = await res.text().catch(() => "");
    const dropped = res.status === 400 && attempt < 3 ? droppableFields(text, body) : [];
    if (!dropped.length) throw new Error(`Server error ${res.status}: ${text.slice(0, 400)}`);
    for (const k of dropped) { delete body[k]; opts.refused?.add(k); }
    opts.onDropped?.(dropped, text.slice(0, 240));
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

  try {
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
  } catch (e) {
    // The connection was cut before the first word ("terminated"): some servers cannot stream. The same request is sent once without streaming,
    // which either answers or says why in plain words.
    if (opts.signal?.aborted || chunks > 0 || (e as Error).name === "AbortError") throw e;
    yield* completeOnce(opts, f, body, id, now, t0, (e as Error).message);
    return;
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

/** The answer of a request made without streaming, given as the same events a stream gives. */
async function* completeOnce(opts: StreamOptions, f: typeof fetch, body: Record<string, unknown>, id: string, now: () => number, t0: number, streamError: string): AsyncGenerator<ChatEvent> {
  const plain: Record<string, unknown> = { ...body, stream: false };
  delete plain.stream_options;
  const res = await f(`${opts.endpoint}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: opts.signal, body: JSON.stringify(plain) }).catch((e) => { throw new Error(`${streamError}; asked again without streaming: ${(e as Error).message}`); });
  const text = await res.text().catch((e) => { throw new Error(`${streamError}; asked again without streaming: ${(e as Error).message}`); });
  if (!res.ok) throw new Error(`Server error ${res.status} (the stream was cut: ${streamError}): ${text.slice(0, 400)}`);
  let j: { choices?: { message?: { content?: string; reasoning_content?: string }; finish_reason?: string }[]; usage?: { completion_tokens?: number } };
  try { j = JSON.parse(text); } catch { throw new Error(`${streamError}; the server's answer without streaming was not readable: ${text.slice(0, 200)}`); }
  const m = j.choices?.[0]?.message;
  if (m?.reasoning_content) yield { id, type: "thinking", text: m.reasoning_content };
  if (m?.content) yield { id, type: "answer", text: m.content };
  const total = Math.round(((now() - t0) / 1000) * 100) / 100;
  const tokens = j.usage?.completion_tokens ?? 0;
  // no first word is seen without streaming: the time to the first token is not known, and the speed is the whole answer over the whole time
  yield { id, type: "done", stats: { finish: j.choices?.[0]?.finish_reason ?? null, ttftSec: null, tokPerSec: total > 0.05 && tokens > 1 ? Math.round((tokens / total) * 10) / 10 : null, tokens, totalSec: total } };
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

/** Cleans a model's title: first line, no quotes or trailing punctuation, a handful of words. */
export function cleanTitle(raw: string): string {
  const line = raw.replace(/<think>[\s\S]*?<\/think>/g, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const t = line.replace(/^(title|name)\s*:\s*/i, "").replace(/^["'“”‘’`*#\s]+|["'“”‘’`*.!\s]+$/g, "").replace(/\s+/g, " ");
  return t.split(" ").slice(0, 8).join(" ").slice(0, 60);
}
