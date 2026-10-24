// A pretend benchmark for `npm run dev:renderer`: fixtures and a timer that play a run, so the dashboard can be seen without a laptop.
import type { ModelResult } from "../core/bench";
import { BENCH_SECTIONS } from "../core/benchSections";
import type { BenchLive, BenchSample, BenchState } from "../core/benchRunner";
import type { RunsOn } from "../core/placement";

const rnd = (seed: number) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

const MODELS: { name: string; size: number; q: number; tps: number; runs: RunsOn; source: string; think?: "none" | "toggle" | "always" }[] = [
  { name: "Qwen3-8B", size: 4.8, q: 79, tps: 7.7, runs: "npu", source: "Dynamic 9B", think: "toggle" },
  { name: "Qwen3-4B-Instruct-2507", size: 2.4, q: 74, tps: 15.5, runs: "npu", source: "Dynamic 4B" },
  { name: "Gemma-4-E4B-it", size: 5.2, q: 77, tps: 8.4, runs: "npu", source: "Specialists" },
  { name: "Phi-4-mini-reasoning", size: 2.3, q: 66, tps: 16.2, runs: "npu", source: "Specialists", think: "always" },
  { name: "TranslateGemma-4B-it", size: 2.4, q: 58, tps: 15.1, runs: "npu", source: "Specialists" },
  { name: "LFM2-1.2B-Extract", size: 0.7, q: 41, tps: 52, runs: "npu", source: "Specialists" },
  { name: "xLAM-2-3B-fc-r", size: 1.8, q: 52, tps: 21, runs: "mixed", source: "Specialists" },
  { name: "Qwen2.5-Coder-7B-Instruct", size: 4.4, q: 63, tps: 8.4, runs: "npu", source: "Dynamic 9B" },
  { name: "Ministral-3-8B-Instruct", size: 4.9, q: 72, tps: 7.9, runs: "cpu", source: "Specialists" },
  { name: "Qwen3.5-9B", size: 5.4, q: 81, tps: 6.9, runs: "npu", source: "Dynamic 9B", think: "toggle" },
  { name: "Gemma-3-1B-it", size: 0.7, q: 39, tps: 51, runs: "npu", source: "Dynamic 2B" },
  { name: "Seed-Coder-8B-Instruct", size: 4.8, q: 61, tps: 7.8, runs: "cpu", source: "Specialists" }
];

export const MOCK_TAGS: Record<string, string[]> = { "TranslateGemma-4B-it": ["translate_fr", "translate_other"], "LFM2-1.2B-Extract": ["structured"], "xLAM-2-3B-fc-r": ["tools"], "Phi-4-mini-reasoning": ["math", "reasoning"], "Seed-Coder-8B-Instruct": ["code"] };

export function mockResults(): ModelResult[] {
  return MODELS.map((m, i) => {
    const r = rnd(7 + i * 31);
    const bySection: Record<string, number> = {};
    for (const s of BENCH_SECTIONS) bySection[s.id] = Math.round(Math.max(0, Math.min(100, m.q + (r() - 0.5) * 50)));
    return {
      key: `m${i}`, name: m.name, ref: m.name, sizeGB: m.size, paramsB: m.size * 1.7, source: m.source, thinking: m.think ?? "none", mode: "express",
      startedAt: "", finishedAt: "x", wasInstalled: false, installSec: 40, coldStartSec: Math.round((8 + m.size * 4) * 10) / 10, npuMemGB: m.runs === "npu" ? m.size : 0.2,
      placement: { asked: "npu", npuUtilPeak: m.runs === "cpu" ? 1 : 80, npuMemDeltaGB: m.runs === "cpu" ? 0 : m.size, cpuBusyPct: m.runs === "npu" ? 12 : 82, logHint: null, sizeGB: m.size, runsOn: m.runs, evidence: [m.runs === "npu" ? "NPU utilization peaked at 80%" : "CPU was 82% busy while it answered"] },
      tests: Array.from({ length: 13 }, (_, k) => ({ id: `t${k}`, section: "math" as const, title: `Test ${k}`, score: 0.5, note: "", answer: "", thinking: "", asked: { maxTokens: 1, effort: null }, ttftSec: 1, tokPerSec: m.tps, tokens: 60, totalSec: 6, finish: "stop" })),
      summary: { quality: m.q, ttftSec: Math.round((0.3 + m.size * 0.2) * 100) / 100, tokPerSec: m.tps, bySection, ran: 13, failed: 0 }
    } as unknown as ModelResult;
  });
}

const TEXTS = [
  "Subject: Moving our weekly meeting\n\nBonjour Marc,\n\nCould we move our Tuesday 2 pm check-in to Thursday at 10 am? I have a client meeting that clashes with it.\n\nThank you for understanding,\nFabien",
  "- The tram network closes for six weeks from 12 March.\n- Works cost 18 million euros, 40% from a European fund.\n- Buses replace trams every ten minutes until 24 June.",
  "def fizzbuzz(n):\n    out = []\n    for i in range(1, n + 1):\n        out.append('FizzBuzz' if i % 15 == 0 else 'Fizz' if i % 3 == 0 else 'Buzz' if i % 5 == 0 else str(i))\n    return out"
];

