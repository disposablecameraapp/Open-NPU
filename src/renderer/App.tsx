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
  const toggleFold = (k: string) => setFold((f) => { const n = { ...f, [k]: !f[k] }; try { localStorage.setItem("opennpu.fold", JSON.stringify(n)); } catch { /* not saved */ } return n; });

  const newChat = (projectId: string | null = null) => {
    const empty = convs.find((c) => c.turns.length === 0 && (c.projectId ?? null) === projectId);
    if (empty) { setActiveId(empty.id); setTab("chat"); return; }
    const c = newConversation(projectId);
    setConvs((all) => [c, ...all]);
    setActiveId(c.id);
    setTab("chat");
  };

  const deleteChat = (id: string) => {
    setConvs((all) => {
      const rest = all.filter((c) => c.id !== id);
      const next = rest.length ? rest : [newConversation()];
      if (id === activeId) setActiveId(next[0].id);
      return next;
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
  const saveArtifact = useCallback((a: Artifact) => { void api().saveArtifact(a).then(setArtifacts); }, []);
  const exportArtifact = (id: string) => { void api().exportArtifact(id); };
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
            const shown = sorted.filter((c) => c.turns.length > 0 && c.title.toLowerCase().includes(query.toLowerCase()));
            const known = (c: Conversation) => !!c.projectId && projects.some((p) => p.id === c.projectId);
            const pinned = shown.filter((c) => c.pinned);
            const loose = shown.filter((c) => !c.pinned && !known(c));
            const row = (c: Conversation, nested = false) => (
              <div key={c.id} className={`recent-wrap ${leaving.includes(c.id) ? "leaving" : ""} ${seen.current.has(c.id) ? "" : "fresh"}`}><div className="recent-clip">
                <div className={`recent ${nested ? "nested" : ""} ${c.id === active.id && tab === "chat" ? "active" : ""} ${busyIds.has(c.id) ? "busy" : ""}`} onClick={() => openChat(c.id)}>
                  <span className="recent-title"><span key={c.title} className={c.named ? "reveal" : undefined}>{c.title}</span></span>
                  <button className={`x pin ${c.pinned ? "on" : ""}`} title={c.pinned ? "Unpin chat" : "Pin chat"} aria-label={c.pinned ? "Unpin chat" : "Pin chat"} onClick={(e) => { e.stopPropagation(); togglePin(c.id); }}><PinIcon /></button>
                  <button className="x" title="Delete chat" aria-label="Delete chat" onClick={(e) => { e.stopPropagation(); removeChat(c.id); }}><Icon d={ICONS.trash} size={14} /></button>
                </div>
              </div></div>
            );
            const section = (key: string, label: string, count: number, body: ReactNode, extra?: ReactNode) => (
              <div className="group" key={key}>
                <div className="group-head">
                  <button className="recents-title" onClick={() => toggleFold(key)} aria-expanded={!fold[key]}>{label} <span className="count">{count}</span> <span className={`caret ${fold[key] ? "" : "open"}`}>▾</span></button>
                  {extra}
                </div>
                <div className={`fold ${fold[key] ? "" : "open"}`}><div className="fold-inner">{body}</div></div>
              </div>
            );
            const groups = projects
              .map((p) => ({ p, list: shown.filter((c) => !c.pinned && c.projectId === p.id) }))
              .filter((g) => !query || g.list.length)
              .sort((x, y) => (y.list[0]?.updated ?? y.p.updated) - (x.list[0]?.updated ?? x.p.updated));
            return (
              <>
                {pinned.length > 0 && section("pinned", "Pinned", pinned.length, pinned.map((c) => row(c)))}
                {groups.length > 0 && section("projects", "Projects", groups.length, groups.map(({ p, list }) => (
                  <div className="proj" key={p.id}>
                    <div className="proj-head">
                      <button className="proj-name" onClick={() => toggleFold(`p:${p.id}`)} aria-expanded={!fold[`p:${p.id}`]} title={p.name}>
                        <span className={`caret ${fold[`p:${p.id}`] ? "" : "open"}`}>▾</span><ProjectIcon /><span className="recent-title">{p.name}</span><span className="count">{list.length}</span>
                      </button>
                      <button className="x show" title="New chat in this project" aria-label="New chat in this project" onClick={() => { newChat(p.id); setFold((f) => ({ ...f, [`p:${p.id}`]: false })); }}><Icon d={ICONS.plus} size={14} /></button>
                      <button className="x show" title="Open project" aria-label="Open project" onClick={() => { setOpenProject(p.id); setTab("projects"); }}>⋯</button>
                    </div>
                    <div className={`fold ${fold[`p:${p.id}`] ? "" : "open"}`}><div className="fold-inner">{list.length ? list.map((c) => row(c, true)) : <div className="muted small nested-empty">No chats yet</div>}</div></div>
                  </div>
                )))}
                {section("recents", "Recents", loose.length, loose.length ? loose.map((c) => row(c)) : <div className="muted small nested-empty">Nothing here yet</div>)}
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
            onNewChat={(id) => newChat(id)} onOpenChat={openChat} onOpenTasks={() => setTab("tasks")} onOpenArtifact={showArtifact}
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
