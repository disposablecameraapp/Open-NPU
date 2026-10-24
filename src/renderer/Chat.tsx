import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { api } from "./api";
import type { CatalogItem } from "../shared/api";
import type { AgentRun, Artifact, BuildRun, Attachment, ChatEvent, ChatMessage, Effort, LoopRun, Project, ReviewRun, ReviewStep, ServerStatus, Settings, VoiceSettings, VoiceStatus } from "../shared/types";
import { Markdown } from "./Markdown";
import { Conversation, Turn, titleFrom } from "./store";
import { ArtifactViewer, kindLabel } from "./ArtifactView";
import { AgentsIcon, ArtifactIcon, CheckShieldIcon, GlobeIcon, LoopIcon, PlusIcon, SlidersIcon } from "./Icons";
import { ToolsMenu } from "./ToolsMenu";
import { ModelMenu, effortLabel } from "./ModelMenu";
import { stripSubagents } from "../core/agents";
import { classifyFile, refusal, userContent } from "../core/attachments";
import { visionSupport } from "../core/effort";
import { contextUse } from "../core/contextUse";
import { SUBAGENT_INSTRUCTIONS } from "../core/agents";
import { artifactsIn, parseSegments, stripArtifacts } from "../core/artifacts";
import { latestArtifacts } from "../core/review";
import { buildSystemPrompt, knowledgeBudget } from "../core/projects";
import { ICONS, Icon, IconButton } from "./Icon";
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

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <IconButton d={done ? ICONS.check : ICONS.copy} label={done ? "Copied" : "Copy"} onClick={() => {
    void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => undefined);
  }} />;
}

/** The turn is over (finished, stopped or failed): nothing on it may keep spinning. */
function settle(t: Turn) {
  if (t.loop?.status === "running") t.loop = { ...t.loop, status: "done" };
  if (t.build?.status === "running") t.build = { status: "done", steps: t.build.steps.map((s) => (s.status === "running" || s.status === "waiting" ? { ...s, status: "error" as const, note: "Stopped." } : s)) };
  if (t.review?.status === "running") t.review = { ...t.review, status: "done" };
  if (t.agents?.some((a) => a.status === "running")) t.agents = t.agents.map((a) => (a.status === "running" ? { ...a, status: "error" as const, error: "Stopped before it finished." } : a));
}

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

