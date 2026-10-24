import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { CatalogItem } from "../shared/api";
import type { Artifact, ChatEvent, ChatMessage, Project, ServerStatus, VoiceSettings, VoiceStatus } from "../shared/types";
import { Markdown } from "./Markdown";
import { Conversation, Turn, titleFrom } from "./store";
import { ArtifactViewer, kindLabel } from "./ArtifactView";
import { ArtifactIcon } from "./Icons";
import { artifactsIn, parseSegments, stripArtifacts } from "../core/artifacts";
import { buildSystemPrompt, knowledgeBudget } from "../core/projects";
import { VoiceChat, VoiceState, dictateOnce } from "./voiceChat";

const STATE_TEXT: Record<VoiceState, string> = {
  idle: "", listening: "Listening…", hearing: "Listening…", transcribing: "Transcribing…", thinking: "Thinking…", speaking: "Speaking — talk to interrupt"
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Working late?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
const WaveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" /></svg>
);

function Thinking({ text, live }: { text: string; live: boolean }) {
  return (
    <details className="thinking">
      <summary>{live ? "Thinking…" : "Thought process"}</summary>
      <pre>{text}</pre>
    </details>
  );
}

function VoiceOverlay({ state, level, transcript, error, onEnd }: { state: VoiceState; level: number; transcript: string; error: string | null; onEnd: () => void }) {
  return (
    <div className="voice-overlay">
      <div className={`orb ${state}`} style={{ ["--lvl" as any]: String(1 + level * 0.9) }}><div className="orb-core" /></div>
      <div className="voice-state">{STATE_TEXT[state] || "Starting…"}</div>
      {transcript && <div className="voice-transcript">“{transcript}”</div>}
      {error && <div className="error-box">{error}</div>}
      <button className="danger round" onClick={onEnd}>End voice chat</button>
    </div>
  );
}

/** An answer with its artifacts folded into cards that open the side panel. */
function AssistantBody({ text, onOpen, openIndex }: { text: string; onOpen: (index: number) => void; openIndex: number | null }) {
  return (
    <>
      {parseSegments(text).map((s, i) => s.t === "text"
        ? <div key={i} className="assistant"><Markdown text={s.v} /></div>
        : (
          <button key={i} className={`artifact-card ${openIndex === s.index ? "on" : ""}`} onClick={() => onOpen(s.index)}>
            <span className="artifact-card-icon"><ArtifactIcon /></span>
            <span className="artifact-card-text"><strong>{s.title || "Creating…"}</strong><span className="muted small">{s.open ? "Writing…" : kindLabel(s)}</span></span>
            <span className="muted small">{s.open ? "" : "Open"}</span>
          </button>
        ))}
    </>
  );
}

