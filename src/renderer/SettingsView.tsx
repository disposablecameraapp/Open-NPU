import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Seg } from "./Seg";
import { DynamicEditor } from "./DynamicEditor";
import { NpuLoadTest } from "./NpuLoadTest";
import { EngineCompare } from "./EngineCompare";
import { Benchmark } from "./Benchmark";
import { CopySupport } from "./CopySupport";
import { isDynamicId } from "../core/dynamic";
import { ICONS, IconButton } from "./Icon";
import { ActivityIcon, AudioIcon, ChipIcon, CodeIcon, CompareIcon, GaugeIcon, GearIcon, GlobeIcon, HelpIcon, LayersIcon, MonitorIcon, RefreshIcon, TerminalIcon } from "./Icons";
import { MicTest } from "./VoiceSetup";
import { VOICE_LIMITS } from "../core/voiceModels";
import { fastVoiceModel } from "../core/voicePick";
import type { AppInfo, CatalogItem, NpuPlanView, UpdateState } from "../shared/api";
import type { HardwareProfile, ServerStatus, Settings, VoiceDownloadProgress, VoiceModelView, VoiceSettings, VoiceStatus } from "../shared/types";

type Cat = "general" | "models" | "update" | "build" | "search" | "voice" | "pc" | "help" | "dev-runtime" | "dev-dynamic" | "dev-npu" | "dev-engines" | "dev-bench";

function Switch({ value, onChange, labels = ["CPU", "NPU"] }: { value: "cpu" | "npu"; onChange: (v: "cpu" | "npu") => void; labels?: [string, string] }) {
  return (
    <Seg role="group">
      <button className={value === "cpu" ? "on" : ""} onClick={() => onChange("cpu")}>{labels[0]}</button>
      <button className={value === "npu" ? "on" : ""} onClick={() => onChange("npu")}>{labels[1]}</button>
    </Seg>
  );
}

function PlanBar({ plan }: { plan: NpuPlanView }) {
  const onNpu = plan.lines.filter((l) => l.onNpu);
  const colors: Record<string, string> = { chat: "var(--accent)", stt: "var(--cat-2)", tts: "var(--cat-4)" };
  return (
    <div className="plan">
      <div className="track plan-track">
        {onNpu.map((l) => <div key={l.role} className="seg-fill" style={{ width: `${Math.min(100, (l.gb / plan.budgetGB) * 100)}%`, background: colors[l.role] }} title={`${l.name}: ${l.gb} GB`} />)}
        <div className="limit" style={{ left: `${Math.min(100, (plan.usableGB / plan.budgetGB) * 100)}%` }} />
      </div>
      <div className="small muted">
        {onNpu.length === 0 ? "Nothing is on the NPU." : onNpu.map((l) => `${l.role === "chat" ? "Chat" : l.role === "stt" ? "Dictation" : "Read-aloud"} ${l.gb} GB`).join(" + ")}
        {" · "}safe limit {plan.usableGB} of {plan.budgetGB} GB
      </div>
      {plan.advice ? <div className="warn small">{plan.advice}</div> : onNpu.length > 1 && <div className="ok small">Everything on the NPU fits together.</div>}
    </div>
  );
}

