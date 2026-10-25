import type { ArtifactKind, BuildRun, BuildStep, ChatEvent, ChatMessage, ChatStats, WriterRole } from "../shared/types";
import { ARTIFACT_INSTRUCTIONS, parseSegments } from "./artifacts";
import { FileLike, linkedFiles, mergeFiles, wireHtml } from "./bundle";
import { FOCUS_FROM, Range, diffText, excerpts, outline, outlineText, resolveSpots } from "./focus";
import { applyEdits, latestArtifacts, parseReply, plainScript, rawFile, REPAIR_INSTRUCTIONS, repairPrompt, stripEdits, withoutPointers } from "./review";
import { quickErrors } from "./codecheck";
import { artifactsIn, replaceArtifact } from "./artifacts";
import { stripSubagents } from "./agents";

/**
 * Work on files without keeping the files in the conversation. The main session talks to the user; the code is written
 * and changed by short sessions of their own, one after another (the NPU holds one model), each one seeing only what its
 * job needs: a planner (names and jobs, never code), one writer per new file, one editor per changed file that works on
 * the lines concerned and sends edit blocks, and at the end the main session explains what was done.
 * Nothing here is switched on by the user: a request that needs files goes through it, a chat does not.
 */

export const MAX_PLAN_FILES = 6;
export const RETRY_NOTE = "None of your SEARCH blocks matched the file, so nothing changed. Copy the old lines character for character from the file shown above (no line numbers, no code fence, keep the indentation), keep each SEARCH short (2 to 6 lines), and send the edit blocks again.";

export interface PlanFile { name: string; action: "new" | "edit"; job: string }
export interface Plan {
  mode: "build" | "answer";
  /** One line shared by every session of the build: palette, mood, fonts, motion. Keeps the files looking like one site. */
  design: string;
  files: PlanFile[];
  /** Files (and optionally landmarks of them) to show the main session to answer a question. */
  read: { name: string; spots: string[] }[];
}

export const PLANNER_INSTRUCTIONS = [
  "You plan the work of a coding assistant. You never write code. You get the user's request and the list of files that exist, and you decide what happens.",
  "Reply with lines in exactly this form and nothing else:",
  "Mode: answer   (the DEFAULT: a question, a calculation, a check (\"is this right?\", \"yes or no\"), an explanation, advice or a chat; no file changes)    or    Mode: build   (only when the user clearly asks to make, write or change a page, app, game, script or other file)",
  "File: <file name> | new | <one sentence: what this file must contain or do>",
  "File: <file name> | edit | <one sentence: what to change in it>",
  "Design: <one line for a site or page: the mood, 3 or 4 colours, fonts, the kind of animation>   (only with Mode: build, for anything visual)",
  "Read: <file name> (<landmark>, <landmark>)   (only with Mode: answer, to show you part of a file; the landmarks are optional)",
  "Rules:",
  "- Choose build only if the user asks for a file or a program. Maths, finance, homework, \"how\" and \"why\" questions, checking a formula or a result, and a chat are answer, even when they contain numbers or the word \"exercise\". When in doubt, answer.",
  "- A web page or small app is several files: index.html (structure and content), style.css (all the styling), script.js (the behaviour). Leave script.js out when the page needs no behaviour.",
  "- To change something that exists, use edit on only the files concerned: a colour change touches style.css only, a new button touches index.html and script.js.",
  "- Never use new for a file that already exists. At most 6 files. Simple lowercase file names with their extension.",
  "- A rich site is fine: the files are written in parts, so ask for the whole thing (sections, animations, responsive layout) and describe it in the jobs.",
  "Example of a question (\"Exercise 3: how much to invest at 4% to get 10000 in 6 years? we divide by 1.04^6, right?\"):",
  "Mode: answer",
  "Example of a request for files:",
  "Mode: build",
  "Design: calm and modern, deep blue and warm white with a coral accent, rounded sans-serif, soft fade-in on scroll",
  "File: index.html | new | the page: a title, a canvas and a score",
  "File: style.css | new | dark theme, the canvas centred",
  "File: script.js | new | the snake game loop, keyboard control and score"
].join("\n");

const BUILD_WORDS = /\b(page|site|web ?site|html|css|game|jeu|app(?:lication)?|calculat|todo|quiz|timer|chrono|landing|portfolio|dashboard|script|program|programme|cr[ée]e|cr[ée]er|fais|fabrique|g[ée]n[èe]re|code|build|make|write|create|generate|[ée]cris)\b/i;
const WEB_WORDS = /\b(page|site|web|html|css|landing|portfolio|dashboard|jeu|game|calculat|todo|quiz|timer|chrono|app)\b/i;
const BEHAVIOUR_WORDS = /\b(jeu|game|calculat|todo|quiz|timer|chrono|anim|interactif|interactive|bouton|button|form|score|clic|click|tri|sort|filtre|filter|app)\b/i;

