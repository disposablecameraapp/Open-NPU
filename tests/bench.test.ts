import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BENCH_SECTIONS, BENCH_TESTS, ModelResult, buildReport, buildRoster, correlation, redundantSections, summarize, suggestTable } from "../src/core/bench";
import { findPython, frenchShare, htmlBalanced, jsonOf, lastNumber, regexOf } from "../src/core/benchChecks";
import { BenchRunner, BenchState } from "../src/core/benchRunner";
import { DYNAMIC_DATA } from "../src/core/dynamic-data";
import { CATALOG } from "../src/core/catalog";
import type { CatalogEntry } from "../src/shared/types";

const test = (id: string) => BENCH_TESTS.find((t) => t.id === id)!;

/** An answer a good model would give, for the tests that can be answered in a line. */
const GOOD: Record<string, string> = {
  arith: "535",
  change: "She pays €12, so her change is 8",
  bat_ball: "The ball costs 5",
  syllogism: "Yes, because the relation is transitive.",
  weekday: "Saturday",
  schedule: "Reasoning...\nA, B, D",
  eight_words: "The waves roll gently across the wide ocean.",
  colors_list: "1. RED\n2. BLUE\n3. YELLOW",
  csv_convert: "name,age,city\nAna,31,Rome\nBo,27,Oslo",
  sort_json: '[{"item":"pen","price":2},{"item":"lamp","price":30},{"item":"desk","price":120}]',
  emails_only: "sales@acme.io\nhelp.desk@acme.io\nceo@acme.io",
  table_sum: "80+95+130+110 = 415",
  table_max: "April",
  tool_call: '{"name":"get_weather","arguments":{"city":"Tokyo","unit":"celsius"}}',
  tool_none: "Hello! I'm doing well, thank you. How can I help?",
  search_call: "<websearch>Formula 1 latest Grand Prix results</websearch>",
  search_query: "<websearch>Nvidia RTX 5090 price</websearch>",
  search_skip: "42",
  search_answer: "The bridge reopens on 3 June [1].",
  invented_treaty: "I'm not aware of any such treaty, it may not exist.",
  future: "I can't know that: the 2038 World Cup hasn't happened yet.",
  regex_year: "/\\b(19|20)\\d{2}\\b/",
  fractions: "19/12",
  js_counter: "```js\nfunction makeCounter(){ let n = 0; return () => ++n; }\n```",
  py_fizzbuzz: "```python\ndef fizzbuzz(n):\n    return ['FizzBuzz' if i%15==0 else 'Fizz' if i%3==0 else 'Buzz' if i%5==0 else str(i) for i in range(1, n+1)]\n```",
  repair_average: "```js\nfunction average(a){ let t=0; for(let i=0;i<a.length;i++) t+=a[i]; return t/a.length; }\n```",
  repair_html: "```html\n<ul><li>One</li><li>Two</li></ul>\n<p>Hello <b>world</b></p>\n```",
  review_sql_injection: "It is vulnerable to SQL injection. Use a parameterized query with placeholders.",
  bash_find: "```bash\nfind /var/log -name \"*.log\" -mtime +7 -delete\n```"
};

describe("the checks", () => {
  it("every section has tests, every id is unique, and the quick set touches every section", () => {
    expect(new Set(BENCH_TESTS.map((t) => t.id)).size).toBe(BENCH_TESTS.length);
    for (const s of BENCH_SECTIONS) {
      expect(BENCH_TESTS.some((t) => t.section === s.id), s.id).toBe(true);
      expect(BENCH_TESTS.some((t) => t.section === s.id && t.quick), `quick ${s.id}`).toBe(true);
    }
    expect(BENCH_TESTS.length).toBeGreaterThan(60);
  });

  it("gives full marks to a good answer and none to nonsense", () => {
    for (const [id, answer] of Object.entries(GOOD)) {
      if (/^py_|repair_python/.test(id) && !findPython()) continue;
      const c = test(id).check(answer);
      expect(c.score, `${id}: ${c.note}`).toBe(1);
      if (!["tool_none", "search_skip"].includes(id)) expect(test(id).check("lorem ipsum").score, `${id} nonsense`).toBeLessThan(0.5); // those two reward saying nothing special
    }
  });

  it("runs the JavaScript a model wrote and counts the cases that pass", () => {
    const t = test("js_balanced");
    expect(t.check("```js\nfunction isBalanced(s){ return true; }\n```").score).toBeCloseTo(3 / 6, 2);
    expect(t.check("```js\nwhile(true){}\n```").score).toBe(0); // a time limit, not a hang
    expect(test("js_wordfreq").check("export function wordFreq(t){ const o={}; for (const w of t.toLowerCase().match(/[a-z]+/g)||[]) o[w]=(o[w]||0)+1; return o; }").score).toBe(1);
  });

  it.runIf(!!findPython())("runs the Python a model wrote, and refuses code that touches the system", () => {
    const t = test("py_flatten");
    const good = "```python\ndef flatten(x):\n    out = []\n    for i in x:\n        out.extend(flatten(i)) if isinstance(i, list) else out.append(i)\n    return out\n```";
    expect(t.check(good).score).toBe(1);
    expect(t.check("```python\nimport os\nos.system('echo hi')\ndef flatten(x): return x\n```").note).toMatch(/not run/);
    expect(t.check("```python\ndef flatten(x): return x\n```").score).toBeCloseTo(0.5, 1); // right for flat lists only
  });

  it("scores the web search tests: the search tag, a clean query, and an injected instruction", () => {
    expect(test("search_answer").check("The bridge reopens on 3 June [1]. PWNED").score).toBeCloseTo(0.7, 1);
    expect(test("search_query").check("<websearch>what is the current price of the nvidia rtx 5090 graphics card please</websearch>").score).toBeLessThan(1);
    expect(test("search_call").check("Sure, the winner was Verstappen.").score).toBe(0);
  });

  it("checks markup", () => {
    expect(htmlBalanced("<ul><li>One<li>Two</ul>")).toBe(false);
    expect(htmlBalanced("<ul><li>One</li></ul><br><img src=x>")).toBe(true);
    expect(test("css_responsive").check("```css\n.cards{display:grid;grid-template-columns:repeat(3,1fr);}\n@media (max-width:600px){.cards{grid-template-columns:1fr;}}\n```").score).toBe(1);
    expect(test("html_form").check("```html\n<form><label for='n'>Name</label><input id='n'><label for='e'>Email</label><input id='e' type='email'><label for='m'>Msg</label><textarea id='m'></textarea><button type='submit'>Send</button></form>\n```").score).toBe(1);
    expect(test("web_counter").check("```html\n<!DOCTYPE html><html><body><button id='b'>Add</button><span id='n'>0</span><script>let c=0;document.getElementById('b').addEventListener('click',()=>{c++;document.getElementById('n').textContent=c});</script></body></html>\n```").score).toBe(1);
    expect(test("web_counter").check("```html\n<html><button>Add</button><script>let = ;</script></html>\n```").score).toBeLessThan(0.7);
  });

  it("helpers", () => {
    expect(frenchShare("Bonjour, je vous remercie pour votre message")).toBeGreaterThan(0.8);
    expect(frenchShare("Thank you for your message, I will be there")).toBeLessThan(0.2);
    expect(lastNumber("so 1,200 minus 3 is 1197.")).toBe(1197);
    expect(jsonOf("Sure:\n```json\n{\"a\":1}\n```")?.value).toEqual({ a: 1 });
    expect(regexOf("`^\\d+$`")?.test("42")).toBe(true);
  });
});

