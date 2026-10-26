import type { Meters } from "../shared/types";

function Bar({ label, value, max, text, warn, title }: { label: string; value: number | null; max: number; text: string; warn?: boolean; title?: string }) {
  const pct = value === null ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="meter" title={title}>
      <div className="meter-head"><span>{label}</span><span className={warn ? "warn" : "muted"}>{text}</span></div>
      <div className="track"><div className={`fill ${warn ? "warn" : ""}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/**
 * `estNpuGB` is what the loaded model is expected to take; `busy` is a chat answering. Both stand in only when Windows gives no
 * NPU counter, and are labelled as estimates: a made-up percentage would be worse than none.
 */
export function MetersBar({ meters, estNpuGB, busy }: { meters: Meters | null; estNpuGB?: number | null; busy?: boolean }) {
  if (!meters) return null;
  const noCounters = meters.npuMemGB === null && meters.npuUtilPercent === null;
  const why = meters.npuNote ?? undefined;
  const memText = meters.npuMemGB !== null ? `${meters.npuMemGB} / ${meters.npuBudgetGB} GB`
    : estNpuGB ? `~${estNpuGB} GB est. · limit ${meters.npuBudgetGB} GB` : `n/a · limit ${meters.npuBudgetGB} GB`;
  return (
    <div className="meters">
      <Bar label="RAM" value={meters.ramPercent} max={100} text={`${meters.ramUsedGB} / ${meters.ramTotalGB} GB`} />
      <Bar label="NPU memory" value={meters.npuMemGB ?? (estNpuGB || null)} max={meters.npuBudgetGB} text={memText} title={why} />
      <Bar label="NPU load" value={meters.npuUtilPercent} max={100} text={meters.npuUtilPercent !== null ? `${meters.npuUtilPercent}%` : noCounters && busy ? "working (no counter)" : "n/a"} title={why} />
      {noCounters && why && <div className="muted small" title={why}>Windows gives no NPU counters here. Settings, Developer settings, Check the NPU counters says why.</div>}
    </div>
  );
}
