import { describe, expect, it } from "vitest";
import { cleanSpec, directPlan, guessFile, looksLikeChange, lostSurface, needsTools, parsePlan, skeletonFile, stepwise, Session } from "../src/core/build";
import { artifactsIn } from "../src/core/artifacts";
import { PROBE_PRELUDE, inertControls, lostEffects, probeInputs, quickErrors } from "../src/core/codecheck";
import { Script } from "vm";
import { stageEffort } from "../src/core/effort";
import { SKELETONS, skeletonFor } from "../src/core/skeletons";
import type { ChatEvent, ChatMessage } from "../src/shared/types";

const stats = { ttftSec: 0.1, tokPerSec: 10, tokens: 5, totalSec: 0.5 };
const textOf = (m: ChatMessage) => (typeof m.content === "string" ? m.content : "");
const run = async (g: AsyncGenerator<ChatEvent, any>) => { const events: ChatEvent[] = []; let r = await g.next(); while (!r.done) { events.push(r.value); r = await g.next(); } return { events, result: r.value }; };
const lastBuild = (events: ChatEvent[]) => (events.filter((e) => e.type === "build").at(-1) as Extract<ChatEvent, { type: "build" }>).build;

function fake(reply: (name: string, msgs: ChatMessage[]) => string) {
  const seen: { sid: string; msgs: ChatMessage[] }[] = [];
  const stream: Session = async function* (sid, msgs) {
    seen.push({ sid, msgs });
    const text = reply(sid.replace(/^[^:]*:/, ""), msgs);
    yield { id: sid, type: "answer", text };
    yield { id: sid, type: "done", stats };
  };
  return { stream, seen };
}

