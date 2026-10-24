import { describe, expect, it } from "vitest";
import { applyEffort, effectiveEffort, effortsFor, thinkingSupport, visionSupport } from "../src/core/effort";
import { MAX_AGENTS_PER_ROUND, parseSubagents, resultsMessage, stripSubagents } from "../src/core/agents";
import { classifyFile, fitAttachmentText, refusal, userContent } from "../src/core/attachments";
import { orchestrate } from "../src/core/orchestrate";
import type { ChatEvent, ChatMessage } from "../src/shared/types";

const e = (id: string, name = id) => ({ id, name, repo: id });

describe("thinking level", () => {
  it("knows which models can think and how", () => {
    expect(thinkingSupport(e("qwen3-4b-thinking-2507"))).toBe("always");
    expect(thinkingSupport(e("qwen3-1.7b-native", "Qwen3-1.7B"))).toBe("toggle");
    expect(thinkingSupport(e("lfm2.5-8b-a1b", "LFM2.5-8B-A1B"))).toBe("none");
    expect(effortsFor("toggle")).toContain("off");
    expect(effortsFor("always")).not.toContain("off");
    expect(effortsFor("none")).toEqual([]);
  });
  it("moves an impossible level to the nearest one", () => {
    expect(effectiveEffort("off", "always")).toBe("low");
    expect(effectiveEffort("high", "toggle")).toBe("high");
    expect(effectiveEffort("high", "none")).toBeNull();
  });
  it("Off sends the hard switches", () => {
    const msgs: ChatMessage[] = [{ role: "user", content: "hi" }];
    const r = applyEffort("off", msgs, e("qwen3-1.7b-native", "Qwen3-1.7B"));
    expect(r.body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(r.messages[r.messages.length - 1].content).toBe("hi /no_think");
    expect(msgs[0].content).toBe("hi");
  });
  it("Low and High add a nudge, none changes nothing", () => {
    const msgs: ChatMessage[] = [{ role: "system", content: "S" }, { role: "user", content: "hi" }];
    expect(applyEffort("low", msgs, e("x")).messages[0].content).toMatch(/^S\n\nThink only briefly/);
    expect(applyEffort("medium", msgs, e("x")).messages).toEqual(msgs);
    expect(applyEffort(null, msgs, e("x"))).toEqual({ messages: msgs, body: {} });
  });
  it("detects vision models", () => {
    expect(visionSupport(e("qwen2.5-vl-3b", "Qwen2.5-VL-3B"))).toBe(true);
    expect(visionSupport(e("qwen3-4b"))).toBe(false);
    expect(visionSupport(e("qwen3.5-4b", "Qwen3.5-4B"))).toBe(true);
    expect(visionSupport(e("qwen35-4b", "Qwen3.5-4B-GGUF"))).toBe(true);
    expect(visionSupport(e("qwen3-8b", "Qwen3-8B"))).toBe(false);
  });
});

describe("attachments", () => {
  it("classifies and refuses", () => {
    expect(classifyFile("a.py", "")).toBe("text");
    expect(classifyFile("p.PNG", "image/png")).toBe("image");
    expect(classifyFile("x.exe", "application/octet-stream")).toBe("unsupported");
    expect(refusal({ name: "a.png", size: 10, type: "image/png" }, false)).toMatch(/cannot see images/);
    expect(refusal({ name: "a.png", size: 10, type: "image/png" }, true)).toBeNull();
    expect(refusal({ name: "a.pdf", size: 10, type: "application/pdf" }, true)).toMatch(/PDF/);
  });
  it("cuts big files fairly and keeps small ones whole", () => {
    const r = fitAttachmentText([{ name: "s", text: "abc" }, { name: "b", text: "x".repeat(1000) }], 100);
    expect(r[0]).toMatchObject({ text: "abc", cut: false });
    expect(r[1].text.length).toBe(97);
    expect(r[1].cut).toBe(true);
  });
  it("builds string content for text and parts for images", () => {
    expect(userContent("q", [{ name: "n.txt", kind: "text", size: 1, text: "body" }], 1000)).toBe('<attachment name="n.txt">\nbody\n</attachment>\n\nq');
    const parts = userContent("q", [{ name: "i.png", kind: "image", size: 1, dataUrl: "data:image/png;base64,AA" }], 1000);
    expect(Array.isArray(parts) && parts[0]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AA" } });
    expect(userContent("q", [{ name: "i.png", kind: "image", size: 1 }], 1000)).toBe("q");
  });
});

describe("sub-agent blocks", () => {
  const text = 'Plan.\n<subagent name="A">do a</subagent>\n<subagent name="B">do b</subagent>';
  it("parses complete blocks only", () => {
    expect(parseSubagents(text)).toEqual([{ name: "A", task: "do a" }, { name: "B", task: "do b" }]);
    expect(parseSubagents('<subagent name="A">cut off')).toEqual([]);
    expect(parseSubagents("<subagentx>no</subagentx>")).toEqual([]);
    expect(parseSubagents(Array.from({ length: 9 }, (_, i) => `<subagent>t${i}</subagent>`).join(""))).toHaveLength(MAX_AGENTS_PER_ROUND);
  });
  it("hides blocks, also while streaming", () => {
    expect(stripSubagents(text)).toBe("Plan.");
    expect(stripSubagents('Plan.\n<subagent name="A">still wri')).toBe("Plan.");
    expect(stripSubagents("Plan <suba")).toBe("Plan");
    expect(stripSubagents("a < b")).toBe("a < b");
  });
  it("formats results", () => {
    expect(resultsMessage([{ name: "A", task: "t", output: "ok" }, { name: "B", task: "t", output: "", error: "boom" }])).toMatch(/<result name="A">\nok\n<\/result>\n<result name="B">\n\[failed: boom\]/);
  });
});

describe("orchestrate", () => {
  async function* one(id: string, answer: string, tokens = 5): AsyncGenerator<ChatEvent> {
    yield { id, type: "answer", text: answer };
    yield { id, type: "done", stats: { ttftSec: 0.5, tokPerSec: 10, tokens, totalSec: 1 } };
  }
  const run = async (g: AsyncGenerator<ChatEvent>) => { const out: ChatEvent[] = []; for await (const ev of g) out.push(ev); return out; };

  it("passes a plain answer through with one done", async () => {
    const evs = await run(orchestrate({ id: "c", messages: [{ role: "user", content: "hi" }], subagents: true, stream: (id) => one(id, "hello") }));
    expect(evs.map((x) => x.type)).toEqual(["answer", "done"]);
  });

  it("runs sub-agents one by one, feeds results back, sums stats", async () => {
    const calls: { id: string; msgs: ChatMessage[]; worker: boolean }[] = [];
    const stream = (id: string, msgs: ChatMessage[], worker: boolean) => {
      calls.push({ id, msgs, worker });
      if (!worker && calls.filter((c) => !c.worker).length === 1) return one(id, '<subagent name="A">task a</subagent><subagent name="B">task b</subagent>');
      return one(id, worker ? `result of ${(msgs[1].content as string)}` : "final");
    };
    const evs = await run(orchestrate({ id: "c", messages: [{ role: "user", content: "go" }], subagents: true, stream }));
    expect(calls.map((c) => c.worker)).toEqual([false, true, true, false]);
    expect(calls[1].id).toBe("c:agent:0");
    expect(calls[3].msgs.at(-1)!.content).toMatch(/result of task a[\s\S]*result of task b/);
    const agents = evs.filter((x) => x.type === "agent").map((x: any) => `${x.agent.index}:${x.agent.status}`);
    expect(agents).toEqual(["0:running", "0:running", "0:done", "1:running", "1:running", "1:done"]);
    const done = evs.at(-1) as any;
    expect(done.type).toBe("done");
    expect(done.stats.tokens).toBe(20);
    expect(evs.filter((x) => x.type === "done")).toHaveLength(1);
  });

  it("ignores blocks when sub-agents are off, and survives a failing agent", async () => {
    const off = await run(orchestrate({ id: "c", messages: [], subagents: false, stream: (id) => one(id, "<subagent>x</subagent>") }));
    expect(off.filter((x) => x.type === "agent")).toHaveLength(0);
    let n = 0;
    const stream = (id: string, _m: ChatMessage[], worker: boolean): AsyncGenerator<ChatEvent> => {
      if (worker) return (async function* () { throw new Error("npu fell over"); })();
      return one(id, n++ === 0 ? "<subagent>x</subagent>" : "done anyway");
    };
    const evs = await run(orchestrate({ id: "c", messages: [], subagents: true, stream }));
    expect((evs.filter((x) => x.type === "agent").at(-1) as any).agent).toMatchObject({ status: "error", error: "npu fell over" });
    expect(evs.at(-1)!.type).toBe("done");
  });

  it("stops delegating after the round limit", async () => {
    let rounds = 0;
    const stream = (id: string, _m: ChatMessage[], worker: boolean) => { if (!worker) rounds++; return one(id, worker ? "r" : "<subagent>again</subagent>"); };
    await run(orchestrate({ id: "c", messages: [], subagents: true, stream }));
    expect(rounds).toBe(4);
  });
});

import { contextUse } from "../src/core/contextUse";
describe("context use", () => {
  it("grows with chat, draft and files, and flags a nearly full context", () => {
    const base = { systemChars: 0, turns: [], draftChars: 0, draftFiles: [], attachmentBudgetChars: 1e6, limitTokens: 1000 };
    expect(contextUse(base).percent).toBe(0);
    expect(contextUse({ ...base, turns: [{ content: "x".repeat(1750) }] }).percent).toBe(50);
    expect(contextUse({ ...base, draftChars: 3500 }).percent).toBe(100);
    expect(contextUse({ ...base, draftFiles: [{ name: "i", kind: "image", size: 1 }] }).level).toBe("warn");
    expect(contextUse({ ...base, turns: [{ content: "x".repeat(3300) }] }).level).toBe("full");
  });
});
