import { describe, expect, it } from "vitest";
import { FoundryLocal, bestVariant, foundryTargets, knownVariants, normalizeName, parseCatalogJson, parseModelIds, parseModelList, parseServiceUrl } from "../src/core/foundry";
import { droppableFields, streamChat } from "../src/core/chat";
import { enginePairs } from "../src/core/benchExport";
import type { BenchTarget, ModelResult } from "../src/core/bench";

const LIST = `Alias                          Device     Task           File Size    License      Model ID
-----------------------------------------------------------------------------------------------
phi-4                          GPU        chat           8.37 GB      MIT          Phi-4-cuda-gpu
                               CPU        chat           10.16 GB     MIT          Phi-4-generic-cpu
-----------------------------------------------------------------------------------------------
qwen2.5-0.5b                   NPU        chat,tools     0.52 GB      apache-2.0   qwen2.5-0.5b-instruct-qnn-npu
                               CPU        chat,tools     0.80 GB      apache-2.0   qwen2.5-0.5b-instruct-generic-cpu
-----------------------------------------------------------------------------------------------
deepseek-r1-7b                 NPU        chat           4.20 GB      MIT          deepseek-r1-distill-qwen-7b-qnn-npu
-----------------------------------------------------------------------------------------------
whisper-tiny                   CPU        speech         0.25 GB      MIT          openai-whisper-tiny-generic-cpu
`;

const target = (key: string, name: string, extra: Partial<BenchTarget> = {}): BenchTarget => ({ key, name, repo: "r", quant: "Q4_0", sizeGB: 1, paramsB: 1, source: "Specialists", ...extra });

