import { describe, expect, it } from "vitest";
import { ROUTER_BELOW, ROUTER_MODEL, SortMemory, routerKind, routerPrompt, routerWanted, withRouter } from "../src/core/router";
import { CATEGORY_IDS, parseSort, sortRequest, type TaskCategory } from "../src/core/dynamic";

describe("the router", () => {
  it("is asked the kinds, solved examples and the request, in a prompt that fits a small window", () => {
    const p = routerPrompt("explique moi les interets cumuler avec un diagram interactif");
    expect(p.system).toContain("web_code: ");
    expect(p.system).toContain("Request: make a snake game in html\nKind: web_code");
    expect(p.system).toMatch(/language a request is written in is not its kind/);
    expect(p.user).toBe("Request: explique moi les interets cumuler avec un diagram interactif\nKind:");
    expect((p.system.length + p.user.length) / 3.5).toBeLessThan(1000); // tokens, far under the 2048 window
    expect(routerPrompt("x", "web_code").user).toContain("The request before this one was: web_code");
    expect(p.system).not.toMatch(/\bvision:|long_context:/); // the shape of a request says those, not the router
  });
  it("every example it is shown is a kind that exists, and the rules agree with most of them", () => {
    const shown = [...routerPrompt("x").system.matchAll(/Kind: (\w+)/g)].map((m) => m[1]);
    expect(shown.length).toBeGreaterThan(15);
    for (const k of shown) expect(CATEGORY_IDS as readonly string[]).toContain(k);
    // every kind it may answer has an example, and only those
    expect([...new Set(shown)].sort()).toEqual(CATEGORY_IDS.filter((c) => c !== "vision" && c !== "long_context").sort());
  });
  it("reads the word it answers, whatever it wraps around it", () => {
    expect(routerKind("web_code")).toBe("web_code");
    expect(routerKind(" Kind: math\n")).toBe("math");
    expect(routerKind("<think>\nhmm code_repair maybe\n</think>\nweb_code")).toBe("web_code");
    expect(routerKind("I cannot say")).toBeNull();
    expect(routerKind("vision")).toBeNull();
  });
  it("is asked only when the rules hesitate, never for an image or a long text", () => {
    const french = sortRequest("explique moi les interets cumuler avec un diagram interactif");
    expect(french.category).toBe("web_code"); // the words already know it now; the router is for what they do not
    const unsure = sortRequest("peux-tu m'aider avec mon projet de fin d'année, je ne sais pas par où commencer");
    expect(routerWanted({ category: "chat", confidence: 0.4, reason: "x" })).toBe(true);
    expect(routerWanted({ category: "web_code", confidence: ROUTER_BELOW, reason: "x" })).toBe(false);
    expect(routerWanted({ category: "vision", confidence: 0.3, reason: "x" })).toBe(false);
    expect(routerWanted({ category: "long_context", confidence: 0.5, reason: "x" })).toBe(false);
    expect(unsure.confidence).toBeLessThan(1);
  });
  it("puts the router's word over the rules' guess, and keeps the guess when it has none", () => {
    const rules = { category: "translate_fr" as TaskCategory, confidence: 0.45, reason: "written in French" };
    expect(withRouter(rules, "web_code")).toMatchObject({ category: "web_code", reason: "the router model sorted it" });
    expect(withRouter(rules, null)).toBe(rules);
    expect(parseSort("web_code")).toBe("web_code");
  });
  it("is a small model that is installed like the others, from two providers", () => {
    expect(ROUTER_MODEL.quant).toBe("Q4_0");
    expect(ROUTER_MODEL.sizeGB).toBeLessThan(0.6);
    expect(ROUTER_MODEL.altRepos?.length).toBeGreaterThan(0);
  });
  it("remembers what it sorted, forgetting the oldest", () => {
    const m = new SortMemory(2);
    m.set("A", "math"); m.set("b", "chat"); m.set("C", "fast");
    expect(m.get("a")).toBeUndefined();
    expect(m.get(" B ")).toBe("chat");
    expect(m.get("c")).toBe("fast");
  });
});
