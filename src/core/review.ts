import type { ChatEvent, ChatMessage, ReviewRun, ReviewStep } from "../shared/types";
import { ArtifactSegment, artifactsIn, replaceArtifact } from "./artifacts";
import type { CheckReport } from "./codecheck";
import { stripSubagents } from "./agents";
import { diffText, errorLines, excerpts, outline, outlineText, Range } from "./focus";

export const REVIEWER_INSTRUCTIONS = [
  "You are a senior code reviewer. A smaller assistant wrote the file(s) below for the user's request, and they were run.",
  "Find the bugs that make the program not do what was asked: crashes, errors, logic mistakes, missing features, broken controls. Do not touch style, naming or formatting.",
  "If the file is fine, reply with the single word LGTM.",
  "Otherwise fix it with edit blocks, nothing else:",
  '<edit file="exact file name">',
  "<<<<<<< SEARCH",
  "lines copied exactly from the file, enough to be unique",
  "=======",
  "the corrected lines",
  ">>>>>>> REPLACE",
  "</edit>",
  "Use several blocks when needed. Only if the file is badly broken, send it whole as <artifact type=\"…\" title=\"exact file name\">…</artifact> instead.",
  "Pages cannot use the network or external files: everything must be inline.",
  "If a screenshot is attached, it shows the page after its keys and buttons were pressed: check that it looks like what was asked."
].join("\n");

export interface ReviewFile { title: string; kind: string; language: string; content: string }

/** The user message for the reviewer: request, files (cut to the budget) and what happened when they ran. */
export function buildReviewPrompt(request: string, files: ReviewFile[], reports: CheckReport[], maxChars: number): string {
  const share = Math.max(2000, Math.floor(maxChars / Math.max(1, files.length)));
  const body = files.map((f, i) => {
    const cut = f.content.length > share;
    // a file that does not fit: its map, then the code around the errors (or the start), never an arbitrary head
    const lines = cut ? errorLines(reports[i]?.errors ?? []).map((l): Range => [Math.max(1, l - 10), l + 15]) : [];
    const code = !cut ? f.content : `${outlineText(f.title, f.content, outline(f.content), 60)}\n\n${excerpts(f.content, lines.length ? lines : [[1, 60]], Math.max(1000, share - 1500))}\n[the file has ${f.content.length} characters; only the parts above are shown, ask for edits on these lines only]`;
    const r = reports[i];
    const run = !r || r.ran === "none" ? "It could not be run."
      : r.errors.length ? `${r.ran === "page" ? "Running it" : "Parsing it"} gave these errors:\n${r.errors.map((e) => `- ${e}`).join("\n")}`
        : r.ran === "page" ? "It ran and pressed its keys and buttons without any error, but check the logic." : "It parses without a syntax error.";
    const notes = r?.notes?.length ? `\nObserved: ${r.notes.join(" ")}` : "";
    return `<file name="${f.title.replace(/"/g, "'")}" type="${f.kind === "code" ? f.language : f.kind}">\n${code}\n</file>\n${run}${notes}`;
  }).join("\n\n");
  return `The user asked:\n${request.trim().slice(0, 2000)}\n\n${body}`;
}

export interface ParsedReply {
  lgtm: boolean;
  edits: { file: string | null; search: string; replace: string }[];
  files: { title: string; content: string }[];
}

const BLOCK = /<<<<<<<[ \t]*SEARCH[ \t]*\r?\n([\s\S]*?)\r?\n=======[ \t]*\r?\n([\s\S]*?)\r?\n?>>>>>>>[ \t]*REPLACE/g;

export function parseReply(reply: string): ParsedReply {
  const edits: ParsedReply["edits"] = [];
  const tagged = /<edit(?:\s+file\s*=\s*(?:"([^"]*)"|'([^']*)'))?\s*>([\s\S]*?)<\/edit>/gi;
  let rest = reply;
  for (const m of reply.matchAll(tagged)) {
    for (const b of m[3].matchAll(BLOCK)) edits.push({ file: (m[1] ?? m[2] ?? "").trim() || null, search: b[1], replace: b[2] });
    rest = rest.replace(m[0], "");
  }
  // blocks written without the wrapper
  for (const b of rest.matchAll(BLOCK)) edits.push({ file: null, search: b[1], replace: b[2] });
  const files = artifactsIn(reply).map((a) => ({ title: a.title, content: a.content }));
  return { lgtm: !edits.length && !files.length && /^\W*(LGTM|looks good|no (bugs|issues|problems))/i.test(reply.trim()), edits, files };
}