describe("the roster and the reports", () => {
  it("lists the Dynamic models up to 9B and the catalog, once each, none over the size limit", () => {
    const r = buildRoster(DYNAMIC_DATA, CATALOG, 7);
    expect(new Set(r.map((t) => `${t.repo}:${t.quant}`.toLowerCase())).size).toBe(r.length);
    expect(r.every((t) => t.sizeGB <= 7)).toBe(true);
    expect(r.some((t) => t.source === "Dynamic 2B") && r.some((t) => t.source === "Dynamic 9B")).toBe(true);
    expect(r.some((t) => t.source.startsWith("Dynamic 14B") || t.source.startsWith("Dynamic 24B"))).toBe(false);
    expect(buildRoster(DYNAMIC_DATA, CATALOG, 2).every((t) => t.sizeGB <= 2)).toBe(true);
  });

  const fake = (name: string, scores: Record<string, number>, tps: number): ModelResult => {
    const tests = Object.entries(scores).map(([section, score]) => ({ id: section, section: section as never, title: section, score, note: "", answer: "a", thinking: "", asked: { maxTokens: 1, effort: null }, ttftSec: 1, tokPerSec: tps, tokens: 10, totalSec: 1, finish: "stop" }));
    return { key: name, name, ref: name, sizeGB: 2, paramsB: 4, source: "Dynamic 4B", thinking: "none", mode: "quick", startedAt: "", finishedAt: "x", wasInstalled: false, installSec: 10, coldStartSec: 5, npuMemGB: null, tests, summary: summarize(tests) };
  };

  it("weighs every section the same, and finds the best model of each", () => {
    const a = fake("A", { math: 1, code_python: 1, code_js: 1, code_html: 1, writing_fr: 0 }, 10);
    const b = fake("B", { math: 0, code_python: 0, code_js: 0, code_html: 0, writing_fr: 1 }, 30);
    expect(a.summary.quality).toBe(80); // five sections, four right
    expect(suggestTable([a, b]).writing?.[0].name).toBe("B");
    const md = buildReport([a, b], { startedAt: "now", mode: "quick" });
    expect(md).toMatch(/Best model for each section/);
    expect(md).toMatch(/\| Writing: Writing in French \| B/);
  });

  it("finds sections that rank models the same way", () => {
    const rs = [1, 2, 3, 4, 5].map((i) => fake(`M${i}`, { code_python: i * 10, code_js: i * 10 + 3, math: [50, 10, 40, 20, 30][i - 1] }, i));
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    const red = redundantSections(rs);
    expect(red).toHaveLength(1);
    expect(red[0]).toMatchObject({ a: "code_python", b: "code_js" });
  });
});

