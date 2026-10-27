import type { AgentRun, BuildRun, BuildStage, BuildStep, LoopRun, ReviewRun } from "../shared/types";

/**
 * The journal of a piece of work, whatever it is: files being built, a document being written, a web search, sub-agents,
 * a code check, a model being loaded onto the NPU. Each task becomes a short list of steps; the window shows only four of
 * them (the last two finished, the one running, the next one), the whole list is one click away.
 */

export type WorkState = "done" | "running" | "waiting" | "error";
export type WorkKind = "build" | "doc" | "web" | "agents" | "check";

export interface WorkItem {
  id: string;
  /** What the step is called once finished ("Wrote index.html"). */
  label: string;
  /** What it is called while it runs, and before it starts ("Writing index.html"). */
  doing: string;
  state: WorkState;
  /** What the step is, for the sentence that renews itself under the title: a stage id ("write") or a kind of step ("think", "load"). */
  tag: string;
  /** A short real detail of the moment ("142 lines"). */
  note?: string;
  /** When it started (ms since 1970) and how long it took (s). */
  at?: number;
  sec?: number;
}

/** [after it ran, while it runs] */
const STAGE_TEXT: Record<string, [string, string]> = {
  plan: ["Planned the files", "Planning the files"],
  skeleton: ["Chose a starting point", "Choosing a starting point"],
  spec: ["Wrote the rules", "Writing the rules"],
  write: ["Wrote {f}", "Writing {f}"],
  edit: ["Changed {f}", "Changing {f}"],
  check: ["Checked {f}", "Checking {f}"],
  fix: ["Fixed {f}", "Fixing {f}"],
  baseline: ["Tried the page as it was", "Trying the page as it was"],
  run: ["Tested the page", "Testing the page"],
  look: ["Looked at the screen", "Looking at the screen"],
  shot: ["Checked the slide", "Checking the slide"],
  style: ["Chose the look", "Choosing the look"],
  explain: ["Wrote the summary", "Writing the summary"]
};

export function stageText(id: string, label: string, file?: string): { label: string; doing: string } {
  const t = STAGE_TEXT[id];
  const f = file ?? "";
  const fill = (s: string) => s.replace(" {f}", f ? ` ${f}` : "").replace("{f}", f);
  return t ? { label: fill(t[0]), doing: fill(t[1]) } : { label, doing: label };
}

/** The stage that usually follows a stage, shown greyed as "next" while the first one runs. */
const NEXT: Record<string, string> = { skeleton: "write", spec: "write", write: "check", edit: "check", check: "run", fix: "run" };

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const stageState = (g: BuildStage): WorkState => (g.status === "running" ? "running" : g.status === "error" ? "error" : "done");

/** A stage of the writing that names what it makes ("Creating goomba", "Drawing the scene") says that, not the generic "Writing the file". */
const PAST: [RegExp, string][] = [[/^Writing /, "Wrote "], [/^Creating /, "Created "], [/^Building /, "Built "], [/^Adding /, "Added "], [/^Drawing /, "Drew "], [/^Setting /, "Set "], [/^Listing /, "Listed "], [/^Starting /, "Started "], [/^Closing /, "Closed "], [/^Checking /, "Checked "]];
function writeText(label: string, done: boolean): { label: string; doing: string } {
  const past = PAST.reduce((l, [re, to]) => l.replace(re, to), label);
  return { label: done ? past : label, doing: label };
}

/** The drawing of a stage: a stage of the writing that draws an object or chooses the look has its own, the others go by their kind. */
export function stageTag(g: { id: string; label: string }): string {
  if (g.id === "write") return /^(Drawing|Drew) /.test(g.label) ? "picture" : /^(Choosing|Chose) the look/.test(g.label) ? "style" : "write";
  return g.id;
}

function stageItem(g: BuildStage, id: string, file?: string): WorkItem {
  const own = g.id === "write" && !/^write$/i.test(g.label);
  return { id, ...(own ? writeText(g.label, g.status !== "running") : stageText(g.id, g.label, file ?? g.file)), state: stageState(g), tag: stageTag(g), note: g.status === "running" ? (g.note ?? (own ? "just started" : undefined)) : undefined, at: g.at, sec: g.status === "running" ? undefined : g.sec };
}

