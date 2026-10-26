import { figureImage, figuresOfText, renderFigures } from "./figureImages";
import { figureKey } from "../core/figures";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import type { AppInfo, CatalogItem } from "../shared/api";
import type { Artifact, HardwareProfile, Meters, Project, ScheduledTask, ServerStatus, Settings, VoiceStatus } from "../shared/types";
import { Chat } from "./Chat";
import { SetupScreen } from "./SetupScreen";
import type { SetupState } from "../core/setup";
import { Models } from "./Models";
import { SettingsView } from "./SettingsView";
import { MetersBar } from "./MetersBar";
import { Projects } from "./Projects";
import { Artifacts } from "./Artifacts";
import { Tasks } from "./Tasks";
import { Search } from "./Search";
import { Customize } from "./Customize";
import { ArtifactIcon, BriefcaseIcon, ChipIcon, ClockIcon, GearIcon, PinIcon, PlusIcon, ProjectIcon, SearchIcon } from "./Icons";
import { ICONS, Icon } from "./Icon";
import { Collapse } from "./Collapse";
import { usePresence, useFocusTrap } from "./usePresence";
import { Conversation, Turn, loadConversations, newConversation, saveConversations } from "./store";

export type Tab = "chat" | "search" | "projects" | "artifacts" | "tasks" | "customize";
type Dialog = "models" | "settings";

const STATE_LABEL: Record<ServerStatus["state"], string> = {
  stopped: "Model idle", starting: "Starting…", ready: "Model ready", restarting: "Restarting…", failed: "Server failed"
};

