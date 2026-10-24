import { useMemo, useState } from "react";
import type { Artifact, ArtifactKind, Project } from "../shared/types";
import { ArtifactViewer, kindLabel } from "./ArtifactView";

const KINDS: { id: ArtifactKind | "all"; label: string }[] = [{ id: "all", label: "All" }, { id: "html", label: "Web pages" }, { id: "markdown", label: "Documents" }, { id: "code", label: "Code" }, { id: "svg", label: "Images" }];

export function Artifacts({ artifacts, projects, openId, onOpen, onDelete, onExport }: {
  artifacts: Artifact[]; projects: Project[]; openId: string | null; onOpen: (id: string | null) => void;
  onDelete: (id: string) => void; onExport: (id: string) => void;
}) {
  const [kind, setKind] = useState<ArtifactKind | "all">("all");
  const [q, setQ] = useState("");
  const shown = useMemo(() => artifacts
    .filter((a) => (kind === "all" || a.kind === kind) && (!q.trim() || (a.title + " " + a.content).toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => b.updated - a.updated), [artifacts, kind, q]);
  const open = artifacts.find((a) => a.id === openId);
  const pname = (id: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <div className="split-page">
      <div className="page list-side">
        <h1 className="serif">Artifacts</h1>
        <p className="muted">Pages, documents, code and images the assistant made for you. Ask for one in any chat ("make me a landing page", "write a script that…") or from a scheduled task.</p>
        <div className="searchbar"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artifacts" /></div>
        <div className="seg" style={{ alignSelf: "flex-start", marginBottom: 12 }}>{KINDS.map((k) => <button key={k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>{k.label}</button>)}</div>
        {shown.length === 0 ? (
          <div className="empty-box"><p>{artifacts.length === 0 ? "Nothing here yet. Try asking in a chat: “Build a small pomodoro timer as a web page”." : "No artifact matches."}</p></div>
        ) : (
          <div className="list">
            {shown.map((a) => (
              <div key={a.id} className={`row-item clickable ${a.id === openId ? "sel" : ""}`} onClick={() => onOpen(a.id)}>
                <div className="grow">
                  <strong>{a.title}</strong>
                  <div className="muted small">{kindLabel(a)} · {a.source.type === "task" ? "scheduled task" : "chat"}{pname(a.projectId) ? ` · ${pname(a.projectId)}` : ""} · {new Date(a.updated).toLocaleString()}</div>
                </div>
                <button className="linkbtn" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${a.title}"?`)) { onDelete(a.id); if (a.id === openId) onOpen(null); } }}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {open && (
        <ArtifactViewer key={open.id} artifact={open} onClose={() => onOpen(null)} onExport={() => onExport(open.id)} />
      )}
    </div>
  );
}
