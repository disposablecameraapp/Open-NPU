import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { HardwareProfile } from "../shared/types";
import { DYNAMIC_NAME, LANES, LANE_INFO, Lane, BundleModel, laneStats } from "../core/dynamic";

type Info = Awaited<ReturnType<ReturnType<typeof api>["dynamicInfo"]>>;
type Step = { tier: string; name: string; step: number; total: number; phase: "start" | "done" | "error"; error?: string };

const LANE_MARK: Record<Lane, string> = { flash: "⚡", flux: "〜", forge: "⚒" };

/** The three classes of a Dynamic size with the average speed and the weight of the models that serve each. */
export function LanePills({ models, speeds, only }: { models: BundleModel[]; speeds: Record<string, number>; only?: string[] }) {
  return (
    <span className="lane-pills">
      {LANES.map((l) => {
        const st = laneStats(models.filter((m) => !only || only.includes(m.ref)), l, speeds);
        if (!st.count) return null;
        return (
          <span key={l} className={`lane lane-${l}`} title={`${LANE_INFO[l].label}: ${LANE_INFO[l].hint}\n${st.names.join(", ")}`}>
            <span className="lane-name">{LANE_MARK[l]} {LANE_INFO[l].label}</span>
            <span className="lane-num">{st.tokPerSec !== null ? `${st.tokPerSec} tok/s` : "n/a"} · {st.sizeGB} GB</span>
          </span>
        );
      })}
    </span>
  );
}

/** Dynamic at the top of the model list: what it is made of, how fast each class is, and one click to install all of it. */
export function DynamicCard({ hw, selectedId, onUse }: { hw: HardwareProfile | null; selectedId: string | null; onUse: (id: string) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [tier, setTier] = useState<string>("");
  const [step, setStep] = useState<Step | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { const i = await api().dynamicInfo(); setInfo(i); return i; }, []);
  useEffect(() => {
    void refresh().then((i) => setTier((t) => t || ([...i.data.tiers].reverse().find((x) => !hw || hw.ramGB >= x.minRamGB) ?? i.data.tiers[0])?.id || ""));
    return api().onDynamicInstall((p) => {
      setStep(p);
      if (p.phase === "error") setErrors((e) => [...e, `${p.name}: ${p.error ?? "failed"}`]);
      if (p.phase === "done") void refresh();
    });
  }, [hw, refresh]);

  const models = useMemo(() => info?.data.models[tier] ?? [], [info, tier]);
  if (!info || !info.data.tiers.length) return null;
  const t = info.data.tiers.find((x) => x.id === tier) ?? info.data.tiers[0];
  const have = (m: BundleModel) => info.installedRefs.includes(m.ref);
  const missing = models.filter((m) => !have(m));
  const id = `dynamic:${t.id}`;
  const enough = !hw || hw.ramGB >= t.minRamGB;
  const install = async () => {
    setBusy(true); setErrors([]);
    try { await api().installDynamic(t.id); } finally { setBusy(false); setStep(null); await refresh(); }
  };

  return (
    <section className="dyn-card" aria-label={`${DYNAMIC_NAME} model`}>
      <div className="dyn-card-head">
        <div>
          <strong className="dyn-title">{DYNAMIC_NAME} {t.label}</strong>
          <span className="dyn-badge">Recommended</span>
          <div className="muted small">{models.length} models that work together: every request goes to the right one, by kind of task and by speed.</div>
        </div>
        {info.data.tiers.length > 1 && (
          <div className="seg" role="group" aria-label="Size">
            {info.data.tiers.map((x) => <button key={x.id} className={x.id === t.id ? "on" : ""} onClick={() => setTier(x.id)}>{x.label}</button>)}
          </div>
        )}
      </div>
      <LanePills models={models} speeds={info.speeds} />
      <ul className="dyn-models">
        {models.map((m) => (
          <li key={m.ref} className={have(m) ? "have" : ""}>
            <span className="dyn-mark">{have(m) ? "✓" : "·"}</span>
            <strong>{m.name}</strong>
            <span className="muted small"> {m.lanes.map((l) => LANE_INFO[l].label).join(" + ")} · {m.sizeGB} GB · {(info.speeds[m.ref] ?? m.tokPerSec) ?? "?"}{m.tokEstimated && !info.speeds[m.ref] ? " (est.)" : ""} tok/s{info.speeds[m.ref] ? " (measured here)" : ""}</span>
          </li>
        ))}
      </ul>
      {!enough && <div className="warn small">Meant for {t.minRamGB} GB of memory or more; it may not fit this PC.</div>}
      {step && step.phase === "start" && <div className="muted small" role="status">Installing {step.name} ({step.step} of {step.total})…</div>}
      {errors.map((e, i) => <div key={i} className="warn small">{e}</div>)}
      <div className="row">
        {missing.length > 0 && <button className="primary" disabled={busy} onClick={() => void install()}>{busy ? "Installing…" : `Install ${DYNAMIC_NAME} (${missing.length} model${missing.length === 1 ? "" : "s"}, ${Math.round(missing.reduce((a, m) => a + m.sizeGB, 0) * 10) / 10} GB)`}</button>}
        <button className={missing.length ? "ghost" : "primary"} disabled={models.length === missing.length} onClick={() => onUse(id)}>{selectedId === id ? "In use" : missing.length ? "Use with what is installed" : "Use"}</button>
      </div>
      {info.data.provisional && <details><summary className="muted small">How these choices were made</summary><div className="muted small">{info.data.provisional}</div></details>}
    </section>
  );
}
