import { describe, expect, it } from "vitest";
import { cleanSpec, stepwise, Session } from "../src/core/build";
import { artifactsIn } from "../src/core/artifacts";
import { quickErrors } from "../src/core/codecheck";
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

describe("small pieces", () => {
  it("cleans the rules a model wrote", () => {
    expect(cleanSpec("```\n- a\n- The grid is 20 by 20\n2) Space restarts the game\n```")).toBe("- The grid is 20 by 20\n- Space restarts the game");
    expect(cleanSpec("")).toBe("");
  });
  it("lets a model think when it mends a file and not when it writes one", () => {
    expect(stageEffort("c:repair:0:1")).toBe("medium");
    expect(stageEffort("c:fix:0")).toBe("medium");
    expect(stageEffort("c:write:0")).toBe("low");
    expect(stageEffort("c:plan")).toBe("low");
  });
});

