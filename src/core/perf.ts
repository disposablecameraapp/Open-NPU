import { Meters } from "../shared/types";
import { ramWarning } from "./memory";

/**
 * Windows 11 exposes the NPU to Task Manager as performance counter sets ("NPU Engine", "NPU Adapter Memory", "NPU Process
 * Memory"). Their names and their counters are translated on a localized Windows, so nothing here assumes English: the sets
 * are found by "NPU" in their name, every instance is sampled twice (a percentage needs two samples), and the meaning of a
 * counter is guessed from words in several languages. If the sets do not exist (older driver, no counters for this NPU) the
 * result says so and the UI shows "n/a" with the reason.
 */
export const NPU_UTIL_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$sets = @(Get-Counter -ListSet '*NPU*','*Neural*','*Hexagon*' | Sort-Object CounterSetName -Unique)
$paths = @(); foreach ($s in $sets) { $paths += $s.PathsWithInstances }
if (-not $paths) { '{"sets":[],"samples":[]}'; exit }
$c = @(Get-Counter -Counter $paths -SampleInterval 1 -MaxSamples 2)
$last = $c[$c.Count - 1].CounterSamples
$out = @($last | ForEach-Object { [pscustomobject]@{ p = $_.Path; v = [double]$_.CookedValue } })
[pscustomobject]@{ sets = @($sets | ForEach-Object { $_.CounterSetName }); samples = $out } | ConvertTo-Json -Compress -Depth 4
`;

/** Every counter set Windows has, by name: when no NPU set is found this shows what is there instead, for the diagnostics. */
export const ALL_COUNTER_SETS_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
@(Get-Counter -ListSet '*' | ForEach-Object { $_.CounterSetName } | Sort-Object) | ConvertTo-Json -Compress
`;

export interface NpuReading {
  /** Utilization of the whole NPU, 0 to 100. */
  util: number | null;
  /** Memory in use on the NPU (shared plus dedicated), in bytes. */
  memBytes: number | null;
  /** The same, for each process (by pid), when the counters name processes. */
  pidUtil: Record<number, number>;
  pidMem: Record<number, number>;
  /** Counter sets found with "NPU" in their name; empty when Windows has none for this NPU. */
  sets: string[];
  /** How many counter values were read. */
  samples: number;
}

const SHARED = /shared|partag|gemeinsam|compart|condivis/i;
const DEDICATED = /dedicated|d[eé]di|dedizi|dedicad|dedicat/i;
const ENGINE = /engine|moteur|motor/i;
const MEMORY = /memory|m[eé]moire|speicher|memoria|geheugen/i;
const parsePath = (p: string) => /^(?:\\\\[^\\]+)?\\([^(\\]+)(?:\(([^)]*)\))?\\(.+)$/.exec(p);

export function parseNpuCounters(stdout: string): NpuReading {
  const none: NpuReading = { util: null, memBytes: null, pidUtil: {}, pidMem: {}, sets: [], samples: 0 };
  let o: any;
  try { o = JSON.parse(stdout.slice(stdout.indexOf("{"))); } catch { return none; }
  const sets: string[] = Array.isArray(o.sets) ? o.sets.map(String) : typeof o.sets === "string" ? [o.sets] : [];
  const raw: { p: string; v: number }[] = (Array.isArray(o.samples) ? o.samples : o.samples ? [o.samples] : []).filter((x: any) => x && typeof x.p === "string" && typeof x.v === "number" && isFinite(x.v));
  const pidUtil: Record<number, number> = {}, pidMem: Record<number, number> = {};
  let util = 0, sawEngine = false;
  let adapter = 0, process = 0, sawAdapter = false, sawProcess = false;
  const memRows: { set: string; name: string; inst: string; v: number }[] = [];
  for (const { p, v } of raw) {
    const m = parsePath(p);
    if (!m) continue;
    const [, set, inst = "", name] = m;
    const pid = /pid_(\d+)/.exec(inst)?.[1];
    if (ENGINE.test(set)) {
      sawEngine = true;
      util += v;
      if (pid) pidUtil[+pid] = Math.min(100, (pidUtil[+pid] ?? 0) + v);
    } else if (MEMORY.test(set)) memRows.push({ set, name, inst, v });
  }
  // when no counter says "shared" or "dedicated" (another language), every value of the memory sets counts
  const known = memRows.some((r) => SHARED.test(r.name) || DEDICATED.test(r.name));
  for (const r of memRows) {
    if (known && !(SHARED.test(r.name) || DEDICATED.test(r.name))) continue;
    const pid = /pid_(\d+)/.exec(r.inst)?.[1];
    if (/adapter|adaptateur|adapt/i.test(r.set) && !pid) { adapter += r.v; sawAdapter = true; }
    else { process += r.v; sawProcess = true; if (pid) pidMem[+pid] = (pidMem[+pid] ?? 0) + r.v; }
  }
  return {
    util: sawEngine ? Math.round(Math.min(100, util)) : null,
    memBytes: sawAdapter ? adapter : sawProcess ? process : null,
    pidUtil, pidMem, sets, samples: raw.length
  };
}

/** What `parseNpuCounters` could not find, in words, for the diagnostics. */
export function npuCounterProblem(r: NpuReading): string | null {
  if (!r.sets.length) return "Windows has no performance counters for the NPU on this PC (no counter set with NPU in its name). Update the NPU driver and Windows; Task Manager's NPU tab uses the same counters.";
  if (!r.samples) return "The NPU counter sets exist but returned no values.";
  if (r.util === null && r.memBytes === null) return "The NPU counters were read but not recognised: their names are not ones Open NPU knows.";
  return null;
}

export function buildMeters(
  totalBytes: number,
  freeBytes: number,
  npuBudgetGB: number,
  npu: { util: number | null; memBytes: number | null }
): Meters {
  const used = totalBytes - freeBytes;
  const ramPercent = totalBytes > 0 ? Math.round((used / totalBytes) * 100) : 0;
  return {
    ramPercent,
    ramUsedGB: Math.round((used / 1024 ** 3) * 10) / 10,
    ramTotalGB: Math.round((totalBytes / 1024 ** 3) * 10) / 10,
    npuMemGB: npu.memBytes !== null ? Math.round((npu.memBytes / 1024 ** 3) * 10) / 10 : null,
    npuBudgetGB,
    npuUtilPercent: npu.util,
    ramWarning: ramWarning(ramPercent)
  };
}
