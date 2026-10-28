/**
 * The prompt lab (Developer settings): a series of prompts written in one Markdown file, each with the ideal answer at its end, asked of
 * the models that are picked, and every answer scored against the ideal. Nothing here talks to a model: the file is read here, the
 * answers are scored here, and the report is written here, so the whole of it can be tested.
 *
 * The file format, in full, is described in `docs/prompt-lab.md` and shown by `LAB_EXAMPLE`.
 */

export interface LabOptions {
  /** How many times each prompt is asked of each model: the best answer counts. */
  runs: number;
  /** The most tokens one answer may have. */
  maxTokens: number;
  /** Replaces the model's own temperature when set. */
  temperature?: number;
  /** "off" (default): the model does not think; "on": it may; "default": whatever the app does for that model. */
  thinking: "off" | "on" | "default";
  /** A system message sent before every prompt. */
  system?: string;
}

export type Check =
  | { kind: "contains" | "not" | "starts"; text: string }
  | { kind: "regex"; pattern: string }
  | { kind: "lines"; min: number; max: number }
  | { kind: "maxChars"; n: number }
  | { kind: "json" }
  /** The answer's code is run (see `labCode.ts`): it loads, or an expression gives the expected value. `given` is code run before the tests and is not itself a check. */
  | { kind: "loads" }
  | { kind: "run"; call: string; expect: string }
  | { kind: "given"; code: string };

export interface LabPrompt {
  /** The heading of its section. */
  name: string;
  /** What is sent to the model. */
  prompt: string;
  /** The answer that would be perfect. */
  ideal: string;
  checks: Check[];
  options: Partial<LabOptions>;
}

export interface LabFile {
  title: string;
  options: LabOptions;
  prompts: LabPrompt[];
  /** What was wrong with the file, one line each: the page shows them, the run still goes on with what could be read. */
  problems: string[];
}

export const DEFAULT_OPTIONS: LabOptions = { runs: 2, maxTokens: 1500, thinking: "off" };

const clampInt = (v: string, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/** `key: value` lines, as in the front matter and the Options section. Unknown keys are reported. */
function readOptions(lines: string[], into: Partial<LabOptions>, problems: string[], where: string) {
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^[-*]?\s*([a-z_ ]+?)\s*:\s*(.*)$/i.exec(line);
    if (!m) { problems.push(`${where}: "${line.slice(0, 60)}" is not "key: value"`); continue; }
    const key = m[1].toLowerCase().replace(/[ _]+/g, ""), val = m[2].trim();
    if (key === "runs") into.runs = clampInt(val, 1, 10, DEFAULT_OPTIONS.runs);
    else if (key === "maxtokens") into.maxTokens = clampInt(val, 16, 8000, DEFAULT_OPTIONS.maxTokens);
    else if (key === "temperature") { const t = Number(val); if (Number.isFinite(t) && t >= 0 && t <= 2) into.temperature = t; else problems.push(`${where}: temperature must be a number from 0 to 2`); }
    else if (key === "thinking") into.thinking = /^(on|yes|true)$/i.test(val) ? "on" : /^default$/i.test(val) ? "default" : "off";
    else if (key === "system") into.system = val;
    else if (key !== "title") problems.push(`${where}: unknown option "${m[1]}"`);
  }
}

