import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Artifact, Project, ScheduledTask } from "../shared/types";
import type { Conversation } from "./store";
import { ArtifactIcon, ClockIcon, ProjectIcon, SearchIcon } from "./Icons";
import { useExit, useFocusTrap } from "./usePresence";

type Kind = "chat" | "project" | "artifact" | "task";
type Filter = "all" | Kind;
type Hit = { key: string; kind: Kind; title: string; sub: string; tag: string; at: number; pick: () => void };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" }, { id: "chat", label: "Chats" }, { id: "project", label: "Projects" },
  { id: "artifact", label: "Artifacts" }, { id: "task", label: "Scheduled tasks" }
];
const KIND_LABEL: Record<Kind, string> = { chat: "Chats", project: "Projects", artifact: "Artifacts", task: "Scheduled tasks" };

function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text.slice(0, 120).replace(/\s+/g, " ");
  const from = Math.max(0, i - 40);
  return (from > 0 ? "…" : "") + text.slice(from, i + q.length + 80).replace(/\s+/g, " ");
}

const ChatIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5V16.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" /></svg>;
const ICON: Record<Kind, () => ReactNode> = { chat: ChatIcon, project: ProjectIcon, artifact: ArtifactIcon, task: ClockIcon };

/** The search window: floats above whatever is open, filters by kind (and by project), and is driven from the keyboard. */
export function Search({ convs, projects, artifacts, tasks, onChat, onProject, onArtifact, onTasks, onClose }: {
  convs: Conversation[]; projects: Project[]; artifacts: Artifact[]; tasks: ScheduledTask[];
  onChat: (id: string) => void; onProject: (id: string) => void; onArtifact: (id: string) => void; onTasks: () => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [inProject, setInProject] = useState("");
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { leaving, close } = useExit(onClose);
  useFocusTrap(boxRef, !leaving, close);
  const q = query.trim().toLowerCase();

  const hits = useMemo<Hit[]>(() => {
    const name = (id?: string | null) => projects.find((p) => p.id === id)?.name ?? "";
    const scoped = (id?: string | null) => !inProject || id === inProject;
    const go = (f: () => void) => () => { f(); };
    const out: Hit[] = [];
    if (filter === "all" || filter === "chat") {
      for (const c of convs) {
        if (!c.turns.length || !scoped(c.projectId)) continue;
        let text: string | undefined;
        if (q) text = c.title.toLowerCase().includes(q) ? c.title : c.turns.find((t) => t.content.toLowerCase().includes(q))?.content;
        if (q && !text) continue;
        out.push({ key: `c:${c.id}`, kind: "chat", title: c.title, sub: q && text ? snippet(text, q) : "", tag: name(c.projectId), at: c.updated, pick: go(() => onChat(c.id)) });
      }
    }
    if ((filter === "all" || filter === "project") && !inProject) {
      for (const p of projects) {
        if (q && !(p.name + p.description + p.instructions + p.files.map((f) => f.name + f.content).join()).toLowerCase().includes(q)) continue;
        out.push({ key: `p:${p.id}`, kind: "project", title: p.name, sub: p.description, tag: "", at: p.updated, pick: go(() => onProject(p.id)) });
      }
    }
    if (filter === "all" || filter === "artifact") {
      for (const a of artifacts) {
        if (!scoped(a.projectId)) continue;
        if (q && !(a.title + a.content).toLowerCase().includes(q)) continue;
        out.push({ key: `a:${a.id}`, kind: "artifact", title: a.title, sub: q && !a.title.toLowerCase().includes(q) ? snippet(a.content, q) : a.kind, tag: name(a.projectId), at: a.updated, pick: go(() => onArtifact(a.id)) });
      }
    }
    if ((filter === "all" || filter === "task") && !inProject) {
      for (const t of tasks) {
        if (q && !(t.name + t.prompt).toLowerCase().includes(q)) continue;
        out.push({ key: `t:${t.id}`, kind: "task", title: t.name, sub: t.prompt.replace(/\s+/g, " ").slice(0, 120), tag: "", at: 0, pick: onTasks });
      }
    }
    // newest first inside each kind; a single filter shows many, "All" a few of each
    const cap = filter === "all" ? (q ? 6 : 4) : 40;
    const count: Record<string, number> = {};
    return out.sort((a, b) => b.at - a.at).filter((h) => (count[h.kind] = (count[h.kind] ?? 0) + 1) <= cap)
      .sort((a, b) => Object.keys(KIND_LABEL).indexOf(a.kind) - Object.keys(KIND_LABEL).indexOf(b.kind));
  }, [q, filter, inProject, convs, projects, artifacts, tasks, onChat, onProject, onArtifact, onTasks]);

  useEffect(() => { setCursor(0); }, [q, filter, inProject]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); }, [cursor]);

  const choose = (h: Hit | undefined) => { if (!h) return; h.pick(); close(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(hits.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(hits[cursor]); }
    else if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      const i = FILTERS.findIndex((f) => f.id === filter);
      setFilter(FILTERS[(i + (e.key === "ArrowRight" ? 1 : FILTERS.length - 1)) % FILTERS.length].id);
    }
  };

  const projectsWithStuff = projects.filter((p) => !p.archived || convs.some((c) => c.projectId === p.id));
  let lastKind: Kind | null = null;
  return (
    <div className="modal-backdrop search-backdrop" data-state={leaving ? "closed" : "open"} onClick={close}>
      <div className="search-box" ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Search" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="search-top">
          <SearchIcon />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats, projects, artifacts and tasks" aria-label="Search" />
          <button className="x" title="Close" aria-label="Close" onClick={close}>×</button>
        </div>
        <div className="search-filters" role="tablist">
          {FILTERS.map((f) => <button key={f.id} role="tab" aria-selected={filter === f.id} className={`search-tab ${filter === f.id ? "on" : ""}`} onClick={() => setFilter(f.id)}>{f.label}</button>)}
          {projectsWithStuff.length > 0 && (filter === "all" || filter === "chat" || filter === "artifact") && (
            <select className="search-project" value={inProject} onChange={(e) => setInProject(e.target.value)} aria-label="Only in project">
              <option value="">Any project</option>
              {projectsWithStuff.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div className="search-list" ref={listRef}>
          {hits.length === 0 && <p className="muted search-empty">{q ? `Nothing found for “${query.trim()}”.` : "Nothing here yet."}</p>}
          {hits.map((h, i) => {
            const head = h.kind !== lastKind ? (filter === "all" ? KIND_LABEL[h.kind] : null) : null;
            lastKind = h.kind;
            const Ic = ICON[h.kind];
            return (
              <div key={h.key}>
                {head && <div className="search-group">{!q && h.kind === "chat" ? "Recent chats" : head}</div>}
                <div data-i={i} className={`search-row ${i === cursor ? "on" : ""}`} onMouseMove={() => setCursor(i)} onClick={() => choose(h)}>
                  <span className="search-ic"><Ic /></span>
                  <span className="search-main"><span className="search-title">{h.title}</span>{h.sub && <span className="search-sub">{h.sub}</span>}</span>
                  {h.tag && <span className="search-tag">{h.tag}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="search-foot muted small">
          <span><kbd>Esc</kbd> Close</span><span><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>Enter</kbd> Open</span><span><kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd> Type</span>
        </div>
      </div>
    </div>
  );
}