export function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [hw, setHw] = useState<HardwareProfile | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [voice, setVoice] = useState<VoiceStatus | null>(null);
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [meters, setMeters] = useState<Meters | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [convs, setConvs] = useState<Conversation[]>(() => { const c = loadConversations(); return c.length ? c : [newConversation()]; });
  const [query, setQuery] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(() => convs[0].id);
  const [leaving, setLeaving] = useState<string[]>([]);
  const seen = useRef<Set<string>>(new Set(convs.map((c) => c.id)));
  const modalRef = useRef<HTMLDivElement>(null);
  const dlg = usePresence<Dialog>(dialog);
  const sideMenu = usePresence<true>(menuOpen ? true : null);
  useFocusTrap(modalRef, dlg.value !== null && !dlg.closing, () => setDialog(null));
  useEffect(() => { convs.forEach((c) => seen.current.add(c.id)); }, [convs]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [openArtifact, setOpenArtifact] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => setItems(await api().catalog()), []);
  const refreshHardware = useCallback(async (force = false) => { setHw(await api().hardware(force)); await refreshCatalog(); }, [refreshCatalog]);

  useEffect(() => {
    void (async () => {
      setInfo(await api().appInfo());
      setHw(await api().hardware());
      setSettings(await api().settings());
      setServer(await api().server());
      setVoice(await api().voiceStatus());
      setProjects(await api().projects());
      setArtifacts(await api().artifacts());
      setTasks(await api().tasks());
      setSetup(await api().setupState());
      await refreshCatalog();
    })();
    const offs = [
      api().onServer(setServer), api().onVoiceStatus(setVoice),
      api().onTasks((t) => setTasks((all) => (all.some((x) => x.id === t.id) ? all.map((x) => (x.id === t.id ? t : x)) : [...all, t]))),
      api().onArtifacts(() => { void api().artifacts().then(setArtifacts); }),
      api().onFigureRequest((req) => { void figureImage({ key: figureKey(req.lang, req.raw), lang: req.lang, raw: req.raw }).then((v) => api().figureResult(req.id, v)); }),
      api().onSetup((s) => { setSetup(s); if (!s.active) { void refreshCatalog(); void api().appInfo().then(setInfo); void api().settings().then(setSettings); } })
    ];
    return () => offs.forEach((f) => f());
  }, [refreshCatalog]);

  useEffect(() => {
    let live = true;
    const tick = async () => { try { const m = await api().meters(); if (live) setMeters(m); } catch { /* keep last */ } };
    void tick();
    const t = setInterval(tick, 3000);
    return () => { live = false; clearInterval(t); };
  }, []);

  useEffect(() => { saveConversations(convs); }, [convs]);

  const active = useMemo(() => convs.find((c) => c.id === activeId) ?? convs[0], [convs, activeId]);
  const selected = items.find((i) => i.entry.id === settings?.selectedModelId) ?? null;

  const updateTurns = useCallback((id: string, fn: (t: Turn[]) => Turn[], title?: string, named?: boolean) => {
    setConvs((all) => all.map((c) => (c.id === id ? { ...c, turns: fn(c.turns), updated: named ? c.updated : Date.now(), title: title ?? c.title, named: named ?? c.named } : c)));
  }, []);
  const togglePin = (id: string) => setConvs((all) => all.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  const [fold, setFold] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem("opennpu.fold") ?? "{}"); } catch { return {}; } });
  /** `closedByDefault`: a section nobody opened yet (the archive) starts folded. */
  const toggleFold = (k: string, closedByDefault = false) => setFold((f) => { const n = { ...f, [k]: !(f[k] ?? closedByDefault) }; try { localStorage.setItem("opennpu.fold", JSON.stringify(n)); } catch { /* not saved */ } return n; });
  /** How many rows each sidebar list shows: the rest comes a page at a time, so a year of chats never draws all at once. */
  const [more, setMore] = useState<Record<string, number>>({});
  const [startText, setStartText] = useState<{ id: string; text: string } | null>(null);

  /** A chat in `projectId`, empty or started with `text` (typed on the project page). */
  const newChat = (projectId: string | null = null, text?: string) => {
    const empty = convs.find((c) => c.turns.length === 0 && !c.archived && (c.projectId ?? null) === projectId);
    const c = empty ?? newConversation(projectId);
    if (!empty) setConvs((all) => [c, ...all]);
    if (text?.trim()) setStartText({ id: c.id, text: text.trim() });
    setActiveId(c.id);
    setTab("chat");
  };

  /** Where to go when the open chat leaves the lists: another live chat, else a fresh one. */
  const leave = (id: string, rest: Conversation[]): Conversation[] => {
    const next = rest.find((c) => !c.archived) ?? null;
    if (id !== activeId) return next ? rest : [...rest, newConversation()];
    if (next) { setActiveId(next.id); return rest; }
    const fresh = newConversation();
    setActiveId(fresh.id);
    return [fresh, ...rest];
  };
  const archiveChat = (id: string, on: boolean) => setConvs((all) => leave(on ? id : "", all.map((c) => (c.id === id ? { ...c, archived: on, pinned: on ? false : c.pinned } : c))));

  const deleteChat = (id: string) => {
    setConvs((all) => {
      return leave(id, all.filter((c) => c.id !== id));
    });
  };

  const removeChat = (id: string) => {
    if (leaving.includes(id)) return;
    setLeaving((l) => [...l, id]);
    setTimeout(() => { deleteChat(id); setLeaving((l) => l.filter((x) => x !== id)); }, 220);
  };

  const select = async (id: string) => {
    await api().selectModel(id);
    setSettings(await api().settings());
    setDialog(null);
    setTab("chat");
  };

  const saveProject = (p: Project) => { setProjects((all) => (all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? { ...p, updated: Date.now() } : x)) : [...all, p])); void api().saveProject(p); };
  const deleteProject = async (id: string) => {
    setProjects(await api().deleteProject(id));
    setArtifacts(await api().artifacts());
    setTasks(await api().tasks());
    setConvs((all) => all.map((c) => (c.projectId === id ? { ...c, projectId: null } : c)));
  };
  const pinProject = (p: Project) => saveProject({ ...p, pinned: !p.pinned });
  const archiveProject = (p: Project, on: boolean) => {
    saveProject({ ...p, archived: on, pinned: on ? false : p.pinned });
    if (on && openProject === p.id) setOpenProject(null);
  };
  const saveArtifact = useCallback((a: Artifact) => { void api().saveArtifact(a).then(setArtifacts); }, []);
  const exportArtifact = (id: string) => {
    const a = artifacts.find((x) => x.id === id);
    // a Word or PowerPoint file holds diagrams and charts as pictures, which only this window can draw
    void (async () => {
      const images = a && (a.kind === "docx" || a.kind === "pptx") ? await renderFigures(figuresOfText(a.content, a.kind === "pptx")).catch(() => undefined) : undefined;
      await api().exportArtifact(id, images);
    })();
  };
  const openChat = (id: string) => { setActiveId(id); setTab("chat"); };
  const showArtifact = (id: string) => { setOpenArtifact(id); setTab("artifacts"); };
  const project = projects.find((p) => p.id === active.projectId) ?? null;
  const go = (t: Tab) => { setTab(t); if (t === "projects") setOpenProject(null); };

  const sorted = [...convs].sort((a, b) => b.updated - a.updated);

  if (setup?.active) return <SetupScreen state={setup} />;

  return (
    <div className="app">
      <div className="titlebar"><img className="logo" src="./logo.svg" alt="" /> Open NPU</div>
      <div className="app-body">
      <aside className="sidebar">
        <nav>
          <button className="navbtn" onClick={() => newChat()}><Icon d={ICONS.plus} />New chat</button>
          <button className={`navbtn ${tab === "search" ? "active" : ""}`} onClick={() => go("search")}><SearchIcon /> Search</button>
          <button className={`navbtn ${tab === "projects" ? "active" : ""}`} onClick={() => go("projects")}><ProjectIcon /> Projects <span className="newtag">New</span></button>
          <button className={`navbtn ${tab === "artifacts" ? "active" : ""}`} onClick={() => go("artifacts")}><ArtifactIcon /> Artifacts</button>
          <button className={`navbtn ${tab === "tasks" ? "active" : ""}`} onClick={() => go("tasks")}><ClockIcon /> Scheduled tasks{tasks.some((t) => t.running) && <span className="dot live" />}</button>
          <button className={`navbtn ${tab === "customize" ? "active" : ""}`} onClick={() => go("customize")}><BriefcaseIcon /> Customize</button>
        </nav>
        {convs.filter((c) => c.turns.length > 0).length > 6 && <input className="side-search" placeholder="Filter chats" value={query} onChange={(e) => setQuery(e.target.value)} />}
        <div className="recents">
          {(() => {
            const PAGE = 20;
            const filtering = !!query;
            const matches = (c: Conversation) => c.turns.length > 0 && c.title.toLowerCase().includes(query.toLowerCase());
            const known = (c: Conversation) => !!c.projectId && projects.some((p) => p.id === c.projectId);
            const live = sorted.filter((c) => !c.archived && matches(c));
            const pinned = live.filter((c) => c.pinned);
            const loose = live.filter((c) => !c.pinned && !known(c));
            const gone = sorted.filter((c) => c.archived && matches(c));
            const goneProjects = projects.filter((p) => p.archived && p.name.toLowerCase().includes(query.toLowerCase()));
            /** The first `base` rows of a list, then a button that adds a page; a filter shows every match. */
            const paged = <T,>(key: string, list: T[], base: number, draw: (x: T) => ReactNode, step = PAGE) => {
              const n = filtering ? list.length : more[key] ?? base;
              return (
                <>
                  {list.slice(0, n).map(draw)}
                  {list.length > n && <button className="show-more" onClick={() => setMore((m) => ({ ...m, [key]: n + step }))}>Show more <span className="count">{Math.min(step, list.length - n)}</span></button>}
                </>
              );
            };
            const row = (c: Conversation, nested = false) => (
              <div key={c.id} className={`recent-wrap ${leaving.includes(c.id) ? "leaving" : ""} ${seen.current.has(c.id) ? "" : "fresh"}`}><div className="recent-clip">
                <div className={`recent ${nested ? "nested" : ""} ${c.id === active.id && tab === "chat" ? "active" : ""} ${busyIds.has(c.id) ? "busy" : ""}`} onClick={() => openChat(c.id)}>
                  <span className="recent-title"><span key={c.title} className={c.named ? "reveal" : undefined}>{c.title}</span></span>
                  {c.archived
                    ? <button className="x show" title="Restore chat" aria-label="Restore chat" onClick={(e) => { e.stopPropagation(); archiveChat(c.id, false); }}><Icon d={ICONS.retry} size={14} /></button>
                    : <>
                      <button className={`x pin ${c.pinned ? "on" : ""}`} title={c.pinned ? "Unpin chat" : "Pin chat"} aria-label={c.pinned ? "Unpin chat" : "Pin chat"} onClick={(e) => { e.stopPropagation(); togglePin(c.id); }}><PinIcon /></button>
                      <button className="x" title="Archive chat" aria-label="Archive chat" onClick={(e) => { e.stopPropagation(); archiveChat(c.id, true); }}><Icon d={ICONS.archive} size={14} /></button>
                    </>}
                  <button className="x" title="Delete chat" aria-label="Delete chat" onClick={(e) => { e.stopPropagation(); removeChat(c.id); }}><Icon d={ICONS.trash} size={14} /></button>
                </div>
              </div></div>
            );
            const section = (key: string, label: string, count: number, body: ReactNode, closedByDefault = false) => {
              const closed = fold[key] ?? closedByDefault;
              return (
                <div className="group" key={key}>
                  <div className="group-head">
                    <button className="recents-title" onClick={() => toggleFold(key, closedByDefault)} aria-expanded={!closed}>{label} <span className="count">{count}</span> <span className={`caret ${closed ? "" : "open"}`}>▾</span></button>
                  </div>
                  <div className={`fold ${closed ? "" : "open"}`}><div className="fold-inner">{body}</div></div>
                </div>
              );
            };
            const chatsOf = (p: Project) => live.filter((c) => !c.pinned && c.projectId === p.id);
            const groups = projects
              .filter((p) => !p.archived)
              .map((p) => ({ p, list: chatsOf(p) }))
              .filter((g) => !filtering || g.list.length)
              .sort((x, y) => Number(!!y.p.pinned) - Number(!!x.p.pinned) || (y.list[0]?.updated ?? y.p.updated) - (x.list[0]?.updated ?? x.p.updated));
            return (
              <>
                {pinned.length > 0 && section("pinned", "Pinned", pinned.length, pinned.map((c) => row(c)))}
                {groups.length > 0 && section("projects", "Projects", groups.length, paged("projects", groups, 8, ({ p, list }) => (
                  <div className="proj" key={p.id}>
                    <div className={`proj-head ${tab === "projects" && openProject === p.id ? "active" : ""}`}>
                      <button className="x show caret-btn" title={fold[`p:${p.id}`] ? "Show chats" : "Hide chats"} aria-label={fold[`p:${p.id}`] ? "Show chats" : "Hide chats"} aria-expanded={!fold[`p:${p.id}`]} onClick={() => toggleFold(`p:${p.id}`)}>
                        <span className={`caret ${fold[`p:${p.id}`] ? "" : "open"}`}>▾</span>
                      </button>
                      <button className="proj-name" onClick={() => { setOpenProject(p.id); setTab("projects"); }} title={p.name}>
                        <ProjectIcon /><span className="recent-title">{p.name}</span><span className="count">{list.length}</span>
                      </button>
                      <button className={`x pin ${p.pinned ? "on" : ""}`} title={p.pinned ? "Unpin project" : "Pin project"} aria-label={p.pinned ? "Unpin project" : "Pin project"} onClick={() => pinProject(p)}><PinIcon /></button>
                      <button className="x" title="Archive project" aria-label="Archive project" onClick={() => archiveProject(p, true)}><Icon d={ICONS.archive} size={14} /></button>
                      <button className="x" title="New chat in this project" aria-label="New chat in this project" onClick={() => { newChat(p.id); setFold((f) => ({ ...f, [`p:${p.id}`]: false })); }}><Icon d={ICONS.plus} size={14} /></button>
                    </div>
                    <div className={`fold ${fold[`p:${p.id}`] ? "" : "open"}`}><div className="fold-inner">{list.length ? paged(`p:${p.id}`, list, 5, (c) => row(c, true), 10) : <div className="muted small nested-empty">No chats yet</div>}</div></div>
                  </div>
                )))}
                {section("recents", "Recents", loose.length, loose.length ? paged("recents", loose, PAGE, (c) => row(c)) : <div className="muted small nested-empty">Nothing here yet</div>)}
                {(gone.length > 0 || goneProjects.length > 0) && section("archived", "Archived", gone.length + goneProjects.length, (
                  <>
                    {goneProjects.map((p) => (
                      <div className="proj-head archived" key={p.id}>
                        <button className="proj-name" onClick={() => { setOpenProject(p.id); setTab("projects"); }} title={p.name}><ProjectIcon /><span className="recent-title">{p.name}</span></button>
                        <button className="x show" title="Restore project" aria-label="Restore project" onClick={() => archiveProject(p, false)}><Icon d={ICONS.retry} size={14} /></button>
                      </div>
                    ))}
                    {paged("archived", gone, 10, (c) => row(c))}
                  </>
                ), true)}
              </>
            );
          })()}
        </div>
        <div className="side-foot">
          {sideMenu.value && (
            <>
              <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
              <div className="side-menu" data-state={sideMenu.closing ? "closed" : "open"}>
                {server && (
                  <div className={`server-pill ${server.state}`} title={server.lastError?.title ?? server.endpoint}>
                    <span className="dot" />
                    <span>{STATE_LABEL[server.state]}{server.nctx && server.state === "ready" ? ` · ${Math.round(server.nctx / 1024)}K` : ""}{server.restarts > 0 ? ` · ${server.restarts} restart(s)` : ""}</span>
                  </div>
                )}
                {voice && (voice.stt || voice.tts) && (
                  <div className="muted small voice-pill">
                    {voice.stt && <span>Dictation: {voice.sttProvider?.toUpperCase()}</span>}
                    {voice.stt && voice.tts && " · "}
                    {voice.tts && <span>Voice: {voice.ttsProvider?.toUpperCase()}</span>}
                  </div>
                )}
                <MetersBar meters={meters} estNpuGB={server?.state === "ready" ? selected?.verdict.estNpuGB : undefined} busy={busyIds.size > 0} />
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { setDialog("models"); setMenuOpen(false); }}><Icon d={ICONS.cube} />Models</button>
                <button className="menu-item" onClick={() => { setDialog("settings"); setMenuOpen(false); }}><Icon d={ICONS.gear} />Settings</button>
              </div>
            </>
          )}
          <button className={`profile ${dialog ? "active" : ""}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <span className="avatar">N</span>
            <span className="profile-name">Open NPU <span className="muted">· Local</span></span>
            <span className={`dot ${server?.state === "ready" ? "green" : server?.state === "failed" ? "red" : "amber"}`} />
            {meters?.ramWarning && <span className="warn" title="RAM above 90%">⚠</span>}
          </button>
        </div>
      </aside>
      <main className="main">
        {info && (info.problems.length > 0 || info.geniexVersionWarning) && (
          <div className="banner">
            {info.problems.map((p) => <div key={p}>{p}</div>)}
            {info.geniexVersionWarning && <div>{info.geniexVersionWarning}</div>}
          </div>
        )}
        {voice?.notice && <div className="banner soft">{voice.notice}</div>}
        {settings && convs.filter((c) => c.id === active.id || busyIds.has(c.id)).map((c) => (
          // a conversation that is still answering stays mounted (hidden) so leaving it does not drop the stream
          <div key={c.id} style={{ display: tab === "chat" && c.id === active.id ? "contents" : "none" }}>
          <Chat
            conv={c} selected={selected} server={server} voiceSettings={settings.voice} voiceStatus={voice}
            project={projects.find((x) => x.id === c.projectId) ?? null} customInstructions={settings.customInstructions ?? ""}
            items={items} onCatalogChanged={() => void refreshCatalog()} effort={settings.effort ?? "medium"} subagents={settings.subagents ?? true}
            settings={settings} onSettings={(p) => { void api().saveSettings(p).then(setSettings); }}
            onSelectModel={(id) => { void api().selectModel(id).then(async () => setSettings(await api().settings())); }}
            onEffort={(effort) => { void api().saveSettings({ effort }).then(setSettings); }}
            onSubagents={(on) => { void api().saveSettings({ subagents: on }).then(setSettings); }}
            onPickModel={() => setDialog("models")} onOpenSettings={() => setDialog("settings")} onTurns={updateTurns}
            onBusy={(b) => setBusyIds((prev) => { if (prev.has(c.id) === b) return prev; const n = new Set(prev); if (b) n.add(c.id); else n.delete(c.id); return n; })}
            onOpenProject={(id) => { setOpenProject(id); setTab("projects"); }} onArtifact={saveArtifact} onExportArtifact={exportArtifact}
            startText={startText?.id === c.id ? startText.text : undefined} onStarted={() => setStartText(null)}
          />
          </div>
        ))}
        {tab !== "chat" && <div className="view" key={tab}>
        {tab === "search" && (
          <Search
            convs={convs} projects={projects} artifacts={artifacts} tasks={tasks}
            onChat={openChat} onProject={(id) => { setOpenProject(id); setTab("projects"); }} onArtifact={showArtifact} onTasks={() => setTab("tasks")}
          />
        )}
        {tab === "projects" && (
          <Projects
            projects={projects} convs={convs} tasks={tasks} artifacts={artifacts} contextTokens={selected?.verdict.contextTokens || 8192}
            openId={openProject} onOpen={setOpenProject} onSave={saveProject} onDelete={(id) => void deleteProject(id)}
            onNewChat={(id, text) => newChat(id, text)} onPin={pinProject} onArchive={archiveProject}
            onArchiveChat={archiveChat} onPinChat={togglePin} onOpenChat={openChat} onOpenTasks={() => setTab("tasks")} onOpenArtifact={showArtifact}
          />
        )}
        {tab === "artifacts" && (
          <Artifacts
            artifacts={artifacts} projects={projects} openId={openArtifact} onOpen={setOpenArtifact}
            onDelete={(id) => { void api().deleteArtifact(id).then(setArtifacts); }} onExport={exportArtifact}
          />
        )}
        {tab === "tasks" && (
          <Tasks
            tasks={tasks} projects={projects} artifacts={artifacts} models={items} hasModel={!!selected}
            onSave={async (t) => setTasks(await api().saveTask(t))} onDelete={(id) => { void api().deleteTask(id).then(setTasks); }}
            onRun={(id) => { void api().runTask(id); }} onOpenArtifact={showArtifact}
          />
        )}
        {tab === "customize" && settings && (
          <Customize value={settings.customInstructions ?? ""} onSave={async (v) => setSettings(await api().saveSettings({ customInstructions: v }))} />
        )}
        </div>}
      </main>
      </div>
      {dlg.value && (
        <div className="modal-backdrop" data-state={dlg.closing ? "closed" : "open"} onClick={() => setDialog(null)}>
          <div className="modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={dlg.value === "models" ? "Models" : "Settings"} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-tabs">
                <button className={`navbtn ${dlg.value === "models" ? "active" : ""}`} onClick={() => setDialog("models")}><ChipIcon /> Models</button>
                <button className={`navbtn ${dlg.value === "settings" ? "active" : ""}`} onClick={() => setDialog("settings")}><GearIcon /> Settings</button>
              </div>
              <button className="x" title="Close" onClick={() => setDialog(null)}>×</button>
            </div>
            <div className="modal-body"><div className="view" key={dlg.value}>
        {dlg.value === "models" && <Models items={items} hw={hw} onChanged={refreshCatalog} onUse={select} selectedId={settings?.selectedModelId ?? null} showK={settings?.showKQuants ?? false} />}
        {dlg.value === "settings" && settings && hw && info && (
          <SettingsView
            settings={settings} hw={hw} info={info} server={server} voice={voice}
            onSave={async (p) => { setSettings(await api().saveSettings(p)); await refreshHardware(false); setInfo(await api().appInfo()); }}
            onSaveVoice={async (p) => { setSettings(await api().saveVoice(p)); await refreshCatalog(); }}
            onRedetect={() => refreshHardware(true)}
          />
        )}
            </div></div>
          </div>
        </div>
      )}
    </div>
  );
}
