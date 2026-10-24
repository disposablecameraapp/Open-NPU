/**
 * Does a model really run on the NPU? GenieX is started with --compute npu, but that is a request, not proof: a model that
 * cannot be placed may fall back to the CPU. Proof comes from measuring while the model generates: the NPU's own counters
 * (utilization, memory taken since before the model was loaded) and how busy the CPU is. Several signals are combined because
 * any one can be missing (no NPU counters on this PC) or misleading.
 */
export type RunsOn = "npu" | "cpu" | "mixed" | "unknown";

export interface PlacementInput {
  /** What the server was asked: --compute npu or cpu. */
  asked: "npu" | "cpu";
  /** Peak NPU utilization seen during generation, null when Windows gives no counter. */
  npuUtilPeak: number | null;
  /** NPU memory in use during generation minus before the model was loaded, GB; null without counters. */
  npuMemDeltaGB: number | null;
  /** Share of all CPU cores busy during generation, 0 to 100. */
  cpuBusyPct: number | null;
  /** What the server's own log says about where the model was loaded. */
  logHint: "npu" | "cpu" | null;
  sizeGB: number;
}

export interface Placement extends PlacementInput {
  runsOn: RunsOn;
  /** Why, in short sentences. */
  evidence: string[];
}

const CPU_BUSY = 55;
const NPU_UTIL = 8;

/** Reads the server log for where the layers went. The wording is a guess at llama.cpp / GenieX output, matched loosely. */
export function logPlacement(lines: string[]): "npu" | "cpu" | null {
  const text = lines.join("\n");
  const npu = /ggml-hex|hexagon|\bhtp\b|\bqnn\b|\bdsp\b|offload(?:ed|ing)[^\n]*(?:npu|hexagon)|backend[^\n]*npu/i.test(text);
  const cpu = /(?:compute|backend|device)[^\n]*\bcpu\b(?!.*npu)|falling back to cpu|fallback to cpu|using cpu\b/i.test(text);
  if (npu && !cpu) return "npu";
  if (cpu && !npu) return "cpu";
  return null;
}

export function judgePlacement(i: PlacementInput): Placement {
  const ev: string[] = [];
  const haveCounters = i.npuUtilPeak !== null || i.npuMemDeltaGB !== null;
  const memNeed = Math.min(0.3, Math.max(0.1, i.sizeGB * 0.15));
  const npuSignal = (i.npuUtilPeak ?? 0) >= NPU_UTIL || (i.npuMemDeltaGB ?? 0) >= memNeed;
  const cpuHeavy = (i.cpuBusyPct ?? 0) >= CPU_BUSY;
  if (i.npuUtilPeak !== null) ev.push(`NPU utilization peaked at ${Math.round(i.npuUtilPeak)}%`);
  if (i.npuMemDeltaGB !== null) ev.push(`NPU memory grew by ${i.npuMemDeltaGB.toFixed(1)} GB when the model loaded`);
  if (!haveCounters) ev.push("Windows gave no NPU counters, so the NPU could not be measured directly");
  if (i.cpuBusyPct !== null) ev.push(`CPU was ${Math.round(i.cpuBusyPct)}% busy while it answered`);
  if (i.logHint) ev.push(`the server log mentions the ${i.logHint === "npu" ? "NPU / Hexagon" : "CPU"}`);
  if (i.asked === "cpu") ev.push("the server was started with --compute cpu");
  let runsOn: RunsOn = "unknown";
  if (i.asked === "cpu") runsOn = cpuHeavy || !npuSignal ? "cpu" : "mixed";
  else if (haveCounters) runsOn = npuSignal ? (cpuHeavy ? "mixed" : "npu") : cpuHeavy ? "cpu" : i.logHint === "npu" ? "npu" : "unknown";
  else runsOn = cpuHeavy ? "cpu" : i.logHint === "npu" ? "npu" : i.logHint === "cpu" ? "cpu" : "unknown";
  return { ...i, runsOn, evidence: ev };
}

/** CPU busy share between two samples of os.cpus(), 0 to 100, over all cores. */
export function cpuBusy(a: { times: Record<string, number> }[], b: { times: Record<string, number> }[]): number | null {
  let busy = 0, total = 0;
  for (let k = 0; k < Math.min(a.length, b.length); k++) {
    const dt = (x: Record<string, number>) => Object.values(x).reduce((s, v) => s + v, 0);
    const idle = b[k].times.idle - a[k].times.idle;
    const all = dt(b[k].times) - dt(a[k].times);
    busy += all - idle;
    total += all;
  }
  return total > 0 ? Math.round((busy / total) * 1000) / 10 : null;
}