function VoiceModelList({ kind, models, selected, progress, onSelect, onDownload, onCancel, onRemove }: {
  kind: "stt" | "tts"; models: VoiceModelView[]; selected: string | null; progress: Record<string, VoiceDownloadProgress>;
  onSelect: (id: string) => void; onDownload: (id: string) => void; onCancel: (id: string) => void; onRemove: (id: string) => void;
}) {
  return (
    <div className="list">
      {models.filter((m) => m.model.kind === kind).map(({ model, installed }) => {
        const p = progress[model.id];
        const busy = p && (p.phase === "downloading" || p.phase === "extracting");
        return (
          <div key={model.id} className={`row-item ${selected === model.id ? "sel" : ""}`}>
            <label className="grow">
              <input type="radio" name={`v-${kind}`} disabled={!installed} checked={selected === model.id} onChange={() => onSelect(model.id)} />
              <span> {model.name}{model.default && <span className="tag">default</span>}{model.device === "NPU" && <span className="tag">NPU</span>}</span>
              <div className="muted small">{model.languages} · ~{model.sizeMB} MB · {model.note}</div>
              {p?.error && <div className="error-box"><strong>{p.error.title}</strong><div>{p.error.fix}</div></div>}
            </label>
            {busy ? (
              <div className="install-progress">
                <div className="track"><div className="fill" style={{ width: `${p.percent ?? 100}%` }} /></div>
                <span className="small muted">{p.phase === "extracting" ? "Unpacking…" : `${p.percent ?? 0}%`}</span>
                <IconButton d={ICONS.close} label="Cancel" onClick={() => onCancel(model.id)} />
              </div>
            ) : installed ? <IconButton d={ICONS.trash} label="Remove" onClick={() => onRemove(model.id)} />
              : <IconButton className="accent" d={ICONS.download} label="Download" onClick={() => onDownload(model.id)} />}
          </div>
        );
      })}
    </div>
  );
}

