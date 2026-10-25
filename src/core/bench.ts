import type { CatalogEntry } from "../shared/types";
import { CATALOG } from "./catalog";
import { DynamicData, TaskCategory } from "./dynamic";
import type { Placement } from "./placement";
import { BENCH_SECTIONS, BENCH_TESTS, BenchMode, BenchSection, BenchTest, SECTION_INFO, TEST_COUNT, testsFor } from "./benchTests";
import { CANDIDATES, Candidate } from "./benchCandidates";
import { TestCost } from "./benchEstimate";

/**
 * The model benchmark (Settings, Developer settings): installs each candidate in turn, runs a large set of tests on the NPU,
 * scores the answers with checks that need no judge (exact values, formats, code that is run, facts), records the speed
 * (time to first token, tokens per second), keeps every raw answer, writes one result file per model and uninstalls it to
 * make room. This file is the pure part: results, roster and reports. The tests are in benchTests.ts, the loop in benchRunner.ts.
 */

export { BENCH_SECTIONS, BENCH_TESTS, SECTION_INFO, TEST_COUNT, testsFor };
export { estimateRun } from "./benchEstimate";
export { CANDIDATES };
export type { Candidate };
export type { BenchMode, BenchSection, BenchTest };

export interface TestResult {
  id: string;
  section: BenchSection;
  title: string;
  /** 0 to 1. */
  score: number;
  note: string;
  /** What the model answered, whole (the thinking is apart). */
  answer: string;
  /** What it thought before answering, whole. */
  thinking: string;
  /** How the test was asked: the answer limit and the thinking level. */
  asked: { maxTokens: number; effort: string | null };
  ttftSec: number | null;
  tokPerSec: number | null;
  tokens: number;
  totalSec: number;
  finish: string | null;
  skipped?: string;
  error?: string;
}

export interface ModelSummary {
  /** Mean score of the tests that ran, 0 to 100. */
  quality: number | null;
  ttftSec: number | null;
  tokPerSec: number | null;
  /** Score by section, 0 to 100. */
  bySection: Partial<Record<BenchSection, number>>;
  ran: number;
  failed: number;
}

export interface ModelResult {
  key: string;
  name: string;
  ref: string;
  sizeGB: number;
  paramsB: number | null;
  /** Where the model comes from ("Dynamic 4B", "Catalog"). */
  source: string;
  thinking: "toggle" | "always" | "none";
  mode: BenchMode;
  startedAt: string;
  finishedAt: string | null;
  /** The model was already installed before the run. */
  wasInstalled: boolean;
  installSec: number | null;
  /** The first request, which includes loading the model onto the NPU. */
  coldStartSec: number | null;
  npuMemGB: number | null;
  /** The repo the model was finally tested from, and every repo tried before it. */
  repo?: string;
  triedRepos?: string[];
  /** Why the model could not be tested (or not to the end), in a few words. */
  skipReason?: string;
  /** The setting (window, NPU sessions, buffer size) under which the model loaded when it did not load as the app starts it. */
  loadSetting?: string;
  /** Minutes into the run when this model started its tests: the NPU may be warmer, or slower, later in a long run. */
  runOffsetMin?: number;
  /** Whether it ran on the NPU or the CPU, measured while it answered. */
  placement?: Placement;
  tests: TestResult[];
  summary: ModelSummary;
  error?: string;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 100) / 100;
};
const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 10;

export function summarize(tests: TestResult[]): ModelSummary {
  const ran = tests.filter((t) => !t.skipped);
  const scored = ran.filter((t) => !t.error);
  const by: Partial<Record<BenchSection, number[]>> = {};
  for (const t of ran) (by[t.section] ??= []).push(t.score);
  // speed is taken from the short tests: the long texts measure reading, not answering
  const speedy = scored.filter((t) => t.section !== "long_context");
  return {
    // the sections count equally, whatever their number of tests (code has many, a quick reply has one)
    quality: ran.length ? mean(Object.values(by).map((v) => mean(v!) / 100)) : null,
    ttftSec: median(speedy.map((t) => t.ttftSec).filter((x): x is number => x !== null)),
    tokPerSec: median(speedy.map((t) => t.tokPerSec).filter((x): x is number => x !== null)),
    bySection: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, mean(v!)])) as Partial<Record<BenchSection, number>>,
    ran: ran.length,
    failed: ran.filter((t) => t.error).length
  };
}

// ------------------------------------------------------------------ the roster

export interface BenchTarget {
  key: string;
  name: string;
  repo: string;
  quant: string | null;
  sizeGB: number;
  paramsB: number | null;
  source: string;
  /** Other repos that hold the same model in the same quant, tried in order when `repo` will not install or load. */
  altRepos?: string[];
  /** The Dynamic bundle model, when it comes from a pack. */
  bundleRef?: string;
  /** The catalog / custom entry, when it already exists. */
  entryId?: string;
  job?: string;
  /** What a specialist is known for, from its model card. */
  specialty?: string;
}

