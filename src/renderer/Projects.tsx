import { useEffect, useRef, useState } from "react";
import type { Artifact, Project, ProjectFile, ScheduledTask } from "../shared/types";
import { knowledgeBudget, knowledgeSize } from "../core/projects";
import { describeSchedule } from "../core/schedule";
import type { Conversation } from "./store";

const MAX_FILE = 1_000_000;

export function newProject(): Project {
  const now = Date.now();
  return { id: crypto.randomUUID(), name: "Untitled project", description: "", instructions: "", files: [], created: now, updated: now };
}

function ProjectEditor({ project, convs, tasks, artifacts, contextTokens, onChange, onBack, onDelete, onNewChat, onOpenChat, onOpenTasks, onOpenArtifact }: {
  project: Project; convs: Conversation[]; tasks: ScheduledTask[]; artifacts: Artifact[]; contextTokens: number;
  onChange: (p: Project) => void; onBack: () => void; onDelete: () => void; onNewChat: () => void; onOpenChat: (id: string) => void; onOpenTasks: () => void; onOpenArtifact: (id: string) => void;
}) {
  const [draft, setDraft] = useState(project);
  const [noteName, setNoteName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => onChange(draft), 400);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<Project>) => setDraft((d) => ({ ...d, ...p }));
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setErr(null);
    const added: ProjectFile[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE) { setErr(`${f.name} is larger than 1 MB. Split it or paste the relevant part as a note.`); continue; }
      const text = await f.text();
      if (text.includes("\u0000")) { setErr(`${f.name} is not a text file. Only text, markdown, code, CSV or JSON files can be added.`); continue; }
      added.push({ id: crypto.randomUUID(), name: f.name, content: text });
    }
    if (added.length) setDraft((d) => ({ ...d, files: [...d.files, ...added] }));
    if (fileRef.current) fileRef.current.value = "";
  };
  const addNote = () => {
    if (!noteText.trim()) return;
    setDraft((d) => ({ ...d, files: [...d.files, { id: crypto.randomUUID(), name: noteName.trim() || "Note", content: noteText }] }));
    setNoteName(""); setNoteText("");
  };

  const budget = knowledgeBudget(contextTokens);
  const used = knowledgeSize(draft);
  const pct = Math.min(100, Math.round((used / budget) * 100));
  const mine = convs.filter((c) => c.projectId === project.id && c.turns.length > 0).sort((a, b) => b.updated - a.updated);
  const myTasks = tasks.filter((t) => t.projectId === project.id);
  const myArts = artifacts.filter((a) => a.projectId === project.id);

  return (
    <div className="page">
      <button className="linkbtn back" onClick={onBack}>← All projects</button>
      <input className="title-input" value={draft.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Project name" />
      <input className="wide" value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="What is this project about? (one line)" />
      <div className="row"><button className="primary" onClick={onNewChat}>＋ New chat in this project</button></div>

      <section>
        <h2>Instructions</h2>
        <p className="muted small">Tell the assistant how to work in this project: tone, role, format, rules. It is sent with every message.</p>
        <textarea rows={5} value={draft.instructions} onChange={(e) => patch({ instructions: e.target.value })} placeholder="e.g. You are my French tutor. Answer in French first, then give the English translation. Correct my mistakes gently." />
      </section>

      <section>
        <h2>Knowledge</h2>
        <p className="muted small">Text the assistant can draw on in every chat of this project. It stays on this computer and goes into the model's context window.</p>
        <div className="meter-line">
          <div className="track"><div className={`fill ${pct >= 100 ? "warn" : ""}`} style={{ width: `${pct}%` }} /></div>
          <span className={`small ${used > budget ? "warn" : "muted"}`}>{Math.round(used / 1000)}k of {Math.round(budget / 1000)}k characters{used > budget ? ", the rest will be cut to fit the model" : ""}</span>
        </div>
        <div className="list">
          {draft.files.map((f) => (
            <div key={f.id} className="row-item">
              <div className="grow"><strong>{f.name}</strong> <span className="muted small">{f.content.length < 1000 ? f.content.length : Math.round(f.content.length / 100) / 10 + "k"} characters</span>
                <div className="muted small clip">{f.content.slice(0, 140).replace(/\s+/g, " ")}</div></div>
              <button className="linkbtn" onClick={() => patch({ files: draft.files.filter((x) => x.id !== f.id) })}>Remove</button>
            </div>
          ))}
          {draft.files.length === 0 && <div className="muted small">Nothing yet.</div>}
        </div>
        <div className="row">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
          <button className="ghost" onClick={() => fileRef.current?.click()}>Add files…</button>
        </div>
        {err && <div className="error-box">{err}</div>}
        <details className="sysprompt"><summary className="small muted">Or paste a note</summary>
          <input className="wide" value={noteName} onChange={(e) => setNoteName(e.target.value)} placeholder="Title" style={{ margin: "6px 0" }} />
          <textarea rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Paste text here" />
          <div className="row"><button className="ghost" onClick={addNote} disabled={!noteText.trim()}>Add note</button></div>
        </details>
      </section>

      <section>
        <h2>Chats</h2>
        <div className="list">
          {mine.map((c) => <div key={c.id} className="row-item clickable" onClick={() => onOpenChat(c.id)}><span className="grow">{c.title}</span><span className="muted small">{new Date(c.updated).toLocaleDateString()}</span></div>)}
          {mine.length === 0 && <div className="muted small">No chats yet.</div>}
        </div>
      </section>

      {(myArts.length > 0 || myTasks.length > 0) && (
        <section>
          <h2>Made in this project</h2>
          <div className="list">
            {myArts.map((a) => <div key={a.id} className="row-item clickable" onClick={() => onOpenArtifact(a.id)}><span className="grow">{a.title}</span><span className="muted small">{a.kind}</span></div>)}
            {myTasks.map((t) => <div key={t.id} className="row-item clickable" onClick={onOpenTasks}><span className="grow">{t.name}</span><span className="muted small">{describeSchedule(t.schedule)}</span></div>)}
          </div>
        </section>
      )}

      <section><button className="danger" onClick={() => { if (confirm(`Delete the project "${draft.name}"? Its chats are kept, without the project's context.`)) onDelete(); }}>Delete project</button></section>
    </div>
  );
}

