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
    // spacing drift, line numbers, a fence, and one wrong line out of four
    expect(applyEdits("a\nx  =  1\nc", [{ search: "x = 1", replace: "x = 2" }]).content).toBe("a\nx = 2\nc");
    expect(applyEdits("a\nb\nc", [{ search: "2: b", replace: "2: B" }]).content).toBe("a\nB\nc");
    expect(applyEdits("a\nb\nc", [{ search: "```py\nb\n```", replace: "```py\nB\n```" }]).content).toBe("a\nB\nc");
    expect(applyEdits("l1\nl2\nl3\nl4\nl5", [{ search: "l2\nl3\nWRONG\nl5", replace: "X" }]).content).toBe("l1\nX");
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

import { capabilities } from "../src/core/capabilities";
describe("capability badges", () => {
  const ids = (e: object) => capabilities({ id: "x", name: "x", repo: "x", ...e }).map((c) => c.id);
  it("reads thinking, vision, code, MoE, long context and native bundles from the entry", () => {
    expect(ids({ id: "qwen3-4b-thinking-2507", name: "Qwen3-4B-Thinking-2507", role: "Default coder", maxTestedContext: 16384 })).toEqual(["thinking", "code", "tools", "multilingual"]);
    expect(ids({ id: "lfm2.5-8b-a1b", name: "LFM2.5-8B-A1B", architecture: "lfm2moe", isMoe: true, maxTestedContext: 65536 })).toEqual(["moe", "long", "tools", "multilingual"]);
    expect(ids({ id: "qwen2.5-vl-3b", name: "Qwen2.5-VL-3B" })).toEqual(["vision"]);
    expect(ids({ id: "qwen3-1.7b-native", name: "Qwen3-1.7B", engine: "qairt" })).toEqual(["thinking", "tools", "multilingual", "native"]);
    expect(ids({})).toEqual([]);
  });
  it("reads the other kinds from the name, the tags and the header", () => {
    expect(ids({ name: "Cyber-Ornith-1.5-9B-OBLITERATED" })).toContain("uncensored");
    expect(ids({ name: "MiMo-V2.6-Distill-Qwen-9B" })).toContain("distilled");
    expect(ids({ name: "nomic-embed-text-v1.5", pipeline: "feature-extraction" })).toEqual(["embedding"]);
    expect(ids({ name: "whisper-large" })).toContain("audio");
    expect(ids({ name: "some-model", contextLength: 131072 })).toEqual(["long"]);
    expect(ids({ name: "some-model", contextLength: 8192 })).toEqual([]);
    expect(ids({ name: "some-model", tags: ["multilingual", "roleplay"] })).toEqual(["multilingual", "roleplay"]);
  });
});

import { browse, dockerVariants, paramsFromName, guessArchitecture } from "../src/core/browse";
import { HfClient } from "../src/core/hf";
import { DockerClient, parseTag } from "../src/core/docker";
import { nativeRow, parseModelList } from "../src/core/native";
import { parseModelInput, pullRef } from "../src/core/source";
import { resolveModel } from "../src/core/resolve";
import { classifyArchitecture } from "../src/core/arch";
import { buildProfile } from "../src/core/hardware";
import type { Level, QuantClass } from "../src/shared/types";

const hw = buildProfile({ cpuName: "Snapdragon X Plus", totalRamBytes: 16 * 1024 ** 3, npuDevices: [{ name: "Hexagon NPU", driverVersion: "30.0.220.3000" }], osArch: "ARM64" }, "arm64");