/**
 * Every model worth testing on this PC: the models of the Dynamic packs up to 9B, and the catalog and custom models,
 * each once, none heavier than `maxSizeGB`. Nothing is hidden or filtered by the badge: the benchmark is how to find out.
 */
export function buildRoster(data: DynamicData, entries: CatalogEntry[], maxSizeGB: number, maxParamsB = 9.5, extra: Candidate[] = CANDIDATES): BenchTarget[] {
  const seen = new Set<string>();
  const out: BenchTarget[] = [];
  const id = (repo: string, quant: string | null) => `${repo}:${quant ?? ""}`.toLowerCase();
  for (const pack of Object.values(data.packs).filter((p) => p.maxParamsB <= maxParamsB).sort((a, b) => a.maxParamsB - b.maxParamsB)) {
    for (const m of pack.models) {
      const k = id(m.repo, m.quant);
      if (seen.has(k) || m.sizeGB > maxSizeGB) continue;
      seen.add(k);
      out.push({ key: m.ref, name: m.name, repo: m.repo, quant: m.quant, sizeGB: m.sizeGB, paramsB: m.paramsB, source: `Dynamic ${pack.label}`, altRepos: m.altRepos, bundleRef: m.ref, job: m.job });
    }
  }
  for (const e of entries) {
    const k = id(e.repo, e.quant);
    if (seen.has(k) || e.excluded || e.sizeGB > maxSizeGB || (e.paramsB ?? 0) > maxParamsB) continue;
    seen.add(k);
    out.push({ key: e.id, name: e.name, repo: e.repo, quant: e.quant, sizeGB: e.sizeGB, paramsB: e.paramsB ?? null, source: CATALOG.some((c) => c.id === e.id) ? "Catalog" : "Custom", entryId: e.id, job: e.role });
  }
  // the specialists: models acclaimed for one kind of work (translation, tool calling, maths, code, extraction, medicine...)
  for (const c of extra) {
    const k = id(c.repo, c.quant);
    if (seen.has(k) || c.sizeGB > maxSizeGB || (c.paramsB ?? 0) > maxParamsB) continue;
    seen.add(k);
    out.push({ key: `spec:${slug(c.name)}`, name: c.name, repo: c.repo, quant: c.quant, sizeGB: c.sizeGB, paramsB: c.paramsB, source: "Specialists", altRepos: c.altRepos, specialty: c.specialty });
  }
  return out;
}

/** What the window needs to estimate a run, for each test set. */
export const testCosts = (mode: BenchMode): TestCost[] => testsFor(mode).map((t) => ({ maxTokens: t.maxTokens, think: t.think, minContext: t.minContext }));

/** The few kinds of failure a model can have, from the message of the error: what the report and the window say instead of a stack of words. */
export function classifyFailure(msg: string): string {
  if (/does not fit|fit in NPU memory|over this machine|too big/i.test(msg)) return "too big for the NPU memory";
  if (/disk space/i.test(msg)) return "not enough disk space";
  if (/install failed|download|not found|404|network/i.test(msg)) return "download failed";
  if (/too slow/i.test(msg)) return "too slow to test";
  if (/time budget/i.test(msg)) return "took too long";
  if (/did not start|not ready|ECONNREFUSED|fetch failed|server|no answer after|did not answer|warm-up failed|could not load/i.test(msg)) return "did not load";
  if (/three tests in a row/i.test(msg)) return "kept failing";
  if (/no test could run/i.test(msg)) return "no test could run";
  return "failed";
}

/** A file-name-safe version of a model name. */
export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "model";

// ------------------------------------------------------------------ the reports

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "–" : n.toFixed(0));
const num = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "–" : n.toFixed(d));
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const SECTION_IDS = BENCH_SECTIONS.map((s) => s.id);
const sectionsOf = (rs: ModelResult[]) => SECTION_IDS.filter((s) => rs.some((r) => r.summary.bySection[s] !== undefined));

function ranked(rs: ModelResult[], s: BenchSection) {
  return rs.filter((r) => r.summary.bySection[s] !== undefined)
    .sort((a, b) => (b.summary.bySection[s]! - a.summary.bySection[s]!) || ((b.summary.tokPerSec ?? 0) - (a.summary.tokPerSec ?? 0)));
}

/** Pearson correlation of two score lists, null when it cannot be told. */
export function correlation(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 4) return null;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}