/** One line of the Checks section: `contains: x`, `not: x`, `starts: x`, `regex: x`, `lines: 4-10`, `max_chars: 900`, `json`, `loads`, `given: code`, `run: expression => expected`. */
export function parseCheck(raw: string): Check | string {
  const line = raw.trim().replace(/^[-*]\s*/, "");
  if (/^json\s*(:\s*(valid|yes|true))?$/i.test(line)) return { kind: "json" };
  if (/^loads\s*(:\s*(yes|true))?$/i.test(line)) return { kind: "loads" };
  const m = /^([a-z_ ]+?)\s*:\s*(.+)$/i.exec(line);
  if (!m) return `"${line.slice(0, 60)}" is not a check`;
  const key = m[1].toLowerCase().replace(/[ _]+/g, ""), val = m[2].trim().replace(/^`(.*)`$/, "$1");
  if (key === "contains" || key === "not" || key === "starts") return { kind: key, text: val };
  if (key === "given") return { kind: "given", code: val };
  if (key === "run") {
    const at = val.lastIndexOf("=>");
    return at > 0 && val.slice(at + 2).trim() ? { kind: "run", call: val.slice(0, at).trim(), expect: val.slice(at + 2).trim() } : `"run: ${val.slice(0, 40)}" must be like "expression => expected"`;
  }
  if (key === "regex") { try { new RegExp(val, "m"); return { kind: "regex", pattern: val }; } catch { return `the regex "${val.slice(0, 60)}" is not valid`; } }
  if (key === "lines") {
    const r = /^(\d+)\s*(?:-|to|\.\.)\s*(\d+)$/.exec(val) ?? /^(\d+)$/.exec(val);
    if (!r) return `"lines: ${val.slice(0, 30)}" must be like 4-10`;
    return { kind: "lines", min: Number(r[1]), max: Number(r[2] ?? r[1]) };
  }
  if (key === "maxchars") { const n = Number(val); return Number.isFinite(n) && n > 0 ? { kind: "maxChars", n } : `"max_chars: ${val.slice(0, 20)}" must be a number`; }
  return `unknown check "${m[1]}"`;
}

/** A section's text without the fence that wraps all of it. */
const unfence = (s: string) => { const m = /^```[^\n]*\n([\s\S]*?)\n```\s*$/.exec(s.trim()); return (m ? m[1] : s).trim(); };

