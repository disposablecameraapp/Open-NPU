import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { AppInfo, CatalogItem } from "../shared/api";
import type { HardwareProfile, Meters, ServerStatus, Settings, VoiceStatus } from "../shared/types";
import { Chat } from "./Chat";
import { SetupScreen } from "./SetupScreen";
import type { SetupState } from "../core/setup";
import { Models } from "./Models";
import { SettingsView } from "./SettingsView";
import { MetersBar } from "./MetersBar";
import { ICONS, Icon } from "./Icon";
import { Conversation, Turn, loadConversations, newConversation, saveConversations } from "./store";

export type Tab = "chat" | "models" | "settings";

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
  const [meters, setMeters] = useState<Meters | null>(null);
  const [convs, setConvs] = useState<Conversation[]>(() => { const c = loadConversations(); return c.length ? c : [newConversation()]; });
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(() => convs[0].id);

  const refreshCatalog = useCallback(async () => setItems(await api().catalog()), []);
  const refreshHardware = useCallback(async (force = false) => { setHw(await api().hardware(force)); await refreshCatalog(); }, [refreshCatalog]);

  useEffect(() => {
    void (async () => {
      setInfo(await api().appInfo());
      setHw(await api().hardware());
      setSettings(await api().settings());
      setServer(await api().server());
      setVoice(await api().voiceStatus());
      setSetup(await api().setupState());
      await refreshCatalog();
    })();
    const offs = [api().onServer(setServer), api().onVoiceStatus(setVoice), api().onSetup((s) => { setSetup(s); if (!s.active) { void refreshCatalog(); void api().appInfo().then(setInfo); void api().settings().then(setSettings); } })];
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

  const updateTurns = useCallback((id: string, fn: (t: Turn[]) => Turn[], title?: string) => {
    setConvs((all) => all.map((c) => (c.id === id ? { ...c, turns: fn(c.turns), updated: Date.now(), title: title ?? c.title } : c)));
  }, []);

  const newChat = () => {
    const empty = convs.find((c) => c.turns.length === 0);
    if (empty) { setActiveId(empty.id); setTab("chat"); return; }
    const c = newConversation();
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

  const select = async (id: string) => {
    await api().selectModel(id);
    setSettings(await api().settings());
    setTab("chat");
  };

  const sorted = [...convs].sort((a, b) => b.updated - a.updated);

  if (setup?.active) return <SetupScreen state={setup} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="logo">✺</span> Open NPU</div>
        <nav>
          <button className="navbtn" onClick={newChat}><Icon d={ICONS.plus} />New chat</button>
          <button className={`navbtn ${searching ? "active" : ""}`} onClick={() => { setSearching((v) => !v); setQuery(""); }}><Icon d={ICONS.search} />Search</button>
          {searching && <input className="side-search" autoFocus placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />}
          <button className={`navbtn ${tab === "chat" ? "active" : ""}`} onClick={() => setTab("chat")}><Icon d={ICONS.chat} />Chats</button>
          <button className={`navbtn ${tab === "models" ? "active" : ""}`} onClick={() => setTab("models")}><Icon d={ICONS.cube} />Models</button>
        </nav>
        <button className="recents-title" onClick={() => setRecentsOpen((v) => !v)}>Recents <span className={`caret ${recentsOpen ? "open" : ""}`}>▾</span></button>
        <div className="recents">
          {recentsOpen && sorted.filter((c) => c.turns.length > 0 && c.title.toLowerCase().includes(query.toLowerCase())).map((c) => (
            <div key={c.id} className={`recent ${c.id === active.id && tab === "chat" ? "active" : ""}`} onClick={() => { setActiveId(c.id); setTab("chat"); }}>
              <span className="recent-title">{c.title}</span>
              <button className="x" title="Delete chat" aria-label="Delete chat" onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }}><Icon d={ICONS.trash} size={14} /></button>
            </div>
          ))}
        </div>
        <div className="side-foot">
          {menuOpen && (
            <>
              <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
              <div className="side-menu">
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
                <MetersBar meters={meters} />
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { setTab("settings"); setMenuOpen(false); }}><Icon d={ICONS.gear} />Settings</button>
              </div>
            </>
          )}
          <button className={`profile ${tab === "settings" ? "active" : ""}`} onClick={() => setMenuOpen((v) => !v)}>
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
        {tab === "chat" && settings && (
          <Chat
            key={active.id} conv={active} selected={selected} server={server} voiceSettings={settings.voice} voiceStatus={voice}
            onPickModel={() => setTab("models")} onOpenSettings={() => setTab("settings")} onTurns={updateTurns}
          />
        )}
        {tab === "models" && <Models items={items} hw={hw} onChanged={refreshCatalog} onUse={select} selectedId={settings?.selectedModelId ?? null} showK={settings?.showKQuants ?? false} />}
        {tab === "settings" && settings && hw && info && (
          <SettingsView
            settings={settings} hw={hw} info={info} server={server} voice={voice}
            onSave={async (p) => { setSettings(await api().saveSettings(p)); await refreshHardware(false); setInfo(await api().appInfo()); }}
            onSaveVoice={async (p) => { setSettings(await api().saveVoice(p)); await refreshCatalog(); }}
            onRedetect={() => refreshHardware(true)}
          />
        )}
      </main>
    </div>
  );
}
