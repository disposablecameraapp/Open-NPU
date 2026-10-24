import { describe, expect, it } from "vitest";
import { artifactSpans, artifactsIn, replaceArtifact } from "../src/core/artifacts";
import { ThinkSplitter, streamChat } from "../src/core/chat";
import { describeProblems, instrumentedDocument, jsSyntaxError } from "../src/core/codecheck";
import { applyEdits, buildReviewPrompt, integrate, parseReply, reviewCode } from "../src/core/review";
import type { ChatEvent, ChatMessage } from "../src/shared/types";

const page = (body: string) => `Here.\n<artifact type="html" title="Game">\n${body}\n</artifact>\nBye.`;
const SEARCH = (a: string, b: string, file = "Game") => `<edit file="${file}">\n<<<<<<< SEARCH\n${a}\n=======\n${b}\n>>>>>>> REPLACE\n</edit>`;

describe("replacing an artifact in an answer", () => {
  const two = `a <artifact type="html" title="One">\none\n</artifact> b <artifact type="code" language="python" title="Two">\ntwo\n</artifact> c`;
  it("finds the same bodies as the parser", () => {
    expect(artifactSpans(two)).toHaveLength(2);
    expect(artifactsIn(two).map((a) => a.content.trim())).toEqual(["one", "two"]);
  });
  it("replaces only the numbered one and leaves the prose", () => {
    const out = replaceArtifact(two, 1, "new\n\n");
    expect(artifactsIn(out).map((a) => a.content.trim())).toEqual(["one", "new"]);
    expect(out.startsWith("a <artifact") && out.endsWith("</artifact> c")).toBe(true);
    expect(replaceArtifact(two, 5, "x")).toBe(two);
  });
});

describe("reviewer replies", () => {
  it("knows LGTM, edit blocks, bare blocks and whole files", () => {
    expect(parseReply("LGTM").lgtm).toBe(true);
    expect(parseReply("LGTM, but also edit").edits).toEqual([]);
    const r = parseReply(`Found it.\n${SEARCH("let x = 1;", "let x = 2;")}`);
    expect(r.lgtm).toBe(false);
    expect(r.edits).toEqual([{ file: "Game", search: "let x = 1;", replace: "let x = 2;" }]);
    expect(parseReply("<<<<<<< SEARCH\na\n=======\n\n>>>>>>> REPLACE").edits).toEqual([{ file: null, search: "a", replace: "" }]);
    expect(parseReply('<artifact type="html" title="Game">\nfull\n</artifact>').files).toEqual([{ title: "Game", content: "full\n" }]);
  });
  it("applies exact and indentation-blind matches, counts the misses", () => {
    expect(applyEdits("a\nb\nc", [{ search: "b", replace: "B" }])).toEqual({ content: "a\nB\nc", applied: 1, failed: 0 });
    const r = applyEdits("if (x) {\n    go();\n}", [{ search: "if (x) {\ngo();\n}", replace: "if (y) {\n  go();\n}" }]);
    expect(r).toMatchObject({ content: "if (y) {\n  go();\n}", applied: 1 });
    expect(applyEdits("abc", [{ search: "zzz", replace: "y" }])).toMatchObject({ applied: 0, failed: 1 });
  });
  it("applies a reply to the right file of the answer", () => {
    const text = page("let x = 1;");
    const out = integrate(text, parseReply(SEARCH("let x = 1;", "let x = 2;")));
    expect(out.changed).toBe(1);
    expect(artifactsIn(out.text)[0].content.trim()).toBe("let x = 2;");
    expect(integrate(text, parseReply(SEARCH("nope", "x"))).changed).toBe(0);
    expect(integrate(text, parseReply('<artifact type="html" title="Game">\nwhole\n</artifact>')).text).toMatch(/\nwhole\n/);
  });
  it("tells the reviewer what happened when the files ran", () => {
    const p = buildReviewPrompt("a snake game", [{ title: "Game", kind: "html", language: "html", content: "<p>x</p>" }], [{ ran: "page", errors: ["x is not defined (line 3: x++)"] }], 10000);
    expect(p).toMatch(/a snake game[\s\S]*<file name="Game" type="html">[\s\S]*Running it gave these errors:\n- x is not defined/);
  });
});

