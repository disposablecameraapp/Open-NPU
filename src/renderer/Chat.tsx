import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type UIEvent, type WheelEvent as RWheel, type KeyboardEvent as RKey, type PointerEvent as RPointer } from "react";
import { ResetNpuButton } from "./ResetNpuButton";
import { api } from "./api";
import type { CatalogItem } from "../shared/api";
import type { AgentRun, Artifact, Attachment, BuildRun, BuildStage, ChatEvent, ChatMessage, Effort, LoopRun, Project, ReviewRun, ReviewStep, ServerStatus, Settings, VoiceModelView, VoiceSettings, VoiceStatus } from "../shared/types";
import { Markdown } from "./Markdown";
import { Conversation, Turn, titleFrom } from "./store";
import { ArtifactViewer, kindLabel } from "./ArtifactView";
import { LogoMark, AgentsIcon, ArtifactIcon, CheckShieldIcon, GlobeIcon, LoopIcon, PlusIcon, SlidersIcon } from "./Icons";
import { ToolsMenu } from "./ToolsMenu";
import { ModelMenu, effortLabel } from "./ModelMenu";
import { stripSubagents } from "../core/agents";
import { classifyFile, noPdfText, refusal, userContent } from "../core/attachments";
import { visionSupport } from "../core/effort";
import { requestUse, tokensOf } from "../core/context";
import { contextUse } from "../core/contextUse";
import { foldHead } from "../core/compaction";
import { hashText, usableMemo, type Memo } from "../core/memo";
import { SUBAGENT_INSTRUCTIONS } from "../core/agents";
import { artifactsIn, parseSegments, replaceArtifact, stripArtifacts } from "../core/artifacts";
import { hideEdits } from "../core/review";
import { buildItems, deriveSimple, deriveWork } from "../core/workLog";
import { ActivityGroup, LoadingLine, TurnSummary, WorkCard } from "./WorkLog";
import { StepIcon } from "./StepIcon";
import { latestArtifacts } from "../core/review";
import { needsTools, stubHistory } from "../core/build";
import { composeInstructions } from "../core/instructions";
import { autoSkill, autoSkillPrompt, matchSkills, stepPrompt, type Skill } from "../core/skills";
import { allSkills } from "../core/skillsDefault";
import { buildSystemPrompt, knowledgeBudget } from "../core/projects";
import { ICONS, Icon, IconButton } from "./Icon";
import { VoiceChat, VoiceState, dictate } from "./voiceChat";
import { LiveWords, VoiceSetup, type VoicePack } from "./VoiceSetup";
import type { LiveText } from "../core/live";
import { toSpeechText } from "../core/speechText";
import { markInterruption } from "../core/spoken";
import { fastVoiceModel, otherVoiceItems, pickVoiceItem, preferredVoiceModel, sizeOfChatModel, voiceMenuItems } from "../core/voicePick";
import { compactVisuals, visualNeeds, visualsOf, wantsCloseVisual, type VisualNeeds } from "../core/visuals";
import { CHART_INSTRUCTIONS } from "../core/chart";
import { DIAGRAM_INSTRUCTIONS } from "../core/diagram";
import { routeVisual } from "../core/visualRoute";
import { packParts } from "../core/dynamic";
import { Chevron, Presence, StatusMark, ThinkingBlock, Unfold, WritingGlyph, ticker, useElapsed } from "./Activity";
import { BuildCard } from "./BuildProgress";
import { useSmoothText } from "./useSmoothText";
import { EditBox, JumpToLatest, StarterChips, loadDraft, saveDraft } from "./ComposerParts";
import { growTo, lastUserIndex, turnsBefore } from "../core/composer";

/** The drawing of what the voice chat does now. */
const VOICE_ICON: Record<VoiceState, string> = { idle: "load", listening: "mic", hearing: "mic", transcribing: "write", thinking: "think", speaking: "speak" };

const STATE_TEXT: Record<VoiceState, string> = {
  idle: "", listening: "Listening…", hearing: "Listening…", transcribing: "Transcribing…", thinking: "Thinking…", speaking: "Speaking…"
};

/**
 * Said to the model in a voice conversation: it is one, what it receives is a transcription and what it writes is read aloud, and the person
 * may cut in. So: short spoken sentences, charity with transcription mistakes, and no formatting.
 */
const SPOKEN_STYLE = "This is a voice conversation. The person talks to you through a microphone, so their messages are automatic transcriptions: a word may be misheard (a name, a homophone, missing punctuation); take the most likely meaning, and ask briefly only if it is really unclear. Your answer is shown on the screen and read aloud by a voice, and the person can interrupt you by speaking. Answer in the language they used. By default talk naturally and briefly: short plain sentences, the answer first, the main point and an offer to go on when the subject is long. Do not imitate speech: no filler words, no onomatopoeia, no laughter or stage directions, no remarks about speaking, listening or the microphone, no sign-off. You are not limited by being in a voice chat: when the request calls for it, or the person asks, use lists, steps, tables, code, longer explanations or any other normal format, and give as much as the need requires. The voice reads the text of lists and steps and skips code, tables and symbols, so say in a sentence what a table or a piece of code shows. If one of your earlier answers contains '[The user interrupted here...]', the person only heard what comes before that mark and nothing after it: do not assume they heard the rest, and if they ask you to go on, resume from the mark.";

/** Given only when the request asks for a chart or a picture. */
const VISUAL_STYLE = "A chart, a diagram or a picture is shown on the screen and never read out: add it as instructed below, and say in one short sentence what it shows. Earlier charts and pictures of this conversation appear as notes like [A bar chart was shown on screen.]: they are only notes, never write one yourself; to show something new, write the block itself.";