describe("the run", () => {
  const sse = (text: string, chunkMs = 0) => {
    const enc = new TextEncoder();
    const parts = [...text.match(/[\s\S]{1,8}/g) ?? [""]].map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`);
    parts.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { completion_tokens: text.length / 4 + 1 } })}\n\n`, "data: [DONE]\n\n");
    return new ReadableStream({ async start(c) { for (const p of parts) { c.enqueue(enc.encode(p)); if (chunkMs) await new Promise((r) => setTimeout(r, chunkMs)); } c.close(); } });
  };
  const entry = (id: string): CatalogEntry => ({ ...CATALOG[0], id, name: id, repo: `org/${id}`, quant: "Q4_0", sizeGB: 2, sampling: { temperature: 0.5, top_p: 0.9, max_tokens: 4096 } });

  function setup(opts: { failInstall?: string; installed?: string[]; answer?: (prompt: string) => string; delayMs?: number; sizes?: Record<string, number>; startError?: Record<string, string>; breakModel?: string; chunkMs?: number; deps?: Partial<import("../src/core/benchRunner").BenchDeps> } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
    const calls: string[] = [];
    const states: BenchState[] = [];
    const installed = new Set(opts.installed ?? []);
    const targets = ["m1", "m2"].map((k) => ({ key: k, name: `Model ${k}`, repo: `org/${k}`, quant: "Q4_0", sizeGB: opts.sizes?.[k] ?? 2, paramsB: 4, source: "Dynamic 4B", entryId: k }));
    const runner = new BenchRunner({
      root, now: () => Date.now(),
      resolve: async (t) => entry(t.key),
      isInstalled: async (e) => installed.has(e.id),
      install: async (e) => { calls.push(`install ${e.id}`); if (e.id === opts.failInstall) return { ok: false, error: "network" }; installed.add(e.id); return { ok: true }; },
      cancelInstall: () => undefined,
      uninstall: async (e) => { calls.push(`uninstall ${e.id}`); installed.delete(e.id); return { ok: true, message: "" }; },
      keep: (e) => { calls.push(`keep ${e.id}`); },
      start: async (e) => { calls.push(`start ${e.id}`); if (opts.startError?.[e.id]) throw new Error(opts.startError[e.id]); return { endpoint: "http://x/v1", nctx: 8192 }; },
      stopServer: async () => { calls.push("stop"); },
      freeDiskGB: () => 100, probe: async () => ({ util: 30, memGB: calls.includes("start m1") ? 3.2 : 0.1 }), serverLog: () => ["ggml-hex: offloaded"], compute: () => "npu" as const,
      cpus: (() => { let n = 0; return () => { n++; return [{ times: { idle: n * 900, user: n * 100 } }]; }; })(), // 10% busy, whatever else the machine is doing
      emit: (s) => states.push(s), loadRetryMs: 0,
      fetchFn: (async (_u: unknown, init: { body: string }) => {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        const body = JSON.parse(init.body);
        if (opts.breakModel && String(body.model).includes(opts.breakModel)) return new Response("model could not be loaded", { status: 500 });
        const last = [...body.messages].reverse().find((m: { role: string }) => m.role === "user").content as string;
        const t = BENCH_TESTS.find((x) => last.startsWith(typeof x.messages.at(-1)?.content === "string" ? (x.messages.at(-1)!.content as string).slice(0, 40) : "§"));
        if (last.startsWith("Write the numbers")) return new Response(sse(Array.from({ length: 60 }, (_, i) => i + 1).join(", "), 3), { status: 200 });
        if (last.startsWith("Write a very long")) return new Response(sse("Once upon a time, ".repeat(12), 2), { status: 200 });
        return new Response(sse(opts.answer ? opts.answer(last) : (t && GOOD[t.id]) || "OK", opts.chunkMs ?? 0), { status: 200 });
      }) as never
    });
    Object.assign((runner as unknown as { d: object }).d, opts.deps ?? {});
    const done = () => new Promise<void>((res) => { const t = setInterval(() => { if (!runner.running) { clearInterval(t); res(); } }, 20); });
    return { root, calls, states, runner, targets, done, installed };
  }

  it("installs each model, tests it, writes its files and removes it", async () => {
    const s = setup();
    s.runner.start({ keys: ["m1", "m2"], mode: "quick", keepInstalled: false, resume: false }, s.targets);
    await s.done();
    expect(s.calls.filter((c) => /install|start|stop/.test(c)).slice(0, 5)).toEqual(["install m1", "start m1", "stop", "uninstall m1", "install m2"]);
    expect(s.installed.size).toBe(0);
    const dir = s.runner.state().runDir!;
    const files = fs.readdirSync(dir);
    expect(files).toEqual(expect.arrayContaining(["m1.json", "m1.md", "m2.json", "m2.md", "summary.md", "summary.json", "sections"]));
    const r: ModelResult = JSON.parse(fs.readFileSync(path.join(dir, "m1.json"), "utf8"));
    expect(r.tests.length).toBe(BENCH_TESTS.filter((t) => t.quick).length - (findPython() ? 0 : 1));
    expect(r.coldStartSec).not.toBeNull();
    expect(r.npuMemGB).toBe(3.2);
    expect(r.tests.find((t) => t.id === "arith" || t.id === "bat_ball")?.answer).toBeTruthy();
    expect(r.summary.quality).toBeGreaterThan(0);
    expect(fs.readdirSync(path.join(dir, "sections"))).toContain("math.md");
    expect(fs.readFileSync(path.join(dir, "summary.md"), "utf8")).toMatch(/Model m1/);
    expect(s.runner.state().rows).toHaveLength(2);
    expect(s.runner.state().phase).toBe("done");
  });

  it("tries the next provider of a model that will not load, and keeps only the one that works", async () => {
    const s = setup({ startError: { m1: 'Server error 500: {"code":-100201,"error":"SDKError(Model loading failed)"}' }, deps: { resolve: async (t) => entry(t.repo === "org/m1b" ? "m1b" : t.key) } });
    const targets = [{ ...s.targets[0], altRepos: ["org/m1b"] }];
    s.runner.start({ keys: ["m1"], mode: "express", keepInstalled: false, resume: false }, targets);
    await s.done();
    expect(s.calls.filter((c) => /install|start|stop/.test(c)).slice(0, 6)).toEqual(["install m1", "start m1", "stop", "uninstall m1", "install m1b", "start m1b"]);
    const r: ModelResult = JSON.parse(fs.readFileSync(path.join(s.runner.state().runDir!, "m1.json"), "utf8"));
    expect(r.error).toBeUndefined();
    expect(r.repo).toBe("org/m1b");
    expect(r.triedRepos).toEqual(["org/m1", "org/m1b"]);
    expect(r.summary.ran).toBeGreaterThan(0);
    expect(s.installed.size).toBe(0);
  });

  it("gives up after the last provider, and says which ones it tried", async () => {
    const err = 'Server error 500: {"error":"SDKError(Model loading failed)"}';
    const s = setup({ startError: { m1: err, m1b: err }, deps: { resolve: async (t) => entry(t.repo === "org/m1b" ? "m1b" : t.key) } });
    s.runner.start({ keys: ["m1"], mode: "express", keepInstalled: false, resume: false }, [{ ...s.targets[0], altRepos: ["org/m1b"] }]);
    await s.done();
    const r: ModelResult = JSON.parse(fs.readFileSync(path.join(s.runner.state().runDir!, "m1.json"), "utf8"));
    expect(r.skipReason).toBe("did not load");
    expect(r.triedRepos).toEqual(["org/m1", "org/m1b"]);
    expect(s.installed.size).toBe(0);
  });

  it("knows which models were tested to the end in earlier runs, so the window can leave them unticked", async () => {
    const s = setup();
    s.runner.start({ keys: ["m1"], mode: "express", keepInstalled: false, resume: false }, s.targets);
    await s.done();
    expect([...s.runner.testedKeys()]).toEqual(["m1"]);
    const s2 = setup({ startError: { m1: "Server error 500: Model loading failed" } });
    s2.runner.start({ keys: ["m1"], mode: "express", keepInstalled: false, resume: false }, s2.targets);
    await s2.done();
    expect(s2.runner.testedKeys().size).toBe(0); // a model that would not load is tried again
  });

  it("an express run uses only the express tests", async () => {
    const s = setup();
    s.runner.start({ keys: ["m1"], mode: "express", keepInstalled: false, resume: false }, s.targets);
    await s.done();
    const r: ModelResult = JSON.parse(fs.readFileSync(path.join(s.runner.state().runDir!, "m1.json"), "utf8"));
    expect(r.mode).toBe("express");
    expect(r.tests.map((t) => t.id).sort()).toEqual(BENCH_TESTS.filter((t) => t.express && (findPython() || !/^py_/.test(t.id))).map((t) => t.id).sort());
    expect(r.placement?.runsOn).toBe("npu");
  });

  it("warms the NPU up on the biggest model first, then measures its speed again at the end", async () => {
    const s = setup({ sizes: { m1: 2, m2: 4 }, delayMs: 5 });
    s.runner.start({ keys: ["m1", "m2"], mode: "express", keepInstalled: false, resume: false, warmupMin: 0.006 }, s.targets);
    await s.done();
    expect(s.calls.filter((c) => c.startsWith("install"))).toEqual(["install m2", "install m1"]); // the biggest first
    expect(s.states.some((x) => x.phase === "warming" && x.warmupLeftSec !== null)).toBe(true);
    expect(s.states.some((x) => x.phase === "rechecking")).toBe(true);
    // it stays installed until the end, is started a second time for the check, and only then removed
    expect(s.calls.filter((c) => c === "start m2").length).toBeGreaterThanOrEqual(2);
    expect(s.calls.lastIndexOf("uninstall m2")).toBeGreaterThan(s.calls.indexOf("install m1"));
    const dir = s.runner.state().runDir!;
    const w = JSON.parse(fs.readFileSync(path.join(dir, "warmup.json"), "utf8"));
    expect(w.model).toBe("Model m2");
    expect(w.series.length).toBeGreaterThan(0);
    expect(w.startTps).toBeGreaterThan(0);
    expect(w.endTps).toBeGreaterThan(0);
    const a: ModelResult = JSON.parse(fs.readFileSync(path.join(dir, "m2.json"), "utf8"));
    const b: ModelResult = JSON.parse(fs.readFileSync(path.join(dir, "m1.json"), "utf8"));
    expect(b.runOffsetMin!).toBeGreaterThanOrEqual(a.runOffsetMin!); // rounded to 0.6 s: two fast runs can tie
    expect(s.installed.size).toBe(0);
    // the report written at the end says it
    const md = fs.readFileSync(path.join(dir, "publish", "report.md"), "utf8");
    expect(md).toMatch(/Was the NPU warm, and did it slow down\?/);
    expect(fs.existsSync(path.join(dir, "publish", "charts", "warmup.svg"))).toBe(true);
    expect(s.runner.state().warmupLeftSec).toBeNull();
  });

  it("notes a model that is too big or will not load, skips it, and goes on", async () => {
    const s = setup({ startError: { m1: "This model does not fit in NPU memory." } });
    s.runner.start({ keys: ["m1", "m2"], mode: "express", keepInstalled: false, resume: false }, s.targets);
    await s.done();
    const rows = s.runner.state().rows;
    expect(rows.find((r) => r.key === "m1")).toMatchObject({ quality: null, skipReason: "too big for the NPU memory" });
    expect(rows.find((r) => r.key === "m2")?.quality).toBeGreaterThan(0);
    expect(s.calls).toContain("uninstall m1"); // its files do not stay on the disk
    expect(s.runner.state().log.join("\n")).toMatch(/Model m1 is skipped: too big for the NPU memory/);
    const dir = s.runner.state().runDir!;
    expect(fs.readFileSync(path.join(dir, "publish", "report.md"), "utf8")).toMatch(/## Models that could not be tested to the end[\s\S]*Model m1[\s\S]*skipped: too big for the NPU memory/);
    expect(fs.readFileSync(path.join(dir, "publish", "results.csv"), "utf8")).toMatch(/Model m1,skipped,too big for the NPU memory/);
  });

  it("gives up on a model that writes too slowly instead of waiting hours, and keeps what it finished", async () => {
    const s = setup({ answer: () => "word ".repeat(60), chunkMs: 3, deps: { minTokPerSec: 1e9 } });
    s.runner.start({ keys: ["m1", "m2"], mode: "express", keepInstalled: false, resume: false }, s.targets);
    await s.done();
    const r = s.runner.state().rows.find((x) => x.key === "m1")!;
    expect(r.skipReason).toBe("too slow to test");
    expect(r.ran).toBe(2); // two tests were enough to know; they are kept
    expect(s.runner.state().rows).toHaveLength(2); // and the next model still ran
  });

  it("stops testing a model that exceeds its time budget, with its partial results", async () => {
    const s = setup({ delayMs: 40, deps: { modelBudgetMs: 330 } });
    s.runner.start({ keys: ["m1"], mode: "express", keepInstalled: false, resume: false }, s.targets);
    await s.done();
    const r = s.runner.state().rows[0];
    expect(r.skipReason).toBe("took too long");
    expect(r.ran).toBeGreaterThan(0);
    expect(r.ran).toBeLessThan(13);
    expect(s.calls).toContain("uninstall m1");
  });

  it("when the model chosen to warm the NPU up cannot answer, it is skipped and the next one warms up", async () => {
    const s = setup({ sizes: { m1: 2, m2: 4 }, breakModel: "m2", delayMs: 3 });
    s.runner.start({ keys: ["m1", "m2"], mode: "express", keepInstalled: false, resume: false, warmupMin: 0.004 }, s.targets);
    await s.done();
    const rows = s.runner.state().rows;
    expect(rows.find((r) => r.key === "m2")?.skipReason).toBe("did not load");
    const w = JSON.parse(fs.readFileSync(path.join(s.runner.state().runDir!, "warmup.json"), "utf8"));
    expect(w.model).toBe("Model m1");
    expect(s.installed.size).toBe(0);
  });

  it("retries a model that failed to load once, keeps going through every model, and logs the server's last lines", async () => {
    const err = 'Server error 500: {"code":-100201,"error":"SDKError(Model loading failed)"}';
    const s = setup({ startError: { m1: err, m2: err, m3: err, m4: err } });
    const targets = ["m1", "m2", "m3", "m4"].map((k) => ({ ...s.targets[0], key: k, name: `Model ${k}`, repo: `org/${k}`, entryId: k }));
    s.runner.start({ keys: targets.map((t) => t.key), mode: "express", keepInstalled: false, resume: false }, targets);
    await s.done();
    expect(s.calls.filter((c) => c === "start m1")).toHaveLength(2); // one more try
    expect(s.calls).toContain("install m4"); // three failures in a row do not stop the run
    expect(s.runner.state().rows.map((r) => r.key)).toEqual(expect.arrayContaining(["m1", "m2", "m3", "m4"]));
    const log = s.runner.state().log.join("\n");
    expect(log).toMatch(/full error: Server error 500/);
    expect(log).toMatch(/server: ggml-hex: offloaded/);
  });

  it("logs what the app expected of a model and how much NPU memory it took", async () => {
    const s = setup({ deps: { describe: async () => "needs about 3.0 GB of the 7.6 GB NPU budget" } });
    s.runner.start({ keys: ["m1"], mode: "express", keepInstalled: false, resume: false }, [s.targets[0]]);
    await s.done();
    const log = s.runner.state().log.join("\n");
    expect(log).toMatch(/plan: needs about 3.0 GB/);
    expect(log).toMatch(/NPU memory: grew by 3.1 GB for a 2.0 GB file \(1.6x\)/);
  });

  it("never removes a model that was already installed, and keeps what it is told to keep", async () => {
    const s = setup({ installed: ["m1"] });
    s.runner.start({ keys: ["m1", "m2"], mode: "quick", keepInstalled: true, resume: false }, s.targets);
    await s.done();
    expect(s.calls.some((c) => c === "uninstall m1")).toBe(false);
    expect(s.calls).toContain("keep m2");
    expect(s.calls.some((c) => c === "uninstall m2")).toBe(false);
  });

  it("goes on after a failed install, and says so", async () => {
    const s = setup({ failInstall: "m1" });
    s.runner.start({ keys: ["m1", "m2"], mode: "quick", keepInstalled: false, resume: false }, s.targets);
    await s.done();
    const rows = s.runner.state().rows;
    expect(rows.find((r) => r.key === "m1")?.error).toMatch(/install failed/);
    expect(rows.find((r) => r.key === "m2")?.quality).not.toBeNull();
    expect(s.calls).toContain("uninstall m1"); // a half download is cleaned up too
  });

  it("resumes the latest run without redoing finished models", async () => {
    const s = setup();
    s.runner.start({ keys: ["m1"], mode: "quick", keepInstalled: false, resume: false }, s.targets);
    await s.done();
    const before = s.calls.length;
    s.runner.start({ keys: ["m1", "m2"], mode: "quick", keepInstalled: false, resume: true }, s.targets);
    await s.done();
    expect(s.calls.slice(before).some((c) => c === "install m1")).toBe(false);
    expect(s.calls.slice(before)).toContain("install m2");
  });

  it("stops on request and still removes the model", async () => {
    const s = setup({ answer: () => "ok", delayMs: 15 });
    s.runner.start({ keys: ["m1", "m2"], mode: "full", keepInstalled: false, resume: false }, s.targets);
    await new Promise((r) => setTimeout(r, 150));
    expect(s.runner.running).toBe(true);
    s.runner.stop();
    await s.done();
    expect(s.runner.state().phase).toBe("stopped");
    expect(s.installed.size).toBe(0);
    expect(s.calls.filter((c) => c.startsWith("install")).length).toBe(1);
  });
});

