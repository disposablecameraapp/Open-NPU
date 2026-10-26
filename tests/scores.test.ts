import { describe, expect, it } from "vitest";
import { scoreLevel, scoreOf } from "../src/core/scores";

describe("shipped scores", () => {
  it("finds a score by the name of the model, apart for each engine", () => {
    expect(scoreOf({ name: "Qwen3.5-2B", id: "qwen3.5-2b" })?.quality).toBe(79);
    expect(scoreOf({ name: "Qwen3.5-2B (Foundry Local)", id: "foundry:qwen3.5-2b" })?.quality).toBe(70);
    expect(scoreOf({ name: "Phi-4-mini-instruct", id: "foundry:phi-4-mini" })?.quality).toBe(80);
    expect(scoreOf({ name: "Phi-4-mini (Foundry Local)", id: "foundry:phi-4-mini" })?.quality).toBe(80);
    expect(scoreOf({ name: "Qwen2.5-Coder-3B-Instruct", id: "x" })?.quality).toBe(67);
  });

  it("keeps a native bundle apart from the GGUF of the same name", () => {
    expect(scoreOf({ name: "Qwen3-1.7B (native NPU bundle)", id: "q", engine: "qairt" })?.quality).toBe(75);
    expect(scoreOf({ name: "Qwen3-1.7B", id: "q", engine: "llama_cpp" })).toBeNull();
  });

  it("says nothing of a model that was not tested", () => {
    expect(scoreOf({ name: "Some-New-Model-9B", id: "z" })).toBeNull();
    expect(scoreLevel(80)).toBe("good");
    expect(scoreLevel(55)).toBe("fair");
    expect(scoreLevel(30)).toBe("low");
  });
});