describe("what the page reports", () => {
  it("keeps the hook on one line so line numbers stay the artifact's", () => {
    const doc = instrumentedDocument("<html><head></head><body>\n<p>hi</p>\n</body></html>");
    expect(doc.split("\n").length).toBe(3);
    expect(doc.indexOf("window.__npu")).toBeGreaterThan(doc.indexOf("Content-Security-Policy"));
    expect(instrumentedDocument("<p>bare</p>")).toContain("window.__npu");
  });
  it("words problems for the model", () => {
    const out = describeProblems([
      { k: "error", m: "Uncaught ReferenceError: foo is not defined", l: 2 },
      { k: "error", m: "Uncaught ReferenceError: foo is not defined", l: 2 },
      { k: "csp", m: "https://cdn.x/lib.js", l: null },
      { k: "csp", m: "eval", l: null }
    ], false, "a\nfoo();\nb");
    expect(out).toEqual([
      "ReferenceError: foo is not defined (line 2: foo();)",
      'It tries to load "https://cdn.x/lib.js", but pages cannot use the network or external files. Inline everything.',
      "It uses eval() or new Function(), which is blocked."
    ]);
    expect(describeProblems([], true, "")).toEqual(["The page is blank: nothing is drawn or written after it loads."]);
  });
  it("finds JavaScript syntax errors with their line", () => {
    expect(jsSyntaxError("let a = 1;\nlet b = ;")).toMatch(/^SyntaxError: .* \(line 2: let b = ;\)/);
    expect(jsSyntaxError("const a = 1;")).toBeNull();
    expect(jsSyntaxError("import x from 'y';\nexport default x;")).toBeNull();
  });
});