/** Pairs of sections that rank the models alike: testing both says little more than testing one. */
export function redundantSections(rs: ModelResult[], threshold = 0.9): { a: BenchSection; b: BenchSection; r: number }[] {
  const secs = sectionsOf(rs);
  const out: { a: BenchSection; b: BenchSection; r: number }[] = [];
  for (let i = 0; i < secs.length; i++) for (let j = i + 1; j < secs.length; j++) {
    const both = rs.filter((m) => m.summary.bySection[secs[i]] !== undefined && m.summary.bySection[secs[j]] !== undefined);
    const r = correlation(both.map((m) => m.summary.bySection[secs[i]]!), both.map((m) => m.summary.bySection[secs[j]]!));
    if (r !== null && r >= threshold) out.push({ a: secs[i], b: secs[j], r: Math.round(r * 100) / 100 });
  }
  return out.sort((x, y) => y.r - x.r);
}

/** For each Dynamic kind of work, the models that did best in the sections that inform it. */
export function suggestTable(rs: ModelResult[]): Partial<Record<TaskCategory, { name: string; score: number }[]>> {
  const byCat = new Map<TaskCategory, BenchSection[]>();
  for (const s of BENCH_SECTIONS) byCat.set(s.dynamic, [...(byCat.get(s.dynamic) ?? []), s.id]);
  const out: Partial<Record<TaskCategory, { name: string; score: number }[]>> = {};
  for (const [cat, secs] of byCat) {
    const rows = rs.map((r) => {
      const v = secs.map((s) => r.summary.bySection[s]).filter((x): x is number => x !== undefined);
      return { name: r.name, score: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : -1, tok: r.summary.tokPerSec ?? 0 };
    }).filter((x) => x.score >= 0).sort((a, b) => b.score - a.score || b.tok - a.tok);
    if (rows.length) out[cat] = rows.slice(0, 3).map(({ name, score }) => ({ name, score }));
  }
  return out;
}

