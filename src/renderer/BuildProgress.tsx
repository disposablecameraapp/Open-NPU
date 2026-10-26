import { useEffect, useRef, useState } from "react";
import type { BuildRun, BuildStage, BuildStep } from "../shared/types";
import { parseSegments } from "../core/artifacts";
import { Chevron, Spark, StatusMark, Unfold, clock } from "./Activity";
import { WorkLog, useNow, useRotating } from "./WorkLog";
import { StepIcon } from "./StepIcon";
import { buildItems, phrasesFor } from "../core/workLog";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const secs = (g: BuildStage, now: number) => (g.status === "running" ? Math.max(0, Math.floor((now - (g.at ?? now)) / 1000)) : Math.round(g.sec ?? 0));

/** What a stage is doing, as a short sentence in the present tense. */
function doing(g: BuildStage, file?: string): string {
  const of = file ? ` ${file}` : "";
  switch (g.id) {
    case "plan": return "Planning the files";
    case "skeleton": return `Choosing a starting point${of ? ` for${of}` : ""}`;
    case "spec": return `Writing the rules${of ? ` for${of}` : ""}`;
    case "write": return `Writing${of}`;
    case "edit": return `Changing${of}`;
    case "check": return `Checking${of}`;
    case "fix": return `Fixing${of}`;
    case "baseline": return "Trying the page as it was";
    case "run": return "Testing the page";
    case "look": return "Looking at the screen";
    case "explain": return "Writing the summary";
    default: return g.label;
  }
}

/** A stage that has no end in sight still moves: the share of its time that has gone, never reaching the end. */
const creep = (t: number, tau: number) => 1 - Math.exp(-t / tau);

interface Seg { key: string; label: string; state: "waiting" | "running" | "done" | "error"; pct: number; w: number }

const stateOf = (xs: BuildStage[]): Seg["state"] => (xs.some((g) => g.status === "running") ? "running" : xs.some((g) => g.status === "error") ? "error" : xs.length && xs.every((g) => g.status !== "running") ? "done" : "waiting");
const peak = (g: BuildStage, now: number) => creep(secs(g, now), /^(write|edit|fix)$/.test(g.id) ? 40 : 10);

/** The rail: planning, one stretch per file, the test run. Each stretch fills as its stages finish and creeps while one runs, so it never stands still. */
function railOf(b: BuildRun, now: number): Seg[] {
  const pre = [...(b.start ?? []), ...(b.verify ?? []).filter((g) => g.id === "baseline")];
  const post = (b.verify ?? []).filter((g) => g.id !== "baseline");
  const out: Seg[] = [];
  if (pre.length) {
    const st = stateOf(pre), run = pre.find((g) => g.status === "running");
    out.push({ key: "pre", label: b.start?.length ? "Plan" : "Before", state: st, pct: st === "waiting" ? 0 : run ? Math.min(.9, peak(run, now)) : 1, w: 1 });
  }
  for (const s of b.steps) {
    // a file still to come is on the road map from the start, drawn dashed
    const stages = s.stages ?? [];
    const c = stages.filter((g) => g.status === "done" || g.status === "skipped").length;
    const run = stages.find((g) => g.status === "running");
    const state: Seg["state"] = s.status === "done" ? "done" : s.status === "error" ? "error" : s.status === "running" ? "running" : "waiting";
    const pct = state === "done" || state === "error" ? 1 : state === "waiting" ? 0 : Math.max(.03, Math.min(.95, (c + (run ? peak(run, now) : 0)) / Math.max(4, c + 2)));
    out.push({ key: `f:${s.file}`, label: s.file, state, pct, w: 3 });
  }
  if (!post.length && b.status === "running" && b.steps.some((s) => /\.html?$/i.test(s.file))) out.push({ key: "post", label: "Test", state: "waiting", pct: 0, w: 1.5 });
  if (post.length) {
    const run = post.find((g) => g.status === "running");
    const st = stateOf(post);
    const finished = st === "done" && b.status === "done";
    out.push({ key: "post", label: "Test", state: st, pct: finished ? 1 : run ? Math.min(.9, peak(run, now)) : post.length ? Math.min(.9, post.filter((g) => g.status === "done").length / (post.length + 1)) : 0, w: 1.5 });
  }
  return out;
}

/** One stage in a trail: a mark, its name, its time (live while it runs). */
function Stage({ g, now, file }: { g: BuildStage; now: number; file?: string }) {
  const t = secs(g, now);
  const who = g.agent ? `${g.agent} agent${g.model ? ` · ${g.model}` : " · runs the page here"}. ` : "";
  return (
    <span className={`bp-st ${g.status}`} title={`${who}${g.note ?? ""}`} data-file={file}>
      <StepIcon tag={g.id} state={g.status === "running" ? "running" : g.status === "error" ? "error" : g.status === "done" ? "done" : "waiting"} />
      {g.label}{(g.status === "running" ? t >= 1 : g.status !== "skipped" && t >= 1) && <em>{clock(t)}</em>}
    </span>
  );
}