const FILE_NAME = /^[\w][\w .-]{0,38}\.[a-z0-9]{1,5}$/i;
const cleanName = (s: string) => s.trim().replace(/^[`"'*]+|[`"'*]+$/g, "").replace(/^\.?\/+/, "").split("/").pop() ?? "";

/** The planner's reply as a plan. Lenient: a reply that is not in the format at all gets a sensible default from the request. */
export function parsePlan(reply: string, existing: string[], request = ""): Plan {
  const have = new Map(existing.map((n) => [n.toLowerCase(), n]));
  const files: PlanFile[] = [];
  const read: Plan["read"] = [];
  let mode: Plan["mode"] | null = null;
  let design = "";
  for (const raw of reply.split("\n")) {
    const line = raw.replace(/^\s*(?:[-*•>]|\d+[.)])\s*/, "");
    const m = /^mode\s*:\s*(build|answer)/i.exec(line);
    if (m) { mode = m[1].toLowerCase() as Plan["mode"]; continue; }
    const d = /^design\s*:\s*(.+)$/i.exec(line);
    if (d) { design = d[1].trim().slice(0, 300); continue; }
    const f = /^file\s*:\s*([^|]+?)\s*\|\s*(new|edit|create|change|modify|update)\s*\|?\s*(.*)$/i.exec(line);
    if (f) {
      const name = cleanName(f[1]);
      if (!FILE_NAME.test(name) || files.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
      const exists = have.get(name.toLowerCase());
      files.push({ name: exists ?? name, action: exists ? "edit" : "new", job: f[3].trim().slice(0, 240) || "as asked" });
      continue;
    }
    const r = /^read\s*:\s*([^(]+?)\s*(?:\(([^)]*)\))?\s*$/i.exec(line);
    if (r) {
      const name = have.get(cleanName(r[1]).toLowerCase());
      if (name && !read.some((x) => x.name === name)) read.push({ name, spots: (r[2] ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean) });
    }
  }
  // an explicit "Mode: answer" wins over stray File lines: a question never turns into files
  if (files.length && mode !== "answer") return { mode: "build", design, files: files.slice(0, MAX_PLAN_FILES), read: [] };
  if (mode === "answer" || (mode === null && existing.length)) return { mode: "answer", design: "", files: [], read: read.slice(0, 3) };
  if (!existing.length && BUILD_WORDS.test(request)) {
    // no plan came back: a web request still gets the usual three files
    if (WEB_WORDS.test(request)) {
      const base: PlanFile[] = [{ name: "index.html", action: "new", job: "the page the user asked for" }, { name: "style.css", action: "new", job: "all the styling" }];
      if (BEHAVIOUR_WORDS.test(request)) base.push({ name: "script.js", action: "new", job: "the behaviour the user asked for" });
      return { mode: "build", design: "", files: base, read: [] };
    }
  }
  return { mode: "answer", design: "", files: [], read: [] };
}

// ------------------------------------------------------------------ what sessions get to see

export function kindOfFile(name: string): { kind: ArtifactKind; language: string } {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "html" || ext === "htm") return { kind: "html", language: "html" };
  if (ext === "svg") return { kind: "svg", language: "svg" };
  if (ext === "md") return { kind: "markdown", language: "markdown" };
  const lang: Record<string, string> = { js: "javascript", mjs: "javascript", ts: "typescript", py: "python", css: "css", json: "json", sh: "bash", ps1: "powershell", rs: "rust", cs: "csharp", cpp: "c++", yml: "yaml", yaml: "yaml", sql: "sql", txt: "text" };
  return { kind: "code", language: lang[ext] ?? (ext || "text") };
}

export const artifactText = (f: FileLike) =>
  `<artifact type="${f.kind}"${f.kind === "code" ? ` language="${f.language}"` : ""} title="${f.title.replace(/"/g, "'")}">\n${f.content.replace(/\s+$/, "")}\n</artifact>`;

/** A file as one line: what it is and what is in it. This is all the main session keeps of a file. */
export function stub(f: FileLike): string {
  const spots = outline(f.content).slice(0, 8).map((s) => s.name).join(", ");
  return `[file "${f.title}" — ${f.kind === "code" ? f.language : f.kind}, ${f.content.split("\n").length} lines${spots ? `; contains ${spots}` : ""}]`;
}

/** The conversation with every file reduced to its stub: the main session keeps talking without carrying the code. */
export function stubHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant" || typeof m.content !== "string") return m;
    const text = parseSegments(stripSubagents(m.content)).map((s) => (s.t === "text" ? s.v : ` ${stub(s)} `)).join("");
    return { ...m, content: stripEdits(text) || "(done)" };
  });
}

const textOf = (m?: ChatMessage) => (!m ? "" : typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join(""));

