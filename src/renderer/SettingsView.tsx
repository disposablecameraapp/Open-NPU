import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Seg } from "./Seg";
import { DynamicEditor } from "./DynamicEditor";
import { Benchmark } from "./Benchmark";
import { isDynamicId } from "../core/dynamic";
import { ICONS, IconButton } from "./Icon";
import type { AppInfo, CatalogItem, NpuPlanView, UpdateState } from "../shared/api";
import type { HardwareProfile, ServerStatus, Settings, VoiceDownloadProgress, VoiceModelView, VoiceSettings, VoiceStatus } from "../shared/types";

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
              <span> {model.name}{model.default && <span className="tag">default</span>}</span>
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

  return (
    <div className="page">
      <h1>Settings</h1>

      <section>
        <h2>Where each model runs</h2>
        <p className="muted small">CPU leaves the NPU free; NPU is faster. With enough NPU memory or smaller models you can put chat, dictation and read-aloud all on the NPU for a fast voice chat. Open NPU checks the total before it loads anything.</p>
        <div className="role-row">
          <div><strong>Chat model</strong><div className="muted small">{settings.selectedModelId ? "Selected in Models" : "none selected"}</div></div>
          <Switch value={chatCompute} onChange={(c) => void onSave({ compute: c })} />
        </div>
        <div className="role-row">
          <div><strong>Dictation</strong><div className="muted small">{voice?.stt ? `running on ${voice.sttProvider?.toUpperCase()}` : "not loaded"}</div></div>
          <Switch value={v.sttCompute} onChange={(c) => void onSaveVoice({ sttCompute: c })} />
        </div>
        <div className="role-row">
          <div><strong>Read-aloud</strong><div className="muted small">{voice?.tts ? `running on ${voice.ttsProvider?.toUpperCase()}` : "not loaded"}</div></div>
          <Switch value={v.ttsCompute} onChange={(c) => void onSaveVoice({ ttsCompute: c })} />
        </div>
        {plan && <PlanBar plan={plan} />}
        {voice?.notice && <div className="warn small">{voice.notice}</div>}
        <div className="muted small">The voice models run in a separate process, so if one fails on the NPU it falls back to the CPU instead of taking the chat server down.</div>
      </section>

      <section>
        <h2>Which model writes what</h2>
        <p className="muted small">When Open NPU builds files it works one file at a time. Give a job to the model that is best at it, and the NPU switches to it for that file. Leave a job on "Chat model" to use the model you chat with.</p>
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
        <div className="muted small">Files are written in this order: page, stylesheet, script, so the NPU switches models at most once per job. A model change takes a few seconds while the next one loads; each model must fit the NPU memory on its own.</div>
      </section>
      <section>
        <h2>Code check</h2>
        <p className="muted small">After the model writes a page or a script, Open NPU runs it (pages in a hidden window with no network, pressing keys and clicking buttons; JavaScript and Python are parsed) and fixes what fails before you see it.</p>
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
        <div className="muted small">A bigger, slower model reads the code and the errors and fixes them with small edits, so the small model can write for as long as it wants. The NPU holds one model at a time: the review model is loaded after the answer is written, and the writing model is brought back for your next message. Pick one that fits the NPU memory on its own.</div>
      </section>

      <section>
        <h2>Web search</h2>
        <p className="muted small">Turn it on from the sliders button next to the model name. The model writes a search, Open NPU runs it, reads the best pages and gives the text back so the answer can cite its sources. Web text is treated as untrusted information.</p>
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
        <div className="muted small">A search model reads the pages and keeps only the facts, so the writing model gets a short summary instead of raw page text. The NPU holds one model at a time, so it is loaded for each search and the writing model comes back after. The Brave key is stored in the app's settings file on this PC.</div>
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
        <h2>Voice behavior</h2>
        <label className="check"><input type="checkbox" checked={v.readAloud} onChange={(e) => void onSaveVoice({ readAloud: e.target.checked })} /> Read every answer aloud</label>
        <label className="check"><input type="checkbox" checked={v.allowInterrupt} onChange={(e) => void onSaveVoice({ allowInterrupt: e.target.checked })} /> Let me interrupt by speaking (use headphones if the speakers echo)</label>
        <label className="check"><input type="checkbox" checked={v.autoSend} onChange={(e) => void onSaveVoice({ autoSend: e.target.checked })} /> Send voice messages as soon as I stop talking</label>
      </section>

      <section>
        <h2>This machine</h2>
        <table className="kv"><tbody>
          <tr><td>Chip</td><td>{hw.chipName}</td></tr>
          <tr><td>RAM</td><td>{hw.ramGB} GB</td></tr>
          <tr><td>NPU</td><td>{hw.npuDetected ? "Hexagon NPU found" : "Not found"}{hw.npuDriverVersion ? ` · driver ${hw.npuDriverVersion}` : ""}</td></tr>
          <tr><td>NPU memory limit</td><td>{hw.npuBudgetGB} GB <span className="muted">({hw.npuBudgetSource === "estimated" ? "estimated: about half of RAM" : hw.npuBudgetSource === "user" ? "set by you" : "measured"})</span></td></tr>
          <tr><td>App build</td><td>{info.arch}{hw.emulated ? " (emulated: install the ARM64 build)" : " (native)"} · v{info.version}</td></tr>
          <tr><td>Updates</td><td><UpdateRow /></td></tr>
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

      <section>
        <h2>Developer settings</h2>
        <label className="check"><input type="checkbox" checked={!!settings.developer} onChange={(e) => void onSave({ developer: e.target.checked })} /> Show developer settings</label>
        {settings.developer && (
          <>
            <h3>The Dynamic model</h3>
            <DynamicEditor settings={settings} installed={installed} onSave={onSave} />
            <h3>Model benchmark</h3>
            <Benchmark />
          </>
        )}
      </section>
    </div>
  );
}

/** Open NPU updates itself from GitHub; this shows where that stands. */
function UpdateRow() {
  const [u, setU] = useState<UpdateState | null>(null);
  useEffect(() => {
    void api().updateState().then(setU);
    return api().onUpdate(setU);
  }, []);
  if (!u) return null;
  const text =
    u.status === "checking" ? "Checking GitHub…" :
    u.status === "downloading" ? `Downloading v${u.version ?? ""}${u.percent != null ? ` (${u.percent}%)` : ""}…` :
    u.status === "ready" ? `v${u.version ?? ""} is ready` :
    u.status === "current" ? "Up to date" :
    u.status === "error" ? "Could not check for updates" : "Updates are installed automatically";
  return (
    <span>
      {text}{" "}
      {u.status === "ready"
        ? <button className="primary" onClick={() => void api().updateInstall()}>Restart to update</button>
        : <button onClick={() => void api().updateCheck()} disabled={u.status === "checking" || u.status === "downloading"}>Check now</button>}
    </span>
  );
}
