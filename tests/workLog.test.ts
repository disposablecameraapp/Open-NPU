import { describe, expect, it } from "vitest";
import { buildItems, deriveWork, finishedLine, mergeLedger, phrasesFor, windowOf, type WorkItem } from "../src/core/workLog";
import type { BuildRun, BuildStage } from "../src/shared/types";

const it_ = (id: string, state: WorkItem["state"], extra: Partial<WorkItem> = {}): WorkItem => ({ id, label: `did ${id}`, doing: `doing ${id}`, tag: id, state, ...extra });
const stage = (id: string, status: BuildStage["status"], extra: Partial<BuildStage> = {}): BuildStage => ({ id, label: id, status, ...extra });

describe("the window of four", () => {
  it("shows the two last finished, the running step and the next one", () => {
    const items = [it_("a", "done"), it_("b", "done"), it_("c", "done"), it_("d", "done"), it_("e", "running"), it_("f", "waiting"), it_("g", "waiting"), it_("h", "waiting")];
    const w = windowOf(items);
    expect(w.places).toEqual(["far", "far", "past2", "past1", "now", "next", "later", "later"]);
    expect(w.doneHidden).toBe(2);
    expect(w.laterHidden).toBe(2);
  });
  it("shows fewer rows at the start and keeps every running step", () => {
    const w = windowOf([it_("a", "running"), it_("b", "running"), it_("c", "waiting"), it_("d", "waiting")]);
    expect(w.places).toEqual(["now", "now", "next", "later"]);
  });
  it("starts from the first waiting step when nothing runs between two steps", () => {
    const w = windowOf([it_("a", "done"), it_("b", "waiting"), it_("c", "waiting")]);
    expect(w.places).toEqual(["past1", "now", "next"]);
  });
  it("folds everything once the work is finished", () => {
    expect(windowOf([it_("a", "done"), it_("b", "done")]).places).toEqual(["far", "far"]);
  });
});

describe("the quiet line of finished work", () => {
  it("counts steps and time", () => {
    expect(finishedLine([it_("a", "done", { sec: 40 }), it_("b", "done", { sec: 24 })])).toEqual({ text: "2 steps · 1m 04s", bad: false });
    expect(finishedLine([it_("a", "done")]).text).toBe("1 step");
  });
  it("says when a step needs a look", () => {
    const l = finishedLine([it_("a", "done"), it_("b", "error")]);
    expect(l.bad).toBe(true);
    expect(l.text).toContain("1 step needs a look");
  });
});

describe("steps of a build", () => {
  const one = (stages: BuildStage[], status: BuildRun["status"] = "running", verify: BuildStage[] = []): BuildRun => ({ status, steps: [{ file: "index.html", action: "new", job: "page", status: status === "running" ? "running" : "done", stages }], verify });
  it("lists each stage of a single file and announces the usual next one while it runs", () => {
    const items = buildItems(one([stage("skeleton", "done", { sec: 3 }), stage("write", "running", { at: 1000 })]));
    expect(items.map((x) => x.state)).toEqual(["done", "running", "waiting"]);
    expect(items[1].doing).toBe("Writing index.html");
    expect(items[0].label).toBe("Chose a starting point");
    expect(items[2].doing).toBe("Checking index.html");
  });
  it("leaves out skipped stages and announces nothing once finished", () => {
    const items = buildItems(one([stage("skeleton", "skipped"), stage("write", "done", { sec: 20 })], "done"));
    expect(items.map((x) => x.id)).toEqual(["f:index.html:0"]);
    expect(items.every((x) => x.state === "done")).toBe(true);
  });
  it("makes one step per file for several files, the files to come waiting, and the test run to come", () => {
    const b: BuildRun = { status: "running", steps: [
      { file: "index.html", action: "new", job: "", status: "done", stages: [stage("write", "done", { sec: 12 })] },
      { file: "style.css", action: "new", job: "", status: "running", stages: [stage("write", "running", { at: 5 })] },
      { file: "app.js", action: "new", job: "", status: "waiting" }
    ] };
    const items = buildItems(b);
    expect(items.map((x) => [x.id, x.state])).toEqual([["f:index.html", "done"], ["f:style.css", "running"], ["f:app.js", "waiting"], ["n:run", "waiting"]]);
    expect(items[0].sec).toBe(12);
  });
  it("puts the planner first and the test run last", () => {
    const b: BuildRun = { status: "running", start: [stage("plan", "done", { sec: 4 })], steps: [{ file: "a.html", action: "new", job: "", status: "done", stages: [stage("write", "done")] }], verify: [stage("run", "running")] };
    expect(buildItems(b).map((x) => x.tag)).toEqual(["plan", "write", "run", "explain"]);
  });
});