export function Projects(props: {
  projects: Project[]; convs: Conversation[]; tasks: ScheduledTask[]; artifacts: Artifact[]; contextTokens: number;
  openId: string | null; onOpen: (id: string | null) => void;
  onSave: (p: Project) => void; onDelete: (id: string) => void;
  onNewChat: (projectId: string) => void; onOpenChat: (id: string) => void; onOpenTasks: () => void; onOpenArtifact: (id: string) => void;
}) {
  const { projects, convs, openId, onOpen } = props;
  const open = projects.find((p) => p.id === openId);
  if (open) {
    return (
      <ProjectEditor
        key={open.id} project={open} convs={convs} tasks={props.tasks} artifacts={props.artifacts} contextTokens={props.contextTokens}
        onChange={props.onSave} onBack={() => onOpen(null)} onDelete={() => { props.onDelete(open.id); onOpen(null); }}
        onNewChat={() => props.onNewChat(open.id)} onOpenChat={props.onOpenChat} onOpenTasks={props.onOpenTasks} onOpenArtifact={props.onOpenArtifact}
      />
    );
  }
  const sorted = [...projects].sort((a, b) => b.updated - a.updated);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Projects</h1><p className="muted">A project keeps instructions and reference files together, and every chat inside it starts with that context.</p></div>
        <button className="primary" onClick={() => { const p = newProject(); props.onSave(p); onOpen(p.id); }}>＋ New project</button>
      </div>
      {sorted.length === 0 ? (
        <div className="empty-box"><p>No projects yet. Create one for a course, a codebase, a client or a recurring job, add what the assistant should know, and start chatting.</p></div>
      ) : (
        <div className="grid">
          {sorted.map((p) => {
            const n = convs.filter((c) => c.projectId === p.id && c.turns.length > 0).length;
            return (
              <div key={p.id} className="card clickable" onClick={() => onOpen(p.id)}>
                <div className="card-title">{p.name}</div>
                <div className="muted small clip2">{p.description || p.instructions || "No description"}</div>
                <div className="muted small">{p.files.length} file{p.files.length === 1 ? "" : "s"} · {n} chat{n === 1 ? "" : "s"} · updated {new Date(p.updated).toLocaleDateString()}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