export function SettingsView({ settings, hw, info, server, voice, onSave, onSaveVoice, onRedetect }: {
  settings: Settings; hw: HardwareProfile; info: AppInfo; server: ServerStatus | null; voice: VoiceStatus | null;
  onSave: (p: Partial<Settings>) => Promise<void>; onSaveVoice: (p: Partial<VoiceSettings>) => Promise<void>; onRedetect: () => Promise<void>;
}) {
  const v = settings.voice;
  const [tab, setTab] = useState<Cat>("general");
  const [budget, setBudget] = useState(settings.npuBudgetOverrideGB?.toString() ?? "");
  const [log, setLog] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [plan, setPlan] = useState<NpuPlanView | null>(null);
  const [models, setModels] = useState<VoiceModelView[]>([]);
  const [installed, setInstalled] = useState<CatalogItem[]>([]);
  const [progress, setProgress] = useState<Record<string, VoiceDownloadProgress>>({});

  const refreshPlan = useCallback(async () => setPlan(await api().npuPlan()), []);
  const refreshModels = useCallback(async () => setModels(await api().voiceModels()), []);

  useEffect(() => { void api().serverLog().then(setLog); }, [server?.state]);
  useEffect(() => { void refreshModels(); }, [refreshModels]);
  useEffect(() => { void api().catalog().then((c) => setInstalled(c.filter((i) => i.installed && !i.hidden && !isDynamicId(i.entry.id)))); }, []);
  useEffect(() => { void refreshPlan(); }, [refreshPlan, settings.compute, settings.selectedModelId, v.sttCompute, v.ttsCompute, v.sttModelId, v.ttsModelId, settings.npuBudgetOverrideGB]);
  useEffect(() => api().onVoiceDownload(async (p) => {
    setProgress((s) => ({ ...s, [p.id]: p }));
    if (p.phase === "done") {
      await refreshModels();
      // first download of a kind becomes the selection
      const m = (await api().voiceModels()).find((x) => x.model.id === p.id)?.model;
      if (m) {
        const cur = (await api().settings()).voice;
        if (m.kind === "stt" && !cur.sttModelId) await onSaveVoice({ sttModelId: m.id });
        if (m.kind === "tts" && !cur.ttsModelId) await onSaveVoice({ ttsModelId: m.id });
      }
    }
  }), [refreshModels, onSaveVoice]);

  const ttsModel = models.find((m) => m.model.id === v.ttsModelId)?.model;
  const endpoint = server?.endpoint ?? "http://127.0.0.1:18181/v1";

  const chatCompute: "cpu" | "npu" = settings.compute === "cpu" ? "cpu" : "npu";

  const cats: { id: Cat; label: string; hint: string }[] = [
    { id: "general", label: "General", hint: "Closing the window" },
    { id: "models", label: "Models and NPU", hint: "Where each model runs" },
    { id: "build", label: "Building files", hint: "Who writes what, code check" },
    { id: "search", label: "Web search", hint: "Engine and search model" },
    { id: "voice", label: "Voice", hint: "Dictation, read-aloud" },
    { id: "pc", label: "This PC", hint: "Hardware and NPU memory" },
    { id: "update", label: "Updates", hint: "Version, check, force an update" },
    { id: "help", label: "Help", hint: "Bug reports, developer mode" }
  ];
  const devCats: { id: Cat; label: string; hint: string }[] = [
    { id: "dev-runtime", label: "Runtime and logs", hint: "GenieX, endpoint, errors" },
    { id: "dev-dynamic", label: "Dynamic model", hint: "Pack editor" },
    { id: "dev-npu", label: "NPU load test", hint: "Find what the NPU accepts" },
    { id: "dev-engines", label: "Engines", hint: "GenieX and Foundry Local" },
    { id: "dev-bench", label: "Benchmark", hint: "Test the models" }
  ];
  const NAV_ICONS: Record<Cat, () => React.ReactElement> = { "general": GearIcon, "models": ChipIcon, "build": CodeIcon, "search": GlobeIcon, "voice": AudioIcon, "pc": MonitorIcon, "update": RefreshIcon, "help": HelpIcon, "dev-runtime": TerminalIcon, "dev-dynamic": LayersIcon, "dev-npu": ActivityIcon, "dev-engines": CompareIcon, "dev-bench": GaugeIcon };
  const NavButton = ({ c }: { c: { id: Cat; label: string; hint: string } }) => (
    <button type="button" className={`set-nav-item ${tab === c.id ? "on" : ""}`} onClick={() => setTab(c.id)} aria-current={tab === c.id ? "page" : undefined}>
      <span className="set-ico">{NAV_ICONS[c.id]()}</span>
      <span className="set-txt"><span>{c.label}</span><span className="muted small">{c.hint}</span></span>
    </button>
  );

  return (
    <div className="page">
      <h1>Settings</h1>
      <div className="set-layout">
        <nav className="set-nav" aria-label="Settings categories">
          {cats.map((c) => <NavButton key={c.id} c={c} />)}
          {settings.developer && <div className="set-nav-dev"><div className="set-nav-group"><TerminalIcon /> Developer</div>{devCats.map((c) => <NavButton key={c.id} c={c} />)}</div>}
        </nav>
        <div className="set-body">
{tab === "general" && <>
      <section>
        <h2>Closing the window</h2>
        <label className="check"><input type="radio" name="closeAction" checked={settings.closeAction !== "quit"} onChange={() => void onSave({ closeAction: "tray" })} /> Minimize to the notification area (the app keeps running in the background)</label>
        <label className="check"><input type="radio" name="closeAction" checked={settings.closeAction === "quit"} onChange={() => void onSave({ closeAction: "quit" })} /> Close the app</label>
        <label className="check"><input type="checkbox" checked={!settings.closeNoticeOff} onChange={(e) => void onSave({ closeNoticeOff: !e.target.checked })} /> Tell me the first time the window is closed</label>
      </section>
</>}
{tab === "models" && <>
      <section>
        <h2>Where the chat model runs</h2>
        <p className="muted small">CPU leaves the NPU free; NPU is faster.</p>
        <div className="role-row">
          <div><strong>Chat model</strong><div className="muted small">{settings.selectedModelId ? "Selected in Models" : "none selected"}</div></div>
          <Switch value={chatCompute} onChange={(c) => void onSave({ compute: c })} />
        </div>
        {plan && <PlanBar plan={plan} />}
      </section>

</>}
{tab === "build" && <>
      <section>
        <h2>Which model writes what</h2>
        <p className="muted small">Give each job to the model that is best at it. "Chat model" uses the model you chat with.</p>
        <div className="row">
          {([["plan", "Planning"], ["html", "HTML pages"], ["css", "CSS"], ["js", "JavaScript"]] as const).map(([role, label]) => (
            <label key={role} className="small">{label}
              <select value={settings.writers?.[role] ?? ""} onChange={(e) => { const next = { ...(settings.writers ?? {}) }; if (e.target.value) next[role] = e.target.value; else delete next[role]; void onSave({ writers: next }); }}>
                <option value="">Chat model</option>
                {installed.map((i) => <option key={i.entry.id} value={i.entry.id}>{i.entry.name} ({i.entry.sizeGB} GB)</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="muted small">Files are written page, stylesheet, script; each model must fit the NPU memory on its own.</div>
      </section>
      <section>
        <h2>Code check</h2>
        <p className="muted small">Written pages and scripts are run and fixed before you see them.</p>
        <label className="check"><input type="checkbox" checked={settings.autoCheck} onChange={(e) => void onSave({ autoCheck: e.target.checked })} /> Run and check the code the model writes</label>
        <div className="row">
          <label className="small">Review model
            <select disabled={!settings.autoCheck} value={settings.reviewerModelId ?? ""} onChange={(e) => void onSave({ reviewerModelId: e.target.value || null })}>
              <option value="">None: the writing model fixes its own errors</option>
              {installed.map((i) => <option key={i.entry.id} value={i.entry.id}>{i.entry.name} ({i.entry.sizeGB} GB)</option>)}
            </select>
          </label>
          <label className="small">Fix rounds at most
            <select disabled={!settings.autoCheck} value={settings.reviewRounds} onChange={(e) => void onSave({ reviewRounds: parseInt(e.target.value, 10) })}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="muted small">A bigger model fixes the code after it is written. Pick one that fits the NPU memory on its own.</div>
      </section>
</>}
{tab === "search" && <>
      <section>
        <h2>Web search</h2>
        <p className="muted small">Turn it on from the sliders button next to the model name.</p>
        <div className="row">
          <label className="small">Search engine
            <select value={settings.searchProvider} onChange={(e) => void onSave({ searchProvider: e.target.value as Settings["searchProvider"] })}>
              <option value="duckduckgo">DuckDuckGo (no key; it can limit automatic searches)</option>
              <option value="brave">Brave Search (API key, free tier)</option>
              <option value="searxng">SearXNG (your own instance)</option>
            </select>
          </label>
          {settings.searchProvider === "brave" && <label className="small">Brave API key<input type="password" value={settings.braveKey} onChange={(e) => void onSave({ braveKey: e.target.value })} placeholder="BSA…" /></label>}
          {settings.searchProvider === "searxng" && <label className="small">SearXNG address<input value={settings.searxngUrl} onChange={(e) => void onSave({ searxngUrl: e.target.value })} placeholder="http://localhost:8080 (json format enabled)" /></label>}
        </div>
        <div className="row">
          <label className="small">Search model (optional)
            <select value={settings.searchModelId ?? ""} onChange={(e) => void onSave({ searchModelId: e.target.value || null })}>
              <option value="">None: the writing model reads the pages</option>
              {installed.map((i) => <option key={i.entry.id} value={i.entry.id}>{i.entry.name} ({i.entry.sizeGB} GB)</option>)}
            </select>
          </label>
        </div>
        <div className="muted small">A search model summarises the pages for the writing model. The Brave key stays on this PC.</div>
      </section>
</>}
{tab === "voice" && <>
      <section>
        <h2>Where voice runs</h2>
        <p className="muted small">CPU leaves the NPU free; NPU is faster. If a voice model fails on the NPU it falls back to the CPU instead of taking the chat server down.</p>
        <div className="role-row">
          <div><strong>Dictation</strong><div className="muted small">{voice?.stt ? `running on ${voice.sttProvider?.toUpperCase()}` : "not loaded"}</div></div>
          <Switch value={v.sttCompute} onChange={(c) => void onSaveVoice({ sttCompute: c })} />
        </div>
        <div className="role-row">
          <div><strong>Read-aloud</strong><div className="muted small">{voice?.tts ? `running on ${voice.ttsProvider?.toUpperCase()}` : "not loaded"}</div></div>
          <Switch value={v.ttsCompute} onChange={(c) => void onSaveVoice({ ttsCompute: c })} />
        </div>
        <div className="muted small">The speech models downloaded here run on the CPU: their runtime has no NPU support, and choosing NPU puts them back on the CPU. To dictate on the NPU, pick a Foundry Local speech model (shown first when Foundry Local is installed).</div>
        {voice?.notice && <div className="warn small">{voice.notice}</div>}
      </section>

      <section>
        <h2>Dictation</h2>
        <VoiceModelList kind="stt" models={models} selected={v.sttModelId} progress={progress}
          onSelect={(id) => void onSaveVoice({ sttModelId: id })}
          onDownload={(id) => void api().voiceDownload(id)} onCancel={(id) => void api().voiceCancelDownload(id)}
          onRemove={async (id) => { await api().voiceRemove(id); await refreshModels(); await onSaveVoice({}); }} />
        <div className="row">
          <label className="small">Language
            <select value={v.sttLanguage} onChange={(e) => void onSaveVoice({ sttLanguage: e.target.value })}>
              <option value="">Auto-detect</option><option value="en">English</option><option value="fr">French</option>
              <option value="es">Spanish</option><option value="de">German</option><option value="it">Italian</option><option value="pt">Portuguese</option>
            </select>
          </label>
        </div>
      </section>

      <section>
        <h2>Read-aloud</h2>
        <VoiceModelList kind="tts" models={models} selected={v.ttsModelId} progress={progress}
          onSelect={(id) => void onSaveVoice({ ttsModelId: id, ttsSid: 0 })}
          onDownload={(id) => void api().voiceDownload(id)} onCancel={(id) => void api().voiceCancelDownload(id)}
          onRemove={async (id) => { await api().voiceRemove(id); await refreshModels(); await onSaveVoice({}); }} />
        <div className="row">
          <label className="small">Voice
            {ttsModel?.voices ? (
              <select value={v.ttsSid} onChange={(e) => void onSaveVoice({ ttsSid: parseInt(e.target.value, 10) })}>
                {ttsModel.voices.map((x) => <option key={x.sid} value={x.sid}>{x.name}</option>)}
              </select>
            ) : (
              <input type="number" min={0} max={(ttsModel?.sidCount ?? 1) - 1} value={v.ttsSid} onChange={(e) => void onSaveVoice({ ttsSid: Math.max(0, parseInt(e.target.value || "0", 10)) })} />
            )}
          </label>
          <label className="small">Speed {v.ttsSpeed.toFixed(1)}×
            <input type="range" min={0.7} max={1.5} step={0.1} value={v.ttsSpeed} onChange={(e) => void onSaveVoice({ ttsSpeed: parseFloat(e.target.value) })} />
          </label>
          <button className="ghost" disabled={!ttsModel} onClick={async () => { await api().voiceApply(); await api().speak(`preview-${Date.now()}`, "Hello! This is how I sound. Bonjour, voici ma voix."); }}>Preview</button>
        </div>
        {ttsModel && !ttsModel.voices && <div className="muted small">Voices are numbered for this model; try a few with Preview.</div>}
      </section>

      <section>
        <h2>Model for voice chat</h2>
        <p className="muted small">A voice conversation needs short answers fast. By default the app uses its best small model that runs wholly on the NPU, so it fits there beside the speech models. Typed chats keep the model you selected.</p>
        <select value={v.voiceModelId} onChange={(e) => void onSaveVoice({ voiceModelId: e.target.value })} aria-label="Model for voice chat">
          <option value="">Fast model (automatic){fastVoiceModel(installed) ? `: ${fastVoiceModel(installed)!.entry.name}` : ": none installed, the conversation's model is used"}</option>
          <option value="chat">The model used in the conversation</option>
          {installed.map((i) => <option key={i.entry.id} value={i.entry.id}>{i.entry.name} · ~{i.entry.sizeGB} GB</option>)}
        </select>
      </section>
      <section>
        <h2>Voice behavior</h2>
        <label className="check"><input type="checkbox" checked={v.readAloud} onChange={(e) => void onSaveVoice({ readAloud: e.target.checked })} /> Read every answer aloud</label>
        <label className="check"><input type="checkbox" checked={v.allowInterrupt} onChange={(e) => void onSaveVoice({ allowInterrupt: e.target.checked })} /> Let me interrupt by speaking: the answer stops and keeps only what was said aloud (use headphones if the speakers echo)</label>
        <label className="check"><input type="checkbox" checked={v.autoSend} onChange={(e) => void onSaveVoice({ autoSend: e.target.checked })} /> Send voice messages as soon as I stop talking</label>
      </section>
      <section>
        <h2>Microphone</h2>
        <p className="muted small">Nothing is transcribed unless the sound is both loud enough and long enough, so a keyboard click or a fan never starts a message.</p>
        <label className="small">Quietest sound that counts: {Math.round((v.minLevel / VOICE_LIMITS.minLevel.max) * 100)}%
          <input type="range" min={VOICE_LIMITS.minLevel.min} max={VOICE_LIMITS.minLevel.max} step={0.001} value={v.minLevel} onChange={(e) => void onSaveVoice({ minLevel: parseFloat(e.target.value) })} />
        </label>
        <label className="small">Loudness needed to interrupt the assistant: {Math.round(v.interruptLevel * 800)}%
          <input type="range" min={VOICE_LIMITS.interruptLevel.min} max={VOICE_LIMITS.interruptLevel.max} step={0.001} value={v.interruptLevel} onChange={(e) => void onSaveVoice({ interruptLevel: parseFloat(e.target.value) })} />
        </label>
        <label className="small">Time spoken without a break to interrupt it: {(v.interruptMs / 1000).toFixed(1)} s
          <input type="range" min={VOICE_LIMITS.interruptMs.min} max={VOICE_LIMITS.interruptMs.max} step={100} value={v.interruptMs} onChange={(e) => void onSaveVoice({ interruptMs: parseInt(e.target.value, 10) })} />
        </label>
        <p className="muted small">An interruption also needs real words in the transcription: a cough, a laugh or a "hmm" never stops the assistant.</p>
        <label className="small">Shortest speech that counts: {v.minSpeechMs} ms
          <input type="range" min={VOICE_LIMITS.minSpeechMs.min} max={VOICE_LIMITS.minSpeechMs.max} step={20} value={v.minSpeechMs} onChange={(e) => void onSaveVoice({ minSpeechMs: parseInt(e.target.value, 10) })} />
        </label>
        <label className="small">Silence that ends a dictated piece: {(v.endSilenceMs / 1000).toFixed(1)} s
          <input type="range" min={VOICE_LIMITS.endSilenceMs.min} max={VOICE_LIMITS.endSilenceMs.max} step={50} value={v.endSilenceMs} onChange={(e) => void onSaveVoice({ endSilenceMs: parseInt(e.target.value, 10) })} />
        </label>
        <label className="small">Wait before answering in voice chat: {(v.waitMs / 1000).toFixed(1)} s{v.smartEnd ? " (a little less after a finished sentence, longer after an open one)" : ""}
          <input type="range" min={VOICE_LIMITS.waitMs.min} max={VOICE_LIMITS.waitMs.max} step={100} value={v.waitMs} onChange={(e) => void onSaveVoice({ waitMs: parseInt(e.target.value, 10) })} />
        </label>
        <label className="check"><input type="checkbox" checked={v.smartEnd} onChange={(e) => void onSaveVoice({ smartEnd: e.target.checked })} /> Adapt that silence to what I said</label>
        <label className="check"><input type="checkbox" checked={v.liveText} onChange={(e) => void onSaveVoice({ liveText: e.target.checked })} /> Show the words as I speak, and correct them as the sentence goes on</label>
        <MicTest voice={v} />
      </section>
</>}
{tab === "pc" && <>
      <section>
        <h2>This machine</h2>
        <table className="kv"><tbody>
          <tr><td>Chip</td><td>{hw.chipName}</td></tr>
          <tr><td>RAM</td><td>{hw.ramGB} GB</td></tr>
          <tr><td>NPU</td><td>{hw.npuDetected ? "Hexagon NPU found" : "Not found"}{hw.npuDriverVersion ? ` · driver ${hw.npuDriverVersion}` : ""}</td></tr>
          <tr><td>NPU memory limit</td><td>{hw.npuBudgetGB} GB <span className="muted">({hw.npuBudgetSource === "estimated" ? "estimated: about half of RAM" : hw.npuBudgetSource === "user" ? "set by you" : "measured"})</span></td></tr>
          <tr><td>App build</td><td>{info.arch}{hw.emulated ? " (emulated: install the ARM64 build)" : " (native)"} · v{info.version}</td></tr>
        </tbody></table>
        <div className="row">
          <label className="small">NPU shared memory (GB), from Task Manager → Performance → NPU → Shared memory
            <input type="number" min="1" step="0.1" value={budget} placeholder={String(hw.npuBudgetGB)} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <button className="ghost" onClick={() => void onSave({ npuBudgetOverrideGB: budget ? parseFloat(budget) : null })}>Save</button>
          <button className="ghost" onClick={() => void onRedetect()}>Re-detect hardware</button>
        </div>
        <div className="muted small">Fit checks size everything from this number. If the estimate is wrong, enter the real one.</div>
      </section>
</>}
{tab === "update" && <>
      <section>
        <h2>Updates</h2>
        <UpdatePanel version={info.version} />
      </section>
</>}
{tab === "help" && <>
      <section>
        <h2>Help and bug reports</h2>
        <CopySupport />
        <div className="muted small">Questions and bug reports: r/opennpu on Reddit, or an issue on GitHub. Paste this text in your message.</div>
      </section>

      <section>
        <h2>Developer settings</h2>
        <label className="check"><input type="checkbox" checked={!!settings.developer} onChange={(e) => { if (!e.target.checked) setTab("help"); void onSave({ developer: e.target.checked }); }} /> Show the Developer tab (GenieX runtime, local endpoint, logs, Dynamic model, benchmark)</label>
      </section>
</>}
{settings.developer && tab === "dev-runtime" && <>
      <section>
        <h2>GenieX runtime</h2>
        <table className="kv"><tbody>
          <tr><td>Location</td><td>{info.geniexPath ?? "not found"}</td></tr>
          <tr><td>Version</td><td>{info.geniexVersion ?? "unknown"}</td></tr>
        </tbody></table>
        {info.geniexVersionWarning && <div className="warn small">{info.geniexVersionWarning}</div>}
        <div className="row">
          <button className="primary" onClick={() => void api().openGeniexDownload()}>{info.geniexPath ? "Reinstall GenieX" : "Install GenieX"}</button>
          <button className="ghost" onClick={async () => { await api().pickGeniex(); await onSave({}); }}>Locate geniex.exe…</button>
        </div>
        <div className="muted small">Open NPU downloads GenieX from Qualcomm on first launch (it is not bundled: its libraries are under Qualcomm's terms) and runs Qualcomm's installer.</div>
        <div className="row">
          <label className="small">Chat compute (advanced)
            <select value={settings.compute} onChange={(e) => void onSave({ compute: e.target.value as Settings["compute"] })}>
              {["npu", "hybrid", "gpu", "cpu"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="small">Keep model loaded (seconds)
            <input type="number" min="0" value={settings.keepaliveSec} onChange={(e) => void onSave({ keepaliveSec: parseInt(e.target.value || "300", 10) })} />
          </label>
          <label className="check small"><input type="checkbox" checked={settings.showKQuants} onChange={(e) => void onSave({ showKQuants: e.target.checked })} /> Show K-quants and IQ quants (may use the CPU)</label>
        </div>
      </section>

      <section>
        <h2>Local endpoint</h2>
        <p className="muted small">OpenAI-compatible. Point Cherry Studio, VS Code or any client at it while a model is loaded.</p>
        <div className="row">
          <code className="endpoint">{endpoint}</code>
          <button className="ghost" onClick={async () => { try { await navigator.clipboard.writeText(endpoint); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy"}</button>
          {server?.state === "ready" && <button className="ghost" onClick={() => void api().stopServer()}>Stop server</button>}
        </div>
        <div className="muted small">Close other NPU chat apps and open <code>geniex infer</code> windows, or the server can crash.</div>
      </section>

      <section>
        <h2>Last error</h2>
        {server?.lastError ? <div className="error-box"><strong>{server.lastError.title}</strong><div>{server.lastError.fix}</div></div>
          : voice?.error ? <div className="error-box"><strong>{voice.error.title}</strong><div>{voice.error.fix}</div></div>
          : <div className="muted">None.</div>}
        {log.length > 0 && <details><summary className="small">Server log</summary><pre>{log.join("\n")}</pre></details>}
      </section>
</>}
{settings.developer && tab === "dev-dynamic" && <>
          <section>
            <h2>The Dynamic model</h2>
            <DynamicEditor settings={settings} installed={installed} onSave={onSave} />
          </section>
</>}
{settings.developer && tab === "dev-npu" && <>
          <section>
            <h2>NPU load test</h2>
            <NpuLoadTest />
          </section>
</>}
{settings.developer && tab === "dev-engines" && <>
          <section>
            <h2>GenieX and Microsoft Foundry Local</h2>
            <EngineCompare />
          </section>
</>}
{settings.developer && tab === "dev-bench" && <>
          <section>
            <h2>Model benchmark</h2>
            <Benchmark />
          </section>
</>}
        </div>
      </div>
    </div>
  );
}


const when = (t: number | null | undefined) => t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";

/** Open NPU updates itself from GitHub; this shows where that stands and can force an update. */
function UpdatePanel({ version }: { version: string }) {
  const [u, setU] = useState<UpdateState | null>(null);
  const [sure, setSure] = useState(false);
  useEffect(() => {
    void api().updateState().then(setU);
    return api().onUpdate(setU);
  }, []);
  if (!u) return null;
  const busy = u.status === "checking" || u.status === "downloading";
  const text =
    u.status === "checking" ? "Checking GitHub…" :
    u.status === "downloading" ? `Downloading${u.version ? ` v${u.version}` : ""}${u.percent != null ? ` (${u.percent}%)` : ""}…` :
    u.status === "ready" ? `v${u.version ?? ""} is ready to install` :
    u.status === "current" ? "You have the latest version" :
    u.status === "error" ? "Could not update" : "Updates are installed automatically";
  return (
    <>
      <table className="kv"><tbody>
        <tr><td>Installed version</td><td>v{version}</td></tr>
        <tr><td>Installed on</td><td>{when(u.installedAt)}</td></tr>
        <tr><td>Last check</td><td>{when(u.checkedAt)}</td></tr>
        <tr><td>Status</td><td>{text}</td></tr>
      </tbody></table>
      {u.error && <div className="warn small">{u.error}</div>}
      <div className="row">
        {u.status === "ready" && <button className="primary" onClick={() => void api().updateInstall()}>Restart to update</button>}
        <button className="ghost" disabled={busy} onClick={() => void api().updateCheck()}>Check now</button>
        <button className="ghost" disabled={busy} onClick={() => setSure(true)}>Force update…</button>
      </div>
      {sure && (
        <div className="error-box" role="alertdialog" aria-label="Confirm the forced update">
          <div><strong>Download and run the latest installer now?</strong></div>
          <div className="small">The app closes, reinstalls the latest version even if you already have it, then starts again. Your chats and models are kept.</div>
          <div className="row">
            <button className="primary" onClick={() => { setSure(false); void api().updateForce(); }}>Force update</button>
            <button className="ghost" onClick={() => setSure(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="muted small">Force update is for a broken install or when the automatic update does not show up.</div>
    </>
  );
}
