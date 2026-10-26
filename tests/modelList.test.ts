import { describe, expect, it } from "vitest";
import { arrangeModels, isNativeNpu, placementOf, recommendedModels } from "../src/core/modelList";
import type { CatalogItem } from "../src/shared/api";
import type { CatalogEntry } from "../src/shared/types";

const item = (name: string, o: Partial<CatalogEntry> & { runsOn?: CatalogItem["runsOn"]; installed?: boolean } = {}): CatalogItem => {
  const { runsOn, installed, ...e } = o;
  const entry = { id: e.id ?? name, name, repo: name, quant: null, engine: "llama_cpp", role: "", architecture: "x", sizeGB: 1, recommendedContext: 4096, sampling: { temperature: 0.6, top_p: 0.95, max_tokens: 2048 }, ...e } as CatalogEntry;
  return { entry, verdict: { level: "green", reasons: [], contextTokens: 4096, estNpuGB: 1, estTokPerSec: null, installAllowed: true }, hidden: false, installed: !!installed, ref: entry.repo, custom: false, runsOn };
};
const opts = { sortBy: "score" as const, engine: "all" as const, installedOnly: false };

describe("the list of models", () => {
  const list = [
    item("Qwen3.5-2B", { id: "g1" }),                                              // 79 / 27.9
    item("Qwen3.5-2B (Foundry Local)", { id: "foundry:qwen3.5-2b", foundryDevice: "NPU" }), // 70 / 34.7
    item("Qwen2.5-Coder-3B-Instruct", { id: "g2" }),                               // 67 / 20.7
    item("Qwen2.5-Coder-3B (Foundry Local)", { id: "foundry:qwen2.5-coder-3b", foundryDevice: "NPU" }), // 75 / 30.5
    item("Some-Untested-7B", { id: "g3" }),
    item("Other-Untested (Foundry Local)", { id: "foundry:other", foundryDevice: "GPU" })
  ];

  it("shows one line per tested model: the faster engine, whatever its quality", () => {
    const r = arrangeModels(list, opts);
    expect(r.tested.map((i) => i.entry.id)).toEqual(["foundry:qwen2.5-coder-3b", "foundry:qwen3.5-2b"]); // Foundry is faster on both, so it is the one shown
    expect(r.slower.map((i) => i.entry.id).sort()).toEqual(["g1", "g2"]);
    expect(r.unscored.map((i) => i.entry.id).sort()).toEqual(["foundry:other", "g3"]);
  });

  it("sorts by speed, size or name on request", () => {
    expect(arrangeModels(list, { ...opts, sortBy: "speed" }).tested.map((i) => i.entry.id)).toEqual(["foundry:qwen3.5-2b", "foundry:qwen2.5-coder-3b"]);
    expect(arrangeModels(list, { ...opts, sortBy: "name" }).tested.map((i) => i.entry.name)).toEqual(["Qwen2.5-Coder-3B (Foundry Local)", "Qwen3.5-2B (Foundry Local)"]);
  });

  it("filters by engine before choosing, so a Foundry filter still shows the Foundry line of a model GenieX also has", () => {
    const geniex = arrangeModels(list, { ...opts, engine: "geniex" });
    expect(geniex.tested.map((i) => i.entry.id)).toEqual(["g1", "g2"]);
    expect(geniex.slower).toEqual([]);
    const foundry = arrangeModels(list, { ...opts, engine: "foundry" });
    expect(foundry.tested.every((i) => i.entry.id.startsWith("foundry:"))).toBe(true);
  });

  it("keeps only what is installed when asked", () => {
    const r = arrangeModels([item("Qwen3.5-2B", { installed: true }), item("Qwen2.5-Coder-3B-Instruct")], { ...opts, installedOnly: true });
    expect(r.tested).toHaveLength(1);
  });

  it("calls a model native NPU only when it was seen on the NPU: a bundle, or a Foundry NPU build", () => {
    expect(isNativeNpu(item("Qwen3-1.7B (native NPU bundle)", { engine: "qairt" }))).toBe(true); // shipped tests: on the NPU
    expect(isNativeNpu(item("Unmeasured bundle", { engine: "qairt" }))).toBe(false);              // never measured: not claimed
    expect(isNativeNpu(item("Phi-4-mini (Foundry Local)", { id: "foundry:phi-4-mini", foundryDevice: "NPU" }))).toBe(true);
    expect(isNativeNpu(item("Qwen2.5-0.5B (Foundry Local)", { id: "foundry:qwen2.5-0.5b", foundryDevice: "NPU" }))).toBe(false); // seen using the CPU too
    expect(isNativeNpu(item("Qwen2.5-0.5B (Foundry Local)", { id: "foundry:qwen2.5-0.5b", foundryDevice: "NPU", runsOn: "npu" }))).toBe(true); // this PC says better
    expect(isNativeNpu(item("Qwen3.5-0.8B (Foundry Local)", { id: "foundry:qwen3.5-0.8b", foundryDevice: "GPU" }))).toBe(false);
    expect(isNativeNpu(item("Qwen2.5-1.5B-Instruct"))).toBe(false); // a GGUF on the NPU is on the NPU, not native
    expect(placementOf(item("Unknown-model"))).toBeUndefined();
  });
  it("recommends at most nine tested models: good enough, not too slow, the faster engine of each", () => {
    const all = [
      item("Phi-4-mini (Foundry Local)", { id: "foundry:phi-4-mini", foundryDevice: "NPU" }),          // 80 / 27.8
      item("Qwen3.5-2B", { id: "g1" }), item("Qwen3.5-2B (Foundry Local)", { id: "foundry:qwen3.5-2b" }), // 79 / 27.9 and 70 / 34.7
      item("Qwen2.5-3B (Foundry Local)", { id: "foundry:qwen2.5-3b" }),                                  // 64 but 6.1 tok/s: too slow
      item("Qwen2.5-Coder-0.5B-Instruct", { id: "g2" }),                                                  // 39: not good enough
      item("Qwen2.5-1.5B-Instruct", { id: "g3" }),                                                        // 47 / 37
      item("Untested-9B", { id: "g4" })
    ];
    expect(recommendedModels(all).map((i) => i.entry.id)).toEqual(["foundry:phi-4-mini", "foundry:qwen3.5-2b", "g3"]);
    expect(recommendedModels(all, 2)).toHaveLength(2);
  });
});