function AttachChips({ items, onRemove }: { items: Attachment[]; onRemove?: (i: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="attach-row">
      {items.map((a, i) => (
        <span key={i} className="attach-chip" title={a.name}>
          {a.dataUrl ? <img src={a.dataUrl} alt="" /> : <span aria-hidden>{a.kind === "image" ? "🖼" : "📄"}</span>}
          <span className="name">{a.name}</span>
          {onRemove && <button type="button" aria-label={`Remove ${a.name}`} onClick={() => onRemove(i)}>×</button>}
        </span>
      ))}
    </div>
  );
}

/** The first sentence of why a search failed, short enough for the pill ("DuckDuckGo: answered 202; …" → the whole story is in the folded part). */
function shortReason(e?: string): string {
  if (!e) return "";
  const m = /\(([^)]*)\)/.exec(e);
  const s = (m ? m[1] : e).replace(/\s+/g, " ");
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

/** A web search: a small animated line while it runs, the queries and sources folded under it. */
function WebSearchCard({ a }: { a: AgentRun }) {
  const query = a.name.replace(/^Web:\s*/, "");
  const running = a.status === "running";
  const failed = a.status === "error";
  const sources = a.output ? a.output.split("\n").filter((l) => /^\[\d+\]/.test(l)).length : 0;
  return (
    <details className={`websearch ${a.status}`}>
      <summary>
        <span className="web-globe" aria-hidden><GlobeIcon /></span>
        <span className="web-text">
          {running ? <>Searching the web<span className="dots" aria-hidden><i>.</i><i>.</i><i>.</i></span></> : failed ? "Couldn't reach the web" : `Searched the web${sources ? ` · ${sources} sources` : ""}`}
        </span>
        <span className="web-query muted small">{failed ? shortReason(a.error) : query}</span>
      </summary>
      <div className="agent-body">
        <div className="agent-task small">“{query}”</div>
        {failed ? <div className="muted small">{a.error || "The search failed."}</div> : a.output ? <pre>{a.output}</pre> : <div className="muted small">Waiting for results…</div>}
      </div>
    </details>
  );
}

function AgentCards({ agents }: { agents: AgentRun[] }) {
  return (
    <div className="agents">
      {agents.map((a) => a.kind === "web" || /^Web: /.test(a.name) ? <WebSearchCard key={a.index} a={a} /> : (
        <details key={a.index} className="agent" open={a.status === "running"}>
          <summary>
            {a.status === "running" ? <span className="spin" /> : <span>{a.status === "error" ? "⚠" : "✓"}</span>}
            <span className="agent-name">{a.name}</span>
            <span className="muted small">{a.status === "running" ? "Working…" : a.status === "error" ? "Failed" : "Done"}</span>
          </summary>
          <div className="agent-body">
            <div className="agent-task small">{a.task}</div>
            {a.error ? <div className="error-box">{a.error}</div> : <pre>{a.output || "…"}</pre>}
          </div>
        </details>
      ))}
    </div>
  );
}

/** What the code check did: files run, errors found, what the reviewer fixed. */
function ReviewCard({ review }: { review: ReviewRun }) {
  const running = review.status === "running";
  const bad = review.steps.some((x) => x.kind === "error");
  return (
    <details className={`agent review ${running || bad ? "" : "passed"}`} open={running || bad}>
      <summary>
        {running ? <span className="spin" /> : <span>{bad ? "⚠" : "✓"}</span>}
        <span className="agent-name">Code check</span>
        <span className="muted small">{running ? "Working…" : bad ? "Problems found" : "Passed"}</span>
      </summary>
      <div className="agent-body">
        {review.steps.map((x, i) => <div key={i} className={`review-step ${x.kind}`}>{x.kind === "error" ? "✕" : x.kind === "ok" ? "✓" : "·"} {x.text}</div>)}
        {review.shots && review.shots.length > 0 && <div className="review-shots">{review.shots.map((u, i) => <img key={i} src={u} alt="Screenshot of the page after the check" />)}</div>}
      </div>
    </details>
  );
}

/** The auto-improve run: round, time budget, what each round changed. */
function LoopCard({ loop }: { loop: LoopRun }) {
  const running = loop.status === "running";
  const until = new Date(loop.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <details className="agent review loop" open={running}>
      <summary>
        {running ? <span className="spin" /> : <span>✓</span>}
        <span className="agent-name">Auto-improve</span>
        <span className="muted small">{running ? `Round ${loop.round} of ${loop.rounds} · until ${until} at the latest · ${loop.accepted} kept` : `${loop.accepted} improvement${loop.accepted === 1 ? "" : "s"} kept`}</span>
      </summary>
      <div className="agent-body">
        {loop.steps.map((x, i) => <StepRow key={i} step={x} />)}
      </div>
    </details>
  );
}

/** Work on files, split into sessions: one line per file, with what each one did and the lines an edit changed. */
function BuildCard({ build }: { build: BuildRun }) {
  const running = build.status === "running";
  const bad = build.steps.some((s) => s.status === "error");
  const done = build.steps.filter((s) => s.status === "done").length;
  return (
    <details className={`agent review build ${running || bad ? "" : "passed"}`} open={running || bad}>
      <summary>
        {running ? <span className="spin" /> : <span>{bad ? "⚠" : "✓"}</span>}
        <span className="agent-name">Files</span>
        <span className="muted small">{running ? `${done} of ${build.steps.length} done` : bad ? "Some files failed" : `${build.steps.length} file${build.steps.length === 1 ? "" : "s"}`}</span>
      </summary>
      <div className="agent-body">
        {build.steps.map((s, i) => (
          <div key={i} className={`review-step ${s.status === "error" ? "error" : s.status === "done" ? "ok" : "info"}`}>
            <span className="step-mark">{s.status === "error" ? "✕" : s.status === "done" ? "✓" : s.status === "running" ? <span className="spin" /> : "·"}</span> <strong>{s.file}</strong> <span className="muted small">{s.action === "edit" ? "change" : "new"} · {s.job}{s.note ? ` · ${s.note}` : ""}</span>
            {s.diff && <details className="step-diff"><summary className="muted small">Show the code</summary><pre className="diff">{s.diff.split("\n").map((l, k) => <div key={k} className={l.startsWith("+ ") ? "add" : l.startsWith("- ") ? "del" : "hunk"}>{l}</div>)}</pre></details>}
          </div>
        ))}
      </div>
    </details>
  );
}

/** One line of a run, with the code it changed folded under it so the written code can always be read. */
function StepRow({ step }: { step: ReviewStep }) {
  return (
    <div className={`review-step ${step.kind}`}>
      <span className="step-mark">{step.kind === "error" ? "✕" : step.kind === "ok" ? "✓" : "·"}</span> {step.text}
      {step.diff && <details className="step-diff"><summary className="muted small">Show the code</summary><pre className="diff">{step.diff.split("\n").map((l, i) => <div key={i} className={l.startsWith("+ ") ? "add" : l.startsWith("- ") ? "del" : "hunk"}>{l}</div>)}</pre></details>}
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
  items: CatalogItem[]; effort: Effort; subagents: boolean; settings: Settings; onSettings: (p: Partial<Settings>) => void;
  onSelectModel: (id: string) => void; onEffort: (e: Effort) => void; onSubagents: (on: boolean) => void;
  onPickModel: () => void; onOpenSettings: () => void; onOpenProject: (id: string) => void;
  onTurns: (id: string, fn: (t: Turn[]) => Turn[], title?: string, named?: boolean) => void;
  onArtifact: (a: Artifact) => void;
  onBusy: (busy: boolean) => void;
  onExportArtifact: (id: string) => void;
}) {
  const { conv, selected, server, voiceSettings, project, customInstructions, items, effort, subagents, settings, onSettings, onSelectModel, onEffort, onSubagents, onPickModel, onOpenSettings, onOpenProject, onTurns, onArtifact, onExportArtifact, onBusy } = props;
  const [viewing, setViewing] = useState<{ turn: number; index: number } | null>(null);
  const answerBuf = useRef("");
  const openedFor = useRef(new Set<string>());
  const sentTurn = useRef(0);
  const spokenLen = useRef(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusy(busy); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dictating, setDictating] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [vstate, setVstate] = useState<VoiceState>("idle");
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [system, setSystem] = useState("");
  const [sysOpen, setSysOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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

  // Follow new output only while the user is at the bottom; scrolling up releases it.
  const stick = useRef(true);
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => { if (stick.current) endRef.current?.scrollIntoView({ block: "end" }); }, [conv.turns]);

  useEffect(() => api().onChat((ev: ChatEvent) => {
    if (ev.id !== chatId.current) return;
    const id = convRef.current.id;
    if (ev.type === "title") { onTurns(id, (t) => t, ev.text, true); return; }
    onTurns(id, (prev) => {
      const next = [...prev];
      const last = { ...next[next.length - 1] };
      if (ev.type === "thinking") last.thinking = (last.thinking ?? "") + ev.text;
      else if (ev.type === "answer") { last.content += ev.text; }
      else if (ev.type === "agent") {
        const list = [...(last.agents ?? [])];
        const at = list.findIndex((a) => a.index === ev.agent.index);
        if (at >= 0) list[at] = ev.agent; else list.push(ev.agent);
        last.agents = list;
      }
      else if (ev.type === "review") last.review = ev.review;
      else if (ev.type === "loop") last.loop = ev.loop;
      else if (ev.type === "build") last.build = ev.build;
      else if (ev.type === "notice") last.notices = [...(last.notices ?? []), ev.text];
      else if (ev.type === "replace") last.content = ev.text;
      else if (ev.type === "done") { last.stats = ev.stats; last.pending = false; settle(last); }
      else if (ev.type === "error") { last.error = ev.error; last.pending = false; settle(last); }
      next[next.length - 1] = last;
      return next;
    });
    if (ev.type === "replace") answerBuf.current = ev.text;
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
      const prose = parseSegments(stripSubagents(answerBuf.current)).map((x) => (x.t === "text" ? x.v : " ")).join("");
      if (prose.length > spokenLen.current) { vc.feed(prose.slice(spokenLen.current)); spokenLen.current = prose.length; }
    }
    const saveArtifacts = () => {
      const now = Date.now();
      artifactsIn(answerBuf.current).forEach((a, i) => onArtifact({
        id: `${convRef.current.id}:${sentTurn.current}:${i}`, title: a.title, kind: a.kind, language: a.language, content: a.content,
        projectId: convRef.current.projectId ?? null, source: { type: "chat", conversationId: convRef.current.id }, created: now, updated: now
      }));
    };
    // every kept improvement is saved as it comes: a long run must not lose its work if the app is closed
    if (ev.type === "replace") saveArtifacts();
    if (ev.type === "done") {
      saveArtifacts(); if (speak.current) vc.endAnswer(); setBusy(false); chatId.current = null; }
    if (ev.type === "error") { vc.cancelSpeech(); setBusy(false); chatId.current = null; }
  }), [onTurns, onArtifact, vc]);

  const send = async (raw: string, fromVoice = false) => {
    stick.current = true;
    const text = raw.trim();
    if ((!text && !files.length) || busy || !selected) return;
    const c = convRef.current;
    const budget = knowledgeBudget(selected.verdict.contextTokens || 4096);
    const sent = files;
    const sys = buildSystemPrompt({ custom: customInstructions, project, extra: system, knowledgeChars: knowledgeBudget(selected.verdict.contextTokens || 4096) });
    // "continue" after an answer cut off inside an artifact: keep writing that artifact instead of starting a new answer
    const prev = c.turns[c.turns.length - 1];
    const resume = !!prev && prev.role === "assistant" && !prev.error && !sent.length
      && /^(please\s+)?(continue|go on|keep going|carry on|finish( it)?)[.!\s]*$/i.test(text)
      && parseSegments(prev.content).some((x) => x.t === "artifact" && x.open);
    const ask = resume
      ? "Your last answer was cut off in the middle of the artifact. Continue it from the exact character where it stopped: no repetition, no explanation, no code fence, no new <artifact> tag. Write only the rest of the file and finish with </artifact>."
      : text;
    const history: ChatMessage[] = [
      ...(sys ? [{ role: "system" as const, content: sys }] : []),
      ...c.turns.filter((t) => !t.error && t.content).map((t) => (t.role === "user"
        ? { role: "user" as const, content: userContent(t.content, t.attachments ?? [], budget) }
        : { role: "assistant" as const, content: stripSubagents(t.content) })),
      { role: "user" as const, content: userContent(ask, sent, budget) }
    ];
    const id = crypto.randomUUID();
    chatId.current = id;
    answerBuf.current = resume ? prev.content : "";
    spokenLen.current = resume ? parseSegments(stripSubagents(prev.content)).map((x) => (x.t === "text" ? x.v : " ")).join("").length : 0;
    sentTurn.current = resume ? c.turns.length - 1 : c.turns.length + 1;
    if (resume) openedFor.current.add(id);
    speak.current = fromVoice || vstate !== "idle" || vsRef.current.readAloud;
    if (speak.current && ttsReady) vc.beginAnswer(); else speak.current = false;
    if (resume) onTurns(c.id, (t) => t.map((x, i) => (i === t.length - 1 ? { ...x, pending: true, stats: undefined, notices: undefined } : x)));
    else onTurns(c.id, (t) => [...t, { role: "user", content: text, attachments: sent.length ? sent : undefined }, { role: "assistant", content: "", pending: true, modelName: selected.entry.name }], c.turns.length === 0 ? titleFrom(text || sent[0]?.name || "") : undefined);
    setInput("");
    setFiles([]);
    setBusy(true);
    await api().chat(id, selected.entry.id, history, { effort: effort, subagents, title: !resume && c.turns.length === 0 });
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  const canSee = !!selected && visionSupport(selected.entry);
  const addFiles = async (list: FileList | File[]) => {
    const added: Attachment[] = [];
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      const why = refusal(f, canSee);
      if (why) { problems.push(why); continue; }
      try {
        if (classifyFile(f.name, f.type) === "image") {
          const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
          added.push({ name: f.name, kind: "image", size: f.size, dataUrl });
        } else added.push({ name: f.name, kind: "text", size: f.size, text: await f.text() });
      } catch { problems.push(`${f.name}: could not be read.`); }
    }
    if (added.length) setFiles((v) => [...v, ...added]);
    setNotice(problems.length ? problems.join(" ") : null);
  };

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
        <h1>Pick a model to start</h1>
        <p className="muted">Open NPU checks that a model fits your NPU before you install it.</p>
        <button className="primary" onClick={onPickModel}>Browse models</button>
      </div>
    );
  }

  const starting = busy && server && server.state !== "ready";
  const empty = conv.turns.length === 0;

  const limit = server?.nctx || selected.verdict.contextTokens || 4096;
  const sysText = buildSystemPrompt({ custom: customInstructions, project, extra: system, knowledgeChars: knowledgeBudget(limit) });
  const use = contextUse({
    systemChars: sysText.length + (subagents ? SUBAGENT_INSTRUCTIONS.length : 0),
    turns: conv.turns.filter((t) => !t.error).map((t) => ({ role: t.role, content: t.role === "assistant" ? stripSubagents(t.content) : t.content, attachments: t.attachments })),
    draftChars: input.length, draftFiles: files, attachmentBudgetChars: knowledgeBudget(limit), limitTokens: limit
  });
  const ring = (
    <div className="menu-anchor">
      <button type="button" className={`ctx ${use.level}`} onClick={() => setCtxOpen((v) => !v)} title="Context window: click for the breakdown" aria-label={`Context ${use.percent}% full, show breakdown`} aria-haspopup="dialog" aria-expanded={ctxOpen}>
        <svg width="18" height="18" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="5" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(use.percent / 100) * 94.25} 94.25`} transform="rotate(-90 18 18)" />
        </svg>
        <span className="small">{use.percent}%</span>
      </button>
      {ctxOpen && (
        <>
          <div className="menu-scrim" onClick={() => setCtxOpen(false)} />
          <div className="menu ctx-pop" style={{ left: "auto", right: 0 }} role="dialog" aria-label="Context breakdown">
            <div className="menu-title">Context window</div>
            <p className="small muted ctx-note">The model can only keep so much text in mind at once. This is how much of that space this chat uses, for {selected.entry.name}.</p>
            <div className="ctx-total"><b>{use.usedTokens.toLocaleString()}</b> of {use.limitTokens.toLocaleString()} tokens <span className={`ctx ${use.level}`}>({use.percent}%)</span></div>
            <div className="ctx-bar">
              {use.parts.map((p) => <span key={p.id} className={`ctx-seg ${p.id}`} style={{ width: `${(p.tokens / use.limitTokens) * 100}%` }} title={p.label} />)}
            </div>
            {use.parts.map((p) => (
              <div className="ctx-line" key={p.id}><span className={`ctx-dot ${p.id}`} /><span className="menu-label">{p.label}</span><span className="muted">{p.tokens.toLocaleString()}</span></div>
            ))}
            <div className="ctx-line"><span className="ctx-dot free" /><span className="menu-label">Free</span><span className="muted">{Math.max(0, use.limitTokens - use.usedTokens).toLocaleString()}</span></div>
            <p className="small muted ctx-note">{use.level === "ok" ? "Estimated from text length." : "Getting full: the oldest messages are left out first. Start a new chat or remove big files to free space."}</p>
          </div>
        </>
      )}
    </div>
  );

  const composer = (
    <div className="composer-stack">
    <form
      className={`composer ${dropping ? "drop" : ""}`} onSubmit={(e) => { e.preventDefault(); void send(input); }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => { setDropping(false); if (e.dataTransfer.files.length) { e.preventDefault(); void addFiles(e.dataTransfer.files); } }}
    >
      <AttachChips items={files} onRemove={(i) => setFiles((v) => v.filter((_, k) => k !== i))} />
      <textarea
        ref={taRef} value={input} rows={empty ? 3 : 2} placeholder={dictating ? "Listening… speak, then pause" : empty ? "How can I help you today?" : "Reply…"}
        onChange={(e) => setInput(e.target.value)}
        onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void addFiles(e.clipboardData.files); } }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
      />
      <div className="composer-bar">
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" className="icon" onClick={() => fileRef.current?.click()} title="Add files or photos" aria-label="Add files or photos"><PlusIcon /></button>
        <div className="spacer" />
        <button type="button" className={`icon ${dictating ? "rec" : ""}`} onClick={() => void toggleDictation()} title={dictating ? "Stop dictation" : "Dictate"} aria-label="Dictate">
          {dictating ? <span className="level" style={{ transform: `scale(${1 + level * 0.8})` }} /> : <MicIcon />}
        </button>
        <button type="button" className="icon" onClick={() => void startVoice()} title="Voice chat" aria-label="Voice chat"><WaveIcon /></button>
        {busy
          ? <button type="button" className="send stop" onClick={() => void stop()} aria-label="Stop"><Icon d={ICONS.stop} size={14} fill /></button>
          : <button className="send" disabled={!input.trim() && !files.length} aria-label="Send"><Icon d={ICONS.up} size={18} /></button>}
      </div>
    </form>
      <div className="composer-meta">
        <div className="menu-anchor">
          <button type="button" className="chip" onClick={() => setMenuOpen((v) => !v)} title="Model, thinking and sub-agents" aria-haspopup="menu" aria-expanded={menuOpen}>
            {selected.entry.name} <span className={`dot ${selected.verdict.level}`} />
            {effortLabel(selected, effort) && <span className="effort">{effortLabel(selected, effort)}</span>}
          </button>
          {menuOpen && (
            <ModelMenu
              items={items} selected={selected} effort={effort} subagents={subagents}
              onSelect={onSelectModel} onEffort={onEffort} onSubagents={onSubagents} onMore={onPickModel} onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
        <div className="menu-anchor">
          <button type="button" className="chip tools-chip" onClick={() => setToolsOpen((v) => !v)} title="Smart functions: thinking, sub-agents, code check, web search, auto-improve" aria-haspopup="menu" aria-expanded={toolsOpen}>
            <SlidersIcon />
            {settings.subagents && <span className="on-icon" title="Sub-agents on"><AgentsIcon /></span>}
            {settings.autoCheck && <span className="on-icon" title="Code check on"><CheckShieldIcon /></span>}
            {settings.webSearch && <span className="on-icon" title="Web search on"><GlobeIcon /></span>}
            {settings.agentLoop && <span className="on-icon" title="Auto-improve on"><LoopIcon /></span>}
          </button>
          {toolsOpen && <ToolsMenu settings={settings} selected={selected} onSave={onSettings} onClose={() => setToolsOpen(false)} />}
        </div>
        {empty && <button type="button" className={`chip ${system.trim() ? "" : "quiet"}`} onClick={() => setSysOpen((v) => !v)} aria-expanded={sysOpen} title="Instructions for this chat only">System prompt</button>}
        <div className="spacer" />
        {ring}
      </div>
    </div>
  );

  const viewed = viewing ? conv.turns[viewing.turn] : undefined;
  const viewedSeg = viewed ? parseSegments(stripSubagents(viewed.content)).find((x) => x.t === "artifact" && x.index === viewing!.index) : undefined;
  // the newest version of every file written in this chat: what a page needs to show itself
  const projectFiles = useMemo(() => latestArtifacts(conv.turns.filter((t) => t.role === "assistant" && t.content && !t.pending).map((t) => ({ role: "assistant" as const, content: t.content }))), [conv.turns]);
  const panel = viewedSeg && viewedSeg.t === "artifact" ? (
    <ArtifactViewer
      key={`${viewing!.turn}:${viewing!.index}`} artifact={viewedSeg} live={viewedSeg.open} files={projectFiles}
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
          <div className="greet"><span className="spark">✺</span><h1>{greeting()}</h1></div>
          {composer}
          {notice && <div className="composer-notice">{notice}</div>}
          {sysOpen && <textarea className="sysprompt" value={system} onChange={(e) => setSystem(e.target.value)} rows={2} placeholder="You are a helpful assistant." />}
        </div>
      ) : (
        <>
          <div className="messages" onScroll={onScroll}>
            <div className="column">
              {conv.turns.map((t, i) => (
                <div key={i} className={`msg ${t.role}`}>
                  {t.role === "user" ? <div className="user-bubble"><AttachChips items={t.attachments ?? []} />{t.content}</div> : (
                    <>
                      {t.thinking && <Thinking text={t.thinking} live={!!t.pending && !stripSubagents(t.content)} />}
                      {t.agents && t.agents.length > 0 && <AgentCards agents={t.agents} />}
                      {t.build && <BuildCard build={t.build} />}
                      {t.loop && <LoopCard loop={t.loop} />}
                      {t.review && <ReviewCard review={t.review} />}
                      {t.notices?.map((n, k) => <div key={k} className="muted small notice">{n}</div>)}
                      {stripSubagents(t.content) && <AssistantBody text={stripSubagents(t.content)} openIndex={viewing?.turn === i ? viewing.index : null} onOpen={(idx) => setViewing({ turn: i, index: idx })} />}
                      {t.pending && !stripSubagents(t.content) && !t.thinking && !t.agents?.length && !t.review && !t.loop && !t.build && <div className="muted">{starting ? "Loading the model onto the NPU…" : "Waiting for the first token…"}</div>}
                      {t.error && (
                        <div className="error-box">
                          <strong>{t.error.title}</strong>
                          <div>{t.error.fix}</div>
                          {t.error.raw && <details><summary className="small">Raw message</summary><pre>{t.error.raw}</pre></details>}
                        </div>
                      )}
                      {!t.pending && stripSubagents(t.content) && (
                        <div className="actions">
                          <CopyButton text={stripSubagents(t.content)} />
                          {ttsReady && <IconButton d={ICONS.speaker} label="Read aloud" onClick={() => { void api().voiceApply().then(() => vc.readAloud(stripArtifacts(stripSubagents(t.content)))); }} />}
                          {t.stats?.finish === "length" && <span className="warn small">Cut off: the context or the answer limit was reached. Say “continue”, or start a new chat.</span>}
                          {t.stats && t.stats.tokens > 0 && (
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
          <div className="composer-wrap">{composer}{notice && <div className="composer-notice">{notice}</div>}</div>
        </>
      )}
    </div>
    {panel}
    </div>
  );
}