/** The stages a file goes through, in order, as plain words with their times: what is done, what runs now, what is expected next. */
function Trail({ stages, ghost, now }: { stages: BuildStage[]; ghost?: string; now: number }) {
  if (!stages.length && !ghost) return null;
  return (
    <div className="bp-trail">
      {stages.map((g, i) => <Stage key={i} g={g} now={now} />)}
      {ghost && <span className="bp-st ghost"><i className="bp-hollow" />{ghost}</span>}
    </div>
  );
}

/** The last lines of the file being written right now, with their numbers: proof, at a glance, that the work is moving. */
function tailOf(content: string): { file: string; lines: { n: number; text: string }[] } | null {
  if (!content) return null;
  const open = parseSegments(content).filter((x) => x.t === "artifact" && x.open).pop();
  if (!open || open.t !== "artifact") return null;
  const all = open.content.split("\n");
  const rows = all.map((text, i) => ({ n: i + 1, text })).filter((r) => r.text.trim());
  return { file: open.title, lines: rows.slice(-3).map((r) => ({ n: r.n, text: r.text.replace(/\t/g, "  ").trimEnd().slice(0, 110) })) };
}

const Diff = ({ text }: { text: string }) => (
  <details className="step-diff"><summary className="muted small">Show what changed</summary><pre className="diff">{text.split("\n").map((l, k) => <div key={k} className={l.startsWith("+ ") ? "add" : l.startsWith("- ") ? "del" : "hunk"}>{l}</div>)}</pre></details>
);

const fileMark = (s: BuildStep["status"]) => <StepIcon tag="write" state={s === "running" ? "running" : s === "done" ? "done" : s === "error" ? "error" : "waiting"} />;

/**
 * Everything a build shows, in one block that never goes still: the sentence of what happens now, the file and the helper working on it,
 * a clock that runs by itself, a rail that fills as the work does, and the stages of the file as a trail. When the work ends the block
 * folds to one quiet line; the whole account (stages, times, changes, the test run and its screenshot) is one click away.
 */
