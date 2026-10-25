import { Meters } from "../shared/types";
import { ramWarning } from "./memory";

/**
 * Where the NPU's numbers are, on a Windows 11 PC. Newer Windows has counter sets named for it ("NPU Engine", "NPU Adapter
 * Memory"); on a PC that does not (the French Windows of a Snapdragon X laptop listed 213 sets and none with NPU in its name) the NPU
 * is a compute-only graphics adapter, and its numbers are among the GPU counters: "GPU Engine", "GPU Adapter Memory", "GPU Process
 * Memory", one instance per adapter LUID. Its LUID is found from the DirectX registry (an adapter described as NPU, Hexagon...) or,
 * failing that, as the adapter that has no 3D engine (a GPU has one, an NPU only computes). Nothing here assumes a language: counter
 * names and units are guessed from words in several languages, every instance is sampled twice (a percentage needs two samples).
 */
export const NPU_UTIL_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$sets = @(Get-Counter -ListSet '*NPU*','*Neural*','*Hexagon*' | Sort-Object CounterSetName -Unique)
$names = @($sets | ForEach-Object { $_.CounterSetName })
$paths = @(); foreach ($s in $sets) { $paths += $s.PathsWithInstances }
$adapters = @()
Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\DirectX' | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  if ($p.Description -and $null -ne $p.AdapterLuid) {
    $l = [int64]$p.AdapterLuid
    $adapters += [pscustomobject]@{ name = [string]$p.Description; luid = ('luid_0x{0:X8}_0x{1:X8}' -f (($l -shr 32) -band 0xFFFFFFFF), ($l -band 0xFFFFFFFF)).ToLower() }
  }
}
$found = @{}
if (-not $paths) {
  foreach ($a in $adapters) { if ($a.name -match 'NPU|Hexagon|Neural|AI Boost|Compute') { $found[$a.luid] = $a.name } }
  $has3d = @{}
  foreach ($e in @((Get-Counter -ListSet 'GPU Engine').PathsWithInstances)) {
    if ($e -match 'luid_0x[0-9a-fA-F]+_0x[0-9a-fA-F]+') {
      $k = $matches[0].ToLower()
      if (-not $has3d.ContainsKey($k)) { $has3d[$k] = $false }
      if ($e -match 'engtype_3D') { $has3d[$k] = $true }
    }
  }
  foreach ($k in @($has3d.Keys)) { if (-not $has3d[$k] -and -not $found.ContainsKey($k)) { $found[$k] = 'compute-only adapter' } }
  if ($found.Count -gt 0) {
    foreach ($set in 'GPU Engine','GPU Adapter Memory','GPU Process Memory') {
      $added = $false
      foreach ($x in @((Get-Counter -ListSet $set).PathsWithInstances)) {
        $lx = $x.ToLower()
        foreach ($k in $found.Keys) { if ($lx.Contains($k)) { $paths += $x; $added = $true; break } }
      }
      if ($added) { $names += $set }
    }
  }
}
$out = @()
if ($paths) {
  $c = @(Get-Counter -Counter $paths -SampleInterval 1 -MaxSamples 2)
  $out = @($c[$c.Count - 1].CounterSamples | ForEach-Object { [pscustomobject]@{ p = $_.Path; v = [double]$_.CookedValue } })
}
[pscustomobject]@{ sets = $names; adapter = (@($found.Values) -join ', '); adapters = @($adapters | ForEach-Object { $_.name + ' ' + $_.luid }); samples = $out } | ConvertTo-Json -Compress -Depth 4
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
  /** The adapter the numbers belong to, when it was found among the GPU counters ("compute-only adapter", or its registry name). */
  adapter?: string;
  /** The highest utilization values read, raw, so a wrong load can be traced to the counter that gave it. */
  topUtil?: string[];
  /** Every graphics / compute adapter in the DirectX registry, with its LUID, for the diagnostics. */
  adapters?: string[];
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
  // like Task Manager: the load of the NPU is that of its busiest engine, each engine's load being the sum over the processes using it
  const engines = new Map<string, number>();
  const rawUtil: { p: string; v: number }[] = [];
  let sawEngine = false;
  let adapter = 0, process = 0, sawAdapter = false, sawProcess = false;
  const memRows: { set: string; name: string; inst: string; v: number }[] = [];
  for (const { p, v } of raw) {
    const m = parsePath(p);
    if (!m) continue;
    const [, set, inst = "", name] = m;
    const pid = /pid_(\d+)/.exec(inst)?.[1];
    if (ENGINE.test(set)) {
      sawEngine = true;
      rawUtil.push({ p, v });
      if (v < 0 || v > 100.5) continue; // a percentage cannot be above 100: a wrap-around or a first sample, not a load
      const x = v;
      const engine = inst.replace(/pid_\d+_?/, "");
      engines.set(engine, Math.min(100, (engines.get(engine) ?? 0) + x));
      if (pid) pidUtil[+pid] = Math.min(100, Math.max(pidUtil[+pid] ?? 0, x));
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
    util: sawEngine ? Math.round(Math.max(0, ...engines.values())) : null,
    topUtil: rawUtil.sort((a, b) => b.v - a.v).slice(0, 6).map((x) => `${x.p} = ${x.v}`),
    memBytes: sawAdapter ? adapter : sawProcess ? process : null,
    pidUtil, pidMem, sets, samples: raw.length,
    adapter: typeof o.adapter === "string" && o.adapter ? o.adapter : undefined,
    adapters: Array.isArray(o.adapters) ? o.adapters.map(String) : typeof o.adapters === "string" ? [o.adapters] : undefined
  };
}

/** Windows build and update number ("26100.4061"), asked from the registry. */
export const WINDOWS_BUILD_SCRIPT = `
$v = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
"$($v.CurrentBuildNumber).$($v.UBR)"
`;

/**
 * Microsoft's release notes put NPU monitoring in Task Manager (its counters) in Windows 11 builds 26100.8524 (24H2),
 * 26200.8524 (25H2) and 28000.2340 (26H1) and later. null when the build is not one of those lines or cannot be read.
 */
export function windowsHasNpuMonitoring(build: string | null): boolean | null {
  const m = /^(\d+)\.(\d+)$/.exec((build ?? "").trim());
  if (!m) return null;
  const need: Record<string, number> = { "26100": 8524, "26200": 8524, "28000": 2340 };
  if (!(m[1] in need)) return Number(m[1]) > 28000 ? true : null;
  return Number(m[2]) >= need[m[1]];
}

/** What `parseNpuCounters` could not find, in words, for the diagnostics. */
export function npuCounterProblem(r: NpuReading): string | null {
  if (!r.sets.length) return "Windows has no performance counters for the NPU on this PC: no counter set with NPU in its name, and no compute-only adapter among the GPU counters. Updating Windows and the NPU driver may add them (Task Manager's NPU tab needs them too).";
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
