import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { api } from "./api";
import { ArtifactViewer } from "./ArtifactView";
import type { VersionList, VersionResult } from "../core/versionBook";
import type { VersionMeta } from "../core/versions";

export const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

export const byLabel = (by: VersionMeta["by"]) => (by === "you" ? "edited by you" : by === "auto" ? "automatic fix" : by === "restore" ? "went back" : "assistant");

/** The drop-down of a file's versions: scroll, pick one to look at it, and a button to the Artifacts page for the rest. */
function VersionMenu({ list, picked, onPick, onManage }: { list: VersionList; picked: string | null; onPick: (v: VersionMeta) => void; onManage?: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  const main = list.versions.find((v) => v.id === list.main);
  const shown = list.versions.find((v) => v.id === (picked ?? list.main));
  return (
    <div className="ver-anchor" ref={box}>
      <button type="button" className={`ver-chip ${picked ? "past" : ""}`} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} title={shown ? `v${shown.n}: ${shown.title}` : "Versions"}>
        v{shown?.n ?? main?.n ?? 1} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="ver-menu" role="listbox" aria-label="Versions">
          <div className="ver-list">
            {list.versions.map((v) => (
              <button key={v.id} type="button" role="option" aria-selected={v.id === (picked ?? list.main)} className={`ver-row ${v.id === (picked ?? list.main) ? "sel" : ""}`} onClick={() => { setOpen(false); onPick(v); }}>
                <span className="ver-n">v{v.n}</span>
                <span className="ver-t"><strong>{v.title}</strong><span className="muted small">{ago(v.at)} · {byLabel(v.by)}{v.parent === null ? " · base" : ""}{v.id === list.main ? " · in use" : ""}</span></span>
                <span className="ver-d small"><span className="plus">+{v.plus}</span> <span className="minus">−{v.minus}</span></span>
              </button>
            ))}
          </div>
          {onManage && <button type="button" className="ver-manage" onClick={() => { setOpen(false); onManage(); }}>Manage versions…</button>}
        </div>
      )}
    </div>
  );
}

/**
 * The file viewer with its versions: a menu to look at an older one (read only), and from there use it as the file the app works from
 * or go back to it, which adds a new version. `artifactId` is the file as the library keeps it; without one it is the plain viewer.
 */
export function VersionedViewer({ artifactId, onManage, onApplied, ...viewer }: ComponentProps<typeof ArtifactViewer> & { artifactId?: string; onManage?: () => void; onApplied?: (r: VersionResult) => void }) {
  const [list, setList] = useState<VersionList | null>(null);
  const [pick, setPick] = useState<{ meta: VersionMeta; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = !!viewer.live;
  const content = viewer.artifact.content;
  const reload = useCallback(() => {
    if (!artifactId) return;
    void api().artifactVersions(artifactId).then(setList).catch(() => setList(null));
  }, [artifactId]);
  useEffect(() => { if (!live) reload(); }, [reload, live, content]);
  // a text that changed under a version being looked at (a new answer) brings the reader back to the file
  useEffect(() => { setPick(null); }, [content]);

  const choose = async (meta: VersionMeta) => {
    setError(null);
    if (!artifactId || !list || meta.id === list.main) { setPick(null); return; }
    const text = await api().artifactVersionText(artifactId, meta.id);
    if (text === null) { setError("That version could not be read."); return; }
    setPick({ meta, text });
  };
  const act = async (type: "use" | "restore") => {
    if (!artifactId || !pick) return;
    const r = await api().artifactVersionAction(artifactId, { type, id: pick.meta.id });
    if (!r.ok) { setError(r.error ?? "Could not do that."); return; }
    setError(null);
    setPick(null);
    setList(r.list);
    onApplied?.(r);
  };

  const menu = artifactId && list && !live ? <VersionMenu list={list} picked={pick?.meta.id ?? null} onPick={(v) => void choose(v)} onManage={onManage} /> : null;
  const banner = pick && list ? (
    <div className="ver-banner" role="status">
      <span>Looking at <strong>v{pick.meta.n}</strong> · {pick.meta.title}. v{list.versions.find((v) => v.id === list.main)?.n} is in use.</span>
      <button type="button" className="linkbtn" onClick={() => void act("use")} title="The app uses this version from now on. Your next change branches from it. Nothing is deleted.">Use this version</button>
      <button type="button" className="linkbtn" onClick={() => void act("restore")} title="Adds a new version with this text, as a branch from it. Nothing is deleted.">Go back to it</button>
      <button type="button" className="linkbtn" onClick={() => setPick(null)}>Back to current</button>
    </div>
  ) : error ? <div className="ver-banner" role="alert"><span>{error}</span><button type="button" className="linkbtn" onClick={() => setError(null)}>OK</button></div> : null;
  return (
    <ArtifactViewer
      {...viewer}
      artifact={pick ? { ...viewer.artifact, content: pick.text } : viewer.artifact}
      onEdit={pick ? undefined : viewer.onEdit}
      headerExtra={menu}
      banner={banner}
    />
  );
}
