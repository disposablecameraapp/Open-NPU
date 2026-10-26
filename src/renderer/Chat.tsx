import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";
import { ResetNpuButton } from "./ResetNpuButton";
import { api } from "./api";
import type { CatalogItem } from "../shared/api";
import type { AgentRun, Artifact, Attachment, BuildRun, BuildStage, ChatEvent, ChatMessage, Effort, LoopRun, Project, ReviewRun, ReviewStep, ServerStatus, Settings, VoiceSettings, VoiceStatus } from "../shared/types";
import { Markdown } from "./Markdown";
import { Conversation, Turn, titleFrom } from "./store";
import { ArtifactViewer, kindLabel } from "./ArtifactView";
import { AgentsIcon, ArtifactIcon, CheckShieldIcon, GlobeIcon, LoopIcon, PlusIcon, SlidersIcon } from "./Icons";
import { ToolsMenu } from "./ToolsMenu";
import { ModelMenu, effortLabel } from "./ModelMenu";
import { stripSubagents } from "../core/agents";
import { classifyFile, noPdfText, refusal, userContent } from "../core/attachments";
import { visionSupport } from "../core/effort";
import { requestUse, tokensOf } from "../core/context";
import { contextUse } from "../core/contextUse";
import { SUBAGENT_INSTRUCTIONS } from "../core/agents";
import { artifactsIn, parseSegments, stripArtifacts } from "../core/artifacts";
import { hideEdits } from "../core/review";
import { latestArtifacts } from "../core/review";
import { needsTools, stubHistory } from "../core/build";
import { buildSystemPrompt, knowledgeBudget } from "../core/projects";
import { ICONS, Icon, IconButton } from "./Icon";
import { VoiceChat, VoiceState, dictateOnce } from "./voiceChat";
import { Chevron, Presence, StatusMark, ThinkingBlock, Unfold, WritingGlyph, useElapsed } from "./Activity";
import { BuildCard } from "./BuildProgress";
import { useSmoothText } from "./useSmoothText";
import { EditBox, JumpToLatest, StarterChips, loadDraft, saveDraft } from "./ComposerParts";
import { growTo, lastUserIndex, turnsBefore } from "../core/composer";

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
  if (t.build?.status === "running") {
    const stop = (xs?: BuildStage[]) => xs?.map((g) => (g.status === "running" ? { ...g, status: "error" as const, note: "Stopped." } : g));
    t.build = { ...t.build, status: "done", phase: undefined, start: stop(t.build.start), verify: stop(t.build.verify), steps: t.build.steps.map((s) => (s.status === "done" || s.status === "error" ? s : { ...s, status: "error" as const, note: "Stopped.", stages: stop(s.stages) })) };
  }
  if (t.review?.status === "running") t.review = { ...t.review, status: "done" };
  if (t.agents?.some((a) => a.status === "running")) t.agents = t.agents.map((a) => (a.status === "running" ? { ...a, status: "error" as const, error: "Stopped before it finished." } : a));
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

/** A step of work as a card: a mark, a name, a short state, and the detail folded under it (open while it runs, unless the reader chose). */
function RunCard({ cls = "", mark, name, note, running, defaultOpen, children }: { cls?: string; mark: ReactNode; name: string; note: string; running?: boolean; defaultOpen: boolean; children: ReactNode }) {
  const [pref, setPref] = useState<boolean | null>(null);
  const open = pref ?? defaultOpen;
  return (
    <div className={`runcard ${cls} ${running ? "running" : ""}`}>
      <button type="button" className="rc-head" aria-expanded={open} onClick={() => setPref(!open)}>
        {mark}<span className="agent-name">{name}</span><span className="muted small rc-note">{note}</span><Chevron />
      </button>
      <Unfold open={open}><div className="agent-body">{children}</div></Unfold>
    </div>
  );
}

/** Output that is still being written: follows its end unless the reader scrolled up. */
function FollowPre({ text }: { text: string }) {
  const r = useRef<HTMLPreElement>(null);
  useEffect(() => { const el = r.current; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) el.scrollTop = el.scrollHeight; }, [text]);
  return <pre ref={r}>{text}</pre>;
}

/** The first sentence of why a search failed, short enough for the pill ("DuckDuckGo: answered 202; …" → the whole story is in the folded part). */
function shortReason(e?: string): string {
  if (!e) return "";
  const m = /\(([^)]*)\)/.exec(e);
  const s = (m ? m[1] : e).replace(/\s+/g, " ");
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

