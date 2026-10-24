import { useEffect, useState } from "react";
import { api } from "./api";
import type { BrowseResult, BrowseRow, BrowseSort, Level } from "../shared/types";
import { CapBadges } from "./Capabilities";

const LABEL: Record<Level, string> = { green: "Should run on NPU", amber: "Caution", red: "Not recommended" };
const SORTS: { id: BrowseSort; label: string }[] = [
  { id: "downloads", label: "Most downloaded" }, { id: "trending", label: "Trending" }, { id: "likes", label: "Most liked" }, { id: "recent", label: "Recently updated" }
];
const PAGE = 100;

function Row({ r, onCheck }: { r: BrowseRow; onCheck: (repo: string) => void }) {
  const why = r.verdict.reasons.find((x) => !x.startsWith("NPU memory limit is an estimate"));
  return (
    <div className="row-item browse-row">
      <div className="grow">
        <div className="browse-title">
          <strong>{r.repo}</strong>
          <CapBadges compact entry={{ id: r.repo, name: r.repo, repo: r.repo, architecture: r.architecture ?? undefined, isMoe: r.isMoe, tags: r.tags, pipeline: r.pipeline }} />
        </div>
        <div className="muted small">
          {r.paramsB !== null ? `${r.paramsB}B` : "size ?"} · {r.architecture ?? "architecture ?"} · {r.hasQ4_0 ? "Q4_0" : r.quants.filter((q) => /^(Q4|IQ4)/.test(q)).slice(0, 3).join(", ")}
          {r.estGB !== null ? ` ~${r.estGB} GB` : ""} · {r.downloads.toLocaleString()} downloads · {r.likes.toLocaleString()} likes{r.updated ? ` · ${r.updated.slice(0, 10)}` : ""}
        </div>
        {why && <div className="muted small">{why}</div>}
      </div>
      <span className={`badge ${r.verdict.level}`}>{LABEL[r.verdict.level]}</span>
      <button className="ghost" onClick={() => onCheck(r.repo)}>Check and install</button>
    </div>
  );
}

/** Every GGUF repo on Hugging Face that has a 4-bit file, scored against this machine before anything is downloaded. */
export function Explore({ query, onCheck, busy }: { query: string; onCheck: (repo: string) => void; busy: boolean }) {
  const [sort, setSort] = useState<BrowseSort>("downloads");
  const [q4Only, setQ4Only] = useState(true);
  const [fitsOnly, setFitsOnly] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [res, setRes] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setLimit(PAGE); }, [query, sort]);
  useEffect(() => {
    let live = true;
    setLoading(true); setErr(null);
    api().hfBrowse({ query, sort, limit, q4Only, fitsOnly })
      .then((r) => { if (live) setRes(r); })
      .catch((e) => { if (live) setErr((e as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [query, sort, limit, q4Only, fitsOnly]);

  return (
    <section>
      <div className="row browse-filters">
        <label className="small">Order
          <select value={sort} onChange={(e) => setSort(e.target.value as BrowseSort)}>{SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
        <label className="check small"><input type="checkbox" checked={q4Only} onChange={(e) => setQ4Only(e.target.checked)} /> Q4_0 only (best on the NPU)</label>
        <label className="check small"><input type="checkbox" checked={fitsOnly} onChange={(e) => setFitsOnly(e.target.checked)} /> Only what this NPU can run</label>
      </div>
      <div className="muted small">
        {query ? <>Hugging Face GGUF repos matching “{query}”</> : <>Hugging Face GGUF repos</>}
        {" · "}{q4Only ? "with a Q4_0 file" : "with a 4-bit file (K-quants may use the CPU)"}
        {res && <> · {res.rows.length} shown, {res.hidden} left out of {res.scanned} looked at</>}
      </div>
      {err && <div className="error-box">{err}</div>}
      <div className="list">
        {res?.rows.map((r) => <Row key={r.repo} r={r} onCheck={onCheck} />)}
        {res && !res.rows.length && !loading && <div className="muted">Nothing matches. Look further down the list, or relax a filter.</div>}
        {loading && <div className="muted">Looking on Hugging Face…</div>}
      </div>
      {res && limit < 1000 && res.scanned >= limit && (
        <button className="ghost" disabled={loading || busy} onClick={() => setLimit((n) => Math.min(1000, n + PAGE))}>Look further ({limit} looked at so far)</button>
      )}
      <div className="muted small">Sizes are estimated from the parameter count and the fit is checked at a short context. “Check and install” reads the real file header and gives the exact verdict. Order is by popularity: download and like counts say nothing about how well a model runs here.</div>
    </section>
  );
}
