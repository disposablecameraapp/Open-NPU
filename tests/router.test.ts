import { describe, expect, it } from "vitest";
import { CONFIRM, ROOT, ROUTER_BELOW, ROUTER_MODEL, SortMemory, TREE, parseYesNo, routerWanted, sortByQuestions, withRouter, yesNoPrompt } from "../src/core/router";
import { CATEGORY_IDS, type TaskCategory } from "../src/core/dynamic";

const KINDS = new Set<string>(CATEGORY_IDS);

/** Every kind a node can lead to, to build a model that always answers right. */
function reach(id: string, seen = new Set<string>()): Set<string> {
  if (KINDS.has(id)) return new Set([id]);
  if (seen.has(id)) return new Set();
  seen.add(id);
  return new Set([...reach(TREE[id].yes, seen), ...reach(TREE[id].no, seen)]);
}
/** A perfect model: it says yes to a question when the real kind is somewhere under its yes. */
const oracle = (truth: TaskCategory, log: string[] = []) => async (_ask: string, id: string) => { log.push(id); return reach(TREE[id].yes).has(truth); };

const REACHABLE = [...new Set(Object.values(TREE).flatMap((n) => [...reach(n.yes), ...reach(n.no)]))].sort();

describe("the router's questions", () => {
  it("lead to every kind a request can have, except what the shape of a request says (an image, a long text, a greeting)", () => {
    expect(REACHABLE).toEqual(CATEGORY_IDS.filter((c) => c !== "vision" && c !== "long_context" && c !== "fast").sort());
  });
  it("are a tree: each answer leads to a kind or to another question, never round in a circle", () => {
    for (const [id, n] of Object.entries(TREE)) {
      for (const next of [n.yes, n.no]) expect(KINDS.has(next) || next in TREE, `${id} -> ${next}`).toBe(true);
      expect(n.ask.endsWith("?"), id).toBe(true);
      expect(n.ask.length, id).toBeLessThan(150);
    }
    const depth = (id: string, d = 0): number => (KINDS.has(id) ? d : Math.max(depth(TREE[id].yes, d + 1), depth(TREE[id].no, d + 1)));
    expect(depth(ROOT)).toBeLessThanOrEqual(8); // the longest path (a plain conversation) is 7 questions
  });
  it("find the right kind for each of them when the model answers right", async () => {
    for (const k of REACHABLE) {
      const log: string[] = [];
      const r = await sortByQuestions(oracle(k as TaskCategory, log));
      expect(r.kind, k).toBe(k);
      expect(r.asked.map((a) => a.id)).toEqual(log);
    }
  });
  it("go straight to the kind the words lean towards: one question for most, two for code, and fall back to all of them when it was wrong", async () => {
    const asked = async (truth: TaskCategory, lean: TaskCategory) => { const log: string[] = []; const r = await sortByQuestions(oracle(truth, log), lean); return { kind: r.kind, log }; };
    expect(await asked("math", "math")).toEqual({ kind: "math", log: ["q_math"] });
    expect(await asked("web_code", "web_code")).toEqual({ kind: "web_code", log: ["q_code", "q_web"] });
    expect(await asked("code_repair", "code_repair")).toEqual({ kind: "code_repair", log: ["q_code", "q_error"] });
    // the words said a translation, it is a page to build: the question about translation is no, the others find it
    const wrong = await asked("web_code", "translate_fr");
    expect(wrong.kind).toBe("web_code");
    expect(wrong.log[0]).toBe("q_translate");
    expect(wrong.log.filter((id) => id === "q_translate")).toHaveLength(1); // never asked twice
    // the words said code and it is python: web is no
    expect(await asked("python_code", "web_code")).toEqual({ kind: "python_code", log: ["q_code", "q_web", "q_error", "q_read"] });
    // every kind the words may lean towards has a question that leads towards it
    for (const [kind, q] of Object.entries(CONFIRM)) expect(q! in TREE, kind).toBe(true);
  });
  it("give up on a reply that is neither yes nor no, and on too many questions, so the words' guess stands", async () => {
    expect((await sortByQuestions(async () => null)).kind).toBeNull();
    let n = 0;
    expect((await sortByQuestions(async () => (n++ < 2 ? false : null))).kind).toBeNull();
    const capped = await sortByQuestions(async () => false, undefined, 3);
    expect(capped.kind).toBeNull();
    expect(capped.asked).toHaveLength(3);
    const chat = await sortByQuestions(async () => false);
    expect(chat.kind).toBe("chat"); // all no: a plain conversation
    expect(chat.asked).toHaveLength(7);
  });
  it("are asked with the request first and one word to answer", () => {
    const p = yesNoPrompt("explique moi les interets cumuler avec un diagram interactif", TREE.q_web.ask);
    expect(p.user.startsWith('Request: """explique moi')).toBe(true);
    expect(p.user).toContain(`Question: ${TREE.q_web.ask}`);
    expect(p.user.endsWith("Answer (yes or no):")).toBe(true);
    expect(p.system).toMatch(/one word: yes or no/);
    expect(p.system).toMatch(/not by the language/);
    expect((p.system.length + p.user.length) / 3.5).toBeLessThan(250); // tokens: a short prompt, the request is read once
  });
  it("read the word it answers: yes, no, in French too, whatever it wraps around it", () => {
    expect(parseYesNo("yes")).toBe(true);
    expect(parseYesNo(" Yes.\n")).toBe(true);
    expect(parseYesNo("Oui")).toBe(true);
    expect(parseYesNo("No, it is not")).toBe(false);
    expect(parseYesNo("non")).toBe(false);
    expect(parseYesNo("<think>\nmaybe yes\n</think>\nno")).toBe(false);
    expect(parseYesNo("maybe")).toBeNull();
    expect(parseYesNo("")).toBeNull();
  });
});

describe("the router in the Dynamic model", () => {
  it("is asked only when the rules hesitate, never for an image or a long text", () => {
    expect(routerWanted({ category: "chat", confidence: 0.4, reason: "x" })).toBe(true);
    expect(routerWanted({ category: "web_code", confidence: ROUTER_BELOW, reason: "x" })).toBe(false);
    expect(routerWanted({ category: "vision", confidence: 0.3, reason: "x" })).toBe(false);
    expect(routerWanted({ category: "long_context", confidence: 0.5, reason: "x" })).toBe(false);
  });
  it("puts the router's word over the rules' guess, and keeps the guess when it has none", () => {
    const rules = { category: "translate_fr" as TaskCategory, confidence: 0.45, reason: "written in French" };
    expect(withRouter(rules, "web_code")).toMatchObject({ category: "web_code", reason: "the router model sorted it" });
    expect(withRouter(rules, null)).toBe(rules);
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

describe("the router comes with the packs", () => {
  it("every pack carries the router model, outside the models that answer", async () => {
    const { default: data } = await import("../src/core/dynamic-data.json");
    const { packParts } = await import("../src/core/dynamic");
    for (const pack of Object.values(data.packs) as any[]) {
      expect(pack.router?.repo).toBe(ROUTER_MODEL.repo);
      expect(pack.router?.ref).toBe(ROUTER_MODEL.ref);
      expect(pack.models.some((m: any) => m.ref === pack.router.ref)).toBe(false);
      expect(packParts(pack)).toContain(pack.router);
    }
  });
});
