import { useMemo, useState } from "react";
import type { Artifact, Project, ScheduledTask } from "../shared/types";
import type { Conversation } from "./store";

function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text.slice(0, 120);
  const from = Math.max(0, i - 40);
  return (from > 0 ? "…" : "") + text.slice(from, i + q.length + 80).replace(/\s+/g, " ");
}

export function Search({ convs, projects, artifacts, tasks, onChat, onProject, onArtifact, onTasks }: {
  convs: Conversation[]; projects: Project[]; artifacts: Artifact[]; tasks: ScheduledTask[];
  onChat: (id: string) => void; onProject: (id: string) => void; onArtifact: (id: string) => void; onTasks: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const res = useMemo(() => {
    if (q.length < 2) return null;
    const chats = convs.map((c) => {
      const hit = c.title.toLowerCase().includes(q) ? c.title : c.turns.find((t) => t.content.toLowerCase().includes(q))?.content;
      return hit ? { c, text: snippet(hit, q) } : null;
    }).filter((x): x is { c: Conversation; text: string } => !!x).slice(0, 20);
    const projs = projects.filter((p) => (p.name + p.description + p.instructions + p.files.map((f) => f.name + f.content).join()).toLowerCase().includes(q));
    const arts = artifacts.filter((a) => (a.title + a.content).toLowerCase().includes(q)).slice(0, 20);
    const tks = tasks.filter((t) => (t.name + t.prompt).toLowerCase().includes(q));
    return { chats, projs, arts, tks };
  }, [q, convs, projects, artifacts, tasks]);
  const none = res && !res.chats.length && !res.projs.length && !res.arts.length && !res.tks.length;
  return (
    <div className="page">
      <h1 className="serif">Search</h1>
      <div className="searchbar"><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats, projects, artifacts and tasks" /></div>
      {!res && <p className="muted small">Type at least two characters.</p>}
      {none && <p className="muted">Nothing found for “{query}”.</p>}
      {res && res.chats.length > 0 && <section><h2>Chats</h2><div className="list">{res.chats.map(({ c, text }) => <div key={c.id} className="row-item clickable" onClick={() => onChat(c.id)}><div className="grow"><strong>{c.title}</strong><div className="muted small clip">{text}</div></div></div>)}</div></section>}
      {res && res.projs.length > 0 && <section><h2>Projects</h2><div className="list">{res.projs.map((p) => <div key={p.id} className="row-item clickable" onClick={() => onProject(p.id)}><div className="grow"><strong>{p.name}</strong><div className="muted small clip">{p.description}</div></div></div>)}</div></section>}
      {res && res.arts.length > 0 && <section><h2>Artifacts</h2><div className="list">{res.arts.map((a) => <div key={a.id} className="row-item clickable" onClick={() => onArtifact(a.id)}><div className="grow"><strong>{a.title}</strong><div className="muted small">{a.kind}</div></div></div>)}</div></section>}
      {res && res.tks.length > 0 && <section><h2>Scheduled tasks</h2><div className="list">{res.tks.map((t) => <div key={t.id} className="row-item clickable" onClick={onTasks}><div className="grow"><strong>{t.name}</strong><div className="muted small clip">{t.prompt}</div></div></div>)}</div></section>}
    </div>
  );
}
