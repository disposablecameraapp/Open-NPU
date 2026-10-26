import { describe, expect, it } from "vitest";
import { streamComplete } from "../src/core/chat";
import { compactConversation, compacted, foldHead, planCompaction, summaryMessages, wantsCompaction } from "../src/core/compaction";
import { fitMessages, isContextOverflow, promptTokens } from "../src/core/context";
import { digestOf, hashText, isFilesMessage, isMemoMessage, memoBody, memoMessage, usableMemo } from "../src/core/memo";
import { latestArtifacts } from "../src/core/review";
import type { ChatEvent, ChatMessage } from "../src/shared/types";

const file = (title: string, body: string) => `<artifact type="html" title="${title}">\n${body}\n</artifact>`;
const talk = (n: number, size = 300): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => [
    { role: "user" as const, content: `Question ${i}: ${"detail ".repeat(size / 7)}` },
    { role: "assistant" as const, content: `Answer ${i}. ${"more words ".repeat(size / 11)}` }
  ]).flat();
const withDraft = (conv: ChatMessage[], draft = "and now?"): ChatMessage[] => [{ role: "system", content: "S" }, ...conv, { role: "user", content: draft }];

describe("the memo of a conversation", () => {
  it("is only used while the turns it stands for are still there", () => {
    const turns = [{ content: "a" }, { content: "b" }, { content: "c" }];
    const memo = { text: "the gist", turns: 2, hash: hashText("b"), at: 1 };
    expect(usableMemo(turns, memo)).toBe(memo);
    expect(usableMemo([{ content: "a" }, { content: "edited" }, { content: "c" }], memo)).toBeNull(); // the last covered turn changed
    expect(usableMemo([{ content: "a" }], memo)).toBeNull(); // the chat was cut back
    expect(usableMemo(turns, null)).toBeNull();
    expect(usableMemo(turns, { ...memo, text: " " })).toBeNull();
  });
  it("is recognized and read back from its message", () => {
    const m = memoMessage("- Goal: a snake game");
    expect(isMemoMessage(m)).toBe(true);
    expect(memoBody(m)).toBe("- Goal: a snake game");
  });
  it("makes a recap without a model: one line per message, files named, the summary kept first", () => {
    const d = digestOf([memoMessage("Goal: a quiz app"), { role: "user", content: "make it blue" }, { role: "assistant", content: `Done, it is blue now. More.\n${file("Quiz", "x".repeat(900))}` }], 800);
    expect(d).toMatch(/Goal: a quiz app/);
    expect(d).toMatch(/User: make it blue/);
    expect(d).toMatch(/Assistant: Done, it is blue now\. \(wrote: Quiz\)/);
    expect(d.length).toBeLessThanOrEqual(800);
    expect(digestOf(talk(60), 600).length).toBeLessThanOrEqual(600);
  });
});

describe("where a conversation is cut", () => {
  it("keeps the latest exchange and the draft, and starts the tail on a user message", () => {
    const ms = withDraft(talk(10));
    const plan = planCompaction(ms, 400)!;
    expect(plan.sys).toEqual([ms[0]]);
    expect(plan.draft).toEqual(ms.at(-1));
    expect(plan.tail[0].role).toBe("user");
    expect(plan.tail.length).toBeGreaterThanOrEqual(2);
    expect(plan.head.length + plan.tail.length).toBe(20);
    expect(plan.turns).toBe(plan.head.length);
  });
  it("has nothing to do with a short chat", () => {
    expect(planCompaction(withDraft(talk(1)), 5000)).toBeNull();
    expect(planCompaction([{ role: "user", content: "hi" }], 100)).toBeNull();
  });
  it("does not count the memo and files messages as turns when it cuts again", () => {
    const first = withDraft(talk(10));
    const p1 = planCompaction(first, 400)!;
    const folded = compacted(p1, "summary one");
    expect(isMemoMessage(folded[1])).toBe(true);
    const grown = [...folded.slice(0, -1), ...talk(8), folded.at(-1)!];
    const p2 = planCompaction(grown, 400)!;
    expect(isMemoMessage(p2.head[0])).toBe(true);
    expect(p2.turns).toBe(p2.head.length - 1);
  });
  it("tells when a chat is past the point where it is summarized", () => {
    expect(wantsCompaction(talk(3), 8192, 1024)).toBe(false);
    expect(wantsCompaction(talk(40), 8192, 1024)).toBe(true);
  });
});

describe("what the files do when the first messages are folded", () => {
  const conv: ChatMessage[] = [
    { role: "user", content: "make a game" }, { role: "assistant", content: `Here.\n${file("Game", "let a = 1;")}` },
    { role: "user", content: "and a page" }, { role: "assistant", content: `Here.\n${file("Page", "<p>x</p>")}` },
    { role: "user", content: "walls" }, { role: "assistant", content: `Done.\n${file("Game", "let a = 2;")}` }
  ];
  it("carries the newest version of each file written in the folded part and not rewritten after it", () => {
    const out = foldHead(conv.slice(0, 4), conv.slice(4), "summary");
    expect(out).toHaveLength(2);
    expect(isFilesMessage(out[1])).toBe(true);
    const titles = latestArtifacts([...out, ...conv.slice(4)]).map((a) => `${a.title}=${a.content.trim()}`);
    expect(titles).toEqual(["Page=<p>x</p>", "Game=let a = 2;"]); // Game in its newest version (from the tail), Page from the head
  });
  it("adds no files message when there is no file", () => {
    expect(foldHead([{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }], [], "s")).toHaveLength(1);
  });
});

