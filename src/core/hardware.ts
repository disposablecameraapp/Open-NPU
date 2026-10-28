import { HardwareProfile } from "../shared/types";

/** Share of RAM the NPU can use on the one measured machine (7.8 GB of 16 GB). Used only when the real limit is unknown. */
const ESTIMATE_RATIO = 0.4875;

export interface RawHardware {
  cpuName?: string;
  totalRamBytes?: number;
  /** Hexagon / NPU PnP devices with their driver version. */
  npuDevices?: { name: string; driverVersion?: string | null }[];
  /** Real NPU shared-memory limit in bytes, when a source for it exists. */
  npuSharedBytes?: number | null;
  /** Windows' own view of the machine architecture (ARM64 / AMD64). */
  osArch?: string;
  /** Graphics cards, with their memory when the system says it. */
  gpus?: { name: string; vramGB?: number | null }[];
  cpuThreads?: number;
}

/** PowerShell run once at first launch; prints one JSON object matching RawHardware. */
export const HARDWARE_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$ram = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$npu = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName -match 'NPU|Hexagon|Neural' } |
  ForEach-Object { [pscustomobject]@{ name = $_.DeviceName; driverVersion = $_.DriverVersion } })
$gpu = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -and $_.Name -notmatch 'Basic|Remote|Virtual|Microsoft' } | ForEach-Object { [pscustomobject]@{ name = $_.Name } })
$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
[pscustomobject]@{ cpuName = $cpu; totalRamBytes = [double]$ram; npuDevices = $npu; osArch = $arch; gpus = $gpu } | ConvertTo-Json -Compress -Depth 4
`;

export function parseRawHardware(stdout: string): RawHardware {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("hardware probe returned no JSON");
  const obj = JSON.parse(stdout.slice(start));
  // ConvertTo-Json collapses a one-element array to an object
  if (obj.npuDevices && !Array.isArray(obj.npuDevices)) obj.npuDevices = [obj.npuDevices];
  if (obj.gpus && !Array.isArray(obj.gpus)) obj.gpus = [obj.gpus];
  return obj as RawHardware;
}

export function chipFamily(cpuName: string): HardwareProfile["chipFamily"] {
  const n = cpuName.toLowerCase();
  if (/\bx2\s*(elite|plus|extreme)|\bx2[a-z]?-\d/.test(n)) return "x2";
  if (/snapdragon|x1[ep]?-?\d{2}|x1e|x1p|qualcomm/.test(n)) return "x1";
  return "unknown";
}

/**
 * Build the profile that drives every compatibility check.
 * budgetOverrideGB wins (user typed the number from Task Manager), then a measured value, then half of RAM.
 */
export function buildProfile(
  raw: RawHardware,
  appArch: string,
  budgetOverrideGB: number | null = null,
  now: () => Date = () => new Date()
): HardwareProfile {
  const cpu = (raw.cpuName ?? "Unknown CPU").trim();
  const ramGB = raw.totalRamBytes ? Math.round((raw.totalRamBytes / 1024 ** 3) * 10) / 10 : 0;
  const npu = raw.npuDevices?.[0];
  const family = chipFamily(cpu);
  const osArm = (raw.osArch ?? "").toUpperCase().includes("ARM64");
  const appArm = appArch === "arm64";

  let npuBudgetGB: number;
  let source: HardwareProfile["npuBudgetSource"];
  if (budgetOverrideGB && budgetOverrideGB > 0) {
    npuBudgetGB = budgetOverrideGB;
    source = "user";
  } else if (raw.npuSharedBytes && raw.npuSharedBytes > 0) {
    npuBudgetGB = Math.round((raw.npuSharedBytes / 1024 ** 3) * 10) / 10;
    source = "measured";
  } else {
    npuBudgetGB = Math.round(ramGB * ESTIMATE_RATIO * 10) / 10;
    source = "estimated";
  }

  return {
    chipName: cpu,
    chipFamily: family,
    isSnapdragon: family !== "unknown",
    ramGB,
    npuDetected: !!npu,
    gpus: raw.gpus,
    cpuThreads: raw.cpuThreads,
    npuDriverVersion: npu?.driverVersion ?? null,
    npuBudgetGB,
    npuBudgetSource: source,
    detectedAt: now().toISOString(),
    appArch,
    emulated: osArm && !appArm
  };
}

/** Plain-language blockers shown on first launch. */
export function hardwareProblems(hw: HardwareProfile, target: string = "npu"): string[] {
  const out: string[] = [];
  // the GPU and the CPU run on any PC: the NPU's requirements are only a problem when the NPU is what was chosen
  if (target === "cpu" || target === "gpu") return out;
  if (hw.emulated) out.push("Open NPU is running as an x64 app emulated on ARM64. Install the native ARM64 build; the NPU runtime needs it.");
  else if (hw.appArch !== "arm64") out.push(`Open NPU is built for ARM64 Windows only (this process is ${hw.appArch}).`);
  if (!hw.isSnapdragon) out.push("This does not look like a Snapdragon X machine.");
  else if (!hw.npuDetected) out.push("No Hexagon NPU driver was found. Install the Qualcomm NPU driver (Snapdragon Control Panel).");
  if (hw.chipFamily === "x2") out.push("Snapdragon X2 machines are untested; limits may differ.");
  return out;
}
