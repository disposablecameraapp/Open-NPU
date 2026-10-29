import { describe, expect, it } from "vitest";
import { LAB_EXAMPLE, cellOf, formatMatch, labReport, modelMean, optionsFor, parseCheck, parseLabFile, runCheck, scoreAnswer, wordOverlap } from "../src/core/promptLab";
import { LabRunner, type LabDeps, type LabState } from "../src/core/labRunner";

describe("reading a file of prompts", () => {
  it("reads the example the page offers: its options, its prompts, their checks and their ideals", () => {
    const f = parseLabFile(LAB_EXAMPLE);
    expect(f.problems).toEqual([]);
    expect(f.title).toBe("Planning a small program");
    expect(f.options).toMatchObject({ runs: 2, maxTokens: 700, thinking: "off", system: "You are the lead of a small team. You plan, you never write code." });
    expect(f.prompts.map((p) => p.name)).toEqual(["plan-counter", "plan-todo"]);
    const [a, b] = f.prompts;
    expect(a.prompt).toContain("never above 10");
    expect(a.prompt).not.toContain("Ideal");
    expect(a.ideal.split("\n")).toHaveLength(3);
    expect(a.checks).toHaveLength(3);
    expect(b.options).toEqual({ maxTokens: 500 });
    expect(optionsFor(f, b)).toMatchObject({ runs: 2, maxTokens: 500 });
  });

  it("does not take a heading inside a code fence for a new prompt, and unwraps a fenced ideal", () => {
    const f = parseLabFile("## one\n\nWrite this:\n```\n## not a prompt\n```\n\n### Ideal\n\n```\nthe answer\n```\n");
    expect(f.prompts).toHaveLength(1);
    expect(f.prompts[0].prompt).toContain("## not a prompt");
    expect(f.prompts[0].ideal).toBe("the answer");
  });

  it("never throws: it reports what it could not read and goes on with the rest", () => {
    const f = parseLabFile("---\nruns: many\nflavour: x\n---\n## a\ntext\n### Checks\n- regex: (\n- lines: x\n## a\ntext 2\n## empty\n");
    expect(f.prompts.map((p) => p.name)).toEqual(["a", "a (2)"]);
    expect(f.problems.join("\n")).toMatch(/unknown option "flavour"/);
    expect(f.problems.join("\n")).toMatch(/regex .* is not valid/);
    expect(f.problems.join("\n")).toMatch(/must be like 4-10/);
    expect(f.problems.join("\n")).toMatch(/no "### Ideal"/);
    expect(f.problems.join("\n")).toMatch(/has no prompt text/);
    expect(parseLabFile("nothing here").problems[0]).toMatch(/No prompt was found/);
  });

  it("keeps the options inside their limits", () => {
    const f = parseLabFile("---\nruns: 99\nmax_tokens: 5\nthinking: on\ntemperature: 0.3\n---\n## a\nx\n");
    expect(f.options).toMatchObject({ runs: 10, maxTokens: 16, thinking: "on", temperature: 0.3 });
  });

  it("reads each kind of check", () => {
    expect(parseCheck("- contains: block")).toEqual({ kind: "contains", text: "block" });
    expect(parseCheck("lines: 4-10")).toEqual({ kind: "lines", min: 4, max: 10 });
    expect(parseCheck("lines: 5")).toEqual({ kind: "lines", min: 5, max: 5 });
    expect(parseCheck("max_chars: 300")).toEqual({ kind: "maxChars", n: 300 });
    expect(parseCheck("json")).toEqual({ kind: "json" });
    expect(typeof parseCheck("whatever")).toBe("string");
  });
});

