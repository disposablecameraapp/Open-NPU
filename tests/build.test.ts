import { xFlaws } from "../src/core/xcheck";
import { describe, expect, it } from "vitest";
import { bundleHtml, linkedFiles, pageLinking } from "../src/core/bundle";
import { cleanFile, directPlan, interfaceOf, parsePlan, scriptSurface, stepwise, stubHistory, Session } from "../src/core/build";
import { artifactsIn } from "../src/core/artifacts";
import { describeProblems } from "../src/core/codecheck";
import { promptTokens } from "../src/core/context";
import type { ChatEvent, ChatMessage } from "../src/shared/types";

const file = (title: string, body: string, type = "html") => `<artifact type="${type === "css" || type === "js" ? "code" : type}"${type === "css" ? ' language="css"' : type === "js" ? ' language="javascript"' : ""} title="${title}">\n${body}\n</artifact>`;
const stats = { ttftSec: 0.1, tokPerSec: 10, tokens: 5, totalSec: 0.5 };
const run = async (g: AsyncGenerator<ChatEvent, any>) => { const events: ChatEvent[] = []; let r = await g.next(); while (!r.done) { events.push(r.value); r = await g.next(); } return { events, result: r.value }; };
const textOf = (m: ChatMessage) => (typeof m.content === "string" ? m.content : "");

/** A model that answers by session name; records what each session was sent. */
function fake(reply: (sid: string, msgs: ChatMessage[]) => string) {
  const seen: { sid: string; msgs: ChatMessage[]; schema?: object }[] = [];
  const stream: Session = async function* (sid, msgs, _think, _role, schema) {
    if (/:x:ask$/.test(sid)) { yield { id: sid, type: "answer", text: "" }; yield { id: sid, type: "done", stats }; return; } // the closed questions about what is wanted: no model answers in these tests, so the words stand in
    seen.push({ sid, msgs, schema });
    const text = reply(sid.replace(/^[^:]*:/, ""), msgs);
    // in small chunks, like a real stream
    for (let i = 0; i < text.length; i += 17) yield { id: sid, type: "answer", text: text.slice(i, i + 17) };
    yield { id: sid, type: "done", stats };
  };
  return { stream, seen };
}

describe("the plan", () => {
  it("reads the planner's lines", () => {
    const p = parsePlan("Mode: build\nDesign: dark, neon\nFile: index.html | new | the page\n- File: `style.css` | new | the look\nFile: script.js | new | the snake", []);
    expect(p).toMatchObject({ mode: "build", design: "dark, neon" });
    expect(p.files.map((f) => f.name)).toEqual(["index.html", "style.css", "script.js"]);
  });
  it("turns new into edit for a file that exists, and ignores nonsense names", () => {
    const p = parsePlan("Mode: build\nFile: Style.css | new | x\nFile: ../../etc | new | y\nFile: a.js | edit | z", ["style.css"]);
    expect(p.files).toEqual([{ name: "style.css", action: "edit", job: "x" }, { name: "a.js", action: "new", job: "z" }]);
  });
  it("answer mode keeps the files asked for, with their landmarks", () => {
    const p = parsePlan("Mode: answer\nRead: script.js (draw, update)\nRead: nothing.txt", ["script.js"]);
    expect(p).toMatchObject({ mode: "answer", read: [{ name: "script.js", spots: ["draw", "update"] }] });
  });
  it("an explicit Mode: answer wins over stray File lines", () => {
    const p = parsePlan("Mode: answer\nFile: index.html | new | the page", []);
    expect(p).toMatchObject({ mode: "answer", files: [] });
  });
  it("a game planned as three files becomes one page, a site stays several files", () => {
    const three = "Mode: build\nFile: index.html | new | canvas\nFile: style.css | new | look\nFile: script.js | new | snake loop";
    const p = parsePlan(three, [], "make a snake game");
    expect(p.files).toHaveLength(1);
    expect(p.files[0]).toMatchObject({ name: "index.html", action: "new" });
    expect(p.files[0].job).toMatch(/snake loop/);
    expect(parsePlan(three, [], "a portfolio site with a small game").files).toHaveLength(3);
  });
  it("a plain request for one small program skips the planner; questions, sites and existing files do not", () => {
    expect(directPlan("make a playable snake game", [])?.files).toMatchObject([{ name: "index.html", action: "new" }]);
    expect(directPlan("fais-moi un jeu de snake", [])).not.toBeNull();
    expect(directPlan("how do I make a snake game?", [])).toBeNull();
    expect(directPlan("make a portfolio site with a game", [])).toBeNull();
    expect(directPlan("make the snake faster", ["index.html"])).toBeNull();
    expect(directPlan("hello there, how are you today", [])).toBeNull();
  });
  it("falls back to one page for a game and to page plus style for a site when the planner was useless", () => {
    const p = parsePlan("hmm", [], "fais-moi un jeu de snake en page web");
    expect(p.files.map((f) => f.name)).toEqual(["index.html"]);
    expect(parsePlan("", [], "fais-moi un site portfolio").files.map((f) => f.name)).toEqual(["index.html", "style.css"]);
    expect(parsePlan("", [], "bonjour, ça va ?").mode).toBe("answer");
    expect(parsePlan("", ["a.html"], "merci").mode).toBe("answer");
  });
});

describe("a writer's reply as a file", () => {
  it("drops a code fence and an artifact tag, also while streaming", () => {
    expect(cleanFile("```html\n<p>x</p>\n```", true)).toBe("<p>x</p>\n");
    expect(cleanFile('<artifact type="html" title="a">\n<p>x</p>\n</artifact>', true)).toBe("<p>x</p>\n");
    expect(cleanFile("<p>x</p>\n</arti", false)).toBe("<p>x</p>\n");
    expect(cleanFile("<p>x</p>\n``", false)).toBe("<p>x</p>\n");
    expect(cleanFile("a < b && c", false)).toBe("a < b && c");
  });
  it("reads what a script offers and expects, without a model", () => {
    const code = "const W = 20, H = 20;\nlet snake = [], dir = 'right';\nfunction step(dx, dy) {}\nconst draw = (ctx) => {};\nconst el = document.getElementById('score');\ndocument.addEventListener('keydown', onKey);\nfunction onKey(e) {}";
    const out = scriptSurface(code).join("\n");
    expect(out).toContain("step(dx, dy)");
    expect(out).toContain("draw(ctx)");
    expect(out).toMatch(/state: [^\n]*W[^\n]*H[^\n]*snake[^\n]*dir/);
    expect(out).toContain("looks for: #score");
    expect(out).toContain("listens to: keydown");
  });
});

