import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { CopyLog } from "./CopyLog";
import type { CatalogItem } from "../shared/api";
import type { LabState } from "../core/labRunner";
import { LAB_PLAN_TESTS } from "../core/promptLabPlans";
import { LAB_PLAN_TESTS_2 } from "../core/promptLabPlans2";
import { LAB_PLAN_TESTS_3 } from "../core/promptLabPlans3";
import { LAB_EXAMPLE, cellOf, labReport, modelMean, optionsFor, parseLabFile } from "../core/promptLab";

const EMPTY: LabState = { running: false, phase: "", total: 0, done: 0, runs: [], models: [], log: [], failed: [] };
const tone = (n: number) => (n >= 75 ? "ok" : n >= 45 ? "" : "warn");

/** Offers a text as a file to save (the window's own download: no dialog of the app is needed). */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Developer settings: a series of prompts in one Markdown file, each with the ideal answer at its end. Each prompt is asked as it is
 * written (no planner, no router, no construction engine) of the models that are ticked, and every answer is scored against the ideal.
 * The format is explained on this page and in docs/prompt-lab.md.
 */
export function PromptLab() {
  const [md, setMd] = useState("");
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, setState] = useState<LabState>(EMPTY);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ prompt: string; model: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void api().catalog().then((c) => setItems(c.filter((i) => i.installed && !i.entry.id.startsWith("foundry:")).sort((a, b) => a.entry.sizeGB - b.entry.sizeGB)));
    void api().labState().then(setState);
    return api().onLab(setState);
  }, []);
  const file = useMemo(() => (md.trim() ? parseLabFile(md) : null), [md]);
  const busy = state.running;
  const modelNames = state.models;
  const names = file?.prompts.map((p) => p.name) ?? [];
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const read = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    if (f.size > 1_000_000) { setError("This file is too big for a series of prompts (more than 1 MB)."); return; }
    setMd(await f.text());
    setFileName(f.name);
  };
  const start = async () => {
    setError(""); setOpen(null);
    const r = await api().labStart({ md, modelIds: [...picked] });
    if (!r.ok) setError(r.error ?? "Could not start.");
  };
  const report = file && state.runs.length ? labReport(file, state.runs, modelNames) : "";
  // the results are read against the file that was run: the prompts of the runs, not of whatever the text box holds now
  const shownPrompts = names.length ? names : [...new Set(state.runs.map((r) => r.prompt))];
  const detail = open && file ? { p: file.prompts.find((p) => p.name === open.prompt), cell: cellOf(state.runs, open.prompt, open.model) } : null;
  const plannedRuns = file ? file.prompts.reduce((n, p) => n + optionsFor(file, p).runs, 0) * picked.size : 0;

  return (
    <div className="prompt-lab">
      <p className="muted small">
        Test how models answer a series of prompts, without the app building anything. You write the prompts in a Markdown file, with the ideal answer at the end of each one.
        Each prompt is sent <strong>exactly as written</strong> to every model you tick (no planner, no router, no program builder), a few times, and each answer gets a score from 0 to 100 against the ideal.
        For every prompt and model, the <strong>best</strong> run is shown.
      </p>
      <details className="small">
        <summary>How to write the file</summary>
        <ul>
          <li>The file starts, if you want, with a block between two <code>---</code> lines: <code>runs</code> (how many times each prompt is asked, 1 to 10, best one counts), <code>max_tokens</code>, <code>temperature</code>, <code>thinking</code> (off, on, default) and <code>system</code> (a message sent before each prompt).</li>
          <li>Each prompt is a <code>## name</code> heading. The text under it, up to the first reserved sub-heading, is what the model receives.</li>
          <li><code>### Ideal</code> (last in its section) is the perfect answer. The score is how close an answer is: the words they share, the form of the lines that use <code>|</code>, and the length.</li>
          <li><code>### Checks</code> (optional): one rule per line: <code>contains: text</code>, <code>not: text</code>, <code>starts: text</code>, <code>regex: pattern</code>, <code>lines: 4-10</code>, <code>max_chars: 900</code>, <code>json</code>. With checks, the total is 60 % closeness to the ideal and 40 % checks passed.</li>
          <li><code>### Options</code> (optional): the same keys as the top block, for this prompt only.</li>
          <li>Headings inside a code fence are part of the prompt. Any other <code>###</code> heading stays in the prompt too.</li>
        </ul>
        <div className="row">
          <button className="ghost" onClick={() => download("prompt-lab-example.md", LAB_EXAMPLE)}>Download an example file</button>
          <button className="ghost" onClick={() => { setMd(LAB_EXAMPLE); setFileName("example"); }}>Load the example</button>
          <button className="ghost" onClick={() => { setMd(LAB_PLAN_TESTS); setFileName("planning prompts"); }} title="Seven ways of asking a small model to plan a Mario-like game, small and much bigger, with the plan a good lead would write as the ideal">Load the planning prompts (Mario)</button>
          <button className="ghost" onClick={() => download("prompt-lab-planning.md", LAB_PLAN_TESTS)}>Download them</button>
          <button className="ghost" onClick={() => { setMd(LAB_PLAN_TESTS_2); setFileName("planning prompts, round 2"); }} title="Round 2: only the core-and-features form, worded seven ways, small and much bigger request">Load round 2 (core and features)</button>
          <button className="ghost" onClick={() => { setMd(LAB_PLAN_TESTS_3); setFileName("planning prompts, last round"); }} title="Last round: the winning wording, with a rule for families and short lines, on Mario, a kanban board and Tetris">Load the last round</button>
        </div>
        <p className="muted">The full guide is in <code>docs/prompt-lab.md</code> of the project. Only the models installed on this PC (GenieX) are listed; Microsoft Foundry Local models are not run here yet. The scoring is by code, with no judge model: it tells which answers look like the ideal, not whether a different answer would also be good.</p>
      </details>

      <div className="row small">
        <input ref={input} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
        <button className="primary" disabled={busy} onClick={() => input.current?.click()}>Import a .md file</button>
        {fileName && <span className="muted">{fileName}</span>}
      </div>

      {file && (
        <div className="small">
          <div><strong>{file.title}</strong> · {file.prompts.length} prompt{file.prompts.length === 1 ? "" : "s"} · {file.options.runs} run{file.options.runs === 1 ? "" : "s"} each · up to {file.options.maxTokens} tokens · thinking {file.options.thinking}{file.options.temperature !== undefined ? ` · temperature ${file.options.temperature}` : ""}</div>
          {file.problems.length > 0 && <ul className="warn">{file.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          <details><summary>The text of the file (you can change it here)</summary>
            <textarea value={md} disabled={busy} onChange={(e) => setMd(e.target.value)} rows={14} style={{ width: "100%", fontFamily: "monospace" }} spellCheck={false} />
          </details>
        </div>
      )}

      <div className="small">
        <strong>Models</strong> <span className="muted">(installed on this PC; one is loaded at a time)</span>
        {items.length === 0 && <div className="muted">No installed model found.</div>}
        <div className="row">
          <button className="ghost" disabled={busy} onClick={() => setPicked(new Set(items.filter((i) => i.entry.sizeGB <= 3).map((i) => i.entry.id)))}>3 GB or less</button>
          <button className="ghost" disabled={busy} onClick={() => setPicked(new Set())}>None</button>
        </div>
        {items.map((i) => (
          <label key={i.entry.id} className="check"><input type="checkbox" checked={picked.has(i.entry.id)} disabled={busy} onChange={() => toggle(i.entry.id)} /> {i.entry.name} <span className="muted">({i.entry.sizeGB.toFixed(1)} GB{i.runsOn ? ` · ${i.runsOn.toUpperCase()}` : ""})</span></label>
        ))}
      </div>

      <div className="row small">
        <button className="primary" disabled={busy || !file?.prompts.length || !picked.size} onClick={() => void start()}>Test{file && picked.size ? ` (${plannedRuns} answers)` : ""}</button>
        {busy && <button onClick={() => void api().labStop()}>Stop</button>}
        {(busy || state.done > 0) && <span className="muted">{state.done} of {state.total} · {state.phase}</span>}
      </div>
      {error && <div className="error-box">{error}</div>}
      {state.failed.length > 0 && <ul className="small warn">{state.failed.map((f) => <li key={f.model}>{f.model} could not be loaded: {f.error}</li>)}</ul>}

      {state.runs.length > 0 && modelNames.length > 0 && (
        <>
          <table className="small bd-table">
            <thead><tr><th>Prompt</th>{modelNames.map((m) => <th key={m}>{m}</th>)}</tr></thead>
            <tbody>
              {shownPrompts.map((p) => (
                <tr key={p}>
                  <td>{p}</td>
                  {modelNames.map((m) => {
                    const c = cellOf(state.runs, p, m);
                    return (
                      <td key={m}>
                        {c.best
                          ? <button className={`linkbtn ${tone(c.best.score.total)}`} onClick={() => setOpen({ prompt: p, model: m })} title="Show the answer next to the ideal">{c.best.score.total} <span className="muted">· {c.best.seconds.toFixed(0)} s · avg {c.average}</span></button>
                          : c.runs ? <span className="warn" title={state.runs.find((r) => r.prompt === p && r.model === m && r.error)?.error}>failed</span> : <span className="muted">–</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr><td><strong>mean</strong></td>{modelNames.map((m) => <td key={m}><strong>{modelMean(state.runs, shownPrompts, m)}</strong></td>)}</tr>
            </tbody>
          </table>
          <div className="row small">
            <button disabled={!report} onClick={() => download("prompt-lab-report.md", report)}>Save the report (.md)</button>
            <button className="ghost" disabled={!report} onClick={async () => { try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy the report"}</button>
          </div>
        </>
      )}

      {detail?.p && (
        <div className="small lab-detail">
          <h3>{open!.prompt} · {open!.model}</h3>
          {detail.cell.best ? (
            <>
              <div>Best run: score {detail.cell.best.score.total}{detail.cell.best.score.similarity !== null ? ` (closeness to the ideal ${detail.cell.best.score.similarity})` : ""} · {detail.cell.best.seconds.toFixed(1)} s{detail.cell.best.tokens ? ` · ${detail.cell.best.tokens} tokens` : ""} · {detail.cell.runs} run{detail.cell.runs === 1 ? "" : "s"}: {state.runs.filter((r) => r.prompt === open!.prompt && r.model === open!.model).map((r) => (r.error ? "failed" : r.score.total)).join(", ")}</div>
              {detail.cell.best.score.checks.length > 0 && <ul>{detail.cell.best.score.checks.map((c, i) => <li key={i} className={c.ok ? "" : "warn"}>{c.ok ? "✓" : "✗"} {c.check}</li>)}</ul>}
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}><strong>The answer</strong><pre>{detail.cell.best.answer || "(nothing)"}</pre></div>
                <div style={{ flex: 1 }}><strong>The ideal</strong><pre>{detail.p.ideal || "(none written)"}</pre></div>
              </div>
            </>
          ) : <div className="warn">{state.runs.find((r) => r.prompt === open!.prompt && r.model === open!.model && r.error)?.error ?? "No answer."}</div>}
          <button className="linkbtn" onClick={() => setOpen(null)}>Close</button>
        </div>
      )}
      {state.log.length > 0 && <details className="small"><summary>Log ({state.log.length} lines)</summary><CopyLog lines={state.log} /><pre>{state.log.join("\n")}</pre></details>}
    </div>
  );
}
