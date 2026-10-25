import type { ChatEvent, ChatMessage, ReviewRun, ReviewStep } from "../shared/types";
import { ArtifactSegment, artifactsIn, replaceArtifact, stripFence, withoutPointers } from "./artifacts";
export { withoutPointers };
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

/** A page loads its script with a plain <script> tag, where `export` and `import` are syntax errors. */
export function plainScript(code: string): string {
  return code
    .replace(/^([ \t]*)export\s+default\s+(?=(?:async\s+)?function|class)/gm, "$1")
    .replace(/^([ \t]*)export\s+(?=(?:async\s+)?function|class|const|let|var)/gm, "$1")
    .replace(/^[ \t]*export\s*\{[^}\n]*\}[ \t]*(?:from\s*["'][^"'\n]*["'])?;?[ \t]*\r?\n?/gm, "")
    .replace(/^[ \t]*import\s+(?:[\w*${},\s]+\s+from\s+)?["'][^"'\n]*["'];?[ \t]*\r?\n?/gm, "");
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
    // a file that is only a pointer to the real one is no file
    if (i === undefined || !withoutPointers(f.content).trim()) { failed++; continue; }
    content[i] = f.content;
    touched.add(i);
  }
  for (const i of touched) content[i] = withoutPointers(content[i]);
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
  /** Characters of code the writer can take in a repair session (the file is read once and written once). */
  repairChars?: number;
  /** The names a file defines or uses (ids, classes, functions), so a repair keeps the files consistent. */
  contractOf?: (file: ReviewFile) => string;
  check: (a: ArtifactSegment, all: ArtifactSegment[]) => Promise<CheckReport>;
  askReviewer: (messages: ChatMessage[]) => Promise<string>;
  askWriter: (messages: ChatMessage[]) => Promise<string>;
  signal?: AbortSignal;
}

export const REPAIR_INSTRUCTIONS = [
  "You repair one file of a small web project. You get the file, the errors it causes when it is run, and the names the other files define.",
  "Reply with the complete corrected file, raw: no explanation, no code fence, no <artifact> tag.",
  "The file MUST change: fix exactly the errors listed and keep everything else as it is. Never shorten the file, never write '...' or a comment like 'rest of the code'.",
  "A .js file is a plain script loaded by a <script> tag: no import, no export. A page that holds its own style and script keeps them inside it. Everything is inline: no network, no external files, no eval."
].join("\n");

export function repairPrompt(request: string, file: ReviewFile, errors: string[], others: string): string {
  return `The user asked:\n${request.trim().slice(0, 1200)}\n\n${others ? `The other files of the project (keep the names consistent):\n${others}\n\n` : ""}Errors when ${file.title} is run:\n${errors.map((e) => `- ${e}`).join("\n")}\n\nThe file ${file.title}:\n${file.content}\n\nSend the complete corrected ${file.title} now.`;
}

/** The file out of a writer's reply: it may come in an <artifact> tag or a code fence even though it was told not to. */
export function rawFile(reply: string, language: string): string {
  const arts = artifactsIn(reply);
  let t = arts.length ? arts[0].content : stripFence(reply.replace(/^\s*<artifact\b[^>]*>\s*/i, "").replace(/\s*<\/artifact>\s*$/i, ""));
  t = withoutPointers(t);
  if (/^(javascript|js)$/i.test(language)) t = plainScript(t);
  return t.replace(/\s+$/, "") + "\n";
}