describe("scoring an answer against the ideal", () => {
  const ideal = "state | the count | nothing\nupdate | adds one | state\ndraw | shows it | state";
  it("an answer equal to the ideal scores 100, an empty or unrelated one near 0", () => {
    expect(scoreAnswer(ideal, { ideal, checks: [] }).total).toBe(100);
    expect(scoreAnswer("", { ideal, checks: [] }).total).toBe(0);
    expect(scoreAnswer("completely different text about cooking pasta", { ideal, checks: [] }).total).toBeLessThan(25);
  });

  it("the words, the form of the lines and the length each count", () => {
    expect(wordOverlap("a counter that adds one", "the counter adds one")).toBeGreaterThan(0.6);
    expect(formatMatch("a | b | c\nx | y", "a | b | c")).toBe(0.5);
    expect(formatMatch("no bars here", "a | b | c")).toBe(0);
    const close = scoreAnswer("state | the count | nothing\nupdate | adds one | state\ndraw | shows it | state\nextra | more | draw", { ideal, checks: [] }).total;
    const prose = scoreAnswer("The state holds the count. The update adds one. The draw shows it.", { ideal, checks: [] }).total;
    expect(close).toBeGreaterThan(prose);
  });

  it("the checks are 40 % of the total when the prompt has some", () => {
    const checks = [{ kind: "lines" as const, min: 3, max: 3 }, { kind: "contains" as const, text: "zzz" }];
    const s = scoreAnswer(ideal, { ideal, checks });
    expect(s.checks.map((c) => c.ok)).toEqual([true, false]);
    expect(s.total).toBe(80); // 60 % of 100 + 40 % of 50 %
    expect(scoreAnswer("x", { ideal: "", checks: [{ kind: "contains", text: "x" }] }).total).toBe(100);
  });

  it("each check says what it asked", () => {
    expect(runCheck({ kind: "not", text: "```" }, "no fence").ok).toBe(true);
    expect(runCheck({ kind: "regex", pattern: "^block \\|" }, "block | x").ok).toBe(true);
    expect(runCheck({ kind: "json" }, '{"a":1}').ok).toBe(true);
    expect(runCheck({ kind: "json" }, "{a").ok).toBe(false);
    expect(runCheck({ kind: "maxChars", n: 3 }, "abcd").check).toMatch(/at most 3.*has 4/);
  });
});

describe("the results", () => {
  const f = parseLabFile("---\nruns: 2\n---\n## p\nask\n### Ideal\nfoo bar baz\n");
  const run = (model: string, n: number, answer: string, seconds = 5, error?: string) => ({ prompt: "p", model, run: n, answer, seconds, tokens: 10, score: scoreAnswer(answer, f.prompts[0]), ...(error ? { error } : {}) });
  it("the best run of a cell counts, the quicker one when two are equal, a failed run never", () => {
    const runs = [run("m", 1, "foo"), run("m", 2, "foo bar baz", 9), run("m", 3, "foo bar baz", 4), run("m", 4, "", 0, "timeout")];
    const c = cellOf(runs, "p", "m");
    expect(c.best?.run).toBe(3);
    expect(c.runs).toBe(4);
    expect(c.failed).toBe(1);
    expect(modelMean(runs, ["p"], "m")).toBe(100);
    expect(cellOf([], "p", "m").best).toBeNull();
  });

  it("the report has the table and, for each prompt and model, the best answer next to the ideal", () => {
    const md = labReport(f, [run("small", 1, "foo bar baz", 3), run("big", 1, "foo", 8)], ["small", "big"], "2026-01-01");
    expect(md).toContain("| prompt | small | big |");
    expect(md).toMatch(/\| p \| 100 \(3 s\) \| /);
    expect(md).toContain("**mean**");
    expect(md).toContain("Ideal answer:");
    expect(md).toContain("### small");
  });
});

describe("running a series", () => {
  const f = parseLabFile("---\nruns: 2\n---\n## a\nfirst\n### Ideal\nfoo bar\n## b\nsecond\n### Ideal\nbaz qux\n");
  const make = (ask: LabDeps["ask"], prepare: LabDeps["prepare"] = async () => undefined) => {
    const states: LabState[] = [];
    const r = new LabRunner({ prepare, ask, emit: (s) => states.push(s) });
    const finished = () => new Promise<LabState>((res) => { const t = setInterval(() => { if (!r.running) { clearInterval(t); res(r.state()); } }, 5); });
    return { r, states, finished };
  };

  it("asks every prompt of every model, as many times as asked, one model at a time", async () => {
    const order: string[] = [];
    const { r, finished } = make(async (m, _sys, prompt) => { order.push(`${m.name}:${prompt}`); return { answer: prompt === "first" ? "foo bar" : "baz qux", seconds: 1, tokens: 4 }; });
    expect(r.start(f, [{ id: "1", name: "A" }, { id: "2", name: "B" }]).ok).toBe(true);
    const s = await finished();
    expect(order).toEqual(["A:first", "A:first", "A:second", "A:second", "B:first", "B:first", "B:second", "B:second"]);
    expect(s.runs).toHaveLength(8);
    expect(s.done).toBe(s.total);
    expect(s.runs.every((x) => x.score.total === 100)).toBe(true);
    expect(s.phase).toBe("done");
  });

  it("a model that cannot be loaded is reported and the others go on; a failed answer does not stop the run", async () => {
    let n = 0;
    const { r, finished } = make(
      async () => { if (++n === 1) throw new Error("boom"); return { answer: "foo bar", seconds: 1, tokens: 1 }; },
      async (m) => { if (m.name === "bad") throw new Error("no memory"); }
    );
    r.start(f, [{ id: "1", name: "bad" }, { id: "2", name: "good" }]);
    const s = await finished();
    expect(s.failed).toEqual([{ model: "bad", error: "no memory" }]);
    expect(s.runs.filter((x) => x.error)).toHaveLength(1);
    expect(s.runs).toHaveLength(4);
    expect(s.done).toBe(s.total);
  });

  it("refuses a second run, an empty file and no model; stopping ends it", async () => {
    const { r, finished } = make(() => new Promise((_res, rej) => setTimeout(() => rej(new Error("late")), 50)));
    expect(r.start(parseLabFile("nothing"), [{ id: "1", name: "A" }]).ok).toBe(false);
    expect(r.start(f, []).ok).toBe(false);
    r.start(f, [{ id: "1", name: "A" }]);
    expect(r.start(f, [{ id: "1", name: "A" }]).ok).toBe(false);
    r.stop();
    const s = await finished();
    expect(s.stopped).toBe(true);
    expect(s.phase).toBe("stopped");
  });
});