export function Chat(props: {
  conv: Conversation; selected: CatalogItem | null; server: ServerStatus | null;
  voiceSettings: VoiceSettings; voiceStatus: VoiceStatus | null;
  project: Project | null; customInstructions: string;
  onPickModel: () => void; onOpenSettings: () => void; onOpenProject: (id: string) => void;
  onTurns: (id: string, fn: (t: Turn[]) => Turn[], title?: string) => void;
  onArtifact: (a: Artifact) => void;
  onExportArtifact: (id: string) => void;
}) {
  const { conv, selected, server, voiceSettings, project, customInstructions, onPickModel, onOpenSettings, onOpenProject, onTurns, onArtifact, onExportArtifact } = props;
  const [viewing, setViewing] = useState<{ turn: number; index: number } | null>(null);
  const answerBuf = useRef("");
  const openedFor = useRef(new Set<string>());
  const sentTurn = useRef(0);
  const spokenLen = useRef(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [vstate, setVstate] = useState<VoiceState>("idle");
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [system, setSystem] = useState("");
  const chatId = useRef<string | null>(null);
  const speak = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const signal = useRef({ stopped: false });
  const taRef = useRef<HTMLTextAreaElement>(null);
  const convRef = useRef(conv);
  convRef.current = conv;
  const vsRef = useRef(voiceSettings);
  vsRef.current = voiceSettings;

  const voiceReady = !!(voiceSettings.sttModelId && voiceSettings.ttsModelId);
  const sttReady = !!voiceSettings.sttModelId;
  const ttsReady = !!voiceSettings.ttsModelId;

  const vc = useMemo(() => new VoiceChat({
    state: setVstate, level: setLevel,
    utterance: (t) => { setHeard(t); void sendRef.current(t, true); },
    interrupt: () => { if (chatId.current) void api().abortChat(chatId.current); },
    error: (m) => setVoiceErr(m)
  }, () => vsRef.current), []);
  useEffect(() => () => vc.dispose(), [vc]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [conv.turns]);

  useEffect(() => api().onChat((ev: ChatEvent) => {
    if (ev.id !== chatId.current) return;
    const id = convRef.current.id;
    onTurns(id, (prev) => {
      const next = [...prev];
      const last = { ...next[next.length - 1] };
      if (ev.type === "thinking") last.thinking = (last.thinking ?? "") + ev.text;
      else if (ev.type === "answer") { last.content += ev.text; }
      else if (ev.type === "done") { last.stats = ev.stats; last.pending = false; }
      else if (ev.type === "error") { last.error = ev.error; last.pending = false; }
      next[next.length - 1] = last;
      return next;
    });
    if (ev.type === "answer") {
      answerBuf.current += ev.text;
      // open the panel as soon as the first artifact starts being written
      if (!openedFor.current.has(ev.id) && parseSegments(answerBuf.current).some((x) => x.t === "artifact")) {
        openedFor.current.add(ev.id);
        setViewing({ turn: sentTurn.current, index: 0 });
      }
    }
    if (ev.type === "answer" && speak.current) {
      // never read artifact bodies aloud
      const prose = parseSegments(answerBuf.current).map((x) => (x.t === "text" ? x.v : " ")).join("");
      if (prose.length > spokenLen.current) { vc.feed(prose.slice(spokenLen.current)); spokenLen.current = prose.length; }
    }
    if (ev.type === "done") {
      const now = Date.now();
      artifactsIn(answerBuf.current).forEach((a, i) => onArtifact({
        id: `${convRef.current.id}:${sentTurn.current}:${i}`, title: a.title, kind: a.kind, language: a.language, content: a.content,
        projectId: convRef.current.projectId ?? null, source: { type: "chat", conversationId: convRef.current.id }, created: now, updated: now
      })); if (speak.current) vc.endAnswer(); setBusy(false); chatId.current = null; }
    if (ev.type === "error") { vc.cancelSpeech(); setBusy(false); chatId.current = null; }
  }), [onTurns, onArtifact, vc]);

  const send = async (raw: string, fromVoice = false) => {
    const text = raw.trim();
    if (!text || busy || !selected) return;
    const c = convRef.current;
    const sys = buildSystemPrompt({ custom: customInstructions, project, extra: system, knowledgeChars: knowledgeBudget(selected.verdict.contextTokens || 4096) });
    const history: ChatMessage[] = [
      ...(sys ? [{ role: "system" as const, content: sys }] : []),
      ...c.turns.filter((t) => !t.error && t.content).map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: text }
    ];
    const id = crypto.randomUUID();
    chatId.current = id;
    answerBuf.current = "";
    spokenLen.current = 0;
    sentTurn.current = c.turns.length + 1;
    speak.current = fromVoice || vstate !== "idle" || vsRef.current.readAloud;
    if (speak.current && ttsReady) vc.beginAnswer(); else speak.current = false;
    onTurns(c.id, (t) => [...t, { role: "user", content: text }, { role: "assistant", content: "", pending: true, modelName: selected.entry.name }], c.turns.length === 0 ? titleFrom(text) : undefined);
    setInput("");
    setBusy(true);
    await api().chat(id, selected.entry.id, history);
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  const stop = async () => { vc.cancelSpeech(); if (chatId.current) await api().abortChat(chatId.current); };

  const toggleDictation = async () => {
    setNotice(null);
    if (dictating) { signal.current.stopped = true; return; }
    if (!sttReady) { setNotice("Choose a dictation model first."); onOpenSettings(); return; }
    signal.current = { stopped: false };
    setDictating(true);
    try {
      const text = await dictateOnce(setLevel, signal.current);
      if (text) setInput((v) => (v ? v.replace(/\s+$/, "") + " " : "") + text);
      taRef.current?.focus();
    } catch (e) { setNotice((e as Error).message); }
    setDictating(false);
    setLevel(0);
  };

  const startVoice = async () => {
    setVoiceErr(null); setHeard("");
    if (!voiceReady) { setNotice("Voice chat needs a dictation model and a read-aloud model."); onOpenSettings(); return; }
    if (!selected) { onPickModel(); return; }
    try {
      setVoiceOn(true);
      await api().voiceApply();
      await vc.start();
    } catch (e) {
      setVoiceErr((e as Error).message || "Could not open the microphone.");
    }
  };
  const endVoice = () => { vc.stop(); setVoiceOn(false); if (chatId.current) void api().abortChat(chatId.current); };

  if (!selected) {
    return (
      <div className="empty">
        <div className="spark">✺</div>
        <h1 className="serif">Pick a model to start</h1>
        <p className="muted">Open NPU checks that a model fits your NPU before you install it.</p>
        <button className="primary" onClick={onPickModel}>Browse models</button>
      </div>
    );
  }

  const starting = busy && server && server.state !== "ready";
  const empty = conv.turns.length === 0;

  const composer = (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
      <textarea
        ref={taRef} value={input} rows={empty ? 3 : 2} placeholder={dictating ? "Listening… speak, then pause" : empty ? "How can I help you today?" : "Reply…"}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
      />
      <div className="composer-bar">
        <button type="button" className="chip" onClick={onPickModel} title="Change model">
          {selected.entry.name} <span className={`dot ${selected.verdict.level}`} />
        </button>
        <div className="spacer" />
        <button type="button" className={`icon ${dictating ? "rec" : ""}`} onClick={() => void toggleDictation()} title={dictating ? "Stop dictation" : "Dictate"} aria-label="Dictate">
          {dictating ? <span className="level" style={{ transform: `scale(${1 + level * 0.8})` }} /> : <MicIcon />}
        </button>
        <button type="button" className="icon" onClick={() => void startVoice()} title="Voice chat" aria-label="Voice chat"><WaveIcon /></button>
        {busy
          ? <button type="button" className="send stop" onClick={() => void stop()} aria-label="Stop">■</button>
          : <button className="send" disabled={!input.trim()} aria-label="Send">↑</button>}
      </div>
    </form>
  );

  const viewed = viewing ? conv.turns[viewing.turn] : undefined;
  const viewedSeg = viewed ? parseSegments(viewed.content).find((x) => x.t === "artifact" && x.index === viewing!.index) : undefined;
  const panel = viewedSeg && viewedSeg.t === "artifact" ? (
    <ArtifactViewer
      key={`${viewing!.turn}:${viewing!.index}`} artifact={viewedSeg} live={viewedSeg.open}
      onClose={() => setViewing(null)} onExport={() => onExportArtifact(`${conv.id}:${viewing!.turn}:${viewing!.index}`)}
    />
  ) : null;

  return (
    <div className="chat-split">
    <div className="chat">
      {project && (
        <div className="chat-head"><button className="linkbtn" onClick={() => onOpenProject(project.id)}>{project.name}</button><span className="muted small">/ {conv.title}</span></div>
      )}
      {voiceOn && <VoiceOverlay state={vstate} level={level} transcript={heard} error={voiceErr} onEnd={endVoice} />}
      {empty ? (
        <div className="welcome">
          <div className="spark">✺</div>
          <h1 className="serif">{greeting()}</h1>
          {composer}
          {notice && <div className="muted small">{notice}</div>}
          {project && <div className="muted small hint">Project <strong>{project.name}</strong>: its instructions{project.files.length ? ` and ${project.files.length} knowledge file${project.files.length > 1 ? "s" : ""}` : ""} are part of every message.</div>}
          <div className="muted small hint">
            Running <strong>{selected.entry.name}</strong> on your NPU · context {Math.round(selected.verdict.contextTokens / 1024)}K. The first message loads it.
          </div>
          <details className="sysprompt"><summary className="small muted">System prompt</summary>
            <textarea value={system} onChange={(e) => setSystem(e.target.value)} rows={2} placeholder="You are a helpful assistant." />
          </details>
        </div>
      ) : (
        <>
          <div className="messages">
            <div className="column">
              {conv.turns.map((t, i) => (
                <div key={i} className={`msg ${t.role}`}>
                  {t.role === "user" ? <div className="user-bubble">{t.content}</div> : (
                    <>
                      {t.thinking && <Thinking text={t.thinking} live={!!t.pending && !t.content} />}
                      {t.content && <AssistantBody text={t.content} openIndex={viewing?.turn === i ? viewing.index : null} onOpen={(idx) => setViewing({ turn: i, index: idx })} />}
                      {t.pending && !t.content && !t.thinking && <div className="muted">{starting ? "Loading the model onto the NPU…" : "Waiting for the first token…"}</div>}
                      {t.error && (
                        <div className="error-box">
                          <strong>{t.error.title}</strong>
                          <div>{t.error.fix}</div>
                          {t.error.raw && <details><summary className="small">Raw message</summary><pre>{t.error.raw}</pre></details>}
                        </div>
                      )}
                      {!t.pending && t.content && (
                        <div className="actions">
                          <button className="linkbtn" onClick={() => { void navigator.clipboard?.writeText(t.content).catch(() => undefined); }}>Copy</button>
                          {ttsReady && <button className="linkbtn" onClick={() => { void api().voiceApply().then(() => vc.readAloud(stripArtifacts(t.content))); }}>Read aloud</button>}
                          {t.stats && (
                            <span className="stats muted small">
                              {t.stats.tokPerSec !== null && <>{t.stats.tokPerSec} tok/s · </>}
                              {t.stats.ttftSec !== null && <>first token {t.stats.ttftSec}s · </>}
                              {t.stats.tokens} tokens
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </div>
          <div className="composer-wrap">{composer}{notice && <div className="muted small">{notice}</div>}</div>
        </>
      )}
    </div>
    {panel}
    </div>
  );
}
