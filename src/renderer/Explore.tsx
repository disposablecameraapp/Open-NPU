import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { api } from "./api";
import type { BrowseResult, BrowseRow, BrowseSort, BrowseVariant, Level, QuantClass, SourceId } from "../shared/types";
import { CapBadges, CAP_ICON } from "./Capabilities";
import { CAP_INFO, capabilities, type CapId } from "../core/capabilities";
import { quantClass } from "../core/browse";

const LEVEL_LABEL: Record<Level, string> = { green: "Should run on NPU", amber: "Caution", red: "Unlikely or unknown" };
const SORTS: { id: BrowseSort; label: string }[] = [
  { id: "downloads", label: "Most downloaded" }, { id: "trending", label: "Trending" }, { id: "likes", label: "Most liked" }, { id: "recent", label: "Recently updated" }
];
const SOURCES: { id: SourceId; label: string; hint: string }[] = [
  { id: "aihub", label: "Native NPU bundles", hint: "Qualcomm AI Hub: precompiled for the Hexagon NPU, NPU only" },
  { id: "hf", label: "Hugging Face", hint: "GGUF models, the biggest catalog" },
  { id: "docker", label: "Docker Hub", hint: "The ai/ namespace: GGUF models in Docker's catalog" }
];
const QUANTS: { id: QuantClass; label: string; hint: string }[] = [
  { id: "q4_0", label: "Q4_0", hint: "Best Hexagon support, the default choice" },
  { id: "other4", label: "Other 4-bit", hint: "Q4_K_M, IQ4_XS… may use the CPU" },
  { id: "other", label: "8-bit and up", hint: "Q8_0, MXFP4, 16-bit: bigger files; good for small models" }
];
const LEVELS: Level[] = ["green", "amber", "red"];
const PAGE = 100;
const SOURCE_TAG: Record<SourceId, string> = { hf: "Hugging Face", docker: "Docker Hub", modelscope: "ModelScope", aihub: "Native NPU" };

const SAVED_KEY = "open-npu.savedModels";
const keyOf = (r: BrowseRow) => `${r.source}:${r.repo}`;
function loadSaved(): Record<string, BrowseRow> {
  try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
function storeSaved(v: Record<string, BrowseRow>) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(v)); } catch { /* private mode: kept for this session only */ } }

function without(t: Partial<Record<CapId, Mode>>, id: CapId) { const n = { ...t }; delete n[id]; return n; }
function toggle<T>(list: T[], v: T): T[] { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }

const SIZE_MAX = 32;

/** Two thumbs on one track: the lower can never pass the upper. The top end means "no upper limit". */
function RangeSlider({ min, max, value, onChange }: { min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void }) {
  const [lo, hi] = value;
  const pct = (n: number) => `${((n - min) / (max - min)) * 100}%`;
  return (
    <div className="dual-range">
      <div className="dual-track"><div className="dual-fill" style={{ left: pct(lo), right: `calc(100% - ${pct(hi)})` }} /></div>
      <input type="range" min={min} max={max} step={1} value={lo} aria-label="Smallest model size in billions of parameters" onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])} />
      <input type="range" min={min} max={max} step={1} value={hi} aria-label="Largest model size in billions of parameters" onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])} />
    </div>
  );
}

type Mode = "need" | "not";

function Chip({ on, label, hint, onClick, count, icon, mode }: { on: boolean; label: string; hint?: string; onClick: () => void; count?: number; icon?: React.ReactNode; mode?: Mode }) {
  const cls = `filter-chip ${on ? "on" : ""} ${mode === "not" ? "not" : ""} ${count === 0 && !on ? "empty" : ""}`;
  return (
    <button type="button" className={cls} aria-pressed={on} title={hint} onClick={onClick}>
      {icon}<span className={mode === "not" ? "struck" : ""}>{label}</span>{count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}

function Variants({ name, onOpen }: { name: string; onOpen: (input: string) => void }) {
  const [list, setList] = useState<BrowseVariant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api().dockerVariants(name).then(setList).catch((e) => setErr((e as Error).message)); }, [name]);
  if (err) return <div className="error-box">{err}</div>;
  if (!list) return <div className="muted small">Reading the versions…</div>;
  return (
    <div className="variants">
      {list.map((v) => (
        <div key={v.tag} className="variant">
          <span className="variant-tag">{v.tag}</span>
          <span className="muted small grow">{v.sizeGB !== null ? `${v.sizeGB} GB` : "size ?"}{v.quant ? ` · ${v.quant}` : ""}{v.verdict.reasons[0] ? ` · ${v.verdict.reasons[0]}` : ""}</span>
          <span className={`badge ${v.verdict.level}`}>{LEVEL_LABEL[v.verdict.level]}</span>
          <button className="ghost" onClick={() => onOpen(v.ref)}>Check and install</button>
        </div>
      ))}
    </div>
  );
}