describe("pages made of several files", () => {
  const html = '<!doctype html><html><head><link rel="stylesheet" href="./css/Style.css?v=2"></head>\n<body>\n<button id="go">go</button>\n<script defer src="script.js"></script>\n</body></html>';
  const css = { title: "style.css", kind: "code", language: "css", content: "body { margin: 0 }\n#go { color: red }" };
  const js = { title: "script.js", kind: "code", language: "javascript", content: "const a = 1;\nundefinedFn();" };
  it("finds what a page links, and inlines it", () => {
    expect(linkedFiles(html)).toEqual(["style.css", "script.js"]);
    const b = bundleHtml(html, [css, js]);
    expect(b.html).toContain("<style>\nbody { margin: 0 }");
    expect(b.html).not.toContain("src=");
    expect(b.html.indexOf("undefinedFn")).toBeGreaterThan(b.html.indexOf("go</button>")); // the deferred script moved after the markup
    expect(b.missing).toEqual([]);
  });
  it("tells which files are missing and leaves network links alone", () => {
    const b = bundleHtml('<link rel="stylesheet" href="x.css"><script src="https://cdn.x/y.js"></script>', []);
    expect(b.missing).toEqual(["x.css"]);
    expect(b.html).toContain("https://cdn.x/y.js");
  });
  it("reports a script error against the script's own line", () => {
    const b = bundleHtml(html, [css, js]);
    const line = b.html.split("\n").findIndex((l) => l.includes("undefinedFn")) + 1;
    expect(describeProblems([{ k: "error", m: "Uncaught ReferenceError: undefinedFn is not defined", l: line }], false, b.html, 6, b.locate))
      .toEqual(["script.js: ReferenceError: undefinedFn is not defined (line 2: undefinedFn();)"]);
  });
  it("finds the page that links a stylesheet", () => {
    expect(pageLinking(css, [{ title: "index.html", kind: "html", language: "html", content: html }, css])?.title).toBe("index.html");
    expect(pageLinking(css, [])).toBeUndefined();
  });
  it("lists the names the other files must use", () => {
    expect(interfaceOf({ title: "i.html", kind: "html", language: "html", content: '<div id="a" class="x y"><canvas></canvas></div>' })).toMatch(/ids: #a[\s\S]*classes: \.x \.y[\s\S]*canvas/);
    expect(interfaceOf(css)).toMatch(/selectors: body \| #go/);
  });
});

describe("the main session keeps no code", () => {
  it("reduces every file of the history to a line", () => {
    const h: ChatMessage[] = [{ role: "user", content: "make it" }, { role: "assistant", content: `Done.\n${file("index.html", "<h1>x</h1>\n".repeat(50))}\nEnjoy` }];
    const s = stubHistory(h);
    expect(textOf(s[1])).toMatch(/\[file "index.html" — html, 51 lines/);
    expect(textOf(s[1])).not.toContain("<h1>");
    expect(textOf(s[1])).toContain("Enjoy");
  });
});

describe("building from one prompt", () => {
  const big = "A sentence that makes the request long enough to be worth a plan.";
  it("writes each file whole in one session, each seeing what the earlier ones define, then explains", async () => {
    const m = fake((name, msgs) => {
      if (name === "plan") return "Mode: build\nDesign: dark and neon\nFile: index.html | new | the page\nFile: style.css | new | the look\nFile: script.js | new | scroll effects";
      if (name === "write:0") return "<!doctype html>\n<html><head><title>t</title><link rel=\"stylesheet\" href=\"style.css\"></head><body>\n<h1 id=\"hero\">Hi</h1>\n<section class=\"card\">F</section>\n<footer id=\"foot\">end</footer>\n<script src=\"script.js\"></script>\n</body></html>";
      if (name === "write:1") return "```css\n.card { color: var(--c) }\n```";
      if (name === "write:2") return "document.getElementById('hero');";
      if (name === "explain") return "I built the site: three files. Open index.html.";
      return "";
    });
    const history: ChatMessage[] = [{ role: "system", content: "Be kind." }, { role: "user", content: `${big} Build me a full beautiful website with animations.` }];
    const { events, result } = await run(stepwise({ id: "c", messages: history, stream: m.stream, maxChars: 3000 }));
    expect(result.handled).toBe(true);
    const files = artifactsIn(result.text);
    expect(files.map((f) => f.title)).toEqual(["index.html", "style.css", "script.js"]);
    expect(files[0].content).toMatch(/hero[\s\S]*class="card"[\s\S]*foot[\s\S]*<\/body>\s*<\/html>/);
    expect(files[1].content.trimEnd()).toBe(".card { color: var(--c) }");
    expect(result.text.trim().endsWith("Open index.html.")).toBe(true);
    // no session writes a piece of a file: one per file
    expect(m.seen.filter((s) => s.sid.startsWith("c:write")).map((s) => s.sid)).toEqual(["c:write:0", "c:write:1", "c:write:2"]);
    // the script's writer saw the page it must fit, and the shared design
    const script = m.seen.find((s) => s.sid === "c:write:2")!;
    expect(textOf(script.msgs[1])).toMatch(/hero/);
    expect(textOf(script.msgs[1])).toContain("Design shared by every file: dark and neon");
    const builds = events.filter((e) => e.type === "build") as Extract<ChatEvent, { type: "build" }>[];
    expect(builds.at(-1)!.build).toMatchObject({ status: "done" });
    expect(builds.at(-1)!.build.steps.map((s) => s.status)).toEqual(["done", "done", "done"]);
    const explain = m.seen.find((s) => s.sid === "c:explain")!;
    expect(explain.msgs.map(textOf).join("\n")).not.toContain("<footer");
  });

  it("checks the script inside a one-file page, and mends it", async () => {
    const broken = "<!doctype html>\n<html><head><title>t</title></head><body>\n<canvas id=\"c\"></canvas>\n<script>\nconst el = document.getElementById('board');\nlet a = ;\n</script>\n</body></html>";
    const m = fake((name, msgs) => {
      if (name.startsWith("write")) return broken;
      if (name.startsWith("repair")) {
        const ask = textOf(msgs[1]);
        if (ask.includes("SyntaxError")) return broken.replace("let a = ;", "let a = 1;");
        return ask.includes("#board") ? broken.replace("let a = ;", "let a = 1;").replace("'board'", "'c'") : "";
      }
      return name === "explain" ? "Done." : "";
    });
    const { result } = await run(stepwise({ id: "w", messages: [{ role: "user", content: "make a snake game with a canvas" }], stream: m.stream, maxChars: 8000 }));
    expect(m.seen.some((s) => s.sid.startsWith("w:repair"))).toBe(true);
    const page = artifactsIn(result.text)[0].content;
    expect(page).toContain("let a = 1;");
    expect(page).toContain("getElementById('c')");
  });

  // a small program with a rule, built by the general engine: nothing in it is about a game
  const PLAN_UNITS = [
    { kind: "state", name: "S", does: "the count, starting at 0", serves: ["R1"] },
    { kind: "layout", name: "layout", does: "the count and a button to add one", serves: ["R1", "R2"] },
    { kind: "fn", name: "clampCount", does: "keeps a count between 0 and a maximum", serves: ["R3"], signature: "clampCount(n, max) -> number", examples: [{ call: "clampCount(15, 10)", expect: "10" }, { call: "clampCount(3, 10)", expect: "3" }] },
    { kind: "fn", name: "nextCount", does: "the count after one more is added, never above the maximum", serves: ["R2", "R3"], uses: ["clampCount"], signature: "nextCount(count, max) -> number", examples: [{ call: "nextCount(9, 10)", expect: "10" }, { call: "nextCount(10, 10)", expect: "10" }, { call: "nextCount(0, 10)", expect: "1" }] },
    { kind: "view", name: "drawCount", does: "shows the count", serves: ["R1"] },
    { kind: "handler", name: "onInc", does: "adds one to the count", serves: ["R2"], uses: ["nextCount"], on: "click #inc" }
  ];
  const CODE: Record<string, string> = {
    S: '{"count": 0}',
    layout: '<div id="count"></div><button id="inc">+1</button><style>#count { font-size: 40px; }</style>',
    clampCount: "function clampCount(n, max) { return Math.max(0, Math.min(max, n)); }",
    nextCount: "function nextCount(count, max) { return clampCount(count + 1, max); }",
    drawCount: 'function drawCount(S) { document.getElementById("count").textContent = S.count; }',
    onInc: "function onInc() { S.count = nextCount(S.count, 10); }"
  };
  const constructAnswer = (name: string, msgs: ChatMessage[] = []) => {
    const user = msgs[1] ? textOf(msgs[1]) : "";
    if (/:Requirements:/.test(name)) return JSON.stringify({ title: "Counter", language: "English", requirements: [{ text: "The page shows a count that starts at 0" }, { text: "A button adds one to the count" }, { text: "The count never goes above 10" }] });
    if (/:Plan/.test(name)) return name.includes("gaps") ? '{"units":[]}' : JSON.stringify({ units: PLAN_UNITS });
    if (/:Scenarios:/.test(name)) return "R2 | click #inc | #count text goes up\nR2 | press Escape | #nothere shows";
    if (/:Units?: /.test(name)) return [...user.matchAll(/^name: (\S+)$/gm)].map((m) => CODE[m[1]] ?? "").join("\n\n");
    return name === "explain" ? "Done." : "";
  };
  const buildCounter = (answer = constructAnswer, extra: Record<string, unknown> = {}) => {
    const m = fake(answer);
    return { m, done: run(stepwise({ id: "c", messages: [{ role: "user", content: "make a counter app with a plus one button. The count starts at 0 and the button adds one. The count must never go above 10, whatever the number of clicks. Show the count big, in the middle of the page, with the button under it, in a clean simple style that looks like a finished small tool and not like a sketch." }], stream: m.stream, maxChars: 8000, ...extra })) };
  };

  it("builds a program by the general engine: requirements, a plan of units, then one checked unit at a time", async () => {
    const { m, done } = buildCounter();
    const { events, result } = await done;
    const page = artifactsIn(result.text)[0].content;
    expect(m.seen.map((x) => x.sid.replace(/^c:x:\d+:/, "").replace(/:\d+$/, "")).filter((x) => !/explain/.test(x))).toEqual(["Requirements", "Plan", "Unit: S", "Unit: layout", "Units: clampCount, nextCount", "Unit: drawCount", "Unit: onInc", "Scenarios"]);
    // the scenes that name an id the page has are kept, the others are left out
    expect(page).toContain('"scenarios"');
    expect(page).toContain("#count text goes up");
    expect(page).not.toContain("#nothere");
    for (const n of Object.keys(CODE)) expect(page).toContain(n === "S" ? '"count"' : n === "layout" ? 'id="inc"' : `function ${n}`);
    expect(page).toContain('addEventListener("click"');
    expect(page).toContain("<!-- /x-construct -->");
    expect(m.seen.find((x) => /Requirements/.test(x.sid))!.schema).toMatchObject({ required: ["title", "requirements"] });
    expect(m.seen.find((x) => /Plan/.test(x.sid))!.schema).toBeUndefined(); // the plan is asked as lines, which a small model follows better than a nested form
    const labels = ((events.filter((e) => e.type === "build") as any[]).at(-1).build.steps[0].stages as any[]).map((g) => g.label);
    expect(labels).toEqual(expect.arrayContaining(["Listing what is asked", "Planning the units", "Writing S", "Writing layout", "Writing clampCount, nextCount", "Writing onInc"]));
  });

  it("plans one requirement at a time when the whole plan comes back unusable", async () => {
    const byReq: Record<string, string[]> = { R1: ["S", "layout", "drawCount"], R2: ["onInc", "nextCount"], R3: ["clampCount"] };
    const answer = (name: string, msgs: ChatMessage[] = []) => {
      const one = /:Plan \((R\d)\)/.exec(name);
      if (one) return JSON.stringify({ units: PLAN_UNITS.filter((u) => byReq[one[1]].includes(u.name)).map((u) => ({ ...u, serves: [one[1]] })) });
      if (/:Plan:/.test(name)) return "I cannot plan this";
      return constructAnswer(name, msgs);
    };
    const { m, done } = buildCounter(answer);
    const { result } = await done;
    const calls = m.seen.map((x) => x.sid.replace(/^c:x:\d+:/, "").replace(/:\d+$/, ""));
    expect(calls.filter((c) => /^Plan/.test(c))).toEqual(["Plan", "Plan (R1)", "Plan (R2)", "Plan (R3)"]);
    const page = artifactsIn(result.text)[0].content;
    expect(page).toContain("function onInc");
    expect(page).toContain("function clampCount");
  });

  it("tells the layout writer which elements the views draw into, and checks they exist", async () => {
    const { checkUnit } = await import("../src/core/construct/pipeline");
    const { ContextEngine } = await import("../src/core/construct/context");
    const plan = { title: "T", language: "English", requirements: [{ id: "R1", text: "x" }], units: [
      { id: "u1", kind: "layout" as const, name: "layout", does: "page", serves: ["R1"], uses: [], examples: [] },
      { id: "u2", kind: "view" as const, name: "drawBoard", does: "draws the board", serves: ["R1"], uses: [], examples: [], into: "board" }
    ] };
    const engine = new ContextEngine(plan, 4000);
    expect(engine.build(plan.units[0]).text).toContain("an empty element with the id board");
    expect(await checkUnit(plan.units[0], '<div id="other"></div>', engine)).toEqual([expect.stringContaining('"board"')]);
    expect(await checkUnit(plan.units[0], '<div id="board"></div>', engine)).toEqual([]);
  });

  it("gives each writer only its own task and the contract of what it uses, never the other units' code", async () => {
    const { m, done } = buildCounter();
    await done;
    const prompt = (re: RegExp) => textOf(m.seen.find((x) => re.test(x.sid))!.msgs[1]);
    const onInc = prompt(/Unit: onInc/);
    expect(onInc).toContain("nextCount(count, max)"); // the contract of what it uses
    expect(onInc).toContain("count: number"); // the shape of the state
    expect(onInc).toContain("#inc"); // the ids of the page
    expect(onInc).not.toContain("Math.max(0, Math.min"); // not the code of clampCount, which it does not use
    expect(onInc).not.toContain("R3."); // not the requirements it does not serve
    const draw = prompt(/Unit: drawCount/);
    expect(draw).not.toContain("nextCount(count, max): the count");
    expect(prompt(/Unit: S/)).not.toContain("clampCount(15");
  });

  it("runs a function's examples and sends back the exact failures once", async () => {
    let tries = 0;
    const { m, done } = buildCounter((name, msgs) => {
      if (/:Unit: nextCount|:Units: clampCount, nextCount/.test(name)) {
        const user = textOf(msgs![1]);
        if (/Problems:/.test(user)) { tries++; return CODE.nextCount; }
        return `${CODE.clampCount}\nfunction nextCount(count, max) { return count + 1; }`; // forgets the maximum
      }
      return constructAnswer(name, msgs);
    });
    const { result } = await done;
    const page = artifactsIn(result.text)[0].content;
    const repair = m.seen.find((x) => /nextCount \(again\)/.test(x.sid))!;
    expect(textOf(repair.msgs[1])).toContain("nextCount(10, 10) gave 11, expected 10");
    expect(tries).toBe(1);
    expect(page).toContain("clampCount(count + 1, max)");
  });

  it("takes a stopped program up again with the units already written, and asks again for nothing it has", async () => {
    const first = buildCounter();
    const whole = artifactsIn((await first.done).result.text)[0].content;
    // stopped before the view and the handler: their code is in the page only as stubs
    const cut = whole.replace(/function drawCount\(S\) \{[^\n]*\}/, "function drawCount(S) {}").replace(/function onInc\(\) \{[^\n]*\}/, "function onInc() {}").replace(/\n<!-- \/x-construct -->/, "");
    const m = fake(constructAnswer);
    const { result } = await run(stepwise({ id: "c2", messages: [{ role: "user", content: "make a counter app" }, { role: "assistant", content: `Started.\n${file("counter.html", cut)}` }, { role: "user", content: "continue where you left off" }], stream: m.stream, maxChars: 8000 }));
    const out = artifactsIn(result.text).at(-1)!.content;
    expect(m.seen.map((x) => x.sid.replace(/^c2:x:\d+:/, "").replace(/:\d+$/, "")).filter((x) => !/explain/.test(x))).toEqual(["Unit: drawCount", "Unit: onInc"]);
    expect(out).toContain("#count text goes up"); // the scenes written before the stop are kept in the page
    expect(out).toContain('document.getElementById("count").textContent');
    expect(out).toContain("<!-- /x-construct -->");
  });

  it("changes a page of blocks part by part: only the drawing goes to the model, the rest of the page is untouched", async () => {
    const page = `<!doctype html><html><head><meta charset="utf-8"><title>G</title><style>body{margin:0}</style></head><body>
<x-state lives="3"></x-state>
<x-asset name="goomba" size="32x32" about="a brown mushroom walking enemy" style="display:none"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#8b5a2b"/></svg></x-asset>
<x-scene id="level_1"><x-platformer tile="32"><x-legend>
# ground
P player
g walker as:goomba stomp:score+=100 hurt:lives-=1
F flag
</x-legend>
.P.gF.
######</x-platformer></x-scene>
</body></html>
`;
    const history: ChatMessage[] = [
      { role: "user", content: "make a platformer like mario" }, { role: "assistant", content: `Here.\n${file("mario.html", page)}` },
      { role: "user", content: "make the goomba red" }
    ];
    const m = fake((name) => {
      if (name.includes("Changing")) return '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#d22"/></svg>';
      return name === "explain" ? "Done." : "";
    });
    const { result } = await run(stepwise({ id: "m", messages: history, stream: m.stream, maxChars: 8000 }));
    const out = artifactsIn(result.text).at(-1)!.content;
    expect(out).toContain("#d22");
    expect(out).not.toContain("#8b5a2b");
    expect(out).toContain("<x-scene id=\"level_1\">");
    expect(out.replace(/<x-asset[\s\S]*?<\/x-asset>/, "")).toBe(page.replace(/<x-asset[\s\S]*?<\/x-asset>/, ""));
    expect(m.seen.some((s) => /^m:edit:/.test(s.sid))).toBe(false); // not the line-by-line editor
    for (const s of m.seen) expect(s.msgs.map(textOf).join("").length).toBeLessThan(6000);
  });

  it("takes the parts pointed at in the preview, and each numbered instruction is its own step", async () => {
    const page = `<!doctype html><html><head><meta charset="utf-8"><title>G</title></head><body>
<x-state lives="3"></x-state>
<x-asset name="goomba" size="32x32" about="a brown mushroom walking enemy" style="display:none"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#8b5a2b"/></svg></x-asset>
<x-asset name="hero" size="28x36" about="a small hero" style="display:none"><svg viewBox="0 0 28 36"><rect width="28" height="36" fill="#2255cc"/></svg></x-asset>
<x-scene id="level_1"><x-platformer tile="32"><x-legend>
# ground
P player
F flag
</x-legend>
.PF.
####</x-platformer></x-scene>
</body></html>
`;
    const { picksNote } = await import("../src/core/slidePicks");
    const note = picksNote([
      { file: "mario.html", n: 3, title: 'the drawing "goomba"', part: { tag: "rect", selector: "x-art", part: "drawing", name: "goomba", scene: "level_1", uid: 3 } },
      { file: "mario.html", n: 4, title: 'the drawing "hero"', part: { tag: "rect", selector: "x-art", part: "drawing", name: "hero", scene: "level_1", uid: 4 } }
    ]);
    const history: ChatMessage[] = [
      { role: "user", content: "make a platformer like mario" }, { role: "assistant", content: `Here.\n${file("mario.html", page)}` },
      { role: "user", content: `${note}for 1 make it red, for 2 make it green` }
    ];
    const m = fake((name) => {
      if (name.includes("Changing: make it red")) return '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#d22"/></svg>';
      if (name.includes("Changing: make it green")) return '<svg viewBox="0 0 28 36"><rect width="28" height="36" fill="#2a2"/></svg>';
      if (name.includes("Separate changes")) return "- 1: make it red\n- 2: make it green";
      return name === "explain" ? "Done." : "";
    });
    const { events, result } = await run(stepwise({ id: "n", messages: history, stream: m.stream, maxChars: 8000 }));
    const out = artifactsIn(result.text).at(-1)!.content;
    expect(out).toContain("#d22");
    expect(out).toContain("#2a2");
    expect(out).not.toContain("#8b5a2b");
    expect(out).not.toContain("#2255cc");
    expect(m.seen.some((s) => /Which parts/.test(s.sid))).toBe(false);
    const stages = events.flatMap((e) => (e.type === "build" ? e.build.steps.flatMap((s) => s.stages ?? []) : [])).map((g) => g.label);
    expect(stages).toEqual(expect.arrayContaining(["Change 1 of 2", "Change 2 of 2"]));
  });

  it("writes an arcade game with the engine without a rules step, and a small model's remark on one frame does not rewrite a game that plays", async () => {
    const game = `<!doctype html><html><head><meta charset="utf-8"><title>Flappy</title></head><body><div id="game"></div><script>Game.run({title:"Flappy",width:800,height:600,background:"#7cf",lives:3,things:[{name:"bird",shape:"circle",color:"#fd0",w:26,x:0.25,y:0.4,gravity:900,edges:"stop"},{name:"pipe",shape:"rect",color:"#2a6",pair:170,w:60,vx:-180}],rules:[{when:{key:"Space"},do:[{op:"velocity",who:"bird",vy:-340}]},{when:{hit:["bird","pipe"]},do:[{op:"lives",by:-1}]}]});</script></body></html>`;
    const m = fake((name) => (name.startsWith("write") ? game : name === "explain" ? "Done." : ""));
    let looks = 0;
    const { result, events } = await run(stepwise({
      id: "f", messages: [{ role: "user", content: "make a playable flappy bird game with 3 lives" }], stream: m.stream, maxChars: 8000,
      check: async () => ({ errors: [], shot: "data:image/jpeg;base64,AAAA" }),
      lookAt: async () => { looks++; return "PROBLEM: the bird rests on the floor"; }
    }));
    expect(artifactsIn(result.text).at(-1)!.content).toContain("Game.run(");
    expect(m.seen.some((s) => /^f:spec:/.test(s.sid))).toBe(false); // the examples and the schema carry the form: no rules to write first
    expect(m.seen.find((s) => /^f:write:/.test(s.sid))!.msgs.map(textOf).join("")).toContain("Game.run");
    expect(looks).toBe(1);
    expect(m.seen.some((s) => /:fix:/.test(s.sid))).toBe(false); // noted, not acted on
    const labels = events.flatMap((e) => (e.type === "build" ? e.build.verify ?? [] : [])).filter((g) => g.id === "look").map((g) => g.note ?? "");
    expect(labels.join(" ")).toContain("noted, not acted on");
  });

  it("writes no rules first for a game, even one written as code, and still does for another program", async () => {
    const ask = async (request: string) => {
      const m = fake((name) => (name.startsWith("spec") ? "1. a rule\n2. another rule" : name === "explain" ? "Done." : ""));
      await run(stepwise({ id: "r", messages: [{ role: "user", content: request }], stream: m.stream, maxChars: 8000 }));
      return m.seen.some((s) => /^r:spec:/.test(s.sid));
    };
    expect(await ask("make a pong game from scratch with no library")).toBe(false);
    expect(await ask("make a playable memory card game")).toBe(false);
    expect(await ask("make a unit converter app for lengths")).toBe(true);
  });

  it("sends a platformer to the blocks even when its words name a tested page (a timer is not a stopwatch)", async () => {
    const m = fake(constructAnswer);
    await run(stepwise({ id: "q", messages: [{ role: "user", content: "make a platformer like the first mario level with a timer, goomba-like enemies and a flag" }], stream: m.stream, maxChars: 8000 }));
    expect(m.seen.some((s) => /Requirements/.test(s.sid))).toBe(true);
    const { directPlan } = await import("../src/core/build");
    expect(directPlan("make a platformer like mario with a timer", [])?.files[0].name).toBe("game.html");
  });

  it("builds a game from a long, natural description, with no verb like make and no word game", async () => {
    const long = "I want a 2D game like the first Super Mario Bros. You play a little character who runs and jumps from left to right through a level. The level has ground with a couple of holes you can fall into, floating platforms and brick blocks to jump on, question-mark blocks that give coins or a mushroom when you hit them from below, and a green pipe. Some enemies, like little mushrooms, walk back and forth: if you jump on their head they are defeated, but if you touch them from the side you lose a life. Coins are scattered around and a counter shows how many I have and my score. I start with 3 lives, there is a time limit shown at the top, and the level ends with a flag at the right: touching it shows a \"You win\" screen. If I run out of lives or time, it says \"Game over\" and I can try again. Use the arrow keys to move and space to jump. Make it colorful with a blue sky, clouds and green hills.";
    expect(long.length).toBeGreaterThan(800);
    expect(directPlan(long, [])?.files).toMatchObject([{ name: "super-mario-bros.html", action: "new" }]);
    expect(directPlan("I'd like a mario-like platformer with enemies and a flag", [])?.mode).toBe("build");
    expect(directPlan("flappy bird please, with hearts that give a life", [])?.mode).toBe("build");
    expect(directPlan("how does a platformer like mario work?", [])).toBeNull();
    const m = fake(constructAnswer);
    await run(stepwise({ id: "l", messages: [{ role: "user", content: long }], stream: m.stream, maxChars: 8000 }));
    expect(m.seen.some((s) => /Requirements/.test(s.sid))).toBe(true); // the program is built in steps, not answered in the chat
  });

  it("reads a fix that copied the example's file name word for word as the file it was given", async () => {
    const { parseReply } = await import("../src/core/review");
    const r = parseReply('<edit file="exact file name">\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\n</edit>');
    expect(r.edits[0].file).toBeNull();
    expect(parseReply('<edit file="game.html">\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\n</edit>').edits[0].file).toBe("game.html");
  });

  it("keeps every session under the budget, however big the project", async () => {
    const huge = file("index.html", "<div class=\"row\" id=\"r\">content</div>\n".repeat(900));
    const history: ChatMessage[] = [
      { role: "user", content: "make a page" }, { role: "assistant", content: `Here.\n${huge}` },
      { role: "user", content: "add a contact section to the page, with a short form and a nice style" }
    ];
    const m = fake((name) => {
      if (name === "plan") return "Mode: build\nFile: index.html | edit | add a contact section\nFile: style.css | new | style the contact form, with nice hover and focus animations";
      if (name.startsWith("where")) return "Where: footer";
      if (name.startsWith("edit")) return "";
      if (name.startsWith("parts")) return "Part: base | variables\nPart: contact | the form";
      return "x { y: z }";
    });
    const maxChars = 4000; // a 4k-token model: half of it for the prompt
    await run(stepwise({ id: "b", messages: history, stream: m.stream, maxChars }));
    for (const s of m.seen) expect(promptTokens(s.msgs), s.sid).toBeLessThan(2200);
  });
});

describe("changing what exists", () => {
  const page = "<html>\n<body>\n<h1>Title</h1>\n<p>Hello</p>\n</body>\n</html>";
  const history: ChatMessage[] = [
    { role: "user", content: "make a page" },
    { role: "assistant", content: `Here.\n${file("index.html", page)}\n${file("style.css", "h1 { color: blue; }\np { margin: 0; }", "css")}` },
    { role: "user", content: "make the title red please" }
  ];
  const plan = "Mode: build\nFile: style.css | edit | the title red";

  it("sends edit blocks for the lines concerned and keeps the rest of the file", async () => {
    const m = fake((name) => name === "plan" ? plan : name.startsWith("edit") ? '<edit file="style.css">\n<<<<<<< SEARCH\nh1 { color: blue; }\n=======\nh1 { color: red; }\n>>>>>>> REPLACE\n</edit>' : name === "explain" ? "The title is red now." : "");
    const { result, events } = await run(stepwise({ id: "e", messages: history, stream: m.stream, maxChars: 60 }));
    const files = artifactsIn(result.text);
    expect(files.map((f) => f.title)).toEqual(["style.css"]); // the page was not sent again
    expect(files[0].content.trimEnd()).toBe("h1 { color: red; }\np { margin: 0; }");
    expect(m.seen.some((s) => s.sid.startsWith("e:redo"))).toBe(false);
    const step = (events.filter((e) => e.type === "build").at(-1) as any).build.steps[0];
    expect(step.diff).toContain("+ h1 { color: red; }");
    // the editor never saw the page, only its own file
    expect(m.seen.find((s) => s.sid === "e:edit:0")!.msgs.map(textOf).join("")).not.toContain("<h1>Title");
  });

  it("rewrites a short file whole first: a small model copies a file better than it matches lines", async () => {
    const m = fake((name) => name === "plan" ? plan : name.startsWith("redo") ? "```css\nh1 { color: red; }\np { margin: 0; }\n```" : name === "explain" ? "Done." : "");
    const { result, events } = await run(stepwise({ id: "w", messages: history, stream: m.stream, maxChars: 8000 }));
    expect(m.seen.some((s) => s.sid.startsWith("w:edit"))).toBe(false);
    expect(artifactsIn(result.text)[0].content.trimEnd()).toBe("h1 { color: red; }\np { margin: 0; }");
    expect((events.filter((e) => e.type === "build").at(-1) as any).build.steps[0].diff).toContain("+ h1 { color: red; }");
  });

  it("does not keep a rewrite that cut the file short or left a '...' for the code", async () => {
    const m = fake((name) => name === "plan" ? plan : name.startsWith("redo") ? "h1 { color: red; }" : name.startsWith("edit") ? '<edit file="style.css">\n<<<<<<< SEARCH\nh1 { color: blue; }\n=======\nh1 { color: red; }\n>>>>>>> REPLACE\n</edit>' : name === "explain" ? "ok" : "");
    const { result } = await run(stepwise({ id: "s", messages: history, stream: m.stream, maxChars: 8000 }));
    expect(m.seen.some((s) => s.sid.startsWith("s:edit"))).toBe(true);
    expect(artifactsIn(result.text)[0].content.trimEnd()).toBe("h1 { color: red; }\np { margin: 0; }");
  });

  it("asks again once, then rewrites the whole file when the edit never matches", async () => {
    const m = fake((name) => name === "plan" ? plan
      : name.startsWith("edit") ? '<edit file="style.css">\n<<<<<<< SEARCH\nthis is not in the file\nat all\n=======\nx\n>>>>>>> REPLACE\n</edit>'
        : name.startsWith("redo") ? "h1 { color: red; }\np { margin: 0; }" : name === "explain" ? "Done." : "");
    const { result, events } = await run(stepwise({ id: "f", messages: history, stream: m.stream, maxChars: 60 }));
    expect(m.seen.filter((s) => s.sid.startsWith("f:edit")).length).toBe(2);
    expect(artifactsIn(result.text)[0].content.trimEnd()).toBe("h1 { color: red; }\np { margin: 0; }");
    expect((events.filter((e) => e.type === "build").at(-1) as any).build.steps[0].note).toMatch(/Rewrote the whole file/);
  });

  it("opens the file being modified as it is, then shows the new version in the same panel", async () => {
    const m = fake((name) => name === "plan" ? plan
      : name.startsWith("redo") ? "h1 { color: red; }\np { margin: 0; }" : name.startsWith("edit") ? '<edit file="style.css">\n<<<<<<< SEARCH\nh1 { color: blue; }\n=======\nh1 { color: red; }\n>>>>>>> REPLACE\n</edit>' : name === "explain" ? "Done." : "");
    const { result, events } = await run(stepwise({ id: "o", messages: history, stream: m.stream, maxChars: 8000 }));
    const first = events.find((e) => e.type === "answer") as any;
    expect(first.text).toMatch(/title="style.css"[\s\S]*h1 \{ color: blue; \}/); // the file as it was, before any change
    const replaced = events.filter((e) => e.type === "replace") as any[];
    expect(replaced.length).toBeGreaterThan(0);
    expect(replaced.at(-1).text).toContain("h1 { color: red; }");
    expect(artifactsIn(result.text)).toHaveLength(1); // one panel for the file, not two
  });

  it("reports a file that could not be changed, and says so", async () => {
    const m = fake((name) => name === "plan" ? plan : name === "explain" ? "I could not change it." : "");
    const { result, events } = await run(stepwise({ id: "g", messages: history, stream: m.stream, maxChars: 8000 }));
    expect(artifactsIn(result.text)).toHaveLength(0);
    expect((events.filter((e) => e.type === "build").at(-1) as any).build.steps[0].status).toBe("error");
  });

  it("works on the lines of a long file only", async () => {
    const long = Array.from({ length: 400 }, (_, i) => `function f${i}() {\n  return ${i};\n}`).join("\n");
    const h: ChatMessage[] = [{ role: "user", content: "a script" }, { role: "assistant", content: file("script.js", long, "js") }, { role: "user", content: "make f200 return 'two hundred'" }];
    const m = fake((name) => name === "plan" ? "Mode: build\nFile: script.js | edit | f200 returns a string"
      : name.startsWith("where") ? "Where: f200"
        : name.startsWith("edit") ? '<edit file="script.js">\n<<<<<<< SEARCH\n  return 200;\n=======\n  return "two hundred";\n>>>>>>> REPLACE\n</edit>' : name === "explain" ? "ok" : "");
    const { result } = await run(stepwise({ id: "l", messages: h, stream: m.stream, maxChars: 6000 }));
    const editor = m.seen.find((s) => s.sid === "l:edit:0")!;
    expect(textOf(editor.msgs[1])).toContain("function f200()");
    expect(textOf(editor.msgs[1])).not.toContain("function f399()");
    expect(artifactsIn(result.text)[0].content).toContain('return "two hundred";');
    expect(artifactsIn(result.text)[0].content).toContain("function f399()");
  });
});

describe("a question is not a build", () => {
  it("passes the conversation on with the files as stubs and the asked part attached", async () => {
    const code = Array.from({ length: 300 }, (_, i) => `function f${i}() {\n  return ${i};\n}`).join("\n");
    const h: ChatMessage[] = [{ role: "user", content: "a script" }, { role: "assistant", content: file("script.js", code, "js") }, { role: "user", content: "what does f10 do?" }];
    const m = fake((name) => (name === "plan" ? "Mode: answer\nRead: script.js (f10)" : ""));
    const { result } = await run(stepwise({ id: "q", messages: h, stream: m.stream, maxChars: 3000 }));
    expect(result.handled).toBe(false);
    const msgs = (result.messages as ChatMessage[]).filter((m) => m.role !== "system");
    expect(textOf(msgs[1])).toMatch(/^\[file "script.js"/);
    expect(textOf(msgs[2])).toContain("function f10()");
    expect(textOf(msgs[2])).not.toContain("function f250()");
    // the model that answers is told it cannot write edit blocks here
    expect((result.messages as ChatMessage[]).find((m) => m.role === "system") && textOf((result.messages as ChatMessage[]).find((m) => m.role === "system")!)).toMatch(/do not write <edit> blocks/);
  });
  it("says it is planning before the plan exists, and clears that line when there is nothing to build", async () => {
    const m = fake((name) => (name === "plan" ? "Mode: answer" : ""));
    const { events } = await run(stepwise({ id: "p", messages: [{ role: "user", content: "make a landing page for my pottery shop with several sections" }], stream: m.stream, maxChars: 3000 }));
    const builds = events.filter((e) => e.type === "build") as any[];
    expect(builds[0].build).toMatchObject({ status: "running", steps: [] });
    expect(builds[0].build.phase).toMatch(/Planning/);
    expect(builds.at(-1).build).toMatchObject({ status: "done", steps: [] });
  });
  it("does not even plan a greeting", async () => {
    const m = fake(() => "");
    const { result } = await run(stepwise({ id: "h", messages: [{ role: "user", content: "salut" }], stream: m.stream, maxChars: 3000 }));
    expect(result.handled).toBe(false);
    expect(m.seen).toHaveLength(0);
  });
  it("does not plan a question that asks for nothing to be made", async () => {
    const m = fake(() => "Mode: build\nFile: index.html | new | x");
    const q = "Quelle somme faut-il placer aujourd'hui à 4 % annuel pour disposer de 10 000 € dans 6 ans ? on divise par 1,04^6 non ?";
    const { result } = await run(stepwise({ id: "d3", messages: [{ role: "user", content: q }], stream: m.stream, maxChars: 3000 }));
    expect(result.handled).toBe(false);
    expect(m.seen).toHaveLength(0);
  });
  it("falls back to the normal answer when the planner fails", async () => {
    const stream: Session = async function* () { throw new Error("boom"); };
    const msgs: ChatMessage[] = [{ role: "user", content: "write me a long and complicated poem about the sea" }];
    const { result } = await run(stepwise({ id: "z", messages: msgs, stream, maxChars: 3000 }));
    expect(result).toEqual({ handled: false, messages: msgs });
  });
});

describe("a model for each job", () => {
  it("asks for the planner's model, then each file's, then the chat model for the explanation", async () => {
    const roles: Record<string, string | undefined> = {};
    const stream: Session = async function* (sid, _msgs, _worker, role) {
      roles[sid.replace(/^[^:]*:/, "")] = role;
      const name = sid.replace(/^[^:]*:/, "");
      const text = name === "plan" ? "Mode: build\nFile: index.html | new | page\nFile: style.css | new | look\nFile: script.js | new | logic"
        : name.startsWith("write:0") ? "<!doctype html><html><body><canvas id=c></canvas></body></html>" : name.startsWith("write:1") ? "body { margin: 0; }" : name.startsWith("write:2") ? "let a = 1;" : "Done.";
      yield { id: sid, type: "answer", text };
      yield { id: sid, type: "done", stats };
    };
    await run(stepwise({ id: "r", messages: [{ role: "user", content: "make a small web page with a canvas and a script" }], stream, maxChars: 8000 }));
    expect(roles["plan"]).toBe("plan");
    expect(roles["write:0"]).toBe("html");
    expect(roles["write:1"]).toBe("css");
    expect(roles["write:2"]).toBe("js");
    expect(roles["explain"]).toBeUndefined();
  });

  it("mends a script that does not parse right after it is written, in a session that sees only that file", async () => {
    const seen: string[] = [];
    const stream: Session = async function* (sid, msgs) {
      const name = sid.replace(/^[^:]*:/, "");
      seen.push(name);
      const text = name === "plan" ? "Mode: build\nFile: script.js | new | logic"
        : name.startsWith("write") ? "let a = ;\nlet b = 2;\nfunction f() { return b; }" : name.startsWith("repair") ? (msgs.map(textOf).join("").includes("Errors when script.js is run") ? "let a = 1;\nlet b = 2;\nfunction f() { return b; }" : "") : "Done.";
      yield { id: sid, type: "answer", text };
      yield { id: sid, type: "done", stats };
    };
    const { result, events } = await run(stepwise({ id: "m", messages: [{ role: "user", content: "write a small script with a function" }], stream, maxChars: 8000 }));
    expect(seen.some((n) => n.startsWith("repair"))).toBe(true);
    expect(artifactsIn(result.text)[0].content).toContain("let a = 1;");
    expect(events.some((e) => e.type === "replace")).toBe(true);
  });
});

import { siteEntry, siteFileName, siteFiles } from "../src/core/site";
import { quickErrors } from "../src/core/codecheck";
import { withNavShim } from "../src/core/artifacts";

describe("launching a site", () => {
  const f = (title: string, kind: string, language: string, content: string) => ({ title, kind, language, content });
  const files = [f("index.html", "html", "html", '<link rel="stylesheet" href="style.css"><script src="script.js"></script><a href="game.html">go</a>'), f("game.html", "html", "html", "<p>game</p>"), f("style.css", "code", "css", "a{}"), f("script.js", "code", "javascript", "let a;")];
  it("writes every file under a safe name and starts from the right page", () => {
    expect(siteFiles(files).map((x) => x.name)).toEqual(["index.html", "game.html", "style.css", "script.js"]);
    expect(siteFileName(f("../../evil", "code", "python", "x"))).toBe("evil.py");
    expect(siteFileName(f("Snake Game", "html", "html", "x"))).toBe("snake-game.html");
    expect(siteEntry(files[3], files)).toBe("index.html"); // a script opens the page that loads it
    expect(siteEntry(files[1], files)).toBe("game.html");
  });
  it("tells a broken script, stylesheet and page apart at once", () => {
    expect(quickErrors(f("a.js", "code", "javascript", "let a = ;"))[0]).toMatch(/SyntaxError/);
    expect(quickErrors(f("a.css", "code", "css", "a { color: red;"))[0]).toMatch(/braces/);
    expect(quickErrors(f("a.css", "code", "css", 'a::after { content: "}"; }'))).toEqual([]);
    expect(quickErrors(f("a.html", "html", "html", '<body><script src="https://cdn.x/y.js"></script></body>'))[0]).toMatch(/network/);
  });
  it("puts the navigation shim after the CSP and before the page", () => {
    const d = withNavShim('<html><head><meta http-equiv="Content-Security-Policy" content="x"></head><body></body></html>');
    expect(d.indexOf("npuNav")).toBeGreaterThan(d.indexOf("Content-Security-Policy"));
    expect(d).toContain('<base href="https://npu.invalid/">');
  });
});

import { missingElements, wireHtml } from "../src/core/bundle";
import { STORAGE_SHIM } from "../src/core/artifacts";

describe("the three files working together", () => {
  const planned = { css: ["style.css"], js: ["script.js"] };
  it("links a stylesheet and a script the page forgot", () => {
    const out = wireHtml("<!doctype html><html><head><title>x</title></head><body><canvas id=c></canvas></body></html>", planned);
    expect(out).toContain('<link rel="stylesheet" href="style.css">');
    expect(out).toMatch(/<script src="script.js"><\/script>\s*<\/body>/);
  });
  it("renames the links that point to a name of the model's own", () => {
    const out = wireHtml('<html><head><link rel="stylesheet" href="css/styles.css"></head><body><script src="./main.js"></script></body></html>', planned);
    expect(out).toContain('href="css/style.css"');
    expect(out).toContain('src="./script.js"');
    expect(out.match(/script\.js/g)).toHaveLength(1);
  });
  it("leaves a page that is already right, or has a real script of its own, alone", () => {
    const ok = '<html><head><link rel="stylesheet" href="style.css"></head><body><script src="script.js"></script></body></html>';
    expect(wireHtml(ok, planned)).toBe(ok);
    const own = `<html><head><style>a{}</style></head><body><script>${"let x = 1;\n".repeat(40)}</script></body></html>`;
    expect(wireHtml(own, planned)).toBe(own);
  });
  it("waits for the body before running a script that was put in the head", () => {
    const files = [{ title: "script.js", kind: "code", language: "javascript", content: "document.getElementById('a').textContent='x';" }];
    const out = bundleHtml('<html><head><script src="script.js"></script></head><body><p id="a"></p></body></html>', files).html;
    expect(out.indexOf("getElementById")).toBeGreaterThan(out.indexOf('<p id="a">'));
  });
  it("names the elements a script looks for that its page does not have", () => {
    const page = '<canvas id="gameCanvas"></canvas><div class="score"></div>';
    expect(missingElements("const c = document.getElementById('game-board'); document.querySelector('.score');", [page])[0]).toMatch(/#game-board.*gameCanvas/);
    expect(missingElements("document.getElementById('gameCanvas'); document.querySelector('.score')", [page])).toEqual([]);
    expect(missingElements("const b = document.createElement('div'); b.id = 'box'; document.getElementById('box');", [page])).toEqual([]);
    expect(missingElements("document.getElementById('x')", [])).toEqual([]);
    expect(quickErrors({ title: "s.js", kind: "code", language: "javascript", content: "document.getElementById('nope')" }, [page])[0]).toMatch(/#nope/);
  });
  it("gives the preview a storage that does not throw, as the sandbox would", () => {
    expect(STORAGE_SHIM).toContain("localStorage");
    expect(withNavShim('<head><meta http-equiv="Content-Security-Policy" content="x"></head>').indexOf("localStorage")).toBeGreaterThan(0);
  });
});

describe("the summary of a build", () => {
  it("never carries a copy of the page", async () => {
    const m = fake((name) => {
      if (/:Requirements:/.test(name)) return JSON.stringify({ title: "C", language: "English", requirements: [{ text: "a count is shown" }] });
      if (/:Plan/.test(name)) return "no";
      if (name === "explain") return "I made the page.\n<!doctype html>\n<html><body>copy</body></html>";
      return "";
    });
    const { result } = await run(stepwise({ id: "c", messages: [{ role: "user", content: "make a counter app with a plus one button. The count starts at 0 and the button adds one. The count must never go above 10, whatever the number of clicks. Show the count big, in the middle of the page, with the button under it, in a clean simple style that looks like a finished small tool and not like a sketch." }], stream: m.stream, maxChars: 8000 }));
    expect(result.text).toContain("I made the page.");
    expect(result.text.split("<!doctype").length - 1).toBeLessThanOrEqual(1);
  });
});

describe("changing a program the engine made", () => {
  const PLAN2 = [
    { id: "u1", kind: "state" as const, name: "S", does: "the count", serves: ["R1"], uses: [], examples: [] },
    { id: "u2", kind: "layout" as const, name: "layout", does: "the page", serves: ["R1"], uses: [], examples: [] },
    { id: "u3", kind: "fn" as const, name: "nextCount", does: "one more, never above max", serves: ["R1"], uses: [], signature: "nextCount(count, max) -> number", examples: [{ call: "nextCount(9, 10)", expect: "10" }] },
    { id: "u4", kind: "view" as const, name: "drawCount", does: "shows the count", serves: ["R1"], uses: [], examples: [], into: "count" },
    { id: "u5", kind: "handler" as const, name: "onInc", does: "adds one", serves: ["R1"], uses: ["nextCount"], examples: [], on: "click #inc" }
  ];
  const CODE2: Record<string, string> = {
    S: '{"count": 0}',
    layout: '<div id="count"></div><button id="inc">+1</button>',
    nextCount: "function nextCount(count, max) { return Math.min(max, count + 1); }",
    drawCount: 'function drawCount(S) { document.getElementById("count").textContent = S.count; }',
    onInc: "function onInc() { S.count = nextCount(S.count, 10); }"
  };
  const make = async () => {
    const { assemblePage } = await import("../src/core/construct/assemble");
    const plan = { title: "Counter", language: "English", requirements: [{ id: "R1", text: "a button adds one" }], units: PLAN2 };
    return assemblePage(plan, new Map(Object.entries(CODE2).map(([k, v]) => [k, { code: v, verified: true, problems: [] }])), true);
  };
  const talk = (page: string, ask: string) => [
    { role: "user" as const, content: "make a counter app with a plus one button" },
    { role: "assistant" as const, content: `${file("counter.html", page)}\nDone.` },
    { role: "user" as const, content: ask }
  ];

  it("takes a remark that no word list knows as a change, and rewrites only the unit it names", async () => {
    const page = await make();
    const m = fake((name) => {
      if (/:Change:/.test(name)) return JSON.stringify({ requirements: [], rewrite: [{ name: "onInc", what: "adds two" }], units: [] });
      if (/Unit: onInc/.test(name)) return "function onInc() { S.count = nextCount(S.count + 1, 10); }";
      return name === "explain" ? "Done." : "";
    });
    const { result } = await run(stepwise({ id: "c", messages: talk(page, "when i press the button it only goes up by one") as ChatMessage[], stream: m.stream, maxChars: 8000, askRouter: async (q: string) => /make, write, build or change/.test(q) || /already exists/.test(q) }));
    const out = artifactsIn(result.text).at(-1)!.content;
    expect(out).toContain("nextCount(S.count + 1, 10)");
    expect(out).toContain("function drawCount"); // the other units are untouched
    expect(out).toContain('id="inc"');
    const calls = m.seen.map((x) => x.sid.replace(/^c:/, ""));
    expect(calls.some((c) => /Change/.test(c))).toBe(true);
    expect(calls.some((c) => /Unit: drawCount|Unit: S|Unit: layout/.test(c))).toBe(false);
  });

  it("adds a unit the change needs", async () => {
    const page = await make();
    const m = fake((name) => {
      if (/:Change:/.test(name)) return JSON.stringify({ requirements: [{ text: "A reset button sets the count to 0" }], rewrite: [{ name: "layout", what: "add a reset button with the id reset" }], units: [{ kind: "handler", name: "onReset", does: "sets the count to 0", serves: [], on: "click #reset" }] });
      if (/Unit: layout/.test(name)) return '<div id="count"></div><button id="inc">+1</button><button id="reset">reset</button>';
      if (/Unit: onReset/.test(name)) return "function onReset() { S.count = 0; }";
      return name === "explain" ? "Done." : "";
    });
    const { result } = await run(stepwise({ id: "c", messages: talk(page, "add a reset button") as ChatMessage[], stream: m.stream, maxChars: 8000 }));
    const out = artifactsIn(result.text).at(-1)!.content;
    expect(out).toContain("function onReset");
    expect(out).toContain('id="reset"');
    expect(out).toContain("function onInc");
  });
});

describe("a very short request for a program", () => {
  it("is a build, not a chat that delegates to a sub-agent", () => {
    expect(directPlan("make tetris", [])?.mode).toBe("build");
    expect(directPlan("fais un snake", [])?.mode).toBe("build");
    expect(directPlan("hello", [])).toBeNull();
    expect(directPlan("tetris?", [])).toBeNull();
  });
  it("hands sub-agent results back without letting the model copy them", async () => {
    const { resultsMessage } = await import("../src/core/agents");
    expect(resultsMessage([{ name: "a", task: "t", output: "code" }])).toMatch(/do NOT write it out again/);
  });
});

describe("what the person wants is asked of a model, not read from the length or the words", () => {
  const say = (yes: RegExp[]) => async (q: string) => yes.some((r) => r.test(q));
  it("starts a build for a request of any length when the model says it asks for a program", async () => {
    const m = fake((name) => (/:Requirements:/.test(name) ? JSON.stringify({ title: "T", language: "English", requirements: [{ text: "a board is shown" }] }) : name === "explain" ? "Done." : ""));
    const { result } = await run(stepwise({ id: "c", messages: [{ role: "user", content: "tetris" }], stream: m.stream, maxChars: 8000, askRouter: say([/make, write, build or change/]) }));
    expect(result.handled).toBe(true);
    expect(artifactsIn(result.text).length).toBe(1);
  });
  it("leaves a message to the chat when the model says it asks for nothing to be made, whatever its words", async () => {
    const m = fake(() => "");
    const { result } = await run(stepwise({ id: "c", messages: [{ role: "user", content: "make me laugh with a joke about builders and games and pages" }], stream: m.stream, maxChars: 8000, askRouter: say([]) }));
    expect(result.handled).toBe(false);
    expect(m.seen).toHaveLength(0);
  });
  it("asks the chat model itself when the router is not there", async () => {
    const asked: string[] = [];
    const stream: Session = async function* (sid, msgs) {
      if (/:x:ask$/.test(sid)) { asked.push(String(msgs[1].content)); yield { id: sid, type: "answer", text: "no" }; yield { id: sid, type: "done", stats }; return; }
      throw new Error("nothing else should run");
    };
    const { result } = await run(stepwise({ id: "c", messages: [{ role: "user", content: "hi" }], stream, maxChars: 8000 }));
    expect(result.handled).toBe(false);
    expect(asked).toHaveLength(1);
  });
});
