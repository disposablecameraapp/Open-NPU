import { useEffect, useRef, useState } from "react";
import type { Artifact, Project, ProjectFile, ScheduledTask } from "../shared/types";
import { classifyFile, noPdfText } from "../core/attachments";
import { knowledgeBudget, knowledgeSize } from "../core/projects";
import { describeSchedule } from "../core/schedule";
import type { Conversation } from "./store";
import { api } from "./api";
import { ICONS, Icon } from "./Icon";
import { PinIcon } from "./Icons";

const MAX_FILE = 1_000_000;

export function newProject(): Project {
  const now = Date.now();
  return { id: crypto.randomUUID(), name: "Untitled project", description: "", instructions: "", files: [], created: now, updated: now };
}

const PAGE = 12;

function ProjectEditor({ project, convs, tasks, artifacts, contextTokens, onChange, onBack, onDelete, onPin, onArchive, onNewChat, onOpenChat, onPinChat, onArchiveChat, onOpenTasks, onOpenArtifact }: {
  project: Project; convs: Conversation[]; tasks: ScheduledTask[]; artifacts: Artifact[]; contextTokens: number;
  onChange: (p: Project) => void; onBack: () => void; onDelete: () => void; onPin: () => void; onArchive: () => void;
  onNewChat: (text?: string) => void; onOpenChat: (id: string) => void; onPinChat: (id: string) => void; onArchiveChat: (id: string, on: boolean) => void;
  onOpenTasks: () => void; onOpenArtifact: (id: string) => void;
}) {
  const [draft, setDraft] = useState(project);
  const [noteName, setNoteName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [editInstr, setEditInstr] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const fileRef = useRef<HTMLInputElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => onChange({ ...draft, pinned: project.pinned, archived: project.archived }), 400);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<Project>) => setDraft((d) => ({ ...d, ...p }));
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setErr(null);
    const added: ProjectFile[] = [];
    for (const f of Array.from(list)) {
      if (classifyFile(f.name, f.type) === "pdf") {
        try {
          const text = await (await import("./pdf")).readPdf(f);
          if (!text.trim()) setErr(noPdfText(f.name));
          else added.push({ id: crypto.randomUUID(), name: f.name, content: text });
        } catch { setErr(`${f.name}: could not be read.`); }
        continue;
      }
      if (classifyFile(f.name, f.type) === "document") {
        try { added.push({ id: crypto.randomUUID(), name: f.name, content: await (await import("./docs")).readDocument(f) }); } catch (e) { setErr((e as Error).message); }
        continue;
      }
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

  const pickFolder = async () => {
    const dir = await api().pickFolder();
    if (dir) patch({ folder: dir });
  };
  const start = () => { const t = ask.trim(); onNewChat(t || undefined); setAsk(""); };

  const budget = knowledgeBudget(contextTokens);
  const used = knowledgeSize(draft);
  const pct = Math.min(100, Math.round((used / budget) * 100));
  const mine = convs.filter((c) => c.projectId === project.id && c.turns.length > 0 && !c.archived).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated);
  const myTasks = tasks.filter((t) => t.projectId === project.id);
  const myArts = artifacts.filter((a) => a.projectId === project.id);

  return (
    <div className="page proj-page">
      <div className="proj-crumbs">
        <button className="linkbtn" onClick={onBack}>Projects</button><span className="muted">/</span><span>{draft.name || "Untitled project"}</span>
        <span className="grow" />
        {project.archived && <span className="muted small">Archived</span>}
        <button className={`linkbtn ${project.pinned ? "on" : ""}`} onClick={onPin} disabled={project.archived}>{project.pinned ? "Unpin" : "Pin"}</button>
        <button className="linkbtn" onClick={onArchive}>{project.archived ? "Restore" : "Archive"}</button>
      </div>
      <div className="proj-cols">
        <div className="proj-main">
          <input className="title-input" value={draft.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Project name" />
          <input className="wide" value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="What is this project about? (one line)" />
          <div className="proj-ask">
            <textarea rows={3} value={ask} placeholder={`New chat in ${draft.name || "this project"}`} aria-label="Start a chat in this project"
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); start(); } }} />
            <div className="proj-ask-foot"><span className="muted small">Starts with this project's instructions and files</span><button className="primary" onClick={start}>{ask.trim() ? "Start chat" : "New chat"}</button></div>
          </div>
          <h2 className="proj-sub">Recents</h2>
          <div className="list proj-chats">
            {mine.slice(0, shown).map((c) => (
              <div key={c.id} className="row-item clickable" onClick={() => onOpenChat(c.id)}>
                <span className="grow">{c.title}</span>
                <span className="muted small">{new Date(c.updated).toLocaleDateString()}</span>
                <button className={`linkbtn ${c.pinned ? "on" : ""}`} title={c.pinned ? "Unpin chat" : "Pin chat"} aria-label={c.pinned ? "Unpin chat" : "Pin chat"} onClick={(e) => { e.stopPropagation(); onPinChat(c.id); }}><PinIcon /></button>
                <button className="linkbtn" title="Archive chat" aria-label="Archive chat" onClick={(e) => { e.stopPropagation(); onArchiveChat(c.id, true); }}><Icon d={ICONS.archive} size={14} /></button>
              </div>
            ))}
            {mine.length === 0 && <div className="muted small">No chats yet.</div>}
          </div>
          {mine.length > shown && <button className="show-more wide-more" onClick={() => setShown((n) => n + PAGE)}>Show more <span className="count">{Math.min(PAGE, mine.length - shown)}</span></button>}
        </div>

        <aside className="proj-side">
          <div className="side-card">
            <div className="side-card-head"><h2>Instructions</h2><button className="linkbtn" onClick={() => setEditInstr((v) => !v)}>{editInstr ? "Done" : "Edit"}</button></div>
            {editInstr
              ? <textarea rows={7} autoFocus value={draft.instructions} onChange={(e) => patch({ instructions: e.target.value })} placeholder="e.g. You are my French tutor. Answer in French first, then give the English translation." />
              : <p className="muted small clip3">{draft.instructions.trim() || "Tell the assistant how to work in this project: tone, role, format, rules. It is sent with every message."}</p>}
          </div>

          <div className="side-card">
            <div className="side-card-head"><h2>Files</h2>
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
              <button className="linkbtn" onClick={() => fileRef.current?.click()}>Add</button></div>
            <div className="meter-line">
              <div className="track"><div className={`fill ${pct >= 100 ? "warn" : ""}`} style={{ width: `${pct}%` }} /></div>
              <span className={`small ${used > budget ? "warn" : "muted"}`}>{Math.round(used / 1000)}k / {Math.round(budget / 1000)}k</span>
            </div>
            {used > budget && <p className="warn small">The rest will be cut to fit the model.</p>}
            <div className="side-files">
              {draft.files.map((f) => (
                <div key={f.id} className="side-file"><span className="clip grow" title={f.name}>{f.name}</span><button className="linkbtn" onClick={() => patch({ files: draft.files.filter((x) => x.id !== f.id) })}>Remove</button></div>
              ))}
              {draft.files.length === 0 && <div className="muted small">Text the assistant can draw on in every chat. It stays on this computer.</div>}
            </div>
            {err && <div className="error-box">{err}</div>}
            <details className="sysprompt"><summary className="small muted">Or paste a note</summary>
              <input className="wide" value={noteName} onChange={(e) => setNoteName(e.target.value)} placeholder="Title" style={{ margin: "6px 0" }} />
              <textarea rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Paste text here" />
              <div className="row"><button className="ghost" onClick={addNote} disabled={!noteText.trim()}>Add note</button></div>
            </details>
          </div>

          <div className="side-card">
            <div className="side-card-head"><h2>Folder</h2><button className="linkbtn" onClick={() => void pickFolder()}>{draft.folder ? "Change" : "Choose"}</button></div>
            {draft.folder
              ? <div className="side-file"><span className="clip grow" title={draft.folder}>{draft.folder}</span><button className="linkbtn" onClick={() => patch({ folder: undefined })}>Remove</button></div>
              : <p className="muted small">A folder the assistant can read in every chat of this project. It never changes anything.</p>}
          </div>

          {(myArts.length > 0 || myTasks.length > 0) && (
            <div className="side-card">
              <div className="side-card-head"><h2>Made here</h2></div>
              <div className="side-files">
                {myArts.map((a) => <div key={a.id} className="side-file clickable" onClick={() => onOpenArtifact(a.id)}><span className="clip grow">{a.title}</span><span className="muted small">{a.kind}</span></div>)}
                {myTasks.map((t) => <div key={t.id} className="side-file clickable" onClick={onOpenTasks}><span className="clip grow">{t.name}</span><span className="muted small">{describeSchedule(t.schedule)}</span></div>)}
              </div>
            </div>
          )}

          <button className="danger" onClick={() => { if (confirm(`Delete the project "${draft.name}"? Its chats are kept, without the project's context.`)) onDelete(); }}>Delete project</button>
        </aside>
      </div>
    </div>
  );
}

