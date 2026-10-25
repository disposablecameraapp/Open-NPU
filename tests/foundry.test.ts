import { describe, expect, it } from "vitest";
import { FoundryLocal, bestVariant, foundryTargets, normalizeName, parseModelIds, parseModelList, parseServiceUrl } from "../src/core/foundry";
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
});
