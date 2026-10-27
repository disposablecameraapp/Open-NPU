import { describe, expect, it } from "vitest";
import { applyEffort, autoEffort, effectiveEffort, effortsFor } from "../src/core/effort";

describe("Auto thinking level", () => {
  it("does not think for a plain request", () => {
    expect(autoEffort("translate_fr", "Traduis ce texte").level).toBe("off");
    expect(autoEffort("chat", "salut").level).toBe("off");
    expect(autoEffort("web_code", "Fais un jeu de snake").level).toBe("off");
  });
  it("thinks for maths, logic and plans", () => {
    expect(autoEffort("math", "Combien font 17 x 23 ?").level).toBe("medium");
    expect(autoEffort("reasoning", "Trois amis ont chacun un chapeau").level).toBe("medium");
  });
  it("thinks carefully for a demanding or long one", () => {
    expect(autoEffort("math", "Prove that the square root of 2 is irrational").level).toBe("high");
    expect(autoEffort("planning", "x".repeat(600)).level).toBe("high");
  });
  it("thinks briefly to mend code", () => {
    expect(autoEffort("code_repair", "Cette erreur apparaît").level).toBe("low");
  });
  it("is offered to thinking models only, and leaves the request alone if unresolved", () => {
    expect(effortsFor("toggle")[0]).toBe("auto");
    expect(effortsFor("always")).toContain("auto");
    expect(effortsFor("none")).toEqual([]);
    expect(effectiveEffort("auto", "none")).toBeNull();
    expect(effectiveEffort("auto", "toggle")).toBe("auto");
    const msgs = [{ role: "user" as const, content: "hi" }];
    expect(applyEffort("auto", msgs, { id: "qwen3-4b", name: "Qwen3 4B", repo: "" })).toEqual({ messages: msgs, body: {} });
  });
});
