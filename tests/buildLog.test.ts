import { describe, expect, it } from "vitest";
import type { BuildRun } from "../src/shared/types";

describe("the log of a build, copied to be read", () => {
  it("holds the request, the totals, the steps and every call with what was told and said", async () => {
    const { fullLog } = await import("../src/renderer/BuildProgress");
    const build: BuildRun = {
      status: "done", tokens: 900, lines: 40, request: "make tetris",
      steps: [{ file: "tetris.html", action: "new", job: "all", status: "done", note: "40 lines written.", stages: [{ id: "write", label: "Planning the units", status: "done", sec: 233.9, model: "Qwen3.5-4B", log: "[1.0s] warning: the plan came back with no usable unit" }] }],
      calls: [
        { n: 1, sid: "x:0:Plan:2", at: 240, sec: 233.9, model: "Qwen3.5-4B", sent: 1800, got: 12, thought: 9000, tokens: 2400, tokPerSec: 17, prompt: "The requirements:\nR1. a board", reply: "I cannot plan" },
        { n: 2, sid: "x:0:Plan (R1):3", at: 244, sec: 3, sent: 900, got: 0, thought: 0, error: "terminated" }
      ]
    };
    const log = fullLog(build, "Open NPU 0.1.80 · NPU driver 10.0");
    expect(log).toContain("Request: make tetris");
    expect(log).toContain("Totals: 2 calls");
    expect(log).toContain("9,000 thought");
    expect(log).toContain("Open NPU 0.1.80");
    expect(log).toContain("warning: the plan came back with no usable unit");
    expect(log).toContain("told: The requirements:");
    expect(log).toContain("said: I cannot plan");
    expect(log).toContain("FAILED: terminated");
    expect(log).toContain("Plan (one requirement)");
  });
});