export function Projects(props: {
  projects: Project[]; convs: Conversation[]; tasks: ScheduledTask[]; artifacts: Artifact[]; contextTokens: number;
  openId: string | null; onOpen: (id: string | null) => void;
  onSave: (p: Project) => void; onDelete: (id: string) => void; onPin: (p: Project) => void; onArchive: (p: Project, on: boolean) => void;
  onNewChat: (projectId: string, text?: string) => void; onOpenChat: (id: string) => void; onPinChat: (id: string) => void; onArchiveChat: (id: string, on: boolean) => void;
  onOpenTasks: () => void; onOpenArtifact: (id: string) => void;
}) {
  const { projects, convs, openId, onOpen } = props;
  const [showArchived, setShowArchived] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const open = projects.find((p) => p.id === openId);
  if (open) {
    return (
      <ProjectEditor
        key={open.id} project={open} convs={convs} tasks={props.tasks} artifacts={props.artifacts} contextTokens={props.contextTokens}
        onChange={props.onSave} onBack={() => onOpen(null)} onDelete={() => { props.onDelete(open.id); onOpen(null); }}
        onPin={() => props.onPin(open)} onArchive={() => { props.onArchive(open, !open.archived); if (!open.archived) onOpen(null); }}
        onNewChat={(text) => props.onNewChat(open.id, text)} onOpenChat={props.onOpenChat} onPinChat={props.onPinChat} onArchiveChat={props.onArchiveChat}
        onOpenTasks={props.onOpenTasks} onOpenArtifact={props.onOpenArtifact}
      />
    );
  }
  const archivedCount = projects.filter((p) => p.archived).length;
  const sorted = projects.filter((p) => !!p.archived === showArchived).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Projects</h1><p className="muted">A project keeps instructions and reference files together, and every chat inside it starts with that context.</p></div>
        <button className="primary" onClick={() => { const p = newProject(); props.onSave(p); onOpen(p.id); }}>＋ New project</button>
      </div>
      {(archivedCount > 0 || showArchived) && (
        <div className="row"><button className="ghost" onClick={() => { setShowArchived((v) => !v); setShown(PAGE); }}>{showArchived ? "Back to projects" : `Archived (${archivedCount})`}</button></div>
      )}
      {sorted.length === 0 ? (
        <div className="empty-box"><p>{showArchived ? "No archived projects." : "No projects yet. Create one for a course, a codebase, a client or a recurring job, add what the assistant should know, and start chatting."}</p></div>
      ) : (
        <>
          <div className="grid">
            {sorted.slice(0, shown).map((p) => {
              const n = convs.filter((c) => c.projectId === p.id && c.turns.length > 0).length;
              return (
                <div key={p.id} className="card clickable" onClick={() => onOpen(p.id)}>
                  <div className="card-top">
                    <div className="card-title">{p.pinned && <span className="pin-mark" title="Pinned"><PinIcon /></span>}{p.name}</div>
                    <div className="card-actions">
                      {!p.archived && <button className={`linkbtn ${p.pinned ? "on" : ""}`} title={p.pinned ? "Unpin project" : "Pin project"} aria-label={p.pinned ? "Unpin project" : "Pin project"} onClick={(e) => { e.stopPropagation(); props.onPin(p); }}><PinIcon /></button>}
                      <button className="linkbtn" title={p.archived ? "Restore project" : "Archive project"} aria-label={p.archived ? "Restore project" : "Archive project"} onClick={(e) => { e.stopPropagation(); props.onArchive(p, !p.archived); }}><Icon d={p.archived ? ICONS.retry : ICONS.archive} size={14} /></button>
                    </div>
                  </div>
                  <div className="muted small clip2">{p.description || p.instructions || "No description"}</div>
                  <div className="muted small">{p.files.length} file{p.files.length === 1 ? "" : "s"}{p.folder ? " + folder" : ""} · {n} chat{n === 1 ? "" : "s"} · updated {new Date(p.updated).toLocaleDateString()}</div>
                </div>
              );
            })}
          </div>
          {sorted.length > shown && <button className="show-more wide-more" onClick={() => setShown((n) => n + PAGE)}>Show more <span className="count">{Math.min(PAGE, sorted.length - shown)}</span></button>}
        </>
      )}
    </div>
  );
}
