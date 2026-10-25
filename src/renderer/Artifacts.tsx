import { useMemo, useState } from "react";
import type { Artifact, ArtifactKind, Project } from "../shared/types";
import { ArtifactViewer, kindLabel } from "./ArtifactView";
import { Seg } from "./Seg";
import { groupArtifacts, type ArtifactEntry } from "../core/artifactGroups";

const KINDS: { id: ArtifactKind | "all"; label: string }[] = [{ id: "all", label: "All" }, { id: "html", label: "Web pages" }, { id: "markdown", label: "Documents" }, { id: "code", label: "Code" }, { id: "svg", label: "Images" }];

export function Artifacts({ artifacts, projects, openId, onOpen, onDelete, onExport }: {
  artifacts: Artifact[]; projects: Project[]; openId: string | null; onOpen: (id: string | null) => void;
  onDelete: (id: string) => void; onExport: (id: string) => void;
}) {
  const [kind, setKind] = useState<ArtifactKind | "all">("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const matches = (a: Artifact) => (kind === "all" || a.kind === kind) && (!q.trim() || (a.title + " " + a.content).toLowerCase().includes(q.trim().toLowerCase()));
  const shown = useMemo(() => {
    const when = (e: ArtifactEntry) => (e.t === "group" ? e.updated : e.artifact.updated);
    return groupArtifacts(artifacts)
      .filter((e) => (e.t === "group" ? e.files.some(matches) : matches(e.artifact)))
      .sort((a, b) => when(b) - when(a));
  }, [artifacts, kind, q]);
  const open = artifacts.find((a) => a.id === openId);
  const openGroup = useMemo(() => {
    const g = groupArtifacts(artifacts).find((e) => e.t === "group" && e.files.some((f) => f.id === openId));
    return g && g.t === "group" ? g.files : undefined;
  }, [artifacts, openId]);
  const pname = (id: string | null) => projects.find((p) => p.id === id)?.name;

  const row = (a: Artifact, child: boolean) => (
    <div key={a.id} className={`row-item clickable ${a.id === openId ? "sel" : ""}`} onClick={() => onOpen(a.id)}>
      <div className="grow">
        <strong>{a.title}</strong>
        <div className="muted small">{kindLabel(a)}{child ? "" : ` · ${a.source.type === "task" ? "scheduled task" : "chat"}${pname(a.projectId) ? ` · ${pname(a.projectId)}` : ""} · ${new Date(a.updated).toLocaleString()}`}</div>
      </div>
      {!child && <button className="linkbtn" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${a.title}"?`)) { onDelete(a.id); if (a.id === openId) onOpen(null); } }}>Delete</button>}
    </div>
  );

  return (
    <div className="split-page">
      <div className="page list-side">
        <h1>Artifacts</h1>
        <p className="muted">Pages, documents, code and images the assistant made for you. Ask for one in any chat ("make me a landing page", "write a script that…") or from a scheduled task.</p>
        <div className="searchbar"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artifacts" /></div>
        <Seg style={{ alignSelf: "flex-start", marginBottom: 12 }}>{KINDS.map((k) => <button key={k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>{k.label}</button>)}</Seg>
        {shown.length === 0 ? (
          <div className="empty-box"><p>{artifacts.length === 0 ? "Nothing here yet. Try asking in a chat: “Build a small pomodoro timer as a web page”." : "No artifact matches."}</p></div>
        ) : (
          <div className="list">
            {shown.map((e) => {
              if (e.t === "single") return row(e.artifact, false);
              const isOpen = expanded.has(e.id) || e.files.some((f) => f.id === openId);
              return (
                <div key={e.id} className="art-group">
                  <div className={`row-item clickable ${e.main.id === openId ? "sel" : ""}`} onClick={() => { toggle(e.id); onOpen(e.main.id); }}>
                    <button className={`chev ${isOpen ? "open" : ""}`} aria-label={isOpen ? "Hide files" : "Show files"} aria-expanded={isOpen} onClick={(ev) => { ev.stopPropagation(); toggle(e.id); }}>▸</button>
                    <div className="grow">
                      <strong>{e.title}</strong>
                      <div className="muted small">{e.files.length} files · {e.main.source.type === "task" ? "scheduled task" : "chat"}{pname(e.main.projectId) ? ` · ${pname(e.main.projectId)}` : ""} · {new Date(e.updated).toLocaleString()}</div>
                    </div>
                    <button className="linkbtn" onClick={(ev) => { ev.stopPropagation(); if (confirm(`Delete "${e.title}" and its ${e.files.length} files?`)) { e.files.forEach((f) => onDelete(f.id)); if (e.files.some((f) => f.id === openId)) onOpen(null); } }}>Delete</button>
                  </div>
                  {isOpen && <div className="art-children">{e.files.map((f) => row(f, true))}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {open && (
        <ArtifactViewer key={open.id} artifact={open} files={openGroup} onClose={() => onOpen(null)} onExport={() => onExport(open.id)} />
      )}
    </div>
  );
}
