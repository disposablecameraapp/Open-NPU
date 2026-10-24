import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { CatalogItem } from "../shared/api";
import type { Settings } from "../shared/types";
import { CATEGORY_IDS, CATEGORY_INFO, DYNAMIC_NAME, RoutingTable, entryMatches, mergedTable, pickModel, sortRequest } from "../core/dynamic";

type Info = Awaited<ReturnType<ReturnType<typeof api>["dynamicInfo"]>>;

/**
 * Developer settings of the Dynamic model: which models do which kind of task, per size. The built-in table comes from
 * public, independent benchmarks; a change here is kept as an override, so "Reset" always goes back to it.
 */
export function DynamicEditor({ settings, installed, onSave }: { settings: Settings; installed: CatalogItem[]; onSave: (p: Partial<Settings>) => void | Promise<void> }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [tier, setTier] = useState<string>("");
  const [probe, setProbe] = useState("");
  useEffect(() => { void api().dynamicInfo().then((i) => { setInfo(i); setTier((t) => t || i.data.tiers[0]?.id || ""); }); }, []);
  const data = info?.data;
  const table: RoutingTable = useMemo(() => (data ? mergedTable(data, settings.dynamic) : {}), [data, settings.dynamic]);
  const options = useMemo(() => {
    if (!data || !tier) return [];
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    const add = (value: string, name: string) => {
      if (!value || seen.has(value.toLowerCase())) return;
      seen.add(value.toLowerCase());
      const here = installed.some((i) => entryMatches(i.entry, value));
      out.push({ value, label: `${name}${here ? "" : " · not installed"}` });
    };
    for (const m of data.models[tier] ?? []) add(m.quant ? `${m.repo}:${m.quant}` : m.repo, m.name);
    for (const k of info?.known ?? []) add(k.repo, k.name);
    for (const list of Object.values(table[tier] ?? {})) for (const v of list ?? []) add(v, v.split("/").pop() ?? v);
    return out;
  }, [data, tier, installed, info, table]);

  if (!info || !data) return <div className="muted small">Loading…</div>;
  if (!data.tiers.length) return <div className="muted small">The {DYNAMIC_NAME} model has no sizes yet.</div>;

  const set = (cat: string, slot: 0 | 1, value: string) => {
    const cur = [...(table[tier]?.[cat as keyof (typeof table)[string]] ?? [])];
    cur[slot] = value;
    const next = cur.filter(Boolean);
    const tables = { ...(settings.dynamic?.table ?? {}) };
    tables[tier] = { ...(tables[tier] ?? {}), [cat]: next };
    void onSave({ dynamic: { ...settings.dynamic, table: tables } });
  };
  const reset = () => {
    const tables = { ...(settings.dynamic?.table ?? {}) };
    delete tables[tier];
    void onSave({ dynamic: { ...settings.dynamic, table: tables } });
  };
  const changed = Object.keys(settings.dynamic?.table?.[tier] ?? {}).length;
  const sorted = probe.trim() ? sortRequest(probe) : null;
  const picked = sorted ? pickModel(table, tier, sorted.category, installed.map((i) => i.entry)) : null;
  const missing = info.missing[tier] ?? [];

  return (
    <div className="dyn-editor">
      <p className="muted small">
        {DYNAMIC_NAME} sorts each request into a kind of task and uses the model below for it. The built-in choices come from independent public benchmarks{data.asOf ? ` (as of ${data.asOf})` : ""}, never from a model maker's own charts. The first model that is installed is used; the second is the fallback.
      </p>
      <div className="row">
        <label className="small">Size
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            {data.tiers.map((t) => <option key={t.id} value={t.id}>{DYNAMIC_NAME} {t.label} (from {t.minRamGB} GB of memory)</option>)}
          </select>
        </label>
        <label className="check small"><input type="checkbox" checked={settings.dynamic?.askModel !== false} onChange={(e) => void onSave({ dynamic: { ...settings.dynamic, askModel: e.target.checked } })} /> When the words are not enough, ask the loaded model what kind of task it is</label>
        <button className="ghost" disabled={!changed} onClick={reset}>Reset this size{changed ? ` (${changed} changed)` : ""}</button>
      </div>
      {missing.length > 0 && <div className="warn small">Not installed yet: {missing.join(", ")}. {DYNAMIC_NAME} stays on the model that is loaded for the tasks that need them.</div>}
      <div className="dyn-grid" role="table">
        <div className="dyn-head small muted" role="row"><span>Kind of task</span><span>First choice</span><span>Fallback</span></div>
        {CATEGORY_IDS.map((cat) => {
          const list = table[tier]?.[cat] ?? [];
          const over = !!settings.dynamic?.table?.[tier]?.[cat];
          return (
            <div key={cat} className={`dyn-row ${over ? "changed" : ""}`} role="row">
              <span title={CATEGORY_INFO[cat].hint}>{CATEGORY_INFO[cat].label}{data.why?.[`${tier}/${cat}`] && <span className="muted small"> · {data.why[`${tier}/${cat}`]}</span>}</span>
              {[0, 1].map((slot) => (
                <select key={slot} aria-label={`${CATEGORY_INFO[cat].label}, ${slot ? "fallback" : "first choice"}`} value={list[slot] ?? ""} onChange={(e) => set(cat, slot as 0 | 1, e.target.value)}>
                  <option value="">{slot ? "None" : "The loaded model"}</option>
                  {list[slot] && !options.some((o) => o.value === list[slot]) && <option value={list[slot]}>{list[slot]}</option>}
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ))}
            </div>
          );
        })}
      </div>
      <label className="small">Try a request
        <input type="text" placeholder="Type a request to see which model {DYNAMIC_NAME} would use" value={probe} onChange={(e) => setProbe(e.target.value)} />
      </label>
      {sorted && (
        <div className="small">
          <strong>{CATEGORY_INFO[sorted.category].label}</strong> <span className="muted">({Math.round(sorted.confidence * 100)}% sure: {sorted.reason}{sorted.confidence < 0.55 ? "; the loaded model would be asked" : ""})</span>
          {" → "}{picked ? <strong>{picked.entry.name}</strong> : <span className="muted">no model installed</span>}
          {picked?.wanted && <span className="muted"> (wanted {picked.wanted}, not installed)</span>}
        </div>
      )}
    </div>
  );
}