describe("pasting anything", () => {
  const p = parseModelInput;
  it("reads Hugging Face in every spelling", () => {
    const want = { kind: "hf", repo: "unsloth/Qwen3-4B-GGUF", quant: null };
    for (const s of ["unsloth/Qwen3-4B-GGUF", "https://huggingface.co/unsloth/Qwen3-4B-GGUF", "huggingface.co/unsloth/Qwen3-4B-GGUF/", "hf.co/unsloth/Qwen3-4B-GGUF", "https://huggingface.co/unsloth/Qwen3-4B-GGUF/tree/main", "ollama run hf.co/unsloth/Qwen3-4B-GGUF", "geniex pull unsloth/Qwen3-4B-GGUF --model-hub hf", "  \"unsloth/Qwen3-4B-GGUF\"  "]) expect(p(s)).toEqual(want);
    expect(p("hf.co/unsloth/Qwen3-4B-GGUF:Q4_0")).toEqual({ ...want, quant: "Q4_0" });
    expect(p("https://huggingface.co/unsloth/Qwen3-4B-GGUF/blob/main/Qwen3-4B-Q8_0.gguf")).toEqual({ ...want, quant: "Q8_0" });
    expect(p("geniex pull org/m-GGUF:q4_0")).toMatchObject({ quant: "Q4_0" });
  });
  it("reads Docker Hub, ModelScope and AI Hub", () => {
    expect(p("docker.io/ai/gemma3")).toEqual({ kind: "docker", namespace: "ai", name: "gemma3", tag: null });
    expect(p("docker model pull ai/qwen3:8B-Q4_0")).toEqual({ kind: "docker", namespace: "ai", name: "qwen3", tag: "8B-Q4_0" });
    expect(p("https://hub.docker.com/r/ai/qwen3/tags")).toEqual({ kind: "docker", namespace: "ai", name: "qwen3", tag: null });
    expect(p("https://modelscope.cn/models/Qwen/Qwen3-0.6B-GGUF")).toEqual({ kind: "modelscope", id: "Qwen/Qwen3-0.6B-GGUF", quant: null });
    expect(p("www.modelscope.cn/models/Qwen/Qwen3-0.6B-GGUF/files")).toMatchObject({ kind: "modelscope", id: "Qwen/Qwen3-0.6B-GGUF" });
    expect(p("ai-hub-models/Qwen3-4B-Instruct-2507")).toEqual({ kind: "aihub", name: "Qwen3-4B-Instruct-2507" });
    expect(p("geniex pull ai-hub-models/Qwen3-4B --model-hub aihub")).toEqual({ kind: "aihub", name: "Qwen3-4B" });
  });
  it("turns names and foreign links into searches, never throws", () => {
    expect(p("qwen coder 30b")).toEqual({ kind: "search", query: "qwen coder 30b" });
    expect(p("llama")).toEqual({ kind: "search", query: "llama" });
    expect(p("")).toEqual({ kind: "search", query: "" });
    expect(p("https://ollama.com/library/llama3.2")).toMatchObject({ kind: "search", query: "llama3.2", note: expect.stringMatching(/Ollama/) });
    expect(p("https://huggingface.co/datasets/org/data")).toMatchObject({ kind: "search" });
    expect(p("https://example.com/whatever")).toMatchObject({ kind: "search", note: expect.stringMatching(/example\.com/) });
    expect(p("https://huggingface.co/models?search=qwen")).toEqual({ kind: "search", query: "qwen" });
  });
  it("builds what GenieX is given", () => {
    expect(pullRef({ kind: "hf", repo: "a/b", quant: "Q4_0" })).toBe("a/b:Q4_0");
    expect(pullRef({ kind: "docker", namespace: "ai", name: "gemma3", tag: "4B-Q4_0" })).toBe("docker.io/ai/gemma3:4B-Q4_0");
    expect(pullRef({ kind: "aihub", name: "Qwen3-4B" })).toBe("ai-hub-models/Qwen3-4B");
  });
});

describe("what the NPU is known to run", () => {
  it("knows the other llama.cpp transformer families, and keeps hybrids and strangers apart", () => {
    for (const a of ["gemma3", "phi3", "olmo2", "glm4", "smollm3", "exaone4", "starcoder2"]) expect(classifyArchitecture(a).cls).toBe("standard");
    for (const a of ["nemotron_h", "gemma3n", "rwkv7", "deepseek2"]) expect(classifyArchitecture(a).cls).toBe("partial-cpu");
    expect(classifyArchitecture("zaya1").cls).toBe("unknown");
  });
});

