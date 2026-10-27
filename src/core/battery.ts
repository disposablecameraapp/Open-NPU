/**
 * The battery as Windows reports it, finer than the percentage: remaining capacity in mWh and the discharge rate in mW
 * (WMI, root\wmi: BatteryStatus and BatteryFullChargedCapacity). On the mains the rate is 0 and says nothing about what the PC draws,
 * so a reading taken while plugged in is marked as such and never turned into a figure.
 */
export interface BatteryReading {
  /** The battery answered. False on a PC without one, or when Windows does not expose the class. */
  present: boolean;
  /** Plugged in: the discharge rate is not the PC's draw. */
  onMains: boolean;
  discharging: boolean;
  remainingMWh: number;
  fullMWh: number;
  /** Power drawn from the battery, in mW (0 on the mains). */
  dischargeMW: number;
  voltageMV: number;
  at: number;
}

/** The PowerShell that prints one JSON line with what is needed. */
export const BATTERY_SCRIPT =
  "$s = Get-CimInstance -Namespace root\\wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue | Select-Object -First 1; " +
  "$f = Get-CimInstance -Namespace root\\wmi -ClassName BatteryFullChargedCapacity -ErrorAction SilentlyContinue | Select-Object -First 1; " +
  "if ($s) { [pscustomobject]@{ remaining = $s.RemainingCapacity; full = $f.FullChargedCapacity; rate = $s.DischargeRate; voltage = $s.Voltage; online = $s.PowerOnline; discharging = $s.Discharging } | ConvertTo-Json -Compress } else { '{}' }";

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** One reading from the output of BATTERY_SCRIPT. Anything unreadable is "no battery". */
export function parseBattery(out: string, at = Date.now()): BatteryReading {
  const none: BatteryReading = { present: false, onMains: false, discharging: false, remainingMWh: 0, fullMWh: 0, dischargeMW: 0, voltageMV: 0, at };
  const line = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith("{"));
  if (!line) return none;
  let o: Record<string, unknown>;
  try { o = JSON.parse(line); } catch { return none; }
  if (typeof o.remaining !== "number") return none;
  const onMains = o.online === true;
  return { present: true, onMains, discharging: o.discharging === true && !onMains, remainingMWh: n(o.remaining), fullMWh: n(o.full), dischargeMW: onMains ? 0 : n(o.rate), voltageMV: n(o.voltage), at };
}

/** Charge in percent to one decimal, from the real full capacity. */
export const batteryPercent = (r: BatteryReading) => (r.fullMWh > 0 ? Math.round((r.remainingMWh / r.fullMWh) * 1000) / 10 : null);

export interface BatteryRun {
  seconds: number;
  /** Average draw over the run, in W. */
  avgWatts: number;
  peakWatts: number;
  /** Energy used, in mWh: from the draw integrated over time, which moves more finely than the remaining capacity. */
  usedMWh: number;
  /** The drop of the remaining capacity, as a check on the figure above. */
  capacityDropMWh: number;
  samples: number;
  /** Why the figures cannot be trusted (a run too short, a capacity that rose, an energy that disagrees with the drop); empty when they can. */
  problem: string;
}

const MIN_SECONDS = 20;
/** Below this the capacity (which moves in steps) cannot check the integrated energy. */
const CHECKABLE_MWH = 150;

/** What a run drew, from its readings in order. Null when the PC was on the mains at any point or there are fewer than two readings. */
export function summarizeBattery(readings: BatteryReading[]): BatteryRun | null {
  if (readings.length < 2 || readings.some((r) => !r.present || r.onMains)) return null;
  let usedMWh = 0, peak = 0;
  for (let i = 1; i < readings.length; i++) {
    const dt = (readings[i].at - readings[i - 1].at) / 3_600_000;
    usedMWh += ((readings[i].dischargeMW + readings[i - 1].dischargeMW) / 2) * dt;
    peak = Math.max(peak, readings[i].dischargeMW);
  }
  const seconds = (readings[readings.length - 1].at - readings[0].at) / 1000;
  if (seconds <= 0) return null;
  const capacityDropMWh = readings[0].remainingMWh - readings[readings.length - 1].remainingMWh;
  let problem = "";
  if (seconds < MIN_SECONDS) problem = `Run too short (${Math.round(seconds)} s): at least ${MIN_SECONDS} s are needed.`;
  else if (usedMWh <= 0) problem = "The battery reported no draw.";
  else if (capacityDropMWh < 0) problem = "The remaining capacity rose during the run: the PC was charging or the reading is wrong.";
  else if (usedMWh >= CHECKABLE_MWH && (capacityDropMWh < usedMWh * 0.5 || capacityDropMWh > usedMWh * 2)) problem = "The draw and the drop of the capacity disagree by more than a factor of two.";
  return {
    seconds,
    avgWatts: Math.round(((usedMWh / (seconds / 3600)) / 1000) * 100) / 100,
    peakWatts: Math.round((peak / 1000) * 100) / 100,
    usedMWh: Math.round(usedMWh * 10) / 10,
    capacityDropMWh,
    samples: readings.length,
    problem,
  };
}

/** Energy per generated token in mWh, taking off the draw of the PC at rest so only the generation is counted. */
export function mWhPerToken(run: BatteryRun, restWatts: number, tokens: number): number | null {
  if (tokens <= 0 || run.problem) return null;
  const extra = Math.max(0, run.avgWatts - restWatts) * 1000 * (run.seconds / 3600);
  return Math.round((extra / tokens) * 1000) / 1000;
}