function stepItem(s: BuildStep): WorkItem {
  const edit = s.action === "edit";
  const running = s.stages?.find((g) => g.status === "running");
  const sec = (s.stages ?? []).reduce((n, g) => n + (g.sec ?? 0), 0);
  const state: WorkState = s.status === "waiting" ? "waiting" : s.status === "running" ? "running" : s.status === "error" ? "error" : "done";
  // a slide is not written in one go: its text, its picture, its check each take a turn, so the row names the slide and the stage names the work
  const slide = /^Slide \d+/.test(s.file);
  const verb = running?.id === "shot" ? "Checking" : running?.id === "fix" ? "Fixing" : running?.id === "visual" ? "Drawing for" : "Writing";
  return {
    id: `f:${s.file}`, label: slide ? s.file : `${edit ? "Changed" : "Wrote"} ${s.file}`, doing: slide ? (state === "running" ? `${verb} ${s.file}` : s.file) : `${edit ? "Changing" : "Writing"} ${s.file}`, state,
    tag: running?.id ?? (edit ? "edit" : "write"), note: running ? (running.note ?? running.label) : undefined,
    at: s.stages?.find((g) => g.at)?.at, sec: state === "done" || state === "error" ? Math.round(sec) : undefined
  };
}

/** The steps of a build: planning, one per file (or one per stage when there is a single file), then the test run. */
export function buildItems(b: BuildRun): WorkItem[] {
  const live = (g: BuildStage) => g.status !== "skipped" && g.id !== "explain"; // the summary of the answer is not a step of the work
  const start = (b.start ?? []).filter(live).map((g, i) => stageItem(g, `s${i}`));
  const verify = (b.verify ?? []).filter(live).map((g, i) => ({ g, item: stageItem(g, `v${i}`) }));
  const before = verify.filter((v) => v.g.id === "baseline").map((v) => v.item);
  const after = verify.filter((v) => v.g.id !== "baseline").map((v) => v.item);
  const multi = b.steps.length > 1;
  const body = multi ? b.steps.map(stepItem) : b.steps.flatMap((s) => (s.stages ?? []).filter(live).map((g, i) => stageItem(g, `f:${s.file}:${i}`, s.file)));
  const items = [...start, ...before, ...body, ...after];
  if (b.status === "running") {
    const last = items[items.length - 1];
    const html = b.steps.some((s) => /\.html?$/i.test(s.file));
    if (multi && html && !verify.some((v) => v.g.id === "run")) items.push({ id: "n:run", ...stageText("run", "Test"), state: "waiting", tag: "run" });
    else if (!multi && last && last.state === "running" && NEXT[last.tag]) items.push({ id: `n:${NEXT[last.tag]}`, ...stageText(NEXT[last.tag], NEXT[last.tag], b.steps[0]?.file), state: "waiting", tag: NEXT[last.tag] });
  }
  return items;
}

export interface WorkInput {
  pending: boolean;
  build?: BuildRun;
  agents?: AgentRun[];
  review?: ReviewRun;
  loop?: LoopRun;
  /** A document being written or just written (Word, Excel, PowerPoint or markdown text): its sections are its steps. */
  document?: { title: string; open: boolean; content: string } | null;
}

/** The headings of a document as written so far (outside code fences): a section, a sheet or a slide each. */
export function sectionsOf(content: string): string[] {
  const out: string[] = [];
  let fence = false;
  for (const line of content.split("\n")) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    const m = !fence && /^#{1,3}\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push(trim(m[1].replace(/[*_`]/g, ""), 48));
  }
  return out;
}

/** The step of a helper that is neither a web search nor a folder read: the context being freed, or a sub-agent. */
function helperItem(a: AgentRun, state: WorkState): WorkItem {
  if (a.kind === "memo") {
    const freed = a.saved ? `Freed up ${a.saved.toLocaleString("en-US")} tokens of context` : "Freed up context";
    return { id: `a:${a.index}`, label: freed, doing: "Freeing up context", state, tag: "condense", note: state === "running" ? trim(a.task, 70) : undefined };
  }
  return { id: `a:${a.index}`, label: `${a.name} finished`, doing: `${a.name} is working`, state, tag: "agent", note: state === "running" ? trim(a.task, 70) : undefined };
}

/**
 * The journal is for complex work only: a build of files, a document, several helpers, searches and helpers that add up to three, or an
 * improve loop. A question gets none: its web search card and the line of its thinking already show what happens, and writing the answer is
 * never a step.
 */
