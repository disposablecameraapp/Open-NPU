import { Meters } from "../shared/types";
import { ramWarning } from "./memory";

/** Counter paths tried in order. Not verified on real hardware: any may be missing; the UI then shows "n/a". */
export const NPU_UTIL_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$u = (Get-Counter '\\NPU Engine(*)\\Utilization Percentage').CounterSamples | Measure-Object CookedValue -Maximum
$m = (Get-Counter '\\NPU Adapter Memory(*)\\Shared Usage').CounterSamples | Measure-Object CookedValue -Maximum
[pscustomobject]@{ util = $u.Maximum; mem = $m.Maximum } | ConvertTo-Json -Compress
`;

export function parseNpuCounters(stdout: string): { util: number | null; memBytes: number | null } {
  try {
    const o = JSON.parse(stdout.slice(stdout.indexOf("{")));
    return {
      util: typeof o.util === "number" ? Math.round(o.util) : null,
      memBytes: typeof o.mem === "number" ? o.mem : null
    };
  } catch {
    return { util: null, memBytes: null };
  }
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