/** Plays a run of the first few mock models and tells the window as it goes. */
export function createMockBench(onState: (s: BenchState) => void, onLive: (l: BenchLive) => void) {
  const idle = (): BenchState => ({ running: false, phase: "idle", runDir: null, summaryFile: null, mode: "express", modelIndex: 0, modelCount: 0, current: null, testIndex: 0, testCount: 0, currentTest: null, startedAt: null, rows: [], log: [], percent: 0, elapsedSec: 0, etaSec: null, series: [], currentTests: [], currentSizeGB: null, warmupLeftSec: null, phaseStartedAt: Date.now(), warmupPending: false });
  let st = idle();
  let timer: ReturnType<typeof setInterval> | undefined;
  const all = mockResults();
  const put = (p: Partial<BenchState>) => { st = { ...st, ...p }; onState(st); };
  return {
    state: () => st,
    results: () => all.slice(0, st.rows.length),
    stop() { if (timer) clearInterval(timer); put({ running: false, phase: "stopped" }); },
    start(count = 6) {
      const total = count, tests = 13;
      put({ ...idle(), running: true, phase: "loading", modelCount: total, modelIndex: 1, current: MODELS[0].name, testCount: tests, startedAt: Date.now(), currentSizeGB: MODELS[0].size });
      let tick = 0;
      const r = rnd(3);
      timer = setInterval(() => {
        tick++;
        if (tick <= 5) {
          const w = MODELS[0], text = "The lighthouse stood on the northern edge of the island, and for three generations the family that kept it had measured their lives in the turning of its lamp. ";
          put({ phase: "warming", warmupLeftSec: (6 - tick) * 100, series: [...st.series, { t: tick, cpu: 9 + r() * 6, ramPct: 88 + r(), npu: 92 + r() * 8, npuMemGB: w.size, tokPerSec: w.tps * (1.02 - tick * 0.01) }].slice(-180), percent: tick * 0.8, elapsedSec: tick * 20, etaSec: 1500 });
          onLive({ model: w.name, testId: "warmup", test: "Warming up the NPU", section: "chat", prompt: "An essay about the history of the lighthouse, to keep the NPU busy.", answer: text.repeat(tick).slice(-600), thinking: "", tokens: tick * 80, ttftSec: 0.9, tokPerSec: w.tps, elapsedSec: tick * 8, done: false, warmup: true });
          return;
        }
        tick -= 0;
        const perModel = 16; // ticks per model: 2 to load, 13 tests, 1 to remove
        const mi = Math.min(total, Math.floor((tick - 5) / perModel) + 1), within = (tick - 5) % perModel;
        const m = MODELS[mi - 1];
        const tIdx = Math.max(0, within - 2);
        const phase = within < 2 ? "loading" : within === 15 ? "removing" : "testing";
        const rows = all.slice(0, mi - 1).map((x) => ({ key: x.key, name: x.name, sizeGB: x.sizeGB, quality: x.summary.quality, runsOn: x.placement!.runsOn, bySection: x.summary.bySection, ttftSec: x.summary.ttftSec, tokPerSec: x.summary.tokPerSec, coldStartSec: x.coldStartSec, ran: 13, failed: 0, file: `/r/${x.key}.json` }));
        const sample: BenchSample = { t: tick, cpu: m.runs === "npu" ? 8 + r() * 10 : 70 + r() * 20, ramPct: 88 + r() * 4, npu: m.runs === "cpu" ? 0 : phase === "testing" ? 60 + r() * 40 : 2, npuMemGB: m.runs === "cpu" ? 0.1 : phase === "loading" && within < 1 ? 0.1 : m.size, tokPerSec: phase === "testing" ? m.tps * (0.9 + r() * 0.2) : null };
        const done = Math.min(tests, tIdx);
        const pctDone = ((mi - 1 + (phase === "testing" ? 0.3 + 0.68 * (tIdx / tests) : 0.1)) / total) * 100;
        const finished = tick - 5 >= perModel * total;
        put({ modelIndex: mi, current: m.name, phase: finished ? "done" : (phase as BenchState["phase"]), testIndex: tIdx, currentTest: `Test ${tIdx}`, rows: finished ? all.slice(0, total).map((x) => ({ key: x.key, name: x.name, sizeGB: x.sizeGB, quality: x.summary.quality, runsOn: x.placement!.runsOn, bySection: x.summary.bySection, ttftSec: x.summary.ttftSec, tokPerSec: x.summary.tokPerSec, coldStartSec: x.coldStartSec, ran: 13, failed: 0, file: `/r/${x.key}.json` })) : rows, percent: finished ? 100 : Math.round(pctDone * 10) / 10, elapsedSec: tick * 20, etaSec: finished ? null : Math.round((total * perModel - (tick - 5)) * 20), warmupLeftSec: null, running: !finished, series: [...st.series, sample].slice(-180), currentSizeGB: m.size,
          currentTests: phase === "testing" ? Array.from({ length: done }, (_, k) => ({ id: `t${k}`, title: `Test ${k}`, section: BENCH_SECTIONS[k % BENCH_SECTIONS.length].id, score: k === 4 ? 0 : Math.max(0.1, Math.min(1, m.q / 100 + (r() - 0.5) * 0.7)), note: k === 4 ? "missing: the date" : "all good", ttftSec: 0.8, tokPerSec: m.tps, error: false, skipped: false })) : [] });
        if (finished) { clearInterval(timer); return; }
        if (phase === "testing") {
          const text = TEXTS[tIdx % TEXTS.length], shown = text.slice(0, Math.floor(text.length * Math.min(1, (r() + 0.4) * 0.9)));
          onLive({ model: m.name, testId: `t${tIdx}`, test: `Test ${tIdx}`, section: BENCH_SECTIONS[tIdx % BENCH_SECTIONS.length].id, prompt: "Write a short, polite email in English declining a job offer from Acme Corp for the position of data analyst, because I accepted another offer.", answer: shown, thinking: m.think === "always" ? "The user wants a short polite email… " : "", tokens: Math.round(shown.length / 4), ttftSec: 0.9, tokPerSec: m.tps, elapsedSec: 4.2, done: shown.length === text.length, score: 0.8, note: "all good" });
        }
      }, 1200);
    }
  };
}