export function deriveWork(i: WorkInput): { kind: WorkKind; items: WorkItem[] } | null {
  const isWeb = (a: AgentRun) => a.kind === "web" || /^Web: /.test(a.name);
  const webs = (i.agents ?? []).filter(isWeb).length;
  const helpers = (i.agents ?? []).length - webs;
  const complex = !!i.build || !!i.document || !!i.loop || helpers >= 2 || webs + helpers >= 3;
  if (!complex) return null;
  const kind: WorkKind = i.build ? "build" : i.document && !i.agents?.length && !i.loop ? "doc" : i.loop ? "check" : helpers ? "agents" : webs ? "web" : "doc";
  const items: WorkItem[] = [];
  if (i.build) {
    items.push(...buildItems(i.build));
  } else {
    for (const a of i.agents ?? []) {
      const q = trim(a.name.replace(/^Web:\s*/, ""), 44);
      const state: WorkState = a.status === "running" ? "running" : a.status === "error" ? "error" : "done";
      items.push(isWeb(a)
        ? { id: `a:${a.index}`, label: `Searched the web · ${q}`, doing: `Searching the web · ${q}`, state, tag: "search" }
        : helperItem(a, state));
    }
    if (i.document) {
      const heads = sectionsOf(i.document.content);
      const lines = i.document.content ? i.document.content.split("\n").length : 0;
      const live = i.document.open && i.pending;
      (heads.length ? heads : [i.document.title]).forEach((h, k, all) => {
        const last = k === all.length - 1;
        items.push({ id: `h:${k}`, label: `Wrote ${h}`, doing: `Writing ${h}`, state: last && live ? "running" : "done", tag: "art", note: last && live && lines > 0 ? `${lines} lines` : undefined });
      });
    }
    if (i.review) items.push({ id: "review", label: i.review.steps.some((x) => x.kind === "error") ? "The code check found problems" : "Checked the code", doing: "Checking the code", state: i.review.status === "running" ? "running" : "done", tag: "review" });
    if (i.loop) items.push({ id: "loop", label: `Improved the code · ${i.loop.accepted} kept`, doing: `Improving the code · round ${i.loop.round} of ${i.loop.rounds}`, state: i.loop.status === "running" ? "running" : "done", tag: "loop" });
  }
  if (!i.pending) for (const x of items) if (x.state === "running" || x.state === "waiting") x.state = "done";
  return { kind, items };
}

export interface SimpleInput {
  pending: boolean;
  agents?: AgentRun[];
  thinking?: boolean;
  answering?: boolean;
  notices?: string[];
  /** Names of the files the person attached to the message. */
  attachments?: string[];
}

/**
 * The steps of a simple task (a question, a file to read, a search, a look at the project folder), in the order they happened. The chat
 * folds them to the last one, with the others one click away. Writing the answer is never a step.
 */
export function deriveSimple(i: SimpleInput): WorkItem[] {
  const items: WorkItem[] = [];
  if (i.notices?.some((n) => /sorted by the router/.test(n))) items.push({ id: "route", label: "Sorted by the router", doing: "Sorting your request", state: "done", tag: "route" });
  const loaded = i.notices?.find((n) => /^Loaded skill: /.test(n));
  if (loaded) items.push({ id: "skill", label: loaded, doing: loaded.replace(/^Loaded/, "Loading"), state: "done", tag: "skill" });
  const moved = !!(i.answering || i.agents?.length || i.thinking);
  if (i.attachments?.length) {
    const names = i.attachments.length === 1 ? i.attachments[0] : `${i.attachments.length} files`;
    items.push({ id: "file", label: `Read ${names}`, doing: `Reading ${names}`, state: i.pending && !moved ? "running" : "done", tag: "file" });
  }
  const folder = (a: AgentRun) => /^Folder: /.test(a.name);
  const web = (a: AgentRun) => a.kind === "web" || /^Web: /.test(a.name);
  if (i.thinking) items.push({ id: "think", label: "Thought it through", doing: "Thinking", state: i.answering || !i.pending ? "done" : "running", tag: "think" });
  const asked = (i.agents ?? []).filter(folder);
  if (asked.length) {
    const last = asked[asked.length - 1];
    const running = asked.some((a) => a.status === "running");
    items.push({ id: "folder", label: `Read ${asked.length} file${asked.length === 1 ? "" : "s"} of the project`, doing: `Reading the project`, state: running ? "running" : "done", tag: "folder", note: running ? trim(last.task, 60) : undefined });
  }
  for (const a of i.agents ?? []) {
    if (folder(a)) continue;
    const q = trim(a.name.replace(/^Web:\s*/, ""), 44);
    const state: WorkState = a.status === "running" ? "running" : a.status === "error" ? "error" : "done";
    items.push(web(a)
      ? { id: `a:${a.index}`, label: `Searched the web · ${q}`, doing: `Searching the web · ${q}`, state, tag: "search" }
      : helperItem(a, state));
  }
  if (!i.pending) for (const x of items) if (x.state === "running" || x.state === "waiting") x.state = "done";
  return items;
}

/**
 * Keeps the steps seen so far across renders: a step that was running and is no longer announced is finished (a model loaded, a
 * cleaning done), and the time each step took is measured here when the data does not carry it.
 */