describe("the ready series of planning prompts", () => {
  it("is a valid file: every prompt has an ideal, and every ideal passes its own checks", async () => {
    const { LAB_PLAN_TESTS } = await import("../src/core/promptLabPlans");
    const f = parseLabFile(LAB_PLAN_TESTS);
    expect(f.problems).toEqual([]);
    expect(f.prompts.map((p) => p.name)).toEqual(["A roles (small request)", "B core and features (small request)", "C1 list what exists", "C2 group into blocks", "D questions one at a time", "A-big roles (much bigger request)", "B-big core and features (much bigger request)"]);
    for (const p of f.prompts) {
      expect(p.ideal.length, p.name).toBeGreaterThan(50);
      const s = scoreAnswer(p.ideal, p);
      expect(s.checks.filter((c) => !c.ok).map((c) => c.check), p.name).toEqual([]);
      expect(s.total, p.name).toBe(100);
    }
    expect(f.prompts[5].prompt).toContain("5 levels");
    expect(f.prompts[0].prompt).not.toContain("5 levels");
  });
});

describe("the file of the ready series in docs", () => {
  it("is the same text as the one the page loads", async () => {
    const { readFileSync } = await import("node:fs");
    const { LAB_PLAN_TESTS } = await import("../src/core/promptLabPlans");
    expect(readFileSync("docs/prompt-lab-planning.md", "utf8").replace(/\r\n/g, "\n")).toBe(LAB_PLAN_TESTS);
  });
});

describe("round 2 of the planning prompts", () => {
  it("is a valid file whose ideals pass their own checks, and the file in docs is the same text", async () => {
    const { readFileSync } = await import("node:fs");
    const { LAB_PLAN_TESTS_2 } = await import("../src/core/promptLabPlans2");
    const f = parseLabFile(LAB_PLAN_TESTS_2);
    expect(f.problems).toEqual([]);
    expect(f.prompts).toHaveLength(7);
    expect(f.options.runs).toBe(3);
    for (const p of f.prompts) {
      const s = scoreAnswer(p.ideal, p);
      expect(s.checks.filter((c) => !c.ok).map((c) => c.check), p.name).toEqual([]);
      expect(s.total, p.name).toBe(100);
    }
    expect(f.prompts[1].prompt).toContain("to-do list");
    expect(f.prompts[0].prompt).not.toContain("to-do list");
    expect(readFileSync("docs/prompt-lab-planning-2.md", "utf8").replace(/\r\n/g, "\n")).toBe(LAB_PLAN_TESTS_2);
  });
});

describe("the last round of the planning prompts", () => {
  it("is a valid file whose ideals pass their own checks, and the file in docs is the same text", async () => {
    const { readFileSync } = await import("node:fs");
    const { LAB_PLAN_TESTS_3 } = await import("../src/core/promptLabPlans3");
    const f = parseLabFile(LAB_PLAN_TESTS_3);
    expect(f.problems).toEqual([]);
    expect(f.prompts).toHaveLength(6);
    for (const p of f.prompts) {
      const s = scoreAnswer(p.ideal, p);
      expect(s.checks.filter((c) => !c.ok).map((c) => c.check), p.name).toEqual([]);
      expect(s.total, p.name).toBe(100);
    }
    expect(f.prompts[0].prompt).not.toContain("ONE feature that holds a small table of them, never");
    expect(f.prompts[1].prompt).toContain("never one feature per member");
    expect(readFileSync("docs/prompt-lab-planning-3.md", "utf8").replace(/\r\n/g, "\n")).toBe(LAB_PLAN_TESTS_3);
  });
});

