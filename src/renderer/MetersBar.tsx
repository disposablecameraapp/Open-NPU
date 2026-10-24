import type { Meters } from "../shared/types";

function Bar({ label, value, max, text, warn }: { label: string; value: number | null; max: number; text: string; warn?: boolean }) {
  const pct = value === null ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="meter">
      <div className="meter-head"><span>{label}</span><span className={warn ? "warn" : "muted"}>{text}</span></div>
      <div className="track"><div className={`fill ${warn ? "warn" : ""}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function MetersBar({ meters }: { meters: Meters | null }) {
  if (!meters) return null;
  return (
    <div className="meters">
      <Bar label="RAM" value={meters.ramPercent} max={100} warn={meters.ramWarning} text={`${meters.ramUsedGB} / ${meters.ramTotalGB} GB`} />
      <Bar label="NPU memory" value={meters.npuMemGB} max={meters.npuBudgetGB} text={meters.npuMemGB === null ? `n/a · limit ${meters.npuBudgetGB} GB` : `${meters.npuMemGB} / ${meters.npuBudgetGB} GB`} />
      <Bar label="NPU load" value={meters.npuUtilPercent} max={100} text={meters.npuUtilPercent === null ? "n/a" : `${meters.npuUtilPercent}%`} />
      {meters.ramWarning && <div className="warn small">RAM above 90%: close other apps or Windows will swap and freeze.</div>}
    </div>
  );
}