describe("the journal of other tasks", () => {
  it("is nothing for a plain answer", () => {
    expect(deriveWork({ pending: true, answering: true })).toBeNull();
    expect(deriveWork({ pending: true, thinking: true })).toBeNull();
  });
  it("shows the NPU being freed, then the model loading, then the answer to come", () => {
    const w = deriveWork({ pending: true, cleaning: true })!;
    expect(w.kind).toBe("load");
    expect(w.items.map((x) => [x.tag, x.state])).toEqual([["clean", "running"], ["load", "waiting"]]);
    const l = deriveWork({ pending: true, starting: true })!;
    expect(l.items[0]).toMatchObject({ tag: "load", state: "running" });
  });
  it("follows a document from the thought to the last line", () => {
    const writing = deriveWork({ pending: true, thinking: true, answering: true, artifact: { title: "Report", open: true, lines: 42 } })!;
    expect(writing.kind).toBe("doc");
    expect(writing.items.map((x) => [x.tag, x.state])).toEqual([["think", "done"], ["art", "running"]]);
    expect(writing.items[1].note).toBe("42 lines");
    const done = deriveWork({ pending: false, thinking: true, answering: true, artifact: { title: "Report", open: false, lines: 90 } })!;
    expect(done.items.every((x) => x.state === "done")).toBe(true);
  });
  it("lists web searches, helpers and the answer to come", () => {
    const agents = [
      { index: 0, name: "Web: snake rules", task: "", status: "done" as const, output: "", kind: "web" as const },
      { index: 1, name: "Reviewer", task: "Read the page", status: "running" as const, output: "" }
    ];
    const w = deriveWork({ pending: true, agents })!;
    expect(w.kind).toBe("web");
    expect(w.items.map((x) => [x.tag, x.state])).toEqual([["search", "done"], ["agent", "running"], ["answer", "waiting"]]);
    expect(w.items[0].label).toBe("Searched the web · snake rules");
  });
  it("finishes every step when the turn is no longer pending", () => {
    const w = deriveWork({ pending: false, agents: [{ index: 0, name: "Helper", task: "", status: "running", output: "" }] })!;
    expect(w.items.every((x) => x.state === "done")).toBe(true);
  });
  it("describes a code check and a loop", () => {
    const w = deriveWork({ pending: true, review: { status: "running", steps: [] }, loop: { status: "running", round: 2, rounds: 5, endsAt: 0, accepted: 1, steps: [] } })!;
    expect(w.kind).toBe("check");
    expect(w.items.map((x) => x.doing)).toContain("Improving the code · round 2 of 5");
  });
});

describe("the ledger", () => {
  it("measures a step that data does not time, and finishes a step that is no longer announced", () => {
    let led = mergeLedger([], [it_("clean", "running"), it_("load", "waiting")], 1000);
    expect(led[0].at).toBe(1000);
    led = mergeLedger(led, [it_("load", "running")], 6000);
    expect(led.map((x) => [x.id, x.state])).toEqual([["clean", "done"], ["load", "running"]]);
    expect(led[0].sec).toBe(5);
    led = mergeLedger(led, [it_("load", "done")], 31000);
    expect(led[1].sec).toBe(25);
    expect(mergeLedger(led, [it_("load", "done")], 99000)[1].sec).toBe(25);
  });
  it("forgets a step that was only announced", () => {
    const led = mergeLedger([it_("n:run", "waiting")], [it_("a", "running")], 10);
    expect(led.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("phrases", () => {
  it("every kind of step has some, and an unknown one still says something", () => {
    for (const tag of ["plan", "skeleton", "spec", "write", "edit", "check", "fix", "baseline", "run", "look", "explain", "think", "clean", "load", "search", "agent", "review", "loop", "art", "answer"]) expect(phrasesFor(tag).length, tag).toBeGreaterThan(0);
    expect(phrasesFor("zzz")).toEqual(["Working on it"]);
  });
});