describe("thinking that the template opened", () => {
  it("splits an output that starts inside the thought", () => {
    const s = new ThinkSplitter(true);
    const a = s.push("Let me think. <artifact> is how.</th");
    const b = s.push("ink>Here is the answer.");
    expect(a.thinking + b.thinking).toBe("Let me think. <artifact> is how.");
    expect(a.answer + b.answer).toBe("Here is the answer.");
    expect(s.closed).toBe(true);
  });
  const sse = (chunks: object[]) => new Response(new ReadableStream({ start(c) { for (const j of chunks) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(j)}\n\n`)); c.close(); } }));
  const delta = (d: object) => ({ choices: [{ delta: d }] });
  const run = async (thinkOpen: boolean, chunks: object[]) => {
    const out = { thinking: "", answer: "" };
    for await (const ev of streamChat({ endpoint: "x", model: "m", messages: [], sampling: { temperature: 0, top_p: 1, max_tokens: 1 }, thinkOpen, fetchFn: (async () => sse(chunks)) as any }, "i")) {
      if (ev.type === "thinking") out.thinking += ev.text;
      if (ev.type === "answer") out.answer += ev.text;
    }
    return out;
  };
  it("reads the answer after </think>", async () => {
    expect(await run(true, [delta({ content: "pondering</think>done" })])).toEqual({ thinking: "pondering", answer: "done" });
  });
  it("does not swallow an answer when the server sends reasoning in its own field", async () => {
    expect(await run(true, [delta({ reasoning_content: "hmm" }), delta({ content: "plain answer" })])).toEqual({ thinking: "hmm", answer: "plain answer" });
  });
  it("falls back to showing the text when the thought never closes", async () => {
    expect((await run(true, [delta({ content: "just text" })])).answer).toBe("just text");
  });
});

describe("the check and fix loop", () => {
  const history: ChatMessage[] = [{ role: "user", content: "make a game" }];
  const collect = async (g: AsyncGenerator<ChatEvent>) => { const out: ChatEvent[] = []; for await (const e of g) out.push(e); return out; };
  const last = <T extends ChatEvent["type"]>(evs: ChatEvent[], t: T) => [...evs].reverse().find((e) => e.type === t) as Extract<ChatEvent, { type: T }> | undefined;
  const base = { id: "c", history, request: "make a game", rounds: 2, maxChars: 10000 };

  it("does nothing when the answer holds no file", async () => {
    expect(await collect(reviewCode({ ...base, answer: "hello", reviewer: null, check: async () => ({ ran: "none", errors: [] }), askReviewer: async () => "", askWriter: async () => "" }))).toEqual([]);
  });

  it("lets the reviewer fix what the run found, then runs it again", async () => {
    const seen: string[] = [];
    const evs = await collect(reviewCode({
      ...base, answer: page("let x = oops;"), reviewer: "Big",
      check: async (a) => { seen.push(a.content); return a.content.includes("oops") ? { ran: "page", errors: ["oops is not defined (line 1: let x = oops;)"] } : { ran: "page", errors: [] }; },
      askReviewer: async (m) => { expect(m[1].content as string).toMatch(/oops is not defined/); return SEARCH("let x = oops;", "let x = 1;"); },
      askWriter: async () => { throw new Error("writer must not be asked"); }
    }));
    expect(seen.map((x) => x.trim())).toEqual(["let x = oops;", "let x = 1;"]);
    expect(artifactsIn(last(evs, "replace")!.text)[0].content.trim()).toBe("let x = 1;");
    const run = last(evs, "review")!.review;
    expect(run.status).toBe("done");
    expect(run.steps.some((s) => s.kind === "error" && /oops/.test(s.text))).toBe(true);
    expect(run.steps.some((s) => s.kind === "ok" && /Big changed 1 file/.test(s.text))).toBe(true);
  });

  it("stops at once when the reviewer approves a clean run", async () => {
    let asked = 0;
    const evs = await collect(reviewCode({ ...base, answer: page("ok"), reviewer: "Big", check: async () => ({ ran: "page", errors: [] }), askReviewer: async () => { asked++; return "LGTM"; }, askWriter: async () => "" }));
    expect(asked).toBe(1);
    expect(last(evs, "replace")).toBeUndefined();
    expect(last(evs, "review")!.review.steps.at(-1)).toMatchObject({ kind: "ok", text: "Big found no problem." });
  });

  it("without a reviewer the writer rewrites, and only when something failed", async () => {
    let asked: ChatMessage[] = [];
    const clean = await collect(reviewCode({ ...base, answer: page("ok"), reviewer: null, check: async () => ({ ran: "page", errors: [] }), askReviewer: async () => "", askWriter: async () => "x" }));
    expect(last(clean, "replace")).toBeUndefined();
    const evs = await collect(reviewCode({
      ...base, answer: page("bad"), reviewer: null,
      check: async (a) => ({ ran: "page", errors: a.content.trim() === "bad" ? ["boom"] : [] }),
      askReviewer: async () => "", askWriter: async (m) => { asked = m; return '<artifact type="html" title="Game">\ngood\n</artifact>'; }
    }));
    expect(asked.at(-1)!.content as string).toMatch(/I ran your code[\s\S]*Game:\n- boom/);
    expect(artifactsIn(last(evs, "replace")!.text)[0].content.trim()).toBe("good");
  });

  it("gives up after the allowed rounds and says what is left", async () => {
    const evs = await collect(reviewCode({ ...base, rounds: 1, answer: page("bad"), reviewer: "Big", check: async () => ({ ran: "page", errors: ["still broken"] }), askReviewer: async () => SEARCH("bad", "worse"), askWriter: async () => "" }));
    expect(last(evs, "review")!.review.steps.at(-1)!.text).toBe("1 error left after 1 fix round.");
  });

  it("reports edits that do not apply instead of looping", async () => {
    const evs = await collect(reviewCode({ ...base, answer: page("bad"), reviewer: "Big", check: async () => ({ ran: "page", errors: ["e"] }), askReviewer: async () => SEARCH("nothing like it", "x"), askWriter: async () => "" }));
    expect(last(evs, "review")!.review.steps.at(-1)!.text).toBe("The fixes could not be applied to the code.");
    expect(last(evs, "replace")).toBeUndefined();
  });
});

import { canvasNotes } from "../src/core/codecheck";
import { compactHistory, latestArtifacts, resolveEdits, stripEdits } from "../src/core/review";

describe("fixing by editing, not rewriting", () => {
  const v1 = '<artifact type="html" title="Snake">\nlet speed = 5;\nfunction tick() { move(); }\nlet speed2 = 1;\n</artifact>';
  const history: ChatMessage[] = [
    { role: "user", content: "make snake" }, { role: "assistant", content: `Here.\n${v1}` }, { role: "user", content: "fix: move is not defined" }
  ];
  const edit = (a: string, b: string) => `<edit file="Snake">\n<<<<<<< SEARCH\n${a}\n=======\n${b}\n>>>>>>> REPLACE\n</edit>`;

  it("turns edit blocks into the whole corrected file", () => {
    const r = resolveEdits(`The call was wrong.\n${edit("move();", "step();")}`, history)!;
    expect(r.failed).toBe(0);
    expect(r.titles).toEqual(["Snake"]);
    expect(r.text.startsWith("The call was wrong.")).toBe(true);
    expect(r.text).not.toMatch(/SEARCH/);
    const [a] = artifactsIn(r.text);
    expect(a.content).toContain("function tick() { step(); }");
    expect(a.content).toContain("let speed = 5;");
  });
  it("reports edits that do not match, and ignores answers that are not edits", () => {
    const r = resolveEdits(edit("nowhere();", "x();"), history)!;
    expect(r).toMatchObject({ failed: 1, total: 1, titles: [] });
    expect(resolveEdits("plain answer", history)).toBeNull();
    expect(resolveEdits(`${edit("a", "b")}\n${v1}`, history)).toBeNull();
    expect(stripEdits(`Hi\n${edit("a", "b")}`)).toBe("Hi");
  });
  it("edits the newest version when the file was changed twice", () => {
    const h2: ChatMessage[] = [...history, { role: "assistant", content: v1.replace("speed = 5", "speed = 9") }];
    expect(latestArtifacts(h2)[0].content).toContain("speed = 9");
    const r = resolveEdits(edit("speed = 9;", "speed = 1;"), h2)!;
    expect(r.failed).toBe(0);
  });
  it("keeps only the newest version of a file in the history sent to the model", () => {
    const h2: ChatMessage[] = [...history, { role: "assistant", content: v1.replace("speed = 5", "speed = 9") }];
    const lean = compactHistory(h2);
    expect(lean[1].content).toMatch(/earlier version left out/);
    expect(lean[1].content).not.toContain("function tick");
    expect(lean[3].content).toContain("function tick");
    expect(compactHistory(history)).toEqual(history);
  });
});

describe("canvas observations", () => {
  it("says when nothing ever moves or was drawn", () => {
    expect(canvasNotes([["1"], ["1"], ["1"]])).toEqual([expect.stringMatching(/never changed/)]);
    expect(canvasNotes([["empty"], ["empty"], ["empty"]])).toEqual(["The canvas is empty: nothing was drawn on it."]);
    expect(canvasNotes([["1"], ["2"], ["3"]])).toEqual([]);
    expect(canvasNotes([["n/a"], ["n/a"]])).toEqual([]);
    expect(canvasNotes([])).toEqual([]);
  });
  it("hands the screenshot and the observations to a reviewer that can see", async () => {
    const seen: ChatMessage[][] = [];
    const evs: ChatEvent[] = [];
    for await (const e of reviewCode({
      id: "c", history: [], request: "snake", rounds: 1, maxChars: 5000, reviewer: "Big", vision: true, answer: page("x"),
      check: async () => ({ ran: "page", errors: [], notes: ["The canvas never changed."], shot: "data:image/jpeg;base64,AA" }),
      askReviewer: async (m) => { seen.push(m); return "LGTM"; }, askWriter: async () => ""
    })) evs.push(e);
    const parts = seen[0][1].content as { type: string; text?: string }[];
    expect(parts.map((p) => p.type)).toEqual(["text", "image_url"]);
    expect(parts[0].text).toMatch(/Observed: The canvas never changed\./);
    expect((evs.at(-1) as any).review.shots).toEqual(["data:image/jpeg;base64,AA"]);
  });
});
