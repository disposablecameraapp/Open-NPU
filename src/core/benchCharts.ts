import type { ModelResult } from "./bench";
import { BenchStats, Share, pct } from "./benchStats";
import { BENCH_SECTIONS, SECTION_INFO } from "./benchSections";
import type { RunsOn } from "./placement";

/**
 * The charts of the benchmark as SVG text: the window draws them inline, the exported report saves them as files, so both show
 * the same picture. Colours are tokens defined in each SVG with a light and a dark set (an SVG used as an image follows the
 * viewer's colour scheme), not borrowed from the page. Where a model ran has one colour everywhere: blue NPU, orange CPU, aqua both,
 * grey unknown (the first three slots of the reference palette, validated together, with direct labels because aqua is
 * pale on a light page). Every mark has a `<title>`, which browsers show on hover.
 */

const STYLE = `.bz{--bg:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--grid:#e3e2de;--npu:#2a78d6;--cpu:#eb6834;--mix:#1baf7a;--unk:#9a998f;--seq:#2a78d6;--ring:#fcfcfb}
@media (prefers-color-scheme:dark){.bz{--bg:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--grid:#34342f;--npu:#3987e5;--cpu:#d95926;--mix:#199e70;--unk:#7a796f;--seq:#3987e5;--ring:#1a1a19}}
.bz text{font:12px system-ui,"Segoe UI",sans-serif;fill:var(--ink)}.bz .m{fill:var(--ink2)}.bz .h{font-weight:600;font-size:14px}.bz .s{font-size:11px}.bz .grid{stroke:var(--grid);stroke-width:1}.bz .bgr{fill:var(--bg)}`;