/** The text of an answer as the voice reads it, without files and charts. */
function spokenProse(content: string): string {
  return toSpeechText(parseSegments(stripSubagents(content)).map((x) => (x.t === "text" ? x.v : " ")).join(""));
}
/** Lists, tables, code and headings are shown as they are: the word-by-word reading is for plain talk. */
const hasRichFormat = (content: string) => /```|^\s*\|.*\|\s*$|^\s*([-*+]|\d+[.)])\s+\S|^\s{0,3}#{1,6}\s/m.test(stripSubagents(content));
const hasArtifact = (content: string) => parseSegments(stripSubagents(content)).some((x) => x.t === "artifact");
const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

function greeting(): string {
  return "What are you working on?";
}

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
const WaveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" /></svg>
);


/** The smaller notes (reading size, a chart mended) folded into one quiet line that opens to the notes, like every other line of finished work. */
function NoticeDetails({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ag fin nd">
      <button type="button" className="ag-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <StepIcon tag="info" state="done" size={15} />
        <span className="ag-main"><span className="ag-t">{items.length === 1 ? "1 detail" : `${items.length} details`}</span></span>
        <span className="ag-m"><Chevron /></span>
      </button>
      <Unfold open={open}><div className="ag-body nd-body">{items.map((n, k) => <div key={k} className="nd-line">{n}</div>)}</div></Unfold>
    </div>
  );
}

/** What the app did around an answer: the model that answers stays visible, a problem too; the rest (reading size, mended charts) is folded. */
function Notices({ items }: { items: string[] }) {
  const model = items.find((n) => /^Dynamic .+ → /.test(n));
  const problems = items.filter((n) => /\bstill (cannot|does not)\b/.test(n));
  const skill = items.find((n) => /^Loaded skill: /.test(n));
  const rest = items.filter((n) => n !== model && n !== skill && !problems.includes(n));
  return (
    <div className="notices">
      {model && <div className="muted notice notice-route"><StepIcon tag="route" state="done" size={15} /><span className="nr-t">{/ · sorted by the router$/.test(model) ? "Sorted by the router" : "Picked the model"}</span><span className="nr-d">{model.replace(/ · sorted by the router$/, "")}</span></div>}
      {skill && <div className="muted notice notice-route"><StepIcon tag="skill" state="done" size={15} /><span className="nr-t">Loaded skill</span><span className="nr-d">{skill.replace(/^Loaded skill: /, "")}</span></div>}
      {problems.map((n, k) => <div key={k} className="notice notice-route notice-problem"><StepIcon tag="info" state="error" size={15} /><span className="nr-d">{n}</span></div>)}
      {rest.length > 0 && <NoticeDetails items={rest} />}
    </div>
  );
}

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

/** The journal of an assistant turn that is complex work (a document, helpers, several searches, an improve loop), or null: a question keeps its search card and the line of its thinking. */
function workOf(t: Turn) {
  if (t.role !== "assistant") return null;
  const doc = parseSegments(t.content).filter((x) => x.t === "artifact" && /^(markdown|docx|xlsx|pptx)$/.test(x.kind)).pop();
  const w = deriveWork({ pending: !!t.pending, build: t.build, agents: t.agents, review: t.review, loop: t.loop, document: doc && doc.t === "artifact" ? { title: doc.title, open: doc.open, content: doc.content } : null });
  if (!w || w.kind === "build") return null; // a build has its own block
  if (!t.pending && w.items.length < 3) return null;
  return w;
}

/** What came before the answer of a simple task (thinking, searches, project files, a file read). From two steps on, only the last shows and the rest folds under it. */
function TurnActivity({ t, files }: { t: Turn; files: string[] }) {
  const cards = (
    <>
      {t.thinking && <ThinkingBlock text={t.thinking} live={!!t.pending && !hideEdits(stripSubagents(t.content))} />}
      {t.agents && t.agents.length > 0 && <AgentCards agents={t.agents} />}
    </>
  );
  const complex = !!t.build || !!t.loop || !!t.review || !!workOf(t);
  const items = complex ? [] : deriveSimple({ pending: !!t.pending, agents: t.agents, thinking: !!t.thinking, answering: !!hideEdits(stripSubagents(t.content)), notices: t.notices, attachments: files });
  if (items.length < 2) return cards;
  const tick = t.thinking ? ticker(t.thinking) : null;
  return <ActivityGroup items={items} running={!!t.pending} thought={tick && tick.text ? tick : null}>{cards}</ActivityGroup>;
}

/** All the work before the answer. While it runs each piece shows as it is; once the turn is over, two steps or more fold into one line. */
function TurnWork({ t, files }: { t: Turn; files: string[] }) {
  const w = workOf(t);
  const pieces = (
    <>
      {t.notices && t.notices.length > 0 && <Notices items={t.notices} />}
      <TurnActivity t={t} files={files} />
      {t.build && <BuildCard build={t.build} content={t.pending ? t.content : ""} />}
      {w && <WorkCard items={w.items} running={!!t.pending} />}
      {t.loop && <LoopCard loop={t.loop} />}
      {t.review && <ReviewCard review={t.review} />}
    </>
  );
  const complex = !!t.build || !!t.loop || !!t.review || !!w;
  const simple = complex ? [] : deriveSimple({ pending: false, agents: t.agents, thinking: !!t.thinking, answering: true, notices: t.notices, attachments: files });
  const routed = complex ? (t.notices?.some((n) => /sorted by the router/.test(n)) ? 1 : 0) + (t.notices?.some((n) => /^Loaded skill: /.test(n)) ? 1 : 0) : 0; // the sorting came first and counts as a step
  const count = routed + (t.build ? buildItems(t.build).length + (t.agents?.length ?? 0) : 0) + (w ? w.items.length : simple.length + (t.review ? 1 : 0) + (t.loop ? 1 : 0));
  const bad = !!t.build?.steps.some((s) => s.status === "error") || !!t.agents?.some((a) => a.status === "error");
  const sec = Math.round(t.stats?.totalSec ?? 0);
  return <TurnSummary count={count} sec={sec} bad={bad} summarize={!t.pending && count >= 2}>{pieces}</TurnSummary>;
}

/** The words of an answer as it is read: the ones the voice has said in full colour, the ones to come in grey. */
function VoiceReading({ text, read }: { text: string; read: number }) {
  let n = 0;
  return (
    <div className="voice-reading">
      {text.split("\n").filter((l) => l.trim()).map((line, p) => (
        <p key={p}>{line.split(/\s+/).filter(Boolean).map((w, i) => <span key={i} className={`vr-w ${n++ < read ? "" : "unread"}`}>{w} </span>)}</p>
      ))}
    </div>
  );
}

/** The three models of a voice conversation, changed on the spot: what hears, what thinks, what speaks. A model not installed yet is offered with its size and installs when chosen. */
function VoiceModels({ voice, onSaveVoice, options, modelSetting, onModel }: { voice: VoiceSettings; onSaveVoice: (p: Partial<VoiceSettings>) => Promise<void>; options: VoiceModelOptions; modelSetting: string; onModel: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<VoiceModelView[]>([]);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const want = useRef<Record<string, "stt" | "tts">>({});
  const load = () => api().voiceModels().then(setModels).catch(() => undefined);
  useEffect(() => { if (open) void load(); }, [open]);
  useEffect(() => api().onVoiceDownload((p) => {
    setProgress((cur) => ({ ...cur, [p.id]: p.phase === "downloading" ? `Downloading ${p.percent ?? 0}%` : p.phase === "extracting" ? "Unpacking…" : p.phase === "error" ? "Failed" : "" }));
    if (p.phase === "done") {
      const kind = want.current[p.id];
      delete want.current[p.id];
      void load();
      if (kind) void onSaveVoice(kind === "stt" ? { sttModelId: p.id } : { ttsModelId: p.id, ttsSid: 0 }).then(() => api().voiceApply());
    }
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (kind: "stt" | "tts", id: string) => {
    const m = models.find((x) => x.model.id === id);
    if (!m) return;
    if (m.installed) { void onSaveVoice(kind === "stt" ? { sttModelId: id } : { ttsModelId: id, ttsSid: 0 }).then(() => api().voiceApply()); return; }
    want.current[id] = kind;
    setProgress((cur) => ({ ...cur, [id]: "Starting…" }));
    void api().voiceDownload(id).catch(() => setProgress((cur) => ({ ...cur, [id]: "Failed" })));
  };
  const row = (kind: "stt" | "tts", label: string, current: string | null) => {
    const list = models.filter((x) => x.model.kind === kind);
    const busy = list.filter((x) => progress[x.model.id]).map((x) => `${x.model.name}: ${progress[x.model.id]}`);
    return (
      <label className="vm-row"><span>{label}</span>
        <select value={current ?? ""} onChange={(e) => pick(kind, e.target.value)} aria-label={label}>
          {!current && <option value="">Choose…</option>}
          {list.map((x) => <option key={x.model.id} value={x.model.id}>{x.model.name}{x.installed ? "" : ` · install (${x.model.sizeMB} MB)`}</option>)}
        </select>
        {busy.map((b) => <span key={b} className="muted small">{b}</span>)}
      </label>
    );
  };
  const tts = models.find((x) => x.model.id === voice.ttsModelId)?.model;
  return (
    <div className="menu-anchor vm-anchor">
      <button type="button" className="vb-btn models" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title="Change the models of this voice chat: hearing, thinking, voice">Models</button>
      {open && (
        <div className="vm-menu" role="menu">
          {row("stt", "Hearing", voice.sttModelId)}
          <label className="vm-row"><span>Thinking</span>
            <select value={modelSetting} onChange={(e) => onModel(e.target.value)} aria-label="Model for voice chat" title="Automatic follows the size of the chat's model (always the 2B or the 4B)">
              <option value="">{options.auto ? `Automatic · ${options.auto}` : "Automatic"}</option>
              {options.made.length > 0 && <optgroup label="Made for voice">{options.made.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
              <optgroup label="Other models"><option value="chat">The chat's own model</option>{options.others.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>
            </select>
          </label>
          {row("tts", "Voice", voice.ttsModelId)}
          {tts && (tts.voices || tts.sidCount) && (
            <label className="vm-row"><span>Speaker</span>
              {tts.voices
                ? <select value={voice.ttsSid} onChange={(e) => void onSaveVoice({ ttsSid: parseInt(e.target.value, 10) })}>{tts.voices.map((x) => <option key={x.sid} value={x.sid}>{x.name}</option>)}</select>
                : <input type="number" min={0} max={(tts.sidCount ?? 1) - 1} value={voice.ttsSid} onChange={(e) => void onSaveVoice({ ttsSid: Math.max(0, parseInt(e.target.value || "0", 10)) })} />}
            </label>
          )}
          <button type="button" className="ghost" disabled={!voice.ttsModelId} onClick={() => void api().voiceApply().then(() => api().speak(`preview-${Date.now()}`, "Hello! This is how I sound. Bonjour, voici ma voix."))}>Hear this voice</button>
        </div>
      )}
    </div>
  );
}

/** The microphones of the PC, listed beside the mute button: the chosen one is kept for the next voice chats. */
function MicPicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const list = () => navigator.mediaDevices.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === "audioinput" && x.deviceId !== "communications"))).catch(() => undefined);
    void list();
    navigator.mediaDevices.addEventListener("devicechange", list);
    return () => navigator.mediaDevices.removeEventListener("devicechange", list);
  }, []);
  const current = devices.find((d) => d.deviceId === value) ?? devices.find((d) => d.deviceId === "default") ?? devices[0];
  return (
    <div className="menu-anchor mic-picker">
      <button type="button" className="vb-btn vb-menu-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Choose the microphone" title={`Microphone: ${current?.label || "default"}`}><Chevron /></button>
      {open && (
        <div className="mic-menu" role="menu">
          {devices.map((d, i) => (
            <button key={d.deviceId + i} type="button" role="menuitemradio" aria-checked={d.deviceId === (current?.deviceId ?? "")} className={`mic-item ${d.deviceId === (current?.deviceId ?? "") ? "on" : ""}`} onClick={() => { setOpen(false); onPick(d.deviceId === "default" ? "" : d.deviceId); }}>{d.label || `Microphone ${i + 1}`}</button>
          ))}
          {!devices.length && <div className="muted small mic-item">No microphone found</div>}
        </div>
      )}
    </div>
  );
}

interface VoiceModelOptions { auto: string; made: { id: string; name: string }[]; others: { id: string; name: string }[] }

/** The input bar while a voice conversation runs: what is heard or the state, the model, the microphone and mute, end. It glows with the sound. */
function VoiceBar({ text, onText, onSend, voice, onSaveVoice, options, modelSetting, onModel, micId, onMic, state, level, live, error, muted, onMute, onEnd }: { text: string; onText: (v: string) => void; onSend: () => void; voice: VoiceSettings; onSaveVoice: (p: Partial<VoiceSettings>) => Promise<void>; options: VoiceModelOptions; modelSetting: string; onModel: (id: string) => void; micId: string; onMic: (id: string) => void; state: VoiceState; level: number; live: LiveText | null; error: string | null; muted: boolean; onMute: () => void; onEnd: () => void }) {
  return (
    <div className={`composer voicebar ${muted ? "muted" : state}`} style={{ ["--lvl" as any]: String(muted ? 0 : Math.min(1, level * 1.6)) }}>
      {error && <div className="error-box">{error}</div>}
      <div className="vb-row">
        <div className="vb-text">
          {!muted && live && (live.settled || live.moving) && <LiveWords text={live} className="vb" />}
          <div className="vb-field">
            <StepIcon tag={muted ? "micoff" : VOICE_ICON[state]} state={muted ? "done" : "running"} size={16} />
            <input className="vb-input" value={text} placeholder={muted ? "Microphone muted · you can type" : `${STATE_TEXT[state] || "Starting…"} or type`} aria-label="Type a message"
              onChange={(e) => onText(e.target.value)}
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") { e.preventDefault(); onSend(); } else if (e.key === "Escape") onText(""); }} />
            {text.trim() && <button type="button" className="vb-btn send-typed" onClick={onSend} aria-label="Send" title="Send (Enter)"><Icon d={ICONS.up} size={16} /></button>}
          </div>
        </div>
        <VoiceModels voice={voice} onSaveVoice={onSaveVoice} options={options} modelSetting={modelSetting} onModel={onModel} />
        <div className={`vb-mic ${muted ? "off" : ""}`}>
          <button type="button" className={`vb-btn mic ${muted ? "off" : ""}`} onClick={onMute} aria-pressed={muted} aria-label={muted ? "Unmute microphone" : "Mute microphone"} title={muted ? "Unmute microphone" : "Mute microphone"}><StepIcon tag={muted ? "micoff" : "mic"} state="done" size={18} /></button>
          <MicPicker value={micId} onPick={onMic} />
        </div>
        <button type="button" className="vb-btn end" onClick={onEnd} aria-label="Stop the voice chat" title="Stop the voice chat"><span className="vb-dots" aria-hidden><i /><i /><i /></span>Stop</button>
      </div>
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
        <span className="web-globe" aria-hidden><StepIcon tag="search" state={running ? "running" : failed ? "error" : "done"} /></span>
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
        <RunCard key={a.index} mark={<StepIcon tag={/^Folder: /.test(a.name) ? "folder" : "agent"} state={a.status} />} name={a.name} running={a.status === "running"} defaultOpen={a.status === "running"} note={a.status === "running" ? "Working…" : a.status === "error" ? "Failed" : "Done"} cls={a.status}>
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
    <RunCard cls={`review ${running || bad ? "" : "passed"}`} mark={<StepIcon tag="review" state={running ? "running" : bad ? "error" : "done"} />} name="Code check" running={running} defaultOpen={running || bad} note={running ? "Working…" : bad ? "Problems found" : "Passed"}>
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
    <RunCard cls="review loop" mark={<StepIcon tag="loop" state={running ? "running" : "done"} />} name="Auto-improve" running={running} defaultOpen={running}
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
  project: Project | null;
  items: CatalogItem[]; effort: Effort; subagents: boolean; settings: Settings; onSettings: (p: Partial<Settings>) => void;
  onSelectModel: (id: string) => void; onEffort: (e: Effort) => void; onSubagents: (on: boolean) => void;
  onPickModel: () => void; onOpenSettings: () => void; onOpenProject: (id: string) => void;
  onTurns: (id: string, fn: (t: Turn[]) => Turn[], title?: string, named?: boolean) => void;
  /** The oldest part of the chat was summarized (or the summary dropped, null): kept with the chat. */
  onMemo: (id: string, memo: Memo | null) => void;
  onArtifact: (a: Artifact) => void;
  onBusy: (busy: boolean) => void;
  /** Models were installed from here (the voice chat pack): the list is read again. */
  onCatalogChanged: () => void;
  onExportArtifact: (id: string) => void;
  /** A first message to send as soon as this chat is shown (from a project page), and the call that says it was taken. */
  startText?: string; onStarted?: () => void;
}) {
  const { conv, selected, server, voiceSettings, project, items, effort, subagents, settings, onSettings, onSelectModel, onEffort, onSubagents, onPickModel, onOpenSettings, onOpenProject, onTurns, onMemo, onArtifact, onExportArtifact, onBusy, onCatalogChanged } = props;
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
  const stoppedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusy(busy); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dictating, setDictating] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [vstate, setVstate] = useState<VoiceState>("idle");
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState("");
  const [live, setLive] = useState<LiveText | null>(null);
  const [caption, setCaption] = useState("");
  const [micMuted, setMicMuted] = useState(false);
  /** The charts and pictures the person closed on the voice screen: they stay closed, a new one opens again. */
  const [hiddenVisuals, setHiddenVisuals] = useState("");
  const [voiceSetup, setVoiceSetup] = useState<{ kinds: ("stt" | "tts")[]; then: "dictate" | "voice"; pack?: VoicePack | null } | null>(null);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatId = useRef<string | null>(null);
  const speak = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const signal = useRef({ stopped: false });
  const sendAfterDictation = useRef(false);
  /** The person said no to installing the voice chat pack: it is not asked again until the app restarts. */
  const packDeclined = useRef(false);
  const interruptRef = useRef<(spoken: string) => void>(() => undefined);
  const inputRef = useRef("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const convRef = useRef(conv);
  convRef.current = conv;
  inputRef.current = input;
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
  /** The charts and pictures of the answer being spoken: shown on the voice screen, which covers the chat. */
  const lastTurn = conv.turns[conv.turns.length - 1];
  const shownVisuals = voiceOn && lastTurn?.role === "assistant" ? visualsOf(lastTurn.content) : "";
  const voiceVisuals = shownVisuals === hiddenVisuals ? "" : shownVisuals;
  const vsRef = useRef(voiceSettings);
  vsRef.current = voiceSettings;

  const voiceReady = !!(voiceSettings.sttModelId && voiceSettings.ttsModelId);
  const sttReady = !!voiceSettings.sttModelId;
  const ttsReady = !!voiceSettings.ttsModelId;

  const vc = useMemo(() => new VoiceChat({
    state: setVstate, level: (l) => setLevel(Math.round(l * 20) / 20), live: setLive, caption: setCaption,
    utterance: (t) => { setHeard(t); void sendRef.current(t, true); },
    interrupt: (spoken) => interruptRef.current(spoken),
    error: (m) => setVoiceErr(m)
  }, () => vsRef.current), []);
  useEffect(() => () => vc.dispose(), [vc]);

  // Follow new output while the reader is at the bottom. Only the reader's own gestures (wheel up,
  // touch or scrollbar drag away from the bottom, up keys) release it, never the content growing
  // or shrinking underneath; reaching the very bottom again resumes it.
  const stick = useRef(true);
  const grab = useRef(false);
  const release = () => { stick.current = false; setAway(true); };
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (gap < 4) { stick.current = true; setAway(false); }
    else if (grab.current && stick.current) release();
    else if (!stick.current) setAway(gap > 80);
  };
  const gestures = { onWheel: (e: RWheel<HTMLDivElement>) => { if (e.deltaY < 0) release(); },
    onKeyDown: (e: RKey<HTMLDivElement>) => { if (["ArrowUp", "PageUp", "Home"].includes(e.key)) release(); },
    onTouchStart: () => { grab.current = true; }, onTouchEnd: () => { grab.current = false; },
    onPointerDown: (e: RPointer<HTMLDivElement>) => { if (e.target === e.currentTarget && e.clientX > e.currentTarget.getBoundingClientRect().left + e.currentTarget.clientWidth) { grab.current = true; window.addEventListener("pointerup", () => { grab.current = false; }, { once: true }); } } };
  const jump = () => {
    stick.current = true; setAway(false);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };
  useEffect(() => { const el = colRef.current?.parentElement; if (stick.current && el) el.scrollTop = el.scrollHeight; }, [conv.turns]);
  // content also grows between updates (text revealed at an even pace, folds opening): keep following it
  const colRef = useRef<HTMLDivElement>(null);
  const hasTurns = conv.turns.length > 0;
  useEffect(() => {
    const col = colRef.current, el = col?.parentElement;
    if (!col || !el) return;
    const ro = new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight; });
    ro.observe(col);
    return () => ro.disconnect();
  }, [hasTurns, conv.id]);

  useEffect(() => api().onChat((ev: ChatEvent) => {
    if (ev.id !== chatId.current) return;
    const id = convRef.current.id;
    if (ev.type === "title") { onTurns(id, (t) => t, ev.text, true); return; }
    if (ev.type === "memo") {
      const last = convRef.current.turns.filter((t) => !t.error && t.content)[ev.turns - 1];
      if (last) onMemo(id, { text: ev.text, turns: ev.turns, hash: hashText(last.content), at: Date.now() });
      return;
    }
    onTurns(id, (prev) => {
      const next = [...prev];
      const last = { ...next[next.length - 1] };
      if (ev.type === "thinking") last.thinking = (last.thinking ?? "") + ev.text;
      else if (ev.type === "answer") { last.content += ev.text; }
      else if (ev.type === "retract") last.content = last.content.slice(0, ev.keep);
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
    if (ev.type === "retract") answerBuf.current = answerBuf.current.slice(0, ev.keep);
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
      const prose = parseSegments(stripSubagents(answerBuf.current)).map((x) => (x.t === "text" ? x.v : " ")).join("").replace(/<[^>\n]{0,200}$/, ""); // a tag still being written is not text yet
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
      saveArtifacts(); if (speak.current) vc.endAnswer(); setBusy(false); chatId.current = null; setAnnounce(stoppedRef.current ? "Stopped" : "Answer finished");
      const r = skillRun.current;
      if (r && r.started && !stoppedRef.current && r.step < r.skill.steps.length - 1) setAutoNext((n) => n + 1);
      else if (r && r.started) { skillRun.current = null; setSkillChip(null); }
    }
    if (ev.type === "error") { vc.cancelSpeech(); setBusy(false); chatId.current = null; setAnnounce("Something went wrong"); skillRun.current = null; setSkillChip(null); }
  }), [onTurns, onMemo, onArtifact, vc]);

  /** The summary of this chat's oldest turns, when it still matches them. */
  const memoOf = (turns: Turn[] = convRef.current.turns): Memo | null => usableMemo(turns.filter((t) => !t.error && t.content), convRef.current.memo);

  /** The messages the next request starts from: system prompt, the chat (visible answers only, never the thoughts) and the draft. */
  const historyFor = (text: string, sent: Attachment[], limitTokens: number, turns: Turn[] = convRef.current.turns, voice: VisualNeeds | null = null, auto: Skill | null = null): ChatMessage[] => {
    const spoken = !!voice;
    const budget = knowledgeBudget(limitTokens);
    const sys = buildSystemPrompt({ custom: composeInstructions(settings, limit), project, extra: [auto ? autoSkillPrompt(auto) : "", skillRun.current?.started || (skillRun.current && !voice) ? stepPrompt(skillRun.current.skill, skillRun.current.step) : "", voice ? [SPOKEN_STYLE, voice.chart || voice.diagram || voice.picture ? VISUAL_STYLE : "", voice.picture && !settings.wikimediaImages ? "Pictures are not available." : "", voice.closing ? "The person asked to close the chart or picture on the screen: it is closed. Say so in a few words and do not make a new one." : "", voice.chart ? CHART_INSTRUCTIONS : "", voice.diagram ? DIAGRAM_INSTRUCTIONS : ""].filter(Boolean).join(" ") : ""].filter(Boolean).join("\n\n"), knowledgeChars: budget, artifacts: needsTools(text, turns.some((t) => t.role === "assistant" && /<artifact/.test(t.content))), visual: voice ? null : routeVisual(text, { hasFiles: turns.some((t) => t.role === "assistant" && /<artifact/.test(t.content)) }) });
    // the turns a summary stands for are replaced by it (and by the files written in them); the latest turns are sent word for word
    const visible = turns.filter((t) => !t.error && t.content);
    const memo = memoOf(turns);
    const asMessages = visible.map((t, i, all) => (t.role === "user"
      ? { role: "user" as const, content: userContent(t.content, t.attachments ?? [], budget) }
      : { role: "assistant" as const, content: (() => {
        const text = t.interrupted ? (t.heardWords !== undefined ? markInterruption(stripSubagents(t.content), t.heardWords, spokenProse(t.content)) : `${stripSubagents(t.content).replace(/ …$/, "")} [The user interrupted here: the rest of the answer was not said.]`) : stripSubagents(t.content);
        // in a voice chat only the latest chart or picture is kept whole (it may be changed); older ones are a note
        return spoken && i < all.length - 1 && all.slice(i + 1).some((x) => x.role === "assistant") ? compactVisuals(text) : text;
      })() }));
    const older = memo ? foldHead(asMessages.slice(0, memo.turns), asMessages.slice(memo.turns), memo.text) : [];
    return [
      ...(sys ? [{ role: "system" as const, content: sys }] : []),
      ...older,
      ...(memo ? asMessages.slice(memo.turns) : asMessages),
      { role: "user" as const, content: userContent(text, sent, budget) }
    ];
  };

  /** `redo`: edit or retry: start again from `base` (the turns before the one being redone) instead of the end of the chat. */
  const send = async (raw: string, fromVoice = false, redo?: { base: Turn[]; files: Attachment[] }) => {
    stick.current = true;
    const text = raw.trim();
    const sent = redo ? redo.files : files;
    if ((!text && !sent.length) || busy || !selected) return;
    if (skillRun.current) skillRun.current.started = true;
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
    const spoken = (fromVoice || vstate !== "idle" || vsRef.current.readAloud) && ttsReady;
    // a voice conversation talks with the model chosen for it (fast and small by default), the typed chat with the selected one
    const target = fromVoice ? pickVoiceItem(items, vsRef.current.voiceModelId, selected) ?? selected : selected;
    // "vire le graphique": it is closed now, and the model only confirms in a few words (it is not given the chart instructions, so it does not draw another)
    const shown = prev?.role === "assistant" ? visualsOf(prev.content) : "";
    const closing = !!shown && fromVoice && wantsCloseVisual(ask);
    if (closing) setHiddenVisuals(shown);
    const voice: VisualNeeds | null = spoken ? (closing ? { chart: false, diagram: false, picture: false, closing: true } : visualNeeds(ask, prev?.role === "assistant" ? prev.content : "")) : null;
    // an installed skill that fits the request is loaded by itself (not in a voice chat, not when one was chosen with /)
    const auto = !voice && !resume && !skillRun.current ? autoSkill(skills, ask, base.some((t) => t.role === "assistant" && /<artifact/.test(t.content))) : null;
    const history = historyFor(ask, sent, target.verdict.contextTokens || 4096, base, voice, auto);
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
    else onTurns(c.id, () => [...base, { role: "user", content: text, attachments: sent.length ? sent : undefined }, { role: "assistant", content: "", pending: true, modelName: target.entry.name, notices: auto ? [`Loaded skill: ${auto.name}`] : undefined }], base.length === 0 ? titleFrom(text || sent[0]?.name || "") : undefined);
    if (!redo) { setInput(""); saveDraft(c.id, ""); setFiles([]); }
    setBusy(true);
    focusSoon();
    await api().chat(id, target.entry.id, history, { images: voice ? voice.picture : undefined, effort: fromVoice ? "off" : effort, subagents, title: !resume && base.length === 0, projectId: project?.id ?? null, memoTurns: memoOf(base)?.turns ?? 0 });
  };
  const sendRef = useRef(send);
  sendRef.current = send;
  // skills: chosen with "/", their steps run one after the other (hooks stay above every early return)
  const skills = useMemo(() => allSkills(settings.skills, settings.removedSkills), [settings.skills, settings.removedSkills]);
  const skillRun = useRef<{ skill: Skill; step: number; started: boolean } | null>(null);
  const [skillChip, setSkillChip] = useState<Skill | null>(null);
  const [autoNext, setAutoNext] = useState(0);
  const [slashAt, setSlashAt] = useState(0);
  useEffect(() => {
    const r = skillRun.current;
    if (!autoNext || !r || busy) return;
    r.step++;
    void sendRef.current(`Next step: ${r.skill.steps[r.step].title}.`);
  }, [autoNext]); // eslint-disable-line react-hooks/exhaustive-deps
  const endSkill = () => { skillRun.current = null; setSkillChip(null); };
  const pickSkill = (s: Skill) => {
    setInput(""); saveDraft(convRef.current.id, "");
    skillRun.current = { skill: s, step: 0, started: false };
    setSkillChip(s); setSlashAt(0);
    if (settings.skillAutoModel === false) return;
    const best = s.models.map((id) => items.find((i) => i.entry.id === id && i.installed)).find(Boolean);
    if (best && best.entry.id !== selected?.entry.id) onSelectModel(best.entry.id);
    else if (!best && s.models.length) setNotice(`This skill works best with ${s.models.map((id) => items.find((i) => i.entry.id === id)?.entry.name ?? id).join(" or ")}, which is not installed. Your current model is used.`);
  };
  // a message typed on a project page: sent once in the chat that was opened for it
  useEffect(() => {
    if (!props.startText || busy || !selected) return;
    const text = props.startText;
    props.onStarted?.();
    void sendRef.current(text);
  }, [props.startText, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  /** The person spoke over the answer: it is stopped and kept as far as it was said aloud, so the next message is answered from what they actually heard. */
  interruptRef.current = (spoken) => {
    const id = chatId.current;
    if (!id) return;
    chatId.current = null;
    stoppedRef.current = true;
    void api().abortChat(id);
    setBusy(false);
    onTurns(convRef.current.id, (t) => {
      const last = t[t.length - 1];
      if (!last || last.role !== "assistant") return t;
      if (!spoken) return t.slice(0, -1); // nothing was said yet: there is no answer to keep
      const kept: Turn = { ...last, pending: false, interrupted: true, heardWords: wordCount(spoken), stopped: true };
      settle(kept);
      return [...t.slice(0, -1), kept];
    });
  };

  /** A message typed during a voice conversation: it stops the voice if it is talking, then goes like a spoken one (answered aloud). */
  const sendTyped = () => {
    const text = inputRef.current.trim();
    if (!text) return;
    if (busy || vstate === "speaking" || vstate === "thinking") interruptRef.current(vc.interruptNow());
    setTimeout(() => void sendRef.current(text, true), 80);
  };

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
        } else if (classifyFile(f.name, f.type) === "document") {
          added.push({ name: f.name, kind: "text", size: f.size, text: await (await import("./docs")).readDocument(f) });
        } else if (classifyFile(f.name, f.type) === "image") {
          const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
          added.push({ name: f.name, kind: "image", size: f.size, dataUrl });
        } else added.push({ name: f.name, kind: "text", size: f.size, text: await f.text() });
      } catch (e) { problems.push(classifyFile(f.name, f.type) === "document" ? (e as Error).message : `${f.name}: could not be read.`); }
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

  const runDictation = async () => {
    signal.current = { stopped: false };
    sendAfterDictation.current = false;
    setDictating(true);
    taRef.current?.focus();
    try {
      await api().voiceApply();
      await dictate({
        level: (l) => setLevel(Math.round(l * 20) / 20), live: setLive,
        // added at the end of what is in the box now, whatever was typed or corrected by hand meanwhile; a caret placed in the middle stays there
        commit: (text) => {
          const el = taRef.current;
          const sel = el && document.activeElement === el && el.selectionStart < el.value.length ? [el.selectionStart, el.selectionEnd] : null;
          setInput((v) => { const n = (v ? v.replace(/\s+$/, "") + " " : "") + text; inputRef.current = n; saveDraft(convRef.current.id, n); return n; });
          if (sel) requestAnimationFrame(() => el!.setSelectionRange(sel[0], sel[1]));
        }
      }, () => vsRef.current, signal.current);
    } catch (e) { setNotice((e as Error).message); }
    setDictating(false);
    setLevel(0);
    setLive(null);
    taRef.current?.focus();
    // a second Enter pressed while the last words were still being transcribed: the text has landed, now it is sent
    if (sendAfterDictation.current) { sendAfterDictation.current = false; void sendRef.current(inputRef.current); }
  };

  /** Enter or the voice button while dictating: the dictation ends and its text stays in the box to be read or corrected; the next Enter sends. */
  const endDictation = () => {
    if (signal.current.stopped) sendAfterDictation.current = true; // already ending: send as soon as it has
    signal.current.stopped = true;
  };

  const toggleDictation = async () => {
    setNotice(null);
    if (dictating) { signal.current.stopped = true; return; }
    if (!sttReady) { setVoiceSetup({ kinds: ["stt"], then: "dictate" }); return; }
    await runDictation();
  };

  const runVoice = async () => {
    try {
      setVoiceOn(true);
      await api().voiceApply();
      await vc.start();
    } catch (e) {
      setVoiceErr((e as Error).message || "Could not open the microphone.");
    }
  };

  const startVoice = async () => {
    setVoiceErr(null); setHeard(""); setLive(null); setCaption(""); setMicMuted(false); setHiddenVisuals("");
    if (!selected) { onPickModel(); return; }
    const kinds = [...(sttReady ? [] : ["stt" as const]), ...(ttsReady ? [] : ["tts" as const])];
    const pack = await missingVoicePack();
    if (kinds.length || pack) { setVoiceSetup({ kinds, then: "voice", pack }); return; }
    await runVoice();
  };
  /** The voice chat model (Qwen3.5-2B, from the Dynamic packs) when it is not installed and the voice chat would use the automatic model: proposed once, with the speech models. */
  const missingVoicePack = async (): Promise<VoicePack | null> => {
    if (vsRef.current.voiceModelId !== "" || packDeclined.current || preferredVoiceModel(items)) return null;
    try {
      const i = await api().dynamicInfo();
      const packs = [i.data.packs[i.profile], ...Object.values(i.data.packs)].filter(Boolean);
      for (const pack of packs) {
        const m = packParts(pack).find((x) => /qwen3\.5-2b/i.test(x.name));
        if (m) return i.installedRefs.includes(m.ref) ? null : { packId: pack.id, ref: m.ref, name: m.name, sizeGB: m.sizeGB };
      }
    } catch { /* the proposal is only a convenience */ }
    return null;
  };
  /** The models are there: what was asked for starts, without a second click. */
  const voiceSetupDone = (declinedPack = false) => {
    const then = voiceSetup?.then;
    if (declinedPack) packDeclined.current = true;
    setVoiceSetup(null);
    onCatalogChanged();
    void onSettings({});
    if (then === "dictate") void runDictation(); else if (then === "voice") void runVoice();
  };
  const endVoice = () => { vc.setMuted(false); setMicMuted(false); vc.stop(); setVoiceOn(false); if (chatId.current) void api().abortChat(chatId.current); };

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
        <LogoMark className="logo-mark" />
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
  const sysText = buildSystemPrompt({ custom: composeInstructions(settings, limit), project, knowledgeChars: knowledgeBudget(limit), artifacts: needsTools(input, projectFilesNow.length > 0), visual: routeVisual(input, { hasFiles: projectFilesNow.length > 0 }) });
  const liveTurns = conv.turns.filter((t) => !t.error && t.content);
  const memoCur = usableMemo(liveTurns, conv.memo);
  const compactNow = async () => {
    if (compacting || busy || !selected) return;
    setCompacting(true);
    setNotice(null);
    try {
      const r = await api().compactChat(crypto.randomUUID(), selected.entry.id, historyFor("", [], limit), memoOf()?.turns ?? 0);
      if ("error" in r) setNotice(`The earlier messages could not be summarized: ${r.error}`);
      else {
        const last = convRef.current.turns.filter((t) => !t.error && t.content)[r.turns - 1];
        if (last) { onMemo(conv.id, { text: r.text, turns: r.turns, hash: hashText(last.content), at: Date.now() }); setNotice(null); }
      }
    } finally { setCompacting(false); }
  };
  const use = contextUse({
    memoTokens: memoCur ? tokensOf(memoCur.text) + 60 : 0,
    // the same fixed part the request carries (sub-agent rules, web search, folder), so the ring, the bar and the percentage agree
    systemChars: sysText.length + Math.ceil(extra * 3.5),
    turns: stubHistory((memoCur ? liveTurns.slice(memoCur.turns) : liveTurns).map((t) => ({ role: t.role, content: t.role === "assistant" ? stripSubagents(t.content) : t.content }))).map((m, i) => ({ role: m.role === "assistant" ? "assistant" as const : "user" as const, content: typeof m.content === "string" ? m.content : "", attachments: (memoCur ? liveTurns.slice(memoCur.turns) : liveTurns)[i]?.attachments })),
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
            {memoCur && (
              <details className="small ctx-memo">
                <summary>{memoCur.turns} earlier message{memoCur.turns === 1 ? " is" : "s are"} kept as a summary the model reads</summary>
                <div className="muted ctx-memo-text">{memoCur.text}</div>
              </details>
            )}
            <button type="button" className="ctx-compact" disabled={busy || compacting || liveTurns.length < 3} onClick={() => void compactNow()} title="Fold the earliest messages into a summary the model keeps reading, to free space in the window">{compacting ? "Compacting…" : "Compact"}{liveTurns.length < 3 ? " (nothing to compact yet)" : ""}</button>
            <p className="small muted ctx-note">{req.fitted ? `${req.notes.join(" ")} ` : ""}{req.level === "ok" ? "The next request, as it would be sent; the rest of the window is kept for the answer." : "Getting full: the earliest messages are summarized automatically before the window is full, and the model keeps reading the summary."}{projectFilesNow.length > 0 ? " The files of this chat are written and changed in sessions of their own, each with its own window, so here they count for one line each." : ""}</p>
          </div>
        </>
      )}
    </div>
  );

  const slash = /^\/(\S*)$/.exec(input);
  const slashList = slash && !busy ? (slash[1].toLowerCase() === "skills" ? skills : matchSkills(skills, slash[1])).slice(0, 8) : [];
  const composer = (
    <div className="composer-stack">
    {slashList.length > 0 && (
      <div className="slash-menu" role="listbox" aria-label="Skills">
        {slashList.map((sk, i) => (
          <button key={sk.id} type="button" role="option" aria-selected={i === slashAt} className={`slash-item ${i === slashAt ? "on" : ""}`} onMouseEnter={() => setSlashAt(i)} onClick={() => pickSkill(sk)}>
            <span className="slash-name">/{sk.name}</span>
            <span className="muted small">{sk.description}</span>
          </button>
        ))}
      </div>
    )}
    {voiceOn ? <VoiceBar text={input} onText={setDraft} onSend={sendTyped} voice={voiceSettings} onSaveVoice={(p) => api().saveVoice(p).then(() => onSettings({}))} options={{ auto: fastVoiceModel(items, sizeOfChatModel(selected))?.entry.name.replace(/\s*\(Foundry Local\)/i, "") ?? "", made: voiceMenuItems(items).map((i) => ({ id: i.entry.id, name: i.entry.name.replace(/\s*\(Foundry Local\)/i, "") })), others: otherVoiceItems(items).map((i) => ({ id: i.entry.id, name: i.entry.name })) }} modelSetting={voiceSettings.voiceModelId} onModel={(id) => { void api().saveVoice({ voiceModelId: id }).then(() => onSettings({})); }} micId={voiceSettings.micDeviceId} onMic={(id) => { void vc.switchMic(id).catch((e) => setVoiceErr((e as Error).message)); void api().saveVoice({ micDeviceId: id }).then(() => onSettings({})); }} state={vstate} level={level} live={live} error={voiceErr} muted={micMuted} onMute={() => { vc.setMuted(!vc.muted); setMicMuted(vc.muted); }} onEnd={endVoice} /> : <form
      className={`composer ${dropping ? "drop" : ""} ${dictating ? "dictating" : ""}`} style={dictating ? { ["--lvl" as any]: String(Math.min(1, level * 1.6)) } : undefined} onSubmit={(e) => { e.preventDefault(); if (dictating) endDictation(); else void send(input); }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => { setDropping(false); if (e.dataTransfer.files.length) { e.preventDefault(); void addFiles(e.dataTransfer.files); } }}
    >
      <AttachChips items={files} onRemove={(i) => setFiles((v) => v.filter((_, k) => k !== i))} />
      {skillChip && <div className="skill-chip"><span>Skill: {skillChip.name} · {skillChip.steps.length} {skillChip.steps.length === 1 ? "step" : "steps"}</span><button type="button" className="icon" aria-label="Cancel the skill" title="Cancel the skill" onClick={endSkill}>×</button></div>}
      {dictating && <LiveWords text={live} className="composer" />}
      <textarea
        ref={taRef} value={input} rows={empty ? 3 : 2} placeholder={dictating ? "Listening… you can type too. Enter ends the dictation, Enter again sends" : empty ? "How can I help you today?" : "Reply…"}
        onChange={(e) => setDraft(e.target.value)} title="Enter to send, Shift+Enter for a new line, Esc to stop, ↑ to edit your last message" aria-label="Message"
        onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void addFiles(e.clipboardData.files); } }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (slashList.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setSlashAt((slashAt + 1) % slashList.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setSlashAt((slashAt + slashList.length - 1) % slashList.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickSkill(slashList[Math.min(slashAt, slashList.length - 1)]); return; }
            if (e.key === "Escape") { e.preventDefault(); setDraft(""); return; }
          }
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (dictating) endDictation(); else void send(input); }
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
        {busy
          ? <button type="button" className="send stop" onClick={() => void stop()} aria-label="Stop" title="Stop (Esc)"><Icon d={ICONS.stop} size={14} fill /></button>
          : input.trim() || files.length
            ? <button className="send" aria-label="Send" title="Send (Enter)"><Icon d={ICONS.up} size={18} /></button>
            : <button type="button" className="send" onClick={() => void startVoice()} aria-label="Voice chat" title="Voice chat"><WaveIcon /></button>}
      </div>
    </form>}
      <div className="composer-meta">
        <div className="menu-anchor">
          <button type="button" className="chip" onClick={() => setMenuOpen((v) => !v)} title="Model, thinking and sub-agents" aria-haspopup="menu" aria-expanded={menuOpen}>
            {selected.entry.name}{selected.verdict.level !== "green" && <> <span className={`dot ${selected.verdict.level}`} /></>}
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
        <div className="spacer" />
        {ring}
      </div>
    </div>
  );

  /** The person typed in a file of an answer: the answer's text changes, so the model reads the new version from here on. */
  const editArtifact = (turn: number, index: number, a: { title: string; kind: Artifact["kind"]; language: string }, content: string) => {
    onTurns(conv.id, (prev) => prev.map((t, i) => (i === turn ? { ...t, content: replaceArtifact(t.content, index, content) } : t)));
    const now = Date.now();
    onArtifact({ id: `${conv.id}:${turn}:${index}`, title: a.title, kind: a.kind, language: a.language, content, projectId: conv.projectId ?? null, source: { type: "chat", conversationId: conv.id }, created: now, updated: now });
  };
  const viewed = viewing ? conv.turns[viewing.turn] : undefined;
  const viewedSeg = viewed ? parseSegments(stripSubagents(viewed.content)).find((x) => x.t === "artifact" && x.index === viewing!.index) : undefined;
  const panel = viewedSeg && viewedSeg.t === "artifact" ? (
    <ArtifactViewer
      key={`${viewing!.turn}:${viewing!.index}`} artifact={viewedSeg} live={viewedSeg.open && !!viewed?.pending} files={projectFiles}
      onClose={() => setViewing(null)} onExport={() => onExportArtifact(`${conv.id}:${viewing!.turn}:${viewing!.index}`)}
      onEdit={busy ? undefined : (content) => editArtifact(viewing!.turn, viewing!.index, viewedSeg, content)}
    />
  ) : null;

  return (
    <div className="chat-split">
    <div className="chat">
      {project && (
        <div className="chat-head"><button className="linkbtn" onClick={() => onOpenProject(project.id)}>{project.name}</button><span className="muted small">/ {conv.title}</span></div>
      )}
      {voiceSetup && <VoiceSetup kinds={voiceSetup.kinds} pack={voiceSetup.pack ?? null} onDone={voiceSetupDone} onCancel={() => setVoiceSetup(null)} onSettings={() => { setVoiceSetup(null); onOpenSettings(); }} />}
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>
      {empty ? (
        <div className="welcome">
          <div className="greet"><LogoMark className="logo-mark" /><h1>{greeting()}</h1></div>
          {composer}
          {notice && <div className="composer-notice">{notice}</div>}
          <StarterChips gone={!!(input.trim() || files.length)} onPick={(p) => { setDraft(p); focusSoon(); }} />
        </div>
      ) : (
        <>
          <div className="messages" tabIndex={-1} onScroll={onScroll} {...gestures}>
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
                      <TurnWork t={t} files={conv.turns[i - 1]?.role === "user" ? (conv.turns[i - 1].attachments ?? []).map((a) => a.name) : []} />
                      {hideEdits(stripSubagents(t.content)) && (voiceOn && i === conv.turns.length - 1 && !hasArtifact(t.content) && !hasRichFormat(t.content)
                        ? <><VoiceReading text={spokenProse(t.content)} read={t.interrupted && t.heardWords !== undefined ? t.heardWords : t.pending || vstate === "speaking" ? wordCount(caption) : Infinity} />{voiceVisuals && <div className="voice-visuals"><button type="button" className="visual-close" onClick={() => setHiddenVisuals(shownVisuals)} aria-label="Hide the chart or picture">✕ Hide</button><Markdown text={voiceVisuals} streaming={!!t.pending} /></div>}</>
                        : <AssistantBody text={hideEdits(stripSubagents(t.content))} live={!!t.pending} openIndex={viewing?.turn === i ? viewing.index : null} onOpen={(idx) => { picked.current = true; setViewing({ turn: i, index: idx }); }} />)}
                      {t.pending && !hideEdits(stripSubagents(t.content)) && !t.thinking && !t.agents?.some((a) => a.status === "running") && !(t.review?.status === "running") && !(t.loop?.status === "running") && !(t.build?.status === "running") && !workOf(t) && (
                        cleaning ? <LoadingLine tag="clean" label={cleaning} /> : starting ? <LoadingLine tag="load" label="Loading the model onto the NPU" />
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