/** "[1] Title — https://host/path" lines of a search card. */
function sourcesOf(out: string): { n: number; title: string; host: string }[] {
  const list: { n: number; title: string; host: string }[] = [];
  for (const l of out.split("\n")) {
    const m = /^\[(\d+)\]\s+(.*?)\s+—\s+(https?:\/\/\S+)/.exec(l);
    if (!m) continue;
    let host = m[3];
    try { host = new URL(m[3]).hostname.replace(/^www\./, ""); } catch { /* keep the raw text */ }
    list.push({ n: +m[1], title: m[2], host });
  }
  return list;
}

/** A web search: one animated line while it runs, the sources that came back as chips, the details folded under it. */
function WebSearchCard({ a }: { a: AgentRun }) {
  const query = a.name.replace(/^Web:\s*/, "");
  const running = a.status === "running";
  const failed = a.status === "error";
  const sources = useMemo(() => sourcesOf(a.output), [a.output]);
  const [open, setOpen] = useState(false);
  const sec = useElapsed(running);
  const label = running ? (sec >= 3 ? "Reading the results" : "Searching the web") : failed ? "Couldn't reach the web" : `Searched the web${sources.length ? ` · ${sources.length} sources` : ""}`;
  return (
    <div className={`websearch ${a.status} ${open ? "open" : ""}`}>
      <button type="button" className="ws-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="web-globe" aria-hidden><GlobeIcon /></span>
        <span className="web-text">{label}{running && <span className="dots" aria-hidden><i>.</i><i>.</i><i>.</i></span>}</span>
        <span className="web-query muted small">{failed ? shortReason(a.error) : query}</span>
        <Chevron />
      </button>
      {!running && !failed && sources.length > 0 && !open && (
        <div className="ws-chips">{sources.slice(0, 5).map((s, i) => <span key={s.n} className="ws-chip" style={{ animationDelay: `${i * 55}ms` }} title={s.title}><b>{s.host[0]?.toUpperCase()}</b>{s.host}</span>)}</div>
      )}
      <Unfold open={open}>
        <div className="agent-body">
          <div className="agent-task small">“{query}”</div>
          {failed ? <div className="muted small">{a.error || "The search failed."}</div> : a.output ? <pre>{a.output}</pre> : <div className="muted small">Waiting for results…</div>}
        </div>
      </Unfold>
    </div>
  );
}

function AgentCards({ agents }: { agents: AgentRun[] }) {
  return (
    <div className="agents">
      {agents.map((a) => a.kind === "web" || /^Web: /.test(a.name) ? <WebSearchCard key={a.index} a={a} /> : (
        <RunCard key={a.index} mark={<StatusMark s={a.status} />} name={a.name} running={a.status === "running"} defaultOpen={a.status === "running"} note={a.status === "running" ? "Working…" : a.status === "error" ? "Failed" : "Done"} cls={a.status}>
          <div className="agent-task small">{a.task}</div>
          {a.error ? <div className="error-box">{a.error}</div> : <FollowPre text={a.output || "…"} />}
        </RunCard>
      ))}
    </div>
  );
}

/** What the code check did: files run, errors found, what the reviewer fixed. */
function ReviewCard({ review }: { review: ReviewRun }) {
  const running = review.status === "running";
  const bad = review.steps.some((x) => x.kind === "error");
  return (
    <RunCard cls={`review ${running || bad ? "" : "passed"}`} mark={<StatusMark s={running ? "running" : bad ? "error" : "done"} />} name="Code check" running={running} defaultOpen={running || bad} note={running ? "Working…" : bad ? "Problems found" : "Passed"}>
      {review.steps.map((x, i) => <StepRow key={i} step={x} />)}
      {review.shots && review.shots.length > 0 && <div className="review-shots">{review.shots.map((u, i) => <img key={i} src={u} alt="Screenshot of the page after the check" />)}</div>}
    </RunCard>
  );
}

/** The auto-improve run: round, time budget, what each round changed. */
function LoopCard({ loop }: { loop: LoopRun }) {
  const running = loop.status === "running";
  const until = new Date(loop.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <RunCard cls="review loop" mark={<StatusMark s={running ? "running" : "done"} />} name="Auto-improve" running={running} defaultOpen={running}
      note={running ? `Round ${loop.round} of ${loop.rounds} · until ${until} at the latest · ${loop.accepted} kept` : `${loop.accepted} improvement${loop.accepted === 1 ? "" : "s"} kept`}>
      {running && <div className="loop-bar"><span style={{ width: `${Math.min(100, (loop.round / Math.max(1, loop.rounds)) * 100)}%` }} /></div>}
      {loop.steps.map((x, i) => <StepRow key={i} step={x} />)}
    </RunCard>
  );
}

