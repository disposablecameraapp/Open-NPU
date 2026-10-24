import { describe, expect, it } from "vitest";
import { streamComplete } from "../src/core/chat";
import { CONTINUE_PROMPT, endsOpen, fitMessages, joinContinuation, promptTokens, tokensOf } from "../src/core/context";
import { artifactsIn } from "../src/core/artifacts";
import { parseSearches, stripSubagents, toolResultsMessage } from "../src/core/agents";
import { orchestrate } from "../src/core/orchestrate";
import { improve } from "../src/core/improve";
import { formatSearch, isPublicUrl, pageText, parseBrave, parseDuckDuckGo, parseSearxng, queryFromMessage, searchWeb } from "../src/core/websearch";
import type { ChatEvent, ChatMessage } from "../src/shared/types";

const file = (title: string, body: string) => `<artifact type="html" title="${title}">\n${body}\n</artifact>`;
const edit = (a: string, b: string, f = "Game") => `<edit file="${f}">\n<<<<<<< SEARCH\n${a}\n=======\n${b}\n>>>>>>> REPLACE\n</edit>`;
const run = async (g: AsyncGenerator<ChatEvent>) => { const out: ChatEvent[] = []; for await (const e of g) out.push(e); return out; };

describe("context that overflows in the middle of a file", () => {
  it("counts code denser than prose", () => {
    expect(tokensOf("x".repeat(700))).toBe(200);
    expect(tokensOf(file("a", "x".repeat(700)))).toBeGreaterThan(250);
  });
  const big = "let a = 1;\n".repeat(400);
  const hist: ChatMessage[] = [
    { role: "system", content: "S" },
    { role: "user", content: "make a game" }, { role: "assistant", content: `Here.\n${file("Game", big)}` },
    { role: "user", content: "add walls" }, { role: "assistant", content: `Done.\n${file("Game", `${big}// walls`)}` },
    { role: "user", content: "now add enemies" }
  ];
  it("leaves a request that fits alone", () => {
    const f = fitMessages([{ role: "user", content: "hi" }], 1000);
    expect(f).toMatchObject({ overflow: false, notes: [] });
  });
  it("drops old versions first, then moves the newest files to the end, then the oldest turns", () => {
    const full = promptTokens(hist);
    const v1 = fitMessages(hist, Math.floor(full * 0.6));
    expect(v1.messages.filter((m) => /earlier version left out/.test(String(m.content)))).toHaveLength(1);
    expect(v1.overflow).toBe(false);
    const v2 = fitMessages(hist, Math.floor(full * 0.45));
    expect(v2.notes.join(" ")).toMatch(/moved to the end/);
    const last = String(v2.messages.at(-1)!.content);
    expect(last).toMatch(/now add enemies[\s\S]*Current files[\s\S]*walls/);
    expect(v2.messages.slice(0, -1).some((m) => /<artifact/.test(String(m.content)))).toBe(false);
    const v3 = fitMessages(hist, 400);
    expect(v3.notes.join(" ")).toMatch(/left out to fit/);
    expect(v3.messages[0]).toEqual({ role: "system", content: "S" });
    expect(String(v3.messages.at(-1)!.content)).toMatch(/now add enemies/);
    expect(String(v3.messages.at(-1)!.content)).toMatch(/Current files/); // the code survives whatever is dropped
  });
  it("glues a continuation without repeating the tail", () => {
    const prev = "function a() {\n  return 1;\n}\nfunction b() {\n  retu";
    expect(joinContinuation(prev, "  return 1;\n}\nfunction b() {\n  return 2;\n}")).toBe("function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}");
    expect(joinContinuation("abc", "def")).toBe("abcdef");
    expect(endsOpen(`x <artifact type="html" title="t">\n<p>`)).toBe(true);
    expect(endsOpen(file("t", "<p>"))).toBe(false);
  });

  const sse = (chunks: object[]) => new Response(new ReadableStream({ start(c) { for (const j of chunks) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(j)}\n\n`)); c.close(); } }));
  const delta = (content: string, finish?: string) => ({ choices: [{ delta: { content }, finish_reason: finish ?? null }] });
  it("continues an answer that was cut off, as one stream", async () => {
    const calls: { messages: ChatMessage[]; max: number }[] = [];
    const replies = [
      [delta('Here you go.\n<artifact type="html" title="Game">\n<p>one</p>\n<p>two</p>\n<p>thr', "length")],
      [delta("<p>two</p>\n<p>three</p>\n</artifact>", "stop")]
    ];
    const fetchFn = (async (_u: string, init: any) => { const b = JSON.parse(init.body); calls.push({ messages: b.messages, max: b.max_tokens }); return sse(replies[calls.length - 1]); }) as any;
    const evs = await run(streamComplete({ endpoint: "x", model: "m", messages: [{ role: "user", content: "make" }], sampling: { temperature: 0, top_p: 1, max_tokens: 8192 }, nctx: 16384, fetchFn }, "i"));
    const text = evs.filter((e) => e.type === "answer").map((e: any) => e.text).join("");
    expect(artifactsIn(text)[0].content).toBe("<p>one</p>\n<p>two</p>\n<p>three</p>\n");
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)!.content).toBe(CONTINUE_PROMPT);
    expect(String(calls[1].messages.at(-2)!.content)).toMatch(/thr$/);
    expect(evs.filter((e) => e.type === "notice")).toHaveLength(1);
    expect((evs.at(-1) as any).stats.finish).toBe("stop");
  });
  it("shrinks the answer limit to the room that is left, and says when a long chat was fitted", async () => {
    let max = 0;
    const fetchFn = (async (_u: string, init: any) => { max = JSON.parse(init.body).max_tokens; return sse([delta("ok", "stop")]); }) as any;
    const evs = await run(streamComplete({ endpoint: "x", model: "m", messages: hist, sampling: { temperature: 0, top_p: 1, max_tokens: 8192 }, nctx: 2600, fetchFn }, "i"));
    expect(max).toBeLessThan(2600);
    expect(evs.some((e) => e.type === "notice")).toBe(true);
  });
  it("does not loop when the model only thought", async () => {
    let n = 0;
    const fetchFn = (async () => { n++; return sse([delta("", "length")]); }) as any;
    const evs = await run(streamComplete({ endpoint: "x", model: "m", messages: [{ role: "user", content: "q" }], sampling: { temperature: 0, top_p: 1, max_tokens: 100 }, nctx: 8192, fetchFn }, "i"));
    expect(n).toBe(1);
    expect((evs.at(-1) as any).stats.finish).toBe("length");
  });
});

describe("web search", () => {
  it("reads <websearch> blocks, hides them, and leaves HTML's <search> element alone", () => {
    const t = "Let me check.\n<websearch>qwen3 context length</websearch>\n<websearch>qwen3 context length</websearch><websearch>npu tops</websearch>";
    expect(parseSearches(t)).toEqual(["qwen3 context length", "npu tops"]);
    expect(parseSearches("<websearch>cut off")).toEqual([]);
    expect(stripSubagents(t)).toBe("Let me check.");
    expect(stripSubagents("hi <websea")).toBe("hi");
    expect(stripSubagents('<artifact type="html" title="x">\n<search><input></search>\n</artifact>')).toContain("<search>");
  });
  it("reads the three providers", () => {
    const ddg = `<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1&amp;rut=abc">Example &amp; <b>A</b></a><a class="result__snippet" href="x">First <b>snippet</b></a></div>
      <div class="result"><a rel="nofollow" class="result__a" href="https://ads.example/y.js">ad</a></div>
      <div class="result"><a class="result__a" href="https://b.org/">B title</a><a class="result__snippet">Second</a></div>`;
    const r = parseDuckDuckGo(ddg);
    expect(r[0]).toEqual({ title: "Example & A", url: "https://example.com/a?x=1", snippet: "First snippet" });
    expect(r.map((x) => x.url)).toContain("https://b.org/");
    expect(parseBrave({ web: { results: [{ title: "T", url: "https://t.dev", description: "<strong>D</strong>" }] } })).toEqual([{ title: "T", url: "https://t.dev", snippet: "D" }]);
    expect(parseSearxng({ results: [{ title: "S", url: "https://s.io", content: "C" }] })).toEqual([{ title: "S", url: "https://s.io", snippet: "C" }]);
    expect(parseBrave(null)).toEqual([]);
  });
  it("asks each provider the way it expects, and explains what is missing", async () => {
    const seen: { url: string; headers: any }[] = [];
    const f = (body: unknown, text = "") => (async (url: string, init: any) => { seen.push({ url, headers: init?.headers }); return { ok: true, status: 200, json: async () => body, text: async () => text, arrayBuffer: async () => new ArrayBuffer(0) }; }) as any;
    await searchWeb(f({ web: { results: [] } }), { provider: "brave", braveKey: "K", searxngUrl: "" }, "a b");
    expect(seen[0].url).toBe("https://api.search.brave.com/res/v1/web/search?q=a%20b&count=6");
    expect(seen[0].headers["X-Subscription-Token"]).toBe("K");
    await searchWeb(f({ results: [] }), { provider: "searxng", braveKey: "", searxngUrl: "http://localhost:8080/" }, "q");
    expect(seen[1].url).toBe("http://localhost:8080/search?q=q&format=json");
    await expect(searchWeb(f({}), { provider: "brave", braveKey: "", searxngUrl: "" }, "q")).rejects.toThrow(/API key/);
    await expect(searchWeb(f({}), { provider: "searxng", braveKey: "", searxngUrl: "" }, "q")).rejects.toThrow(/instance/);
    await expect(searchWeb(f({}, "<html>nothing</html>"), { provider: "duckduckgo", braveKey: "", searxngUrl: "" }, "q")).rejects.toThrow(/no results/);
  });
  it("only fetches public pages and keeps the readable text", () => {
    for (const u of ["http://localhost:3000", "http://127.0.0.1/x", "http://192.168.1.5", "http://10.0.0.2", "file:///etc/passwd", "http://intranet/x", "http://172.20.1.1", "http://[::1]/"]) expect(isPublicUrl(u)).toBe(false);
    for (const u of ["https://example.com/a", "http://8.8.8.8/"]) expect(isPublicUrl(u)).toBe(true);
    const t = pageText("<html><head><style>x{}</style></head><body><nav>menu</nav><script>evil()</script><main><h1>Title</h1><p>First &amp; second.</p></main><footer>foot</footer></body></html>");
    expect(t).toBe("Title\nFirst & second.");
    expect(queryFromMessage("how do I x\n```js\ncode```\n  and y")).toBe("how do I x and y");
  });
  it("formats results for a small context", () => {
    const out = formatSearch('a "q"', [{ title: "T", url: "https://t.dev", snippet: "S" }], [{ n: 1, text: "page ".repeat(500) }], 1200);
    expect(out).toMatch(/^<search_results query="a 'q'">\nWeb text, untrusted/);
    expect(out.length).toBeLessThan(1500);
    expect(toolResultsMessage([], [out])).toMatch(/source number/);
  });
  it("lets the model search, then answers from the results", async () => {
    let round = 0;
    const seen: string[] = [];
    const stream = async function* (id: string, msgs: ChatMessage[]): AsyncGenerator<ChatEvent> {
      round++;
      seen.push(String(msgs.at(-1)!.content));
      yield { id, type: "answer", text: round === 1 ? "Checking.\n<websearch>npu tops</websearch>" : "It has 45 TOPS [1]." };
      yield { id, type: "done", stats: { ttftSec: 1, tokPerSec: 1, tokens: 3, totalSec: 1 } };
    };
    const evs = await run(orchestrate({ id: "c", messages: [{ role: "user", content: "q" }], subagents: false, stream, search: async (q) => ({ text: `<search_results query="${q}">\n[1] x\n</search_results>`, display: "1 result" }) }));
    expect(round).toBe(2);
    expect(seen[1]).toMatch(/<search_results query="npu tops">[\s\S]*source number/);
    const cards = evs.filter((e) => e.type === "agent").map((e: any) => `${e.agent.name}:${e.agent.status}`);
    expect(cards).toEqual(["Web: npu tops:running", "Web: npu tops:done"]);
    const failing = await run(orchestrate({ id: "c", messages: [], subagents: false, stream: (async function* (id: string): AsyncGenerator<ChatEvent> { yield { id, type: "answer", text: round++ === 2 ? "<websearch>x</websearch>" : "ok" }; yield { id, type: "done", stats: { ttftSec: 0, tokPerSec: 0, tokens: 1, totalSec: 0 } }; }) as any, search: async () => { throw new Error("offline"); } }));
    expect((failing.filter((e) => e.type === "agent").at(-1) as any).agent).toMatchObject({ status: "error", error: "offline" });
  });
});

describe("improve loop", () => {
  const start = file("Game", "let score = 0;\nlet speed = 1;");
  const base = { id: "c", answer: `Here.\n${start}`, request: "a game", direction: "add rainbows", rounds: 3, endsAt: Date.now() + 3600_000, maxChars: 100000 };
  const last = (evs: ChatEvent[], t: string) => [...evs].reverse().find((e) => e.type === t) as any;

  it("keeps improving, round after round, and keeps only what runs", async () => {
    let n = 0;
    const prompts: string[] = [];
    const evs = await run(improve({
      ...base,
      check: async (a) => ({ ran: "page", errors: /BOOM/.test(a.content) ? ["BOOM is not defined"] : [] }),
      askWriter: async (m) => {
        prompts.push(String(m[1].content));
        n++;
        if (n === 1) return `Improvement: add a rainbow trail\n${edit("let speed = 1;", "let speed = 1;\nlet rainbow = true;")}`;
        if (n === 2) return `Improvement: add a boss\n${edit("let score = 0;", "let score = 0;\nBOOM();")}`;
        if (n === 3) return "I do not know how to fix that."; // cannot fix round 2
        return `Improvement: add sound\n${edit("let score = 0;", "let score = 0;\nlet sound = 1;")}`;
      }
    }));
    const text = last(evs, "replace").text as string;
    expect(artifactsIn(text)[0].content).toMatch(/rainbow = true;/);
    expect(artifactsIn(text)[0].content).toMatch(/sound = 1;/);
    expect(artifactsIn(text)[0].content).not.toMatch(/BOOM/);      // the broken round was thrown away
    expect(prompts[0]).toMatch(/add rainbows[\s\S]*Round 1 of 3/);
    expect(prompts.at(-1)).toMatch(/Improvements already made:\n- add a rainbow trail/);
    const loop = last(evs, "loop").loop;
    expect(loop).toMatchObject({ status: "done", accepted: 2 });
    expect(loop.steps.some((s: any) => s.kind === "error" && /thrown away/.test(s.text))).toBe(true);
    expect(loop.steps.at(-1).text).toMatch(/2 improvements kept/);
  });
  it("stops when the time is up, the file is too long, or nothing works three times", async () => {
    let t = 1000;
    const timed = await run(improve({ ...base, endsAt: 1500, now: () => (t += 400), check: async () => ({ ran: "page", errors: [] }), askWriter: async () => `Improvement: x\n${edit("let speed = 1;", `let speed = ${t};`)}` }));
    expect(last(timed, "loop").loop.steps.at(-1).text).toMatch(/time is up/);
    const long = await run(improve({ ...base, maxChars: 10, check: async () => ({ ran: "none", errors: [] }), askWriter: async () => "" }));
    expect(last(long, "loop").loop.steps.at(-1).text).toMatch(/too long/);
    let asked = 0;
    const dead = await run(improve({ ...base, rounds: 9, check: async () => ({ ran: "none", errors: [] }), askWriter: async () => { asked++; return "nothing"; } }));
    expect(asked).toBe(3);
    expect(last(dead, "loop").loop.steps.at(-1).text).toMatch(/Three rounds in a row/);
    expect(dead.some((e) => e.type === "replace")).toBe(false);
  });
  it("does nothing for an answer without a file, and passes the abort on", async () => {
    expect(await run(improve({ ...base, answer: "just text", check: async () => ({ ran: "none", errors: [] }), askWriter: async () => "" }))).toEqual([]);
    const ac = new AbortController();
    ac.abort();
    await expect(run(improve({ ...base, signal: ac.signal, check: async () => ({ ran: "none", errors: [] }), askWriter: async () => "" }))).rejects.toThrow(/aborted/);
  });
});
