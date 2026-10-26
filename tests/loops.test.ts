import { describe, expect, it } from "vitest";
import { findLoop } from "../src/core/loops";
import { streamComplete, withAnswer } from "../src/core/chat";
import { loopRetrySampling } from "../src/core/sampling";
import type { ChatEvent } from "../src/shared/types";

describe("findLoop", () => {
  const intro = "The stopwatch has three buttons and shows the time in hundredths. ";
  it("finds where the same words start coming back", () => {
    const unit = "The timer starts the timer and the timer stops. ";
    const text = intro + unit.repeat(8);
    // the cut may start a few characters early when the text before ends like the unit does
    const at = findLoop(text)!;
    expect(at).toBeLessThanOrEqual(intro.length);
    expect(at).toBeGreaterThan(intro.length - 6);
  });
  it("finds a loop of a single line, and a short unit", () => {
    expect(findLoop("ok\n" + "- the same line again\n".repeat(12))).toBeLessThanOrEqual(3);
    expect(findLoop("start " + "ab cd ef gh ".repeat(20))).toBeLessThanOrEqual(6);
  });
  it("leaves ordinary text, code and short repeats alone", () => {
    expect(findLoop(intro.repeat(2))).toBeNull();
    expect(findLoop("const a = 1;\nconst b = 2;\n".repeat(3))).toBeNull();
    expect(findLoop("-".repeat(300))).toBeNull();
    expect(findLoop(" ".repeat(400))).toBeNull();
    expect(findLoop(Array.from({ length: 40 }, (_, i) => `<li>Item number ${i} of the list</li>`).join("\n"))).toBeNull();
  });
});

describe("loop retry", () => {
  it("asks firmer each time and keeps what the engine takes", () => {
    const a = loopRetrySampling({ temperature: 0.6, top_p: 0.9, max_tokens: 100 }, 1);
    const c = loopRetrySampling({ temperature: 0.6, top_p: 0.9, max_tokens: 100 }, 3);
    expect(c.temperature).toBeGreaterThan(a.temperature);
    expect(c.frequency_penalty!).toBeGreaterThan(a.frequency_penalty!);
    expect(c.repetition_penalty!).toBeGreaterThan(a.repetition_penalty!);
  });
});

describe("streamComplete with a model that loops", () => {
  const sse = (text: string, signal?: AbortSignal) => new Response(new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      for (let i = 0; i < text.length; i += 20) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 20) } }] })}\n\n`));
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`));
      c.close();
      signal?.addEventListener("abort", () => undefined);
    }
  }));

  it("takes the loop out and asks again from what came before, with the same messages", async () => {
    const head = "Here is the plan for the page. ";
    const bodies: { messages: { role: string; content: string }[]; temperature: number }[] = [];
    const fetchFn = (async (_u: string, init: { body: string; signal: AbortSignal }) => {
      const b = JSON.parse(init.body);
      bodies.push(b);
      return bodies.length === 1 ? sse(head + "and then it goes round and round. ".repeat(30)) : sse("It ends well.");
    }) as unknown as typeof fetch;
    const events: ChatEvent[] = [];
    let answer = "";
    for await (const ev of streamComplete({ endpoint: "http://x/v1", model: "m", messages: [{ role: "user", content: "write" }], sampling: { temperature: 0.5, top_p: 0.9, max_tokens: 2000 }, nctx: 8192, fetchFn }, "t")) {
      events.push(ev);
      answer = withAnswer(answer, ev);
    }
    expect(events.some((e) => e.type === "retract")).toBe(true);
    expect(answer.startsWith("Here is the plan for the page")).toBe(true);
    expect(answer.endsWith("It ends well.")).toBe(true);
    expect(answer).not.toContain("round and round");
    expect(bodies.length).toBe(2);
    expect(bodies[1].messages[0]).toEqual({ role: "user", content: "write" });
    expect(bodies[1].messages[1].role).toBe("assistant");
    expect(head.startsWith(bodies[1].messages[1].content)).toBe(true);
    expect(bodies[1].temperature).toBeGreaterThan(bodies[0].temperature);
  });

  it("stops after a few loops and keeps only what came before", async () => {
    const head = "Start. ";
    let calls = 0;
    const fetchFn = (async () => sse((calls++ ? "" : head) + "again and again and again. ".repeat(40))) as unknown as typeof fetch;
    let answer = "";
    let last: ChatEvent | undefined;
    for await (const ev of streamComplete({ endpoint: "http://x/v1", model: "m", messages: [{ role: "user", content: "write" }], sampling: { temperature: 0.5, top_p: 0.9, max_tokens: 2000 }, nctx: 8192, fetchFn }, "t")) {
      answer = withAnswer(answer, ev);
      last = ev;
    }
    expect(head.startsWith(answer)).toBe(true);
    expect(answer).not.toContain("again and again");
    expect(last?.type === "done" && last.stats.finish).toBe("loop");
  });
});
