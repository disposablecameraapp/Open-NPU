import { useEffect, useState } from "react";
import { api } from "./api";
import type { BrowseResult, BrowseRow, BrowseSort, BrowseVariant, Level, QuantClass, SourceId } from "../shared/types";
import { CapBadges } from "./Capabilities";

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

function toggle<T>(list: T[], v: T): T[] { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }

function Chip({ on, label, hint, onClick }: { on: boolean; label: string; hint?: string; onClick: () => void }) {
  return <button type="button" className={`filter-chip ${on ? "on" : ""}`} aria-pressed={on} title={hint} onClick={onClick}>{label}</button>;
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

function Row({ r, onOpen }: { r: BrowseRow; onOpen: (input: string) => void }) {
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
          <strong>{r.repo}</strong>
          <CapBadges compact entry={{ id: r.repo, name: r.repo, repo: r.repo, architecture: r.architecture ?? undefined, isMoe: r.isMoe, tags: r.tags, pipeline: r.pipeline, engine: r.engine }} />
        </div>
        <div className="muted small">{meta}</div>
        {why && <div className="muted small">{why}</div>}
        {open && <Variants name={r.repo.split("/")[1]} onOpen={onOpen} />}
      </div>
      <span className={`badge ${r.verdict.level}`}>{LEVEL_LABEL[r.verdict.level]}</span>
      {r.needsVersion
        ? <button className="ghost" onClick={() => setOpen((v) => !v)}>{open ? "Hide versions" : "Versions"}</button>
        : <button className="ghost" onClick={() => onOpen(r.ref)}>Check and install</button>}
    </div>
  );
}

/** Models from every source, estimated against this machine. Nothing is hidden for good: tick a box and they appear. */
export function Explore({ query, onOpen, busy }: { query: string; onOpen: (input: string) => void; busy: boolean }) {
  const [sort, setSort] = useState<BrowseSort>("downloads");
  const [sources, setSources] = useState<SourceId[]>(["aihub", "hf", "docker"]);
  const [quants, setQuants] = useState<QuantClass[]>(["q4_0"]);
  const [levels, setLevels] = useState<Level[]>(["green", "amber"]);
  const [limit, setLimit] = useState(PAGE);
  const [res, setRes] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setLimit(PAGE); }, [query, sort]);
  useEffect(() => {
    let live = true;
    setLoading(true); setErr(null);
    api().browse({ query, sort, limit, sources, quants, levels })
      .then((r) => { if (live) setRes(r); })
      .catch((e) => { if (live) setErr((e as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [query, sort, limit, sources, quants, levels]);

  return (
    <section>
      <div className="filter-group"><span className="small muted">From</span>
        {SOURCES.map((s) => <Chip key={s.id} on={sources.includes(s.id)} label={s.label} hint={s.hint} onClick={() => setSources((v) => toggle(v, s.id))} />)}
      </div>
      <div className="filter-group"><span className="small muted">Quant</span>
        {QUANTS.map((s) => <Chip key={s.id} on={quants.includes(s.id)} label={s.label} hint={s.hint} onClick={() => setQuants((v) => toggle(v, s.id))} />)}
      </div>
      <div className="filter-group"><span className="small muted">Show</span>
        {LEVELS.map((l) => <Chip key={l} on={levels.includes(l)} label={LEVEL_LABEL[l]} onClick={() => setLevels((v) => toggle(v, l))} />)}
        <label className="small order">Order
          <select value={sort} onChange={(e) => setSort(e.target.value as BrowseSort)}>{SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
      </div>
      <div className="muted small">
        {query ? <>Results for “{query}”</> : <>Everything</>}
        {res && <> · {res.rows.length} shown, {res.hidden} hidden by the boxes above, {res.scanned} looked at</>}
      </div>
      {err && <div className="error-box">{err}</div>}
      {res?.notes.map((n, i) => <div key={i} className="warn small">{n}</div>)}
      <div className="list">
        {res?.rows.map((r) => <Row key={`${r.source}:${r.repo}`} r={r} onOpen={onOpen} />)}
        {res && !res.rows.length && !loading && <div className="muted">Nothing here. Tick more boxes above (“Unlikely or unknown” shows everything), or look further down.</div>}
        {loading && <div className="muted">Looking…</div>}
      </div>
      {res && sources.includes("hf") && limit < 1000 && res.scanned >= limit && (
        <button className="ghost" disabled={loading || busy} onClick={() => setLimit((n) => Math.min(1000, n + PAGE))}>Look further on Hugging Face ({limit} looked at)</button>
      )}
      <div className="muted small">Sizes are estimated (from the parameter count, or the version's real size on Docker Hub) at a short context. “Check and install” gives the exact verdict, and any model can be installed whatever the badge says. Order is by popularity: download counts say nothing about how well a model runs here.</div>
    </section>
  );
}