/** Small models decorate what they copy: a code fence around it, or the line numbers they were shown. */
function undecorate(s: string): string {
  let t = s.replace(/^\s*```[\w+-]*\r?\n/, "").replace(/\r?\n\s*```\s*$/, "");
  const lines = t.split("\n");
  if (lines.length && lines.every((l) => !l.trim() || /^\s*\d{1,5}\s*[:|]\s?/.test(l))) t = lines.map((l) => l.replace(/^\s*\d{1,5}\s*[:|]\s?/, "")).join("\n");
  return t;
}

const squash = (l: string) => l.trim().replace(/\s+/g, " ");

/** The first line of `lines` where the wanted lines sit (compared by `same`), or -1. */
function findLines(lines: string[], want: string[], same: (a: string, b: string) => boolean): number {
  for (let i = 0; i + want.length <= lines.length; i++) if (want.every((w, k) => same(lines[i + k], w))) return i;
  return -1;
}

/** The window of the file most like the wanted lines (at least 3/4 of them equal, in order), or -1: a model that drifted a little. */
function findClose(lines: string[], want: string[]): number {
  if (want.length < 2) return -1;
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i + want.length <= lines.length; i++) {
    let score = 0;
    for (let k = 0; k < want.length; k++) if (squash(lines[i + k]) === squash(want[k])) score++;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 2 && bestScore / want.length >= 0.75 ? best : -1;
}

/** SEARCH / REPLACE on one file: exact first, then ignoring indentation, spacing and decoration, then the closest lines. */
export function applyEdits(content: string, edits: { search: string; replace: string }[]): { content: string; applied: number; failed: number } {
  let out = content;
  let applied = 0;
  for (const e of edits) {
    if (!e.search.trim()) continue;
    const at = out.indexOf(e.search);
    if (at >= 0) { out = out.slice(0, at) + e.replace + out.slice(at + e.search.length); applied++; continue; }
    const search = undecorate(e.search);
    const replace = undecorate(e.replace);
    const at2 = search === e.search ? -1 : out.indexOf(search);
    if (at2 >= 0) { out = out.slice(0, at2) + replace + out.slice(at2 + search.length); applied++; continue; }
    const lines = out.split("\n");
    const want = search.split("\n").map((l) => l.trim());
    while (want.length && !want[0]) want.shift();
    while (want.length && !want[want.length - 1]) want.pop();
    if (!want.length) continue;
    let hit = findLines(lines, want, (a, b) => a.trim() === b);
    if (hit < 0) hit = findLines(lines, want.map(squash), (a, b) => squash(a) === b);
    if (hit < 0) hit = findClose(lines, want);
    if (hit < 0) continue;
    lines.splice(hit, want.length, ...replace.replace(/\n+$/, "").split("\n"));
    out = lines.join("\n");
    applied++;
  }
  return { content: out, applied, failed: edits.filter((e) => e.search.trim()).length - applied };
}

const norm = (s: string) => s.trim().toLowerCase();

/** The answer text after the reviewer's reply is applied to it. */
export function integrate(text: string, reply: ParsedReply): { text: string; changed: number; failed: number; touched: number[] } {
  const arts = artifactsIn(text);
  const content = arts.map((a) => a.content);
  let failed = 0;
  const touched = new Set<number>();
  const target = (title: string | null): number[] => {
    if (!title) return arts.map((_, i) => i);
    const byTitle = arts.map((a, i) => (norm(a.title) === norm(title) ? i : -1)).filter((i) => i >= 0);
    if (byTitle.length) return byTitle;
    const n = Number(title);
    return Number.isInteger(n) && arts[n - 1] ? [n - 1] : arts.length === 1 ? [0] : [];
  };
  for (const e of reply.edits) {
    const idx = target(e.file);
    const i = idx.find((k) => applyEdits(content[k], [e]).applied > 0);
    if (i === undefined) { failed++; continue; }
    content[i] = applyEdits(content[i], [e]).content;
    touched.add(i);
  }
  for (const f of reply.files) {
    const i = target(f.title)[0];
    if (i === undefined || !f.content.trim()) { failed++; continue; }
    content[i] = f.content;
    touched.add(i);
  }
  let out = text;
  for (const i of touched) if (content[i] !== arts[i].content) out = replaceArtifact(out, i, content[i]);
  const changed = [...touched].filter((i) => content[i] !== arts[i].content);
  return { text: out, changed: changed.length, failed, touched: changed };
}