/** Reads the Markdown file of a series of prompts. Never throws: what cannot be read is reported in `problems`. */
export function parseLabFile(md: string): LabFile {
  const problems: string[] = [];
  const options: LabOptions = { ...DEFAULT_OPTIONS };
  let text = md.replace(/\r\n?/g, "\n");
  let title = "";
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    const own: Partial<LabOptions> = {};
    readOptions(fm[1].split("\n"), own, problems, "front matter");
    Object.assign(options, own);
    title = /^\s*title\s*:\s*(.+)$/im.exec(fm[1])?.[1].trim() ?? "";
    text = text.slice(fm[0].length);
  }
  // headings count only outside code fences: a prompt may contain a fenced example with its own "## " lines
  type Sec = { name: string; lines: string[] };
  const secs: Sec[] = [];
  let fence = false, cur: Sec | null = null;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) fence = !fence;
    const h2 = !fence ? /^##\s+(?!#)(.+?)\s*#*\s*$/.exec(line) : null;
    const h1 = !fence ? /^#\s+(?!#)(.+?)\s*$/.exec(line) : null;
    if (h1 && !cur && !title) { title = h1[1]; continue; }
    if (h2) { cur = { name: h2[1].replace(/^prompt\s*:\s*/i, "").trim(), lines: [] }; secs.push(cur); continue; }
    cur?.lines.push(line);
  }
  const seen = new Set<string>();
  const prompts: LabPrompt[] = [];
  for (const s of secs) {
    // the reserved sub-headings split a section; any other ### stays in the prompt
    const parts: Record<string, string[]> = { prompt: [] };
    let at = "prompt", inFence = false;
    for (const line of s.lines) {
      if (/^\s*```/.test(line)) inFence = !inFence;
      const m = !inFence ? /^###\s+(ideal|checks?|options?)\s*:?\s*$/i.exec(line) : null;
      if (m) { at = m[1].toLowerCase().replace(/s$/, ""); parts[at] = []; continue; }
      (parts[at] ??= []).push(line);
    }
    const prompt = parts.prompt.join("\n").trim();
    const ideal = unfence((parts.ideal ?? []).join("\n"));
    const where = `"${s.name}"`;
    if (!prompt) { problems.push(`${where} has no prompt text: left out`); continue; }
    if (!ideal) problems.push(`${where} has no "### Ideal" section: it is asked, but it cannot be scored against an ideal`);
    let name = s.name || `prompt ${prompts.length + 1}`;
    if (seen.has(name)) { let k = 2; while (seen.has(`${name} (${k})`)) k++; name = `${name} (${k})`; problems.push(`${where} is a name used twice: the second is called "${name}"`); }
    seen.add(name);
    const checks: Check[] = [];
    for (const raw of (parts.check ?? []).join("\n").split("\n")) {
      if (!raw.trim()) continue;
      const c = parseCheck(raw);
      if (typeof c === "string") problems.push(`${where}: ${c}`); else checks.push(c);
    }
    const own: Partial<LabOptions> = {};
    readOptions(parts.option ?? [], own, problems, where);
    prompts.push({ name, prompt, ideal, checks, options: own });
  }
  if (!prompts.length) problems.push("No prompt was found: each prompt starts with a line \"## name\".");
  return { title: title || "Prompt series", options, prompts, problems };
}

/** The options one prompt is asked with: the file's, then the prompt's own. */
export const optionsFor = (f: LabFile, p: LabPrompt): LabOptions => ({ ...f.options, ...p.options });

// ---------------------------------------------------------------------------------------------------------------- scoring

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "are", "was", "its", "has", "have", "not", "but", "you", "your", "will", "can", "all", "any", "each", "into", "out", "one", "per"]);
const words = (s: string) => (s.toLowerCase().match(/[a-z0-9àâçéèêëîïôûùüÿñæœ_]{3,}/g) ?? []).filter((w) => !STOP.has(w));

/** F1 of two bags of words: how much of the ideal's words the answer has, and how much of the answer's words the ideal has. */
export function wordOverlap(answer: string, ideal: string): number {
  const a = new Map<string, number>(), b = new Map<string, number>();
  for (const w of words(answer)) a.set(w, (a.get(w) ?? 0) + 1);
  for (const w of words(ideal)) b.set(w, (b.get(w) ?? 0) + 1);
  const na = [...a.values()].reduce((x, y) => x + y, 0), nb = [...b.values()].reduce((x, y) => x + y, 0);
  if (!na || !nb) return 0;
  let common = 0;
  for (const [w, n] of a) common += Math.min(n, b.get(w) ?? 0);
  const p = common / na, r = common / nb;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

const cells = (line: string) => line.split("|").length;
const shaped = (s: string) => s.split("\n").map((l) => l.trim()).filter((l) => l.includes("|"));

/** Of the answer's lines that use "|", the share that have a number of cells the ideal has too (the form of the lines, not the words). */
export function formatMatch(answer: string, ideal: string): number {
  const want = new Set(shaped(ideal).map(cells));
  const got = shaped(answer);
  if (!want.size) return 1;
  if (!got.length) return 0;
  return got.filter((l) => want.has(cells(l))).length / got.length;
}

const lineCount = (s: string) => s.split("\n").filter((l) => l.trim()).length;
/** 1 when the answer is as long as the ideal (in lines), less the further apart. */
const sizeMatch = (answer: string, ideal: string) => { const a = lineCount(answer), b = lineCount(ideal); return !a || !b ? 0 : Math.min(a, b) / Math.max(a, b); };

export interface CheckResult { check: string; ok: boolean }

/** What the sandbox found for the `loads` and `run` checks of a prompt (see `codeChecks`); a check not in it counts as failed. */
export type Ran = Map<Check, string | null>;

export function runCheck(c: Check, answer: string, ran?: Ran): CheckResult {
  const lower = answer.toLowerCase();
  switch (c.kind) {
    case "contains": return { check: `contains "${c.text}"`, ok: lower.includes(c.text.toLowerCase()) };
    case "not": return { check: `does not contain "${c.text}"`, ok: !lower.includes(c.text.toLowerCase()) };
    case "starts": return { check: `starts with "${c.text}"`, ok: lower.trimStart().startsWith(c.text.toLowerCase()) };
    case "regex": return { check: `matches /${c.pattern}/`, ok: new RegExp(c.pattern, "m").test(answer) };
    case "lines": { const n = lineCount(answer); return { check: `has ${c.min === c.max ? c.min : `${c.min} to ${c.max}`} lines (has ${n})`, ok: n >= c.min && n <= c.max }; }
    case "maxChars": return { check: `at most ${c.n} characters (has ${answer.length})`, ok: answer.length <= c.n };
    case "loads": return { check: "the code loads", ok: ran?.get(c) === null };
    case "run": { const r = ran?.get(c); return { check: `${c.call} gives ${c.expect}${r ? ` (${r})` : ""}`, ok: r === null }; }
    case "given": return { check: "given", ok: true };
    case "json": { let ok = false; try { JSON.parse(unfence(answer)); ok = true; } catch { ok = false; } return { check: "is valid JSON", ok }; }
  }
}

export interface Score {
  /** 0 to 100: how close the answer is to the ideal (words, form of the lines, length), when there is an ideal. */
  similarity: number | null;
  /** The checks of the prompt, each with its result. */
  checks: CheckResult[];
  /** 0 to 100: the one number the runs are ranked by. */
  total: number;
}

/**
 * Scores an answer. The similarity to the ideal is the words they share (F1), the form of the "|" lines when the ideal has any, and how
 * close the lengths are; with checks, the total is 60 % similarity and 40 % checks passed. Without an ideal only the checks count.
 */
export function scoreAnswer(answer: string, p: Pick<LabPrompt, "ideal" | "checks">, ran?: Ran): Score {
  const checks = p.checks.filter((c) => c.kind !== "given").map((c) => runCheck(c, answer, ran));
  const passed = checks.length ? checks.filter((c) => c.ok).length / checks.length : null;
  let similarity: number | null = null;
  if (p.ideal && answer.trim()) {
    const w = wordOverlap(answer, p.ideal), s = sizeMatch(answer, p.ideal);
    similarity = 100 * (shaped(p.ideal).length >= 2 ? 0.5 * w + 0.3 * formatMatch(answer, p.ideal) + 0.2 * s : 0.8 * w + 0.2 * s);
  } else if (p.ideal) similarity = 0;
  const total = similarity !== null && passed !== null ? 0.6 * similarity + 0.4 * 100 * passed : similarity !== null ? similarity : passed !== null ? 100 * passed : 0;
  return { similarity: similarity === null ? null : Math.round(similarity * 10) / 10, checks, total: Math.round(total * 10) / 10 };
}

// ---------------------------------------------------------------------------------------------------------------- results

export interface LabRun {
  prompt: string;
  model: string;
  /** 1-based number of the run for that prompt and model. */
  run: number;
  answer: string;
  seconds: number;
  tokens: number | null;
  score: Score;
  error?: string;
}

export interface LabCell { best: LabRun | null; runs: number; average: number; failed: number }

/** The best run (highest total, the quicker when equal) of each prompt and model, with the average of the others. */
export function cellOf(runs: LabRun[], prompt: string, model: string): LabCell {
  const mine = runs.filter((r) => r.prompt === prompt && r.model === model);
  const ok = mine.filter((r) => !r.error);
  const best = [...ok].sort((a, b) => b.score.total - a.score.total || a.seconds - b.seconds)[0] ?? null;
  return { best, runs: mine.length, failed: mine.length - ok.length, average: ok.length ? Math.round((ok.reduce((s, r) => s + r.score.total, 0) / ok.length) * 10) / 10 : 0 };
}

/** A model's mean of its best scores over the prompts: the line at the foot of the table. */
export function modelMean(runs: LabRun[], prompts: string[], model: string): number {
  const cells = prompts.map((p) => cellOf(runs, p, model).best?.score.total ?? 0);
  return cells.length ? Math.round((cells.reduce((a, b) => a + b, 0) / cells.length) * 10) / 10 : 0;
}

/** The report as Markdown: the table of best scores, then for each prompt and model the best answer next to the ideal. */
export function labReport(file: LabFile, runs: LabRun[], models: string[], when = new Date().toISOString()): string {
  const names = file.prompts.map((p) => p.name);
  const out: string[] = [`# ${file.title}: results`, "", `${when} · ${models.length} model${models.length === 1 ? "" : "s"} · ${names.length} prompt${names.length === 1 ? "" : "s"} · best of ${file.options.runs} run${file.options.runs === 1 ? "" : "s"} per cell`, ""];
  out.push(`| prompt | ${models.join(" | ")} |`, `| --- |${models.map(() => " ---: |").join("")}`);
  for (const n of names) out.push(`| ${n} | ${models.map((m) => { const c = cellOf(runs, n, m); return c.best ? `${c.best.score.total} (${c.best.seconds.toFixed(0)} s)` : c.runs ? "failed" : "–"; }).join(" | ")} |`);
  out.push(`| **mean** | ${models.map((m) => `**${modelMean(runs, names, m)}**`).join(" | ")} |`, "");
  out.push("Score: 0 to 100, similarity to the ideal answer (and the checks of the prompt, when it has any). The best of the runs counts.", "");
  for (const p of file.prompts) {
    out.push(`## ${p.name}`, "");
    for (const m of models) {
      const c = cellOf(runs, p.name, m);
      out.push(`### ${m}`, "");
      if (!c.best) { out.push(c.runs ? `All ${c.runs} runs failed: ${runs.find((r) => r.prompt === p.name && r.model === m && r.error)?.error ?? "no answer"}` : "Not run.", ""); continue; }
      out.push(`Best score ${c.best.score.total}${c.best.score.similarity !== null ? ` (similarity ${c.best.score.similarity})` : ""} · average of ${c.runs} run${c.runs === 1 ? "" : "s"}: ${c.average} · ${c.best.seconds.toFixed(1)} s${c.best.tokens ? ` · ${c.best.tokens} tokens` : ""}`, "");
      if (c.best.score.checks.length) out.push(...c.best.score.checks.map((k) => `- ${k.ok ? "✓" : "✗"} ${k.check}`), "");
      out.push("```", c.best.answer.replace(/```/g, "ʼʼʼ"), "```", "");
    }
    if (p.ideal) out.push("Ideal answer:", "", "```", p.ideal.replace(/```/g, "ʼʼʼ"), "```", "");
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------- the example

/** A small, complete file: what the page offers to download, and what the tests read. */
export const LAB_EXAMPLE = `---
title: Planning a small program
runs: 2
max_tokens: 700
thinking: off
system: You are the lead of a small team. You plan, you never write code.
---

# Planning a small program

Each "##" line starts a prompt. What follows it, up to a "### Ideal" line, is sent to the model as it is.
The ideal answer is the LAST part of the section: the answers are scored by how close they are to it.

## plan-counter

Plan a web page with a counter and a button that adds one, never above 10. Reply with lines only, in this form:
block name | what it contains | what it needs from other blocks

### Checks

- lines: 2-6
- regex: ^[a-z]+.* \\| .* \\| .*$
- not: \`\`\`

### Ideal

state | the count, starting at 0, and the maximum 10 | nothing
update | the function that adds one and never goes above the maximum | state
draw | shows the count and the button | state

## plan-todo

Plan a to-do list: add a task, tick it, remove it, show how many are left. Reply with lines only, in this form:
block name | what it contains | what it needs from other blocks

### Options

max_tokens: 500

### Ideal

state | the list of tasks, each with a text and a done flag | nothing
actions | add a task, tick or untick it, remove it | state
draw | shows the list and the number left | state
`;
