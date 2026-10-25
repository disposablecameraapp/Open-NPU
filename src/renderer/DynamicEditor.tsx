import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { CatalogItem } from "../shared/api";
import type { Settings } from "../shared/types";
import { CATEGORY_IDS, CATEGORY_INFO, DYNAMIC_NAME, LANE_INFO, LANES, entryMatches, installedOf, mergedPack, pickModel, sortRequest, wantedNote } from "../core/dynamic";

type Info = Awaited<ReturnType<ReturnType<typeof api>["dynamicInfo"]>>;

/**
 * Developer settings of the Dynamic model: for each pack, which of its models does which kind of work. The built-in table
 * comes from the sources named in the pack; a change here is kept as an override, so "Reset" always goes back to it.
 */
export function DynamicEditor({ settings, installed, onSave }: { settings: Settings; installed: CatalogItem[]; onSave: (p: Partial<Settings>) => void | Promise<void> }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [packId, setPackId] = useState<string>("");
  const [probe, setProbe] = useState("");
  useEffect(() => { void api().dynamicInfo().then((i) => { setInfo(i); setPackId((t) => t || i.data.profiles.find((p) => p.id === i.profile)?.packs.flux || Object.keys(i.data.packs)[0] || ""); }); }, []);
  const data = info?.data;
  const pack = useMemo(() => (data && packId ? mergedPack(data, packId, settings.dynamic) : undefined), [data, packId, settings.dynamic]);
  if (!info || !data || !pack) return <div className="muted small">Loading…</div>;

  const entries = installed.map((i) => i.entry);
  const isHere = (ref: string) => { const m = pack.models.find((x) => x.ref === ref); return !!m && !!installedOf(m, entries); };
  const set = (cat: string, slot: 0 | 1, value: string) => {
    const cur = [...(pack.table[cat as keyof typeof pack.table] ?? [])];
    cur[slot] = value;
    const tables = { ...(settings.dynamic?.table ?? {}) };
    tables[pack.id] = { ...(tables[pack.id] ?? {}), [cat]: cur.filter(Boolean) };
    void onSave({ dynamic: { ...settings.dynamic, table: tables } });
  };
  const reset = () => {
    const tables = { ...(settings.dynamic?.table ?? {}) };
    delete tables[pack.id];
    void onSave({ dynamic: { ...settings.dynamic, table: tables } });
  };
  const changed = Object.keys(settings.dynamic?.table?.[pack.id] ?? {}).length;
  const sorted = probe.trim() ? sortRequest(probe) : null;
  const picked = sorted ? pickModel(pack, sorted.category, entries) : null;
  const missing = info.missing[pack.id] ?? [];

  return (
    <div className="dyn-editor">
      <p className="muted small">
        {DYNAMIC_NAME} sorts each request into a kind of work and sends it to the model of the pack that does it best. The built-in choices say where they come from (a public independent score, or a judgement); the first model of a line that is installed is used, the second is the fallback.
      </p>
      <div className="row">
        <label className="small">Pack
          <select value={packId} onChange={(e) => setPackId(e.target.value)}>
            {Object.values(data.packs).map((p) => {
              const lanes = data.profiles.flatMap((pr) => LANES.filter((l) => pr.packs[l] === p.id).map((l) => `${LANE_INFO[l].label} of ${pr.label}`));
              return <option key={p.id} value={p.id}>{DYNAMIC_NAME} {p.label} ({lanes.join(", ")})</option>;
            })}
          </select>
        </label>
        <label className="check small"><input type="checkbox" checked={settings.dynamic?.askModel !== false} onChange={(e) => void onSave({ dynamic: { ...settings.dynamic, askModel: e.target.checked } })} /> When the words are not enough, ask the loaded model what kind of work it is</label>
        <button className="ghost" disabled={!changed} onClick={reset}>Reset this pack{changed ? ` (${changed} changed)` : ""}</button>
      </div>
      {missing.length > 0 && <div className="warn small">Not installed yet: {missing.map((r) => pack.models.find((m) => m.ref === r)?.name ?? r).join(", ")}. For the work that needs them, {DYNAMIC_NAME} uses another model of the pack.</div>}
      <div className="dyn-grid" role="table">
        <div className="dyn-head small muted" role="row"><span>Kind of work</span><span>First choice</span><span>Fallback</span></div>
        {CATEGORY_IDS.map((cat) => {
          const list = pack.table[cat] ?? [];
          const over = !!settings.dynamic?.table?.[pack.id]?.[cat];
          const why = pack.why?.[cat] ?? pack.why?.[cat === "web_code" || cat === "python_code" || cat === "code_repair" || cat === "code_explain" ? "code" : ""];
          return (
            <div key={cat} className={`dyn-row ${over ? "changed" : ""}`} role="row">
              <span title={CATEGORY_INFO[cat].hint}>{CATEGORY_INFO[cat].label}{why && <span className="muted small"> · {why}</span>}</span>
              {[0, 1].map((slot) => (
                <select key={slot} aria-label={`${CATEGORY_INFO[cat].label}, ${slot ? "fallback" : "first choice"}`} value={list[slot] ?? ""} onChange={(e) => set(cat, slot as 0 | 1, e.target.value)}>
                  <option value="">{slot ? "None" : "Any model of the pack"}</option>
                  {pack.models.map((m) => <option key={m.ref} value={m.ref}>{m.name}{isHere(m.ref) ? "" : " · not installed"}</option>)}
                </select>
              ))}
            </div>
          );
        })}
      </div>
      <label className="small">Try a request
        <input type="text" placeholder={`Type a request to see which model of ${DYNAMIC_NAME} ${pack.label} would answer`} value={probe} onChange={(e) => setProbe(e.target.value)} />
      </label>
      {sorted && (
        <div className="small">
          <strong>{CATEGORY_INFO[sorted.category].label}</strong> <span className="muted">({Math.round(sorted.confidence * 100)}% sure: {sorted.reason}{sorted.confidence < 0.55 ? "; the loaded model would be asked" : ""})</span>
          {" → "}{picked ? <strong>{picked.entry.name}</strong> : <span className="muted">no model of this pack installed</span>}
          {picked?.wanted && <span className="muted">{wantedNote(picked)}</span>}
        </div>
      )}
    </div>
  );
}