/** One line of a run, with the code it changed folded under it so the written code can always be read. */
function StepRow({ step }: { step: ReviewStep }) {
  return (
    <div className={`review-step ${step.kind}`}>
      <span className="step-mark"><StatusMark s={step.kind === "error" ? "error" : step.kind === "ok" ? "done" : "info"} /></span> {step.text}
      {step.diff && <details className="step-diff"><summary className="muted small">Show the code</summary><pre className="diff">{step.diff.split("\n").map((l, i) => <div key={i} className={l.startsWith("+ ") ? "add" : l.startsWith("- ") ? "del" : "hunk"}>{l}</div>)}</pre></details>}
    </div>
  );
}

/** The card for an artifact: while it is written its page draws lines and a bar sweeps; when it is done it settles. */
function ArtifactCardView({ s, on, onOpen }: { s: Extract<ReturnType<typeof parseSegments>[number], { t: "artifact" }>; on: boolean; onOpen: () => void }) {
  const [pop, setPop] = useState(false);
  const wasOpen = useRef(s.open);
  useEffect(() => { if (wasOpen.current && !s.open) { setPop(true); const t = setTimeout(() => setPop(false), 700); return () => clearTimeout(t); } wasOpen.current = s.open; }, [s.open]);
  const lines = s.content ? s.content.split("\n").length : 0;
  return (
    <button className={`artifact-card ${on ? "on" : ""} ${s.open ? "writing" : ""} ${pop ? "pop" : ""}`} onClick={onOpen}>
      <span className="artifact-card-icon"><WritingGlyph live={s.open} /></span>
      <span className="artifact-card-text"><strong>{s.title || "Creating…"}</strong><span className="muted small">{s.open ? `Writing${lines > 1 ? ` · ${lines} lines` : "…"}` : kindLabel(s)}</span></span>
      <span className="muted small artifact-open">{s.open ? "" : "Open"}</span>
      {s.open && <span className="card-sweep" aria-hidden />}
    </button>
  );
}