describe("Foundry Local", () => {
  it("reads the table of `foundry model list`, with the rows that only name a device", () => {
    const v = parseModelList(LIST);
    expect(v.map((x) => `${x.alias}/${x.device}`)).toEqual(["phi-4/GPU", "phi-4/CPU", "qwen2.5-0.5b/NPU", "qwen2.5-0.5b/CPU", "deepseek-r1-7b/NPU", "whisper-tiny/CPU"]);
    expect(v[2]).toMatchObject({ modelId: "qwen2.5-0.5b-instruct-qnn-npu", sizeGB: 0.52 });
    expect(bestVariant(v.filter((x) => x.alias === "qwen2.5-0.5b")).device).toBe("NPU");
    expect(bestVariant(v.filter((x) => x.alias === "phi-4")).device).toBe("GPU");
  });

  it("finds the server and the model ids", () => {
    expect(parseServiceUrl("🟢 Model management service is running on http://localhost:5273/openai/status")).toBe("http://127.0.0.1:5273");
    expect(parseServiceUrl("not running")).toBeNull();
    expect(parseModelIds({ data: [{ id: "a" }, { id: "b" }, {}] })).toEqual(["a", "b"]);
  });

  it("matches our names to Foundry's aliases", () => {
    expect(normalizeName("Qwen2.5-0.5B-Instruct")).toBe("qwen2.5-0.5b");
    expect(normalizeName("DeepSeek-R1-Distill-Qwen-7B")).toBe("deepseek-r1-7b");
    expect(normalizeName("Mistral-7B-Instruct-v0.2")).toBe("mistral-7b-v0.2");
    expect(normalizeName("Phi-3.5-mini-instruct")).toBe("phi-3.5-mini");
  });

  it("makes a twin of each model it shares with the roster, adds its own, and leaves out speech and what is too big", () => {
    const roster = [target("a", "Qwen2.5-0.5B-Instruct"), target("b", "DeepSeek-R1-Distill-Qwen-7B"), target("c", "Gemma-3-4B-it")];
    const t = foundryTargets(roster, parseModelList(LIST), 7);
    expect(t.map((x) => x.key)).toEqual(["foundry:qwen2.5-0.5b", "foundry:deepseek-r1-7b"]); // phi-4 is 8.4 GB, whisper is speech
    expect(t[0]).toMatchObject({ name: "Qwen2.5-0.5B-Instruct (Foundry Local)", engine: "foundry", twinOf: "a", foundryDevice: "NPU", foundryModelId: "qwen2.5-0.5b-instruct-qnn-npu" });
    const only = foundryTargets([], parseModelList(LIST), 7);
    expect(only.every((x) => x.twinOf === undefined)).toBe(true);
    expect(only.map((x) => x.name)).toContain("qwen2.5-0.5b (Foundry Local)");
  });

  it("runs the commands in order, says where it is, and keeps what they said", async () => {
    const calls: string[] = [];
    const run = async (args: string[]) => {
      calls.push(args.join(" "));
      if (args[0] === "service" && args[1] === "status") return { code: 0, out: "running on http://localhost:5555/openai/status" };
      if (args[0] === "cache") return { code: 0, out: "qwen2.5-0.5b-instruct-qnn-npu" };
      return { code: 0, out: "ok" };
    };
    const fetchFn = (async () => ({ ok: true, json: async () => ({ data: [{ id: "qwen2.5-0.5b-instruct-qnn-npu:1" }] }) })) as never;
    const f = new FoundryLocal(run, fetchFn);
    expect(await f.isInstalled("qwen2.5-0.5b", "qwen2.5-0.5b-instruct-qnn-npu")).toBe(true);
    const r = await f.load("qwen2.5-0.5b", "qwen2.5-0.5b-instruct-qnn-npu");
    expect(r).toEqual({ endpoint: "http://127.0.0.1:5555/v1", modelId: "qwen2.5-0.5b-instruct-qnn-npu:1" });
    expect(calls).toEqual(["cache list", "service start", "service status", "model load qwen2.5-0.5b"]);
    await f.unloadLast();
    expect(calls.at(-1)).toBe("model unload qwen2.5-0.5b");
    expect(f.recent.some((l) => l.includes("foundry model load qwen2.5-0.5b"))).toBe(true);
  });

  it("never deletes a model it cannot tell was there", async () => {
    const f = new FoundryLocal(async () => ({ code: 1, out: "unknown command" }));
    expect(await f.isInstalled("x", "y")).toBe(true);
  });

  it("pairs the two engines in the report", () => {
    const res = (name: string, q: number, tps: number) => ({ name, summary: { ran: 5, quality: q, tokPerSec: tps, ttftSec: 0.5 } }) as unknown as ModelResult;
    const pairs = enginePairs([res("Qwen2.5-0.5B-Instruct", 60, 40), res("Qwen2.5-0.5B-Instruct (Foundry Local)", 58, 45), res("Alone (Foundry Local)", 50, 10)]);
    expect(pairs.map(([n]) => n)).toEqual(["Qwen2.5-0.5B-Instruct"]);
  });
  it("reads the catalog as the server gives it, with loose field names", () => {
    const v = parseCatalogJson([
      { id: "qwen2.5-0.5b-instruct-qnn-npu:1", alias: "qwen2.5-0.5b", runtime: { deviceType: "NPU" }, fileSizeMb: 512, task: "chat" },
      { name: "phi-4-generic-cpu", alias: "phi-4", deviceType: "cpu", sizeGB: 10 },
      { alias: "no-id" },
    ]);
    expect(v.map((x) => `${x.alias}/${x.device}`)).toEqual(["qwen2.5-0.5b/NPU", "phi-4/CPU"]);
    expect(v[0].sizeGB).toBeCloseTo(0.5, 2);
    expect(parseCatalogJson({ models: [{ id: "a", alias: "b" }] })).toHaveLength(1);
    expect(parseCatalogJson("nope")).toEqual([]);
  });

  it("reads a table with box characters and extra columns", () => {
    const boxed = `┌──────────┬────────┬──────┬─────────┬─────────┐
│ Alias    │ Device │ Task │ Size    │ Model ID│
├──────────┼────────┼──────┼─────────┼─────────┤
│ phi-4    │ GPU    │ chat │ 8.37 GB │ Phi-4-cuda-gpu │
└──────────┴────────┴──────┴─────────┴─────────┘`;
    expect(parseModelList(boxed).map((x) => x.alias)).toContain("phi-4");
  });

  it("keeps the comparison possible when the catalog cannot be read: known aliases still pair with the roster", () => {
    const known = knownVariants();
    expect(known.length).toBeGreaterThan(3);
    expect(known.every((k) => k.modelId && k.alias)).toBe(true);
  });
  it("reads the 0.12 table (Alias | Access | Type | Size | Device | Tools | Cached): the alias is the name to ask for", () => {
    const v = parseModelList(`+------------------+--------+--------+---------+--------+-------+--------+
  | Alias              | Access | Type       | Size    | Device | Tools | Cached |
  +------------------------------------------------------------------------------+
  | qwen2.5-0.5b       | Public | Chat       | 0.43 GB | NPU    | ✓     | ○      |
  | gpt-oss-20b-t      | Public | Chat       | 12 GB   | GPU    | ✓     | ○      |
  | urbo               |        |            |         |        |       |        |
  | whisper-tiny       | Public | Speech     | 131 MB  | CPU    | ·     | ○      |
  +------------------------------------------------------------------------------+`);
    expect(v.map((x) => `${x.alias}/${x.device}/${x.modelId}`)).toEqual(["qwen2.5-0.5b/NPU/qwen2.5-0.5b", "gpt-oss-20b-t/GPU/gpt-oss-20b-t", "whisper-tiny/CPU/whisper-tiny"]);
    expect(v[0].sizeGB).toBeCloseTo(0.43, 2);
    expect(v[0].task).toMatch(/chat/i);
  });

  it("uses `server` when this version has no `service`", async () => {
    const calls: string[] = [];
    const run = async (a: string[]) => {
      calls.push(a.join(" "));
      if (a[0] === "service") return { code: 2, out: "error: Unknown command: 'service'" };
      if (a[0] === "server" && a[1] === "status") return { code: 0, out: "running on http://127.0.0.1:5273/openai/status" };
      return { code: 0, out: "" };
    };
    const f = new FoundryLocal(run, (async () => ({ ok: false })) as unknown as typeof fetch);
    expect(await f.serviceUrl()).toBe("http://127.0.0.1:5273");
    expect(calls).toContain("server start");
  });
  it("sends the request again without the optional field a server refuses", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = (async (_u: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) return new Response('{"error":{"message":"Unsupported parameter: nonzero frequency_penalty and presence_penalty are not supported"}}', { status: 400 });
      return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
    }) as unknown as typeof fetch;
    const events: unknown[] = [];
    for await (const ev of streamChat({ endpoint: "http://x/v1", model: "m", messages: [{ role: "user", content: "hi" }], sampling: { temperature: 0.6, top_p: 0.95, top_k: 20, presence_penalty: 1.5, max_tokens: 50 }, fetchFn }, "t")) events.push(ev);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toHaveProperty("presence_penalty", 1.5);
    expect(bodies[1]).not.toHaveProperty("presence_penalty");
    expect(bodies[1]).toHaveProperty("temperature", 0.6);
    // what was refused is kept by the caller: the next request does not send it, so no second 400
    const refused = new Set<string>(["presence_penalty"]);
    bodies.length = 0;
    for await (const ev of streamChat({ endpoint: "http://x/v1", model: "m", messages: [{ role: "user", content: "hi" }], sampling: { temperature: 0.6, top_p: 0.95, presence_penalty: 1.5, max_tokens: 50 }, fetchFn: (async (_u: string, init: { body: string }) => { bodies.push(JSON.parse(init.body)); return new Response("data: [DONE]\n\n", { status: 200 }); }) as unknown as typeof fetch, refused }, "t")) void ev;
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toHaveProperty("presence_penalty");
    expect(events.length).toBeGreaterThan(0);
    expect(droppableFields("model not found", { top_k: 1 })).toEqual([]);
  });
  it("asks again without streaming when the stream is cut before the first word", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchFn = (async (_u: string, init: { body: string }) => {
      const b = JSON.parse(init.body); bodies.push(b);
      if (b.stream) return new Response(new ReadableStream({ start(c) { c.error(new TypeError("terminated")); } }), { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "hello" }, finish_reason: "stop" }], usage: { completion_tokens: 8 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const out: { type: string; text?: string }[] = [];
    for await (const ev of streamChat({ endpoint: "http://x/v1", model: "m", messages: [{ role: "user", content: "hi" }], sampling: { temperature: 0.6, top_p: 0.95, max_tokens: 50 }, fetchFn }, "t")) out.push(ev as never);
    expect(bodies.map((b) => b.stream)).toEqual([true, false]);
    expect(bodies[1]).not.toHaveProperty("stream_options");
    expect(out.find((e) => e.type === "answer")?.text).toBe("hello");
    expect(out.at(-1)?.type).toBe("done");
  });

  it("says why when the stream is cut and the plain request fails too", async () => {
    const fetchFn = (async (_u: string, init: { body: string }) => JSON.parse(init.body).stream
      ? new Response(new ReadableStream({ start(c) { c.error(new TypeError("terminated")); } }), { status: 200 })
      : new Response('{"error":"context length exceeded"}', { status: 500 })) as unknown as typeof fetch;
    const run = async () => { for await (const ev of streamChat({ endpoint: "http://x/v1", model: "m", messages: [{ role: "user", content: "hi" }], sampling: { temperature: 0.6, top_p: 0.95, max_tokens: 50 }, fetchFn }, "t")) void ev; };
    await expect(run()).rejects.toThrow(/terminated.*context length exceeded|context length exceeded/);
  });
  it("gathers everything readable about Foundry Local into the log", async () => {
    const calls: string[] = [];
    const run = async (a: string[]) => { calls.push(a.join(" ")); return { code: a[0] === "status" ? 2 : 0, out: `answer of ${a.join(" ")}` }; };
    const f = new FoundryLocal(run, (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch, async () => ["── C:/x/foundry.log (last 2 of 2 lines) ──", "  boom"]);
    const lines = await f.diagnose(true);
    expect(calls).toEqual(expect.arrayContaining(["server status", "status", "cache list", "--help", "model list --variants"]));
    expect(lines.join("\n")).toMatch(/boom/);
    expect(lines.join("\n")).toMatch(/\$ foundry status {2}\(exit 2\)/);
    expect(f.recent.join("\n")).toMatch(/boom/);
  });
});
