import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { HardwareProfile } from "../shared/types";
import { DYNAMIC_NAME, LANES, LANE_INFO, Lane, BundleModel, laneStats } from "../core/dynamic";
import { NativeIcon as SparkIcon } from "./Icons";

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

/** The Dynamic models at the top of the list: one card per size, in the style of the other model cards. */
export function DynamicSection({ hw, selectedId, onUse }: { hw: HardwareProfile | null; selectedId: string | null; onUse: (id: string) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => { const i = await api().dynamicInfo(); setInfo(i); return i; }, []);
  useEffect(() => {
    void refresh();
    return api().onDynamicInstall((p) => {
      setStep(p);
      if (p.phase === "error") setErrors((e) => ({ ...e, [p.tier]: [...(e[p.tier] ?? []), `${p.name}: ${p.error ?? "failed"}`] }));
      if (p.phase === "done") void refresh();
    });
  }, [refresh]);
  if (!info || !info.data.tiers.length) return null;

  const install = async (tier: string) => {
    setBusy(tier); setErrors((e) => ({ ...e, [tier]: [] }));
    try { await api().installDynamic(tier); } finally { setBusy(null); setStep(null); await refresh(); }
  };

  return (
    <section className="dyn-section" aria-label={`${DYNAMIC_NAME} models`}>
      <h2>{DYNAMIC_NAME} models</h2>
      <p className="muted small">One choice that is a whole team: each request goes to the model that does that job best, and the speed of each class (Flash, Flux, Forge) is the average of its models. Pick the size that fits your memory.</p>
      <div className="grid">
        {info.data.tiers.map((t) => {
          const models = info.data.models[t.id] ?? [];
          const have = (m: BundleModel) => info.installedRefs.includes(m.ref);
          const missing = models.filter((m) => !have(m));
          const id = `dynamic:${t.id}`;
          const enough = !hw || hw.ramGB >= t.minRamGB;
          const recommended = enough && !!hw && !info.data.tiers.some((x) => x.maxParamsB > t.maxParamsB && hw.ramGB >= x.minRamGB);
          const size = Math.round(models.reduce((a, m) => a + m.sizeGB, 0) * 10) / 10;
          const mine = errors[t.id] ?? [];
          return (
            <div key={t.id} className={`card dyn-card ${selectedId === id ? "selected" : ""}`}>
              <div className="card-top">
                <div>
                  <div className="card-title">{DYNAMIC_NAME} {t.label} {recommended && <span className="tag">recommended</span>}</div>
                  <div className="muted small">{models.length} models that work together · {size} GB · from {t.minRamGB} GB of memory</div>
                </div>
                <span className={`badge ${enough ? "green" : "amber"}`}>{enough ? "Fits this PC" : "Caution"}</span>
              </div>
              <span className="native-banner dyn-banner" title="Every request is sorted by kind of task and sent to the right model of the team">
                <SparkIcon />
                <span className="native-text"><strong>{DYNAMIC_NAME}</strong><span>The best model for every request, installed in one click</span></span>
              </span>
              <LanePills models={models} speeds={info.speeds} />
              <ul className="dyn-models">
                {models.map((m) => (
                  <li key={m.ref} className={have(m) ? "have" : ""}>
                    <span className="dyn-mark">{have(m) ? "✓" : "·"}</span>
                    <strong>{m.name}</strong>
                    <span className="muted small dyn-detail">{m.lanes.map((l) => LANE_INFO[l].label).join(" + ")} · {m.sizeGB} GB · {(info.speeds[m.ref] ?? m.tokPerSec) ?? "?"}{m.tokEstimated && !info.speeds[m.ref] ? " (est.)" : ""} tok/s</span>
                  </li>
                ))}
              </ul>
              {!enough && <div className="warn small">Meant for {t.minRamGB} GB of memory or more; it may not fit this PC.</div>}
              <div className="card-foot">
                {busy === t.id && step && step.tier === t.id && step.phase === "start" && <div className="muted small" role="status">Installing {step.name} ({step.step} of {step.total})…</div>}
                {mine.map((e, i) => <div key={i} className="warn small">{e}</div>)}
                <div className="row">
                  {missing.length > 0 && <button className="primary" disabled={!!busy} onClick={() => void install(t.id)}>{busy === t.id ? "Installing…" : `Install (${missing.length} model${missing.length === 1 ? "" : "s"}, ${Math.round(missing.reduce((a, m) => a + m.sizeGB, 0) * 10) / 10} GB)`}</button>}
                  {selectedId === id ? <span className="in-use">In use</span> : <button className={missing.length ? "ghost" : "primary"} disabled={models.length === missing.length} onClick={() => onUse(id)}>{missing.length ? "Use what is installed" : "Use"}</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {info.data.provisional && <details><summary className="muted small">How these choices were made</summary><div className="muted small">{info.data.provisional}</div></details>}
    </section>
  );
}