describe("the unit writers series, judged by running the code", () => {
  it("is a valid file, every ideal passes every one of its own checks, and the file in docs is the same text", async () => {
    const { readFileSync } = await import("node:fs");
    const { LAB_UNIT_TESTS } = await import("../src/core/promptLabUnits");
    const { codeChecks } = await import("../src/core/labCode");
    const f = parseLabFile(LAB_UNIT_TESTS);
    expect(f.problems).toEqual([]);
    expect(f.prompts).toHaveLength(9);
    for (const p of f.prompts) {
      const s = scoreAnswer(p.ideal, p, await codeChecks(p.ideal, p.checks));
      expect(s.checks.filter((c) => !c.ok).map((c) => c.check), p.name).toEqual([]);
      expect(s.total, p.name).toBe(100);
      expect(p.options.system, p.name).toContain("You write one unit");
    }
    expect(readFileSync("docs/prompt-lab-units.md", "utf8").replace(/\r\n/g, "\n")).toBe(LAB_UNIT_TESTS);
  });

  it("fails code that does not work, whatever it looks like", async () => {
    const { codeChecks } = await import("../src/core/labCode");
    const f = parseLabFile(`## t\n\nwrite add\n\n### Checks\n\n- loads\n- run: add(1, 2) => 3\n- run: add(2, 2) => 4\n\n### Ideal\n\n\`\`\`\nfunction add(a, b) { return a + b; }\n\`\`\`\n`);
    const p = f.prompts[0];
    const bad = "```js\nfunction add(a, b) { return a - b; }\n```";
    const s = scoreAnswer(bad, p, await codeChecks(bad, p.checks));
    expect(s.checks.map((c) => c.ok)).toEqual([true, false, false]);
    const broken = scoreAnswer("function add(a, b) { return", p, await codeChecks("function add(a, b) { return", p.checks));
    expect(broken.checks.every((c) => !c.ok)).toBe(true);
    const loop = "function add(a, b) { while (true) {} }";
    expect((await codeChecks(loop, p.checks)).size).toBe(3);
  }, 15000);
});

describe("the big unit series (ten ways, five programs)", () => {
  it("is a valid file of 190 prompts, every ideal passes its own checks, and the file in docs is the same text", async () => {
    const { readFileSync } = await import("node:fs");
    const { LAB_UNIT_TESTS_2 } = await import("../src/core/promptLabUnits2");
    const { codeChecks } = await import("../src/core/labCode");
    const f = parseLabFile(LAB_UNIT_TESTS_2);
    expect(f.problems).toEqual([]);
    expect(f.prompts).toHaveLength(190);
    const done = new Set<string>();
    for (const p of f.prompts) {
      const key = p.ideal + JSON.stringify(p.checks);
      if (done.has(key)) continue;
      done.add(key);
      const s = scoreAnswer(p.ideal, p, await codeChecks(p.ideal, p.checks));
      expect(s.checks.filter((c) => !c.ok).map((c) => c.check), p.name).toEqual([]);
    }
    expect(done.size).toBe(19);
    expect(readFileSync("docs/prompt-lab-units-2.md", "utf8").replace(/\r\n/g, "\n")).toBe(LAB_UNIT_TESTS_2);
  }, 30000);
});

describe("the short round of the unit writers", () => {
  it("is 60 prompts of ten units in six ways, every ideal passes its checks, and the file in docs is the same text", async () => {
    const { readFileSync } = await import("node:fs");
    const { LAB_UNIT_TESTS_QUICK } = await import("../src/core/promptLabUnits2");
    const { codeChecks } = await import("../src/core/labCode");
    const f = parseLabFile(LAB_UNIT_TESTS_QUICK);
    expect(f.problems).toEqual([]);
    expect(f.prompts).toHaveLength(60);
    expect(f.prompts.every((p) => (p.options.system ?? "").includes("You write one unit"))).toBe(true);
    const seen = new Set<string>();
    for (const p of f.prompts) {
      const key = p.ideal + JSON.stringify(p.checks);
      if (seen.has(key)) continue;
      seen.add(key);
      const s = scoreAnswer(p.ideal, p, await codeChecks(p.ideal, p.checks));
      expect(s.checks.filter((c) => !c.ok).map((c) => c.check), p.name).toEqual([]);
    }
    expect(readFileSync("docs/prompt-lab-units-quick.md", "utf8").replace(/\r\n/g, "\n")).toBe(LAB_UNIT_TESTS_QUICK);
  }, 30000);
});

