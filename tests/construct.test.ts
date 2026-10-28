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
    expect(stateShape('{"board":[[0]],"score":0,"name":"x","list":[1]}')).toBe("board: list of lists\nscore: number\nname: string\nlist: list");
    // two levels deep: a writer cannot read player.x if it does not see that player has an x
    expect(stateShape('{"player":{"x":1,"vy":0},"enemies":[{"x":2,"dir":1}]}')).toBe("player: {x, vy}\nenemies: list of {x, dir}");
    expect(layoutIds('<div id="a"><b id=\'b\'></b></div>')).toEqual(["a", "b"]);
  });

  it("shows a unit only what it serves and what it uses; the code of a used unit only when it is short", () => {
    const e = engine();
    const tick = e.build(plan.units.find((u) => u.name === "onTick")!).text;
    expect(tick).toContain("R2. a piece falls every half second");
    expect(tick).not.toContain("R3.");
    expect(tick).toContain("function collides(board, piece) { return true; }"); // short and verified: shown
    expect(tick).toContain("board: list of lists\nscore: number\nover: boolean");
    const draw = e.build(plan.units.find((u) => u.name === "drawBoard")!).text;
    expect(draw).toContain("clearRows(board): removes full rows");
    expect(draw).not.toContain("a long body"); // too long: the contract stands for it
    expect(draw).not.toContain("function collides"); // the code of a function it does not use is never shown (its signature is, under "Functions you can call")
    expect(draw).toContain("#board (div)");
    expect(draw).toContain("#score (span)");
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

describe("taking up a page whose plan had no logic", () => {
  it("plans what is missing, writes the new units and checks the layout again", async () => {
    const { buildProgram } = await import("../src/core/construct/pipeline");
    const { assemblePage } = await import("../src/core/construct/assemble");
    const reqs = [{ id: "R1", text: "A number is shown" }, { id: "R2", text: "A button adds one" }];
    const units = [
      { id: "u0s", kind: "state" as const, name: "S", does: "state", serves: ["R1", "R2"], uses: [], examples: [] },
      { id: "u0l", kind: "layout" as const, name: "layout", does: "page", serves: ["R1", "R2"], uses: [], examples: [] }
    ];
    const plan = { title: "T", language: "English", requirements: reqs, units };
    const page = assemblePage(plan, new Map([["S", { code: '{"n":0}', verified: true, problems: [] }], ["layout", { code: '<div id="x"></div>', verified: true, problems: [] }]]), true);
    const seen: string[] = [];
    const host = {
      resume: page, room: 8000, problems: [],
      async *ask(sid: string, msgs: { content: unknown }[]) {
        seen.push(sid);
        const user = String(msgs[1].content);
        if (/Plan \(R1\)/.test(sid)) return JSON.stringify({ units: [{ kind: "view", name: "drawN", does: "shows the number", serves: ["R1"], into: "num" }] });
        if (/Plan \(R2\)/.test(sid)) return JSON.stringify({ units: [{ kind: "handler", name: "onAdd", does: "adds one", serves: ["R2"], on: "click #add" }] });
        if (/Unit: layout/.test(sid)) return '<div id="num"></div><button id="add">+</button>';
        if (/Unit: drawN/.test(sid)) return 'function drawN(S) { document.getElementById("num").textContent = S.n; }';
        if (/Unit: onAdd/.test(sid)) return "function onAdd() { S.n += 1; }";
        return user ? "" : "";
      }
    };
    const gen = buildProgram("x", host as never);
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    const html = r.value.html;
    expect(seen.some((s) => /Plan \(R1\)/.test(s)) && seen.some((s) => /Plan \(R2\)/.test(s))).toBe(true);
    expect(html).toContain("function drawN");
    expect(html).toContain("function onAdd");
    expect(html).toContain('id="add"');
  });
});

describe("what a page keeps when it is taken up again", () => {
  it("finds the state again even when the page has no unit block yet", async () => {
    const { assemblePage, unitsFromPage } = await import("../src/core/construct/assemble");
    const plan = { title: "T", language: "English", requirements: [{ id: "R1", text: "x" }], units: [
      { id: "u0s", kind: "state" as const, name: "S", does: "s", serves: ["R1"], uses: [], examples: [] },
      { id: "u0l", kind: "layout" as const, name: "layout", does: "l", serves: ["R1"], uses: [], examples: [] }
    ] };
    const page = assemblePage(plan, new Map([["S", { code: '{"n":3}', verified: true, problems: [] }], ["layout", { code: '<div id="a"></div><style>#a{color:red}</style>', verified: true, problems: [] }]]), true);
    const back = unitsFromPage(page, plan);
    expect(back.get("S")?.code).toContain('"n":3');
    expect(back.get("layout")?.code).toContain('id="a"');
    expect(back.get("layout")?.code).toContain("color:red");
  });
});

describe("a plan written as lines", () => {
  it("reads units, examples, events and the element a view draws into", async () => {
    const { parseLines, normalizeUnits } = await import("../src/core/construct/tasklist");
    const reply = [
      "Here is the plan:",
      "```",
      "state S | the board and the score | R1,R2",
      "layout layout | the board and the score | R1",
      "fn nextCount(count, max) | one more, never above max | R2",
      "e: nextCount(9, 10) => 10",
      "- e: nextCount(0, 10) => 1",
      "view drawBoard | draws the board | R1 | into: board",
      "handler onKey | moves on a key | R2 | uses: nextCount | on: key",
      "```"
    ].join("\n");
    const lines = parseLines(reply);
    expect(lines.units.map((u) => u.name)).toEqual(["S", "layout", "nextCount", "drawBoard", "onKey"]);
    const { units } = normalizeUnits(reply, [{ id: "R1", text: "a" }, { id: "R2", text: "b" }]);
    expect(units.find((u) => u.name === "nextCount")?.examples).toEqual([{ call: "nextCount(9, 10)", expect: "10" }, { call: "nextCount(0, 10)", expect: "1" }]);
    expect(units.find((u) => u.name === "nextCount")?.signature).toBe("nextCount(count, max)");
    expect(units.find((u) => u.name === "drawBoard")?.into).toBe("board");
    expect(units.find((u) => u.name === "onKey")).toMatchObject({ on: "key", uses: ["nextCount"], serves: ["R2"] });
  });
  it("reads a change as lines", async () => {
    const { parseLines } = await import("../src/core/construct/tasklist");
    const c = parseLines("rewrite onStart | do not end the game at once\nrequirement | The game does not end when it starts\nhandler onReset | resets | R3 | on: click #reset");
    expect(c.rewrite).toEqual([{ name: "onStart", what: "do not end the game at once" }]);
    expect(c.requirements).toHaveLength(1);
    expect(c.units).toHaveLength(1);
  });
});

describe("scenario tests", () => {
  const ids = ["player", "menu", "count", "start"];
  it("reads scenes in the closed vocabulary and leaves out the ones that cannot be played", async () => {
    const { parseScenarios } = await import("../src/core/construct/scenarios");
    const reply = [
      "R2 | click #start ; press ArrowRight 8 times | #player moves right",
      "- R5 | press Escape | #menu shows",
      "R6 | hold Space 2 s | #player moves up",
      "R7 | click #start | #count text goes up",
      "R8 | press Q | #ghost shows",
      "R9 | dance wildly | #player changes",
      "R10 | wait 1 s | the screen changes"
    ].join("\n");
    const { scenarios, notes } = parseScenarios(reply, ids);
    expect(scenarios.map((s) => s.req)).toEqual(["R2", "R5", "R6", "R7", "R10"]);
    expect(scenarios[0].steps).toEqual([{ do: "click", id: "start" }, { do: "press", key: "ArrowRight", times: 8 }]);
    expect(scenarios[2].steps).toEqual([{ do: "hold", key: " ", ms: 2000 }]);
    expect(notes).toHaveLength(2);
    expect(notes.join(" ")).toMatch(/no #ghost/);
  });
  it("has no way to say that something must NOT move or change", async () => {
    const { parseScenarios, SCENARIO_INSTRUCTIONS } = await import("../src/core/construct/scenarios");
    expect(parseScenarios("R1 | press ArrowLeft | #player does not move", ids).scenarios).toHaveLength(0);
    expect(SCENARIO_INSTRUCTIONS).toMatch(/never what must not/);
  });
  it("judges by measuring the element the scene is about, and what else moves does not matter", async () => {
    const { judge } = await import("../src/core/construct/scenarios");
    const at = (x: number, y = 100, extra: object = {}) => ({ x, y, w: 30, h: 30, text: "", shown: true, cls: "", ...extra });
    expect(judge({ kind: "moves", id: "player", dir: "right" }, at(100), at(180), false).ok).toBe(true);
    expect(judge({ kind: "moves", id: "player", dir: "right" }, at(100), at(100), true).ok).toBe(false); // the screen changed (an enemy moved) but the player did not
    expect(judge({ kind: "moves", id: "player", dir: "left" }, at(100), at(60), false).ok).toBe(true);
    expect(judge({ kind: "moves", id: "player", dir: "up" }, at(100, 300), at(100, 220), false).ok).toBe(true);
    expect(judge({ kind: "shows", id: "menu" }, at(0, 0, { shown: false }), at(0, 0), false).ok).toBe(true);
    expect(judge({ kind: "shows", id: "menu" }, at(0, 0, { shown: false }), at(0, 0, { shown: false }), true)).toMatchObject({ ok: false });
    expect(judge({ kind: "hides", id: "menu" }, at(0), null, false).ok).toBe(true);
    expect(judge({ kind: "up", id: "count" }, at(0, 0, { text: "Score: 10" }), at(0, 0, { text: "Score: 20" }), false).ok).toBe(true);
    expect(judge({ kind: "contains", id: "count", text: "game over" }, null, at(0, 0, { text: "GAME OVER" }), false).ok).toBe(true);
    expect(judge({ kind: "screen" }, null, null, false).ok).toBe(false);
  });
});

describe("running a unit once on the real state", () => {
  const state = JSON.stringify({ player: { x: 10, y: 20, vx: 0 }, enemies: [{ x: 5, dir: 1 }], score: 0 });
  const run = async (kind: "fn" | "view" | "handler", name: string, code: string, others: string[] = [], params?: string[]) => {
    const { smokeRun } = await import("../src/core/construct/sandbox");
    return smokeRun({ kind, name, code, state, others, params });
  };
  it("finds a name that does not exist, as a unit written without seeing the state would use", async () => {
    const out = await run("fn", "jump", "function jump() { if (player && player.velocity.y) { player.velocity.y -= 0.8; } }");
    expect(out[0]).toMatch(/player is not defined/);
    expect(out[0]).toMatch(/Functions you can call/);
    expect((await run("view", "drawBackground", "function drawBackground(S) { ctx.fillStyle = 'red'; }"))[0]).toMatch(/ctx is not defined/);
    expect((await run("handler", "onKey", "function onKey(e) { if (e.key === 'ArrowRight') player.x += 10; }"))[0]).toMatch(/player is not defined/);
  });
  it("finds a key read where the state has none", async () => {
    const out = await run("handler", "onKey", "function onKey(e) { S.player.velocity.x = 2; }");
    expect(out[0]).toMatch(/Cannot set propert|Cannot read propert/);
    expect(out[0]).toMatch(/The state S holds exactly the keys/);
  });
  it("lets a unit that uses the state and the page as it should through", async () => {
    expect(await run("handler", "onKey", "function onKey(e) { if (e.key === 'ArrowRight') S.player.x += 5; }")).toEqual([]);
    expect(await run("view", "drawScore", "function drawScore(S) { document.getElementById('score').textContent = 'Score: ' + S.score; const box = document.createElement('div'); box.style.left = S.player.x + 'px'; document.getElementById('world').appendChild(box); }")).toEqual([]);
    expect(await run("fn", "step", "function step(player) { return { x: player.x + player.vx, y: player.y, vx: player.vx }; }", [], ["player"])).toEqual([]);
    expect(await run("handler", "onTick", "function onTick() { S.player = step(S.player); }", ["function step(p) { return p; }"])).toEqual([]);
  });
  it("does not judge what the program decides, and stops a loop that never ends", async () => {
    expect(await run("handler", "onKey", "function onKey(e) { throw new Error('nope'); }")).toEqual([]);
    expect((await run("handler", "onKey", "function onKey(e) { while (true) {} }"))[0]).toMatch(/never ends/);
  });
});

describe("a plan asked one kind at a time", () => {
  it("reads a line without the kind word when the question was about one kind, and makes the unit that kind", async () => {
    const { normalizeUnits } = await import("../src/core/construct/tasklist");
    const reqs = [{ id: "R1", text: "a" }];
    const views = normalizeUnits("drawScore | shows the score | R1 | into: score\nfn drawBoard | draws the board | R1 | into: board", reqs, [], "view").units;
    expect(views.map((u) => `${u.kind}:${u.name}:${u.into}`)).toEqual(["view:drawScore:score", "view:drawBoard:board"]);
    const calcs = normalizeUnits("movePlayer(player, input) | the player one step on | R1\ne: movePlayer({x:0}, 1) => 1", reqs, [], "fn").units;
    expect(calcs[0]).toMatchObject({ kind: "fn", name: "movePlayer", signature: "movePlayer(player, input)" });
    expect(calcs[0].examples).toHaveLength(1);
  });
});

describe("binding the keys of the state a small model used as variables", () => {
  const keys = ["gameState", "player", "level", "score", "lives", "timeLeft", "enemies", "input"];
  it("puts S. before a key used as a variable, as in the units of a real run", async () => {
    const { bindStateNames } = await import("../src/core/construct/bind");
    const drawPlayer = `function drawPlayer() {
    const canvas = document.getElementById('canvas');
    if (gameState === 'gameOver' || gameState === 'win') return;
    const { x, y, width, height, color } = player;
    const { coinsCollected, totalCoins } = score;
    const { lives } = lives;
    const { timeLeft } = timeLeft;
    ctx.fillStyle = color;
}`;
    const r = bindStateNames(drawPlayer, keys);
    expect(r.code).toContain("S.gameState === 'gameOver'");
    expect(r.code).toContain("} = S.player;");
    expect(r.code).toContain("} = S.score;");
    expect(r.code).toContain("lives = S.lives;"); // `const { lives } = lives` becomes one name bound to the key
    expect(r.code).toContain("timeLeft = S.timeLeft;");
    expect(r.code).toContain("ctx.fillStyle = color"); // ctx and color are not keys of S: left as they are
    expect(r.bound.sort()).toEqual(["gameState", "level", "lives", "player", "score", "timeLeft"].filter((k) => r.bound.includes(k)).sort());
    expect(() => new Function(r.code)).not.toThrow();
  });
  it("rewrites an assignment, a shorthand property and a self reference, and leaves what the unit declares alone", async () => {
    const { bindStateNames } = await import("../src/core/construct/bind");
    const r = bindStateNames("function onHit(e) { lives--; const level = level; const o = { lives, extra: 1 }; return o; }", keys);
    expect(r.code).toContain("S.lives--");
    expect(r.code).toContain("level = S.level");
    expect(r.code).toContain("{ lives: S.lives, extra: 1 }");
    const own = bindStateNames("function f(player, S) { const lives = 3; for (const enemies of player.list) { enemies.x = lives; } return player.x + level; }", keys);
    expect(own.code).toContain("return player.x + S.level;"); // a parameter and a local are theirs; only `level` is free
    expect(own.code).not.toContain("S.player");
    expect(own.code).not.toContain("S.lives");
    expect(own.code).not.toContain("S.enemies");
  });
  it("does not touch a property named like a key, and gives code it cannot read back unchanged", async () => {
    const { bindStateNames } = await import("../src/core/construct/bind");
    expect(bindStateNames("function f(a) { return a.player + { player: 1 }.player; }", keys).code).toBe("function f(a) { return a.player + { player: 1 }.player; }");
    expect(bindStateNames("function f( {", keys).code).toBe("function f( {");
  });
});

describe("what a small model writes the way it writes it", () => {
  const u = (kind: "fn" | "view" | "handler", name: string, extra: object = {}) => ({ id: `u${name}`, kind, name, does: "x", serves: ["R1"], uses: [], examples: [], ...extra });
  it("reads a function written as a method, as a class body or an object would", async () => {
    const { extractUnit } = await import("../src/core/construct/pipeline");
    const a = u("fn", "applyGravity"), b = u("fn", "checkCollisions");
    const reply = "applyGravity(player, level) {\n  return player;\n}\n\ncheckCollisions(player, level) {\n  return { ...player };\n}\n\ncheckOverlap(a, b) {\n  return true;\n}";
    expect(extractUnit(reply, a, [a, b])).toBe("function applyGravity(player, level) {\n  return player;\n}");
    expect(extractUnit(reply, b, [a, b])).toContain("function checkCollisions(player, level) {");
    expect(extractUnit("collectCoin(player, coins) {\n  return [];\n}", u("fn", "collectCoin"))).toBe("function collectCoin(player, coins) {\n  return [];\n}");
    expect(extractUnit("function ok() { return 1; }", u("fn", "ok"))).toBe("function ok() { return 1; }");
  });
  it("wires a precise key, down and up, and reads the events a model invents as far as they mean something", async () => {
    const { normalizeOn } = await import("../src/core/construct/tasklist");
    const { wiring } = await import("../src/core/construct/assemble");
    expect(normalizeOn("key left")).toBe("keydown ArrowLeft");
    expect(normalizeOn("keyup right")).toBe("keyup ArrowRight");
    expect(normalizeOn("key space")).toBe("keydown Space");
    expect(normalizeOn("keydown w")).toBe("keydown w");
    expect(normalizeOn("player y < flag y")).toBeNull(); // a condition is not an event
    expect(normalizeOn("tick 16")).toBe("tick 16");
    const w = wiring([u("handler", "onJump", { on: "keydown Space" }), u("handler", "onLeftUp", { on: "keyup ArrowLeft" })]).events;
    expect(w).toContain('addEventListener("keydown"');
    expect(w).toContain('e.key === " " || e.code === "Space"');
    expect(w).toContain('addEventListener("keyup"');
    expect(w).toContain('e.key === "ArrowLeft"');
  });
  it("reads every requirement named, with or without a comment, and drops a comment from an example", async () => {
    const { parseLines, normalizeUnits } = await import("../src/core/construct/tasklist");
    const l = parseLines("fn applyGravity(player, level) | falls | R1 (movement physics), R2 (ground)\ne: applyGravity({y: 1}, {}) => {y: 2} // one step\ne: f() => [] // coin removed", "fn");
    expect(l.units[0].serves).toEqual(["R1", "R2"]);
    const n = normalizeUnits("fn applyGravity(player, level) | falls | R1\ne: applyGravity(1, 2) => 3 // note", [{ id: "R1", text: "a" }], [], "fn").units[0];
    expect(n.examples).toEqual([{ call: "applyGravity(1, 2)", expect: "3" }]);
  });
  it("takes the layout's id when the plan named the same element another way, and only when it can only be that one", async () => {
    const { reconcileIds } = await import("../src/core/construct/pipeline");
    const units = [u("view", "drawGame", { into: "canvas" }), u("handler", "onRestart", { on: "click #restartBtn" }), u("view", "drawUi", { into: "hud" }), u("view", "drawOdd", { into: "box" })];
    const notes = reconcileIds(units, '<canvas id="gameCanvas"></canvas><button id="restart-btn"></button><div id="hud-top"></div><div id="box-a"></div><div id="box-b"></div>');
    expect(units[0].into).toBe("gameCanvas");
    expect(units[1].on).toBe("click #restart-btn");
    expect(units[2].into).toBe("hud-top");
    expect(units[3].into).toBe("box"); // two candidates: left for the check to ask about
    expect(notes).toHaveLength(3);
  });
});
