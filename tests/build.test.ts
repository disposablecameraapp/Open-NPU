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
  const seen: { sid: string; msgs: ChatMessage[] }[] = [];
  const stream: Session = async function* (sid, msgs) {
    seen.push({ sid, msgs });
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

  it("writes a platformer as a page of blocks, in short sessions that never see the whole page", async () => {
    const m = fake((name, msgs) => {
      if (name.includes("Outline")) return "STYLE: bright\nSTATE: lives=3, score=0\nSECTION: Title | none | the title; a play button\nSECTION: Level 1 | platformer | ground; a coin; the flag\nSECTION: Game over | none | a retry button\nART: hero | 28x36 | a small hero";
      if (name.includes("Look")) return "<style>:root{--bg:#123;--text:#fff} body{background:var(--bg);color:var(--text)}</style>";
      if (name.includes("Drawing")) return '<svg viewBox="0 0 28 36"><circle cx="14" cy="10" r="8" fill="#c33"/></svg>';
      if (name.includes("Tasks of")) return "- the level\n- the end";
      if (name.includes("Title:")) return '<h1>Run</h1><button data-click="go:level_1">Play</button>';
      if (name.includes("Level 1: the level")) return '<x-platformer tile="32" view="16"><x-legend>\n# ground\nP player\no coin score+=1\nF flag\n</x-legend>\n..PoF\n#####</x-platformer>';
      if (name.includes("Level 1: the end")) return '<x-rule when="lives<=0" do="go:game_over"></x-rule>';
      if (name.includes("Game over:")) return '<button data-click="restart">Retry</button>';
      void msgs;
      return name === "explain" ? "Done." : "";
    });
    const { result } = await run(stepwise({ id: "p", messages: [{ role: "user", content: "make a platformer like the first mario" }], stream: m.stream, maxChars: 8000 }));
    const page = artifactsIn(result.text)[0].content;
    expect(page).toContain('<x-scene id="level_1">');
    expect(page).toContain("<x-platformer");
    expect(page).toContain("<x-asset name=\"hero\"");
    expect(page).toMatch(/<x-state [^>]*lives="3"/);
    expect(m.seen.some((s) => /^p:write:/.test(s.sid))).toBe(false); // no single session wrote the whole file
    for (const s of m.seen) expect(s.msgs.map(textOf).join("").length).toBeLessThan(12000);
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
    const m = fake((name) => (name.includes("Outline") ? "SECTION: Title | none | a title\nSECTION: Level 1 | platformer, timer | the level\nSTATE: lives=3" : name === "explain" ? "Done." : ""));
    await run(stepwise({ id: "q", messages: [{ role: "user", content: "make a platformer like the first mario level with a timer, goomba-like enemies and a flag" }], stream: m.stream, maxChars: 8000 }));
    expect(m.seen.some((s) => /Outline/.test(s.sid))).toBe(true);
    const { directPlan } = await import("../src/core/build");
    expect(directPlan("make a platformer like mario with a timer", [])?.files[0].name).toBe("game.html");
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