export function mergeLedger(prev: WorkItem[], now: WorkItem[], t: number): WorkItem[] {
  const before = new Map(prev.map((x) => [x.id, x]));
  const ids = new Set(now.map((x) => x.id));
  const carried = prev.filter((x) => !ids.has(x.id) && !x.id.startsWith("n:")).map((x) => (x.state === "running" || x.state === "waiting" ? finish(x, t) : x));
  const merged = now.map((x) => {
    const old = before.get(x.id);
    const at = x.at ?? old?.at ?? (x.state === "running" || x.state === "done" ? t : undefined);
    const out = { ...x, at };
    if (out.state === "done" && out.sec === undefined) out.sec = old?.sec ?? (at !== undefined ? Math.max(0, Math.round((t - at) / 1000)) : undefined);
    return out;
  });
  return [...carried, ...merged];
}
function finish(x: WorkItem, t: number): WorkItem {
  return { ...x, state: "done", note: undefined, sec: x.at !== undefined ? Math.max(0, Math.round((t - x.at) / 1000)) : x.sec };
}

export type RowPlace = "far" | "past2" | "past1" | "now" | "next" | "later";

/**
 * Where each step stands in the window: the last two finished before the first running step, every running step (the slides of a
 * presentation all stay open at once, and all of them show), then the next one. Everything else is folded.
 */
export function windowOf(items: WorkItem[]): { places: RowPlace[]; doneHidden: number; laterHidden: number } {
  let cur = items.findIndex((x) => x.state === "running");
  if (cur < 0) cur = items.findIndex((x) => x.state === "waiting");
  if (cur < 0) cur = items.length; // everything is done but the work goes on (the summary, a last check): the last steps stay in view
  let lastNow = cur;
  items.forEach((x, i) => { if (x.state === "running") lastNow = i; });
  const nextAt = items.findIndex((x, i) => i > lastNow && x.state === "waiting");
  const places: RowPlace[] = items.map((x, i) => {
    if (i < cur) return cur - i === 1 ? "past1" : cur - i === 2 ? "past2" : "far";
    if (x.state === "running" || i === cur) return "now";
    return i === nextAt ? "next" : "later";
  });
  return { places, doneHidden: places.filter((p) => p === "far").length, laterHidden: places.filter((p) => p === "later").length };
}

export const fmtSec = (s: number) => (s < 60 ? `${Math.floor(s)}s` : `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, "0")}s`);

/** The quiet line of a finished piece of work. */
export function finishedLine(items: WorkItem[]): { text: string; bad: boolean } {
  const bad = items.filter((x) => x.state === "error").length;
  const sec = items.reduce((n, x) => n + (x.sec ?? 0), 0);
  const steps = `${items.length} step${items.length === 1 ? "" : "s"}`;
  if (bad) return { text: `${bad} step${bad === 1 ? "" : "s"} need${bad === 1 ? "s" : ""} a look · ${steps}`, bad: true };
  return { text: `${steps}${sec >= 1 ? ` · ${fmtSec(sec)}` : ""}`, bad: false };
}

/** Short sentences, one per kind of step, that take turns under the title so the line never sits still. */
const PHRASES: Record<string, string[]> = {
  condense: ["Summarizing the oldest messages", "Keeping the decisions and the files, dropping the small talk"],
  plan: ["Choosing the files and their order", "Deciding what each file holds"],
  skeleton: ["Comparing the request with pages already tested", "Picking the closest starting point"],
  spec: ["Setting the rules before any code", "Listing the keys and buttons the page needs"],
  write: ["Writing the page in one piece", "Laying out the screen, then the logic", "Connecting the controls to the logic"],
  edit: ["Changing only the lines that need it", "Keeping the rest of the file as it is"],
  check: ["Reading the script for errors", "Making sure every element it needs exists"],
  fix: ["Correcting what the check found", "Keeping the fix as small as possible"],
  baseline: ["Running the page as it was, for comparison"],
  run: ["Pressing the keys and buttons", "Watching what the page does", "Taking a screenshot"],
  look: ["Looking at the screenshot", "Checking that nothing is cut off"],
  shot: ["Drawing the slide as it will look", "Checking that no text is cut off"],
  explain: ["Summing up what was done"],
  think: ["Thinking the request through", "Weighing the options before writing"],
  clean: ["Looking at what the NPU still holds", "Freeing memory without touching your conversations"],
  route: ["Sorting the request"],
  file: ["Reading the file", "Taking in the text"],
  folder: ["Looking through the project", "Reading one file after another"],
  load: ["Reserving memory on the NPU", "Loading the model piece by piece", "A large model can take a minute or two"],
  search: ["Asking the search engine", "Keeping the sources that answer"],
  agent: ["A helper is working on its part", "Waiting for its result"],
  review: ["Running the code", "Reading the errors it raises"],
  loop: ["Trying an improvement", "Keeping it only if the result gets better"],
  art: ["Writing the document", "Keeping the structure consistent"],
  answer: ["Putting the answer together"]
};

export function phrasesFor(tag: string | undefined): string[] {
  return (tag && PHRASES[tag]) || ["Working on it"];
}
