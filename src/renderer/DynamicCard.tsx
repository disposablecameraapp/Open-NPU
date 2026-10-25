import { useCallback, useEffect, useState } from "react";
import { RunsBadge } from "./RunsBadge";
import { api } from "./api";
import type { HardwareProfile } from "../shared/types";
import { DYNAMIC_NAME, LANES, LANE_INFO, Pack, packStats } from "../core/dynamic";
import { NativeIcon as SparkIcon } from "./Icons";

type Info = Awaited<ReturnType<ReturnType<typeof api>["dynamicInfo"]>>;
type Step = { tier: string; name: string; step: number; total: number; phase: "start" | "done" | "error"; error?: string };

const LANE_MARK = { flash: "⚡", flux: "〜", forge: "⚒" } as const;

/** "⚡ Flash 2B · 36 tok/s · 3.5 GB": one line saying what a pack is, with the average speed of its models. */
export function PackLine({ pack, lane, speeds }: { pack: Pack; lane?: keyof typeof LANE_MARK; speeds: Record<string, number> }) {
  const st = packStats(pack, speeds);
  return (
    <span className="lane-pills">
      <span className={`lane ${lane ? `lane-${lane}` : ""}`} title={`${pack.models.length} models: ${pack.models.map((m) => m.name).join(", ")}`}>
        <span className="lane-name">{lane ? `${LANE_MARK[lane]} ${LANE_INFO[lane].label} ` : ""}{pack.label}</span>
        <span className="lane-num">{st.tokPerSec !== null ? `${st.tokPerSec} tok/s` : "n/a"} · {st.sizeGB} GB · {st.count} models</span>
      </span>
    </span>
  );
}

/**
 * The Dynamic models at the top of the list. The PC's memory (16, 24 or 32 GB) fixes the three sizes, Flash, Flux and Forge;
 * each is a pack of models of that size, each the best at one kind of work. Install a pack, and every request goes to the
 * right model of it.
 */
export function DynamicSection({ hw, selectedId, onUse, onChanged }: { hw: HardwareProfile | null; selectedId: string | null; onUse: (id: string) => void; onChanged?: () => void }) {
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
  if (!info || !info.data.profiles.length) return null;

  const profile = info.data.profiles.find((p) => p.id === info.profile) ?? info.data.profiles[0];
  const choose = async (id: string) => { await api().setDynamicProfile(id); await refresh(); onChanged?.(); };
  const install = async (packId: string) => {
    setBusy(packId); setErrors((e) => ({ ...e, [packId]: [] }));
    try { await api().installDynamic(packId); } finally { setBusy(null); setStep(null); await refresh(); onChanged?.(); }
  };

  return (
    <section className="dyn-section" aria-label={`${DYNAMIC_NAME} models`}>
      <h2>{DYNAMIC_NAME} models</h2>
      <p className="muted small">Pick the memory of your PC and you get three sizes: <strong>Flash</strong> (the smallest, instant), <strong>Flux</strong> (the reasonable one) and <strong>Forge</strong> (the biggest your NPU holds). Each size is a pack of models of that size, each the best at one job: code, a mail that sounds natural, facts, reasoning. Install a pack and every request goes to the right model of it.</p>
      <div className="row dyn-profile" role="group" aria-label="Memory of your PC">
        <span className="small">Memory of your PC</span>
        <div className="seg">
          {info.data.profiles.map((p) => <button key={p.id} className={p.id === profile.id ? "on" : ""} onClick={() => void choose(p.id)} title={`About ${p.npuGB} GB are usable by the NPU`}>{p.label}{p.id === info.autoProfile && hw ? " (yours)" : ""}</button>)}
        </div>
        <span className="muted small">about {profile.npuGB} GB usable by the NPU</span>
      </div>
      <div className="grid">
        {LANES.map((lane) => {
          const pack = info.data.packs[profile.packs[lane]];
          if (!pack) return null;
          const have = (ref: string) => info.installedRefs.includes(ref);
          const missing = pack.models.filter((m) => !have(m.ref));
          const id = `dynamic:${pack.id}`;
          const mine = errors[pack.id] ?? [];
          const st = packStats(pack, info.speeds);
          return (
            <div key={lane} className={`card dyn-card ${selectedId === id ? "selected" : ""}`}>
              <div className="card-top">
                <div>
                  <div className="card-title">{DYNAMIC_NAME} {LANE_INFO[lane].label} · {pack.label} {lane === "flux" && <span className="tag">balanced</span>}</div>
                  <div className="muted small">{LANE_INFO[lane].hint}</div>
                </div>
                <span className="badge green">{st.count} models</span>
              </div>
              <span className="native-banner dyn-banner" title="Every request is sorted by kind of task and sent to the right model of the pack">
                <SparkIcon />
                <span className="native-text"><strong>{DYNAMIC_NAME} {pack.label}</strong><span>The best {pack.label} model for every request, installed in one click</span></span>
              </span>
              <PackLine pack={pack} lane={lane} speeds={info.speeds} />
              <ul className="dyn-models">
                {pack.models.map((m) => (
                  <li key={m.ref} className={have(m.ref) ? "have" : ""}>
                    <span className="dyn-mark">{have(m.ref) ? "✓" : "·"}</span>
                    <strong>{m.name}</strong> <RunsBadge on={info.runsOn?.[m.ref]} />
                    <span className="muted small dyn-detail">{m.job} · {m.sizeGB} GB · {(info.speeds[m.ref] ?? m.tokPerSec) ?? "?"}{m.tokEstimated && !info.speeds[m.ref] ? " (est.)" : ""} tok/s{m.tight ? " · tight on memory" : ""}</span>
                  </li>
                ))}
              </ul>
              <div className="card-foot">
                {busy === pack.id && step && step.tier === pack.id && step.phase === "start" && <div className="muted small" role="status">Installing {step.name} ({step.step} of {step.total})…</div>}
                {mine.map((e, i) => <div key={i} className="warn small">{e}</div>)}
                <div className="row">
                  {missing.length > 0 && <button className="primary" disabled={!!busy} onClick={() => void install(pack.id)}>{busy === pack.id ? "Installing…" : `Install (${missing.length} model${missing.length === 1 ? "" : "s"}, ${Math.round(missing.reduce((a, m) => a + m.sizeGB, 0) * 10) / 10} GB)`}</button>}
                  {selectedId === id ? <span className="in-use">In use</span> : <button className={missing.length ? "ghost" : "primary"} disabled={missing.length === pack.models.length} onClick={() => onUse(id)}>{missing.length ? "Use what is installed" : "Use"}</button>}
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
