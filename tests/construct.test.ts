import { describe, expect, it } from "vitest";
import { assemblePage, splitLayout, unitsFromPage, wiring } from "../src/core/construct/assemble";
import { ContextEngine, layoutIds, signatureOf, stateShape } from "../src/core/construct/context";
import { checkUnit, extractUnit, fallbackRequirements } from "../src/core/construct/pipeline";
import { runExamples, syntaxProblem } from "../src/core/construct/sandbox";
import { completePlan, groupUnits, normalizeOn, normalizeUnits, orderUnits, parseRequirements } from "../src/core/construct/tasklist";
import type { Plan, Unit } from "../src/core/construct/types";

const reqs = [{ id: "R1", text: "shows a board" }, { id: "R2", text: "a piece falls every half second" }, { id: "R3", text: "a full row disappears" }];
const head = { title: "Falling pieces", language: "English", requirements: reqs };
const units = (list: unknown[]) => normalizeUnits(JSON.stringify({ units: list }), reqs).units;

describe("the task list", () => {
  it("reads requirements, drops a statement written twice, and falls back to the request's own sentences", () => {
    const r = parseRequirements(JSON.stringify({ title: "T", requirements: [{ text: "Shows a board" }, { text: "shows a board" }, { text: "A piece falls" }] }));
    expect(r!.requirements.map((x) => x.id)).toEqual(["R1", "R2"]);
    expect(parseRequirements("nothing")).toBeNull();
    expect(fallbackRequirements("A board is shown. Pieces fall every second! ok").map((x) => x.text)).toEqual(["A board is shown.", "Pieces fall every second!"]);
  });

  it("keeps only units that can exist: real names, unique, with a reason, a known kind", () => {
    const r = normalizeUnits(JSON.stringify({ units: [
      { kind: "fn", name: "collides", does: "tells if a piece hits", serves: ["R2"], signature: "collides(board, piece) -> boolean", examples: [{ call: "collides([],[])", expect: "false" }] },
      { kind: "fn", name: "collides", does: "again", serves: ["R2"] },
      { kind: "fn", name: "my name", does: "x", serves: ["R1"] },
      { kind: "fn", name: "document", does: "x", serves: ["R1"] },
      { kind: "widget", name: "w", does: "x", serves: ["R1"] },
      { kind: "handler", name: "onKey", does: "moves", serves: ["R2"], on: "keyboard" },
      { kind: "handler", name: "onWeird", does: "x", serves: ["R2"], on: "whenever" }
    ] }), reqs);
    expect(r.units.map((u) => u.name)).toEqual(["collides", "myname", "onKey", "onWeird"]);
    expect(r.units.find((u) => u.name === "onKey")!.on).toBe("key");
    expect(r.units.find((u) => u.name === "onWeird")!.on).toBeUndefined();
    expect(r.notes.join("|")).toMatch(/planned twice/);
    expect(normalizeOn("tick 0.5s")).toBeNull();
    expect(normalizeOn("tick 500 ms")).toBe("tick 500");
    expect(normalizeOn("click #go")).toBe("click #go");
  });

  it("drops a unit no requirement needs, adds the state and the layout, and reports what nothing serves", () => {
    const us = units([
      { kind: "fn", name: "collides", does: "hit test", serves: ["R2"] },
      { kind: "fn", name: "decorate", does: "adds sparkle", serves: [] },
      { kind: "view", name: "drawBoard", does: "draws the board", serves: ["R1"], uses: ["collides", "ghost"] }
    ]);
    const { plan, report } = completePlan(head, us);
    expect(plan.units.map((u) => u.name)).toEqual(["S", "layout", "collides", "drawBoard"]);
    expect(report.uncovered).toEqual(["R3"]);
    expect(report.notes.join("|")).toMatch(/"decorate" serves no requirement/);
    expect(plan.units.find((u) => u.name === "drawBoard")!.uses).toEqual(["collides"]);
  });

  it("puts what a unit needs before it and breaks a circle of uses", () => {
    const us = units([
      { kind: "handler", name: "onTick", does: "x", serves: ["R2"], uses: ["step"], on: "tick 500" },
      { kind: "fn", name: "step", does: "x", serves: ["R2"], uses: ["merge"] },
      { kind: "fn", name: "merge", does: "x", serves: ["R2"], uses: ["step"] },
      { kind: "view", name: "draw", does: "x", serves: ["R1"] }
    ]);
    const notes: string[] = [];
    const order = orderUnits(us, notes).map((u) => u.name);
    expect(order.indexOf("merge")).toBeLessThan(order.indexOf("step"));
    expect(order.indexOf("step")).toBeLessThan(order.indexOf("draw"));
    expect(order[order.length - 1]).toBe("onTick");
    expect(notes.join("|")).toMatch(/use each other/);
  });

  it("groups small functions into one call and writes the state and the layout alone", () => {
    const us = completePlan(head, units([{ kind: "fn", name: "a", does: "x", serves: ["R1"] }, { kind: "fn", name: "b", does: "x", serves: ["R1"] }, { kind: "view", name: "v", does: "x", serves: ["R1"] }])).plan.units;
    expect(groupUnits(us, 8000).map((g) => g.map((u) => u.name))).toEqual([["S"], ["layout"], ["a", "b"], ["v"]]);
    expect(groupUnits(us, 1000, () => 2000).map((g) => g.length)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("the context engine", () => {
  const plan: Plan = completePlan(head, units([
    { kind: "fn", name: "collides", does: "tells whether a piece hits the board", serves: ["R2"], signature: "collides(board, piece) -> boolean", examples: [{ call: "collides([[0]], {x:0,y:5})", expect: "true" }] },
    { kind: "fn", name: "clearRows", does: "removes full rows", serves: ["R3"], signature: "clearRows(board) -> board" },
    { kind: "view", name: "drawBoard", does: "draws the board", serves: ["R1"], uses: ["clearRows"] },
    { kind: "handler", name: "onTick", does: "moves the piece down", serves: ["R2"], uses: ["collides"], on: "tick 500" }
  ])).plan;
  const engine = () => {
    const e = new ContextEngine(plan, 6000);
    e.accept("S", { code: JSON.stringify({ board: [[0]], score: 0, over: false }), verified: true, problems: [] });
    e.accept("layout", { code: '<div id="board"></div><span id="score"></span>', verified: true, problems: [] });
    e.accept("collides", { code: "function collides(board, piece) { return true; }", verified: true, problems: [] });
    e.accept("clearRows", { code: `function clearRows(board) {\n${"  // a long body\n".repeat(60)}  return board; }`, verified: true, problems: [] });
    return e;
  };

  it("reads contracts from the accepted code: signatures, the shape of the state, the ids of the page", () => {
    expect(signatureOf("function collides(board, piece) { }", "collides")).toBe("collides(board, piece)");
    expect(signatureOf("const f = (a, b) => a + b;", "f")).toBe("f(a, b)");
    expect(stateShape('{"board":[[0]],"score":0,"name":"x","list":[1]}')).toBe("board: list of lists, score: number, name: string, list: list");
    expect(layoutIds('<div id="a"><b id=\'b\'></b></div>')).toEqual(["a", "b"]);
  });

  it("shows a unit only what it serves and what it uses; the code of a used unit only when it is short", () => {
    const e = engine();
    const tick = e.build(plan.units.find((u) => u.name === "onTick")!).text;
    expect(tick).toContain("R2. a piece falls every half second");
    expect(tick).not.toContain("R3.");
    expect(tick).toContain("function collides(board, piece) { return true; }"); // short and verified: shown
    expect(tick).toContain("board: list of lists, score: number, over: boolean");
    const draw = e.build(plan.units.find((u) => u.name === "drawBoard")!).text;
    expect(draw).toContain("clearRows(board): removes full rows");
    expect(draw).not.toContain("a long body"); // too long: the contract stands for it
    expect(draw).not.toContain("collides(board, piece)"); // not used, not shown
    expect(draw).toContain("#board #score");
  });

  it("drops the lowest priorities whole when the room is short, never the task, and leaves a trace", () => {
    const e = new ContextEngine(plan, 300);
    e.accept("S", { code: JSON.stringify({ a: 1 }), verified: true, problems: [] });
    e.accept("collides", { code: "function collides(board, piece) { return true; }", verified: true, problems: [] });
    const built = e.build(plan.units.find((u) => u.name === "onTick")!);
    expect(built.text).toContain("name: onTick");
    expect(built.trace.dropped.length).toBeGreaterThan(0);
    expect(built.trace.dropped).not.toContain("Task");
    expect(e.describe()).toMatch(/onTick \(handler\)/);
  });

  it("gives a repair its own code and the exact failures, and nothing from the failed reasoning", () => {
    const e = engine();
    const u = plan.units.find((x) => x.name === "collides")!;
    const t = e.build(u, { failures: ["collides([[0]], {x:0,y:5}) gave false, expected true"], code: "function collides() { return false; }" }).text;
    expect(t).toContain("Your code so far");
    expect(t).toContain("gave false, expected true");
    expect(t).toContain("collides([[0]], {x:0,y:5})  ->  true");
  });
});

describe("checking a unit by running it", () => {
  it("runs examples in isolation, with a time limit, and reports the exact difference", async () => {
    const code = "function rotate(m) { return m[0].map((_, i) => m.map((r) => r[i]).reverse()); }";
    expect((await runExamples([], code, [{ call: "rotate([[1,2],[3,4]])", expect: "[[3,1],[4,2]]" }])).ok).toBe(true);
    const bad = await runExamples([], code, [{ call: "rotate([[1,2],[3,4]])", expect: "[[1,3],[2,4]]" }]);
    expect(bad.failures[0]).toBe("rotate([[1,2],[3,4]]) gave [[3,1],[4,2]], expected [[1,3],[2,4]]");
    const loop = await runExamples([], "function f() { while (true) {} }", [{ call: "f()", expect: "1" }]);
    expect(loop.ok).toBe(false);
    expect((await runExamples([], "function g() { return typeof process + typeof require; }", [{ call: "g()", expect: '"undefinedundefined"' }])).ok).toBe(true);
    expect(await syntaxProblem("function (")).toMatch(/function|Unexpected|token/i);
  });

  it("builds a falling-piece rule from functions and examples, which a model writes without knowing what a game is", async () => {
    const collides = "function collides(board, piece) { return piece.shape.some((row, dy) => row.some((v, dx) => v && (piece.y + dy >= board.length || board[piece.y + dy][piece.x + dx]))); }";
    const clearRows = "function clearRows(board) { const kept = board.filter((r) => r.some((v) => !v)); return Array(board.length - kept.length).fill(0).map(() => board[0].map(() => 0)).concat(kept); }";
    const us = completePlan(head, units([
      { kind: "fn", name: "collides", does: "tells whether the piece overlaps the board or leaves it", serves: ["R2"], signature: "collides(board, piece) -> boolean", examples: [{ call: "collides([[0,0],[0,0]], {shape:[[1]], x:0, y:2})", expect: "true" }, { call: "collides([[0,0],[0,0]], {shape:[[1]], x:0, y:1})", expect: "false" }] },
      { kind: "fn", name: "clearRows", does: "removes full rows and adds empty ones on top", serves: ["R3"], uses: [], signature: "clearRows(board) -> board", examples: [{ call: "clearRows([[0,1],[1,1]])", expect: "[[0,0],[0,1]]" }] }
    ])).plan.units;
    const e = new ContextEngine(plan0(us), 6000);
    expect(await checkUnit(us.find((u) => u.name === "collides")!, collides, e)).toEqual([]);
    expect(await checkUnit(us.find((u) => u.name === "clearRows")!, clearRows, e)).toEqual([]);
    expect((await checkUnit(us.find((u) => u.name === "clearRows")!, "function clearRows(board) { return board; }", e))[0]).toMatch(/clearRows\(\[\[0,1\],\[1,1\]\]\) gave/);
    expect((await checkUnit(us.find((u) => u.name === "collides")!, "function collides(b, p) { return document.title; }", e))[0]).toBe("a fn must not touch the page");
    expect((await checkUnit(us.find((u) => u.name === "clearRows")!, "function other() {}", e))[0]).toBe("it does not define clearRows");
  });
});

const plan0 = (us: Unit[]): Plan => ({ ...head, units: us });

describe("what a reply holds", () => {
  const u = (name: string, kind: Unit["kind"] = "fn"): Unit => ({ id: name, kind, name, does: "x", serves: ["R1"], uses: [], examples: [] });
  it("takes the code out of a fence, and one function out of a group by its declaration", () => {
    expect(extractUnit("Here:\n```js\nfunction a() { return 1; }\n```\nDone.", u("a"))).toBe("function a() { return 1; }");
    expect(extractUnit("function a() { return 1; }", u("b"))).toBeNull();
    const group = [u("a"), u("b")];
    const reply = "function a() { return 1; }\n\nfunction b() { return a() + 1; }";
    expect(extractUnit(reply, group[0], group)).toBe("function a() { return 1; }");
    expect(extractUnit(reply, group[1], group)).toBe("function b() { return a() + 1; }");
    expect(extractUnit('Sure! {"count": 0, "items": []}', u("S", "state"))).toBe('{\n "count": 0,\n "items": []\n}');
    expect(extractUnit("no json", u("S", "state"))).toBeNull();
    expect(extractUnit("<div id='a'></div>", u("layout", "layout"))).toBe("<div id='a'></div>");
  });
});

describe("the page", () => {
  const p = completePlan(head, units([
    { kind: "fn", name: "step", does: "x", serves: ["R2"] },
    { kind: "view", name: "draw", does: "x", serves: ["R1"] },
    { kind: "handler", name: "onGo", does: "x", serves: ["R2"], on: "click #go" },
    { kind: "handler", name: "onTick", does: "x", serves: ["R2"], on: "tick 500" },
    { kind: "handler", name: "onKey", does: "x", serves: ["R2"], on: "key" }
  ])).plan;

  it("runs with stubs before anything is written, and fills in as units are accepted", () => {
    const empty = assemblePage(p, new Map());
    expect(empty).toContain("function step() { return undefined; }");
    expect(empty).toContain("function draw(S) {}");
    expect(empty).not.toContain('addEventListener("click"'); // no handler written yet, nothing wired to a stub
    const acc = new Map([["S", { code: '{"n": 1}', verified: true, problems: [] }], ["layout", { code: '<div id="go"></div><style>#go{color:red}</style>', verified: true, problems: [] }], ["onGo", { code: "function onGo() { S.n++; }", verified: true, problems: [] }], ["onTick", { code: "function onTick() { S.n += 2; }", verified: true, problems: [] }], ["onKey", { code: "function onKey(e) { S.n -= 1; }", verified: true, problems: [] }]]);
    const page = assemblePage(p, acc, true);
    expect(page).toContain('var S = {"n": 1};');
    expect(page).toContain("#go{color:red}");
    expect(page).toContain('getElementById("go")');
    expect(page).toContain("setInterval(function () { __run(onTick); __go(); }, 500);");
    expect(page).toContain('document.addEventListener("keydown"');
    expect(page).toContain("<!-- /x-construct -->");
    // the units come back out of the page, a stub is not work
    const back = unitsFromPage(page, p);
    expect([...back.keys()].sort()).toEqual(["S", "layout", "onGo", "onKey", "onTick"]);
    expect(back.get("onGo")!.code).toBe("function onGo() { S.n++; }");
  });

  it("keeps a script tag in a unit from ending the page's script", () => {
    const page = assemblePage(p, new Map([["step", { code: 'function step() { return "</script>"; }', verified: true, problems: [] }]]));
    expect(page.split("</script>").length).toBe(2);
  });

  it("splits a layout reply into HTML and CSS and wires events as asked", () => {
    expect(splitLayout("<div id='a'></div><style>#a{x:y}</style>")).toEqual({ html: "<div id='a'></div>", css: "#a{x:y}" });
    expect(wiring([{ ...p.units[0], kind: "handler", name: "h", on: "submit #f" }]).events).toContain("e.preventDefault()");
    expect(wiring([{ ...p.units[0], kind: "handler", name: "h", on: "load" }]).loads).toBe("__run(h);");
  });
});

describe("a plan cut off by the length limit", () => {
  it("keeps the units that were finished", async () => {
    const { normalizeUnits } = await import("../src/core/construct/tasklist");
    const cut = '{"units":[{"kind":"fn","name":"step","does":"moves one step","serves":["R1"]},{"kind":"view","name":"drawAll","does":"draws everything","serves":["R1"],"into":"board"},{"kind":"fn","name":"half","does":"never fini';
    const { units } = normalizeUnits(cut, [{ id: "R1", text: "x" }]);
    expect(units.map((u) => u.name)).toEqual(["step", "drawAll", "half"].slice(0, units.length));
    expect(units.length).toBeGreaterThanOrEqual(2);
    expect(units[1].into).toBe("board");
  });
});
