import type { ChatEvent, ChatMessage, ReviewRun, ReviewStep } from "../shared/types";
import { ArtifactSegment, artifactsIn, replaceArtifact } from "./artifacts";
import type { CheckReport } from "./codecheck";
import { stripSubagents } from "./agents";

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
    const code = cut ? `${f.content.slice(0, share)}\n… [cut: ${f.content.length - share} more characters]` : f.content;
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

/** SEARCH / REPLACE on one file: exact first, then ignoring indentation and trailing spaces. */
export function applyEdits(content: string, edits: { search: string; replace: string }[]): { content: string; applied: number; failed: number } {
  let out = content;
  let applied = 0;
  for (const e of edits) {
    if (!e.search.trim()) continue;
    const at = out.indexOf(e.search);
    if (at >= 0) { out = out.slice(0, at) + e.replace + out.slice(at + e.search.length); applied++; continue; }
    const lines = out.split("\n");
    const want = e.search.split("\n").map((l) => l.trim());
    while (want.length && !want[0]) want.shift();
    while (want.length && !want[want.length - 1]) want.pop();
    let hit = -1;
    for (let i = 0; i + want.length <= lines.length && hit < 0; i++) {
      if (want.every((w, k) => lines[i + k].trim() === w)) hit = i;
    }
    if (hit < 0) continue;
    lines.splice(hit, want.length, ...e.replace.replace(/\n+$/, "").split("\n"));
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
  check: (a: ArtifactSegment) => Promise<CheckReport>;
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
  const note = (kind: ReviewStep["kind"], t: string) => steps.push({ kind, text: t });
  let pass = 0;
  try {
    for (;;) {
      const arts = artifactsIn(text);
      note("info", `Running ${plural(arts.length, "file")}…`);
      yield run("running");
      const reports: CheckReport[] = [];
      for (const a of arts) {
        if (o.signal?.aborted) throw new Error("aborted");
        reports.push(await o.check(a));
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
      note("ok", `${o.reviewer ?? "The model"} changed ${plural(fixed.changed, "file")}${fixed.failed ? `; ${plural(fixed.failed, "edit")} did not apply` : ""}.`);
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

/** The newest version of each artifact the assistant wrote earlier in the conversation, by title. */
export function latestArtifacts(history: ChatMessage[]): ArtifactSegment[] {
  const byTitle = new Map<string, ArtifactSegment>();
  for (const m of history) {
    if (m.role !== "assistant" || typeof m.content !== "string") continue;
    for (const a of artifactsIn(m.content)) if (!/^\[earlier version/.test(a.content)) byTitle.set(norm(a.title), a);
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