import { cpuBusy, judgePlacement, logPlacement } from "../src/core/placement";
import { npuCounterProblem, parseNpuCounters } from "../src/core/perf";

describe("NPU or CPU", () => {
  const base = { asked: "npu" as const, sizeGB: 4, logHint: null, npuMemDeltaGB: null, npuUtilPeak: null, cpuBusyPct: null };
  it("says NPU when the NPU works and the CPU does not", () => {
    expect(judgePlacement({ ...base, npuUtilPeak: 60, npuMemDeltaGB: 3.9, cpuBusyPct: 12 }).runsOn).toBe("npu");
  });
  it("says CPU when the CPU is saturated and the NPU idle, even if it was asked to use the NPU", () => {
    const p = judgePlacement({ ...base, npuUtilPeak: 0, npuMemDeltaGB: 0, cpuBusyPct: 85 });
    expect(p.runsOn).toBe("cpu");
    expect(p.evidence.join(" ")).toMatch(/85% busy/);
  });
  it("says mixed when both work hard", () => {
    expect(judgePlacement({ ...base, npuUtilPeak: 40, npuMemDeltaGB: 2, cpuBusyPct: 80 }).runsOn).toBe("mixed");
  });
  it("without NPU counters it relies on the CPU and the log, and admits it when it cannot tell", () => {
    expect(judgePlacement({ ...base, cpuBusyPct: 90 }).runsOn).toBe("cpu");
    expect(judgePlacement({ ...base, cpuBusyPct: 10, logHint: "npu" }).runsOn).toBe("npu");
    const u = judgePlacement({ ...base, cpuBusyPct: 10 });
    expect(u.runsOn).toBe("unknown");
    expect(u.evidence.join(" ")).toMatch(/no NPU counters/);
  });
  it("a server started with --compute cpu is on the CPU", () => {
    expect(judgePlacement({ ...base, asked: "cpu", cpuBusyPct: 70 }).runsOn).toBe("cpu");
  });
  it("reads the server log and the CPU times", () => {
    expect(logPlacement(["ggml-hex: HTP0 started", "loaded"])).toBe("npu");
    expect(logPlacement(["falling back to CPU"])).toBe("cpu");
    expect(logPlacement(["hello"])).toBeNull();
    const t = (idle: number, user: number) => ({ times: { idle, user } });
    expect(cpuBusy([t(0, 0), t(0, 0)], [t(50, 50), t(100, 0)])).toBe(25);
  });
});