describe("starting points", () => {
  it("every one is a page that parses, finds its own elements and uses no network", () => {
    for (const s of SKELETONS) {
      expect(quickErrors({ title: `${s.id}.html`, kind: "html", language: "html", content: s.html }), s.id).toEqual([]);
      expect(s.html, s.id).not.toMatch(/https?:\/\//);
      expect(s.html.length, s.id).toBeLessThan(5000);
    }
  });
  it("is picked by the first program the request names", () => {
    expect(skeletonFor("make a snake game")?.id).toBe("snake");
    expect(skeletonFor("fais-moi un morpion")?.id).toBe("tictactoe");
    expect(skeletonFor("une calculatrice")?.id).toBe("calculator");
    expect(skeletonFor("a to-do list with a snake theme")?.id).toBe("todo");
    expect(skeletonFor("un chronomètre")?.id).toBe("stopwatch");
    expect(skeletonFor("a quiz about space")?.id).toBe("quiz");
    expect(skeletonFor("a page about cats")).toBeNull();
  });
});

describe("the stages of a build", () => {
  it("a plain snake request starts from the tested program and says so, with no rules session", async () => {
    const m = fake((name) => (name.startsWith("write") ? SKELETONS[0].html : name === "explain" ? "I made the game." : ""));
    const { events, result } = await run(stepwise({ id: "s", messages: [{ role: "user", content: "make a snake game" }], stream: m.stream, maxChars: 20000 }));
    expect(m.seen.some((s) => s.sid.endsWith(":spec:0"))).toBe(false);
    expect(textOf(m.seen.find((s) => s.sid === "s:write:0")!.msgs[1])).toContain('id="board"');
    const stages = lastBuild(events).steps[0].stages!;
    expect(stages.map((g) => g.id)).toEqual(["skeleton", "write", "check"]);
    expect(stages.every((g) => g.status === "done")).toBe(true);
    expect(artifactsIn(result.text)[0].content).toContain("function step()");
  });

  it("a program with no starting point gets its rules first, shown and given to the writer", async () => {
    const page = "<!doctype html><html><body><canvas id=\"c\"></canvas><script>document.getElementById('c');</script></body></html>";
    const m = fake((name) => (name.startsWith("spec") ? "- the board is 10 by 10\n- arrow keys move the paddle\n2. the ball bounces off the walls" : name.startsWith("write") ? page : name === "explain" ? "Done." : ""));
    const { events } = await run(stepwise({ id: "p", messages: [{ role: "user", content: "make a pong game with a bouncing ball" }], stream: m.stream, maxChars: 20000 }));
    const b = lastBuild(events);
    expect(b.spec).toMatch(/board is 10 by 10[\s\S]*bounces/);
    expect(b.steps[0].stages!.map((g) => g.id)).toEqual(["spec", "write", "check"]);
    expect(textOf(m.seen.find((s) => s.sid === "p:write:0")!.msgs[1])).toContain("the board is 10 by 10");
  });

  it("runs the page, mends what it shows, runs it again, and says each of those steps", async () => {
    const good = SKELETONS[0].html;
    const slow = good.replace("var SPEED = 120", "var SPEED = 120").replace("timer = setInterval(step, SPEED);", "timer = null;");
    let checks = 0;
    const m = fake((name) => (name.startsWith("write") ? slow : name.startsWith("fix") ? good : name === "explain" ? "Done." : ""));
    const check = async () => (++checks === 1 ? { errors: [], notes: ["The canvas never changed after load: nothing moves or reacts."], shot: "data:image/jpeg;base64,AAAA" } : { errors: [], notes: [] });
    const { events, result } = await run(stepwise({ id: "v", messages: [{ role: "user", content: "make a snake game" }], stream: m.stream, maxChars: 20000, check }));
    const b = lastBuild(events);
    expect(b.verify!.map((g) => `${g.id}:${g.status}`)).toEqual(["run:error", "fix:done", "run:done", "explain:done"]);
    expect(b.verify![0].shot).toBeTruthy();
    expect(m.seen.some((s) => s.sid === "v:fix:0")).toBe(true);
    expect(artifactsIn(result.text)[0].content).toContain("timer = setInterval(step, SPEED);");
    expect(b.status).toBe("done");
  });

  it("goes back to the earlier file when a fix makes the page worse, and does not loop", async () => {
    const good = SKELETONS[0].html;
    const m = fake((name) => (name.startsWith("write") ? good : name.startsWith("fix") ? good.replace("var CELLS = 20;", "var CELLS = 21;") : name === "explain" ? "Done." : ""));
    let n = 0;
    const check = async () => ({ errors: n++ === 0 ? ["ReferenceError: x is not defined (line 3)"] : ["ReferenceError: x is not defined (line 3)", "TypeError: y is not a function (line 9)"], notes: [] });
    const { events, result } = await run(stepwise({ id: "w", messages: [{ role: "user", content: "make a snake game" }], stream: m.stream, maxChars: 20000, check }));
    const b = lastBuild(events);
    expect(b.verify!.filter((g) => g.id === "fix")).toHaveLength(1);
    expect(b.verify!.find((g) => g.id === "fix")!.note).toMatch(/undone/);
    expect(artifactsIn(result.text)[0].content).toContain("var CELLS = 20;");
  });

  it("skips the test run when nothing can run the page", async () => {
    const m = fake((name) => (name.startsWith("write") ? SKELETONS[0].html : name === "explain" ? "Done." : ""));
    const { events } = await run(stepwise({ id: "n", messages: [{ role: "user", content: "make a snake game" }], stream: m.stream, maxChars: 20000 }));
    expect(lastBuild(events).verify!.map((g) => g.id)).toEqual(["explain"]);
  });

  it("an edit shows its own stage", async () => {
    const page = "<artifact type=\"html\" title=\"index.html\">\n<!doctype html><html><body><h1>Hi</h1></body></html>\n</artifact>";
    const h: ChatMessage[] = [{ role: "user", content: "a page" }, { role: "assistant", content: page }, { role: "user", content: "make the title say Hello" }];
    const m = fake((name) => (name === "plan" ? "Mode: build\nFile: index.html | edit | title says Hello" : name.startsWith("redo") ? "<!doctype html><html><body><h1>Hello</h1></body></html>" : name === "explain" ? "Done." : ""));
    const { events } = await run(stepwise({ id: "e", messages: h, stream: m.stream, maxChars: 8000 }));
    const stages = lastBuild(events).steps[0].stages!;
    expect(stages.map((g) => `${g.id}:${g.status}`)).toEqual(["edit:done"]);
  });
});

describe("when the user names the files", () => {
  it("\"html css and js\" stays three files, a plain request stays one page", () => {
    expect(directPlan("make a snake game with html css and js", [])).toBeNull();
    expect(directPlan("fais un snake en fichiers séparés", [])).toBeNull();
    expect(directPlan("make a snake game", [])).not.toBeNull();
    const three = "Mode: build\nFile: index.html | new | page\nFile: style.css | new | look\nFile: script.js | new | logic";
    expect(parsePlan(three, [], "make a snake game with html css and js").files).toHaveLength(3);
    expect(parsePlan("", [], "make a snake game with html css and js").files.map((f) => f.name)).toEqual(["index.html", "style.css", "script.js"]);
  });
  it("splits a starting point between the files of the plan", () => {
    const plan = [{ name: "index.html", action: "new" as const, job: "" }, { name: "style.css", action: "new" as const, job: "" }, { name: "script.js", action: "new" as const, job: "" }];
    const page = skeletonFile(SKELETONS[0], plan[0], plan)!.html;
    expect(page).toContain('<link rel="stylesheet" href="style.css">');
    expect(page).toContain('<script src="script.js"></script>');
    expect(page).not.toContain("function step()");
    expect(skeletonFile(SKELETONS[0], plan[1], plan)!.html).toMatch(/^body \{/);
    expect(skeletonFile(SKELETONS[0], plan[2], plan)!.html).toMatch(/^var CELLS = 20;[\s\S]*function step\(\)/);
    expect(skeletonFile(SKELETONS[0], plan[0], [...plan, { name: "data.json", action: "new", job: "" }])).toBeNull();
  });
  it("each of the three files starts from its part of the tested program", async () => {
    const m = fake((name) => (name === "plan" ? "Mode: build\nFile: index.html | new | page\nFile: style.css | new | look\nFile: script.js | new | logic" : name === "explain" ? "Done." : ""));
    await run(stepwise({ id: "t", messages: [{ role: "user", content: "make a snake game with html css and js" }], stream: m.stream, maxChars: 20000 }));
    expect(textOf(m.seen.find((s) => s.sid === "t:write:2")!.msgs[1])).toContain("function step()");
    expect(textOf(m.seen.find((s) => s.sid === "t:write:1")!.msgs[1])).toContain("#board");
    expect(textOf(m.seen.find((s) => s.sid === "t:write:0")!.msgs[1])).toContain('href="style.css"');
  });
});

describe("changing a page that exists", () => {
  const code = Array.from({ length: 60 }, (_, i) => `function f${i}() { return ${i}; }`).join("\n");
  const page = `<artifact type="code" language="javascript" title="script.js">\n${code}\n</artifact>`;
  const history: ChatMessage[] = [{ role: "user", content: "a script" }, { role: "assistant", content: page }, { role: "user", content: "make f7 return 70" }];
  const plan = "Mode: build\nFile: script.js | edit | f7 returns 70";

  it("uses edit blocks first for a file of some length: a few lines, not the whole file again", async () => {
    const m = fake((name) => (name === "plan" ? plan : name.startsWith("edit") ? '<edit file="script.js">\n<<<<<<< SEARCH\nfunction f7() { return 7; }\n=======\nfunction f7() { return 70; }\n>>>>>>> REPLACE\n</edit>' : name === "explain" ? "Done." : ""));
    const { result } = await run(stepwise({ id: "q", messages: history, stream: m.stream, maxChars: 20000 }));
    expect(m.seen.some((s) => s.sid.includes(":redo:"))).toBe(false);
    expect(artifactsIn(result.text)[0].content).toContain("function f7() { return 70; }");
    expect(artifactsIn(result.text)[0].content).toContain("function f59()");
  });

  it("rewrites the file instead when the edit would break it", async () => {
    const m = fake((name) => (name === "plan" ? plan
      : name.startsWith("edit") ? '<edit file="script.js">\n<<<<<<< SEARCH\nfunction f7() { return 7; }\n=======\nfunction f7() { return ; ;\n>>>>>>> REPLACE\n</edit>'
        : name.startsWith("redo") ? code.replace("return 7;", "return 70;") : name === "explain" ? "Done." : ""));
    const { result } = await run(stepwise({ id: "b", messages: history, stream: m.stream, maxChars: 20000 }));
    expect(m.seen.some((s) => s.sid.includes(":redo:"))).toBe(true);
    expect(artifactsIn(result.text)[0].content).toContain("function f7() { return 70; }");
  });
});

describe("what worked before a change", () => {
  const filler = Array.from({ length: 50 }, (_, i) => `function f${i}() { return ${i}; }`).join("\n");
  const listener = 'document.addEventListener("keydown", function (e) { if (e.key === "ArrowUp") { turn(-1); } });';
  const code = `function turn(d) { return d; }\nfunction step() { return 1; }\n${filler}\n${listener}\n`;
  const file = { title: "script.js", kind: "code", language: "javascript", content: code };

  it("sees the controls, functions and keys a change took away, unless the request names them", () => {
    const broken = { ...file, content: code.replace(listener, "").replace("function step() { return 1; }", "") };
    const lost = lostSurface(file, broken, "make the walls wrap").names;
    expect(lost).toEqual(expect.arrayContaining(['the "keydown" listener', "the ArrowUp key", "step"]));
    expect(lostSurface(file, broken, "remove the step function and the keydown listener").names).toEqual(["the ArrowUp key"]);
    expect(lostSurface(file, { ...file, content: code.replace("return 1", "return 2") }, "x").names).toEqual([]);
  });

  const history: ChatMessage[] = [{ role: "user", content: "a script" }, { role: "assistant", content: `<artifact type="code" language="javascript" title="script.js">\n${code}</artifact>` }, { role: "user", content: "make step return 2" }];
  const plan = "Mode: build\nFile: script.js | edit | step returns 2";
  const dropsListener = `<edit file="script.js">\n<<<<<<< SEARCH\n${listener}\n=======\n// controls\n>>>>>>> REPLACE\n</edit>\n<edit file="script.js">\n<<<<<<< SEARCH\nfunction step() { return 1; }\n=======\nfunction step() { return 2; }\n>>>>>>> REPLACE\n</edit>`;

  it("puts them back, once, and shows that stage", async () => {
    const m = fake((name) => (name === "plan" ? plan : name.startsWith("edit") ? dropsListener : name.startsWith("fix:keep") ? code.replace("return 1", "return 2") : name === "explain" ? "Done." : ""));
    const { events, result } = await run(stepwise({ id: "k", messages: history, stream: m.stream, maxChars: 20000 }));
    const stages = lastBuild(events).steps[0].stages!;
    expect(stages.map((g) => g.id)).toEqual(["edit", "fix"]);
    expect(stages.find((g) => g.label === "Keep what worked")!.status).toBe("done");
    expect(artifactsIn(result.text)[0].content).toContain(listener);
    expect(artifactsIn(result.text)[0].content).toContain("return 2");
  });

  it("keeps the change but says so when it cannot be put back", async () => {
    const m = fake((name) => (name === "plan" ? plan : name.startsWith("edit") ? dropsListener : name === "explain" ? "Done." : ""));
    const { events } = await run(stepwise({ id: "j", messages: history, stream: m.stream, maxChars: 20000 }));
    expect(lastBuild(events).steps[0].stages!.find((g) => g.label === "Keep what worked")!.status).toBe("error");
    expect(textOf(m.seen.find((s) => s.sid === "j:explain")!.msgs.at(-1)!)).toMatch(/CAREFUL[\s\S]*keydown/);
  });
});

describe("judging a page by what its controls do", () => {
  const plan = { kb: true, texts: 0, clicks: ["click:#restart", "click:Lap#1"] };
  it("tries the key groups when the page listens to the keyboard, and each button", () => {
    expect(probeInputs(plan)).toEqual(["keys:arrows", "keys:action", "keys:other", "click:0", "click:1"]);
    expect(probeInputs({ kb: false, texts: 1, clicks: [] })).toEqual([]);
    expect(() => new Script(PROBE_PRELUDE)).not.toThrow();
  });
  it("calls the controls dead only when none of the keys, or none of the buttons, change anything", () => {
    expect(inertControls(plan, { "keys:arrows": false, "keys:action": false, "keys:other": false, "click:0": true, "click:1": false })).toHaveLength(1);
    expect(inertControls(plan, { "keys:arrows": true, "keys:action": false, "keys:other": false, "click:0": false, "click:1": false })).toHaveLength(1);
    expect(inertControls(plan, { "keys:arrows": true, "keys:action": false, "keys:other": false, "click:0": true, "click:1": false })).toEqual([]);
  });
  it("sees a control that worked before a change and does not any more, unless the request took it away", () => {
    const before = { plan, effects: { "keys:arrows": true, "keys:action": false, "keys:other": false, "click:0": true, "click:1": false } };
    const dead = { plan, effects: { "keys:arrows": false, "keys:action": false, "keys:other": false, "click:0": true, "click:1": false } };
    expect(lostEffects(before, dead, "make the walls wrap")).toEqual([expect.stringMatching(/arrow keys used to change the page/)]);
    expect(lostEffects(before, { plan: { kb: false, texts: 0, clicks: plan.clicks }, effects: { "click:0": true, "click:1": false } }, "x")).toEqual([expect.stringMatching(/no longer listens to the keyboard/)]);
    expect(lostEffects(before, dead, "remove the keyboard controls")).toEqual([]);
    expect(lostEffects(before, before, "x")).toEqual([]);
    expect(lostEffects(undefined, dead, "x")).toEqual([]);
  });

  const code = Array.from({ length: 50 }, (_, i) => `function f${i}() { return ${i}; }`).join("\n");
  const html = `<!doctype html><html><body><canvas id="c"></canvas><script>${code}\ndocument.addEventListener("keydown", function (e) { f1(); });</script></body></html>`;
  const history: ChatMessage[] = [{ role: "user", content: "a page" }, { role: "assistant", content: `<artifact type="html" title="index.html">\n${html}\n</artifact>` }, { role: "user", content: "make f2 return 5" }];
  const withKeys = { plan, effects: { "keys:arrows": true } };
  const without = { plan, effects: { "keys:arrows": false } };

  it("tries the page before the change, compares after it, and mends a control the change broke", async () => {
    const m = fake((name) => (name === "plan" ? "Mode: build\nFile: index.html | edit | f2 returns 5"
      : name.startsWith("edit") ? '<edit file="index.html">\n<<<<<<< SEARCH\nfunction f2() { return 2; }\n=======\nfunction f2() { return 5; }\n>>>>>>> REPLACE\n</edit>'
        : name.startsWith("fix") ? html.replace("return 2;", "return 5;").replace("</body>", "<!-- keyboard handling restored --></body>") : name === "explain" ? "Done." : ""));
    const seen: string[] = [];
    let n = 0;
    const check = async () => { n++; seen.push(String(n)); return { errors: [], notes: [], probe: n === 1 ? withKeys : n === 2 ? without : withKeys }; };
    const { events } = await run(stepwise({ id: "r", messages: history, stream: m.stream, maxChars: 20000, check }));
    const b = lastBuild(events);
    expect(b.verify!.map((g) => `${g.id}:${g.status}`)).toEqual(["baseline:done", "run:error", "fix:done", "run:done", "explain:done"]);
    expect(b.verify![1].note).toMatch(/arrow keys used to change the page/);
    const fix = m.seen.find((s) => s.sid === "r:fix:0")!;
    expect(textOf(fix.msgs[1])).toMatch(/Regression:[\s\S]*the change that was made/i);
    expect(textOf(fix.msgs[1])).toContain("return 5");
  });

  it("does not compare with a page that could not be tried", async () => {
    const m = fake((name) => (name === "plan" ? "Mode: build\nFile: index.html | edit | f2 returns 5" : name.startsWith("redo") ? html.replace("return 2;", "return 5;") : name.startsWith("edit") ? '<edit file="index.html">\n<<<<<<< SEARCH\nfunction f2() { return 2; }\n=======\nfunction f2() { return 5; }\n>>>>>>> REPLACE\n</edit>' : name === "explain" ? "Done." : ""));
    const check = async () => ({ errors: [], notes: [] });
    const { events } = await run(stepwise({ id: "u", messages: history, stream: m.stream, maxChars: 20000, check }));
    expect(lastBuild(events).verify!.map((g) => `${g.id}:${g.status}`)).toEqual(["baseline:skipped", "run:done", "explain:done"]);
  });
});

describe("mending a page", () => {
  const body = Array.from({ length: 40 }, (_, i) => `function f${i}() { return ${i}; }`).join("\n");
  const page = (x: string) => `<!doctype html>\n<html><body><canvas id="c"></canvas>\n<script>\n${body}\n${x}\n</script></body></html>`;
  it("fixes with a few edit lines first, names the file on the stage, and rewrites nothing", async () => {
    const broken = page("const t = map.get(0)[0];");
    const m = fake((name) => (name.startsWith("write") ? broken
      : name === "fix:0" ? '<edit file="index.html">\n<<<<<<< SEARCH\nconst t = map.get(0)[0];\n=======\nconst t = (map.get(0) || [])[0];\n>>>>>>> REPLACE\n</edit>'
        : name === "explain" ? "Done." : ""));
    let n = 0;
    const check = async () => (n++ === 0 ? { errors: ["TypeError: Cannot read properties of undefined (reading '0') (line 44: const t = map.get(0)[0];)"], notes: [] } : { errors: [], notes: [] });
    const { events, result } = await run(stepwise({ id: "m", messages: [{ role: "user", content: "make a pacman game" }], stream: m.stream, maxChars: 20000, check }));
    expect(m.seen.some((s) => s.sid.endsWith(":rewrite"))).toBe(false);
    expect(artifactsIn(result.text)[0].content).toContain("(map.get(0) || [])[0]");
    const fix = lastBuild(events).verify!.find((g) => g.id === "fix")!;
    expect(fix.file).toBe("index.html");
    expect(fix.status).toBe("done");
    const excerpt = textOf(m.seen.find((s) => s.sid === "m:fix:0")!.msgs[1]);
    expect(excerpt).toContain("const t = map.get(0)[0];");
    expect(excerpt).toContain("TypeError");
  });
  it("tells, while a session works, what it is doing", async () => {
    const stream: Session = async function* (sid) {
      const name = sid.replace(/^[^:]*:/, "");
      if (name.startsWith("write")) { yield { id: sid, type: "answer", text: page("let a = ;") }; }
      else if (name === "repair:0:0") { yield { id: sid, type: "thinking", text: "hmm" }; await new Promise((r) => setTimeout(r, 1100)); yield { id: sid, type: "thinking", text: "ok" }; yield { id: sid, type: "answer", text: "no edit here" }; }
      else yield { id: sid, type: "answer", text: name === "explain" ? "Done." : page("let a = 1;") };
      yield { id: sid, type: "done", stats };
    };
    const { events } = await run(stepwise({ id: "h", messages: [{ role: "user", content: "make a pacman game" }], stream, maxChars: 20000 }));
    const notes = events.filter((e) => e.type === "build").flatMap((e) => (e as Extract<ChatEvent, { type: "build" }>).build.steps.flatMap((s) => s.stages ?? [])).map((g) => g.note ?? "");
    expect(notes.some((n) => /thinking, \d+s/.test(n))).toBe(true);
    expect(notes.some((n) => /rewriting the whole file/.test(n))).toBe(true);
  });
});

describe("a file longer than the window", () => {
  it("says on the stage that the session carries on by itself", async () => {
    const stream: Session = async function* (sid) {
      const name = sid.replace(/^[^:]*:/, "");
      if (name.startsWith("write")) {
        yield { id: sid, type: "answer", text: "<!doctype html><html><body>" };
        yield { id: sid, type: "notice", text: "The answer hit the limit and was continued (1)." };
        yield { id: sid, type: "answer", text: "<p>end</p></body></html>" };
      } else yield { id: sid, type: "answer", text: name === "explain" ? "Done." : "" };
      yield { id: sid, type: "done", stats };
    };
    const { events } = await run(stepwise({ id: "l", messages: [{ role: "user", content: "make a quiz game" }], stream, maxChars: 20000 }));
    const notes = events.filter((e) => e.type === "build").flatMap((e) => (e as Extract<ChatEvent, { type: "build" }>).build.steps.flatMap((s) => s.stages ?? [])).map((g) => g.note ?? "");
    expect(notes.some((n) => /carries on by itself \(1\)/.test(n))).toBe(true);
  });
});

describe("an explanation that has to be seen", () => {
  it("a chart or a diagram is drawn in the chat; only a simulation or an animation is a page to build", () => {
    expect(directPlan("explique moi les interets cumuler avec un diagram interactif", [])).toBeNull();
    expect(directPlan("montre-moi un graphique de l'inflation", [])).toBeNull();
    expect(directPlan("explique la gravité avec une simulation interactive", [])?.files[0].name).toBe("index.html");
    expect(directPlan("montre-moi une animation du cycle de l'eau", [])?.files[0].name).toBe("index.html");
    expect(directPlan("explique moi les intérêts composés", [])).toBeNull();
    expect(directPlan("what is a simulation?", [])).toBeNull();
  });
  it("a chat with no file keeps its way to make an artifact, and such a request reaches the chat answer", async () => {
    const m = fake((name) => (name.startsWith("plan") ? "Mode: answer" : ""));
    const r = await run(stepwise({ id: "j", messages: [{ role: "system", content: "Be kind. You can create artifacts." }, { role: "user", content: "write me a short story about a cat" }], stream: m.stream, maxChars: 8000 }));
    expect(r.result.handled).toBe(false);
    expect(textOf((r.result.messages as ChatMessage[])[0])).not.toMatch(/do not write <edit> blocks/);
    const c = fake(() => "");
    const r2 = await run(stepwise({ id: "k", messages: [{ role: "user", content: "explique moi les interets cumuler avec un diagram interactif" }], stream: c.stream, maxChars: 8000 }));
    expect(r2.result.handled).toBe(false);
    expect(c.seen).toHaveLength(0); // not even planned: the chat answers, with the chart block
  });
});

describe("a request to change what exists", () => {
  const html = '<artifact type="html" title="index.html">\n<!doctype html><html><body><h1>Hi</h1></body></html>\n</artifact>';
  const history: ChatMessage[] = [{ role: "user", content: "a page" }, { role: "assistant", content: html }, { role: "user", content: "make the title bigger" }];

  it("tells an order from a question", () => {
    expect(looksLikeChange("make the snake faster")).toBe(true);
    expect(looksLikeChange("ajoute un bouton pause")).toBe(true);
    expect(looksLikeChange("how do I make the snake faster?")).toBe(false);
    expect(looksLikeChange("what does the loop do")).toBe(false);
    // a report that something does not work is a request to fix it
    expect(looksLikeChange("the game doesnt work, I click start game and nothing happens")).toBe(true);
    expect(looksLikeChange("le bouton ne marche pas")).toBe(true);
    expect(looksLikeChange("there is no start button, it is invisible")).toBe(true);
    expect(looksLikeChange("why doesn't the button work?")).toBe(false);
    expect(guessFile(["index.html", "style.css", "script.js"], "change the background colour")).toBe("style.css");
    expect(guessFile(["index.html", "style.css", "script.js"], "make it faster")).toBe("script.js");
    expect(guessFile(["index.html"], "make it faster")).toBe("index.html");
  });

  it("a change to a project that is one file needs no planner at all: the edit starts at once", async () => {
    const m = fake((name) => (name.startsWith("redo") ? "<!doctype html><html><body><h1 style=\"font-size:3em\">Hi</h1></body></html>" : name === "explain" ? "Done." : ""));
    const { result } = await run(stepwise({ id: "c", messages: history, stream: m.stream, maxChars: 8000 }));
    expect(result.handled).toBe(true);
    expect(m.seen.some((s) => s.sid.includes(":plan"))).toBe(false);
    expect(artifactsIn(result.text)[0].content).toContain("font-size:3em");
  });

  it("with several files the planner is asked, and a plan that says 'question' for an order is asked again, then built", async () => {
    const two: ChatMessage[] = [{ role: "user", content: "a page" }, { role: "assistant", content: `${html}\n<artifact type="code" language="css" title="style.css">\nh1 { color: blue; }\n</artifact>` }, { role: "user", content: "make the title bigger" }];
    const m = fake((name) => (name.startsWith("plan") ? "Mode: answer" : name.startsWith("redo") ? "h1 { color: blue; font-size: 3em; }" : name === "explain" ? "Done." : ""));
    const { result } = await run(stepwise({ id: "c2", messages: two, stream: m.stream, maxChars: 8000 }));
    expect(result.handled).toBe(true);
    expect(m.seen.some((s) => s.sid === "c2:plan:again")).toBe(true);
  });

  it("a bug report is built even though it has no verb of change", async () => {
    const m = fake((name) => (name.startsWith("plan") ? "Mode: answer" : name.startsWith("redo") ? "<!doctype html><html><body><button id=\"start\">Start</button></body></html>" : name === "explain" ? "Done." : ""));
    const h: ChatMessage[] = [...history.slice(0, 2), { role: "user", content: "the game doesnt work, I click start game and nothing happens" }];
    const { result } = await run(stepwise({ id: "bug", messages: h, stream: m.stream, maxChars: 8000 }));
    expect(result.handled).toBe(true);
    expect(artifactsIn(result.text)[0].content).toContain('id="start"');
  });

  it("a question about code always comes with the code, never 'I do not have access to it'", async () => {
    const m = fake((name) => (name.startsWith("plan") ? "Mode: answer" : ""));
    const q: ChatMessage[] = [...history.slice(0, 2), { role: "user", content: "why doesn't the title show up bigger?" }];
    const { result } = await run(stepwise({ id: "ask", messages: q, stream: m.stream, maxChars: 8000 }));
    expect(result.handled).toBe(false);
    const last = (result.messages as ChatMessage[]).filter((x) => x.role === "user").at(-1)!;
    expect(textOf(last)).toContain("<h1>Hi</h1>");
  });

  it("answers in words, with no way to write edit blocks, when it really is a question", async () => {
    const m = fake((name) => (name.startsWith("plan") ? "Mode: answer" : ""));
    const q: ChatMessage[] = [...history.slice(0, 2), { role: "user", content: "why is the title that size?" }];
    const { result } = await run(stepwise({ id: "d", messages: [{ role: "system", content: "Be kind." }, ...q], stream: m.stream, maxChars: 8000 }));
    expect(result.handled).toBe(false);
    expect(textOf((result.messages as ChatMessage[])[0])).toMatch(/do not write <edit> blocks/);
    expect(m.seen.some((s) => s.sid === "d:plan:again")).toBe(false);
  });
});

describe("the agents behind the stages", () => {
  it("names the helper of each stage and the model it runs on; the tester has no model", async () => {
    const m = fake((name) => (name === "plan" ? "Mode: build\nFile: index.html | new | a quiz page" : name.startsWith("write") ? SKELETONS[5].html : name === "explain" ? "Done." : ""));
    const check = async () => ({ errors: [], notes: [] });
    const { events } = await run(stepwise({ id: "g", messages: [{ role: "user", content: "build me a landing page with a quiz about space" }], stream: m.stream, maxChars: 20000, check, modelOf: (role) => (role === "plan" ? "Planner-4B" : role === "html" ? "Coder-7B" : "Chat-4B") }));
    const b = lastBuild(events);
    expect(b.start![0]).toMatchObject({ id: "plan", agent: "Planner", model: "Planner-4B", status: "done" });
    const write = b.steps[0].stages!.find((g) => g.id === "write")!;
    expect(write).toMatchObject({ agent: "Writer", model: "Coder-7B" });
    const run1 = b.verify!.find((g) => g.id === "run")!;
    expect(run1.agent).toBe("Tester");
    expect(run1.model).toBeUndefined();
    expect(b.verify!.find((g) => g.id === "explain")).toMatchObject({ agent: "Narrator", model: "Chat-4B" });
    // the planner is announced the moment it starts, before any file exists
    const first = events.find((e) => e.type === "build") as Extract<ChatEvent, { type: "build" }>;
    expect(first.build.steps).toEqual([]);
    expect(first.build.start![0]).toMatchObject({ agent: "Planner", status: "running" });
  });
});

describe("small pieces", () => {
  it("cleans the rules a model wrote", () => {
    expect(cleanSpec("```\n- a\n- The grid is 20 by 20\n2) Space restarts the game\n```")).toBe("- The grid is 20 by 20\n- Space restarts the game");
    expect(cleanSpec("")).toBe("");
  });
  it("lets a model think when it mends a file and not when it writes one", () => {
    expect(stageEffort("c:repair:0:1", 40)).toBe("medium");
    expect(stageEffort("c:fix:0", 25)).toBe("medium");
    expect(stageEffort("c:fix:0", 9)).toBe("low"); // too slow: minutes of thinking
    expect(stageEffort("c:fix:0")).toBe("low");
    expect(stageEffort("c:write:0", 60)).toBe("low");
    expect(stageEffort("c:plan", 60)).toBe("low");
  });
});


describe("no planner call for what words can decide", () => {
  const planned = async (request: string, files = false) => {
    const m = fake((name) => (name.startsWith("plan") ? "Mode: answer" : ""));
    const msgs: ChatMessage[] = files ? [{ role: "user", content: "a page" }, { role: "assistant", content: '<artifact type="html" title="index.html">\n<h1>Hi</h1>\n</artifact>' }, { role: "user", content: request }] : [{ role: "user", content: request }];
    await run(stepwise({ id: "n", messages: msgs, stream: m.stream, maxChars: 8000 }));
    return m.seen.some((s) => s.sid.includes(":plan"));
  };
  it("not for a text: a book, an essay, a poem, a mail", async () => {
    expect(await planned("write a 20page book on relativity")).toBe(false);
    expect(await planned("write a poem 5000 words minimum")).toBe(false);
    expect(await planned("rédige un mail pour demander un devis")).toBe(false);
    expect(await planned("write an essay about the page rank algorithm")).toBe(false);
  });
  it("yes for something a computer runs that is not a plain one-file request", async () => {
    expect(await planned("make a landing page for my pottery shop with several sections")).toBe(true);
    expect(await planned("write a python script and a README for my backup tool")).toBe(true);
  });
  it("not for a question about files that exist, nor for a change to one file", async () => {
    expect(await planned("why is the title that size?", true)).toBe(false);
    expect(await planned("thanks!", true)).toBe(false);
    expect(await planned("make the title red", true)).toBe(false);
  });
  it("the rules about files and charts are sent when the message needs them, not for hello", () => {
    expect(needsTools("hi", false)).toBe(false);
    expect(needsTools("write a poem about the sea", false)).toBe(false);
    expect(needsTools("write a 20page book on relativity", false)).toBe(true); // a document may be an artifact
    expect(needsTools("make a snake game", false)).toBe(true);
    expect(needsTools("explique les intérêts avec un graphique", false)).toBe(true);
    expect(needsTools("thanks", true)).toBe(true); // a chat with files keeps them
  });
});
