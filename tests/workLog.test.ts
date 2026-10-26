import { describe, expect, it } from "vitest";
import { buildItems, deriveSimple, deriveWork, finishedLine, mergeLedger, phrasesFor, sectionsOf, windowOf, type WorkItem } from "../src/core/workLog";
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
  it("shows every running step when several run at once", () => {
    const w = windowOf([it_("a", "running"), it_("b", "running"), it_("c", "waiting"), it_("d", "waiting")]);
    expect(w.places).toEqual(["now", "now", "next", "later"]);
  });
  it("starts from the first waiting step when nothing runs between two steps", () => {
    const w = windowOf([it_("a", "done"), it_("b", "waiting"), it_("c", "waiting")]);
    expect(w.places).toEqual(["past1", "now", "next"]);
  });
  it("keeps the last steps in view when everything is done but the work goes on", () => {
    expect(windowOf([it_("a", "done"), it_("b", "done"), it_("c", "done")]).places).toEqual(["far", "past2", "past1"]);
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
    expect(buildItems(b).map((x) => x.tag)).toEqual(["plan", "write", "run"]);
  });
});

describe("the journal of other tasks", () => {
  const agent = (index: number, name: string, status: "running" | "done" = "done", web = false) => ({ index, name: web ? `Web: ${name}` : name, task: "Read the page", status, output: "", ...(web ? { kind: "web" as const } : {}) });
  it("is nothing for a question, a thought or a model loading", () => {
    expect(deriveWork({ pending: true })).toBeNull();
    expect(deriveWork({ pending: true, agents: [agent(0, "snake rules", "running", true)] })).toBeNull();
    expect(deriveWork({ pending: true, agents: [agent(0, "snake rules", "done", true), agent(1, "npu tops", "running", true)] })).toBeNull();
    expect(deriveWork({ pending: true, agents: [agent(0, "Reviewer", "running")] })).toBeNull();
    expect(deriveWork({ pending: true, review: { status: "running", steps: [] } })).toBeNull();
  });
  it("starts for several helpers, and for searches and helpers that add up to three, with no step for the answer", () => {
    const w = deriveWork({ pending: true, agents: [agent(0, "snake rules", "done", true), agent(1, "Reviewer", "running"), agent(2, "Writer", "running")] })!;
    expect(w.kind).toBe("agents");
    expect(w.items.map((x) => [x.tag, x.state])).toEqual([["search", "done"], ["agent", "running"], ["agent", "running"]]);
    expect(w.items[0].label).toBe("Searched the web · snake rules");
    expect(w.items.some((x) => x.tag === "answer")).toBe(false);
    expect(deriveWork({ pending: true, agents: [agent(0, "a", "done", true), agent(1, "b", "done", true), agent(2, "c", "running", true)] })!.kind).toBe("web");
  });
  it("finishes every step when the turn is no longer pending", () => {
    const w = deriveWork({ pending: false, agents: [agent(0, "Helper", "running"), agent(1, "Other", "running")] })!;
    expect(w.items.every((x) => x.state === "done")).toBe(true);
  });
  it("describes an improve loop with its code check", () => {
    const w = deriveWork({ pending: true, review: { status: "done", steps: [] }, loop: { status: "running", round: 2, rounds: 5, endsAt: 0, accepted: 1, steps: [] } })!;
    expect(w.kind).toBe("check");
    expect(w.items.map((x) => x.doing)).toEqual(["Checking the code", "Improving the code · round 2 of 5"]);
  });
  it("never lists the summary of a build as a step", () => {
    const b: BuildRun = { status: "running", steps: [{ file: "a.html", action: "new", job: "", status: "done", stages: [stage("write", "done")] }], verify: [stage("run", "done", { sec: 3 }), stage("explain", "running")] };
    expect(buildItems(b).map((x) => x.tag)).toEqual(["write", "run"]);
  });
});

describe("the journal of a document", () => {
  it("reads the sections as they are written, outside code fences", () => {
    expect(sectionsOf("# Report\nintro\n## Market **overview**\n```\n# not a heading\n```\n### Drivers\n#nospace")).toEqual(["Report", "Market overview", "Drivers"]);
  });
  it("makes one step per section, the last one running with its lines while the document is open", () => {
    const w = deriveWork({ pending: true, document: { title: "Solar report", open: true, content: "# Solar report\n\n## Market\ntext\n## Outlook\nmore" } })!;
    expect(w.kind).toBe("doc");
    expect(w.items.map((x) => [x.label, x.state])).toEqual([["Wrote Solar report", "done"], ["Wrote Market", "done"], ["Wrote Outlook", "running"]]);
    expect(w.items[2].note).toBe("6 lines");
  });
  it("starts with the title before any heading and finishes when the document closes", () => {
    expect(deriveWork({ pending: true, document: { title: "Plan", open: true, content: "just text" } })!.items.map((x) => [x.doing, x.state])).toEqual([["Writing Plan", "running"]]);
    expect(deriveWork({ pending: true, document: { title: "Plan", open: false, content: "# A\n# B" } })!.items.every((x) => x.state === "done")).toBe(true);
  });
});

describe("the steps of a simple task", () => {
  const web = (index: number, q: string, status: "running" | "done" = "done") => ({ index, name: `Web: ${q}`, task: "", status, output: "", kind: "web" as const });
  it("lists what happened in order, with no step for the answer", () => {
    const items = deriveSimple({ pending: true, notices: ["Dynamic Fast · code → Model · sorted by the router"], thinking: true, agents: [web(0, "npu tops", "running")] });
    expect(items.map((x) => [x.tag, x.state])).toEqual([["route", "done"], ["think", "running"], ["search", "running"]]);
    expect(items.some((x) => x.tag === "answer")).toBe(false);
  });
  it("reads an attached file until the model starts to think, and groups the project files in one step", () => {
    expect(deriveSimple({ pending: true, attachments: ["report.pdf"] }).map((x) => [x.doing, x.state])).toEqual([["Reading report.pdf", "running"]]);
    expect(deriveSimple({ pending: true, thinking: true, attachments: ["a.pdf", "b.pdf"] })[0]).toMatchObject({ label: "Read 2 files", state: "done" });
    const folder = deriveSimple({ pending: true, agents: [{ index: 0, name: "Folder: src/a.ts", task: "Reading src/a.ts", status: "done", output: "" }, { index: 1, name: "Folder: src/b.ts", task: "Reading src/b.ts", status: "running", output: "" }] });
    expect(folder).toHaveLength(1);
    expect(folder[0]).toMatchObject({ tag: "folder", state: "running", note: "Reading src/b.ts" });
  });
  it("finishes every step with the turn, and is empty for a plain answer", () => {
    expect(deriveSimple({ pending: false, thinking: true, agents: [web(0, "x", "running")] }).every((x) => x.state === "done")).toBe(true);
    expect(deriveSimple({ pending: true, answering: true })).toEqual([]);
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

describe("the sentences of a figure being written or mended", () => {
  it("has some for every kind, for both stages", async () => {
    const { phrasesForFigure } = await import("../src/core/figureWork");
    for (const kind of ["chart", "diagram", "figures", "cards", "quiz", "checklist", "sheet"] as const) {
      expect(phrasesForFigure(kind, "draw").length, kind).toBeGreaterThan(0);
      expect(phrasesForFigure(kind, "fix").length, kind).toBeGreaterThan(0);
    }
  });
});