describe("the series on a sheet for an accounting exercise", () => {
  it("is readable: fifteen prompts, each with an ideal and checks, nothing the page would refuse", async () => {
    const { readFileSync } = await import("node:fs");
    const f = parseLabFile(readFileSync("docs/prompt-lab-sheets.md", "utf8").replace(/\r\n/g, "\n"));
    expect(f.problems).toEqual([]);
    expect(f.prompts).toHaveLength(15);
    for (const p of f.prompts) { expect(p.ideal).toBeTruthy(); expect(p.checks.length).toBeGreaterThan(4); expect(p.prompt).toContain("exel"); }
  });
});

describe("the series in steps, for the same exercise", () => {
  it("is readable, and its ideal sheets calculate to the right answers", async () => {
    const { readFileSync } = await import("node:fs");
    const { parseSheets, Workbook } = await import("../src/core/sheet");
    const f = parseLabFile(readFileSync("docs/prompt-lab-sheets-steps.md", "utf8").replace(/\r\n/g, "\n"));
    expect(f.problems).toEqual([]);
    expect(f.prompts).toHaveLength(13);
    for (const p of f.prompts) { expect(scoreAnswer(p.ideal, p).total).toBeGreaterThanOrEqual(99); }
    for (const name of ["e2 écrire la feuille avec les noms de lignes", "e3 écrire la feuille avec les adresses"]) {
      const sheets = parseSheets(f.prompts.find((p) => p.name === name)!.ideal);
      const wb = new Workbook(sheets);
      const at = (label: string) => wb.cell("Calculs", sheets[0].rows.findIndex((r) => r[0] === label), 1);
      expect(at("Coût de production")).toBe(715000);
      expect(Math.round(Number(at("Valeur retenue du stock final")))).toBe(285613);
    }
  });
});

describe("the series with a closed JSON plan, for the same exercise", () => {
  it("is readable, and every ideal passes its own code checks", async () => {
    const { readFileSync } = await import("node:fs");
    const { codeChecks } = await import("../src/core/labCode");
    const f = parseLabFile(readFileSync("docs/prompt-lab-sheets-json.md", "utf8").replace(/\r\n/g, "\n"));
    expect(f.problems).toEqual([]);
    expect(f.prompts).toHaveLength(13);
    for (const p of f.prompts) {
      const ran = await codeChecks(p.ideal, p.checks);
      expect([...ran.values()].filter((v) => v !== null), p.name).toEqual([]);
      expect(scoreAnswer(p.ideal, p, ran).total, p.name).toBeGreaterThanOrEqual(99);
    }
    // a wrong plan is caught by the numbers, not by how it looks
    const first = f.prompts[0];
    const wrong = first.ideal.replace('"op": "min"', '"op": "max"');
    const ran = await codeChecks(wrong, first.checks);
    expect([...ran.values()].some((v) => v !== null)).toBe(true);
  });
});

describe("the router's questions on hard requests", () => {
  it("asks the very questions of the app, and a right word scores full", async () => {
    const { readFileSync } = await import("node:fs");
    const { Q, yesNoPrompt, FILE_CHOICES, choicePrompt } = await import("../src/core/router");
    const f = parseLabFile(readFileSync("docs/prompt-lab-router.md", "utf8").replace(/\r\n/g, "\n"));
    expect(f.problems).toEqual([]);
    expect(f.prompts.length).toBeGreaterThanOrEqual(80);
    const one = f.prompts.find((p) => p.name.startsWith("web-01"))!;
    expect(one.prompt).toBe(yesNoPrompt("do some research on american healthcare", Q.web).user);
    const file = f.prompts.find((p) => p.name.startsWith("file-01"))!;
    expect(file.prompt).toBe(choicePrompt("fais un journal de comptabilité vide que je peux utiliser dans exel", Q.file, FILE_CHOICES).user);
    // the right word is the check: no ideal text, the score is the check alone
    for (const p of f.prompts) {
      const right = /^- starts: (\w+)/m.exec(readFileSync("docs/prompt-lab-router.md", "utf8").split(`## ${p.name}`)[1] ?? "")![1];
      expect(scoreAnswer(right, p).total, p.name).toBe(100);
      expect(scoreAnswer(right === "yes" ? "no" : "yes", p).total, p.name).toBe(0);
    }
  });
});
