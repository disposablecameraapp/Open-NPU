/**
 * About how long a benchmark run takes. Kept apart from the tests so the window can use it: the tests run code and need Node,
 * the window does not. The main process sends the cost of each test (answer limit, thinking, long prompt) with the roster.
 */
export type BenchMode = "express" | "quick" | "full";
export interface TestCost { maxTokens: number; think?: boolean; minContext?: number }

/**
 * Speed on the NPU is about 37 GB/s of memory bandwidth divided by the file size; a test answers about a third of its limit.
 * A guess: it is shown so a run can be planned, and the real speeds replace it as soon as models have been run.
 */
export function estimateRun(targets: { sizeGB: number; installed?: boolean }[], mode: BenchMode, costs: TestCost[], mbPerSec = 50): { inferenceMin: number; downloadMin: number; totalMin: number; downloadGB: number } {
  const cap = mode === "express" ? 160 : Infinity;
  let sec = 0, dl = 0;
  for (const t of targets) {
    const v = Math.min(60, Math.max(4, 37 / t.sizeGB));
    sec += 25 + (mode === "express" ? 20 : 40) + (mode === "express" ? 70 : 220) / v; // loading, the NPU/CPU check
    for (const x of costs) sec += (Math.min(x.maxTokens, cap) * 0.35 + (x.think ? 250 : 0)) / v + 1.5 + (x.minContext ? 25 : 0);
    if (!t.installed) dl += t.sizeGB;
  }
  const downloadMin = (dl * 1000) / mbPerSec / 60;
  return { inferenceMin: Math.round(sec / 60), downloadMin: Math.round(downloadMin), totalMin: Math.round(sec / 60 + downloadMin), downloadGB: Math.round(dl * 10) / 10 };
}