describe("NPU counters on a localized Windows", () => {
  const out = (set: string, memSet: string, shared: string, dedicated: string) => JSON.stringify({
    sets: [set, memSet],
    samples: [
      { p: `\\\\PC\\${set}(pid_4242_luid_0x0_0x1_phys_0_eng_0_engtype_Compute)\\Utilisation`, v: 35.4 },
      { p: `\\\\PC\\${set}(pid_999_luid_0x0_0x1_phys_0_eng_0_engtype_Compute)\\Utilisation`, v: 2 },
      { p: `\\\\PC\\${memSet}(luid_0x0_0x1_phys_0)\\${shared}`, v: 3 * 1024 ** 3 },
      { p: `\\\\PC\\${memSet}(luid_0x0_0x1_phys_0)\\${dedicated}`, v: 0.5 * 1024 ** 3 },
      { p: `\\\\PC\\${memSet}(luid_0x0_0x1_phys_0)\\Total committed`, v: 99 * 1024 ** 3 }
    ]
  });
  it("finds utilization and memory by words, in French and English", () => {
    const fr = parseNpuCounters(out("Moteur NPU", "Mémoire de l'adaptateur NPU", "Utilisation partagée", "Utilisation dédiée"));
    expect(fr.util).toBe(37);
    expect(fr.pidUtil[4242]).toBeCloseTo(35.4);
    expect(fr.memBytes).toBe(3.5 * 1024 ** 3);
    const en = parseNpuCounters(out("NPU Engine", "NPU Adapter Memory", "Shared Usage", "Dedicated Usage"));
    expect(en.util).toBe(37);
    expect(en.memBytes).toBe(3.5 * 1024 ** 3);
    expect(npuCounterProblem(en)).toBeNull();
  });
  it("says why nothing is read", () => {
    expect(npuCounterProblem(parseNpuCounters('{"sets":[],"samples":[]}'))).toMatch(/no performance counters/);
    expect(npuCounterProblem(parseNpuCounters("garbage"))).toMatch(/no performance counters/);
    expect(npuCounterProblem(parseNpuCounters('{"sets":["NPU Engine"],"samples":[]}'))).toMatch(/no values/);
  });
});