/** The summary of a run as Markdown: the table of models, the best for each section, and what it suggests for Dynamic. */
export function buildReport(results: ModelResult[], meta: { startedAt: string; machine?: string; mode: string }): string {
  const done = results.filter((r) => r.summary.ran > 0).sort((a, b) => (b.summary.quality ?? 0) - (a.summary.quality ?? 0));
  const secs = sectionsOf(done);
  const L: string[] = [`# Open NPU benchmark`, "", `Run started ${meta.startedAt} · ${meta.mode} test set · ${done.length} model${done.length === 1 ? "" : "s"}${meta.machine ? ` · ${meta.machine}` : ""}`, ""];
  L.push("Scores are 0 to 100: the share of each test's checks that held (exact values, formats, code that was run, facts). Quality is the mean of the sections, so a section with many tests does not outweigh the others. Speeds are medians over the short tests, measured on the NPU. Cold start is the first request, which loads the model. Every raw answer is in the model's own file and in `sections/`.", "");
  L.push("## Models", "", "| Model | Runs on | Size | Quality | First token (s) | Tokens/s | Cold start (s) | Install (s) | Failed tests |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of done) L.push(`| ${cell(r.name)} | ${(r.placement?.runsOn ?? "unknown").toUpperCase()} | ${num(r.sizeGB)} GB | ${pct(r.summary.quality)} | ${num(r.summary.ttftSec, 2)} | ${num(r.summary.tokPerSec)} | ${num(r.coldStartSec)} | ${r.installSec === null ? "already there" : num(r.installSec, 0)} | ${r.summary.failed} |`);
  L.push("", "## Best model for each section", "", "| Section | 1st | 2nd | 3rd |", "|---|---|---|---|");
  for (const s of secs) {
    const rk = ranked(done, s);
    const c = (r?: ModelResult) => (r ? `${cell(r.name)} (${pct(r.summary.bySection[s])}, ${num(r.summary.tokPerSec)} tok/s)` : "");
    L.push(`| ${SECTION_INFO[s].group}: ${SECTION_INFO[s].label} | ${c(rk[0])} | ${c(rk[1])} | ${c(rk[2])} |`);
  }
  L.push("", "## Scores by section", "", `| Model | ${secs.map((s) => SECTION_INFO[s].label).join(" | ")} |`, `|---|${secs.map(() => "---").join("|")}|`);
  for (const r of done) L.push(`| ${cell(r.name)} | ${secs.map((s) => pct(r.summary.bySection[s])).join(" | ")} |`);
  const sug = suggestTable(done);
  if (Object.keys(sug).length) {
    L.push("", "## What this suggests for Dynamic", "", "For each kind of work Dynamic sorts requests into: the best models over the sections that inform it. Compare with the packs' tables in Developer settings (a pack only uses models of its own size).", "", "| Kind of work | 1st | 2nd | 3rd |", "|---|---|---|---|");
    for (const [cat, rows] of Object.entries(sug)) L.push(`| ${cat} | ${[0, 1, 2].map((i) => (rows![i] ? `${cell(rows![i].name)} (${rows![i].score})` : "")).join(" | ")} |`);
  }
  if (done.length >= 5) {
    const red = redundantSections(done);
    L.push("", "## Sections that tell the same story", "");
    L.push(red.length ? "These pairs ranked the models almost identically (correlation ≥ 0.9 over the models tested), so a later run could test only one of each:" : "No two sections ranked the models alike: each section told something the others did not.", "");
    for (const p of red.slice(0, 20)) L.push(`- ${SECTION_INFO[p.a].label} ↔ ${SECTION_INFO[p.b].label}: r = ${p.r}`);
  }
  const failed = results.filter((r) => r.error || r.summary.ran === 0);
  if (failed.length) { L.push("", "## Not fully tested", ""); for (const r of failed) L.push(`- ${r.name}: ${r.skipReason ? `${r.skipReason}. ` : ""}${r.error ?? "no test ran"}`); }
  L.push("");
  return L.join("\n");
}

const fenceOf = (s: string) => { let f = "```"; while (s.includes(f)) f += "`"; return f; };

/** The detail of one model: each test, its score, its speed, and the raw answer (and thinking). */
export function buildModelReport(r: ModelResult): string {
  const s = r.summary;
  const out = [
    `# ${r.name}`, "",
    `${r.source} · ${num(r.sizeGB)} GB · ${r.ref} · thinking: ${r.thinking}`,
    `Quality ${pct(s.quality)}/100 · first token ${num(s.ttftSec, 2)} s · ${num(s.tokPerSec)} tokens/s · cold start ${num(r.coldStartSec)} s${r.npuMemGB !== null ? ` · NPU memory ${num(r.npuMemGB)} GB` : ""}${r.installSec !== null ? ` · installed in ${num(r.installSec, 0)} s` : ""}`,
    r.placement ? `**Runs on: ${r.placement.runsOn.toUpperCase()}** (asked for ${r.placement.asked.toUpperCase()}): ${r.placement.evidence.join("; ")}.` : "",
    r.error ? `\n**Stopped early:** ${r.error}` : "", "",
    "| Section | Test | Score | First token | Tokens/s | Tokens | Finish | Note |", "|---|---|---|---|---|---|---|---|"
  ];
  for (const t of r.tests) out.push(`| ${SECTION_INFO[t.section].label} | ${cell(t.title)} | ${t.skipped ? "skipped" : pct(t.score * 100)} | ${num(t.ttftSec, 2)} | ${num(t.tokPerSec)} | ${t.tokens} | ${t.finish ?? "–"} | ${cell(t.skipped ?? t.error ?? t.note)} |`);
  out.push("", "## Raw answers", "");
  for (const t of r.tests.filter((x) => !x.skipped)) {
    const f = fenceOf(t.answer + t.thinking);
    out.push(`### ${SECTION_INFO[t.section].label}: ${t.title} (${t.error ? "error" : pct(t.score * 100)})`, "", t.error ? `Error: ${t.error}` : `${t.note}`, "");
    if (!t.error) out.push(f + "text", t.answer || "(empty)", f, "");
    if (t.thinking) out.push("<details><summary>Thinking</summary>", "", f + "text", t.thinking, f, "", "</details>", "");
  }
  return out.join("\n");
}

/** One section across all the models: for each test, every model's score and raw answer, so they can be compared side by side. */
export function buildSectionReport(section: BenchSection, rs: ModelResult[]): string {
  const info = SECTION_INFO[section];
  const tests = BENCH_TESTS.filter((t) => t.section === section);
  const rk = ranked(rs, section);
  const out = [`# ${info.group}: ${info.label}`, "", `Informs the Dynamic kind of work "${info.dynamic}". Tests: ${tests.map((t) => t.title).join("; ")}.`, "", "| Rank | Model | Section score | Tokens/s |", "|---|---|---|---|"];
  rk.forEach((r, i) => out.push(`| ${i + 1} | ${cell(r.name)} | ${pct(r.summary.bySection[section])} | ${num(r.summary.tokPerSec)} |`));
  for (const t of tests) {
    const prompt = t.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n\n---\n\n");
    const f = fenceOf(prompt);
    out.push("", `## ${t.title}`, "", f + "text", prompt.length > 3000 ? prompt.slice(0, 3000) + "\n… (cut)" : prompt, f, "");
    for (const r of rs) {
      const x = r.tests.find((y) => y.id === t.id);
      if (!x || x.skipped) continue;
      const g = fenceOf(x.answer);
      out.push(`### ${r.name}: ${x.error ? "error" : pct(x.score * 100)}`, "", x.error ?? x.note, "", g + "text", x.answer || "(empty)", g, "");
    }
  }
  return out.join("\n");
}