describe("asking the model for the summary", () => {
  it("builds the request from the previous summary and the new messages, with files as a line", () => {
    const m = summaryMessages("old summary", [{ role: "user", content: "hello" }, { role: "assistant", content: `ok\n${file("Game", "x\ny\nz")}` }], 200);
    expect(String(m[0].content)).toMatch(/At most 200 words/);
    expect(String(m[1].content)).toMatch(/Previous summary:\nold summary/);
    expect(String(m[1].content)).toMatch(/\[file "Game", 5 lines\]/);
    expect(String(m[1].content)).not.toMatch(/<artifact/);
  });
  it("summarizes in one call when it fits, and folds the previous summary in", async () => {
    const calls: ChatMessage[][] = [];
    const head = [memoMessage("Goal: X"), ...talk(2)];
    const text = await compactConversation({ head, windowTokens: 8192, ask: async (m) => { calls.push(m); return "<think>hm</think>Summary: Goal: X and more"; } });
    expect(calls).toHaveLength(1);
    expect(String(calls[0][1].content)).toMatch(/Previous summary:\nGoal: X/);
    expect(text).toBe("Goal: X and more");
  });
  it("folds a long head in several calls, each from the summary so far", async () => {
    const seen: string[] = [];
    let n = 0;
    const steps: [number, number][] = [];
    const text = await compactConversation({
      head: talk(30, 900), windowTokens: 4096, onStep: (i, of) => steps.push([i, of]),
      ask: async (m) => { seen.push(String(m[1].content)); return `summary ${++n}`; }
    });
    expect(n).toBeGreaterThan(1);
    expect(text).toBe(`summary ${n}`);
    expect(seen[0]).not.toMatch(/Previous summary/);
    expect(seen[1]).toMatch(/Previous summary:\nsummary 1/);
    expect(steps.at(-1)).toEqual([n, n]);
    for (const s of seen) expect(s.length).toBeLessThan(4096 * 3.5); // every call fits the window
  });
  it("fails when the model sends nothing, and never returns a summary that fills the window", async () => {
    await expect(compactConversation({ head: talk(3), windowTokens: 4096, ask: async () => "  " })).rejects.toThrow(/no summary/);
    const long = await compactConversation({ head: talk(3), windowTokens: 2048, ask: async () => "word ".repeat(5000) });
    expect(long.length).toBeLessThan(2048 * 0.2 * 3.2 + 5);
  });
});

describe("a request that must be cut in a hurry", () => {
  it("leaves a recap of what was dropped instead of a bare note, and still fits", () => {
    const ms = withDraft(talk(30));
    const fit = fitMessages(ms, 1500);
    expect(fit.overflow).toBe(false);
    expect(promptTokens(fit.messages)).toBeLessThanOrEqual(1500);
    const recap = fit.messages.find(isMemoMessage)!;
    expect(String(recap.content)).toMatch(/Question 0/);
    expect(fit.notes.join(" ")).toMatch(/folded into a short recap/);
    expect(fit.messages.at(-1)!.content).toBe("and now?");
  });
  it("keeps the whole summary of the conversation in the recap when the first messages go", () => {
    const ms: ChatMessage[] = [{ role: "system", content: "S" }, memoMessage("Goal: a quiz app, blue theme, 10 questions"), ...talk(20), { role: "user", content: "go on" }];
    const fit = fitMessages(ms, 1200);
    expect(fit.messages.some((m) => /Goal: a quiz app, blue theme/.test(String(m.content)))).toBe(true);
  });
});

describe("a server that says the request is too long", () => {
  it("is recognized from the usual wordings", () => {
    for (const t of [
      "Server error 400: the request exceeds the available context size (4096)",
      "Server error 400: prompt is too long: 9000 tokens",
      "This model's maximum context length is 4096 tokens. However, you requested 5000 tokens",
      "Server error 500: failed to find a memory slot for batch of size 1024"
    ]) expect(isContextOverflow(t), t).toBe(true);
    expect(isContextOverflow("Server error 500: the model crashed")).toBe(false);
  });
  const sse = (text: string) => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`)); c.close(); } }), { status: 200 });
  const run = async (g: AsyncGenerator<ChatEvent>) => { const out: ChatEvent[] = []; for await (const e of g) out.push(e); return out; };
  it("is asked again with a shorter request, and answers", async () => {
    const sizes: number[] = [];
    const fetchFn = (async (_u: string, init: any) => {
      const body = JSON.parse(init.body);
      sizes.push(JSON.stringify(body.messages).length);
      return sizes.length < 3 ? new Response("the request exceeds the available context size", { status: 400 }) : sse("fine");
    }) as any;
    const evs = await run(streamComplete({ endpoint: "x", model: "m", messages: withDraft(talk(14)), sampling: { temperature: 0, top_p: 1, max_tokens: 512 }, nctx: 3000, fetchFn }, "i"));
    expect(sizes).toHaveLength(3);
    expect(sizes[2]).toBeLessThan(sizes[0]);
    expect(evs.filter((e) => e.type === "notice" && /too long/.test(e.text))).toHaveLength(2);
    expect(evs.some((e) => e.type === "answer" && e.text === "fine")).toBe(true);
  });
  it("gives up with the server's own words after a few tries", async () => {
    const fetchFn = (async () => new Response("the request exceeds the available context size", { status: 400 })) as any;
    await expect(run(streamComplete({ endpoint: "x", model: "m", messages: withDraft(talk(14)), sampling: { temperature: 0, top_p: 1, max_tokens: 512 }, nctx: 3000, fetchFn }, "i"))).rejects.toThrow(/exceeds the available context/);
  });
});
