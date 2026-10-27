import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { ago, byLabel } from "./VersionMenu";
import { Code } from "./Code";
import { unifiedDiff, type VersionMeta } from "../core/versions";
import type { VersionList, VersionResult } from "../core/versionBook";

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** All the versions of a file: who changed what and when, what differs between any two, and what to do with each (nothing is deleted unless the person does it). */
export function VersionsPanel({ artifactId, title, language, onBack, onApplied }: { artifactId: string; title: string; language: string; onBack: () => void; onApplied: (r: VersionResult) => void }) {
  const [list, setList] = useState<VersionList | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  /** What the selected version is compared with: its parent ("parent"), the version in use ("main"), or any version by id. */
  const [against, setAgainst] = useState<string>("parent");
  const [view, setView] = useState<"changes" | "text">("changes");
  const [texts, setTexts] = useState<Record<string, string | null>>({});
  const [note, setNote] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    const l = await api().artifactVersions(artifactId);
    setList(l);
    setSel((s) => (s && l?.versions.some((v) => v.id === s) ? s : l?.main ?? null));
  }, [artifactId]);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => new Map((list?.versions ?? []).map((v) => [v.id, v])), [list]);
  const meta = sel ? byId.get(sel) : undefined;
  const otherId = !meta || !list ? null : against === "main" ? list.main : against === "parent" ? meta.parent : byId.has(against) ? against : meta.parent;
  const want = [sel, otherId].filter((x): x is string => !!x);
  const wantKey = want.join("|");
  useEffect(() => {
    let off = false;
    for (const id of want) if (!(id in texts)) void api().artifactVersionText(artifactId, id).then((t) => { if (!off) setTexts((all) => ({ ...all, [id]: t })); });
    return () => { off = true; };
  }, [wantKey, artifactId]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = sel ? texts[sel] : undefined;
  const other = otherId ? texts[otherId] : "";
  const diff = useMemo(() => (text === undefined || other === undefined || text === null || other === null ? null : unifiedDiff(other ?? "", text, 3)), [text, other]);

  const act = async (action: Parameters<ReturnType<typeof api>["artifactVersionAction"]>[1]) => {
    const r = await api().artifactVersionAction(artifactId, action);
    setNote(r.ok ? (action.type === "use" ? "This version is now the one in use." : action.type === "restore" ? "Went back: a new version was added, nothing was deleted." : action.type === "delete" ? "Version deleted." : null) : r.error ?? "Could not do that.");
    if (r.ok) { setList(r.list); if (action.type === "restore" && r.list) setSel(r.list.main); if (action.type !== "rename") onApplied(r); }
  };
  const label = (v: VersionMeta) => `v${v.n} · ${v.title}`;
  const fromN = (v: VersionMeta) => (v.parent ? byId.get(v.parent)?.n : undefined);

  return (
    <div className="artifact-panel versions-panel">
      <div className="artifact-head">
        <div className="artifact-title"><strong>Versions · {title}</strong><span className="muted small">{list ? `${list.versions.length} version${list.versions.length === 1 ? "" : "s"} · ${kb(list.stored)} kept${list.whole > list.stored ? ` instead of ${kb(list.whole)} (only the differences are stored)` : ""}` : "…"}</span></div>
        <div className="spacer" />
        <button className="linkbtn" onClick={onBack}>← Back to the file</button>
      </div>
      {note && <div className="panel-note muted small" role="status">{note}</div>}
      {!list ? <p className="muted pad">This file has no versions yet.</p> : (
        <div className="ver-split">
          <div className="ver-side" role="list">
            {list.versions.map((v) => (
              <div key={v.id} role="listitem" className={`ver-item ${v.id === sel ? "sel" : ""}`} onClick={() => { setSel(v.id); setAgainst("parent"); }}>
                <div className="ver-item-head">
                  <span className="ver-n">v{v.n}</span>
                  {renaming === v.id
                    ? <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Enter") { void act({ type: "rename", id: v.id, title: draft }); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }} onBlur={() => setRenaming(null)} aria-label="Version title" />
                    : <strong className="grow">{v.title}</strong>}
                  {v.id === list.main && <span className="ver-tag">in use</span>}
                  {v.parent === null && <span className="ver-tag soft">base</span>}
                </div>
                <div className="muted small">{ago(v.at)} · {byLabel(v.by)} · <span className="plus">+{v.plus}</span> <span className="minus">−{v.minus}</span>{fromN(v) !== undefined && fromN(v) !== v.n - 1 ? ` · from v${fromN(v)}` : ""}{v.children > 1 ? ` · ${v.children} branches` : ""}</div>
                {v.id === sel && (
                  <div className="ver-actions">
                    {v.id !== list.main && <button className="linkbtn" onClick={(e) => { e.stopPropagation(); void act({ type: "use", id: v.id }); }} title="The app uses this version. Your next change branches from it.">Use as main</button>}
                    <button className="linkbtn" onClick={(e) => { e.stopPropagation(); void act({ type: "restore", id: v.id }); }} title="Adds a new version with this text, as a branch from it">Go back to it</button>
                    <button className="linkbtn" onClick={(e) => { e.stopPropagation(); setDraft(v.title); setRenaming(v.id); }}>Rename</button>
                    <button className="linkbtn danger-link" disabled={v.id === list.main} title={v.id === list.main ? "This is the version in use" : "Delete this version for good"} onClick={(e) => { e.stopPropagation(); if (confirm(`Delete v${v.n} “${v.title}” for good? Later versions are kept.`)) void act({ type: "delete", id: v.id }); }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="ver-detail">
            {meta && (
              <>
                <div className="ver-bar">
                  <div className="seg">
                    <button className={view === "changes" ? "on" : ""} onClick={() => setView("changes")}>Changes</button>
                    <button className={view === "text" ? "on" : ""} onClick={() => setView("text")}>Text</button>
                  </div>
                  {view === "changes" && (
                    <label className="small muted">Compared with{" "}
                      <select value={against} onChange={(e) => setAgainst(e.target.value)}>
                        {meta.parent && <option value="parent">its parent (v{fromN(meta)})</option>}
                        {list.main !== meta.id && <option value="main">the version in use</option>}
                        {list.versions.filter((v) => v.id !== meta.id).map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div className="ver-view">
                  {view === "text"
                    ? (text === undefined ? <p className="muted pad">Loading…</p> : <pre className="artifact-code"><Code text={text ?? ""} lang={language} /></pre>)
                    : !diff ? <p className="muted pad">Loading…</p>
                    : otherId === null ? <p className="muted pad">This is the first version: there is nothing before it.</p>
                    : diff.plus + diff.minus === 0 ? <p className="muted pad">Same text.</p>
                    : (
                      <pre className="diff">
                        {diff.rows.map((r, i) => r.t === "gap"
                          ? <div key={i} className="diff-row gap">⋯ {r.skipped} unchanged line{r.skipped === 1 ? "" : "s"}</div>
                          : <div key={i} className={`diff-row ${r.t}`}><span className="ln">{r.t === "add" ? "" : r.a}</span><span className="ln">{r.t === "del" ? "" : r.b}</span><span className="sign">{r.t === "add" ? "+" : r.t === "del" ? "−" : " "}</span>{r.line || " "}</div>)}
                      </pre>
                    )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
