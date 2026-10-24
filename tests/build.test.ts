import { describe, expect, it } from "vitest";
import { bundleHtml, linkedFiles, pageLinking } from "../src/core/bundle";
import { cleanFile, interfaceOf, parseParts, parsePlan, partBudget, stepwise, stubHistory, Session } from "../src/core/build";
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
  it("falls back to the usual three files for a web request when the planner was useless", () => {
    const p = parsePlan("hmm", [], "fais-moi un jeu de snake en page web");
    expect(p.files.map((f) => f.name)).toEqual(["index.html", "style.css", "script.js"]);
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
  it("splits the parts of a file, or keeps one", () => {
    expect(parseParts("Part: Hero | big title\nPart 2: Footer | links", "x")).toEqual([{ name: "Hero", job: "big title" }, { name: "Footer", job: "links" }]);
    expect(parseParts("no idea", "the job")).toEqual([{ name: "whole file", job: "the job" }]);
    expect(partBudget(3000)).toBe(1800);
    expect(partBudget(100000)).toBe(9000);
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
  it("writes a whole site in parts, each session small, then explains", async () => {
    const m = fake((name, msgs) => {
      const sys = textOf(msgs[0]);
      if (name === "plan") return "Mode: build\nDesign: dark and neon\nFile: index.html | new | the page\nFile: style.css | new | the look\nFile: script.js | new | scroll effects";
      if (name.startsWith("parts:")) return sys.includes("split") && /index\.html/.test(textOf(msgs[1]).split("Split ")[1] ?? "") ? "Part: Top | head and hero\nPart: Features | cards\nPart: Footer | links" : "Part: Everything | all";
      if (name.startsWith("write:0:")) {
        const k = Number(name.split(":")[2]);
        return ["<!doctype html>\n<html><head><title>t</title><link rel=\"stylesheet\" href=\"style.css\"></head><body>\n<h1 id=\"hero\">Hi</h1>", "<section class=\"card\">F</section>", "<footer id=\"foot\">end</footer>\n<script src=\"script.js\"></script>"][k] ?? "";
      }
      if (name.startsWith("write:1")) return "```css\n.card { color: var(--c) }\n```";
      if (name.startsWith("write:2")) return "document.getElementById('hero');";
      if (name === "explain") return "I built the site: three files. Open index.html.";
      return "";
    });
    const history: ChatMessage[] = [{ role: "system", content: "Be kind." }, { role: "user", content: `${big} Build me a full beautiful website with animations.` }];
    const { events, result } = await run(stepwise({ id: "c", messages: history, stream: m.stream, maxChars: 3000 }));
    expect(result.handled).toBe(true);
    const files = artifactsIn(result.text);
    expect(files.map((f) => f.title)).toEqual(["index.html", "style.css", "script.js"]);
    const page = files[0].content;
    expect(page).toMatch(/hero[\s\S]*class="card"[\s\S]*foot[\s\S]*<\/body>\s*<\/html>/);
    expect(files[1].content.trimEnd()).toBe(".card { color: var(--c) }");
    expect(result.text.trim().endsWith("Open index.html.")).toBe(true);
    // the page was written by three sessions; the later ones saw the names that exist, not the markup of the whole site
    const second = m.seen.find((s) => s.sid === "c:write:0:1")!;
    expect(textOf(second.msgs[1])).toMatch(/ids: #hero/);
    expect(textOf(second.msgs[1])).toContain("Design shared by every file: dark and neon");
    // the build card went from running to done with every file done
    const builds = events.filter((e) => e.type === "build") as Extract<ChatEvent, { type: "build" }>[];
    expect(builds.at(-1)!.build).toMatchObject({ status: "done" });
    expect(builds.at(-1)!.build.steps.map((s) => s.status)).toEqual(["done", "done", "done"]);
    // the explanation session never got the code
    const explain = m.seen.find((s) => s.sid === "c:explain")!;
    expect(explain.msgs.map(textOf).join("\n")).not.toContain("<footer");
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
    const msgs = result.messages as ChatMessage[];
    expect(textOf(msgs[1])).toMatch(/^\[file "script.js"/);
    expect(textOf(msgs[2])).toContain("function f10()");
    expect(textOf(msgs[2])).not.toContain("function f250()");
  });
  it("does not even plan a greeting", async () => {
    const m = fake(() => "");
    const { result } = await run(stepwise({ id: "h", messages: [{ role: "user", content: "salut" }], stream: m.stream, maxChars: 3000 }));
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
    expect(roles["write:0:0"]).toBe("html");
    expect(roles["write:1:0"]).toBe("css");
    expect(roles["write:2:0"]).toBe("js");
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