/** Errors by the file that has to change: a page reports its script's errors, but only the script can fix them. Each is listed once. */
export function blame(arts: { title: string }[], reports: { errors: string[] }[]): { idx: number; msg: string }[] {
  const seen = new Set<string>();
  const out: { idx: number; msg: string }[] = [];
  reports.forEach((r, i) => {
    for (const e of r.errors) {
      const m = /^([^\s:]+\.\w+):\s+([\s\S]+)$/.exec(e);
      const named = m ? arts.findIndex((a) => norm(a.title) === norm(m[1])) : -1;
      const idx = named >= 0 ? named : i;
      const msg = named >= 0 ? m![2] : e;
      if (seen.has(`${idx}|${msg}`)) continue;
      seen.add(`${idx}|${msg}`);
      out.push({ idx, msg });
    }
  });
  return out;
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
      // a script that is loaded by a plain <script> tag cannot use export or import: take them out before running it
      const modular = artifactsIn(text).some((a) => a.kind === "html" && /type\s*=\s*["']module/i.test(a.content));
      const plained = modular ? [] : artifactsIn(text).flatMap((a, i) => (a.kind === "code" && /^(javascript|js)$/i.test(a.language) && plainScript(a.content) !== a.content ? [i] : []));
      if (plained.length) {
        const before = artifactsIn(text);
        for (const i of plained) text = replaceArtifact(text, i, plainScript(before[i].content));
        note("ok", `Took export and import out of ${plained.map((i) => before[i].title).join(", ")}: a page loads it as a plain script.`);
        yield { id: o.id, type: "replace", text };
      }
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
      const blamed = blame(arts, reports);
      errors = blamed.length;
      for (const b of blamed) note("error", `${arts[b.idx].title}: ${b.msg}`);
      arts.forEach((a, i) => {
        const r = reports[i];
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
      let parsed: ParsedReply;
      let empty = false;
      if (o.reviewer) {
        const reply = await o.askReviewer([{ role: "system", content: REVIEWER_INSTRUCTIONS }, {
          role: "user",
          content: o.vision && shots.length
            ? [{ type: "text", text: buildReviewPrompt(o.request, files, reports, o.maxChars) }, ...shots.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
            : buildReviewPrompt(o.request, files, reports, o.maxChars)
        }]);
        parsed = parseReply(reply);
        empty = !reply.trim();
      } else {
        // the writer repairs one file at a time, in a session of its own that sees only that file, its errors and the other files' names
        parsed = { lgtm: false, edits: [], files: [] };
        const room = o.repairChars ?? 6000;
        for (const idx of [...new Set(blamed.map((b) => b.idx))]) {
          if (o.signal?.aborted) throw new Error("aborted");
          const f = files[idx];
          const errs = blamed.filter((b) => b.idx === idx).map((b) => b.msg);
          const others = files.filter((_, k) => k !== idx).map((x) => `${x.title}\n${o.contractOf?.(x) ?? ""}`.trim()).join("\n\n").slice(0, Math.floor(room * 0.25));
          if (f.content.length <= room * 0.45) {
            const reply = await o.askWriter([{ role: "system", content: REPAIR_INSTRUCTIONS }, { role: "user", content: repairPrompt(o.request, f, errs, others) }]);
            const content = rawFile(reply, f.language);
            // a "fix" that is empty, unchanged or much shorter than the file is a lazy or cut-off answer: keep the file as it was
            if (content.trim() && content.trim() !== f.content.trim() && content.length >= f.content.length * 0.5) parsed.files.push({ title: f.title, content });
          } else {
            const reply = await o.askWriter([{ role: "system", content: REVIEWER_INSTRUCTIONS }, { role: "user", content: buildReviewPrompt(o.request, [f], [{ ran: "syntax", errors: errs }], Math.floor(room * 0.6)) }]);
            parsed.edits.push(...parseReply(reply).edits.map((e) => ({ ...e, file: e.file ?? f.title })));
          }
        }
      }
      steps.pop();
      if (o.signal?.aborted) throw new Error("aborted");
      if (parsed.lgtm && !errors) { note("ok", `${o.reviewer ?? "Reviewer"} found no problem.`); break; }
      const fixed = integrate(text, parsed);
      if (!fixed.changed) {
        note("error", parsed.lgtm ? `The reviewer found nothing to change, but ${plural(errors, "error")} remain.`
          : empty ? "The reviewer sent an empty answer." : "The fixes could not be applied to the code.");
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

/** What the reader sees of an answer that may still be streaming: edit blocks (finished or not) are work for the app, not text for the chat. */
export function hideEdits(text: string): string {
  let out = text.replace(/<edit(?:\s[^>]*)?>[\s\S]*?<\/edit>/gi, "").replace(/<<<<<<<[ \t]*SEARCH[\s\S]*?>>>>>>>[ \t]*REPLACE/g, "");
  const open = out.search(/<edit(?:\s|>|$)|<<<<<<<[ \t]*SEARCH/i);
  if (open >= 0) out = out.slice(0, open);
  for (const tag of ["<edit", "<<<<<<<"]) {
    for (let k = Math.min(tag.length - 1, out.length); k > 0; k--) {
      if (tag.startsWith(out.slice(-k))) { out = out.slice(0, out.length - k); break; }
    }
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
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