export function BuildCard({ build, content = "" }: { build: BuildRun; content?: string }) {
  const running = build.status === "running";
  const now = useNow(running);
  const [open, setOpen] = useState<boolean | null>(null); // null: as the state says (open when something needs a look)
  const [landed, setLanded] = useState(false);
  const wasRunning = useRef(running);
  const peaks = useRef(new Map<string, number>());
  const seen = useRef({ sig: "", at: Date.now() });
  useEffect(() => {
    if (wasRunning.current && !running) { setLanded(true); const t = setTimeout(() => setLanded(false), 1400); wasRunning.current = false; return () => clearTimeout(t); }
    wasRunning.current = running;
  }, [running]);
  const all = [...(build.start ?? []), ...build.steps.flatMap((s) => s.stages ?? []), ...(build.verify ?? [])];
  const active = all.find((g) => g.status === "running");
  const phrase = useRotating(phrasesFor(active?.id), `${active?.id}|${active?.file}`, running);
  if (!build.steps.length && !build.start?.length) return null; // nothing to build, and no helper has started

  const activeStep = active ? build.steps.find((s) => s.stages?.includes(active)) : undefined;
  const lastRun = [...(build.verify ?? [])].reverse().find((g) => g.id === "run"); // an earlier failed run that was mended is not a problem any more
  const bad = build.steps.some((s) => s.status === "error") || lastRun?.status === "error";
  const expanded = open ?? (bad && !running);
  const started = build.steps.filter((s) => s.status !== "waiting");
  const tail = running ? tailOf(content) : null;
  const shots = (build.verify ?? []).filter((g) => g.shot);

  // what the block says now
  const title = running ? (active ? doing(active, activeStep?.file ?? active.file) : build.phase?.replace(/…$/, "") || "Working on the files") : bad ? "Something needs a look" : build.steps.length === 1 ? `${build.steps[0].action === "edit" ? "Changed" : "Built"} ${build.steps[0].file}` : build.steps.length ? `${plural(build.steps.length, "file")} ready` : "Nothing to build";
  const note = running ? phrase || build.phase || "" : ""; // the real detail of the moment sits on the running row of the journal
  const who = active?.agent ? `${active.agent}${active.model ? ` · ${active.model}` : " · runs the page here"}` : "";

  // quiet for a while: say so, so a slow model never looks like a frozen window
  const sig = `${active?.id}|${active?.note}|${build.steps.map((s) => s.status).join()}|${all.length}`;
  if (seen.current.sig !== sig) seen.current = { sig, at: now };
  const quiet = running ? Math.floor((now - seen.current.at) / 1000) : 0;

  const total = running ? Math.max(0, Math.floor((now - Math.min(...all.map((g) => g.at ?? now), now)) / 1000)) : Math.round(all.reduce((n, g) => n + (g.sec ?? 0), 0));
  const fixes = all.filter((g) => g.id === "fix" && g.status === "done").length;
  const doneSub = bad ? (build.steps.find((s) => s.status === "error")?.note ?? lastRun?.note ?? "") : [plural(build.steps.length, "file"), lastRun?.status === "done" ? "page tested" : "", fixes ? plural(fixes, "fix") : ""].filter(Boolean).join(" · ");

  const rail = railOf(build, now).map((s) => { // a stretch never goes backwards
    const p = Math.max(s.pct, peaks.current.get(s.key) ?? 0);
    peaks.current.set(s.key, p);
    return { ...s, pct: p };
  });
  const items = buildItems(build);
  const cls = running ? "live" : bad ? "bad" : "done";

  return (
    <div className={`bp ${cls} ${landed ? "landed" : ""}`}>
      <button type="button" className="bp-head" aria-expanded={expanded} title={expanded ? "Hide the details" : "Show the details"} onClick={() => setOpen(!expanded)}>
        <span className="bp-glyph">{running ? <Spark size={18} /> : <StepIcon tag="write" state={bad ? "error" : "done"} size={16} />}</span>
        <span className="bp-main">
          <span className="bp-title"><span key={title} className={`bp-title-text ${running ? "shimmer" : ""}`} aria-live="polite">{title}</span></span>
          <span className="bp-sub">
            <span key={running ? note : "done"} className="bp-note bp-phrase">{running ? note : doneSub}{running && quiet >= 12 ? ` · no news for ${clock(quiet)}, still working` : ""}</span>
          </span>
        </span>
        <span className="bp-time">{total >= 1 ? clock(total) : ""}</span>
        <Chevron />
      </button>

      <Unfold open={running} className="bp-railwrap">
        <div className="bp-rail" role="progressbar" aria-label="Progress of the work" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rail.reduce((n, s) => n + s.pct * s.w, 0) / Math.max(1, rail.reduce((n, s) => n + s.w, 0)) * 100)}>
          {rail.map((s) => (
            <span key={s.key} className={`bp-seg-wrap ${s.state}`} style={{ flexGrow: s.w }}>
              <span className="bp-seg"><i style={{ transform: `scaleX(${s.pct})` }} /></span>
              {rail.length <= 5 && <span className="bp-seg-label">{s.label}</span>}
            </span>
          ))}
        </div>
        <div className="bp-lane">
          <div className="bp-lane-top">
            <WorkLog items={items} now={now} />
            {who && <span className="bp-who">{who}</span>}
          </div>
          <div className="bp-peek" aria-hidden>
            {tail?.lines.map((l) => <div key={l.n} className="bp-peek-line"><b>{l.n}</b><code>{l.text}</code></div>)}
          </div>
        </div>
      </Unfold>

      <Unfold open={expanded}>
        <div className="bp-body">
          {started.length > 1 && (
            <ul className="bp-files">
              {started.map((s, i) => (
                <li key={i} className={`bp-file ${s.status}`}>
                  <span className="bp-fmark">{fileMark(s.status)}</span>
                  <span className="bp-fname" title={s.job}>{s.file}</span>
                  <span className="bp-fmeta">{s.status === "running" ? (s.stages?.find((g) => g.status === "running")?.label ?? (s.action === "edit" ? "changing" : "writing")) : s.status === "waiting" ? "waiting" : s.status === "error" ? "stopped" : (() => { const t = Math.round((s.stages ?? []).reduce((n, g) => n + (g.sec ?? 0), 0)); return t >= 1 ? clock(t) : s.action === "edit" ? "changed" : "written"; })()}</span>
                  <div className="bp-ftrail"><Trail stages={s.stages ?? []} now={now} /></div>
                  {s.diff && <div className="bp-ftrail"><Diff text={s.diff} /></div>}
                </li>
              ))}
            </ul>
          )}
          {started.length === 1 && (
            <div className="bp-single">
              <Trail stages={started[0].stages ?? []} now={now} />
              {started[0].diff && <Diff text={started[0].diff} />}
            </div>
          )}
          {(build.start?.length ?? 0) > 0 && <div className="bp-single"><Trail stages={build.start!} now={now} /></div>}
          {build.spec && <details className="build-spec"><summary className="muted small">Rules written before the code</summary><pre>{build.spec}</pre></details>}
          {(build.verify?.length ?? 0) > 0 && <div className="bp-single"><Trail stages={build.verify!} now={now} /></div>}
          {shots.length > 0 && (
            <div className="bp-shots">
              {shots.map((g, i) => <figure key={i}><img src={g.shot} alt="The page after the test run" /><figcaption className="muted small">{g.label}</figcaption></figure>)}
            </div>
          )}
        </div>
      </Unfold>
    </div>
  );
}