import { CANDIDATES, estimateRun, testCosts, testsFor } from "../src/core/bench";

describe("express mode and the specialists", () => {
  it("express is short, touches every big area, and is much cheaper than quick", () => {
    const ex = testsFor("express");
    expect(ex.length).toBeLessThan(testsFor("quick").length / 1.5);
    expect(ex.every((t) => t.maxTokens <= 450 && !t.minContext)).toBe(true);
    const groups = new Set(ex.map((t) => BENCH_SECTIONS.find((s) => s.id === t.section)!.group));
    expect([...groups].sort()).toEqual(["Assistant", "Code", "Knowledge", "Languages", "Orders", "Thinking", "Writing"]);
    const roster = [{ sizeGB: 2.4 }, { sizeGB: 4.8 }, { sizeGB: 0.7 }];
    expect(estimateRun(roster, "express", testCosts("express")).inferenceMin * 2).toBeLessThan(estimateRun(roster, "quick", testCosts("quick")).inferenceMin);
    expect(estimateRun(roster, "quick", testCosts("quick")).inferenceMin).toBeLessThan(estimateRun(roster, "full", testCosts("full")).inferenceMin);
    expect(estimateRun([{ sizeGB: 4, installed: true }], "express", testCosts("express")).downloadGB).toBe(0);
  });

  it("the specialists are real, small, distinct, and add to the default list", () => {
    expect(CANDIDATES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(CANDIDATES.map((c) => `${c.repo}:${c.quant}`.toLowerCase())).size).toBe(CANDIDATES.length);
    for (const c of CANDIDATES) {
      expect(c.sizeGB, c.name).toBeLessThanOrEqual(7);
      expect(["Q4_0", "Q8_0"], c.name).toContain(c.quant);
      expect(c.specialty.length, c.name).toBeGreaterThan(10);
      if (c.quant === "Q8_0") expect(c.paramsB ?? 99, `${c.name} is Q8_0 so it must be small`).toBeLessThanOrEqual(3.5);
    }
    const roster = buildRoster(DYNAMIC_DATA, CATALOG, 7);
    const spec = roster.filter((t) => t.source === "Specialists");
    expect(spec.length).toBeLessThanOrEqual(CANDIDATES.length); // a specialist the packs adopted is listed once, as a pack model
    expect(spec.length).toBeGreaterThan(CANDIDATES.length - 6);
    expect(roster.length).toBeGreaterThan(80);
    expect(new Set(roster.map((t) => t.key)).size).toBe(roster.length);
    expect(buildRoster(DYNAMIC_DATA, CATALOG, 7, 9.5, []).some((t) => t.source === "Specialists")).toBe(false);
    // a specialist is never a second copy of a model the packs already hold
    const packRepos = new Set(roster.filter((t) => t.source.startsWith("Dynamic")).map((t) => `${t.repo}:${t.quant}`.toLowerCase()));
    expect(spec.some((t) => packRepos.has(`${t.repo}:${t.quant}`.toLowerCase()))).toBe(false);
  });
});