export const PLACEMENT_COLOR: Record<RunsOn, string> = { npu: "var(--npu)", cpu: "var(--cpu)", mixed: "var(--mix)", unknown: "var(--unk)" };
export const PLACEMENT_LABEL: Record<RunsOn, string> = { npu: "NPU", cpu: "CPU", mixed: "NPU and CPU", unknown: "unknown" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const runsOf = (r: ModelResult): RunsOn => r.placement?.runsOn ?? "unknown";
const num = (n: number, d = 1) => n.toFixed(d);

function wrap(w: number, h: number, title: string, body: string, standalone: boolean, desc = ""): string {
  return `<svg class="bz" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${desc ? `<desc>${esc(desc)}</desc>` : ""}<style>${STYLE}</style>${standalone ? `<rect class="bgr" width="${w}" height="${h}"/>` : ""}${body}</svg>`;
}

function legend(x: number, y: number, items: [RunsOn, string?][]): string {
  let cx = x;
  return items.map(([k, extra]) => {
    const label = `${PLACEMENT_LABEL[k]}${extra ? ` ${extra}` : ""}`;
    const g = `<circle cx="${cx + 5}" cy="${y}" r="5" fill="${PLACEMENT_COLOR[k]}"/><text class="s m" x="${cx + 14}" y="${y + 4}">${esc(label)}</text>`;
    cx += 26 + label.length * 6.2;
    return g;
  }).join("");
}
const present = (rs: ModelResult[]): [RunsOn, string?][] => (["npu", "mixed", "cpu", "unknown"] as RunsOn[]).filter((k) => rs.some((r) => runsOf(r) === k)).map((k) => [k]);

/** Quality of each model, best first, coloured by where it ran. */
export function leaderboardSvg(all: ModelResult[], o: { top?: number; standalone?: boolean } = {}): string {
  const rs = all.filter((r) => r.summary.quality !== null).sort((a, b) => b.summary.quality! - a.summary.quality!).slice(0, o.top ?? 20);
  const row = 24, left = 224, barW = 300, top = 52, w = left + barW + 150, h = top + rs.length * row + 12;
  const body = [`<text class="h" x="12" y="22">Quality, best first</text>`, legend(12, 40, present(rs))];
  rs.forEach((r, i) => {
    const y = top + i * row, q = r.summary.quality!, k = runsOf(r);
    body.push(
      `<g><title>${esc(`${r.name}: quality ${num(q, 0)}/100, ${r.summary.tokPerSec !== null ? `${num(r.summary.tokPerSec)} tokens/s, ` : ""}runs on ${PLACEMENT_LABEL[k]}, ${num(r.sizeGB)} GB`)}</title>`,
      `<text class="s m" x="12" y="${y + 15}" text-anchor="start">${i + 1}</text>`,
      `<text x="30" y="${y + 15}">${esc(cut(r.name, 30))}</text>`,
      `<path d="M${left} ${y + 4}h${Math.max(2, (q / 100) * barW) - 4}a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-${Math.max(2, (q / 100) * barW) - 4}z" fill="${PLACEMENT_COLOR[k]}"/>`,
      `<text x="${left + Math.max(2, (q / 100) * barW) + 6}" y="${y + 15}">${num(q, 0)}</text>`,
      `<text class="s m" x="${left + barW + 50}" y="${y + 15}">${r.summary.tokPerSec !== null ? `${num(r.summary.tokPerSec)} tok/s` : ""}</text>`,
      `<text class="s m" x="${left + barW + 112}" y="${y + 15}">${num(r.sizeGB)} GB</text></g>`
    );
  });
  return wrap(w, h, "Quality of each model", body.join(""), !!o.standalone, rs.map((r) => `${r.name} ${num(r.summary.quality!, 0)}`).join("; "));
}

interface Pt { x: number; y: number; label: string; tip: string; k: RunsOn }
function scatter(pts: Pt[], o: { title: string; xLabel: string; yLabel: string; xLog?: boolean; yMax?: number; xTicks: number[]; yTicks: number[]; labelTop?: number; standalone?: boolean; yLog?: boolean }): string {
  const w = 640, h = 380, L = 56, R = 20, T = 56, B = 48, pw = w - L - R, ph = h - T - B;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const xmin = Math.min(...xs, ...o.xTicks), xmax = Math.max(...xs, ...o.xTicks), ymax = o.yMax ?? Math.max(...ys, ...o.yTicks);
  const ymin = o.yLog ? Math.min(...ys, ...o.yTicks) : 0;
  const fx = (v: number) => L + (o.xLog ? (Math.log(v) - Math.log(xmin)) / (Math.log(xmax) - Math.log(xmin) || 1) : (v - xmin) / (xmax - xmin || 1)) * pw;
  const fy = (v: number) => T + ph - (o.yLog ? (Math.log(v) - Math.log(ymin)) / (Math.log(ymax) - Math.log(ymin) || 1) : v / (ymax || 1)) * ph;
  const body = [`<text class="h" x="12" y="22">${esc(o.title)}</text>`, legend(12, 40, present(pts.map((p) => ({ placement: { runsOn: p.k } }) as unknown as ModelResult)))];
  for (const t of o.yTicks) body.push(`<line class="grid" x1="${L}" x2="${w - R}" y1="${fy(t)}" y2="${fy(t)}"/><text class="s m" x="${L - 8}" y="${fy(t) + 4}" text-anchor="end">${t}</text>`);
  for (const t of o.xTicks) body.push(`<line class="grid" x1="${fx(t)}" x2="${fx(t)}" y1="${T}" y2="${T + ph}"/><text class="s m" x="${fx(t)}" y="${T + ph + 16}" text-anchor="middle">${t}</text>`);
  body.push(`<text class="s m" x="${L + pw / 2}" y="${h - 8}" text-anchor="middle">${esc(o.xLabel)}</text><text class="s m" transform="translate(14 ${T + ph / 2}) rotate(-90)" text-anchor="middle">${esc(o.yLabel)}</text>`);
  const labelled = new Set([...pts].sort((a, b) => b.y - a.y).slice(0, o.labelTop ?? 6).map((p) => p.label));
  for (const p of pts) body.push(`<g><title>${esc(p.tip)}</title><circle cx="${fx(p.x)}" cy="${fy(p.y)}" r="6" fill="${PLACEMENT_COLOR[p.k]}" stroke="var(--ring)" stroke-width="2"/>${labelled.has(p.label) ? `<text class="s" x="${fx(p.x) + 9}" y="${fy(p.y) + 4}">${esc(cut(p.label, 22))}</text>` : ""}</g>`);
  return wrap(w, h, o.title, body.join(""), !!o.standalone, `${pts.length} models`);
}

/** Quality against writing speed: the best models are up and to the right. */
export function qualitySpeedSvg(all: ModelResult[], standalone = false): string {
  const rs = all.filter((r) => r.summary.quality !== null && r.summary.tokPerSec);
  return scatter(rs.map((r) => ({ x: r.summary.tokPerSec!, y: r.summary.quality!, label: r.name, k: runsOf(r), tip: `${r.name}: quality ${num(r.summary.quality!, 0)}, ${num(r.summary.tokPerSec!)} tokens/s, ${num(r.sizeGB)} GB, ${PLACEMENT_LABEL[runsOf(r)]}` })),
    { title: "Quality against speed", xLabel: "tokens per second (log scale)", yLabel: "quality, 0 to 100", xLog: true, yMax: 100, xTicks: [2, 5, 10, 20, 50, 100].filter((t) => t >= Math.min(...rs.map((r) => r.summary.tokPerSec!)) / 1.5 && t <= Math.max(...rs.map((r) => r.summary.tokPerSec!)) * 1.5), yTicks: [0, 25, 50, 75, 100], standalone });
}

/** How much each model weighs on disk, against how fast it writes. */
export function speedSizeSvg(all: ModelResult[], standalone = false): string {
  const rs = all.filter((r) => r.summary.tokPerSec);
  return scatter(rs.map((r) => ({ x: r.sizeGB, y: r.summary.tokPerSec!, label: r.name, k: runsOf(r), tip: `${r.name}: ${num(r.summary.tokPerSec!)} tokens/s, ${num(r.sizeGB)} GB` })),
    { title: "Speed against size", xLabel: "model size on disk, GB", yLabel: "tokens per second (log scale)", yLog: true, xTicks: [1, 2, 3, 4, 5, 6, 7].filter((t) => t <= Math.max(...rs.map((r) => r.sizeGB)) + 1), yTicks: [2, 5, 10, 20, 50, 100].filter((t) => t >= Math.min(...rs.map((r) => r.summary.tokPerSec!)) / 1.5 && t <= Math.max(...rs.map((r) => r.summary.tokPerSec!)) * 1.5), labelTop: 5, standalone });
}

/** Quality against size: does a bigger model pay off? */
export function qualitySizeSvg(all: ModelResult[], standalone = false): string {
  const rs = all.filter((r) => r.summary.quality !== null);
  return scatter(rs.map((r) => ({ x: r.sizeGB, y: r.summary.quality!, label: r.name, k: runsOf(r), tip: `${r.name}: quality ${num(r.summary.quality!, 0)}, ${num(r.sizeGB)} GB` })),
    { title: "Quality against size", xLabel: "model size on disk, GB", yLabel: "quality, 0 to 100", yMax: 100, xTicks: [1, 2, 3, 4, 5, 6, 7].filter((t) => t <= Math.max(...rs.map((r) => r.sizeGB)) + 1), yTicks: [0, 25, 50, 75, 100], standalone });
}

const SHORT: Record<string, string> = {
  writing_fr: "Write FR", writing_en: "Write EN", rewrite: "Rewrite", creative: "Creative", translate_fr: "Transl. FR", translate_other: "Other lang.",
  math: "Maths", reasoning: "Logic", planning: "Planning", knowledge: "Facts", honesty: "Honesty", long_context: "Long text", instruction: "Orders",
  structured: "JSON/CSV", data: "Tables", tools: "Tools", web_search: "Web search", chat: "Chat", fast: "Quick", safety: "Safety",
  code_python: "Python", code_js: "JavaScript", code_html: "HTML", code_css: "CSS", code_web: "Pages", code_sql: "SQL", code_shell: "Shell/regex", code_repair: "Fix code", code_explain: "Explain code"
};

/** Every model against every section: where each is strong or weak. */
export function heatmapSvg(all: ModelResult[], o: { rows?: number; standalone?: boolean } = {}): string {
  const rs = all.filter((r) => r.summary.quality !== null).sort((a, b) => b.summary.quality! - a.summary.quality!).slice(0, o.rows ?? 40);
  const secs = BENCH_SECTIONS.map((s) => s.id).filter((id) => rs.some((r) => r.summary.bySection[id] !== undefined));
  const L = 200, T = 120, cw = 30, rh = 22, w = L + secs.length * cw + 20, h = T + rs.length * rh + 40;
  const body = [`<text class="h" x="12" y="22">Score of each model in each section</text>`, `<text class="s m" x="12" y="40">darker is better, 0 to 100</text>`];
  secs.forEach((id, j) => body.push(`<text class="s m" transform="translate(${L + j * cw + cw / 2 + 4} ${T - 6}) rotate(-55)">${esc(SHORT[id] ?? id)}</text>`));
  rs.forEach((r, i) => {
    const y = T + i * rh;
    body.push(`<text x="12" y="${y + 15}">${esc(cut(r.name, 27))}</text>`);
    secs.forEach((id, j) => {
      const v = r.summary.bySection[id];
      const x = L + j * cw;
      if (v === undefined) { body.push(`<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" rx="3" fill="none" stroke="var(--grid)" stroke-dasharray="3 2"/>`); return; }
      body.push(`<g><title>${esc(`${r.name}, ${SECTION_INFO[id].label}: ${num(v, 0)}/100`)}</title><rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" rx="3" fill="color-mix(in oklab, var(--seq) ${Math.round(8 + v * 0.92)}%, var(--bg))"/><text class="s" x="${x + cw / 2}" y="${y + 15}" text-anchor="middle" style="fill:${v >= 55 ? "#fff" : "var(--ink)"}">${num(v, 0)}</text></g>`);
    });
  });
  return wrap(w, h, "Score of each model in each section", body.join(""), !!o.standalone, `${rs.length} models, ${secs.length} sections`);
}

function stacked(s: Share, x: number, y: number, w: number, label: string, labelW: number): string {
  const parts = (["npu", "mixed", "cpu", "unknown"] as RunsOn[]).map((k) => [k, s[k]] as const).filter(([, n]) => n > 0);
  let cx = x + labelW;
  const bw = w - labelW;
  const out = [`<text x="${x}" y="${y + 15}">${esc(cut(label, 22))}</text><text class="s m" x="${x}" y="${y + 29}">${s.total} model${s.total === 1 ? "" : "s"}</text>`];
  for (const [k, n] of parts) {
    const sw = (n / s.total) * bw;
    out.push(`<g><title>${esc(`${label}: ${n} of ${s.total} (${pct(n, s.total)}%) run on ${PLACEMENT_LABEL[k]}`)}</title><rect x="${cx + 1}" y="${y}" width="${Math.max(1, sw - 2)}" height="26" rx="4" fill="${PLACEMENT_COLOR[k]}"/>${sw > 54 ? `<text x="${cx + sw / 2}" y="${y + 17}" text-anchor="middle" style="fill:#fff;font-weight:600">${pct(n, s.total)}%</text>` : ""}</g>`);
    cx += sw;
  }
  return out.join("");
}

/** The share of models that ran on the NPU, on the CPU, or on both: overall, by size, by origin. */
export function placementSvg(st: BenchStats, all: ModelResult[], standalone = false): string {
  const rows: Share[] = [st.placement, ...st.placementBySize, ...st.placementBySource];
  const w = 640, top = 60, rh = 44, h = top + rows.length * rh + 12;
  const body = [`<text class="h" x="12" y="22">Where the models ran</text>`, legend(12, 42, present(all))];
  rows.forEach((s, i) => body.push(stacked(s, 12, top + i * rh, w - 24, s.label, 150)));
  return wrap(w, h, "Where the models ran", body.join(""), standalone, rows.map((s) => `${s.label}: ${s.npu} NPU, ${s.mixed} both, ${s.cpu} CPU, ${s.unknown} unknown`).join("; "));
}

/** How hard each section was: the mean, with the range between the worst and the best model. */
export function sectionsSvg(st: BenchStats, standalone = false): string {
  const rows = [...st.bySection].sort((a, b) => a.mean - b.mean);
  const left = 190, barW = 330, top = 52, rh = 22, w = left + barW + 90, h = top + rows.length * rh + 12;
  const body = [`<text class="h" x="12" y="22">How hard each section was</text>`, `<text class="s m" x="12" y="40">bar: mean score of all models · line: worst to best model</text>`];
  rows.forEach((s, i) => {
    const y = top + i * rh, bw = Math.max(2, (s.mean / 100) * barW);
    body.push(`<g><title>${esc(`${s.label}: mean ${num(s.mean, 0)}, median ${num(s.median, 0)}, best ${s.best.name} ${num(s.best.score, 0)}, worst ${s.worst.name} ${num(s.worst.score, 0)}`)}</title><text x="12" y="${y + 15}">${esc(cut(s.label, 26))}</text><path d="M${left} ${y + 4}h${bw - 4}a4 4 0 0 1 4 4v6a4 4 0 0 1 -4 4h-${bw - 4}z" fill="var(--seq)" opacity=".75"/><line x1="${left + (s.worst.score / 100) * barW}" x2="${left + (s.best.score / 100) * barW}" y1="${y + 11}" y2="${y + 11}" stroke="var(--ink)" stroke-width="2"/><text class="s m" x="${left + barW + 10}" y="${y + 15}">${num(s.mean, 0)}</text></g>`);
  });
  return wrap(w, h, "How hard each section was", body.join(""), standalone);
}

export interface WarmupInfo { minutes: number; model: string; series: { t: number; tps: number | null }[]; startTps: number | null; endTps: number | null }

/** How fast the warm-up model wrote while the NPU was kept busy: a line that falls shows a chip that slows down as it heats. */
export function warmupSvg(w: WarmupInfo, standalone = false): string {
  const pts = w.series.filter((p) => p.tps !== null) as { t: number; tps: number }[];
  const W = 640, H = 300, L = 56, R = 20, T = 56, B = 44, pw = W - L - R, ph = H - T - B;
  const tmax = Math.max(1, ...pts.map((p) => p.t), w.minutes), vmax = Math.max(1, ...pts.map((p) => p.tps), w.startTps ?? 0, w.endTps ?? 0) * 1.15;
  const fx = (t: number) => L + (t / tmax) * pw, fy = (v: number) => T + ph - (v / vmax) * ph;
  const body = [`<text class="h" x="12" y="22">Speed while the NPU was kept busy</text>`, `<text class="s m" x="12" y="40">${esc(w.model)} writing without stopping for ${w.minutes} minutes</text>`];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(vmax * f));
  for (const t of ticks) body.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${fy(t)}" y2="${fy(t)}"/><text class="s m" x="${L - 8}" y="${fy(t) + 4}" text-anchor="end">${t}</text>`);
  for (let m = 0; m <= tmax; m += Math.max(1, Math.round(tmax / 6))) body.push(`<text class="s m" x="${fx(m)}" y="${T + ph + 16}" text-anchor="middle">${m}</text>`);
  body.push(`<text class="s m" x="${L + pw / 2}" y="${H - 6}" text-anchor="middle">minutes</text><text class="s m" transform="translate(14 ${T + ph / 2}) rotate(-90)" text-anchor="middle">tokens per second</text>`);
  if (pts.length > 1) body.push(`<path d="${pts.map((p, i) => `${i ? "L" : "M"}${fx(p.t)} ${fy(p.tps)}`).join("")}" fill="none" stroke="var(--npu)" stroke-width="2" stroke-linejoin="round"/>`);
  for (const p of pts) body.push(`<g><title>${esc(`${num(p.t)} min: ${num(p.tps)} tokens/s`)}</title><circle cx="${fx(p.t)}" cy="${fy(p.tps)}" r="4" fill="var(--npu)" stroke="var(--ring)" stroke-width="2"/></g>`);
  if (w.startTps !== null) body.push(`<g><title>${esc(`Same short test just after the warm-up: ${num(w.startTps)} tokens/s`)}</title><circle cx="${fx(tmax)}" cy="${fy(w.startTps)}" r="5" fill="var(--cpu)" stroke="var(--ring)" stroke-width="2"/></g><text class="s" x="${fx(tmax) - 8}" y="${fy(w.startTps) - 9}" text-anchor="end">after warm-up ${num(w.startTps)}</text>`);
  if (w.endTps !== null) body.push(`<text class="s m" x="${W - R}" y="${T - 8}" text-anchor="end">end of run ${num(w.endTps)} tok/s</text>`);
  return wrap(W, H, "Speed while the NPU was kept busy", body.join(""), standalone, `${pts.length} samples`);
}

/** Every chart of the report, by file name. */
export function allCharts(all: ModelResult[], st: BenchStats, warmup?: WarmupInfo | null): Record<string, string> {
  return {
    ...(warmup && warmup.series.filter((p) => p.tps !== null).length > 1 ? { "warmup.svg": warmupSvg(warmup, true) } : {}),
    "leaderboard.svg": leaderboardSvg(all, { standalone: true }),
    "placement.svg": placementSvg(st, all, true),
    "quality-vs-speed.svg": qualitySpeedSvg(all, true),
    "quality-vs-size.svg": qualitySizeSvg(all, true),
    "speed-vs-size.svg": speedSizeSvg(all, true),
    "heatmap.svg": heatmapSvg(all, { standalone: true }),
    "sections.svg": sectionsSvg(st, true)
  };
}
