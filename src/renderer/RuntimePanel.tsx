import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Seg } from "./Seg";
import { suggestGpuLayers } from "../core/runtime";
import type { RuntimeInfo } from "../shared/api";
import type { SetupState } from "../core/setup";
import type { ComputeTarget, RuntimeSettings, Settings } from "../shared/types";

const TARGETS: { id: "npu" | "gpu" | "cpu"; label: string }[] = [{ id: "npu", label: "NPU" }, { id: "gpu", label: "GPU" }, { id: "cpu", label: "CPU" }];

/** An optional whole number: empty = not set (llama.cpp decides). */
function Num({ value, onSave, placeholder, min = 0, wide }: { value: number | undefined; onSave: (n: number | undefined) => void; placeholder?: string; min?: number; wide?: boolean }) {
  return (
    <input
      key={String(value ?? "")} type="number" min={min} style={wide ? { width: 110 } : { width: 90 }} defaultValue={value ?? ""} placeholder={placeholder}
      onBlur={(e) => { const t = e.target.value.trim(); const n = t === "" ? undefined : Math.floor(Number(t)); onSave(n === undefined || Number.isNaN(n) ? undefined : n); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

/** Where the chat model runs (NPU, GPU or CPU) and, for the GPU and the CPU, the load options of the llama.cpp engine, like LM Studio's. */
export function RuntimePanel({ settings, onSave }: { settings: Settings; onSave: (p: Partial<Settings>) => Promise<void> | void }) {
  const [info, setInfo] = useState<RuntimeInfo | null>(null);
  const [step, setStep] = useState<SetupState["steps"][number] | null>(null);
  const [vram, setVram] = useState("");
  const [layers, setLayers] = useState("");
  const [size, setSize] = useState("");
  const rt: RuntimeSettings = settings.runtime ?? {};
  const target: ComputeTarget = settings.compute;
  const off = target === "gpu" || target === "cpu";

  const refresh = useCallback(() => { void api().runtimeInfo().then(setInfo).catch(() => undefined); }, []);
  useEffect(() => { refresh(); }, [refresh, settings.compute, settings.runtime]);
  useEffect(() => api().onSetup((s) => { const l = s.steps.find((x) => x.id === "llama") ?? null; setStep(l); if (l?.state === "done") refresh(); }), [refresh]);

  const save = (patch: Partial<RuntimeSettings>) => {
    const next: RuntimeSettings = { ...rt, ...patch };
    for (const k of Object.keys(next) as (keyof RuntimeSettings)[]) if (next[k] === undefined) delete next[k];
    void onSave({ runtime: next });
  };
  const pick = (id: "npu" | "gpu" | "cpu") => { void onSave({ compute: id }); };

  const gpuVram = info?.gpus.find((g) => g.vramGB)?.vramGB ?? null;
  const installing = step?.state === "running" || step?.state === "pending";
  const choice = TARGETS.find((t) => t.id === (target === "hybrid" ? "npu" : target)) ?? TARGETS[0];
  const cur = info?.choices.find((c) => c.id === choice.id);

  return (
    <section>
      <h2>Where the chat model runs</h2>
      <p className="muted small">Pick the hardware. The NPU needs a Snapdragon X laptop; the GPU and the CPU work on any Windows, Mac or Linux PC (through llama.cpp).</p>
      <div className="role-row">
        <div><strong>Chat model</strong><div className="muted small">{settings.selectedModelId ? "Selected in Models" : "none selected"}</div></div>
        <Seg role="group">
          {TARGETS.map((t) => {
            const c = info?.choices.find((x) => x.id === t.id);
            return <button key={t.id} className={choice.id === t.id ? "on" : ""} title={c?.note} onClick={() => pick(t.id)}>{t.label}{c && !c.available ? " ·" : ""}</button>;
          })}
        </Seg>
      </div>
      {cur && <div className={cur.available ? "muted small" : "warn small"}>{cur.available ? cur.note : `${cur.note} You can still choose it.`}</div>}
      {info && <div className="muted small">{info.note}</div>}

      {off && info && (
        <div className="card-lite" style={{ marginTop: 10 }}>
          <div className="role-row">
            <div>
              <strong>llama.cpp</strong>
              <div className="muted small">{info.llamaPath ? `${info.llamaVersion ?? "installed"} · ${info.llamaPath}` : "Not installed yet. It is the open-source engine that runs the model on your GPU or CPU."}</div>
            </div>
            <div className="row" style={{ margin: 0 }}>
              <button className="primary" disabled={installing} onClick={() => void api().installLlamaServer()}>{installing ? "Installing…" : info.llamaPath ? "Update" : "Install llama.cpp"}</button>
              <button className="ghost" onClick={async () => { await api().pickLlamaServer(); refresh(); }}>Locate llama-server…</button>
            </div>
          </div>
          {step && (installing || step.state === "error") && (
            <div className={step.state === "error" ? "error-box" : "muted small"}>{step.state === "error" ? step.error : `${step.message ?? "Working"}${step.percent !== null ? ` ${step.percent}%` : ""}`}</div>
          )}
        </div>
      )}

      {off && (
        <details style={{ marginTop: 10 }} open={false}>
          <summary className="small"><strong>Advanced load options</strong> <span className="muted">· {info?.cpuThreads ?? "?"} threads, {info?.ramGB ?? "?"} GB RAM{info?.gpus.length ? `, ${info.gpus.map((g) => g.name).join(" + ")}` : ""}</span></summary>
          <div className="row">
            <label className="small">CPU threads
              <Num value={rt.threads} placeholder={`auto (${info?.cpuThreads ?? "?"})`} onSave={(n) => save({ threads: n })} wide />
            </label>
            <label className="small">Prompt threads
              <Num value={rt.threadsBatch} placeholder="same" onSave={(n) => save({ threadsBatch: n })} />
            </label>
            <label className="small">Context window (tokens)
              <Num value={rt.ctx} placeholder="model's" onSave={(n) => save({ ctx: n })} wide />
            </label>
          </div>

          {target === "gpu" && (
            <>
              <div className="row">
                <label className="small">Layers on the GPU (-1 = all, 0 = none)
                  <Num value={rt.gpuLayers} min={-1} placeholder="all" onSave={(n) => save({ gpuLayers: n })} wide />
                </label>
                <label className="small">Video memory (GB), to suggest a number
                  <input type="number" min="1" step="0.5" style={{ width: 90 }} value={vram} placeholder={gpuVram ? String(gpuVram) : "e.g. 8"} onChange={(e) => setVram(e.target.value)} />
                </label>
                <label className="small">Model file (GB)
                  <input type="number" min="0.1" step="0.1" style={{ width: 80 }} value={size} placeholder="e.g. 4.5" onChange={(e) => setSize(e.target.value)} />
                </label>
                <label className="small">Model layers
                  <input type="number" min="1" style={{ width: 80 }} value={layers} placeholder="e.g. 32" onChange={(e) => setLayers(e.target.value)} />
                </label>
                <button className="ghost" disabled={!(Number(vram || gpuVram) > 0) || !(Number(layers) > 0) || !(Number(size) > 0)} onClick={() => save({ gpuLayers: suggestGpuLayers(Number(size), Number(layers), Number(vram || gpuVram)) })}>Suggest</button>
              </div>
              <div className="muted small">Layers that do not fit on the card stay in RAM and run on the processor, so a model bigger than the video memory still loads (slower).</div>
              <label className="check small"><input type="checkbox" checked={!!rt.kvInRam} onChange={(e) => save({ kvInRam: e.target.checked })} /> Keep the conversation cache (KV) in RAM, to leave the video memory to the model</label>
            </>
          )}

          <div className="row">
            <label className="small">Flash attention
              <select value={rt.flashAttn ?? "auto"} onChange={(e) => save({ flashAttn: e.target.value as RuntimeSettings["flashAttn"] })}>
                <option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option>
              </select>
            </label>
            <label className="small">Cache precision (K and V)
              <select value={rt.kvType ?? "f16"} onChange={(e) => save({ kvType: e.target.value as RuntimeSettings["kvType"] })}>
                <option value="f16">f16 (best)</option><option value="q8_0">q8_0 (half the memory)</option><option value="q4_0">q4_0 (a quarter)</option>
              </select>
            </label>
            <label className="small">Batch size
              <Num value={rt.batch} placeholder="2048" onSave={(n) => save({ batch: n })} />
            </label>
            <label className="small">Micro-batch
              <Num value={rt.ubatch} placeholder="512" onSave={(n) => save({ ubatch: n })} />
            </label>
          </div>

          <label className="check small"><input type="checkbox" checked={rt.mmap !== false} onChange={(e) => save({ mmap: e.target.checked ? undefined : false })} /> Let the model spill into RAM and disk (memory-map the file): a model bigger than the free RAM still starts, and loads faster</label>
          <label className="check small"><input type="checkbox" checked={!!rt.mlock} onChange={(e) => save({ mlock: e.target.checked || undefined })} /> Keep the model in RAM (never swapped to disk; needs the whole model to fit)</label>

          <div className="row">
            <label className="small" style={{ flex: 1 }}>Other llama-server options
              <input key={rt.extraArgs ?? ""} type="text" style={{ width: "100%" }} defaultValue={rt.extraArgs ?? ""} placeholder="e.g. --rope-scaling yarn --main-gpu 1" onBlur={(e) => save({ extraArgs: e.target.value.trim() || undefined })} />
            </label>
            <button className="ghost" onClick={() => void onSave({ runtime: { serverPath: rt.serverPath } })}>Reset to defaults</button>
          </div>
          {info && info.problems.length > 0 && <div className="warn small">{info.problems.join(" ")}</div>}
          <div className="muted small">The change applies the next time a model loads. Stop the server in Developer settings to reload now.</div>
        </details>
      )}
    </section>
  );
}