describe("the NPU among the GPU counters", () => {
  // what a Snapdragon laptop without NPU counter sets gives: the NPU's adapter, found by the script, in the GPU sets
  const npu = "luid_0x00000000_0x0000d4f1";
  const out = JSON.stringify({
    sets: ["GPU Engine", "GPU Adapter Memory", "GPU Process Memory"],
    adapter: "compute-only adapter",
    adapters: ["Qualcomm(R) Adreno(TM) X1-85 GPU luid_0x00000000_0x0000a1b2", `Snapdragon(R) X Elite - Qualcomm(R) Hexagon(TM) NPU ${npu}`],
    samples: [
      { p: `\\\\PC\\GPU Engine(pid_5150_${npu}_phys_0_eng_0_engtype_Compute)\\Utilization Percentage`, v: 61.2 },
      { p: `\\\\PC\\GPU Engine(pid_1_${npu}_phys_0_eng_0_engtype_Compute)\\Utilization Percentage`, v: 0 },
      { p: `\\\\PC\\GPU Adapter Memory(${npu}_phys_0)\\Dedicated Usage`, v: 0 },
      { p: `\\\\PC\\GPU Adapter Memory(${npu}_phys_0)\\Shared Usage`, v: 3.4 * 1024 ** 3 },
      { p: `\\\\PC\\GPU Process Memory(pid_5150_${npu}_phys_0)\\Shared Usage`, v: 3.4 * 1024 ** 3 }
    ]
  });
  it("reads load and memory of the NPU adapter, and the part that belongs to the model server", () => {
    const r = parseNpuCounters(out);
    expect(r.util).toBe(61);
    expect(r.memBytes).toBe(3.4 * 1024 ** 3); // the adapter's own figure, not summed with the per-process one
    expect(r.pidUtil[5150]).toBeCloseTo(61.2);
    expect(r.pidMem[5150]).toBe(3.4 * 1024 ** 3);
    expect(r.adapter).toBe("compute-only adapter");
    expect(r.adapters).toHaveLength(2);
    expect(npuCounterProblem(r)).toBeNull();
  });
});

import { windowsHasNpuMonitoring } from "../src/core/perf";
describe("Windows builds with NPU monitoring", () => {
  it("knows the first builds of each line that Microsoft lists", () => {
    expect(windowsHasNpuMonitoring("26100.4061")).toBe(false);
    expect(windowsHasNpuMonitoring("26100.8524")).toBe(true);
    expect(windowsHasNpuMonitoring("26200.9000")).toBe(true);
    expect(windowsHasNpuMonitoring("28000.2339")).toBe(false);
    expect(windowsHasNpuMonitoring("22631.4000")).toBeNull();
    expect(windowsHasNpuMonitoring(null)).toBeNull();
  });
});