/** What the files share, as the other files must know it: ids and classes of a page, selectors of a stylesheet, functions of a script. */
export function interfaceOf(f: FileLike): string {
  const uniq = (xs: string[], max = 60) => [...new Set(xs)].slice(0, max);
  if (f.kind === "html") {
    const ids = uniq([...f.content.matchAll(/\bid\s*=\s*["']([\w-]+)["']/gi)].map((m) => `#${m[1]}`));
    const classes = uniq([...f.content.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)].flatMap((m) => m[1].split(/\s+/).filter(Boolean).map((c) => `.${c}`)));
    const tags = uniq([...f.content.matchAll(/<(canvas|button|input|form|select|textarea|table|ul|ol|nav|header|footer|main|section|article|img|video|audio|svg)\b/gi)].map((m) => m[1].toLowerCase()), 20);
    const links = linkedFiles(f.content);
    return [`ids: ${ids.join(" ") || "none"}`, `classes: ${classes.join(" ") || "none"}`, tags.length ? `elements: ${tags.join(", ")}` : "", links.length ? `links: ${links.join(", ")}` : ""].filter(Boolean).join("\n");
  }
  if (f.language === "css") {
    const sel = uniq([...f.content.matchAll(/(^|\})\s*([^{}@][^{}]*)\{/g)].flatMap((m) => m[2].split(",").map((s) => s.trim())).filter((s) => s && s.length < 60));
    const vars = uniq([...f.content.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]), 20);
    return `selectors: ${sel.join(" | ") || "none"}${vars.length ? `\nvariables: ${vars.join(" ")}` : ""}`;
  }
  const spots = outline(f.content).slice(0, 40).map((s) => s.name);
  return `defines: ${spots.join(", ") || "nothing named"}`;
}

/** A file for another session: whole when it is small, otherwise its map and what it shares. */
function shown(f: FileLike, room: number): string {
  if (f.content.length <= room) return artifactText(f);
  return `${outlineText(f.title, f.content)}\n${interfaceOf(f)}\n[the file is long, so only its map is shown]`;
}

export function fileMap(files: FileLike[]): string {
  if (!files.length) return "(no file exists yet)";
  return files.slice(0, 12).map((f) => `- ${f.title} (${f.kind === "code" ? f.language : f.kind}, ${f.content.split("\n").length} lines) ${interfaceOf(f).split("\n")[0].slice(0, 160)}`).join("\n");
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** The planner's question: recent talk without code, the files that exist, the request. */
export function plannerPrompt(history: ChatMessage[], files: FileLike[]): string {
  const talk = stubHistory(history).filter((m) => m.role !== "system");
  const request = textOf(talk.at(-1));
  const before = talk.slice(0, -1).slice(-6).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${clip(textOf(m).replace(/\s+/g, " "), 500)}`).join("\n");
  return `${before ? `Conversation so far (code left out):\n${before}\n\n` : ""}Files that exist:\n${fileMap(files)}\n\nThe user's new request:\n${clip(request, 2500)}\n\nPlan it.`;
}

const rank = (name: string) => (/\.html?$/i.test(name) ? 0 : /\.css$/i.test(name) ? 1 : /\.m?js$/i.test(name) ? 2 : 3);

const RULES = "Everything is inline or in the project's own files: no network, no CDN, no external images or fonts (draw with canvas, SVG or CSS). No eval.";

export function writerInstructions(file: PlanFile, plan: PlanFile[]): string {
  const hasCss = plan.some((f) => /\.css$/i.test(f.name));
  const hasJs = plan.some((f) => /\.m?js$/i.test(f.name));
  const kind = kindOfFile(file.name);
  const per = kind.kind === "html"
    ? [hasCss ? `Link the stylesheet with <link rel="stylesheet" href="${plan.find((f) => /\.css$/i.test(f.name))!.name}"> in the head and write no <style> block.` : "Put the styling in a <style> block in the head.",
      hasJs ? `Load the script with <script src="${plan.find((f) => /\.m?js$/i.test(f.name))!.name}"></script> just before </body> and write no inline <script>.` : "Put the behaviour in a <script> block just before </body>.",
      "Give every element the style or the script needs an id or a class. Structure and content only."].join(" ")
    : kind.language === "css" ? "Style the ids and classes listed under the page's interface, nothing else; do not invent markup. Make it look good: spacing, colours, readable type."
      : kind.language === "javascript" ? "This is a plain script, not a module: never write import or export. The script runs after the page is loaded: use only the ids and classes listed under the page's interface, and never assume an element exists that is not listed. Do not wait for DOMContentLoaded."
        : "";
  return `You write exactly one file: ${file.name}. Reply with the raw content of that file and nothing else: no explanation, no code fence, no <artifact> tag. ${per} ${RULES}`;
}

export function writerPrompt(request: string, plan: PlanFile[], file: PlanFile, done: FileLike[], room: number, design = ""): string {
  const others = plan.filter((f) => f.name !== file.name).map((f) => `- ${f.name}: ${f.job}`).join("\n");
  const context = done.length ? `\nWhat is already written:\n${done.map((f) => shown(f, room)).join("\n\n")}\n` : "";
  return `The user asked:\n${clip(request.trim(), 2500)}\n${design ? `\nDesign shared by every file: ${design}\n` : ""}\nThe project:\n- ${file.name} (yours): ${file.job}\n${others}\n${context}\nWrite ${file.name} now.`;
}

// ------------------------------------------------------------------ a file in parts

export interface Part { name: string; job: string }
export const MAX_PARTS = 8;
/** Characters one part may take: the model's room, but never more than a worker writes well in one go. */
export const partBudget = (maxChars: number) => Math.min(9000, Math.max(1500, Math.floor(maxChars * 0.6)));

export const OUTLINER_INSTRUCTIONS = [
  "You split one file into parts. Separate workers write the parts one after another, each seeing only its own part, so every part must be concrete and self-contained.",
  'Reply with lines in exactly this form, in file order, and nothing else: Part: <short name> | <what this part holds, concrete: the content, the elements, the effects>',
  "- html: the first part holds the head and the top of the page (header, navigation, hero); then one part per section; the last part holds the footer.",
  "- css: the first part holds the variables (palette and fonts from the design), the reset and the layout; then one part per section of the page; then one for animations and one for responsive rules.",
  "- js: one part per feature (menu, scroll effects, carousel, form, game logic, drawing...); the last part starts everything.",
  "Use as few parts as the size needs: a small file is ONE part. At most 8."
].join("\n");

export function parseParts(reply: string, fallback: string): Part[] {
  const out: Part[] = [];
  for (const raw of reply.split("\n")) {
    const m = /^\s*(?:[-*•]|\d+[.)])?\s*part\s*\d*\s*:\s*([^|]+?)\s*\|\s*(.+)$/i.exec(raw);
    if (m) out.push({ name: m[1].trim().slice(0, 40), job: m[2].trim().slice(0, 300) });
  }
  return out.length ? out.slice(0, MAX_PARTS) : [{ name: "whole file", job: fallback }];
}

export function outlinerPrompt(request: string, design: string, plan: PlanFile[], file: PlanFile, contract: string, lines: number): string {
  return `The user asked:\n${clip(request.trim(), 1500)}\n${design ? `\nDesign: ${design}\n` : ""}\nThe project:\n${plan.map((f) => `- ${f.name}${f.name === file.name ? " (the file to split)" : ""}: ${f.job}`).join("\n")}\n${contract ? `\nAlready written:\n${contract}\n` : ""}\nSplit ${file.name} into parts of about ${lines} lines each at most.`;
}

export function partInstructions(file: PlanFile, plan: PlanFile[], index: number, count: number): string {
  if (count === 1) return writerInstructions(file, plan);
  const kind = kindOfFile(file.name);
  const first = index === 0, last = index === count - 1;
  const hasCss = plan.find((f) => /\.css$/i.test(f.name));
  const hasJs = plan.find((f) => /\.m?js$/i.test(f.name));
  const per = kind.kind === "html"
    ? first ? `Start the document: <!doctype html>, <html>, the head (charset, viewport, title${hasCss ? `, <link rel="stylesheet" href="${hasCss.name}">` : ""}), open <body>, then write this part. Do not close <body> or <html>.`
      : last ? `Write only this part's markup inside <body>${hasJs ? `, then <script src="${hasJs.name}"></script>` : ""}, then close </body> and </html>. No head.`
        : "Write only this part's markup inside <body>: no doctype, head or body tags, and do not close anything that was opened before."
    : kind.language === "css" ? first ? "Start with :root variables for the colours and fonts of the design, then the reset and base layout, then this part. Use those variables everywhere." : "Write only the rules of this part, using the variables already defined and only the ids and classes of the page."
      : kind.language === "javascript" ? "Write only this part's code (a plain script: never write import or export). It continues the same file: do not repeat what is already defined, and do not wrap it in a function or listener unless the part needs one."
        : "";
  return `You write part ${index + 1} of ${count} of the file ${file.name}, and only that part. Other workers write the other parts. Reply with the raw code of your part and nothing else: no explanation, no code fence, no <artifact> tag. ${per} ${RULES}`;
}

export function partPrompt(o: { request: string; design: string; plan: PlanFile[]; file: PlanFile; parts: Part[]; index: number; contract: string; tail: string }): string {
  const list = o.parts.map((p, k) => `${k + 1}. ${p.name}: ${p.job}${k === o.index ? "   <-- yours" : ""}`).join("\n");
  return `The user asked:\n${clip(o.request.trim(), 1500)}\n${o.design ? `\nDesign shared by every file: ${o.design}\n` : ""}\nThe project: ${o.plan.map((f) => f.name).join(", ")}\n\nParts of ${o.file.name}:\n${list}\n${o.contract ? `\nWhat exists so far (use these names exactly):\n${o.contract}\n` : ""}${o.tail ? `\nThe last lines already written in ${o.file.name}, to continue from:\n${o.tail}\n` : ""}\nWrite part ${o.index + 1} (${o.parts[o.index].name}) now.`;
}

/** A page whose last part never closed it still has to be a page. */
export function closeHtml(html: string): string {
  let out = html.replace(/\s+$/, "");
  if (!/<\/body\s*>/i.test(out)) out += "\n</body>";
  if (!/<\/html\s*>/i.test(out)) out += "\n</html>";
  return `${out}\n`;
}

export const EDITOR_INSTRUCTIONS = [
  "You change one file. You get the job and the part of the file that matters. Change only that, and keep everything else as it is.",
  "Reply with edit blocks and nothing else, with lines copied exactly from the file shown:",
  '<edit file="exact file name">',
  "<<<<<<< SEARCH",
  "the old lines",
  "=======",
  "the new lines",
  ">>>>>>> REPLACE",
  "</edit>",
  "Several blocks are fine; keep each SEARCH short (2 to 6 lines) but unique. To add something, SEARCH for a neighbouring line and REPLACE with that line plus the new ones.",
  RULES
].join("\n");

export const LOCATOR_INSTRUCTIONS = [
  "You only see a map of a file (its landmarks and the line each starts on), not its code. Say where a change goes.",
  "Reply with exactly one line: Where: <1 to 4 landmark names or line ranges from the map, separated by commas>"
].join("\n");

export function editorPrompt(request: string, file: FileLike, job: string, pieces: string, contract: string): string {
  return `The user asked:\n${clip(request.trim(), 1500)}\n\nChange to make in ${file.title}: ${job}\n${contract ? `\nThe other files of the project share this (keep it consistent):\n${contract}\n` : ""}\nThe part of the file that matters:\n${pieces}\n\nMake it with edit blocks. The old lines must be copied exactly from the part above; touch nothing else.`;
}

// ------------------------------------------------------------------ cleaning what a writer sends

/**
 * The file out of a writer's reply so far. Writers are told to send the raw file but often add a code fence or an
 * <artifact> tag. While streaming, a trailing piece that might be the start of a closing marker is held back.
 */
export function cleanFile(raw: string, final: boolean): string {
  let t = raw.replace(/^\s*\n/, "");
  const open = /^\s*<artifact\b[^>]*>\s*\n?/i.exec(t);
  if (open) t = t.slice(open[0].length);
  const fence = /^\s*```[\w+#.-]*[ \t]*\n?/.exec(t);
  if (fence) t = t.slice(fence[0].length);
  const closeAt = t.search(/\n?\s*(?:<\/artifact>|```)\s*(?:\n|$)/);
  if (closeAt >= 0 && (final || /(?:<\/artifact>|```)/.test(t))) t = t.slice(0, closeAt);
  else if (!final) {
    for (const marker of ["</artifact>", "```"]) {
      for (let k = Math.min(marker.length - 1, t.length); k > 0; k--) {
        if (marker.startsWith(t.slice(-k)) && /(^|\n)\s*$/.test(t.slice(0, -k))) { t = t.slice(0, -k); break; }
      }
    }
  }
  return final ? t.replace(/\s+$/, "") + "\n" : t;
}

/** A rewrite is kept only when it changed the file, did not cut it short and did not leave an elision in place of code. */
export function rewriteIsSound(before: string, after: string): boolean {
  if (!after.trim() || after.trim() === before.trim()) return false;
  if (after.length < before.length * 0.6) return false;
  const elision = /(?:rest|remainder|remaining) of (?:the )?(?:code|file|script|styles?)|\.\.\.\s*(?:existing|unchanged|same|previous)|(?:existing|unchanged) code (?:here|remains)/i;
  return !(elision.test(after) && !elision.test(before));
}

// ------------------------------------------------------------------ the run

/** `role` tells which model should answer, when the user gave a role a model of its own (Settings → Which model writes what). */
export type Session = (sid: string, messages: ChatMessage[], worker: boolean, role?: WriterRole) => AsyncGenerator<ChatEvent>;

export const roleOfFile = (name: string): WriterRole | undefined => (/\.html?$/i.test(name) ? "html" : /\.css$/i.test(name) ? "css" : /\.m?js$/i.test(name) ? "js" : undefined);

export interface StepwiseOptions {
  id: string;
  /** The conversation as sent: system message, turns with their files, the new request. */
  messages: ChatMessage[];
  /** One completion in a session of its own. `worker` = short thinking. */
  stream: Session;
  signal?: AbortSignal;
  /** Characters of code a session can take next to its instructions. */
  maxChars: number;
  focusFrom?: number;
  /** Characters one part of a file may take (default from maxChars). */
  partChars?: number;
}

export type StepwiseResult =
  | { handled: true; text: string; stats: ChatStats }
  /** Not a job for files: the main session answers, with `messages` (files reduced to stubs, plus the parts asked for). */
  | { handled: false; messages: ChatMessage[] };

const withoutArtifactRules = (m: ChatMessage): ChatMessage => (m.role === "system" && typeof m.content === "string" ? { ...m, content: m.content.replace(ARTIFACT_INSTRUCTIONS, "").trim() } : m);

async function collect(stream: Session, sid: string, messages: ChatMessage[], add: (s: ChatStats) => void, signal?: AbortSignal, role?: WriterRole): Promise<string> {
  let text = "";
  for await (const ev of stream(sid, messages, true, role)) {
    if (ev.type === "answer") text += ev.text;
    else if (ev.type === "done") add(ev.stats);
  }
  if (signal?.aborted) throw new Error("aborted");
  return text;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export async function* stepwise(o: StepwiseOptions): AsyncGenerator<ChatEvent, StepwiseResult> {
  const total: ChatStats = { ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0 };
  const add = (s: ChatStats) => {
    total.tokens += s.tokens;
    total.totalSec = Math.round((total.totalSec + s.totalSec) * 100) / 100;
    if (total.ttftSec === null) total.ttftSec = s.ttftSec;
    if (total.tokPerSec === null) total.tokPerSec = s.tokPerSec;
  };
  const aborted = () => { if (o.signal?.aborted) throw new Error("aborted"); };
  const lastUserAt = o.messages.map((m) => m.role).lastIndexOf("user");
  const request = textOf(o.messages[lastUserAt]);
  const files = latestArtifacts(o.messages) as FileLike[];
  const passthrough = (): StepwiseResult => ({ handled: false, messages: o.messages });

  // a greeting does not need a plan; anything longer, or any chat that already has files, is looked at
  if (!files.length && request.trim().length < 15) return passthrough();
  if (lastUserAt < 0) return passthrough();
  // with no file in the chat, a message that asks for nothing to be made never reaches the planner
  if (!files.length && !BUILD_WORDS.test(request)) return passthrough();

  let plan: Plan;
  try {
    const reply = await collect(o.stream, `${o.id}:plan`, [
      { role: "system", content: PLANNER_INSTRUCTIONS },
      { role: "user", content: plannerPrompt(o.messages, files) }
    ], add, o.signal, "plan");
    plan = parsePlan(reply, files.map((f) => f.title), request);
  } catch (e) {
    if (o.signal?.aborted) throw e;
    return passthrough();
  }

  if (plan.mode === "answer") {
    // the main session keeps talking, without the code; it gets the parts it was said to need
    const msgs = stubHistory(o.messages);
    const room = Math.max(1500, Math.floor(o.maxChars / 3));
    const blocks = plan.read.map((r) => {
      const f = files.find((x) => x.title === r.name)!;
      if (f.content.length <= room) return artifactText(f);
      const ranges = resolveSpots(f.content, r.spots);
      return `<file name="${f.title}">\n${outlineText(f.title, f.content)}\n${excerpts(f.content, ranges.length ? ranges : [[1, 60]], room)}\n</file>`;
    });
    if (blocks.length) {
      const u = msgs[lastUserAt];
      msgs[lastUserAt] = { ...u, content: typeof u.content === "string" ? `${u.content}\n\nFiles you may need (read-only):\n${blocks.join("\n")}` : [...u.content, { type: "text" as const, text: `\n\nFiles you may need (read-only):\n${blocks.join("\n")}` }] };
    }
    return { handled: false, messages: msgs };
  }

  // ---- build
  const steps: BuildStep[] = [...plan.files].sort((a, b) => rank(a.name) - rank(b.name)).map((f) => ({ file: f.name, action: f.action, job: f.job, status: "waiting" as const }));
  const run = (status: BuildRun["status"]): ChatEvent => ({ id: o.id, type: "build", build: { status, steps: steps.map((s) => ({ ...s })) } });
  const ordered = steps.map((s) => plan.files.find((f) => f.name === s.file)!);
  let text = "";
  const say = (s: string): ChatEvent => { text += s; return { id: o.id, type: "answer", text: s }; };
  const current = new Map(files.map((f) => [f.title.toLowerCase(), f]));
  const touched: FileLike[] = [];
  const room = Math.max(1500, Math.floor(o.maxChars / 3));
  const focusFrom = o.focusFrom ?? FOCUS_FROM;
  yield run("running");

  for (let i = 0; i < ordered.length; i++) {
    aborted();
    const file = ordered[i];
    const R = roleOfFile(file.name);
    const step = steps[i];
    step.status = "running";
    yield run("running");
    const existing = current.get(file.name.toLowerCase());
    let panelOpen = false;
    const known = (): FileLike[] => mergeFiles([...current.values()]);
    const contract = known().filter((f) => f.title !== file.name).map((f) => `${f.title}\n${interfaceOf(f)}`).join("\n\n");
    try {
      if (existing) {
        // 1. targeted edit blocks on the lines concerned
        let updated: FileLike | null = null;
        const small = existing.content.length < focusFrom;
        // A small model copies a whole short file far more reliably than it matches old lines for a SEARCH block, so a short
        // file is rewritten first; the edit blocks are for files too long to send back whole, or a rewrite that lost lines.
        if (small && existing.content.length * 2 <= o.maxChars) {
          const reply = await collect(o.stream, `${o.id}:redo:${i}`, [
            { role: "system", content: `You rewrite one file with a change applied. Reply with the complete raw file and nothing else: no explanation, no code fence. Keep everything that is not part of the change exactly as it is, and never shorten the file or write '...' or 'rest of the code'. ${kindOfFile(file.name).language === "javascript" ? "It is a plain script: never write import or export. " : ""}${RULES}` },
            { role: "user", content: `The user asked:\n${clip(request.trim(), 1200)}\n\n${contract ? `The other files of the project (keep the names consistent):\n${contract}\n\n` : ""}Change to make in ${file.name}: ${file.job}\n\nThe file ${file.name}:\n${existing.content}` }
          ], add, o.signal, R);
          const full = cleanFile(reply, true);
          if (rewriteIsSound(existing.content, full)) { updated = { ...existing, content: full }; step.note = "Rewrote the file with the change."; }
        }
        let pieces = "";
        if (updated) { /* the rewrite did it */ }
        else if (small) pieces = existing.content.length <= o.maxChars ? artifactText(existing) : "";
        else {
          const where = await collect(o.stream, `${o.id}:where:${i}`, [
            { role: "system", content: LOCATOR_INSTRUCTIONS },
            { role: "user", content: `Change to make in ${file.name}: ${file.job}\n\nMap of the file:\n${outlineText(existing.title, existing.content)}` }
          ], add, o.signal, R);
          const wanted = (/^\s*where:\s*(.+)$/im.exec(where)?.[1] ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
          let ranges: Range[] = resolveSpots(existing.content, wanted).slice(0, 6);
          if (!ranges.length) ranges = resolveSpots(existing.content, file.job.split(/\W+/).filter((w) => w.length > 3)).slice(0, 4);
          pieces = excerpts(existing.content, ranges.length ? ranges : [[1, 80]], Math.max(2000, Math.floor(o.maxChars / 2)));
        }
        if (!updated && pieces) {
          const ask: ChatMessage[] = [{ role: "system", content: EDITOR_INSTRUCTIONS }, { role: "user", content: editorPrompt(request, existing, file.job, pieces, contract) }];
          let reply = await collect(o.stream, `${o.id}:edit:${i}`, ask, add, o.signal, R);
          let done = applyEdits(existing.content, parseReply(reply).edits);
          if (!done.applied) {
            // 2. the old lines were copied slightly wrong: say so once
            reply = await collect(o.stream, `${o.id}:edit:${i}:retry`, [...ask, { role: "assistant", content: reply }, { role: "user", content: RETRY_NOTE }], add, o.signal, R);
            done = applyEdits(existing.content, parseReply(reply).edits);
          }
          if (done.applied && done.content !== existing.content) updated = { ...existing, content: done.content };
        }
        // 3. nothing matched: the whole file, written again by a session of its own
        if (!updated) {
          step.note = "Targeted edit did not match, rewriting the whole file…";
          yield run("running");
          if (existing.content.length > o.maxChars) throw new Error("the targeted edit did not match and the file is too long to rewrite");
          const reply = await collect(o.stream, `${o.id}:redo:${i}`, [
            { role: "system", content: `You rewrite one file with a change applied. Reply with the complete raw file and nothing else: no explanation, no code fence. Keep everything that is not part of the change exactly as it is. ${RULES}` },
            { role: "user", content: `Change to make in ${file.name}: ${file.job}\n\nThe file:\n${existing.content}` }
          ], add, o.signal, R);
          const full = cleanFile(reply, true);
          if (!full.trim()) throw new Error("no file came back");
          updated = { ...existing, content: full };
          step.note = "Rewrote the whole file (the targeted edit did not match).";
        }
        const diff = diffText(existing.content, updated.content);
        if (!diff) throw new Error("nothing changed");
        step.diff = diff;
        step.note ??= "Changed only the lines concerned.";
        current.set(file.name.toLowerCase(), updated);
        touched.push(updated);
        yield say(`${artifactText(updated)}\n`);
      } else {
        const kind = kindOfFile(file.name);
        const head = `<artifact type="${kind.kind}"${kind.kind === "code" ? ` language="${kind.language}"` : ""} title="${file.name.replace(/"/g, "'")}">\n`;
        const done = [...current.values()].filter((f) => f.title !== file.name);
        const budget = o.partChars ?? partBudget(o.maxChars);
        const share = Math.max(600, Math.floor(budget * 0.5));
        // 1. how many parts: a small file is one; a rich one is cut by section so no session has to hold all of it
        // the file's panel opens now, so the reader watches it fill instead of waiting out the planning
        let opened = true;
        panelOpen = true;
        yield say(head);
        const rich = budget < 9000 || file.job.length > 120;
        let parts: Part[] = [{ name: "whole file", job: file.job }];
        if (rich && rank(file.name) < 3) {
          step.note = "Planning the parts…";
          yield run("running");
          const reply = await collect(o.stream, `${o.id}:parts:${i}`, [
            { role: "system", content: OUTLINER_INSTRUCTIONS },
            { role: "user", content: outlinerPrompt(request, plan.design, ordered, file, clip(done.map((f) => `${f.title}\n${interfaceOf(f)}`).join("\n\n"), share), Math.max(30, Math.floor(budget / 45))) }
          ], add, o.signal, R).catch((e) => { if (o.signal?.aborted) throw e; return ""; });
          parts = parseParts(reply, file.job);
        }
        // 2. each part in a session of its own: the job, the design, the names that exist, and the last lines written
        let assembled = "";
        for (let k = 0; k < parts.length; k++) {
          aborted();
          if (parts.length > 1) { step.note = `Part ${k + 1} of ${parts.length}: ${parts[k].name}`; yield run("running"); }
          const contract = clip([...done.map((f) => `${f.title}\n${interfaceOf(f)}`), assembled ? `${file.name} (so far)\n${interfaceOf({ title: file.name, kind: kind.kind, language: kind.language, content: assembled })}` : ""].filter(Boolean).join("\n\n"), share);
          const msgs: ChatMessage[] = parts.length === 1
            ? [{ role: "system", content: writerInstructions(file, ordered) }, { role: "user", content: writerPrompt(request, ordered, file, done, room, plan.design) }]
            : [{ role: "system", content: partInstructions(file, ordered, k, parts.length) },
              { role: "user", content: partPrompt({ request, design: plan.design, plan: ordered, file, parts, index: k, contract, tail: assembled.split("\n").slice(-12).join("\n").slice(-Math.min(900, share)) }) }];
          let raw = "";
          let sent = 0;
          for await (const ev of o.stream(`${o.id}:write:${i}:${k}`, msgs, true, R)) {
            if (ev.type === "done") add(ev.stats);
            if (ev.type !== "answer") continue;
            raw += ev.text;
            const clean = cleanFile(raw, false);
            if (!clean.length) continue;
            if (!opened) { opened = true; yield say(head); }
            if (clean.length > sent) { yield say(clean.slice(sent)); sent = clean.length; }
          }
          aborted();
          const full = cleanFile(raw, true);
          if (!full.trim()) {
            if (k === 0) { yield say("\n</artifact>\n"); panelOpen = false; throw new Error("the model sent an empty file"); }
            continue; // a lost middle part leaves a hole, but the file is still worth keeping
          }
          if (!opened) { opened = true; yield say(head); }
          if (full.length > sent) yield say(full.slice(sent));
          if (!full.endsWith("\n")) yield say("\n");
          assembled += full;
        }
        if (kind.kind === "html" && parts.length > 1) {
          const closed = closeHtml(assembled);
          if (closed.length > assembled.length + 1) yield say(closed.slice(assembled.replace(/\s+$/, "").length).replace(/^\n/, ""));
          assembled = closed;
        }
        yield say("</artifact>\n");
        panelOpen = false;
        // The file is looked at the moment it is written, before the next one is started on top of it: a script that does
        // not parse or a stylesheet with a stray brace is mended now, by a session that sees only that file and its error.
        let finished = withoutPointers(assembled);
        // the page must load the stylesheet and the script written for it, whatever the model wrote in its tags
        if (kind.kind === "html") {
          const names = (re: RegExp) => ordered.map((f) => f.name).filter((n) => re.test(n));
          finished = wireHtml(finished, { css: names(/\.css$/i), js: names(/\.m?js$/i) });
        }
        if (kind.kind === "code" && /^(javascript|js)$/i.test(kind.language)) finished = plainScript(finished);
        for (let attempt = 0; attempt < 2; attempt++) {
          const errs = quickErrors({ title: file.name, kind: kind.kind, language: kind.language, content: finished }, [...current.values()].filter((f) => f.kind === "html").map((f) => f.content));
          if (!errs.length) break;
          step.note = `Mending ${plural(errs.length, "problem")} in ${file.name}…`;
          yield run("running");
          const others = clip(done.map((f) => `${f.title}\n${interfaceOf(f)}`).join("\n\n"), share);
          const reply = await collect(o.stream, `${o.id}:repair:${i}:${attempt}`, [
            { role: "system", content: REPAIR_INSTRUCTIONS },
            { role: "user", content: repairPrompt(request, { title: file.name, kind: kind.kind, language: kind.language, content: finished }, errs, others) }
          ], add, o.signal, R).catch((e) => { if (o.signal?.aborted) throw e; return ""; });
          const mended = reply ? rawFile(reply, kind.language) : "";
          if (!rewriteIsSound(finished, mended)) break;
          finished = mended;
        }
        if (finished !== assembled && finished.trim() !== assembled.trim()) {
          const at = artifactsIn(text).map((a) => a.title.toLowerCase()).lastIndexOf(file.name.toLowerCase());
          if (at >= 0) { text = replaceArtifact(text, at, finished); yield { id: o.id, type: "replace", text }; }
          assembled = finished;
        }
        const written: FileLike = { title: file.name, kind: kind.kind, language: kind.language, content: assembled };
        current.set(file.name.toLowerCase(), written);
        touched.push(written);
        step.note = `${plural(assembled.split("\n").length, "line")} written${parts.length > 1 ? ` in ${parts.length} parts` : ""}.`;
      }
      step.status = "done";
    } catch (e) {
      if (o.signal?.aborted) throw e;
      if (panelOpen) yield say("\n</artifact>\n");
      step.status = "error";
      step.note = `Failed: ${(e as Error).message}`;
    }
    yield run("running");
  }
  yield run("done");

  // ---- the main session explains
  const failed = steps.filter((s) => s.status === "error");
  const report = steps.map((s) => `- ${s.file} (${s.action === "new" ? "written" : "changed"}): ${s.job}${s.status === "error" ? ` — FAILED, ${s.note}` : ""}`).join("\n");
  const explain: ChatMessage[] = [
    ...stubHistory(o.messages).map(withoutArtifactRules),
    { role: "user", content: `[Build report. Helpers wrote the files you asked for; the user can open them next to your message.]\n${report}\n\nReply to the user now, in their language: say in 2 to 5 short sentences what was done and how to use it${failed.length ? `, and say plainly that ${failed.map((s) => s.file).join(", ")} could not be made and why` : ""}. Do not write code, file contents or <artifact> tags.` }
  ];
  // the instruction goes last, after the report, so the explanation answers the request that started it
  let explanation = "";
  try {
    explanation = stripEdits(stripSubagents(await collect(o.stream, `${o.id}:explain`, explain, add, o.signal))).replace(/<artifact[\s\S]*?(?:<\/artifact>|$)/gi, "").trim();
  } catch (e) {
    if (o.signal?.aborted) throw e;
  }
  if (!explanation) explanation = failed.length === steps.length ? "I could not make the files." : `Done: ${touched.map((f) => f.title).join(", ")}.${failed.length ? ` ${failed.map((s) => s.file).join(", ")} failed.` : ""}`;
  yield say(`\n${explanation}`);
  return { handled: true, text, stats: total };
}