/** An answer with its artifacts folded into cards that open the side panel. While it is written it is shown at an even pace. */
function AssistantBody({ text, live, onOpen, openIndex }: { text: string; live: boolean; onOpen: (index: number) => void; openIndex: number | null }) {
  const shown = useSmoothText(text, live);
  const typing = live || shown.length < text.length;
  // an artifact left unclosed by a stopped answer is not being written any more: only a running turn has live pieces
  const segs = parseSegments(shown).map((s) => (s.t === "artifact" && s.open && !live ? { ...s, open: false } : s));
  return (
    <>
      {segs.map((s, i) => s.t === "text"
        ? <div key={i} className="assistant"><Markdown text={s.v} streaming={typing && i === segs.length - 1} /></div>
        : <ArtifactCardView key={i} s={s} on={openIndex === s.index} onOpen={() => onOpen(s.index)} />)}
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
  /** Artifacts seen so far per answer, and whether the reader picked a card themselves (then the panel stops following the writing). */
  const artCount = useRef(new Map<string, number>());
  const picked = useRef(false);
  const sentTurn = useRef(0);
  const spokenLen = useRef(0);
  const [input, setInput] = useState(() => loadDraft(conv.id));
  const [editing, setEditing] = useState<number | null>(null);
  const [away, setAway] = useState(false);
  const [announce, setAnnounce] = useState("");
  const jumping = useRef(false);
  const stoppedRef = useRef(false);
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
  const focusSoon = () => { requestAnimationFrame(() => taRef.current?.focus()); };
  const setDraft = (v: string) => { setInput(v); saveDraft(convRef.current.id, v); };

  // a chat was opened: show its saved draft and put the cursor in the composer
  useEffect(() => { setInput(loadDraft(conv.id)); setEditing(null); setAway(false); stick.current = true; focusSoon(); }, [conv.id]);
  // the box grows with its text up to 40% of the window, then scrolls; it eases between heights
  const empty = conv.turns.length === 0;
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    const prev = el.offsetHeight;
    el.style.height = "auto";
    const g = growTo(el.scrollHeight, window.innerHeight);
    el.style.overflowY = g.scroll ? "auto" : "hidden";
    el.style.height = `${prev}px`;
    void el.offsetHeight; // commit the old height so the change below animates
    el.style.height = `${g.height}px`;
  }, [input, empty, !!props.selected]);
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
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (jumping.current) { if (!near) return; jumping.current = false; } // a smooth jump passes through "away"
    stick.current = near;
    setAway(!near);
  };
  const jump = () => {
    stick.current = true; jumping.current = true; setAway(false);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setTimeout(() => { jumping.current = false; }, 1000);
  };
  useEffect(() => { if (stick.current) endRef.current?.scrollIntoView({ block: "end" }); }, [conv.turns]);
  // content also grows between updates (text revealed at an even pace, folds opening): keep following it
  const colRef = useRef<HTMLDivElement>(null);
  const hasTurns = conv.turns.length > 0;
  useEffect(() => {
    const col = colRef.current, box = col?.parentElement;
    if (!col || !box) return;
    const ro = new ResizeObserver(() => { if (stick.current) box.scrollTop = box.scrollHeight; });
    ro.observe(col);
    return () => ro.disconnect();
  }, [hasTurns, conv.id]);

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
      else if (ev.type === "done") { last.stats = ev.stats; last.pending = false; settle(last); }      else if (ev.type === "error") { last.error = ev.error; last.pending = false; settle(last); }
      next[next.length - 1] = last;
      return next;
    });
    if (ev.type === "replace") answerBuf.current = ev.text;
    // a stage that works on a file shows that file: the panel opens on it, so its code (and what it becomes) is seen as it happens
    if (ev.type === "build" && !picked.current) {
      const working = [...ev.build.steps.flatMap((s) => s.stages ?? []), ...(ev.build.verify ?? [])].find((g) => g.status === "running" && g.file);
      const segs = parseSegments(answerBuf.current).filter((x) => x.t === "artifact");
      const at = working?.file ? segs.map((x) => (x.t === "artifact" ? x.title.toLowerCase() : "")).lastIndexOf(working.file.toLowerCase()) : -1;
      if (at >= 0) setViewing((v) => (v && v.turn === sentTurn.current && v.index === at ? v : { turn: sentTurn.current, index: at }));
    }
    if (ev.type === "replace" && !picked.current) {
      // a file written again opens as it is written, wherever the reader was looking
      const open = parseSegments(answerBuf.current).filter((x) => x.t === "artifact").findIndex((x) => x.t === "artifact" && x.open);
      if (open >= 0) setViewing((v) => (v && v.turn === sentTurn.current && v.index === open ? v : { turn: sentTurn.current, index: open }));
    }
    if (ev.type === "answer") {
      answerBuf.current += ev.text;
      // open the panel as soon as the first artifact starts being written, and follow the writing from file to file
      const count = parseSegments(answerBuf.current).filter((x) => x.t === "artifact").length;
      if (count > (artCount.current.get(ev.id) ?? 0)) {
        artCount.current.set(ev.id, count);
        if (!picked.current && (!openedFor.current.has(ev.id) || count > 1)) { openedFor.current.add(ev.id); setViewing({ turn: sentTurn.current, index: count - 1 }); }
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
      saveArtifacts(); if (speak.current) vc.endAnswer(); setBusy(false); chatId.current = null; setAnnounce(stoppedRef.current ? "Stopped" : "Answer finished"); }
    if (ev.type === "error") { vc.cancelSpeech(); setBusy(false); chatId.current = null; setAnnounce("Something went wrong"); }
  }), [onTurns, onArtifact, vc]);

  /** The messages the next request starts from: system prompt, the chat (visible answers only, never the thoughts) and the draft. */
  const historyFor = (text: string, sent: Attachment[], limitTokens: number, turns: Turn[] = convRef.current.turns): ChatMessage[] => {
    const budget = knowledgeBudget(limitTokens);
    const sys = buildSystemPrompt({ custom: customInstructions, project, extra: system, knowledgeChars: budget, artifacts: needsTools(text, turns.some((t) => t.role === "assistant" && /<artifact/.test(t.content))) });
    return [
      ...(sys ? [{ role: "system" as const, content: sys }] : []),
      ...turns.filter((t) => !t.error && t.content).map((t) => (t.role === "user"
        ? { role: "user" as const, content: userContent(t.content, t.attachments ?? [], budget) }
        : { role: "assistant" as const, content: stripSubagents(t.content) })),
      { role: "user" as const, content: userContent(text, sent, budget) }
    ];
  };

  /** `redo`: edit or retry: start again from `base` (the turns before the one being redone) instead of the end of the chat. */
  const send = async (raw: string, fromVoice = false, redo?: { base: Turn[]; files: Attachment[] }) => {
    stick.current = true;
    const text = raw.trim();
    const sent = redo ? redo.files : files;
    if ((!text && !sent.length) || busy || !selected) return;
    const c = convRef.current;
    const base = redo ? redo.base : c.turns;
    // "continue" after an answer cut off inside an artifact: keep writing that artifact instead of starting a new answer
    const prev = base[base.length - 1];
    const resume = !redo && !!prev && prev.role === "assistant" && !prev.error && !sent.length
      && /^(please\s+)?(continue|go on|keep going|carry on|finish( it)?)[.!\s]*$/i.test(text)
      && parseSegments(prev.content).some((x) => x.t === "artifact" && x.open);
    const ask = resume
      ? "Your last answer was cut off in the middle of the artifact. Continue it from the exact character where it stopped: no repetition, no explanation, no code fence, no new <artifact> tag. Write only the rest of the file and finish with </artifact>."
      : text;
    const history = historyFor(ask, sent, selected.verdict.contextTokens || 4096, base);
    const id = crypto.randomUUID();
    chatId.current = id;
    answerBuf.current = resume ? prev.content : "";
    spokenLen.current = resume ? parseSegments(stripSubagents(prev.content)).map((x) => (x.t === "text" ? x.v : " ")).join("").length : 0;
    stoppedRef.current = false;
    picked.current = false;
    setAnnounce("");
    setEditing(null);
    if (redo && viewing && viewing.turn >= base.length) setViewing(null);
    sentTurn.current = resume ? c.turns.length - 1 : base.length + 1;
    if (resume) { openedFor.current.add(id); artCount.current.set(id, parseSegments(prev.content).filter((x) => x.t === "artifact").length); }
    speak.current = fromVoice || vstate !== "idle" || vsRef.current.readAloud;
    if (speak.current && ttsReady) vc.beginAnswer(); else speak.current = false;
    if (resume) onTurns(c.id, (t) => t.map((x, i) => (i === t.length - 1 ? { ...x, pending: true, stats: undefined, notices: undefined } : x)));
    else onTurns(c.id, () => [...base, { role: "user", content: text, attachments: sent.length ? sent : undefined }, { role: "assistant", content: "", pending: true, modelName: selected.entry.name }], base.length === 0 ? titleFrom(text || sent[0]?.name || "") : undefined);
    if (!redo) { setInput(""); saveDraft(c.id, ""); setFiles([]); }
    setBusy(true);
    focusSoon();
    await api().chat(id, selected.entry.id, history, { effort: effort, subagents, title: !resume && base.length === 0, projectId: project?.id ?? null });
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  const canSee = !!selected && visionSupport(selected.entry);
  const addFiles = async (list: FileList | File[]) => {
    const added: Attachment[] = [];
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      const why = refusal(f, true); // any model gets images: one that cannot see them has them described first
      if (why) { problems.push(why); continue; }
      try {
        if (classifyFile(f.name, f.type) === "pdf") {
          const text = await (await import("./pdf")).readPdf(f);
          if (!text.trim()) { problems.push(noPdfText(f.name)); continue; }
          added.push({ name: f.name, kind: "text", size: f.size, text });
        } else if (classifyFile(f.name, f.type) === "image") {
          const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
          added.push({ name: f.name, kind: "image", size: f.size, dataUrl });
        } else added.push({ name: f.name, kind: "text", size: f.size, text: await f.text() });
      } catch { problems.push(`${f.name}: could not be read.`); }
    }
    if (added.length) setFiles((v) => [...v, ...added]);
    if (!canSee && added.some((a) => a.kind === "image")) problems.push("This model cannot see images itself: an installed vision model looks at the image first, and its description goes with your message.");
    setNotice(problems.length ? problems.join(" ") : null);
  };

  const stop = async () => {
    vc.cancelSpeech();
    if (!chatId.current) return;
    stoppedRef.current = true;
    onTurns(convRef.current.id, (prev) => prev.map((t, i) => (i === prev.length - 1 && t.pending ? { ...t, stopped: true } : t)));
    focusSoon();
    await api().abortChat(chatId.current);
  };

  /** Run the last question again, replacing its answer. */
  const retry = () => {
    const turns = convRef.current.turns;
    const u = lastUserIndex(turns);
    const base = turnsBefore(turns, u);
    if (base) void send(turns[u].content, false, { base, files: turns[u].attachments ?? [] });
  };
  const resend = (i: number, text: string) => {
    const turns = convRef.current.turns;
    const base = turnsBefore(turns, i);
    if (base) void send(text, false, { base, files: turns[i].attachments ?? [] });
  };

  // Esc stops the answer; "/" jumps to the composer when nothing editable has focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && busy && !menuOpen && !toolsOpen && !voiceOn) { e.preventDefault(); void stop(); }
      else if (e.key === "/") {
        const a = document.activeElement as HTMLElement | null;
        if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
        if (taRef.current && editing === null) { e.preventDefault(); taRef.current.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggleDictation = async () => {
    setNotice(null);
    if (dictating) { signal.current.stopped = true; return; }
    if (!sttReady) { setNotice("Choose a dictation model first."); onOpenSettings(); return; }
    signal.current = { stopped: false };
    setDictating(true);
    try {
      const text = await dictateOnce(setLevel, signal.current);
      if (text) setInput((v) => { const n = (v ? v.replace(/\s+$/, "") + " " : "") + text; saveDraft(convRef.current.id, n); return n; });
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

  // the newest version of every file written in this chat: what a page needs to show itself
  // files already finished count at once, even inside the answer that is still being written, so a page picks up its stylesheet and script as they land
  const projectFilesNow = latestArtifacts(conv.turns.filter((t) => t.role === "assistant" && t.content).map((t) => ({ role: "assistant" as const, content: t.content })));
  const projectFilesKey = projectFilesNow.map((f) => `${f.title}:${f.content.length}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projectFiles = useMemo(() => projectFilesNow, [projectFilesKey]);

  // hooks go above the early return below: a hook after it makes React throw error #310 when a model gets picked
  const [cleaning, setCleaning] = useState<string | null>(null);
  useEffect(() => api().onNpuClean((p) => setCleaning(p.phase === "start" ? `The NPU was holding ${p.gb} GB with nothing running: cleaning it before loading the model` : null)), []);

  if (!selected) {
    return (
      <div className="empty">
        <img className="logo-mark" src="./logo.svg" alt="" />
        <h1>Pick a model to start</h1>
        <p className="muted">Open NPU checks that a model fits your NPU before you install it.</p>
        <button className="primary" onClick={onPickModel}>Browse models</button>
      </div>
    );
  }

  const starting = busy && server && server.state !== "ready";

  const limit = server?.nctx || selected.verdict.contextTokens || 4096;
  // measured on the request as it would really be sent (after old versions, files and old turns are fitted), not on the raw chat
  const extra = tokensOf(`${subagents ? SUBAGENT_INSTRUCTIONS : ""}${settings.webSearch ? "x".repeat(520) : ""}${project?.folder ? "x".repeat(900) : ""}`);
  // Files are never in this chat's window: the main session keeps one line per file, and the files are written and changed in
  // sessions of their own. The meter measures the request this chat would really send, so files count as that one line.
  const req = requestUse(stubHistory(historyFor(input, files, limit)), { nctx: limit, maxTokens: selected.entry.sampling.max_tokens, extraTokens: extra });
  const sysText = buildSystemPrompt({ custom: customInstructions, project, extra: system, knowledgeChars: knowledgeBudget(limit), artifacts: needsTools(input, projectFilesNow.length > 0) });
  const use = contextUse({
    systemChars: sysText.length + (subagents ? SUBAGENT_INSTRUCTIONS.length : 0),
    turns: stubHistory(conv.turns.filter((t) => !t.error).map((t) => ({ role: t.role, content: t.role === "assistant" ? stripSubagents(t.content) : t.content }))).map((m, i) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: typeof m.content === "string" ? m.content : "", attachments: conv.turns.filter((t) => !t.error)[i]?.attachments })),
    draftChars: input.length, draftFiles: files, attachmentBudgetChars: knowledgeBudget(limit), limitTokens: req.budgetTokens
  });
  const ring = (
    <div className="menu-anchor">
      <button type="button" className={`ctx ${req.level}`} onClick={() => setCtxOpen((v) => !v)} title="Context window: click for the breakdown" aria-label={`Context ${req.percent}% full, show breakdown`} aria-haspopup="dialog" aria-expanded={ctxOpen}>
        <svg width="18" height="18" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="5" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(use.percent / 100) * 94.25} 94.25`} transform="rotate(-90 18 18)" />
        </svg>
        <span className="small">{req.percent}%</span>
      </button>
      {ctxOpen && (
        <>
          <div className="menu-scrim" onClick={() => setCtxOpen(false)} />
          <div className="menu ctx-pop" style={{ left: "auto", right: 0 }} role="dialog" aria-label="Context breakdown">
            <div className="menu-title">Context window</div>
            <p className="small muted ctx-note">The model can only keep so much text in mind at once. This is how much of that space this chat uses, for {selected.entry.name}.</p>
            <div className="ctx-total"><b>{req.usedTokens.toLocaleString()}</b> of {req.budgetTokens.toLocaleString()} tokens <span className={`ctx ${req.level}`}>({req.percent}%)</span></div>
            <div className="ctx-bar">
              {use.parts.map((p) => <span key={p.id} className={`ctx-seg ${p.id}`} style={{ width: `${(p.tokens / use.limitTokens) * 100}%` }} title={p.label} />)}
            </div>
            {use.parts.map((p) => (
              <div className="ctx-line" key={p.id}><span className={`ctx-dot ${p.id}`} /><span className="menu-label">{p.label}</span><span className="muted">{p.tokens.toLocaleString()}</span></div>
            ))}
            <div className="ctx-line"><span className="ctx-dot free" /><span className="menu-label">Free</span><span className="muted">{Math.max(0, use.limitTokens - use.usedTokens).toLocaleString()}</span></div>
            <p className="small muted ctx-note">{req.fitted ? `${req.notes.join(" ")} ` : ""}{req.level === "ok" ? "The next request, as it would be sent; the rest of the window is kept for the answer." : "Getting full: the oldest messages are left out first. Start a new chat or remove big files to free space."}{projectFilesNow.length > 0 ? " The files of this chat are written and changed in sessions of their own, each with its own window, so here they count for one line each." : ""}</p>
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
        onChange={(e) => setDraft(e.target.value)} title="Enter to send, Shift+Enter for a new line, Esc to stop, ↑ to edit your last message" aria-label="Message"
        onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void addFiles(e.clipboardData.files); } }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); }
          else if (e.key === "ArrowUp" && !input && !files.length && !busy) { const u = lastUserIndex(conv.turns); if (u >= 0) { e.preventDefault(); setEditing(u); } }
        }}
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
          ? <button type="button" className="send stop" onClick={() => void stop()} aria-label="Stop" title="Stop (Esc)"><Icon d={ICONS.stop} size={14} fill /></button>
          : <button className="send" disabled={!input.trim() && !files.length} aria-label="Send" title="Send (Enter)"><Icon d={ICONS.up} size={18} /></button>}
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
              onSelect={onSelectModel} onEffort={onEffort} onSubagents={onSubagents} onBrowse={onPickModel}
              quickIds={settings.quickModelIds} onQuickIds={(ids) => onSettings({ quickModelIds: ids })} onClose={() => setMenuOpen(false)}
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
  const panel = viewedSeg && viewedSeg.t === "artifact" ? (
    <ArtifactViewer
      key={`${viewing!.turn}:${viewing!.index}`} artifact={viewedSeg} live={viewedSeg.open && !!viewed?.pending} files={projectFiles}
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
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>
      {empty ? (
        <div className="welcome">
          <div className="greet"><img className="logo-mark" src="./logo.svg" alt="" /><h1>{greeting()}</h1></div>
          {composer}
          {notice && <div className="composer-notice">{notice}</div>}
          <StarterChips onPick={(p) => { setDraft(p); focusSoon(); }} />
          {sysOpen && <textarea className="sysprompt" value={system} onChange={(e) => setSystem(e.target.value)} rows={2} placeholder="You are a helpful assistant." />}
        </div>
      ) : (
        <>
          <div className="messages" onScroll={onScroll}>
            <div className="column" ref={colRef}>
              {conv.turns.map((t, i) => (
                <div key={i} className={`msg ${t.role} ${t.pending ? "live" : ""}`}>
                  {t.role === "user" ? (editing === i ? <EditBox initial={t.content} onSave={(text) => resend(i, text)} onCancel={() => { setEditing(null); focusSoon(); }} /> : <>
                    <div className="user-bubble"><AttachChips items={t.attachments ?? []} />{t.content}</div>
                    <div className="actions user-actions">
                      <IconButton d={ICONS.edit} label="Edit message" disabled={busy} onClick={() => setEditing(i)} />
                      <CopyButton text={t.content} />
                    </div></>) : (
                    <>
                      {t.thinking && <ThinkingBlock text={t.thinking} live={!!t.pending && !hideEdits(stripSubagents(t.content))} />}
                      {t.agents && t.agents.length > 0 && <AgentCards agents={t.agents} />}
                      {t.build && <BuildCard build={t.build} content={t.pending ? t.content : ""} />}
                      {t.loop && <LoopCard loop={t.loop} />}
                      {t.review && <ReviewCard review={t.review} />}
                      {t.notices?.map((n, k) => <div key={k} className="muted small notice">{n}</div>)}
                      {hideEdits(stripSubagents(t.content)) && <AssistantBody text={hideEdits(stripSubagents(t.content))} live={!!t.pending} openIndex={viewing?.turn === i ? viewing.index : null} onOpen={(idx) => { picked.current = true; setViewing({ turn: i, index: idx }); }} />}
                      {t.pending && !hideEdits(stripSubagents(t.content)) && !t.thinking && !t.agents?.some((a) => a.status === "running") && !(t.review?.status === "running") && !(t.loop?.status === "running") && !(t.build?.status === "running") && (
                        cleaning ? <Presence label={cleaning} /> : starting ? <Presence label="Loading the model onto the NPU" />
                          : t.agents?.length || t.review || t.loop || t.build ? <Presence label="Putting it together" /> : <Presence verbs />
                      )}
                      {t.error && (
                        <div className="error-box">
                          <strong>{t.error.title}</strong>
                          <div>{t.error.fix}</div>
                          {t.error.raw && <details><summary className="small">Raw message</summary><pre>{t.error.raw}</pre></details>}
                          {i === conv.turns.length - 1 && !busy && <button type="button" className="primary try-again" onClick={retry}>Try again</button>}
                          {i === conv.turns.length - 1 && !busy && /^npu-/.test(t.error.id ?? "") && <div className="small"><ResetNpuButton label="Reset the NPU, then try again" onDone={retry} /></div>}
                        </div>
                      )}
                      {t.stopped && !t.pending && <div className="muted small stopped-note">Stopped</div>}
                      {!t.pending && (hideEdits(stripSubagents(t.content)) || t.stopped) && (
                        <div className="actions">
                          {hideEdits(stripSubagents(t.content)) && <CopyButton text={hideEdits(stripSubagents(t.content))} />}
                          {i === conv.turns.length - 1 && !busy && <IconButton d={ICONS.retry} label="Regenerate" onClick={retry} />}
                          {ttsReady && hideEdits(stripSubagents(t.content)) && <IconButton d={ICONS.speaker} label="Read aloud" onClick={() => { void api().voiceApply().then(() => vc.readAloud(stripArtifacts(hideEdits(stripSubagents(t.content))))); }} />}
                          {t.stats?.finish === "length" && <span className="warn small">Cut off: the context or the answer limit was reached. Say “continue”, or start a new chat.</span>}
                          {t.stats && t.stats.tokens > 0 && (
                            <span className="stats muted small">
                              {t.stats.tokPerSec !== null && <>{t.stats.tokPerSec} tok/s · </>}
                              {t.stats.prepSec != null && t.stats.prepSec >= 0.3 && <span title={(t.stats.prep ?? []).map((l) => `${l.name}: ${l.sec} s`).join("\n")}>prepared in {t.stats.prepSec}s · </span>}
                              {t.stats.answerSec != null && t.stats.ttftSec != null && t.stats.answerSec - t.stats.ttftSec >= 1 ? <>thought {Math.round((t.stats.answerSec - t.stats.ttftSec) * 10) / 10}s · first word {t.stats.answerSec}s · </> : t.stats.ttftSec !== null && <>first token {t.stats.ttftSec}s · </>}
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
          <div className="composer-wrap"><JumpToLatest show={away} onClick={jump} />{composer}{notice && <div className="composer-notice">{notice}</div>}</div>
        </>
      )}
    </div>
    {panel}
    </div>
  );
}