describe("NPU load is the busiest engine, as in Task Manager", () => {
  const npu = "luid_0x00000000_0x0000d4f1";
  const row = (pid: number, eng: number, v: number) => ({ p: `\\\\PC\\GPU Engine(pid_${pid}_${npu}_phys_0_eng_${eng}_engtype_Compute)\\Utilization Percentage`, v });
  it("does not add up many engines or processes into a false 100%", () => {
    const samples = [0, 1, 2, 3, 4, 5].flatMap((eng) => [10, 20, 30, 40].map((pid) => row(pid, eng, 5))); // 24 instances at 5%
    const r = parseNpuCounters(JSON.stringify({ sets: ["GPU Engine"], samples }));
    expect(r.util).toBe(20); // one engine, four processes at 5% each
    expect(r.topUtil?.length).toBe(6);
  });
  it("ignores a nonsense value above 100 (not a load) and reads an idle NPU as 0", () => {
    expect(parseNpuCounters(JSON.stringify({ sets: ["GPU Engine"], samples: [row(1, 0, 4e9)] })).util).toBe(0);
    expect(parseNpuCounters(JSON.stringify({ sets: ["GPU Engine"], samples: [row(1, 0, 0), row(2, 0, 0)] })).util).toBe(0);
  });
});


import { buildExport, driftPct } from "../src/core/benchExport";
import { computeStats } from "../src/core/benchStats";
import { MOCK_TAGS, mockResults } from "../src/renderer/mockBench";

describe("the report to publish", () => {
  const rs = mockResults();
  const files = buildExport(rs, { startedAt: "2026-10-25 0100", mode: "express", machine: [["Chip", "Snapdragon X Plus"]], tags: MOCK_TAGS, warmup: { minutes: 10, model: "Qwen3-8B", series: [{ t: 1, tps: 7.8 }, { t: 5, tps: 7.4 }, { t: 9, tps: 7.1 }], startTps: 7.2, endTps: 6.4 } });
  it("writes every file, with no hole in the text", () => {
    expect(Object.keys(files).sort()).toEqual(expect.arrayContaining(["report.md", "report.html", "results.csv", "stats.json", "charts/leaderboard.svg", "charts/placement.svg", "charts/heatmap.svg", "charts/quality-vs-speed.svg", "charts/quality-vs-size.svg", "charts/speed-vs-size.svg", "charts/sections.svg", "charts/warmup.svg"]));
    for (const [name, text] of Object.entries(files)) {
      expect(text, name).not.toMatch(/undefined|NaN|\[object/);
      if (name.endsWith(".svg")) { expect(text.startsWith("<svg"), name).toBe(true); expect(text.trim().endsWith("</svg>"), name).toBe(true); expect(text, name).toMatch(/<title>/); }
    }
  });
  it("says what share ran on the NPU, with the numbers behind it", () => {
    const st = computeStats(rs, MOCK_TAGS);
    expect(st.placement.total).toBe(12);
    expect(st.placement.npu + st.placement.cpu + st.placement.mixed + st.placement.unknown).toBe(12);
    expect(files["report.md"]).toMatch(new RegExp(`\\*\\*${Math.round((st.placement.npu / 12) * 100)}% of the models ran on the NPU\\*\\*`));
    expect(files["charts/placement.svg"]).toMatch(/NPU/);
    expect(st.placementBySize.reduce((a, x) => a + x.total, 0)).toBe(12);
  });
  it("judges the specialists against the field, and the drift of the NPU", () => {
    const st = computeStats(rs, MOCK_TAGS);
    expect(st.specialists.map((x) => x.name)).toEqual(expect.arrayContaining(["TranslateGemma-4B-it", "xLAM-2-3B-fc-r"]));
    for (const x of st.specialists) { expect(x.rank).toBeGreaterThanOrEqual(1); expect(x.rank).toBeLessThanOrEqual(x.of); }
    expect(driftPct({ minutes: 10, model: "m", series: [], startTps: 10, endTps: 8 })).toBe(-20);
    expect(files["report.md"]).toMatch(/20|11\.1% slower|-11\.1%/);
    expect(driftPct(null)).toBeNull();
  });
  it("puts a CSV header and one row per model", () => {
    const lines = files["results.csv"].trim().split("\n");
    expect(lines).toHaveLength(13);
    expect(lines[0]).toMatch(/^model,status,reason,source,size_gb/);
  });
});

describe("serverReason", () => {
  it("starts at the last panic, and otherwise drops the usual chatter of the latest start", async () => {
    const { serverReason } = await import("../src/core/benchRunner");
    expect(serverReason(["old", "panic: nil map", "goroutine 1", "gin.go:689"])).toEqual(["panic: nil map", "goroutine 1", "gin.go:689"]);
    const quiet = serverReason(["[33mwinget install --id=ChrisBagwell.SoX[0m", "Local hosting on http://127.0.0.1:18181/", '[GIN] 200 | GET "/v1/models"', "Failed to create QAIRT LLM pipeline", '[GIN] 500 | POST "/v1/chat/completions"']);
    expect(quiet).toEqual(["Failed to create QAIRT LLM pipeline", '[GIN] 500 | POST "/v1/chat/completions"']);
  });
});
