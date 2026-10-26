import type { ModelResult } from "./bench";
import { allCharts, PLACEMENT_LABEL, WarmupInfo } from "./benchCharts";
import { BENCH_SECTIONS, SECTION_INFO } from "./benchSections";
import { BenchStats, computeStats, pct } from "./benchStats";
import type { RunsOn } from "./placement";

/**
 * The results as something to publish: a Markdown report that reads on GitHub and, tables and text bars only, on Reddit; the same
 * report as one self-contained HTML page with the charts in it; the charts as SVG files; a CSV of every figure; the statistics as
 * JSON. Nothing here is written to disk (benchRunner does that), so it is the same text the tests read.
 */

export interface ExportMeta {
  startedAt: string;
  mode: string;
  /** Label and value, in the order they should read: chip, memory, NPU driver, Windows, GenieX, app. */
  machine: [string, string][];
  /** What each specialist is known for, by model name. */
  tags?: Record<string, string[]>;
  /** The NPU warm-up and the speed check at the end, when the run had them. */
  warmup?: WarmupInfo | null;
}

/** The speed of the warm-up model right after the warm-up and at the end of the run, as a change in percent. null when either is missing. */
export function driftPct(w: WarmupInfo | null | undefined): number | null {
  return w && w.startTps && w.endTps ? Math.round(((w.endTps - w.startTps) / w.startTps) * 1000) / 10 : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const n1 = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "n/a" : n.toFixed(d));
const dur = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")} min` : `${Math.floor(sec / 60)} min`);
const on = (r: ModelResult): RunsOn => r.placement?.runsOn ?? "unknown";
/** A bar in text, for the places that cannot show an image. */
const bar = (v: number, max = 100, w = 20) => `${"█".repeat(Math.round((v / max) * w))}${"░".repeat(w - Math.round((v / max) * w))}`;

