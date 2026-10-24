import type { ModelResult } from "./bench";
import { BENCH_SECTIONS, BenchSection, SECTION_INFO } from "./benchSections";
import type { RunsOn } from "./placement";

/**
 * What the results say, beyond a ranking: where the models ran (NPU, CPU, both), how size relates to quality and speed, which
 * sections are hard, whether the specialists keep their promise, which small model is worth its size. Pure and free of Node, so
 * the window, the exported report and the tests all read the same figures.
 */

export interface Share { label: string; npu: number; cpu: number; mixed: number; unknown: number; total: number }
export interface SectionStat { id: BenchSection; label: string; group: string; n: number; mean: number; median: number; spread: number; best: { name: string; score: number }; worst: { name: string; score: number } }
export interface SpecialistCheck {
  name: string;
  claim: string;
  sections: BenchSection[];
  score: number;
  rank: number;
  of: number;
  /** Median of every model on the same sections. */
  median: number;
  /** The best model that is not a specialist on those sections, and what it scored. */
  bestOther: { name: string; score: number } | null;
  verdict: "confirmed" | "average" | "disappointing";
}

export interface BenchStats {
  models: number;
  tests: number;
  failedTests: number;
  tokens: number;
  testSeconds: number;
  placement: Share;
  placementBySize: Share[];
  placementBySource: Share[];
  quality: { mean: number; median: number; min: number; max: number } | null;
  speed: { medianTokPerSec: number | null; medianTtftSec: number | null; fastest: { name: string; tokPerSec: number } | null; slowest: { name: string; tokPerSec: number } | null };
  bySection: SectionStat[];
  correlations: { sizeQuality: number | null; sizeSpeed: number | null; speedQuality: number | null };
  bestPerGB: { name: string; sizeGB: number; quality: number; perGB: number }[];
  bestSmall: { name: string; sizeGB: number; quality: number } | null;
  fastestGood: { name: string; tokPerSec: number; quality: number } | null;
  coldStartBySize: { label: string; medianSec: number; n: number }[];
  byThinking: { label: string; n: number; quality: number | null; tokPerSec: number | null }[];
  specialists: SpecialistCheck[];
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 4) return null;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? Math.round((sab / Math.sqrt(saa * sbb)) * 100) / 100 : null;
}

export const SIZE_BUCKETS: { label: string; max: number }[] = [
  { label: "up to 1.5 GB", max: 1.5 }, { label: "1.5 to 3 GB", max: 3 }, { label: "3 to 4.5 GB", max: 4.5 }, { label: "over 4.5 GB", max: Infinity }
];
export const bucketOf = (gb: number) => SIZE_BUCKETS.find((b) => gb <= b.max)!.label;

/** What a specialist's tags mean in sections: "tools" is the tool-calling section, "code" is the three code sections that run or fix code. */
export const TAG_SECTIONS: Record<string, BenchSection[]> = {
  writing_fr: ["writing_fr"], writing_en: ["writing_en"], translate_fr: ["translate_fr"], translate_other: ["translate_other"],
  tools: ["tools"], structured: ["structured", "data"], math: ["math"], reasoning: ["reasoning"], code: ["code_python", "code_js", "code_repair"],
  web_search: ["web_search"], long_context: ["long_context"], knowledge: ["knowledge", "honesty"], creative: ["creative"], rewrite: ["rewrite"],
  chat: ["chat"], instruction: ["instruction"], fast: ["fast"]
};

function share(label: string, rs: ModelResult[]): Share {
  const c: Share = { label, npu: 0, cpu: 0, mixed: 0, unknown: 0, total: rs.length };
  for (const r of rs) c[(r.placement?.runsOn ?? "unknown") as RunsOn]++;
  return c;
}