describe("explore browser", () => {
  const sib = (...f: string[]) => f.map((rfilename) => ({ rfilename }));
  const hfRaw = [
    { id: "a/Qwen3-4B-GGUF", downloads: 10, likes: 2, gguf: { total: 4.0e9, architecture: "qwen3" }, siblings: sib("Qwen3-4B-Q4_0.gguf", "Qwen3-4B-Q8_0.gguf", "mmproj-F16.gguf") },
    { id: "b/Llama-8B-GGUF", downloads: 9, likes: 1, gguf: { total: 8.0e9, architecture: "llama" }, siblings: sib("Llama-8B-Q4_K_M.gguf") },
    { id: "c/Huge-70B-GGUF", downloads: 8, likes: 1, gguf: { total: 70e9, architecture: "llama" }, siblings: sib("Huge-70B-Q4_0.gguf") },
    { id: "d/Odd-GGUF", downloads: 7, likes: 1, gguf: { total: 3e9, architecture: "nanbeige-looped" }, siblings: sib("Odd-Q4_0.gguf") },
    { id: "e/Only-8bit-GGUF", downloads: 6, likes: 1, gguf: { total: 3e9, architecture: "qwen3" }, siblings: sib("m-Q8_0.gguf") },
    { id: "f/Hybrid-9B-GGUF", downloads: 5, likes: 1, gguf: { total: 9e9, architecture: "qwen35" }, siblings: sib("m-Q4_0.gguf") },
    { id: "g/Gemma-3-4b-GGUF", downloads: 4, likes: 1, gguf: { total: 4e9, architecture: "gemma3" }, siblings: sib("g-Q4_0.gguf") }
  ];
  const docker = [{ name: "gemma3", description: "Gemma 3", pull_count: 500, star_count: 9, last_updated: "2026-08-01T00:00:00Z" }, { name: "qwen3", description: "Qwen3", pull_count: 900, star_count: 5, last_updated: "2026-09-01T00:00:00Z" }];
  const q = (o: { quants?: QuantClass[]; levels?: Level[]; query?: string; sort?: "downloads" | "likes" | "trending" | "recent" } = {}) => ({ query: "", sort: "downloads" as const, quants: ["q4_0"] as QuantClass[], levels: ["green", "amber"] as Level[], ...o });
  const repos = (r: { rows: { repo: string }[] }) => r.rows.map((x) => x.repo);

  it("shows Q4_0 repos that are expected to run or need caution, in the chosen order", () => {
    const r = browse({ hf: hfRaw }, hw, q());
    expect(repos(r)).toEqual(["a/Qwen3-4B-GGUF", "f/Hybrid-9B-GGUF", "g/Gemma-3-4b-GGUF"]);
    expect(r.rows[0]).toMatchObject({ source: "hf", ref: "a/Qwen3-4B-GGUF:Q4_0", quant: "Q4_0", paramsB: 4, estGB: 2.1 });
    expect(r.rows[0].verdict.level).toBe("green");
    expect(r.rows[1].verdict.level).toBe("amber"); // hybrid layers: partly on the CPU
    expect(r.rows[2].verdict.level).toBe("green"); // gemma3 is in the broader known list
  });
  it("shows everything once the boxes are ticked, and says what each box adds", () => {
    expect(repos(browse({ hf: hfRaw }, hw, q({ levels: ["green", "amber", "red"] })))).toEqual(["a/Qwen3-4B-GGUF", "c/Huge-70B-GGUF", "d/Odd-GGUF", "f/Hybrid-9B-GGUF", "g/Gemma-3-4b-GGUF"]);
    const four = browse({ hf: hfRaw }, hw, q({ quants: ["q4_0", "other4"] }));
    expect(repos(four)).toContain("b/Llama-8B-GGUF");
    expect(four.rows.find((x) => x.repo === "b/Llama-8B-GGUF")).toMatchObject({ quant: "Q4_K_M", hasQ4_0: false });
    expect(four.rows.find((x) => x.repo === "b/Llama-8B-GGUF")!.verdict.level).toBe("amber");
    expect(repos(browse({ hf: hfRaw }, hw, q({ quants: ["other"] })))).toEqual(["a/Qwen3-4B-GGUF", "e/Only-8bit-GGUF"]);
  });
  it("puts native bundles first and searches every source", () => {
    const native = [nativeRow({ name: "Qwen3-1.7B" }, hw), nativeRow({ name: "Qwen3-8B" }, hw)];
    expect(native[0].verdict.level).toBe("green");
    expect(native[1].verdict.level).toBe("red"); // above ~1.7B on this driver
    const all = browse({ hf: hfRaw, docker, native }, hw, q());
    expect(all.rows[0]).toMatchObject({ source: "aihub", repo: "ai-hub-models/Qwen3-1.7B", engine: "qairt" });
    // Hugging Face filters by the query itself; the other sources are filtered here
    const only = browse({ docker, native }, hw, q({ query: "gemma" }));
    expect(repos(only)).toEqual(["ai/gemma3"]);
    expect(only.rows[0]).toMatchObject({ source: "docker", needsVersion: true, ref: "docker.io/ai/gemma3" });
  });
  it("sizes Docker Hub versions from their tags", () => {
    expect(parseTag("30B-A3B-Q4_K_M")).toEqual({ paramsB: 30, activeB: 3, quant: "Q4_K_M" });
    expect(parseTag("8B-Q4_0")).toMatchObject({ paramsB: 8, quant: "Q4_0" });
    expect(parseTag("270M-F16")).toMatchObject({ paramsB: 0.27, quant: "F16" });
    const v = dockerVariants("qwen3", [{ name: "8B-Q4_0", full_size: 4.7e9 }, { name: "4B-Q4_0", full_size: 2.4e9 }, { name: "14B-Q4_0", full_size: 8.4e9 }, { name: "8B-F16", full_size: 16.4e9 }], hw);
    expect(v.map((x) => x.tag)).toEqual(["4B-Q4_0", "8B-Q4_0", "14B-Q4_0", "8B-F16"]);
    expect(v[0]).toMatchObject({ ref: "docker.io/ai/qwen3:4B-Q4_0", quant: "Q4_0", sizeGB: 2.2 });
    expect(v[2].verdict.level).toBe("red"); // 8.4 GB does not fit 7.8 GB
  });
  it("reads native bundles out of `geniex model list`", () => {
    const out = "Available models for Snapdragon X Elite\n  ai-hub-models/Qwen3-1.7B    1.4 GB\n  ai-hub-models/Llama-3.2-1B-Instruct\n  ai-hub-models/Qwen3-1.7B\nnotes";
    expect(parseModelList(out)).toEqual([{ name: "Qwen3-1.7B", sizeGB: 1.4 }, { name: "Llama-3.2-1B-Instruct", sizeGB: undefined }]);
  });
  it("guesses size and architecture from a name", () => {
    expect(paramsFromName("Qwen3-4B-Thinking-2507")).toBe(4);
    expect(paramsFromName("gemma-3-270m")).toBe(0.27);
    expect(paramsFromName("qwen3-30b-a3b")).toBe(30);
    expect(paramsFromName("qwen3")).toBeNull();
    expect(guessArchitecture("Qwen3-Coder-30B-A3B")).toBe("qwen3moe");
    expect(guessArchitecture("mystery-model")).toBe("unknown");
  });
  it("asks Hugging Face and Docker Hub for what it needs", async () => {
    let url = "";
    const mk = (json: unknown) => new HfClient((async (u: string) => { url = u; return { ok: true, status: 200, json: async () => json, arrayBuffer: async () => new ArrayBuffer(0) }; }) as any);
    expect(await mk(hfRaw).browse({ query: "qwen coder", sort: "trending", limit: 5000 })).toHaveLength(7);
    expect(url).toMatch(/filter=gguf&sort=trendingScore&direction=-1&limit=1000&search=qwen%20coder/);
    expect(url).toMatch(/expand%5B%5D=gguf.*expand%5B%5D=siblings/);
    const d = new DockerClient((async (u: string) => { url = u; return { ok: true, status: 200, json: async () => ({ results: docker, next: null }), arrayBuffer: async () => new ArrayBuffer(0) }; }) as any);
    expect(await d.models("pulls")).toHaveLength(2);
    expect(url).toBe("https://hub.docker.com/v2/repositories/ai/?page_size=100&ordering=-pull_count");
  });
  it("opens a pasted link in any source, or turns it into a search", async () => {
    const dockerFetch = (async (u: string) => ({ ok: true, status: 200, json: async () => ({ results: [{ name: "4B-Q4_0", full_size: 2.4e9 }, { name: "8B-Q4_0", full_size: 4.7e9 }] }), arrayBuffer: async () => new ArrayBuffer(0) })) as any;
    const deps = { hf: new HfClient(dockerFetch), docker: new DockerClient(dockerFetch), native: async () => [{ name: "Qwen3-1.7B", sizeGB: 1.4 }] };
    const d = await resolveModel(deps, "https://hub.docker.com/r/ai/qwen3", hw);
    expect(d.type === "model" && d.inspection.entry).toMatchObject({ source: "docker", repo: "docker.io/ai/qwen3", quant: "4B-Q4_0", sizeGB: 2.2 });
    const t = await resolveModel(deps, "docker model pull ai/qwen3:8B-Q4_0", hw);
    expect(t.type === "model" && t.inspection.entry).toMatchObject({ quant: "8B-Q4_0", sizeGB: 4.4 });
    const n = await resolveModel(deps, "ai-hub-models/Qwen3-1.7B", hw);
    expect(n.type === "model" && n.inspection.entry).toMatchObject({ engine: "qairt", source: "aihub", sizeGB: 1.4 });
    expect(n.type === "model" && n.inspection.verdict!.level).toBe("green");
    const m = await resolveModel(deps, "https://modelscope.cn/models/Qwen/Qwen3-0.6B-GGUF", hw);
    expect(m.type === "model" && m.inspection.entry).toMatchObject({ source: "modelscope", repo: "https://modelscope.cn/models/Qwen/Qwen3-0.6B-GGUF", quant: "Q4_0" });
    expect(await resolveModel(deps, "fast coder", hw)).toEqual({ type: "search", query: "fast coder", note: null });
  });
});