function table(head: string[], rows: string[][]): string {
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

/** The findings in a few lines, each one a sentence that can be quoted. */
export function headline(st: BenchStats, rs: ModelResult[], skipped = 0): string[] {
  const top = [...rs].filter((r) => r.summary.quality !== null).sort((a, b) => b.summary.quality! - a.summary.quality!);
  const L: string[] = [];
  const p = st.placement;
  L.push(`${st.models} models tested with ${st.tests.toLocaleString("en")} tests (${dur(st.testSeconds)} of generation, ${st.tokens.toLocaleString("en")} tokens).`);
  if (p.npu + p.mixed + p.cpu > 0) L.push(`**${pct(p.npu, p.total)}% of the models ran on the NPU** (${p.npu} of ${p.total}), ${pct(p.mixed, p.total)}% on NPU and CPU together, ${pct(p.cpu, p.total)}% on the CPU${p.unknown ? `, ${pct(p.unknown, p.total)}% could not be told` : ""}.`);
  if (top[0]) L.push(`Best overall: **${top[0].name}** (${n1(top[0].summary.quality, 0)}/100, ${n1(top[0].summary.tokPerSec)} tokens/s, ${n1(top[0].sizeGB)} GB).`);
  if (st.bestSmall) L.push(`Best model of 3 GB or less: **${st.bestSmall.name}** (${n1(st.bestSmall.quality, 0)}/100 in ${n1(st.bestSmall.sizeGB)} GB).`);
  if (st.fastestGood) L.push(`Fastest model at or above the median quality: **${st.fastestGood.name}** (${n1(st.fastestGood.tokPerSec)} tokens/s, ${n1(st.fastestGood.quality, 0)}/100).`);
  if (st.bestPerGB[0]) L.push(`Most quality per GB: **${st.bestPerGB[0].name}** (${n1(st.bestPerGB[0].perGB)} points per GB).`);
  const c = st.correlations;
  if (c.sizeQuality !== null) L.push(`Size and quality: correlation ${c.sizeQuality.toFixed(2)} across these models${c.sizeQuality < 0.5 ? ", so a bigger file is only a weak predictor of a better answer" : ""}.`);
  if (skipped) L.push(`${skipped} model${skipped === 1 ? "" : "s"} could not be tested to the end (too big, did not load, too slow, download failed): they are listed with the reason below.`);
  if (st.specialists.length) {
    const ok = st.specialists.filter((x) => x.verdict === "confirmed").length;
    L.push(`Specialists: ${ok} of ${st.specialists.length} ranked in the top fifth on the work they are known for.`);
  }
  return L;
}

const FOUNDRY_SUFFIX = " (Foundry Local)";

/** The same model tested through GenieX and through Foundry Local, side by side: [name, GenieX result, Foundry Local result]. */
export function enginePairs(rs: ModelResult[]): [string, ModelResult, ModelResult][] {
  const by = new Map(rs.filter((r) => r.summary.ran > 0).map((r) => [r.name, r]));
  return rs.filter((r) => r.name.endsWith(FOUNDRY_SUFFIX) && r.summary.ran > 0).flatMap((f) => {
    const name = f.name.slice(0, -FOUNDRY_SUFFIX.length);
    const g = by.get(name);
    return g ? [[name, g, f] as [string, ModelResult, ModelResult]] : [];
  });
}

export function buildMarkdown(rs: ModelResult[], meta: ExportMeta, st: BenchStats, failed: ModelResult[] = []): string {
  const done = [...rs].filter((r) => r.summary.ran > 0).sort((a, b) => (b.summary.quality ?? 0) - (a.summary.quality ?? 0));
  const L: string[] = [`# Local language models on a Snapdragon NPU: ${st.models} models tested`, "", `Run started ${meta.startedAt} · ${meta.mode} test set`, "", "## In short", ""];
  for (const line of headline(st, done, failed.length)) L.push(`- ${line}`);
  L.push("", "## Machine", "", table(["", ""], meta.machine.map(([a, b]) => [a, b])), "");
  if (meta.warmup) {
    const w = meta.warmup, d = driftPct(w);
    L.push("## Was the NPU warm, and did it slow down?", "", `Before the first test, ${w.model} wrote without stopping for ${w.minutes} minutes, so no model was measured on a cold chip. Windows gives no temperature for the NPU, so heat can only be read in the speed.`, "");
    if (w.series.filter((p) => p.tps !== null).length > 1) L.push("![Speed while the NPU was kept busy](charts/warmup.svg)", "");
    L.push(table(["", "Tokens per second"], [["Same short test right after the warm-up", n1(w.startTps)], ["Same short test at the end of the run", n1(w.endTps)], ["Change", d === null ? "n/a" : `${d > 0 ? "+" : ""}${d}%`]]), "");
    L.push(d === null ? "The speed at the end was not measured." : Math.abs(d) <= 5 ? `The speed stayed within 5%, so models tested early and late can be compared fairly.` : d < -5 ? `The NPU was ${Math.abs(d)}% slower at the end: models tested late were measured on a slower chip, so speeds late in the run are lower than they would have been early. Quality scores are not affected.` : `The NPU was ${d}% faster at the end, so models tested early may be slightly underrated on speed.`, "");
  }
  L.push("## Where the models ran", "", "Measured while each model answered: the NPU's own counters (load, memory taken since before the model was loaded), how busy the CPU was, and what the server log says. NPU and CPU together means both worked hard.", "");
  L.push("![Where the models ran](charts/placement.svg)", "");
  const share = (s: BenchStats["placement"]) => [s.label, String(s.total), `${pct(s.npu, s.total)}%`, `${pct(s.mixed, s.total)}%`, `${pct(s.cpu, s.total)}%`, `${pct(s.unknown, s.total)}%`];
  L.push(table(["", "Models", "NPU", "NPU and CPU", "CPU", "Unknown"], [share(st.placement), ...st.placementBySize.map(share), ...st.placementBySource.map(share)]), "");
  const cpuOnes = done.filter((r) => on(r) === "cpu" || on(r) === "mixed");
  if (cpuOnes.length) L.push("Models that did not stay on the NPU:", "", ...cpuOnes.map((r) => `- ${r.name} (${PLACEMENT_LABEL[on(r)]}): ${r.placement?.evidence.join("; ") ?? ""}`), "");
  L.push("## Leaderboard", "", "![Quality, best first](charts/leaderboard.svg)", "", "Quality is the mean of the section scores, 0 to 100 (each section counts the same).", "");
  L.push(table(["#", "Model", "Runs on", "Quality", "Tokens/s", "First token (s)", "Cold start (s)", "Size (GB)", "Failed"], done.map((r, i) => [String(i + 1), r.name, PLACEMENT_LABEL[on(r)], n1(r.summary.quality, 0), n1(r.summary.tokPerSec), n1(r.summary.ttftSec, 2), n1(r.coldStartSec), n1(r.sizeGB), String(r.summary.failed)])), "");
  L.push("Without images:", "", "```text", ...done.slice(0, 25).map((r) => `${r.name.slice(0, 30).padEnd(30)} ${bar(r.summary.quality ?? 0)} ${String(Math.round(r.summary.quality ?? 0)).padStart(3)}  ${PLACEMENT_LABEL[on(r)]}`), "```", "");
  const pairs = enginePairs(rs);
  if (pairs.length) {
    const two = (a: string, b: string) => `${a} / ${b}`;
    L.push("## GenieX and Foundry Local on the same models", "", "Each model below was asked the same questions through GenieX (llama.cpp, GGUF Q4_0) and through Microsoft Foundry Local (its own ONNX build, on the hardware it chose). Figures are GenieX / Foundry Local.", "");
    L.push(table(["Model", "Quality", "Tokens/s", "First token (s)", "Load (s)", "Runs on"], pairs.map(([n, g, f]) => [n, two(n1(g.summary.quality, 0), n1(f.summary.quality, 0)), two(n1(g.summary.tokPerSec), n1(f.summary.tokPerSec)), two(n1(g.summary.ttftSec, 2), n1(f.summary.ttftSec, 2)), two(n1(g.coldStartSec), n1(f.coldStartSec)), two(PLACEMENT_LABEL[on(g)], PLACEMENT_LABEL[on(f)])])), "");
    const faster = pairs.filter(([, g, f]) => (g.summary.tokPerSec ?? 0) > 0 && (f.summary.tokPerSec ?? 0) > 0);
    if (faster.length) L.push(`Of ${faster.length} models measured on both, ${faster.filter(([, g, f]) => g.summary.tokPerSec! > f.summary.tokPerSec!).length} write faster through GenieX and ${faster.filter(([, g, f]) => f.summary.tokPerSec! > g.summary.tokPerSec!).length} through Foundry Local.`, "");
  }
  L.push("## Quality against speed and size", "", "![Quality against speed](charts/quality-vs-speed.svg)", "", "![Quality against size](charts/quality-vs-size.svg)", "", "![Speed against size](charts/speed-vs-size.svg)", "");
  const c = st.correlations;
  L.push(table(["Pair", "Correlation (-1 to 1)"], [["size and quality", c.sizeQuality === null ? "n/a" : c.sizeQuality.toFixed(2)], ["size and speed (log scales)", c.sizeSpeed === null ? "n/a" : c.sizeSpeed.toFixed(2)], ["speed and quality (log speed)", c.speedQuality === null ? "n/a" : c.speedQuality.toFixed(2)]]), "");
  if (st.bestPerGB.length) L.push("Most quality per GB:", "", table(["Model", "Size (GB)", "Quality", "Points per GB"], st.bestPerGB.map((x) => [x.name, n1(x.sizeGB), n1(x.quality, 0), n1(x.perGB)])), "");
  if (st.coldStartBySize.length) L.push("Time to load a model (the first request), median:", "", table(["Size", "Seconds", "Models"], st.coldStartBySize.map((x) => [x.label, n1(x.medianSec), String(x.n)])), "");
  L.push("## Best model for each kind of work", "", "![Score of each model in each section](charts/heatmap.svg)", "");
  const best = st.bySection.map((s) => {
    const rk = done.filter((r) => r.summary.bySection[s.id] !== undefined).sort((a, b) => b.summary.bySection[s.id]! - a.summary.bySection[s.id]! || (b.summary.tokPerSec ?? 0) - (a.summary.tokPerSec ?? 0));
    const f = (r?: ModelResult) => (r ? `${r.name} (${n1(r.summary.bySection[s.id], 0)})` : "");
    return [`${s.group}: ${s.label}`, f(rk[0]), f(rk[1]), f(rk[2]), n1(s.mean, 0)];
  });
  L.push(table(["Section", "1st", "2nd", "3rd", "Mean of all"], best), "");
  L.push("## How hard each section was", "", "![How hard each section was](charts/sections.svg)", "");
  L.push(table(["Section", "Mean", "Median", "Worst", "Best", "Spread"], [...st.bySection].sort((a, b) => a.mean - b.mean).map((s) => [`${s.group}: ${s.label}`, n1(s.mean, 0), n1(s.median, 0), `${s.worst.name} (${n1(s.worst.score, 0)})`, `${s.best.name} (${n1(s.best.score, 0)})`, n1(s.spread, 0)])), "");
  if (st.specialists.length) {
    L.push("## Do the specialists deliver?", "", "Each specialist was picked for being acclaimed at one kind of work, from its model card. Rank is among all models tested on the sections that kind of work covers; confirmed means the top fifth.", "");
    L.push(table(["Model", "Known for", "Score", "Rank", "Median of all", "Best other model", "Verdict"], st.specialists.map((x) => [x.name, x.claim.replace(/_/g, " "), n1(x.score, 0), `${x.rank} of ${x.of}`, n1(x.median, 0), x.bestOther ? `${x.bestOther.name} (${n1(x.bestOther.score, 0)})` : "", x.verdict])), "");
  }
  if (st.byThinking.length > 1) L.push("## Thinking models", "", table(["", "Models", "Mean quality", "Mean tokens/s"], st.byThinking.map((x) => [x.label, String(x.n), n1(x.quality, 0), n1(x.tokPerSec)])), "");
  if (failed.length) {
    L.push("## Models that could not be tested to the end", "", "A model that does not fit the NPU memory, does not load, crashes, writes too slowly to finish or fails to download is noted and skipped so it cannot hold the run. A model with a score was tested in part.", "");
    L.push(table(["Model", "Size (GB)", "Origin", "What happened", "Detail"], failed.map((r) => [r.name, n1(r.sizeGB), r.source, `${r.summary.ran > 0 ? "tested in part: " : "skipped: "}${r.skipReason ?? "failed"}`, (r.error ?? "").slice(0, 140)])), "");
  }
  L.push("## How it was measured, and what to be careful about", "",
    "- Each model was installed, loaded onto the NPU through GenieX (or through Foundry Local, for the models named \"(Foundry Local)\"), tested, and uninstalled. GenieX files are Q4_0 (Q8_0 for a few small models that have no Q4_0).",
    "- Answers are scored by checks, not by another model: exact values, formats, facts, code that was run against test cases (Python and JavaScript, with a time limit), markup that was parsed. A check can be too strict or too lenient; every raw answer is in the model's file so any score can be checked by reading it.",
    "- Each test ran once, with the model's own recommended sampling. Sampling is random, so a rerun can differ by a few points; a gap of a few points between two models is not a ranking.",
    "- Thinking is switched off where a model allows it, except for maths, logic and bug fixing. Models that always think had their thinking capped (express runs cap it hard), which lowers their score on tests that need long reasoning.",
    "- Speed is the median over the short tests. The long-text test is left out because it measures reading, not writing.",
    "- Where a model ran comes from Windows' counters for the NPU adapter, the CPU load and the server log. It is evidence, not a certificate: `NPU and CPU` means both were busy.",
    `- The tests are grouped in ${BENCH_SECTIONS.length} sections; the express and quick sets use a part of them (this run: ${meta.mode}). Sections with few tests (a single quick reply, one long-text test) are noisy.`, "");
  L.push("## Files", "", "- `results.csv`: every figure, one row per model.", "- `charts/`: the charts above as SVG.", "- `models/`: for each model, every test with its raw answer, its thinking, its score and why.", "- `sections/`: for each section, every model's answer to every test side by side.", "");
  return L.join("\n");
}

export function buildCsv(all: ModelResult[]): string {
  const rs = all;
  const secs = BENCH_SECTIONS.map((s) => s.id).filter((id) => rs.some((r) => r.summary.bySection[id] !== undefined));
  const head = ["model", "status", "reason", "source", "size_gb", "params_b", "thinking", "runs_on", "quality", "tokens_per_s", "first_token_s", "cold_start_s", "install_s", "npu_mem_gb", "tests_run", "tests_failed", ...secs];
  const q = (s: string | number | null | undefined) => (s === null || s === undefined ? "" : /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const status = (r: ModelResult) => (r.summary.ran === 0 ? "skipped" : r.error && !/^stopped/.test(r.error) ? "partial" : "tested");
  return [head.join(","), ...rs.filter((r) => r.summary.ran > 0 || r.skipReason).map((r) => [r.name, status(r), r.skipReason ?? "", r.source, r.sizeGB, r.paramsB, r.thinking, PLACEMENT_LABEL[on(r)], r.summary.quality, r.summary.tokPerSec, r.summary.ttftSec, r.coldStartSec, r.installSec, r.npuMemGB, r.summary.ran, r.summary.failed, ...secs.map((id) => r.summary.bySection[id])].map(q).join(","))].join("\n") + "\n";
}

/** The same report as one page: no file next to it is needed, the charts are inside. */
export function buildHtml(rs: ModelResult[], meta: ExportMeta, st: BenchStats, charts: Record<string, string>, failed: ModelResult[] = []): string {
  const done = [...rs].filter((r) => r.summary.ran > 0).sort((a, b) => (b.summary.quality ?? 0) - (a.summary.quality ?? 0));
  const fig = (name: string) => `<figure>${charts[name].replace(/ width="\d+" height="\d+"/, ' style="max-width:100%;height:auto"')}</figure>`;
  const md = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const rows = (head: string[], body: string[][]) => `<div class="t"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const best = st.bySection.map((s) => {
    const rk = done.filter((r) => r.summary.bySection[s.id] !== undefined).sort((a, b) => b.summary.bySection[s.id]! - a.summary.bySection[s.id]!);
    return [`${s.group}: ${s.label}`, ...[0, 1, 2].map((i) => (rk[i] ? `${rk[i].name} (${n1(rk[i].summary.bySection[s.id], 0)})` : ""))];
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local language models on a Snapdragon NPU</title><style>
:root{color-scheme:light dark;--bg:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--line:#e3e2de}@media(prefers-color-scheme:dark){:root{--bg:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--line:#34342f}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,"Segoe UI",sans-serif}main{max-width:920px;margin:0 auto;padding:24px 16px 64px}h1{font-size:28px;line-height:1.2}h2{margin-top:40px;font-size:21px;border-bottom:1px solid var(--line);padding-bottom:6px}
.m{color:var(--ink2)}figure{margin:16px 0;overflow-x:auto}.t{overflow-x:auto}table{border-collapse:collapse;font-size:14px;margin:12px 0}th,td{border-bottom:1px solid var(--line);padding:5px 10px;text-align:left;white-space:nowrap}th{font-weight:600}li{margin:4px 0}
</style></head><body><main><h1>Local language models on a Snapdragon NPU: ${st.models} models tested</h1><p class="m">Run started ${esc(meta.startedAt)} · ${esc(meta.mode)} test set</p>
<h2>In short</h2><ul>${headline(st, done, failed.length).map((l) => `<li>${md(l)}</li>`).join("")}</ul>
<h2>Machine</h2>${rows(["", ""], meta.machine.map(([a, b]) => [a, b]))}
${meta.warmup && charts["warmup.svg"] ? `<h2>Was the NPU warm, and did it slow down?</h2><p class="m">${esc(meta.warmup.model)} wrote without stopping for ${meta.warmup.minutes} minutes before the first test. Speed right after: ${n1(meta.warmup.startTps)} tokens/s; at the end of the run: ${n1(meta.warmup.endTps)} tokens/s.</p>${fig("warmup.svg")}` : ""}
<h2>Where the models ran</h2><p class="m">Measured while each model answered: the NPU's counters, the CPU load and the server log.</p>${fig("placement.svg")}
<h2>Leaderboard</h2>${fig("leaderboard.svg")}${rows(["#", "Model", "Runs on", "Quality", "Tokens/s", "First token (s)", "Cold start (s)", "Size (GB)", "Failed"], done.map((r, i) => [String(i + 1), r.name, PLACEMENT_LABEL[on(r)], n1(r.summary.quality, 0), n1(r.summary.tokPerSec), n1(r.summary.ttftSec, 2), n1(r.coldStartSec), n1(r.sizeGB), String(r.summary.failed)]))}
<h2>Quality against speed and size</h2>${fig("quality-vs-speed.svg")}${fig("quality-vs-size.svg")}${fig("speed-vs-size.svg")}
<h2>Best model for each kind of work</h2>${fig("heatmap.svg")}${rows(["Section", "1st", "2nd", "3rd"], best)}
<h2>How hard each section was</h2>${fig("sections.svg")}
${st.specialists.length ? `<h2>Do the specialists deliver?</h2>${rows(["Model", "Known for", "Score", "Rank", "Median of all", "Verdict"], st.specialists.map((x) => [x.name, x.claim.replace(/_/g, " "), n1(x.score, 0), `${x.rank} of ${x.of}`, n1(x.median, 0), x.verdict]))}` : ""}
${failed.length ? `<h2>Models that could not be tested to the end</h2>${rows(["Model", "Size (GB)", "What happened", "Detail"], failed.map((r) => [r.name, n1(r.sizeGB), `${r.summary.ran > 0 ? "tested in part: " : "skipped: "}${r.skipReason ?? "failed"}`, (r.error ?? "").slice(0, 140)]))}` : ""}
<h2>How it was measured</h2><p>Answers are scored by checks, not by another model: exact values, formats, facts, code that was run, markup that was parsed. Each test ran once with the model's own sampling, so a gap of a few points is not a ranking. Where a model ran comes from the NPU adapter's counters, the CPU load and the server log. The full method, the raw answers and every figure are in the report folder.</p>
</main></body></html>`;
}

/** Everything the export writes, by path relative to the folder (the per-model and per-section files are copied by the runner). */
export function buildExport(all: ModelResult[], meta: ExportMeta): Record<string, string> {
  const rs = all.filter((r) => r.summary.ran > 0);
  const failed = all.filter((r) => r.error && !/^stopped/.test(r.error) && (r.skipReason || r.summary.ran === 0));
  const st = computeStats(rs, meta.tags ?? {});
  const charts = allCharts(rs, st, meta.warmup);
  return {
    "report.md": buildMarkdown(rs, meta, st, failed),
    "report.html": buildHtml(rs, meta, st, charts, failed),
    "results.csv": buildCsv(all),
    "stats.json": JSON.stringify(st, null, 2),
    ...Object.fromEntries(Object.entries(charts).map(([k, v]) => [`charts/${k}`, v]))
  };
}

export { SECTION_INFO };

/** The launch check as a report: which models load and answer, on what, how fast, with what setting, and why the others do not. */
const cpuCell = (r: ModelResult) => (r.placement?.cpuBusyPct != null ? String(Math.round(r.placement.cpuBusyPct)) : "");

export function buildLaunchReport(rs: ModelResult[], meta: { startedAt: string; machine: [string, string][] }): { md: string; csv: string } {
  const label = (r: ModelResult) => (r.launched ? "yes" : "no");
  const rows = [...rs].sort((a, b) => Number(!!b.launched) - Number(!!a.launched) || a.name.localeCompare(b.name));
  const ok = rs.filter((r) => r.launched);
  const share = (k: string) => ok.filter((r) => on(r) === k).length;
  const L: string[] = ["# Which models launch on this PC", "", `Run started ${meta.startedAt} · launch check`, "",
    `**${ok.length} of ${rs.length} models launch** (${share("npu")} on the NPU, ${share("mixed")} on the NPU and CPU, ${share("cpu")} on the CPU, ${ok.length - share("npu") - share("mixed") - share("cpu")} where it could not be told).`, "",
    "Each model was installed, loaded, given a real prompt of about 1500 tokens, and had to answer something that is not noise. Nothing is said here about how good a model is: only whether it runs, on what, and how fast. \"CPU busy\" is the share of all the CPU cores that was busy while the model answered, whatever the program: it includes the engine's own threads and the rest of the PC, so it compares two engines on the same PC, not a model's own cost.", "",
    "## Machine", "", table(["", ""], meta.machine.map(([a, b]) => [a, b])), "", "## Models", "",
    table(["Model", "Origin", "Size (GB)", "Launches", "Runs on", "Load (s)", "Tokens/s", "CPU busy (%)", "First token (s)", "Window", "Setting needed", "What happened"],
      rows.map((r) => [r.name, r.source, n1(r.sizeGB), label(r), r.launched ? PLACEMENT_LABEL[on(r)] : "", n1(r.coldStartSec), n1(r.launch?.tokPerSec), cpuCell(r), n1(r.launch?.ttftSec, 2), r.launch?.window ? String(r.launch.window) : "", r.loadSetting ?? "", r.launched ? (r.refused?.length ? `engine refused: ${r.refused.join(", ")} (left out)` : "") : `${r.skipReason ?? "failed"}: ${(r.error ?? "").slice(0, 140)}`])), ""];
  const refusals = [...new Set(rs.flatMap((r) => (r.refused ?? []).map((f) => `${r.name.endsWith(FOUNDRY_SUFFIX) ? "Foundry Local" : "GenieX"}: ${f}`)))];
  if (refusals.length) L.push("## Request settings the engines refused", "", "The app asks for a temperature, a sampling cut-off and a repetition penalty. An engine that does not accept one of them is asked again without it, and the app does not send it again to that engine. What was refused:", "", ...refusals.map((x) => `- ${x}`), "");
  const by = new Map(rs.map((r) => [r.name, r]));
  const pairs = rs.filter((r) => r.name.endsWith(FOUNDRY_SUFFIX)).flatMap((f) => { const g = by.get(f.name.slice(0, -FOUNDRY_SUFFIX.length)); return g ? [[g.name, g, f] as [string, ModelResult, ModelResult]] : []; });
  if (pairs.length) {
    const yn = (r: ModelResult) => (r.launched ? `${PLACEMENT_LABEL[on(r)]}, ${n1(r.launch?.tokPerSec)} tokens/s${r.placement?.cpuBusyPct != null ? `, CPU ${Math.round(r.placement.cpuBusyPct)}%` : ""}` : "does not launch");
    L.push("## GenieX and Foundry Local on the same models", "", table(["Model", "GenieX", "Foundry Local"], pairs.map(([n, g, f]) => [n, yn(g), yn(f)])), "",
      `Both launch: ${pairs.filter(([, g, f]) => g.launched && f.launched).length} · only GenieX: ${pairs.filter(([, g, f]) => g.launched && !f.launched).length} · only Foundry Local: ${pairs.filter(([, g, f]) => !g.launched && f.launched).length} · neither: ${pairs.filter(([, g, f]) => !g.launched && !f.launched).length}`, "");
  }
  const csv = [["model", "origin", "size_gb", "launches", "runs_on", "load_s", "tokens_per_s", "cpu_busy_pct", "first_token_s", "window", "setting", "reason"].join(","),
    ...rows.map((r) => [r.name, r.source, r.sizeGB, label(r), r.launched ? on(r) : "", r.coldStartSec ?? "", r.launch?.tokPerSec ?? "", r.placement?.cpuBusyPct != null ? Math.round(r.placement.cpuBusyPct) : "", r.launch?.ttftSec ?? "", r.launch?.window ?? "", r.loadSetting ?? "", r.launched ? (r.refused ?? []).join(" ") : `${r.skipReason ?? "failed"}: ${r.error ?? ""}`].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))].join("\n") + "\n";
  return { md: L.join("\n"), csv };
}