/** `tags` is what each specialist is known for, by model name (from bench-candidates.json). */
export function computeStats(all: ModelResult[], tags: Record<string, string[]> = {}): BenchStats {
  const rs = all.filter((r) => r.summary.ran > 0);
  const ran = rs.flatMap((r) => r.tests.filter((t) => !t.skipped));
  const q = rs.map((r) => r.summary.quality).filter((x): x is number => x !== null);
  const withSpeed = rs.filter((r) => r.summary.tokPerSec);
  const secs = BENCH_SECTIONS.map((s) => s.id).filter((id) => rs.some((r) => r.summary.bySection[id] !== undefined));
  const bySection: SectionStat[] = secs.map((id) => {
    const rows = rs.filter((r) => r.summary.bySection[id] !== undefined).map((r) => ({ name: r.name, score: r.summary.bySection[id]! }));
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    return { id, label: SECTION_INFO[id].label, group: SECTION_INFO[id].group, n: rows.length, mean: r1(mean(rows.map((x) => x.score))!), median: r1(median(rows.map((x) => x.score))!), spread: r1(sorted[0].score - sorted[sorted.length - 1].score), best: sorted[0], worst: sorted[sorted.length - 1] };
  });
  const sizeQ = rs.filter((r) => r.summary.quality !== null);
  const sizeS = withSpeed;

  const perGB = rs.filter((r) => r.summary.quality !== null && r.sizeGB > 0)
    .map((r) => ({ name: r.name, sizeGB: r.sizeGB, quality: r.summary.quality!, perGB: r1(r.summary.quality! / r.sizeGB) }))
    .sort((a, b) => b.perGB - a.perGB).slice(0, 5);
  const small = rs.filter((r) => r.sizeGB <= 3 && r.summary.quality !== null).sort((a, b) => b.summary.quality! - a.summary.quality!)[0];
  const medQ = median(q) ?? 0;
  const goodFast = withSpeed.filter((r) => (r.summary.quality ?? 0) >= medQ).sort((a, b) => b.summary.tokPerSec! - a.summary.tokPerSec!)[0];
  const sortedSpeed = [...withSpeed].sort((a, b) => b.summary.tokPerSec! - a.summary.tokPerSec!);

  // does each specialist deliver what it is known for?
  const specialists: SpecialistCheck[] = [];
  for (const r of rs.filter((x) => x.source === "Specialists")) {
    const tg = tags[r.name] ?? [];
    const sections = [...new Set(tg.flatMap((t) => TAG_SECTIONS[t] ?? []))].filter((id) => r.summary.bySection[id] !== undefined);
    if (!sections.length) continue;
    const scoreOf = (m: ModelResult) => mean(sections.map((id) => m.summary.bySection[id]).filter((x): x is number => x !== undefined));
    const mine = scoreOf(r);
    if (mine === null) continue;
    const field = rs.map((m) => ({ m, s: scoreOf(m) })).filter((x): x is { m: ModelResult; s: number } => x.s !== null);
    const rank = 1 + field.filter((x) => x.s > mine).length;
    const med = median(field.map((x) => x.s)) ?? 0;
    const other = field.filter((x) => x.m.source !== "Specialists").sort((a, b) => b.s - a.s)[0];
    specialists.push({
      name: r.name, claim: tg.join(", "), sections, score: r1(mine), rank, of: field.length, median: r1(med),
      bestOther: other ? { name: other.m.name, score: r1(other.s) } : null,
      verdict: rank <= Math.max(1, Math.ceil(field.length * 0.2)) ? "confirmed" : mine >= med ? "average" : "disappointing"
    });
  }
  specialists.sort((a, b) => a.rank / a.of - b.rank / b.of);

  const thinkLabel = { none: "does not think", toggle: "can switch thinking off", always: "always thinks" } as const;
  return {
    models: rs.length,
    tests: ran.length,
    failedTests: ran.filter((t) => t.error).length,
    tokens: ran.reduce((a, t) => a + t.tokens, 0),
    testSeconds: Math.round(ran.reduce((a, t) => a + t.totalSec, 0)),
    placement: share("all models", rs),
    placementBySize: SIZE_BUCKETS.map((b) => share(b.label, rs.filter((r) => bucketOf(r.sizeGB) === b.label))).filter((s) => s.total > 0),
    placementBySource: [...new Set(rs.map((r) => (r.source.startsWith("Dynamic") ? "Dynamic packs" : r.source)))].map((src) => share(src, rs.filter((r) => (r.source.startsWith("Dynamic") ? "Dynamic packs" : r.source) === src))),
    quality: q.length ? { mean: r1(mean(q)!), median: r1(median(q)!), min: Math.min(...q), max: Math.max(...q) } : null,
    speed: {
      medianTokPerSec: median(withSpeed.map((r) => r.summary.tokPerSec!)) !== null ? r1(median(withSpeed.map((r) => r.summary.tokPerSec!))!) : null,
      medianTtftSec: median(rs.map((r) => r.summary.ttftSec).filter((x): x is number => !!x)),
      fastest: sortedSpeed[0] ? { name: sortedSpeed[0].name, tokPerSec: sortedSpeed[0].summary.tokPerSec! } : null,
      slowest: sortedSpeed.length ? { name: sortedSpeed[sortedSpeed.length - 1].name, tokPerSec: sortedSpeed[sortedSpeed.length - 1].summary.tokPerSec! } : null
    },
    bySection,
    correlations: {
      sizeQuality: pearson(sizeQ.map((r) => r.sizeGB), sizeQ.map((r) => r.summary.quality!)),
      sizeSpeed: pearson(sizeS.map((r) => Math.log(r.sizeGB)), sizeS.map((r) => Math.log(r.summary.tokPerSec!))),
      speedQuality: pearson(sizeS.filter((r) => r.summary.quality !== null).map((r) => Math.log(r.summary.tokPerSec!)), sizeS.filter((r) => r.summary.quality !== null).map((r) => r.summary.quality!))
    },
    bestPerGB: perGB,
    bestSmall: small ? { name: small.name, sizeGB: small.sizeGB, quality: small.summary.quality! } : null,
    fastestGood: goodFast ? { name: goodFast.name, tokPerSec: goodFast.summary.tokPerSec!, quality: goodFast.summary.quality! } : null,
    coldStartBySize: SIZE_BUCKETS.map((b) => {
      const v = rs.filter((r) => bucketOf(r.sizeGB) === b.label && r.coldStartSec !== null).map((r) => r.coldStartSec!);
      return { label: b.label, medianSec: r1(median(v) ?? 0), n: v.length };
    }).filter((x) => x.n > 0),
    byThinking: (["none", "toggle", "always"] as const).map((k) => {
      const g = rs.filter((r) => r.thinking === k);
      return { label: thinkLabel[k], n: g.length, quality: g.length ? r1(mean(g.map((r) => r.summary.quality ?? 0))!) : null, tokPerSec: g.filter((r) => r.summary.tokPerSec).length ? r1(mean(g.filter((r) => r.summary.tokPerSec).map((r) => r.summary.tokPerSec!))!) : null };
    }).filter((x) => x.n > 0),
    specialists
  };
}

export const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