export interface ReviewOptions {
  id: string;
  /** The whole answer so far, artifacts included. */
  answer: string;
  /** What the user asked, for the reviewer. */
  request: string;
  /** Messages the writer got, for the case where it fixes its own errors. */
  history: ChatMessage[];
  /** Check-and-fix passes at most. */
  rounds: number;
  /** Name of the reviewer model, or null when the writer fixes its own errors. */
  reviewer: string | null;
  /** Characters of code the reviewer can read. */
  maxChars: number;
  /** The reviewer can look at images: it gets the screenshots. */
  vision?: boolean;
  /** Steps already done for this answer (an edit applied), shown first in the card. */
  prefix?: ReviewStep[];
  /** Runs one file; `all` are the files of the same answer (a page needs its stylesheet and script). */
  check: (a: ArtifactSegment, all: ArtifactSegment[]) => Promise<CheckReport>;
  askReviewer: (messages: ChatMessage[]) => Promise<string>;
  askWriter: (messages: ChatMessage[]) => Promise<string>;
  signal?: AbortSignal;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Run what the model wrote, show the errors to a reviewer (or to the writer), apply the fixes and run again.
 * Yields "review" events (the whole run each time) and "replace" events with the corrected answer.
 */
export async function* reviewCode(o: ReviewOptions): AsyncGenerator<ChatEvent> {
  let text = o.answer;
  if (!artifactsIn(text).length) {
    if (o.prefix?.length) yield { id: o.id, type: "review", review: { status: "done", steps: [...o.prefix] } };
    return;
  }
  const steps: ReviewStep[] = [...(o.prefix ?? [])];
  let shots: string[] = [];
  const run = (status: ReviewRun["status"]): ChatEvent => ({ id: o.id, type: "review", review: { status, steps: [...steps], shots: [...shots] } });
  const note = (kind: ReviewStep["kind"], t: string, diff?: string) => steps.push(diff ? { kind, text: t, diff } : { kind, text: t });
  let pass = 0;
  try {
    for (;;) {
      const arts = artifactsIn(text);
      note("info", `Running ${plural(arts.length, "file")}…`);
      yield run("running");
      const reports: CheckReport[] = [];
      for (const a of arts) {
        if (o.signal?.aborted) throw new Error("aborted");
        reports.push(await o.check(a, arts));
      }
      steps.pop();
      shots = reports.flatMap((r) => (r.shot ? [r.shot] : []));
      let errors = 0;
      arts.forEach((a, i) => {
        const r = reports[i];
        errors += r.errors.length;
        for (const e of r.errors) note("error", `${a.title}: ${e}`);
        for (const n of r.notes ?? []) note("info", `${a.title}: ${n}`);
        if (!r.errors.length && r.ran !== "none") note("ok", `${a.title}: ${r.ran === "page" ? "ran without errors" : "no syntax error"}`);
      });
      if (pass >= o.rounds) {
        if (errors) note("error", `${plural(errors, "error")} left after ${plural(pass, "fix round")}.`);
        break;
      }
      if (!o.reviewer && !errors) break;

      pass++;
      const files = arts.map((a) => ({ title: a.title, kind: a.kind, language: a.language, content: a.content }));
      note("info", o.reviewer ? `${o.reviewer} is reading the code…` : "The model is fixing its errors…");
      yield run("running");
      const reply = o.reviewer
        ? await o.askReviewer([{ role: "system", content: REVIEWER_INSTRUCTIONS }, {
          role: "user",
          content: o.vision && shots.length
            ? [{ type: "text", text: buildReviewPrompt(o.request, files, reports, o.maxChars) }, ...shots.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
            : buildReviewPrompt(o.request, files, reports, o.maxChars)
        }])
        : await o.askWriter([
          ...o.history,
          { role: "assistant", content: stripSubagents(text) },
          { role: "user", content: `I ran your code and it has errors:\n${arts.map((a, i) => reports[i].errors.length ? `${a.title}:\n${reports[i].errors.map((e) => `- ${e}`).join("\n")}` : "").filter(Boolean).join("\n\n")}\n\nSend the complete corrected file(s) in the same <artifact> format, nothing else.` }
        ]);
      steps.pop();
      if (o.signal?.aborted) throw new Error("aborted");
      const parsed = parseReply(reply);
      if (parsed.lgtm && !errors) { note("ok", `${o.reviewer ?? "Reviewer"} found no problem.`); break; }
      const fixed = integrate(text, parsed);
      if (!fixed.changed) {
        note("error", parsed.lgtm ? `The reviewer found nothing to change, but ${plural(errors, "error")} remain.`
          : reply.trim() ? "The fixes could not be applied to the code." : "The reviewer sent an empty answer.");
        break;
      }
      text = fixed.text;
      const after = artifactsIn(text);
      note("ok", `${o.reviewer ?? "The model"} changed ${plural(fixed.changed, "file")}${fixed.failed ? `; ${plural(fixed.failed, "edit")} did not apply` : ""}.`,
        fixed.touched.map((i) => diffText(arts[i].content, after[i].content)).filter(Boolean).join("\n\n"));
      yield { id: o.id, type: "replace", text };
      yield run("running");
    }
  } catch (e) {
    if (o.signal?.aborted) throw e;
    note("error", `The code check stopped: ${(e as Error).message}`);
  }
  yield run("done");
}

// ---------------------------------------------------------------- editing instead of rewriting

const OPEN_FILE = (a: { kind: string; language: string; title: string }) =>
  `<artifact type="${a.kind}"${a.kind === "code" ? ` language="${a.language}"` : ""} title="${a.title.replace(/"/g, "'")}">`;

/** The newest version of each artifact the assistant wrote earlier in the conversation, by title, the most recently written LAST. */
export function latestArtifacts(history: ChatMessage[]): ArtifactSegment[] {
  const byTitle = new Map<string, ArtifactSegment>();
  for (const m of history) {
    if (m.role !== "assistant" || typeof m.content !== "string") continue;
    for (const a of artifactsIn(m.content)) {
      if (/^\[earlier version/.test(a.content)) continue;
      byTitle.delete(norm(a.title)); // re-inserted: a file written again moves to the end, so the order is by recency
      byTitle.set(norm(a.title), a);
    }
  }
  return [...byTitle.values()];
}

/** Older versions of an artifact only cost context: keep the newest in full, point the others at it. */
export function compactHistory(history: ChatMessage[]): ChatMessage[] {
  const lastAt = new Map<string, number>();
  history.forEach((m, i) => {
    if (m.role === "assistant" && typeof m.content === "string") for (const a of artifactsIn(m.content)) lastAt.set(norm(a.title), i);
  });
  return history.map((m, i) => {
    if (m.role !== "assistant" || typeof m.content !== "string") return m;
    let text = m.content;
    artifactsIn(text).forEach((a, k) => {
      if ((lastAt.get(norm(a.title)) ?? i) > i) text = replaceArtifact(text, k, "[earlier version left out: a newer one follows]");
    });
    return text === m.content ? m : { ...m, content: text };
  });
}

/** An answer without its edit blocks. */
export function stripEdits(text: string): string {
  return text
    .replace(/<edit(?:\s[^>]*)?>[\s\S]*?<\/edit>/gi, "")
    .replace(/<<<<<<<[ \t]*SEARCH[\s\S]*?>>>>>>>[ \t]*REPLACE/g, "")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export interface EditOutcome {
  /** The answer with the edits turned into full, corrected artifacts. Same as the input when nothing applied. */
  text: string;
  titles: string[];
  /** Edit blocks that did not match the file. */
  failed: number;
  total: number;
}

/**
 * The model answered a "fix this" with edit blocks instead of the whole file: apply them to the newest version of the
 * file from earlier in the chat and put the corrected file in the answer. null when the answer holds no edit.
 */
export function resolveEdits(answer: string, history: ChatMessage[]): EditOutcome | null {
  if (artifactsIn(answer).length) return null; // it sent whole files: nothing to apply
  const reply = parseReply(answer);
  if (!reply.edits.length) return null;
  const base = latestArtifacts(history);
  const joined = base.map((a) => `${OPEN_FILE(a)}\n${a.content.replace(/\s+$/, "")}\n</artifact>`).join("\n");
  const done = integrate(joined, { lgtm: false, edits: reply.edits, files: [] });
  const fixed = artifactsIn(done.text);
  const files = done.touched.map((i) => `${OPEN_FILE(fixed[i])}\n${fixed[i].content.replace(/\s+$/, "")}\n</artifact>`);
  const prose = stripEdits(answer);
  return {
    text: files.length ? `${prose ? `${prose}\n\n` : ""}${files.join("\n")}` : answer,
    titles: done.touched.map((i) => fixed[i].title),
    failed: done.failed,
    total: reply.edits.length
  };
}