function Row({ r, onOpen, saved, onSave }: { r: BrowseRow; onOpen: (input: string) => void; saved: boolean; onSave: () => void }) {
  const [open, setOpen] = useState(false);
  const meta = [
    r.paramsB !== null ? `${r.paramsB}B` : r.needsVersion ? "several sizes" : "size ?",
    r.architecture ?? "architecture ?",
    r.quant ? `${r.quant}${r.estGB !== null ? ` ~${r.estGB} GB` : ""}` : null,
    r.downloads ? `${r.downloads.toLocaleString()} ${r.source === "docker" ? "pulls" : "downloads"}` : null,
    r.likes ? `${r.likes.toLocaleString()} ${r.source === "docker" ? "stars" : "likes"}` : null,
    r.updated ? r.updated.slice(0, 10) : null
  ].filter(Boolean).join(" · ");
  const why = r.description ?? r.verdict.reasons.find((x) => !x.startsWith("NPU memory limit is an estimate"));
  return (
    <div className={`row-item browse-row ${r.source === "aihub" ? "native" : ""}`}>
      <div className="browse-main">
        <div className="browse-title">
          <span className={`src src-${r.source}`}>{SOURCE_TAG[r.source]}</span>
          <button type="button" className={`star ${saved ? "on" : ""}`} aria-pressed={saved} title={saved ? "Remove from saved models" : "Save to compare later"} onClick={onSave}>{saved ? "★" : "☆"}</button>
          <strong>{r.repo}</strong>
          <CapBadges compact entry={{ id: r.repo, name: r.repo, repo: r.repo, architecture: r.architecture ?? undefined, isMoe: r.isMoe, tags: r.tags, pipeline: r.pipeline, engine: r.engine, contextLength: r.contextLength }} />
        </div>
        <div className="muted small">{meta}</div>
        {open && <Variants name={r.repo.split("/")[1]} onOpen={onOpen} />}
      </div>
      <span className={`badge ${r.verdict.level}`} title={why}>{LEVEL_LABEL[r.verdict.level]}</span>
      {r.needsVersion
        ? <button className="ghost" onClick={() => setOpen((v) => !v)}>{open ? "Hide versions" : "Versions"}</button>
        : <button className="ghost" onClick={() => onOpen(r.ref)}>Check and install</button>}
    </div>
  );
}

/** Saved models side by side: one column each, so the differences that matter are on one line. */
function Compare({ rows, onOpen, onRemove }: { rows: BrowseRow[]; onOpen: (input: string) => void; onRemove: (r: BrowseRow) => void }) {
  const kinds = (r: BrowseRow) => capabilities({ id: r.repo, name: r.repo, repo: r.repo, architecture: r.architecture ?? undefined, isMoe: r.isMoe, tags: r.tags, pipeline: r.pipeline, engine: r.engine, contextLength: r.contextLength }).map((c) => c.label).join(", ") || "-";
  const lines: [string, (r: BrowseRow) => React.ReactNode][] = [
    ["Fits my NPU", (r) => <span className={`badge ${r.verdict.level}`}>{LEVEL_LABEL[r.verdict.level]}</span>],
    ["Parameters", (r) => r.paramsB !== null ? `${r.paramsB}B${r.isMoe ? " (MoE)" : ""}` : "?"],
    ["Kind", kinds],
    ["Architecture", (r) => r.architecture ?? "?"],
    ["Quant · file", (r) => r.quant ? `${r.quant}${r.estGB !== null ? ` · ~${r.estGB} GB` : ""}` : "pick a version"],
    ["NPU memory", (r) => r.verdict.estNpuGB ? `~${r.verdict.estNpuGB} GB` : "?"],
    ["Speed (estimate)", (r) => r.verdict.estTokPerSec ? `~${Math.round(r.verdict.estTokPerSec)} tok/s` : "?"],
    ["Context it fits", (r) => r.verdict.contextTokens ? `${Math.round(r.verdict.contextTokens / 1024)}K` : "?"],
    ["Trained context", (r) => r.contextLength ? `${Math.round(r.contextLength / 1024)}K` : "?"],
    ["Popularity", (r) => `${r.downloads.toLocaleString()} ${r.source === "docker" ? "pulls" : "downloads"}`],
    ["Updated", (r) => r.updated ? r.updated.slice(0, 10) : "?"]
  ];
  return (
    <div className="compare-wrap">
      <table className="compare">
        <thead><tr><th />{rows.map((r) => <th key={keyOf(r)}><span className={`src src-${r.source}`}>{SOURCE_TAG[r.source]}</span><div className="compare-name">{r.repo}</div></th>)}</tr></thead>
        <tbody>
          {lines.map(([label, f]) => <tr key={label}><th scope="row">{label}</th>{rows.map((r) => <td key={keyOf(r)}>{f(r)}</td>)}</tr>)}
          <tr><th /> {rows.map((r) => <td key={keyOf(r)}><button className="ghost" onClick={() => onOpen(r.ref)}>{r.needsVersion ? "Open" : "Check and install"}</button> <button className="ghost" onClick={() => onRemove(r)}>Remove</button></td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

/** Models from every source, estimated against this machine. Nothing is hidden for good: tick a box and they appear. */
export function Explore({ query, onOpen, busy }: { query: string; onOpen: (input: string) => void; busy: boolean }) {
  const [sort, setSort] = useState<BrowseSort>("downloads");
  const [sources, setSources] = useState<SourceId[]>(["aihub", "hf", "docker"]);
  const [quants, setQuants] = useState<QuantClass[]>(["q4_0"]);
  const [levels, setLevels] = useState<Level[]>(["green", "amber"]);
  const [types, setTypes] = useState<Partial<Record<CapId, Mode>>>({});
  const [size, setSize] = useState<[number, number]>([0, SIZE_MAX]);
  const [saved, setSaved] = useState<Record<string, BrowseRow>>(loadSaved);
  const [savedOnly, setSavedOnly] = useState(false);
  const [compare, setCompare] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [res, setRes] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setLimit(PAGE); }, [query, sort]);
  useEffect(() => {
    let live = true;
    setLoading(true); setErr(null);
    api().browse({ query, sort, limit, sources, quants, levels: LEVELS })
      .then((r) => { if (live) setRes(r); })
      .catch((e) => { if (live) setErr((e as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [query, sort, limit, sources, quants]);

  const sizeActive = size[0] > 0 || size[1] < SIZE_MAX;
  // Every row with the kinds it has, read once per result set; the counts and the list both come from this.
  const savedList = Object.values(saved);
  const toggleSaved = (r: BrowseRow) => setSaved((cur) => { const n = { ...cur }; if (n[keyOf(r)]) delete n[keyOf(r)]; else n[keyOf(r)] = r; storeSaved(n); return n; });
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  // Saved mode searches the models you kept (as they were when you saved them), not the network.
  const pool = savedOnly ? savedList.filter((r) => words.every((w) => r.repo.toLowerCase().includes(w))) : res?.rows ?? [];
  const all = useMemo(() => pool.map((r) => ({
    r,
    caps: new Set(capabilities({ id: r.repo, name: r.repo, repo: r.repo, architecture: r.architecture ?? undefined, isMoe: r.isMoe, tags: r.tags, pipeline: r.pipeline, engine: r.engine, contextLength: r.contextLength }).map((c) => c.id))
  })), [res, savedOnly, saved, query]);
  const inSize = (r: BrowseRow) => !sizeActive || (r.paramsB !== null && r.paramsB >= size[0] && (size[1] >= SIZE_MAX || r.paramsB <= size[1]));
  const okTypes = (caps: Set<CapId>, t: Partial<Record<CapId, Mode>>) => (Object.entries(t) as [CapId, Mode][]).every(([id, m]) => (m === "need") === caps.has(id));
  const countOf = (pred: (x: (typeof all)[number]) => boolean) => all.filter(pred).length;
  const rows = all.filter((x) => inSize(x.r) && levels.includes(x.r.verdict.level) && okTypes(x.caps, types)).map((x) => x.r);
  // What a chip would give if you clicked it, every other filter kept; an empty chip means that combination does not exist.
  const typeCount = (id: CapId) => countOf((x) => inSize(x.r) && levels.includes(x.r.verdict.level) && okTypes(x.caps, types[id] === "need" ? types : { ...types, [id]: "need" }));
  const levelCount = (l: Level) => countOf((x) => inSize(x.r) && x.r.verdict.level === l && okTypes(x.caps, types));
  const sourceCount = (id: SourceId) => countOf((x) => x.r.source === id && inSize(x.r) && levels.includes(x.r.verdict.level) && okTypes(x.caps, types));
  const quantCount = (id: QuantClass) => countOf((x) => !!x.r.quant && quantClass(x.r.quant) === id && inSize(x.r) && levels.includes(x.r.verdict.level) && okTypes(x.caps, types));
  const cycle = (id: CapId) => setTypes((t) => { const n = { ...t }; if (!t[id]) n[id] = "need"; else if (t[id] === "need") n[id] = "not"; else delete n[id]; return n; });
  const showCompare = compare && savedOnly && rows.length > 0;
  const typesOn = Object.keys(types).length;
  const filtersOn = typesOn > 0 || sizeActive;
  const deeper = !savedOnly && !!res && sources.includes("hf") && limit < 1000 && res.scanned >= limit;
  // A narrow filter on the top 100 leaves almost nothing: keep reading further down the list, doubling each time.
  const autoDeepen = filtersOn && deeper && !loading && rows.length < 10;
  useEffect(() => { if (autoDeepen) setLimit((n) => Math.min(1000, n * 2)); }, [autoDeepen, res]);
  const resetFilters = () => { setTypes({}); setSize([0, SIZE_MAX]); setQuants(["q4_0"]); setLevels(["green", "amber"]); setSources(["aihub", "hf", "docker"]); };
  const defaults = typesOn === 0 && !sizeActive && quants.length === 1 && quants[0] === "q4_0" && levels.length === 2 && !levels.includes("red") && sources.length === 3;
  const moreChanged = sources.length !== 3 || quants.length !== 1 || quants[0] !== "q4_0";
  const sizeLabel = size[0] === 0 && size[1] >= SIZE_MAX ? "any" : `${size[0]}B – ${size[1] >= SIZE_MAX ? `${SIZE_MAX}B+` : `${size[1]}B`}`;

  return (
    <section>
      <div className="saved-bar">
        <div className="seg" role="tablist">
          <button className={!savedOnly ? "on" : ""} onClick={() => { setSavedOnly(false); setCompare(false); }}>All models</button>
          <button className={savedOnly ? "on" : ""} onClick={() => setSavedOnly(true)}>★ Saved ({savedList.length})</button>
        </div>
        {savedOnly && savedList.length > 1 && <button type="button" className="ghost" onClick={() => setCompare((v) => !v)}>{compare ? "Back to the list" : `Compare ${Math.min(rows.length, 8)} side by side`}</button>}
        {savedOnly && savedList.length > 0 && <button type="button" className="linklike" onClick={() => { if (window.confirm("Remove every saved model?")) { setSaved({}); storeSaved({}); setCompare(false); } }}>Clear saved</button>}
      </div>
      <div className="filters">
        <div className="f-field f-wide"><div className="f-label">Kind of model <span className="f-value">click to require, again to exclude</span></div>
          <div className="chips">
            {CAP_INFO.map((c) => { const Icon = CAP_ICON[c.id]; const m = types[c.id]; return (
              <Chip key={c.id} on={!!m} mode={m} icon={<Icon />} label={m === "not" ? `No ${c.label}` : c.label} hint={`${c.hint} ${m === "need" ? "Click to exclude." : m === "not" ? "Click to clear." : "Click to require."}`}
                count={m === "not" ? countOf((x) => inSize(x.r) && levels.includes(x.r.verdict.level) && x.caps.has(c.id) && okTypes(x.caps, without(types, c.id))) : typeCount(c.id)} onClick={() => cycle(c.id)} />
            ); })}
          </div>
        </div>
        <div className="f-row3">
        <div className="f-field"><div className="f-label">Fits my NPU</div>
          <div className="chips">{LEVELS.map((l) => <Chip key={l} on={levels.includes(l)} label={LEVEL_LABEL[l]} count={levelCount(l)} onClick={() => setLevels((v) => toggle(v, l))} />)}</div>
        </div>
        <div className="f-field"><div className="f-label">Size <span className="f-value">{sizeLabel}</span></div>
          <RangeSlider min={0} max={SIZE_MAX} value={size} onChange={setSize} />
        </div>
        <div className="f-field"><div className="f-label">Order by</div>
          <select value={sort} onChange={(e) => setSort(e.target.value as BrowseSort)}>{SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </div>
        </div>
        <details className="f-more">
          <summary>Sources and quantization{moreChanged ? " · changed" : ""}</summary>
          <div className="f-more-body">
            <div className="f-field"><div className="f-label">From</div>
              <div className="chips">{SOURCES.map((s) => <Chip key={s.id} on={sources.includes(s.id)} label={s.label} hint={s.hint} count={sources.includes(s.id) ? sourceCount(s.id) : undefined} onClick={() => setSources((v) => toggle(v, s.id))} />)}</div>
            </div>
            <div className="f-field"><div className="f-label">Quantization</div>
              <div className="chips">{QUANTS.map((s) => <Chip key={s.id} on={quants.includes(s.id)} label={s.label} hint={s.hint} count={quants.includes(s.id) ? quantCount(s.id) : undefined} onClick={() => setQuants((v) => toggle(v, s.id))} />)}</div>
            </div>
          </div>
        </details>
      </div>
      <div className="notes">
        <div>
          {(savedOnly || res) ? <>{rows.length} shown{pool.length > rows.length ? `, ${pool.length - rows.length} hidden by filters` : ""}</> : "Loading…"}
          {!defaults && <> · <button type="button" className="linklike" onClick={resetFilters}>Reset filters</button></>}
        </div>
        {!!res?.notes.length && <details><summary>{res.notes.length} source{res.notes.length > 1 ? "s" : ""} unavailable</summary>{res.notes.map((n, i) => <div key={i}>{n}</div>)}</details>}
      </div>
      {err && <div className="error-box">{err}</div>}
      {showCompare && <Compare rows={rows.slice(0, 8)} onOpen={onOpen} onRemove={toggleSaved} />}
      <div className="list explore-list">
        {!showCompare && rows.map((r) => <Row key={keyOf(r)} r={r} onOpen={onOpen} saved={!!saved[keyOf(r)]} onSave={() => toggleSaved(r)} />)}
        {(savedOnly || res) && !rows.length && !loading && <div className="muted">{savedOnly && !savedList.length ? "Nothing saved yet. Click ☆ next to a model to keep it here." : "No matches. Try loosening the filters."}</div>}
        {!savedOnly && (loading || autoDeepen) && <div className="muted">{filtersOn && limit > PAGE ? `Looking further down the list (${limit} models) to fill your filters…` : "Looking…"}</div>}
      </div>
      {!savedOnly && res && sources.includes("hf") && limit < 1000 && res.scanned >= limit && (
        <button className="ghost" disabled={loading || busy} onClick={() => setLimit((n) => Math.min(1000, n + PAGE))}>Look further on Hugging Face ({limit} looked at)</button>
      )}
    </section>
  );
}
