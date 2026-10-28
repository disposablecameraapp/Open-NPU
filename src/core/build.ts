import { newChapters } from "./chapters";
import type { ArtifactKind, BuildCall, BuildRun, BuildStage, BuildStep, ChatEvent, ChatMessage, ChatStats, WriterRole } from "../shared/types";
import { withAnswer } from "./chat";
import { ARTIFACT_INSTRUCTIONS, parseSegments } from "./artifacts";
import { routeVisual, VISUAL_OVERVIEW } from "./visualRoute";
import { BLOCK_INSTRUCTIONS } from "./blocks";
import { FileLike, linkedFiles, mergeFiles, wireHtml } from "./bundle";
import { Skeleton, skeletonFor as startingPageFor } from "./skeletons";
/** The tested page a request starts from, except for a game with a world (a platformer, an RPG): a word like "timer" in it must not send it to the stopwatch. */
const skeletonFor = (request: string) => (WORLD_WORDS.test(request) ? null : startingPageFor(request));
import { GAME_WORDS, ARCADE_WORDS, ENGINE_DOC, WORLD_WORDS, explicitWay, gameFileName } from "./engine";
import { engineExamplesFor } from "./engineSkeletons";
import { buildXPage, readBuild, resumable } from "./xbuild";
import { buildProgram } from "./construct/pipeline";
import { readMark } from "./construct/marks";
import type { Scenario } from "./construct/scenarios";
import { editXPage } from "./xedit";
import { takeParts } from "./slidePicks";
import { usesBlocks } from "./gameBlocks";
import { FOCUS_FROM, Range, diffText, errorLines, excerpts, outline, outlineText, resolveSpots } from "./focus";
import { applyEdits, blame, latestArtifacts, parseReply, plainScript, rawFile, REPAIR_INSTRUCTIONS, repairPrompt, stripEdits, withoutPointers } from "./review";
import { ProbePlan, inlineScripts, lostEffects, quickErrors } from "./codecheck";
import { artifactsIn, replaceArtifact } from "./artifacts";
import { stripSubagents } from "./agents";
import { withSystem } from "./effort";
import { parseYesNo, yesNoPrompt } from "./router";

/**
 * Work on files without keeping the files in the conversation. The main session talks to the user; the code is written
 * and changed by short sessions of their own, one after another (the NPU holds one model), each one seeing only what its
 * job needs: a planner (names and jobs, never code), one writer per new file, one editor per changed file that works on
 * the lines concerned and sends edit blocks, and at the end the main session explains what was done.
 * Nothing here is switched on by the user: a request that needs files goes through it, a chat does not.
 */

export const MAX_PLAN_FILES = 6;
/** Characters under which a file is simply rewritten for a change: shorter than the edit blocks that would describe it. */
export const TINY_FILE = 1200;
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
  "- A chart, a graph, a diagram, a schema, a table or a calculator with inputs and results is answer, never build: the app draws it from a block in the reply.",
  "- A game, a calculator, a small tool or any program with one job (snake, tetris, todo list, timer, quiz...) is ONE file: index.html with its style and its script inline. One session writes it with everything in view, so the pieces fit. Never split it into style.css and script.js.",
  "- Only a site with several sections or pages (landing page, portfolio, blog) is several files: index.html (structure and content), style.css (all the styling), script.js (the behaviour). Leave script.js out when the page needs no behaviour.",
  "- To change something that exists, use edit on only the files concerned: a colour change touches style.css only, a new button touches index.html and script.js.",
  "- Never use new for a file that already exists. At most 6 files. Simple lowercase file names with their extension.",
  "- A rich site is fine: ask for the whole thing (sections, animations, responsive layout) and describe it in the jobs.",
  "Example of a question (\"Exercise 3: how much to invest at 4% to get 10000 in 6 years? we divide by 1.04^6, right?\"):",
  "Mode: answer",
  "Example of a request for a game (\"make me a snake game\"):",
  "Mode: build",
  "Design: dark background, neon green snake",
  "File: index.html | new | the whole snake game in one file: a canvas and a score, dark styling, the game loop, arrow-key control, food, growth, collisions, game over and restart"
].join("\n");

const BUILD_WORDS = /\b(page|site|web ?site|html|css|game|jeu|app(?:lication)?|calculat|todo|quiz|timer|chrono|landing|portfolio|dashboard|script|program|programme|cr[ée]e|cr[ée]er|fais|fabrique|g[ée]n[èe]re|code|build|make|write|create|generate|[ée]cris)\b/i;
/** Things a computer runs: a message about one of them may be a request for files. */
const FILE_OBJECTS = /\b(html|css|javascript|js|typescript|python|script|scripts|program|programme|code|app|apps|application|game|jeu|website|web ?site|site web|web ?page|page web|landing|portfolio|dashboard|calculat\w*|todo|to-do|quiz|timer|chrono\w*|function|fonction|class|component|api|bot|extension|cli|widget|interface|ui|bookmarklet|simulat\w*|animation)\b|(?<!\d\s?)\bpages?\b/i;
/** Things a person reads: a message about one of them is a request for text, not for files, unless it also names code. */
const DOC_OBJECTS = /\b(book|livre|essay|essai|story|histoire|poem|po[èe]me|e-?mail|mail|courriel|letter|lettre|article|report|rapport|summary|r[ée]sum[ée]|speech|discours|song|chanson|blog post|paragraph|paragraphe|text|texte|novel|roman|thesis|th[èe]se|presentation|pr[ée]sentation|slides?|document|cv|resume)\b/i;
/** Long documents, which are worth a file of their own; a poem, a mail or a story is just answered. */
const LONG_DOCS = /\b(book|livre|essay|essai|report|rapport|thesis|th[èe]se|novel|roman|document|presentation|pr[ée]sentation|slides?|guide|manual|manuel|ebook|fiche|dossier|synth[èe]se|tutoriel|tutorial|compte[- ]rendu|m[ée]mo|support de cours|(?:un|le|mon) cours)\b/i;
/** Word, Excel and PowerPoint files: a message that names one needs the rules for making them. */
const OFFICE_WORDS = /\b(e[xc]{1,2}e{1,2}l{1,2}|spreadsheets?|tableur|feuille de calcul|classeur|docx|xlsx|pptx|powerpoint|word (?:document|file)|document word|diapo\w*|diaporama|workbook|formulas?|formules?)\b/i;
const CODE_WORDS = /\b(html|css|javascript|js|typescript|python|script|scripts|program|programme|code|app|application|game|jeu|website|web ?site|web ?page|page web|landing|calculat\w*|todo|to-do|quiz|timer|widget|interface)\b/i;
/** Does a message with no file in the chat look like a request for files? Without a model: a planner call costs seconds for nothing on "write a book". */
export const wantsFiles = (request: string) => FILE_OBJECTS.test(request) && (!DOC_OBJECTS.test(request) || CODE_WORDS.test(request));

/**
 * Does this message need the rules about files, charts and pictures in the model's instructions? They weigh about 600 tokens, and a very
 * small model given them for "hi" loses the thread (it answered a request to write a book by inventing who it was). Only sent when
 * the message or the chat is about something they are for.
 */
export const needsTools = (request: string, chatHasFiles: boolean) =>
  chatHasFiles || wantsFiles(request) || WANTS_CHART.test(request) || WANTS_VISUAL.test(request) || LONG_DOCS.test(request) || OFFICE_WORDS.test(request) || /\b(draw|dessine|plot|trace|svg|diagram\w*|sch[ée]ma|picture|image|photo|illustr\w*)\b/i.test(request);

/** What the planner has written so far, as one line: its mode and the files it plans. For a reader who is waiting. */
export function planPreview(reply: string): string {
  const mode = /^\s*mode\s*:\s*(build|answer)/im.exec(reply)?.[1]?.toLowerCase();
  const files = [...reply.matchAll(/^\s*(?:[-*•]|\d+[.)])?\s*file\s*:\s*([^|\n]+?)\s*\|\s*(new|edit|create|change|modify|update)?/gim)].map((m) => `${m[1].replace(/[`"'*]/g, "").trim()}${m[2] ? ` (${/new|create/i.test(m[2]) ? "new" : "change"})` : ""}`);
  const design = /^\s*design\s*:\s*(.+)$/im.exec(reply)?.[1]?.trim();
  if (mode === "answer") return "no file to write: answering in the chat";
  if (!mode && !files.length) return "";
  return `${files.length ? `${files.length} file${files.length === 1 ? "" : "s"}: ${files.join(", ")}` : "build"}${design ? ` · look: ${design.slice(0, 60)}` : ""}`;
}

const WEB_WORDS = /\b(page|site|web|html|css|landing|portfolio|dashboard|jeu|game|calculat|todo|quiz|timer|chrono|app)\b/i;
const BEHAVIOUR_WORDS = /\b(jeu|game|calculat|todo|quiz|timer|chrono|anim|interactif|interactive|bouton|button|form|score|clic|click|tri|sort|filtre|filter|app)\b/i;

const SITE_WORDS = /\b(site|web ?site|landing|portfolio|blog|pages|multi-?page|sections?|vitrine)\b/i;
const GAME_OR_TOOL_WORDS = /\b(jeu|game|snake|tetris|pong|calculat\w*|todo|quiz|timer|chrono\w*|convert\w*|app(?:lication)?)\b/i;
/** A game with a world (a platformer, an RPG) is a program too, whether or not the request says "game". */
const GAME_OR_TOOL = { test: (r: string) => GAME_OR_TOOL_WORDS.test(r) || WORLD_WORDS.test(r) || ARCADE_WORDS.test(r) };

/** One program with one job is one file: its style and script live in the page, so one session writes it with everything in view. */
function collapseSmall(files: PlanFile[], design: string, request: string, existing: string[]): PlanFile[] {
  if (existing.length || files.length < 2 || files.some((f) => f.action !== "new")) return files;
  if (!files.every((f) => /\.(html?|css|m?js)$/i.test(f.name)) || !files.some((f) => /\.m?js$/i.test(f.name)) || !files.some((f) => /\.html?$/i.test(f.name))) return files;
  if (!GAME_OR_TOOL.test(request) || SITE_WORDS.test(request) || WANTS_SEPARATE_FILES.test(request)) return files;
  const page = files.find((f) => /\.html?$/i.test(f.name))!;
  return [{ name: page.name, action: "new", job: files.map((f) => f.job).join("; ").slice(0, 400) }];
}

/** The user named the files or the three technologies ("html css and js", "separate files"): that is what they get, not one page. */
export const WANTS_SEPARATE_FILES = /\bhtml\b[\s,+&/-]*(?:and|et|&|\+)?[\s,]*\bcss\b[\s,+&/-]*(?:and|et|&|\+)?[\s,]*\b(?:js|javascript)\b|\b(?:separate|several|multiple|different) files?\b|\bfichiers? s[ée]par[ée]s?\b|\bplusieurs fichiers\b|\bstyle\.css\b|\bscript\.js\b/i;

/** Something to look at or play with rather than to read: an interactive page, a diagram, a chart, a simulation. */
export const WANTS_VISUAL = /\b(interactive|interactifs?|interactives?|simulat(?:or|eur|ion)s?|animated|animations?|anim[ée]e?s?)\b/i;
/** A chart or a diagram of numbers: drawn in the chat from a few lines of JSON, no page to build. */
export const WANTS_CHART = /\b(diagram(?:me)?s?|graphiques?|charts?|graphs?|courbes?|histogrammes?|camemberts?|visuali[sz]ations?)\b/i;
const ASKS_TO_SHOW = /^\s*(explain|explique|montre|show|illustre|illustrate|visuali[sz]e|visualise|fais|make|cr[ée]e|create|dessine|draw)/i;

const QUESTION = /^\s*(?:how|why|what|who|can you explain|could you explain|explain|is |are |does |do |comment|pourquoi|quel|qu['’]est|c['’]est quoi|explique)\b|\?\s*$/i;

/**
 * A plain request for one small program ("make a snake game") needs no planner: the answer is already known, one page
 * written by one session. Skipping the planner saves a whole model call and takes away its chance to misjudge the request.
 * Anything that could be a question, a site, or a change to files that exist still goes to the planner.
 */
/** A short request to take the work up again. */
const RESUME_WORDS = /^(?:ok(?:ay)?[,. ]*|please[,. ]*|s'il te pla[iî]t[,. ]*)?(?:continue|go on|resume|keep going|carry on|finish(?: it)?|reprends?|poursuis|termine)\b/i;

export function directPlan(request: string, existing: string[]): Plan | null {
  const r = request.trim();
  // a detailed description of one game is the request this exists for: the cap only keeps a long brief for several things (a site, a report) out of it
  if (existing.length || r.length < 8 || r.length > 4000) return null;
  // "explain compound interest with an interactive diagram" is a page to build, although it starts like a question
  if (WANTS_VISUAL.test(r) && !WANTS_CHART.test(r) && ASKS_TO_SHOW.test(r) && !/\?\s*$/.test(r) && !SITE_WORDS.test(r) && !WANTS_SEPARATE_FILES.test(r)) {
    return { mode: "build", design: "", files: [{ name: "index.html", action: "new", job: "the whole program in this one file: page, styling and working behaviour" }], read: [] };
  }
  if (QUESTION.test(r) || SITE_WORDS.test(r) || WANTS_SEPARATE_FILES.test(r) || !(BUILD_WORDS.test(r) || WORLD_WORDS.test(r) || ARCADE_WORDS.test(r)) || !GAME_OR_TOOL.test(r)) return null;
  // a game is named after itself; the page of a tested starting point (snake, tic-tac-toe...) keeps the usual name
  const named = (GAME_WORDS.test(r) || ARCADE_WORDS.test(r)) && !skeletonFor(r) ? gameFileName(r) : "index.html";
  return { mode: "build", design: "", files: [{ name: named, action: "new", job: "the whole program in this one file: page, styling and working behaviour" }], read: [] };
}

const CHIT_CHAT = /^\s*(?:thanks?(?: you)?|thx|merci(?: beaucoup)?|ok(?:ay)?|cool|great|nice|perfect|parfait|super|g[ée]nial|good|bravo|hello|hi|salut|bonjour|bye)\b[\s!.]*$/i;
const CHANGE_WORDS = /\b(make|add|change|fix|remove|delete|replace|rename|update|increase|decrease|speed|slow|set|turn|put|move|show|hide|use|enable|disable|give|let|allow|include|implement|create|spawn|insert|apply|donne\w*|laisse\w*|permets?|permettre|rajoute\w*|cr[ée]e\w*|impl[ée]mente\w*|ins[èe]re\w*|ajoute\w*|modifi\w*|chang\w*|corrig\w*|enl[eè]ve\w*|supprim\w*|remplac\w*|renomm\w*|rends?|mets?|fais|augment\w*|diminu\w*|passe|utilis\w*|affich\w*|cache|active\w*|d[ée]sactiv\w*)\b/i;

const BUG_WORDS = /\b(doesn['’]?t|does not|don['’]?t|do not|isn['’]?t|is not|won['’]?t|can['’]?t|cannot|not working|broken|bugg?y?|crash\w*|errors?|fail\w*|stuck|freez\w*|frozen|blank|empty|glitch\w*|wrong|nothing (?:happens|works|moves|shows|appears)|no (?:button|sound|score|game|movement)|ne (?:marche|fonctionne|r[ée]pond|s['’]affiche|bouge|d[ée]marre)\w*|(?:marche|fonctionne|bouge) pas|rien ne|rien (?:se passe|ne se passe)|cass[ée]e?|plante\w*|erreur|probl[èe]me|bloqu[ée]e?|invisible|dispara[iî]\w*)\b/i;

const ASKS_TO_MAKE = /\b(make|create|build|write|code|develop|generate|design|i want|i['’]d like|i need|can you make|fais|fabrique|cr[ée]e\w*|g[ée]n[èe]re|d[ée]veloppe\w*|[ée]cris|je veux|je voudrais|j['’]aimerais)\b/i;
/**
 * The failsafe under the models' decision, never above it: a message that has a verb of making AND names a program (a game, an app, a tool, a page) and is not a question
 * is a request to build, whatever a small model said. A false "no" is the costly mistake, so the words only ever turn a "no" into a "yes".
 */
const WRITING_NOT_CODE = /\b(poem|poems|story|stories|essay|email|e-mail|mail|letter|article|song|joke|jokes|book|summary|po[èe]me|histoire|lettre|chanson|blague|livre|r[ée]sum[ée]|dissertation|texte)\b/i;
export const wordsAskForProgram = (request: string) => !QUESTION.test(request) && !WRITING_NOT_CODE.test(request) && ASKS_TO_MAKE.test(request) && (GAME_OR_TOOL.test(request) || /\b(app|apps|program|programme|page|website|site web|application|outil|tool)\b/i.test(request));

/** A message that asks for the files to change: an order, or a report that something does not work. Not a question. */
const POINTED_PARTS = /^\s*\[The user pointed at these parts of "/;
export const looksLikeChange = (request: string) => POINTED_PARTS.test(request) || (!QUESTION.test(request) && (CHANGE_WORDS.test(request) || BUG_WORDS.test(request)));

/** The file a change is most likely about when the plan did not say: the script for behaviour, the stylesheet for looks, else the page. */
export function guessFile(names: string[], request: string): string | undefined {
  const by = (re: RegExp) => names.find((n) => re.test(n));
  const looks = /\b(colou?r|couleur|font|police|style|size|taille|background|fond|margin|padding|border|bordure|theme|th[eè]me|dark|sombre|animation|bigger|smaller|plus grand|plus petit)\b/i.test(request);
  if (looks && by(/\.css$/i)) return by(/\.css$/i);
  return by(/\.m?js$/i) ?? by(/\.html?$/i) ?? names[0];
}

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
  if (files.length && mode !== "answer") return { mode: "build", design, files: collapseSmall(files, design, request, existing).slice(0, MAX_PLAN_FILES), read: [] };
  if (mode === "answer" || (mode === null && existing.length)) return { mode: "answer", design: "", files: [], read: read.slice(0, 3) };
  if (!existing.length && BUILD_WORDS.test(request)) {
    // no plan came back: a web request still gets the usual three files
    if (WEB_WORDS.test(request)) {
      const one = GAME_OR_TOOL.test(request) && !SITE_WORDS.test(request) && !WANTS_SEPARATE_FILES.test(request);
      const base: PlanFile[] = one ? [{ name: "index.html", action: "new", job: "everything the user asked for, in this one file: page, styling and working behaviour" }]
        : [{ name: "index.html", action: "new", job: "the page the user asked for" }, { name: "style.css", action: "new", job: "all the styling" }];
      if (!one && (BEHAVIOUR_WORDS.test(request) || WANTS_SEPARATE_FILES.test(request))) base.push({ name: "script.js", action: "new", job: "the behaviour the user asked for" });
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

const uniq = (xs: string[], max = 60) => [...new Set(xs)].slice(0, max);
const short = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * What a script offers and expects, read from its text without asking a model: the functions with their parameters, the
 * variables that hold its state, the elements it looks for in the page, the events it listens to. This is the contract the
 * other files (and the next part of the same file) must keep, and the part of a file worth keeping when there is no room for all of it.
 */
export function scriptSurface(code: string): string[] {
  const fns: string[] = [];
  const state: string[] = [];
  for (const line of code.split("\n")) {
    if (line.length > 400) continue;
    let m = /^\s{0,2}(?:export\s+)?(?:async\s+)?function\*?\s+([\w$]+)\s*\(([^)]*)\)/.exec(line);
    if (m) { fns.push(`${m[1]}(${short(m[2].replace(/\s+/g, " ").trim(), 40)})`); continue; }
    m = /^\s{0,2}(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function\s*\(([^)]*)\)|\(([^)]*)\)\s*=>|([\w$]+)\s*=>)/.exec(line);
    if (m) { fns.push(`${m[1]}(${short((m[2] ?? m[3] ?? m[4] ?? "").replace(/\s+/g, " ").trim(), 40)})`); continue; }
    m = /^\s{0,2}class\s+([\w$]+)/.exec(line);
    if (m) { fns.push(`class ${m[1]}`); continue; }
    m = /^(?:const|let|var)\s+(.*)$/.exec(line);
    if (m) state.push(...[...m[1].matchAll(/(?:^|,)\s*([\w$]+)\s*(?==(?!=)|;|,|$)/g)].map((x) => x[1]));
  }
  const ids = [...code.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)].map((m) => `#${m[1]}`).concat([...code.matchAll(/querySelector(?:All)?\(\s*["']([#.][\w-]+)["']\s*\)/g)].map((m) => m[1]));
  const events = [...code.matchAll(/addEventListener\(\s*["'](\w+)["']/g)].map((m) => m[1]);
  return [
    fns.length ? `defines: ${uniq(fns).join(", ")}` : "",
    state.length ? `state: ${uniq(state, 30).join(", ")}` : "",
    ids.length ? `looks for: ${uniq(ids, 30).join(" ")}` : "",
    events.length ? `listens to: ${uniq(events, 12).join(", ")}` : ""
  ].filter(Boolean);
}

/** The script of a file: the file itself, or the scripts a page holds. */
const scriptOf = (f: { kind: string; language: string; content: string }) => (f.kind === "html" ? inlineScripts(f.content).map((s) => s.code).join("\n") : f.content);

/**
 * What a script had that works and a change took away: functions, events it listened to, the keys it handled. A small model that
 * is asked for one change often rewrites the controls on the way ("the arrow keys do not turn any more") and nothing throws,
 * so this is what tells. Anything the request itself names is allowed to go.
 */
export function lostSurface(before: FileLike, after: FileLike, request: string): { names: string[]; lines: number[] } {
  const a = scriptOf(before), b = scriptOf(after);
  if (!a.trim()) return { names: [], lines: [] };
  const sets = (code: string) => {
    const fns = new Set([...(scriptSurface(code).find((l) => l.startsWith("defines: "))?.slice(9).split(/,\s*(?![^()]*\))/) ?? [])].map((x) => x.replace(/\(.*$/, "").replace(/^class /, "")).filter(Boolean));
    const events = new Set([...code.matchAll(/addEventListener\(\s*["'](\w+)["']/g)].map((m) => `the "${m[1]}" listener`));
    const keys = new Set([...code.matchAll(/\b(Arrow(?:Up|Down|Left|Right)|Enter|Escape|Backspace)\b/g)].map((m) => `the ${m[1]} key`));
    return [...fns, ...events, ...keys];
  };
  const have = new Set(sets(b));
  const asked = request.toLowerCase();
  const names = sets(a).filter((n) => !have.has(n) && !asked.includes(n.replace(/^the "?|"? (?:listener|key)$/g, "").toLowerCase()));
  const lines: number[] = [];
  a.split("\n").forEach((l, i) => { if (names.some((n) => { const w = n.replace(/^the "?|"? (?:listener|key)$/g, ""); return l.includes(n.startsWith("the ") ? (n.endsWith("listener") ? `"${w}"` : w) : `${w}(`) || l.includes(`function ${w}`); })) lines.push(i + 1); });
  return { names: [...new Set(names)].slice(0, 8), lines };
}

/** What the files share, as the other files must know it: ids and classes of a page, selectors of a stylesheet, functions of a script. */
export function interfaceOf(f: FileLike): string {
  if (f.kind === "html") {
    const ids = uniq([...f.content.matchAll(/\bid\s*=\s*["']([\w-]+)["']/gi)].map((m) => `#${m[1]}`));
    const classes = uniq([...f.content.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)].flatMap((m) => m[1].split(/\s+/).filter(Boolean).map((c) => `.${c}`)));
    const tags = uniq([...f.content.matchAll(/<(canvas|button|input|form|select|textarea|table|ul|ol|nav|header|footer|main|section|article|img|video|audio|svg)\b/gi)].map((m) => m[1].toLowerCase()), 20);
    const links = linkedFiles(f.content);
    const inline = inlineScripts(f.content).flatMap((s) => scriptSurface(s.code)).map((l) => `page script ${l}`);
    const calls = uniq([...f.content.matchAll(/\bon\w+\s*=\s*["']\s*([\w$]+)\s*\(/g)].map((m) => m[1]), 20);
    return [`ids: ${ids.join(" ") || "none"}`, `classes: ${classes.join(" ") || "none"}`, tags.length ? `elements: ${tags.join(", ")}` : "", links.length ? `links: ${links.join(", ")}` : "", calls.length ? `the page calls: ${calls.join(", ")}` : "", ...inline].filter(Boolean).join("\n");
  }
  if (f.language === "css") {
    const sel = uniq([...f.content.matchAll(/(^|\})\s*([^{}@][^{}]*)\{/g)].flatMap((m) => m[2].split(",").map((s) => s.trim())).filter((s) => s && s.length < 60));
    const vars = uniq([...f.content.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]), 20);
    return `selectors: ${sel.join(" | ") || "none"}${vars.length ? `\nvariables: ${vars.join(" ")}` : ""}`;
  }
  if (/^(javascript|js|typescript|ts)$/i.test(f.language)) return scriptSurface(f.content).join("\n") || "defines: nothing named";
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

/** The part of a starting point that belongs to one file, when the program is planned as page, stylesheet and script. */
export function skeletonFile(s: Skeleton, file: PlanFile, plan: PlanFile[]): Skeleton | null {
  if (!plan.every((f) => /\.(html?|css|m?js)$/i.test(f.name))) return null;
  const css = plan.find((f) => /\.css$/i.test(f.name));
  const js = plan.find((f) => /\.m?js$/i.test(f.name));
  const style = /<style>([\s\S]*?)<\/style>/.exec(s.html)?.[1];
  const script = /<script>([\s\S]*?)<\/script>/.exec(s.html)?.[1];
  const dedent = (t: string) => t.replace(/^\n+/, "").replace(/\s+$/, "").split("\n").map((l) => l.replace(/^ {2}/, "")).join("\n") + "\n";
  const k = kindOfFile(file.name);
  if (k.kind === "html") {
    let h = s.html;
    if (css && style) h = h.replace(/<style>[\s\S]*?<\/style>/, `<link rel="stylesheet" href="${css.name}">`);
    if (js && script) h = h.replace(/<script>[\s\S]*?<\/script>/, `<script src="${js.name}"></script>`);
    return { ...s, html: h };
  }
  if (k.language === "css") return style && css ? { ...s, html: dedent(style) } : null;
  if (k.language === "javascript") return script && js ? { ...s, html: dedent(script) } : null;
  return null;
}

/** A document can hold the app's drawn blocks: a session that changes one is told so (and how they are written). */
const docNote = (name: string) => (kindOfFile(name).kind === "markdown" ? `\nThe document may hold drawn blocks (chart, mermaid, kpi, quiz, cards, checklist, sheet, tables, formulas); keep the ones that are there, and add one where a figure says it better than words.\n${VISUAL_OVERVIEW}\n${BLOCK_INSTRUCTIONS}` : "");

const RULES = "Everything is inline or in the project's own files: no network, no CDN, no external images or fonts (draw with canvas, SVG or CSS). No eval.";

export const SPEC_INSTRUCTIONS = [
  "You write the rules of a small program before anyone codes it. You never write code.",
  "Reply with 5 to 8 short lines, one rule each, with concrete values: the screen or board and its size, the controls, how things move or change and how fast, what happens on a win, a loss or a collision, how the score or result is shown, how to start again.",
  "Only rules the user's request needs. No title, no introduction, no code."
].join("\n");

export const specPrompt = (request: string, file: PlanFile) => `The user asked:\n${clip(request.trim(), 1500)}\n\nThe program will be one file, ${file.name}: ${file.job}\n\nWrite its rules now.`;

/** The rules as lines, cleaned of bullets and numbering, or "" when the reply holds none. */
export function cleanSpec(reply: string): string {
  const lines = reply.replace(/<think>[\s\S]*?<\/think>/g, "").split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter((l) => l.length > 6 && !/^```/.test(l));
  return lines.slice(0, 8).map((l) => `- ${l.slice(0, 220)}`).join("\n");
}

export function writerInstructions(file: PlanFile, plan: PlanFile[], extra: { skeleton?: boolean; spec?: boolean; engine?: boolean } = {}): string {
  const hasCss = plan.some((f) => /\.css$/i.test(f.name));
  const hasJs = plan.some((f) => /\.m?js$/i.test(f.name));
  const kind = kindOfFile(file.name);
  const per = kind.kind === "html"
    ? [hasCss ? `Link the stylesheet with <link rel="stylesheet" href="${plan.find((f) => /\.css$/i.test(f.name))!.name}"> in the head and write no <style> block.` : "Put the styling in a <style> block in the head.",
      hasJs ? `Load the script with <script src="${plan.find((f) => /\.m?js$/i.test(f.name))!.name}"></script> just before </body> and write no inline <script>.` : "Put the behaviour in a <script> block just before </body>.",
      hasJs ? "Give every element the style or the script needs an id or a class. Structure and content only."
        : "This one file is the whole program: it must work as soon as it is opened. Write all of it, complete: no placeholder, no TODO, no \"add the rest here\". For a game that means the loop (requestAnimationFrame or setInterval), keyboard input, movement, collisions, score, game over and a way to restart, all wired to the elements you wrote."].join(" ")
    : kind.language === "css" ? "Style the ids and classes listed under the page's interface, nothing else; do not invent markup. Make it look good: spacing, colours, readable type."
      : kind.language === "javascript" ? "This is a plain script, not a module: never write import or export. The script runs after the page is loaded: use only the ids and classes listed under the page's interface, and never assume an element exists that is not listed. Do not wait for DOMContentLoaded."
        : kind.kind === "markdown" ? `It is a document: write it finished and well organised (headings, short paragraphs, lists). Where a figure, a diagram, a table, a quiz or a formula says it better than words, put a drawn block right there in the text instead of describing it, and never draw one with HTML or SVG.\n${VISUAL_OVERVIEW}\n${BLOCK_INSTRUCTIONS}`
        : "";
  const lead = extra.skeleton ? "You are given a working program that was tested. Start from it: keep everything that works exactly as it is and change only what the user's request asks for. " : extra.spec ? "Follow the rules you are given to the letter. " : "";
  const engine = extra.engine ? "The page uses a small game engine that is loaded for you: `Game.run({...})` plays the things and rules it is given (loop, keys, mouse, movement, collisions, score, lives and restart are done). Write the game the user asked for in the form of the examples you are given: a Game.run call with its things and its rules, with the things, numbers and rules that game needs. The examples are other games, only there to show the form. Write no loop, no key handling and no collision code, and do not write the engine. Speeds are in pixels per second.\n" + ENGINE_DOC + "\n" : "";
  return `You write exactly one file: ${file.name}. ${lead}${engine}Reply with the complete raw content of that file and nothing else: no explanation, no code fence, no <artifact> tag. ${per} ${RULES}`;
}

export function writerPrompt(request: string, plan: PlanFile[], file: PlanFile, done: FileLike[], room: number, design = "", extra: { spec?: string; skeleton?: Skeleton; example?: string } = {}): string {
  const others = plan.filter((f) => f.name !== file.name).map((f) => `- ${f.name}: ${f.job}`).join("\n");
  const context = done.length ? `\nWhat is already written:\n${done.map((f) => shown(f, room)).join("\n\n")}\n` : "";
  const rules = extra.spec ? `\nThe rules the program must follow (decided before coding):\n${extra.spec}\n` : "";
  const example = extra.example ? `\nHow a game is written with the engine, shown with other games (use only their form: the user's game is its own, with its own things, rules and look):\n${extra.example}\n` : "";
  const start = extra.skeleton ? `\nA working ${extra.skeleton.name} program, tested${file.name ? ` (this is its ${file.name}` : " ("}; adapt it to the request and send the complete adapted file):\n${extra.skeleton.html.replace(/\s+$/, "")}\n` : "";
  return `The user asked:\n${clip(request.trim(), 2500)}\n${design ? `\nDesign shared by every file: ${design}\n` : ""}\nThe project:\n- ${file.name} (yours): ${file.job}\n${others}\n${context}${rules}${example}${start}\n${extra.skeleton ? `Send the complete ${file.name}, adapted, now.` : `Write ${file.name} now.`}`;
}

/** A page that was cut off before its end still has to be a page. */
export function closeHtml(html: string): string {
  let out = html.replace(/\s+$/, "");
  if (!/<\/body\s*>/i.test(out)) out += "\n</body>";
  if (!/<\/html\s*>/i.test(out)) out += "\n</html>";
  return `${out}\n`;
}

/** The number of the slide a request is about ("on slide 3", "diapo 2", "the 4th slide"); null when it names none. */
export function slideNumberOf(text: string): number | null {
  const m = /\b(?:slide|diapo(?:sitive)?|page)\s*(?:n[°o]\s*)?#?(\d{1,2})\b/i.exec(text) ?? /\b(\d{1,2})(?:st|nd|rd|th|e|[èe]me|[èe]re|er)?\s+(?:slide|diapo(?:sitive)?)\b/i.exec(text);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 ? n : null;
}

/** The text of slide `n` of a deck (the parts between lines of ---, the Theme line before the first slide not counted), with what comes before and after it, so that `before + text + after` is the deck. */
export function slideSpan(content: string, n: number): { before: string; text: string; after: string } | null {
  const spans: [number, number][] = [];
  let at = 0;
  for (const m of content.matchAll(/^[ \t]*---+[ \t]*$/gm)) { spans.push([at, m.index!]); at = m.index! + m[0].length; }
  spans.push([at, content.length]);
  const slides = spans.filter(([a, b]) => { const t = content.slice(a, b); return t.trim() && !(/^\s*Theme:/i.test(t) && !/^#/m.test(t)); });
  const pick = slides[n - 1];
  return pick ? { before: content.slice(0, pick[0]), text: content.slice(pick[0], pick[1]), after: content.slice(pick[1]) } : null;
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
export type Session = (sid: string, messages: ChatMessage[], worker: boolean, role?: WriterRole, schema?: object) => AsyncGenerator<ChatEvent>;

export const roleOfFile = (name: string): WriterRole | undefined => (/\.html?$/i.test(name) ? "html" : /\.css$/i.test(name) ? "css" : /\.m?js$/i.test(name) ? "js" : undefined);

export interface StepwiseOptions {
  id: string;
  /** The conversation as sent: system message, turns with their files, the new request. */
  messages: ChatMessage[];
  /** One completion in a session of its own. `worker` = short thinking. */
  stream: Session;
  signal?: AbortSignal;
  /** What the person asked for on the step in progress: `n` goes up with each request; a session that sees it go up stops where it is. `skip` leaves the step out, `back` writes the one before it again. */
  control?: () => { n: number; action: "skip" | "back" };
  /** Characters of code a session can take next to its instructions. */
  maxChars: number;
  focusFrom?: number;
  /** Runs a page the way the preview does (keys, clicks) and says what went wrong. Without it, the test run is skipped. */
  /** The name of the model a role runs on, to show next to the agent that uses it. */
  modelOf?: (role?: WriterRole) => string | undefined;
  /** A model that can see looks at a screenshot of the finished page and says what is wrong with it; null when none is installed or it could not answer. */
  lookAt?: (shot: string, question: string) => Promise<string | null>;
  /** One yes/no question about the request put to the small router model; null when it cannot answer. */
  askRouter?: (ask: string) => Promise<boolean | null>;
  check?: (page: FileLike, files: FileLike[], scenarios?: Scenario[]) => Promise<{ errors: string[]; notes?: string[]; shot?: string; scenarios?: { text: string; ok: boolean; detail: string }[]; probe?: { plan: ProbePlan; effects: Record<string, boolean>; seen?: Record<string, boolean> } }>;
}

export type StepwiseResult =
  | { handled: true; text: string; stats: ChatStats }
  /** Not a job for files: the main session answers, with `messages` (files reduced to stubs, plus the parts asked for). */
  | { handled: false; messages: ChatMessage[] };

const withoutArtifactRules = (m: ChatMessage): ChatMessage => (m.role === "system" && typeof m.content === "string" ? { ...m, content: m.content.replace(ARTIFACT_INSTRUCTIONS, "").trim() } : m);

async function collect(stream: Session, sid: string, messages: ChatMessage[], add: (s: ChatStats) => void, signal?: AbortSignal, role?: WriterRole, schema?: object): Promise<string> {
  let text = "";
  for await (const ev of stream(sid, messages, true, role, schema)) {
    text = withAnswer(text, ev);
    if (ev.type === "done") add(ev.stats);
  }
  if (signal?.aborted) throw new Error("aborted");
  return text;
}

/** The helper behind each stage. The tester has no model: it runs the page itself, on this PC. */
export const AGENTS: Record<string, { name: string; model: boolean }> = {
  plan: { name: "Planner", model: true }, spec: { name: "Planner", model: true }, edit: { name: "Editor", model: true }, write: { name: "Writer", model: true },
  fix: { name: "Fixer", model: true }, explain: { name: "Narrator", model: true }, baseline: { name: "Tester", model: false }, look: { name: "Viewer", model: false }, run: { name: "Tester", model: false }
};

export const LOOK_INSTRUCTIONS = "You look at a screenshot of a program that was just made and say whether it shows what the user asked for, working, with nothing broken: empty areas where something should be shown, text cut off or unreadable, things on top of each other, a game board with no pieces, a page that looks unfinished. Reply with exactly one line: OK, or PROBLEM: followed by one short sentence saying what is wrong or missing. Judge only what is visible. Never say OK for a board, list or canvas that is empty when the request needs it to show something.";
export const lookPrompt = (request: string) => `The user asked:\n${clip(request.trim(), 900)}\n\nThis is the program as it looks now. Is anything wrong or missing?`;
/** The problem a viewer names, or null when it says OK, says nothing or says something that is not a verdict. */
export function parseLook(reply: string): string | null {
  const m = /PROBLEM\s*:\s*(.+)/i.exec(reply.replace(/<think>[\s\S]*?<\/think>/g, " "));
  return m ? m[1].trim().split("\n")[0].slice(0, 240) : null;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export async function* stepwise(o: StepwiseOptions): AsyncGenerator<ChatEvent, StepwiseResult> {
  const total: ChatStats = { ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0 };
  const add = (s: ChatStats) => {
    total.tokens += s.tokens;
    total.totalSec = Math.round((total.totalSec + s.totalSec) * 100) / 100;
    if (total.ttftSec === null) total.ttftSec = s.ttftSec;
    if (total.answerSec == null) total.answerSec = s.answerSec;
    if (total.tokPerSec === null) total.tokPerSec = s.tokPerSec;
  };
  const aborted = () => { if (o.signal?.aborted) throw new Error("aborted"); };
  const ctl = () => o.control?.() ?? { n: 0, action: "skip" as const };
  let seenCtl = ctl().n;
  const lastUserAt = o.messages.map((m) => m.role).lastIndexOf("user");
  const request = textOf(o.messages[lastUserAt]);
  const files = latestArtifacts(o.messages) as FileLike[];
  const startedAt = Date.now();
  let callN = 0;
  const pendingCalls: BuildCall[] = [];
  /** A finished call, for the log: what it was for, how long, how much, and the start of what it was told and answered. */
  const recordCall = (sid: string, msgs: ChatMessage[], reply: string, think: string, began: number, stats: ChatStats | null, role?: WriterRole, error?: string) => {
    const sent = msgs.reduce((n, m) => n + textOf(m).length, 0);
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    pendingCalls.push({ n: ++callN, sid: sid.replace(/^[^:]*:/, ""), at: Math.round((Date.now() - startedAt) / 100) / 10, sec: Math.round((Date.now() - began) / 100) / 10, model: o.modelOf?.(role), sent, got: reply.length, thought: think.length, tokens: stats?.tokens, tokPerSec: stats?.tokPerSec ?? null, prompt: lastUser ? textOf(lastUser).slice(0, 1200) : undefined, reply: reply.length > 1800 ? `${reply.slice(0, 1400)}\n[…${reply.length - 1800} characters…]\n${reply.slice(-400)}` : reply, error });
  };
  const passthrough = (): StepwiseResult => ({ handled: false, messages: o.messages });

  if (lastUserAt < 0) return passthrough();

  // What the person wants is decided by a model, never by the length of the message or by a list of words: a small closed question, the
  // router first (about a second, on the processor) and the chat model itself when the router is not there. The words below only stand in
  // when no model answered at all.
  const askModel = async (question: string): Promise<boolean | null> => {
    const p = yesNoPrompt(request, question);
    let reply = "";
    try {
      for await (const ev of o.stream(`${o.id}:x:ask`, [{ role: "system", content: p.system }, { role: "user", content: p.user }], true)) {
        if (ev.type === "done") add(ev.stats);
        reply = withAnswer(reply, ev);
        if (reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim().length >= 3) break;
      }
    } catch (e) { if (o.signal?.aborted) throw e; return null; }
    return parseYesNo(reply);
  };
  const ask = async (question: string): Promise<boolean | null> => (o.askRouter ? await o.askRouter(question).catch(() => null) : null) ?? (await askModel(question));
  // A wrong "no" is the costly mistake (a request to build answered as a chat, or a change taken for a new program that replaces the file), and the small router is the one that
  // makes it: when it does not say yes, the chat model is asked the same question, and either one saying yes is a yes.
  const trail: string[] = [];
  const askEither = async (question: string, label: string): Promise<boolean | null> => {
    const r = o.askRouter ? await o.askRouter(question).catch(() => null) : null;
    if (r === true) { trail.push(`${label}: router yes`); return true; }
    const m = await askModel(question);
    trail.push(`${label}: ${o.askRouter ? `router ${r === null ? "no answer" : "no"}, ` : ""}chat model ${m === null ? "no answer" : m ? "yes" : "no"}`);
    return m === true ? true : m === false || r === false ? false : null;
  };
  const unfinished = files.find((f) => resumable(f.content) || (!!readMark(f.content, "x-construct") && !/<!--\s*\/x-construct\s*-->/.test(f.content)));
  type Intent = "chat" | "new" | "change" | "continue";
  const decide = async (): Promise<Intent | null> => {
    const ctx = files.length ? "In this conversation a program was already written, and the person writes again. " : "";
    if (unfinished && (await ask(`${ctx}Does it ask to continue, resume or finish the work that was stopped?`)) === true) return "continue";
    const make = await askEither(`${ctx}Does it ask to make, write, build or change a program, page, game, app or tool, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a document or a thanks.)`, "a program to make or change");
    let wants = make;
    if (make === false && wordsAskForProgram(request)) { trail.push("failsafe: the words say it asks for a program"); wants = true; }
    if (wants === null) return null;
    if (!wants) return "chat";
    if (!files.length) return "new";
    const about = await askEither(`${ctx}Is it about the program that already exists (change it, fix it, add to it), not a new one?`, "about the program that exists");
    let aboutIt = about;
    if (about === false && looksLikeChange(request)) { trail.push("failsafe: the words say it is a change"); aboutIt = true; }
    return aboutIt === null ? null : aboutIt ? "change" : "new";
  };
  const intent = await decide();
  if (trail.length) yield { id: o.id, type: "notice", text: `Understood as: ${intent ?? "unclear"} (${trail.join("; ")})` };
  if (intent === null) {
    // no model answered: the words stand in (a message with nothing in it to build is a chat)
    if (!files.length && request.trim().length < 15 && !directPlan(request, [])) return passthrough();
  } else if (intent === "chat" && !files.length) return passthrough();
  // a chart, a diagram or a calculator of numbers is drawn by the app from a block of the reply: no planner call, no page to write
  if (!files.length && routeVisual(request)) return passthrough();
  // with no file in the chat, a message that asks for nothing to be made never reaches the planner
  if (!files.length && intent === null && !wantsFiles(request) && !directPlan(request, [])) return passthrough();

  const idle = (): ChatEvent => ({ id: o.id, type: "build", build: { status: "done", steps: [] } });
  const startStages: BuildStage[] = [];
  /** The last words of whatever a helper is writing or thinking right now (not a file: its code is shown by its panel), for the strip under the journal. */
  let live = "";
  // what has been written so far, for the counters of the card: finished calls count by their real token total, the one running by its text
  let curChars = 0, curLines = 0, doneLines = 0, doneChars = 0; // the whole work so far: every session, finished or running
  let artDraft = "";
  /** The unit the construction engine is writing right now, with what has come of it: the panel shows its code as it appears. */
  let activeUnit: { name: string; label: string; code: string } | null = null;
  const lineCount = (t: string) => (t ? t.split("\n").length : 0);
  const counting = (reply: string, think = "") => { curChars = reply.length + think.length; curLines = lineCount(reply); };
  const counted = () => { doneLines += curLines; doneChars += curChars; curChars = 0; curLines = 0; };
  const liveOf = (reply: string, think: string) => (reply || think).slice(-900);
  // The planner is a model call, seconds of waiting: it is only made when the words cannot say. A plain request for one small program, a
  // question or a remark about files that exist, and a change to a project that is one file, need no planner.
  let direct: Plan | null = null;
  const edit = (name: string): Plan => ({ mode: "build", design: "", files: [{ name, action: "edit", job: clip(request.trim(), 200) }], read: [] });
  const resumeFile = unfinished;
  let change = false;
  if (intent === null) {
    // no model answered: the old words decide
    direct = directPlan(request, files.map((f) => f.title));
    const resumed = !direct && request.trim().length < 80 && RESUME_WORDS.test(request.trim()) ? unfinished : undefined;
    if (resumed) direct = { mode: "build", design: "", files: [{ name: resumed.title, action: "new", job: "continue the page" }], read: [] };
    change = looksLikeChange(request);
    if (!direct && files.length && !change) direct = { mode: "answer", design: "", files: [], read: [] };
    if (!direct && files.length === 1 && change) direct = edit(files[0].title);
  } else if (intent === "continue" && unfinished) {
    direct = { mode: "build", design: "", files: [{ name: unfinished.title, action: "new", job: "continue the page" }], read: [] };
  } else if (intent === "chat") {
    direct = { mode: "answer", design: "", files: [], read: [] };
  } else if (intent === "change") {
    change = true;
    if (files.length === 1) direct = edit(files[0].title);
  } else if (intent === "new") {
    // one program in one page, or several files: a model says which (the planner is a call of its own, a half minute on a small model)
    const several = await ask("Does it need several separate files or pages (a website with pages, a project) rather than one program in one page?");
    if (several === false) {
      const named = (GAME_WORDS.test(request) || ARCADE_WORDS.test(request)) && !skeletonFor(request) ? gameFileName(request) : "index.html";
      direct = { mode: "build", design: "", files: [{ name: named, action: "new", job: "the whole program in this one file: page, styling and working behaviour" }], read: [] };
    }
  }
  let plan: Plan = direct ?? { mode: "answer", design: "", files: [], read: [] };
  if (!direct) {
    const planning: BuildStage = { id: "plan", label: "Planning", status: "running", note: "working out which files to write or change", agent: "Planner", model: o.modelOf?.("plan") };
    const planStart = Date.now();
    planning.at = planStart;
    startStages.push(planning);
    yield { id: o.id, type: "build", build: { status: "running", steps: [], phase: "Planning: working out which files to write or change…", start: startStages.map((x) => ({ ...x })) } };
    try {
      // seen as it is written: how long it has been thinking, then its mode and the files it plans, as they come
      let reply = "", thought = 0, last = 0, think = "";
      const planMsgs: ChatMessage[] = [{ role: "system", content: PLANNER_INSTRUCTIONS }, { role: "user", content: plannerPrompt(o.messages, files) }];
      const planBegan = Date.now();
      let planStats: ChatStats | null = null;
      for await (const ev of o.stream(`${o.id}:plan`, planMsgs, true, "plan")) {
        if (ev.type === "done") { add(ev.stats); planStats = ev.stats; }
        if (ev.type === "thinking") { thought += ev.text.length; think += ev.text; }
        reply = withAnswer(reply, ev);
        if (Date.now() - last > 600) {
          last = Date.now();
          live = liveOf(reply, think);
          const secs = Math.round((Date.now() - planStart) / 1000);
          planning.note = planPreview(reply) || (thought ? `thinking, ${secs}s` : `reading the request, ${secs}s`);
          yield { id: o.id, type: "build", build: { status: "running", steps: [], phase: `Planning: ${planning.note}…`, live, start: startStages.map((x) => ({ ...x })) } };
        }
      }
      live = "";
      recordCall(`${o.id}:plan`, planMsgs, reply, think, planBegan, planStats, "plan");
      if (o.signal?.aborted) throw new Error("aborted");
      plan = parsePlan(reply, files.map((f) => f.title), request);
      planning.status = "done";
      planning.sec = Math.round((Date.now() - planStart) / 100) / 10;
      planning.note = plan.mode === "build" ? plural(plan.files.length, "file") : "no file to change";
    } catch (e) {
      if (o.signal?.aborted) throw e;
      yield idle();
      return passthrough();
    }
  }

  // A request to change what exists is a build, whatever the planner thought: in a chat the model only sees one line per file, so
  // edit blocks it wrote there could never match the file (the cause of "1 change did not match the file").
  if (plan.mode === "answer" && files.length && change && !plan.read.length) {
    try {
      const reply = await collect(o.stream, `${o.id}:plan:again`, [
        { role: "system", content: PLANNER_INSTRUCTIONS },
        { role: "user", content: `${plannerPrompt(o.messages, files)}\n\nThe user is asking for a change to the files that exist. Reply with Mode: build and one File line (edit) for each file to change.` }
      ], add, o.signal, "plan");
      const again = parsePlan(reply, files.map((f) => f.title), request);
      if (again.mode === "build") plan = again;
    } catch (e) { if (o.signal?.aborted) throw e; }
    if (plan.mode === "answer") {
      const name = guessFile(files.map((f) => f.title), request);
      if (name) plan = { mode: "build", design: "", files: [{ name, action: "edit", job: clip(request.trim(), 200) }], read: [] };
    }
  }

  if (plan.mode === "answer") {
    yield idle();
    // the main session keeps talking, without the code; it gets the parts it was said to need. It is told it cannot change files
    // here: with one line per file in front of it, edit blocks would never match.
    const stubbed = stubHistory(o.messages);
    // with no file in the chat the model may still make one itself; with files, it only sees one line of each, so it must not write edit blocks
    const msgs = files.length ? withSystem(stubbed.map(withoutArtifactRules), "In this reply you only answer: do not write <edit> blocks or <artifact> tags. When the user wants the files changed, they ask and the change is made for them. To show an idea, use a short snippet in a code fence.") : stubbed;
    const room = Math.max(1500, Math.floor(o.maxChars / 3));
    // never leave the model without the code it is asked about ("I don't have access to your code"): the files the message names,
    // else the one the question is most likely about
    if (!plan.read.length && request.trim().length >= 12) {
      const named = files.filter((f) => request.toLowerCase().includes(f.title.toLowerCase())).map((f) => f.title);
      const pick = named.length ? named : [guessFile(files.map((f) => f.title), request)].filter((n): n is string => !!n);
      plan = { ...plan, read: pick.slice(0, 2).map((name) => ({ name, spots: [] })) };
    }
    const blocks = plan.read.map((r) => {
      const f = files.find((x) => x.title === r.name)!;
      if (f.content.length <= room) return artifactText(f);
      const ranges = resolveSpots(f.content, r.spots);
      return `<file name="${f.title}">\n${outlineText(f.title, f.content)}\n${excerpts(f.content, ranges.length ? ranges : [[1, 60]], room)}\n</file>`;
    });
    if (blocks.length) {
      const at = msgs.map((m) => m.role).lastIndexOf("user");
      const u = msgs[at];
      msgs[at] = { ...u, content: typeof u.content === "string" ? `${u.content}\n\nFiles you wrote earlier in this conversation (read-only, to answer from; the user did not paste them):\n${blocks.join("\n")}` : [...u.content, { type: "text" as const, text: `\n\nFiles you wrote earlier in this conversation (read-only, to answer from; the user did not paste them):\n${blocks.join("\n")}` }] };
    }
    return { handled: false, messages: msgs };
  }

  // ---- build
  const steps: BuildStep[] = [...plan.files].sort((a, b) => rank(a.name) - rank(b.name)).map((f) => ({ file: f.name, action: f.action, job: f.job, status: "waiting" as const }));
  const verify: BuildStage[] = [];
  const warnings = new Map<string, string>(); // file → what a change may have taken away and could not be put back
  let spec = "";
  const began = new WeakMap<BuildStage, number>();
  /** A stage starts: it shows at once, with a clock, in the card and in the live line. */
  const begin = (list: BuildStage[], id: string, label: string, note?: string, role?: WriterRole): BuildStage => {
    const st: BuildStage = { id, label, status: "running", note };
    const who = AGENTS[id];
    if (who) { st.agent = who.name; if (who.model) st.model = o.modelOf?.(id === "spec" ? "plan" : role); }
    st.at = Date.now();
    began.set(st, st.at);
    list.push(st);
    return st;
  };
  const end = (st: BuildStage, status: BuildStage["status"], note?: string) => {
    st.status = status;
    if (note !== undefined) st.note = note;
    st.sec = Math.round((Date.now() - (began.get(st) ?? Date.now())) / 100) / 10;
  };
  /** A line in the log of a stage, kept short enough to ride along with every update of the build. */
  const logTo = (st: BuildStage, text: string) => { const t = `[${(Math.round((Date.now() - (began.get(st) ?? Date.now())) / 100) / 10).toFixed(1)}s] ${text}`; st.log = ((st.log ? `${st.log}\n` : "") + t).slice(-14000); };
  const stagesOf = (s: BuildStep) => (s.stages ??= []);
  const phaseOf = (): string => {
    const after = verify.find((s) => s.status === "running");
    if (after) return `${after.label}${after.note ? ` · ${after.note.replace(/…$/, "")}` : ""}…`;
    const cur = steps.find((s) => s.status === "running");
    if (!cur) return "";
    const st = cur.stages?.find((x) => x.status === "running");
    return `${cur.action === "edit" ? "Modifying" : "Writing"} ${cur.file} · ${st ? `${st.label}${st.note ? `: ${st.note.replace(/…$/, "")}` : ""}` : (cur.note ?? "").replace(/…$/, "")}…`;
  };
  const copy = (xs?: BuildStage[]) => xs?.map((x) => ({ ...x }));
  const run = (status: BuildRun["status"]): ChatEvent => ({ id: o.id, type: "build", build: { status, request: clip(request, 3000), calls: pendingCalls.length ? pendingCalls.splice(0) : undefined, steps: steps.map((s) => ({ ...s, stages: copy(s.stages) })), phase: status === "running" ? phaseOf() : undefined, spec: spec || undefined, live: status === "running" && live ? live : undefined, tokens: Math.max(total.tokens + Math.round(curChars / 3.6), Math.round((doneChars + curChars) / 3.6)) || undefined, lines: doneLines + curLines || undefined, art: status === "running" && artDraft ? artDraft.slice(0, 9000) : undefined, unit: status === "running" && activeUnit ? { ...activeUnit } : undefined, start: startStages.length ? copy(startStages) : undefined, verify: verify.length ? copy(verify) : undefined } });
  const ordered = steps.map((s) => plan.files.find((f) => f.name === s.file)!);
  let text = "";
  const say = (s: string): ChatEvent => { text += s; return { id: o.id, type: "answer", text: s }; };
  const current = new Map(files.map((f) => [f.title.toLowerCase(), f]));
  const touched: FileLike[] = [];
  const room = Math.max(1500, Math.floor(o.maxChars / 3));
  const focusFrom = o.focusFrom ?? FOCUS_FROM;
  yield run("running");

  const headOf = (name: string) => { const k = kindOfFile(name); return `<artifact type="${k.kind}"${k.kind === "code" ? ` language="${k.language}"` : ""} title="${name.replace(/"/g, "'")}">\n`; };
  /** What a stage of a page of blocks is called: what it makes, never the file's name. */
  const stageName = (raw: string) => { const own = raw.replace(/_+/g, " "); return stageLabel(own); };
  const stageLabel = (own: string) => own === "Look" ? "Choosing the look" : own === "Outline" ? "Planning the sections" : own === "Requirements" ? "Listing what is asked" : own === "Structure" ? "Planning the parts" : own === "Style" ? "Choosing the look" : own === "Conventions" ? "Fixing what the numbers mean" : own === "Wiring" ? "Wiring the units together" : own === "Wiring (review)" ? "Checking the wiring" : own === "Shared" ? "Deciding what is written once" : own === "Screen" ? "Listing what is shown" : own === "Actions" ? "Listing what happens" : own === "Calculations" ? "Listing the calculations" : own === "Scenarios" ? "Writing the tests" : own === "Plan" ? "Planning the units" : /^Plan \((gaps|R\d+)\)$/.test(own) ? "Planning what is missing" : /^Units?: /.test(own) ? `Writing ${own.replace(/^Units?: /, "")}` : own.startsWith("Section: ") ? `Writing the ${own.slice(9).toLowerCase()} section` : own.startsWith("Drawing ") ? own.replace(/^Drawing (the )?/, "Drawing the ") : own;
  /** A whole file written by a session, shown as it comes: the file's panel fills while the session works. Returns the raw reply. */
  async function* writeLive(sid: string, msgs: ChatMessage[], role: WriterRole | undefined, before: string, head: string): AsyncGenerator<ChatEvent, string> {
    let raw = "";
    let last = 0;
    const began = Date.now();
    let stats: ChatStats | null = null;
    for await (const ev of o.stream(sid, msgs, true, role)) {
      if (ev.type === "done") { add(ev.stats); stats = ev.stats; }
      if (ev.type !== "answer" && ev.type !== "retract") continue;
      raw = withAnswer(raw, ev);
      counting(raw);
      if (Date.now() - last < 150) continue; // often, so the panel gets small steady pieces to smooth, not bursts of lines
      last = Date.now();
      const partial = cleanFile(raw, false);
      if (partial.trim()) { text = before + head + partial; yield { id: o.id, type: "replace", text }; }
    }
    counted();
    recordCall(sid, msgs, raw, "", began, stats, role);
    aborted();
    return raw;
  }

  // A change is judged against the page as it was: what its keys and buttons did before is what they must still do after.
  const originals = new Map(files.map((f) => [f.title.toLowerCase(), f]));
  let baseline: { plan: ProbePlan; effects: Record<string, boolean> } | undefined;
  const basePage = o.check && ordered.some((f) => f.action === "edit") ? (files.find((f) => f.kind === "html" && ordered.some((p) => p.name.toLowerCase() === f.title.toLowerCase())) ?? files.find((f) => f.kind === "html" && linkedFiles(f.content).some((n) => ordered.some((p) => p.name.toLowerCase() === n))) ?? files.find((f) => f.kind === "html")) : undefined;
  if (o.check && basePage) {
    const st = begin(verify, "baseline", "Page before the change", `trying the keys and buttons of ${basePage.title}`);
    yield run("running");
    try {
      baseline = (await o.check(basePage, files)).probe;
      const acting = baseline ? Object.values(baseline.effects).filter(Boolean).length : 0;
      end(st, baseline ? "done" : "skipped", baseline ? `${plural(acting, "control")} changed the page` : "could not be tried");
    } catch (e) { if (o.signal?.aborted) throw e; end(st, "skipped", "could not be tried"); }
    yield run("running");
  }

  /**
   * A session whose work is seen while it happens: the stage note says what it is doing and how far it is (thinking for so many
   * seconds, so many lines written), refreshed every second, so a slow model never looks stuck.
   */
  async function* shown(sid: string, msgs: ChatMessage[], role: WriterRole | undefined, st: BuildStage, base: string, schema?: object): AsyncGenerator<ChatEvent, string> {
    let reply = "", thought = 0, last = 0, think = "";
    const t0 = Date.now();
    const skipAt = ctl().n;
    for await (const ev of o.stream(sid, msgs, true, role, schema)) {
      if (ctl().n > skipAt) break;
      if (ev.type === "done") add(ev.stats);
      if (ev.type === "thinking") { thought += ev.text.length; think += ev.text; }
      reply = withAnswer(reply, ev);
      counting(reply, think);
      if (Date.now() - last > 400) {
        last = Date.now();
        live = liveOf(reply, think);
        const secs = Math.round((Date.now() - t0) / 1000);
        st.note = reply ? `${base} · ${plural(reply.split("\n").length, "line")} so far` : thought ? `${base} · thinking, ${secs}s` : `${base} · waiting for the model, ${secs}s`;
        yield run("running");
      }
    }
    live = "";
    counted();
    aborted();
    return reply;
  }

  /** A session that only repeats itself: a long stretch of one pattern, or sixty lines that are the same three lines with other numbers. */
  const runaway = (t: string) => {
    if (t.length < 1500) return false;
    if ((/(.{2,100}?)\1+$/s.exec(t.slice(-1500))?.[0].length ?? 0) >= 1200) return true;
    const rows = t.split("\n").map((l) => l.trim()).filter(Boolean).slice(-60);
    return rows.length >= 60 && new Set(rows.map((l) => l.replace(/\d+/g, "#"))).size <= 3;
  };
  /** A planning question is answered in short lines; a long reply with none of them is an essay, and it only costs minutes. */
  const essay = (sid: string, t: string) => /:(Structure|Style|Conventions|Wiring( \(review\))?|Shared|Screen|Actions|Calculations|Scenarios):\d+$/.test(sid) && (t.length > 9000 || (t.length > 2500 && !/^[^\n|]{3,80}\|[^\n|]+\|/m.test(t)));
  /** Any other helper session: its words scroll in the strip while it works, whatever it writes. */
  async function* helper(sid: string, msgs: ChatMessage[], role?: WriterRole, schema?: object, onText?: (text: string) => void): AsyncGenerator<ChatEvent, string> {
    let reply = "", last = 0, think = "";
    const skipAt = ctl().n, began = Date.now();
    let stats: ChatStats | null = null, failure = "";
    try {
      for await (const ev of o.stream(sid, msgs, true, role, schema)) {
        if (ev.type === "done") { add(ev.stats); stats = ev.stats; }
        if (ev.type === "thinking") think += ev.text;
        reply = withAnswer(reply, ev);
        counting(reply, think);
        onText?.(reply);
        if (sid.includes(":Drawing ")) artDraft = reply.slice(Math.max(0, reply.lastIndexOf("<svg")));
        if (Date.now() - last > 400) { last = Date.now(); live = liveOf(reply, think); yield run("running"); }
        // a short piece of a page of blocks that runs away (the same row again and again, or far too long) is cut off here: what came is mended and the build goes on
        if (sid.includes(":x:") && (runaway(reply) || think.length > 8000 || reply.length > 16000 || essay(sid, reply))) break;
        if (ctl().n > skipAt) break;
      }
    } catch (e) { failure = (e as Error).message; throw e; }
    finally { live = ""; artDraft = ""; counted(); recordCall(sid, msgs, reply, think, began, stats, role, failure || undefined); }
    aborted();
    return reply;
  }

  /** A session of the construction engine: when it writes a unit, the unit's code is shown in the panel while it comes. */
  async function* unitAsk(sid: string, msgs: ChatMessage[], role: WriterRole | undefined, schema: object | undefined, label: string, onText?: (text: string) => void): AsyncGenerator<ChatEvent, string> {
    const name = /^Units?: ([^\s(,]+)/.exec(label)?.[1];
    try {
      return yield* helper(sid, msgs, role, schema, (t) => {
        if (name) activeUnit = { name, label: label.replace(/^Units?: /, ""), code: t.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").replace(/^\s*```\w*\n?/, "").replace(/\n?```[\s\S]*$/, "").trim().slice(-12000) };
        onText?.(t);
      });
    } finally { activeUnit = null; }
  }

  /** A whole file written by a session, shown in its panel while it comes; the file goes back to what it was when the session ends. */
  async function* rewriteShown(file: FileLike, sid: string, msgs: ChatMessage[], role: WriterRole | undefined): AsyncGenerator<ChatEvent, string> {
    const at = artifactsIn(text).map((a) => a.title.toLowerCase()).lastIndexOf(file.title.toLowerCase());
    const m = at >= 0 ? [...text.matchAll(/<artifact(?:\s[^>]*)?>[\s\S]*?<\/artifact>/g)][at] : undefined;
    if (!m || m.index === undefined) {
      let raw = "";
      for await (const ev of o.stream(sid, msgs, true, role)) { if (ev.type === "done") add(ev.stats); raw = withAnswer(raw, ev); counting(raw); }
      counted();
      aborted();
      return raw;
    }
    const keep = text;
    const reply = yield* writeLive(sid, msgs, role, text.slice(0, m.index), headOf(file.title));
    text = keep;
    yield { id: o.id, type: "replace", text };
    return reply;
  }

  /**
   * Mends a file from a list of problems. First the short way: edit blocks on the lines the problems name (a few seconds of
   * writing); only when those do not apply or make the file worse, the whole file again, shown while it is written.
   * Returns the new content, or null when nothing usable came back.
   */
  async function* mend(owner: FileLike, problems: string[], others: string, sid: string, st: BuildStage, base: string, role?: WriterRole): AsyncGenerator<ChatEvent, string | null> {
    const count = (content: string) => quickErrors({ title: owner.title, kind: owner.kind, language: owner.language, content }, [...current.values()].filter((f) => f.kind === "html").map((f) => f.content)).length;
    const lines = errorLines(problems);
    const whole = owner.content.length <= o.maxChars * 0.5;
    const pieces = whole ? artifactText(owner) : excerpts(owner.content, lines.length ? lines.map((l): Range => [Math.max(1, l - 15), l + 15]) : [[1, 80]], Math.max(1500, Math.floor(o.maxChars * 0.5)));
    const ask: ChatMessage[] = [{ role: "system", content: EDITOR_INSTRUCTIONS }, { role: "user", content: editorPrompt(request, owner, `fix these problems:\n${problems.map((p) => `- ${p}`).join("\n")}`, pieces, others) }];
    const reply = yield* shown(sid, ask, role, st, `${base} · writing the edit`);
    const done = applyEdits(owner.content, parseReply(reply).edits);
    if (done.applied && done.content !== owner.content && count(done.content) <= count(owner.content)) return done.content;
    st.note = `${base} · rewriting the whole file`;
    yield run("running");
    const full = yield* rewriteShown(owner, `${sid}:rewrite`, [{ role: "system", content: REPAIR_INSTRUCTIONS }, { role: "user", content: repairPrompt(request, owner, problems, others) }], role);
    const fixed = full ? rawFile(full, owner.language) : "";
    return fixed || null;
  }

  for (let i = 0; i < ordered.length; i++) {
    aborted();
    const file = ordered[i];
    const R = roleOfFile(file.name);
    const step = steps[i];
    step.status = "running";
    yield run("running");
    const resuming = !!resumeFile && file.name === resumeFile.title;
    const existing = resuming ? undefined : current.get(file.name.toLowerCase());
    let panelOpen = false;
    let editBefore: string | null = null; // the text before this file's panel was opened, to go back to it when the edit fails
    const known = (): FileLike[] => mergeFiles([...current.values()]);
    const contract = known().filter((f) => f.title !== file.name).map((f) => `${f.title}\n${interfaceOf(f)}`).join("\n\n");
    try {
      if (existing) {
        // the file being modified opens at once, as it is now: the reader sees which file, and its preview, before anything changes
        editBefore = text;
        const editing = begin(stagesOf(step), "edit", "Change", "reading the file and working out the change", R);
        editing.file = file.name;
        yield say(`${artifactText(existing)}\n`);
        step.note = "Reading the file and working out the change…";
        yield run("running");
        const head = headOf(file.name);
        const settle = function* (content: string): Generator<ChatEvent> { text = editBefore! + artifactText({ ...existing, content }) + "\n"; yield { id: o.id, type: "replace", text }; };
        // 0. a request about one slide of a deck changes that slide and nothing else: only its text is shown to the model, and the edit
        // blocks are applied to that text alone, so no other slide can change and nothing else is written again
        let updated: FileLike | null = null;
        const slideNo = existing.kind === "pptx" ? slideNumberOf(`${request}\n${file.job}`) : null;
        const span = slideNo ? slideSpan(existing.content, slideNo) : null;
        if (span) {
          step.note = `Changing slide ${slideNo} only…`;
          yield run("running");
          const ask: ChatMessage[] = [{ role: "system", content: EDITOR_INSTRUCTIONS }, { role: "user", content: editorPrompt(request, existing, file.job, span.text.trim(), "") }];
          let reply = yield* helper(`${o.id}:slide:${i}`, ask, R);
          let done = applyEdits(span.text, parseReply(reply).edits);
          if (!done.applied) {
            reply = yield* helper(`${o.id}:slide:${i}:retry`, [...ask, { role: "assistant", content: reply }, { role: "user", content: RETRY_NOTE }], R);
            done = applyEdits(span.text, parseReply(reply).edits);
          }
          if (done.applied && done.content !== span.text) { updated = { ...existing, content: span.before + done.content + span.after }; step.note = `Changed slide ${slideNo} only.`; }
        }
        // 1. targeted edit blocks on the lines concerned
        let editBroke = false;
        const small = existing.content.length < focusFrom;
        // Rewriting a file costs every line again (minutes, at the speed of these models), so a change is made with edit blocks
        // first: a few lines, matched forgivingly, and refused if they break the file. Only a very short file, which a small model
        // copies more reliably than it matches lines, is rewritten first; a failed edit falls back to a rewrite.
        const tiny = existing.content.length < TINY_FILE;
        // a page of blocks is changed part by part: a first pass finds the parts, each goes alone to the model, the new text is spliced in
        // place, the whole page is checked again and a change that cannot be made soundly is refused: the page is never broken
        const blocksPage = existing.kind === "html" && usesBlocks(existing.content);
        // a program the construction engine made is changed by the engine: which units differ, which are new, each rewritten alone and checked
        if (!updated && existing.kind === "html" && /<!--\s*x-construct\s/.test(existing.content)) {
          step.note = "Working out which units change…";
          yield run("running");
          let changeStage: BuildStage | null = null, changeKey = "";
          const gen = buildProgram(request, { resume: existing.content, change: request, room: o.maxChars, aborted: () => !!o.signal?.aborted, ask: (sid: string, msgs2: ChatMessage[], _label: string, schema?: object, onText?: (text: string) => void) => unitAsk(`${o.id}:xe:${i}:x:${sid}`, msgs2, R, schema, _label, onText) });
          for (;;) {
            const r = await gen.next();
            if (r.done) {
              if (changeStage && changeStage.status === "running") end(changeStage, "done");
              if (r.value.html === existing.content) throw new Error(r.value.warnings[0] ?? "nothing changed");
              updated = { ...existing, content: r.value.html };
              step.note = r.value.warnings.length ? `Changed; ${r.value.warnings[0]}` : "Changed the units the request concerns";
              break;
            }
            const ev = r.value;
            if (ev.type === "relay") yield ev.value as ChatEvent;
            else if (ev.type === "note") {
              const key = ev.text.replace(/ \(again\)$/, "");
              if (/^(Change|Structure|Style|Conventions|Wiring( \(review\))?|Shared|Screen|Actions|Calculations|Plan( \((gaps|R\d+)\))?|Units?: [^()]+)$/.test(key) && key !== changeKey) {
                if (changeStage && changeStage.status === "running") end(changeStage, "done");
                changeKey = key;
                changeStage = begin(stagesOf(step), "edit", key.startsWith("Unit") ? `Changing ${key.replace(/^Units?: /, "")}` : key === "Change" ? "Working out the change" : "Planning what is missing", undefined, R);
                changeStage.file = file.name;
              }
              step.note = ev.text;
              logTo(changeStage ?? editing, ev.text);
              yield run("running");
            } else if (ev.type === "warn" || ev.type === "log") { logTo(changeStage ?? editing, ev.type === "warn" ? `warning: ${ev.text}` : ev.text); yield run("running"); }
          }
        }
        if (!updated && blocksPage) {
          step.note = "Working out which parts of the page change…";
          yield run("running");
          const said = takeParts(request); // the parts the person pointed at in the preview, numbered in the order chosen, and what they said
          let changeStage: BuildStage | null = null;
          const gen = editXPage(said.rest.trim() || request, existing.content, { room: o.maxChars, aborted: () => !!o.signal?.aborted, ask: (sid, msgs2) => helper(`${o.id}:xe:${i}:${sid}`, msgs2, R) }, { parts: said.parts });
          for (;;) {
            const r = await gen.next();
            if (r.done) {
              const res = r.value;
              if (changeStage && changeStage.status === "running") end(changeStage, "done");
              logTo(editing, `${res.calls} calls`);
              if (res.html === existing.content) throw new Error(res.refused[0] ?? res.warnings[0] ?? "nothing changed");
              updated = { ...existing, content: res.html };
              step.note = res.refused.length ? `Changed what could be changed safely; not applied: ${res.refused.join("; ")}` : `Changed ${res.changes.map((c) => c.replace(/^(?:changed|added to) /, "")).join("; ")}`;
              break;
            }
            const ev = r.value;
            if (ev.type === "relay") yield ev.value as ChatEvent;
            else if (ev.type === "step") {
              // a request with several changes is several steps, each its own stage that stands or falls alone
              if (ev.total > 1) {
                if (changeStage && changeStage.status === "running") end(changeStage, "done");
                changeStage = begin(stagesOf(step), "edit", `Change ${ev.n} of ${ev.total}`, ev.text, R);
                changeStage.file = file.name;
              }
              logTo(editing, `step ${ev.n}/${ev.total}: ${ev.text}`);
              yield run("running");
            } else if (ev.type !== "retract") {
              if (ev.type === "note") step.note = ev.text;
              if (ev.type === "warn" && changeStage && changeStage.status === "running" && /was not applied|no part of the page|no usable answer/.test(ev.text)) end(changeStage, "error", ev.text);
              logTo(editing, ev.type === "warn" ? `warning: ${ev.text}` : ev.text);
              yield run("running");
            }
          }
        }
        if (!updated && tiny && existing.content.length * 2 <= o.maxChars) {
          step.note = "Rewriting the file with the change…";
          yield run("running");
          const reply = yield* writeLive(`${o.id}:redo:${i}`, [
            { role: "system", content: `You rewrite one file with a change applied. Reply with the complete raw file and nothing else: no explanation, no code fence. Keep everything that is not part of the change exactly as it is, and never shorten the file or write '...' or 'rest of the code'. ${kindOfFile(file.name).language === "javascript" ? "It is a plain script: never write import or export. " : ""}${RULES}${docNote(file.name)}` },
            { role: "user", content: `The user asked:\n${clip(request.trim(), 1200)}\n\n${contract ? `The other files of the project (keep the names consistent):\n${contract}\n\n` : ""}Change to make in ${file.name}: ${file.job}\n\nThe file ${file.name}:\n${existing.content}` }
          ], R, editBefore, head);
          const full = cleanFile(reply, true);
          if (rewriteIsSound(existing.content, full)) { updated = { ...existing, content: full }; step.note = "Rewrote the file with the change."; }
          else yield* settle(existing.content); // the rewrite lost lines: the panel goes back to the file as it is
        }
        let pieces = "";
        if (updated) { /* the rewrite did it */ }
        else if (small) pieces = existing.content.length <= o.maxChars ? artifactText(existing) : "";
        else {
          const where = yield* helper(`${o.id}:where:${i}`, [
            { role: "system", content: LOCATOR_INSTRUCTIONS },
            { role: "user", content: `Change to make in ${file.name}: ${file.job}\n\nMap of the file:\n${outlineText(existing.title, existing.content)}` }
          ], R);
          const wanted = (/^\s*where:\s*(.+)$/im.exec(where)?.[1] ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
          let ranges: Range[] = resolveSpots(existing.content, wanted).slice(0, 6);
          if (!ranges.length) ranges = resolveSpots(existing.content, file.job.split(/\W+/).filter((w) => w.length > 3)).slice(0, 4);
          pieces = excerpts(existing.content, ranges.length ? ranges : [[1, 80]], Math.max(2000, Math.floor(o.maxChars / 2)));
        }
        if (!updated && pieces) {
          step.note = "Writing the edit…";
          yield run("running");
          const ask: ChatMessage[] = [{ role: "system", content: EDITOR_INSTRUCTIONS + docNote(file.name) }, { role: "user", content: editorPrompt(request, existing, file.job, pieces, contract) }];
          let reply = yield* helper(`${o.id}:edit:${i}`, ask, R);
          let done = applyEdits(existing.content, parseReply(reply).edits);
          if (!done.applied) {
            // 2. the old lines were copied slightly wrong: say so once
            reply = yield* helper(`${o.id}:edit:${i}:retry`, [...ask, { role: "assistant", content: reply }, { role: "user", content: RETRY_NOTE }], R);
            done = applyEdits(existing.content, parseReply(reply).edits);
          }
          if (done.applied && done.content !== existing.content) {
            // an edit that makes the file worse than it was is no edit: the rewrite below does it instead
            const probe = (content: string) => quickErrors({ title: file.name, kind: existing.kind, language: existing.language, content }, known().filter((f) => f.kind === "html").map((f) => f.content)).length;
            if (probe(done.content) > probe(existing.content)) { step.note = "The edit broke the file, rewriting it instead…"; editBroke = true; }
            else updated = { ...existing, content: done.content };
          }
        }
        // 3. nothing matched: the whole file, written again by a session of its own
        if (!updated) {
          step.note = editBroke ? "The edit broke the file, rewriting it instead…" : "Targeted edit did not match, rewriting the whole file…";
          yield run("running");
          if (existing.content.length > o.maxChars) {
            // too long for the window: only the lines concerned are written again, and put back in the file
            const all = existing.content.split("\n");
            const spot = resolveSpots(existing.content, file.job.split(/\W+/).filter((w) => w.length > 3))[0] ?? [1, 60];
            let a = Math.max(1, spot[0] - 12), b = Math.min(all.length, spot[1] + 12);
            const room = Math.max(1200, Math.floor(o.maxChars * 0.35));
            while (b > a && all.slice(a - 1, b).join("\n").length > room) b--;
            const old = all.slice(a - 1, b);
            step.note = `Rewriting lines ${a}-${b}…`;
            yield run("running");
            const piece = cleanFile(yield* helper(`${o.id}:span:${i}`, [
              { role: "system", content: `You rewrite part of one file with a change applied. You get lines ${a} to ${b}. Reply with the complete replacement of exactly those lines, raw: no explanation, no code fence, no line numbers. Keep everything the change does not touch exactly as it is, and never shorten it or write '...'. ${RULES}` },
              { role: "user", content: `The user asked:\n${clip(request.trim(), 1200)}\n\n${contract ? `The other files of the project (keep the names consistent):\n${contract}\n\n` : ""}Change to make in ${file.name}: ${file.job}\n\nLines ${a}-${b} of ${file.name}:\n${old.join("\n")}` }
            ], R), true);
            const next = [...all.slice(0, a - 1), ...piece.split("\n"), ...all.slice(b)].join("\n");
            const errs = (content: string) => quickErrors({ title: file.name, kind: existing.kind, language: existing.language, content }, known().filter((f) => f.kind === "html").map((f) => f.content)).length;
            const size = piece.length / Math.max(1, old.join("\n").length);
            if (!piece.trim() || size < 0.5 || size > 3 || errs(next) > errs(existing.content)) throw new Error("the targeted edit did not match and the lines rewritten did not fit the file");
            updated = { ...existing, content: next };
            step.note = `Rewrote lines ${a}-${b} (the targeted edit did not match).`;
          } else {
          const reply = yield* writeLive(`${o.id}:redo:${i}`, [
            { role: "system", content: `You rewrite one file with a change applied. Reply with the complete raw file and nothing else: no explanation, no code fence. Keep everything that is not part of the change exactly as it is. ${RULES}${docNote(file.name)}` },
            { role: "user", content: `Change to make in ${file.name}: ${file.job}\n\nThe file:\n${existing.content}` }
          ], R, editBefore, head);
          const full = cleanFile(reply, true);
          if (!full.trim()) throw new Error("no file came back");
          updated = { ...existing, content: full };
          step.note = "Rewrote the whole file (the targeted edit did not match).";
          }
        }
        // what worked before must still be there: a change that took the controls away is put back, once, by a session that sees what was lost
        const lost = lostSurface(existing, updated, request);
        if (lost.names.length) {
          const keep = begin(stagesOf(step), "fix", "Keep what worked", `the change removed ${lost.names.slice(0, 3).join(", ")}`, R);
          keep.file = file.name;
          yield run("running");
          const old = excerpts(existing.content, (lost.lines.length ? lost.lines : [1]).map((l): Range => [Math.max(1, l - 1), l + 14]), Math.max(1200, Math.floor(o.maxChars * 0.3)));
          const reply = yield* shown(`${o.id}:fix:keep:${i}`, [
            { role: "system", content: REPAIR_INSTRUCTIONS },
            { role: "user", content: `The user asked:\n${clip(request.trim(), 1200)}\n\nThe change was made to ${file.name}, but it took away parts that worked before: ${lost.names.join(", ")}.\nThey must be back, exactly as they were, with the requested change kept.\n\nThose parts as they were before the change:\n${old}\n\nThe file ${file.name} now:\n${updated.content}\n\nSend the complete corrected ${file.name} now.` }
          ], R, keep, "putting back what was removed");
          const restored = reply ? rawFile(reply, existing.language) : "";
          const after = restored && rewriteIsSound(updated.content, restored) ? { ...updated, content: restored } : null;
          const still = after ? lostSurface(existing, after, request).names : lost.names;
          if (after && still.length < lost.names.length) updated = after;
          if (still.length) { end(keep, "error", `still missing: ${still.slice(0, 3).join(", ")}`); warnings.set(file.name, still.slice(0, 3).join(", ")); }
          else end(keep, "done", "everything that worked is back");
          yield run("running");
        }
        const diff = diffText(existing.content, updated.content);
        if (!diff) throw new Error("nothing changed");
        step.diff = diff;
        step.note = step.note && /^(Rewr|Changed)/.test(step.note) ? step.note : "Changed only the lines concerned.";
        current.set(file.name.toLowerCase(), updated);
        touched.push(updated);
        yield* settle(updated.content); // the panel and its preview now show the new version
        editBefore = null;
        end(editing, "done", step.note);
      } else {
        const kind = kindOfFile(file.name);
        const head = headOf(file.name);
        const done = [...current.values()].filter((f) => f.title !== file.name);
        const share = Math.max(600, Math.floor(o.maxChars * 0.3));
        // The file is written whole, by one session that sees the request, the design and what the other files define. A file
        // too long for the window is continued by that same session (it picks up where it stopped, seeing what it wrote), so a
        // file never ends up as pieces written apart. The file's panel opens now: the reader watches it fill.
        panelOpen = true;
        yield say(head);
        // an arcade game starts from a tested page made with the game engine (about forty lines of things and rules, no loop to write): the
        // model adapts what it can read, in the usual way, and the reader watches the file fill in the panel
        // Every program goes through the construction engine, whatever its size: requirements, a plan, units written and checked one by one. A short request is
        // not a reason for a lighter way (that gave poor games). Only what the person says outright (the code itself, the game engine by name) decides otherwise.
        const way = !resuming && kind.kind === "html" && ordered.length === 1 ? explicitWay(request) : null;
        const complex = !resuming && kind.kind === "html" && ordered.length === 1 && !way;
        const isBlocks = resuming || complex;
        const engineExamples = way?.way === "engine" ? engineExamplesFor(request, Math.floor(o.maxChars * 0.4)) : "";
        // a starting point that was tested, when the request is one of the usual programs and the page is the whole program
        const whole = null; // no ready-made starting page: the program is built, not adapted from a template
        let skeleton: Skeleton | null = whole ? skeletonFile(whole, file, ordered) : null;
        if (skeleton) {
          const st = begin(stagesOf(step), "skeleton", "Starting point");
          if (skeleton.html.length > o.maxChars * 0.45) { end(st, "skipped", `${skeleton.name} is too big for this model's window`); skeleton = null; }
          else end(st, "done", `a tested ${skeleton.name} to adapt`);
          st.sec = undefined;
          yield run("running");
        }
        // the rules first, for a program with no starting point: a short list the writer is held to
        // no rules to write first for a game: a small model takes half a minute to write them and the game does not need them (the examples of the engine, the blocks and the skeletons already carry the form)
        const isGame = GAME_WORDS.test(request) || ARCADE_WORDS.test(request) || WORLD_WORDS.test(request);
        const program = !isBlocks && !engineExamples && !isGame && (kind.kind === "html" || /^(javascript|js)$/i.test(kind.language)) && (GAME_OR_TOOL.test(request) || BEHAVIOUR_WORDS.test(`${request} ${file.job}`));
        if (!skeleton && program) {
          const st = begin(stagesOf(step), "spec", "Rules", "writing the rules of the program before the code", "plan");
          yield run("running");
          let reply = "";
          try { reply = yield* shown(`${o.id}:spec:${i}`, [{ role: "system", content: SPEC_INSTRUCTIONS }, { role: "user", content: specPrompt(request, file) }], "plan", st, "writing the rules"); } catch (e) { if (o.signal?.aborted) throw e; live = ""; }
          const rules = cleanSpec(reply);
          if (rules) { spec = rules; end(st, "done", `${rules.split("\n").length} rules`); } else end(st, "skipped", "no rules came back");
          yield run("running");
        }
        const writing = begin(stagesOf(step), "write", "Write", isBlocks ? "the program, built in checked steps" : "the whole file, in one go", R);
        step.note = "Writing…";
        yield run("running");
        let blocksPage: string | null = null;
        let sub: BuildStage | null = null;
        let subKey = "";
        let curSection = "\u0000";
        if (isBlocks) {
          stagesOf(step).pop(); // the single "Write" stage gives way to one stage per phase
          // the page is written in short sessions that each see the outline, the names defined so far and their own part, never the whole page
          const blocksRequest = resuming && readBuild(resumeFile!.content) ? readBuild(resumeFile!.content)!.request : request;
          const host = { resume: resuming ? resumeFile!.content : undefined, room: o.maxChars, aborted: () => !!o.signal?.aborted, control: () => { const c = ctl(); if (c.n > seenCtl) { seenCtl = c.n; return c.action; } return undefined; }, ask: (sid: string, msgs2: ChatMessage[], _label: string, schema?: object, onText?: (text: string) => void) => unitAsk(`${o.id}:x:${i}:${sid}`, msgs2, R, schema, _label, onText) };
          // the general engine builds any program; the old block sessions stay only to take up a page they began
          const gen = (resuming && readBuild(resumeFile!.content) ? buildXPage : buildProgram)(blocksRequest, host);
          for (;;) {
            const r = await gen.next();
            if (r.done) { blocksPage = r.value.html; logTo(writing, `${r.value.calls} calls, ${r.value.outline?.sections.length ?? 0} sections`); break; }
            const ev = r.value;
            if (ev.type === "relay") yield ev.value as ChatEvent;
            else if (ev.type === "chunk") yield say(ev.text);
            else if (ev.type === "retract") { text = text.slice(0, Math.max(0, text.length - ev.chars)); yield { id: o.id, type: "retract", keep: text.length }; }
            else {
              logTo(sub ?? writing, ev.type === "warn" ? `warning: ${ev.text}` : ev.text);
              if (ev.type === "note") {
                // every phase of the page is a stage of its own, so the person sees them one after the other
                const t = ev.text.replace(/ \(again\)$/, "");
                const own = /^(Look|Outline|Requirements|Scenarios|Structure|Style|Conventions|Wiring( \(review\))?|Shared|Screen|Actions|Calculations|Plan( \((gaps|R\d+)\))?|Assembling the page)$|^Units?: [^()]+$/.test(t) ? t : /^Does "/.test(t) ? "Checking the blocks" : /^(Drawing |Section: )/.test(t) ? t : null;
                if (own && (!sub || subKey !== own)) {
                  if (sub) end(sub, "done");
                  if (own.startsWith("Section: ")) curSection = own.slice(9);
                  sub = begin(stagesOf(step), "write", stageName(own), undefined, R);
                  subKey = own;
                } else if (sub && !/^\d+ sections$|^declared /.test(t)) sub.note = clip(t.replace(new RegExp(`^${curSection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: `), ""), 80);
                writing.note = ev.text;
              }
              yield run("running");
            }
          }
          if (sub) end(sub, "done");
        }
        let raw = "";
        let sent = 0;
        if (blocksPage !== null) { raw = blocksPage; sent = blocksPage.length; }
        else {
        const msgs: ChatMessage[] = [{ role: "system", content: writerInstructions(file, ordered, { skeleton: !!skeleton, spec: !!spec, engine: !!engineExamples }) }, { role: "user", content: writerPrompt(request, ordered, file, done, room, plan.design, { spec, skeleton: skeleton ?? undefined, example: engineExamples }) }];
        const skipAt = ctl().n;
        const chaptersSeen = new Set<string>();
        let chapter: BuildStage | null = null, chapterFrom = 0, chapterNote = 0;
        for await (const ev of o.stream(`${o.id}:write:${i}`, msgs, true, R)) {
          if (ctl().n > skipAt) break;
          if (ev.type === "done") add(ev.stats);
          if (ev.type === "notice" && /continued/i.test(ev.text)) {
            // the file is longer than the model's window: the same session carries on from where it stopped
            writing.note = `longer than the model's window, so it carries on by itself (${ev.text.match(/\((\d+)\)/)?.[1] ?? "1"})`;
            yield run("running");
          }
          if (ev.type !== "answer" && ev.type !== "retract") continue;
          raw = withAnswer(raw, ev);
          counting(raw);
          const clean = cleanFile(raw, false);
          if (ev.type === "retract" && clean.length < sent) {
            // the model looped: what was shown of the loop is taken back out of the chat
            text = text.slice(0, text.length - (sent - clean.length));
            sent = clean.length;
            yield { id: o.id, type: "retract", keep: text.length };
          }
          if (clean.length > sent) { yield say(clean.slice(sent)); sent = clean.length; }
          // the chapters of the program as they come (the screen, the settings, the player, the controls, the loop...), read from the text itself
          if (kind.kind === "html" && !isBlocks) {
            const lines = lineCount(clean);
            const fresh = newChapters(clean, chaptersSeen);
            if (fresh.length) {
              if (!chapter) stagesOf(step).splice(stagesOf(step).indexOf(writing), 1); // the single "Write" stage gives way to one stage per chapter
              for (const c of fresh) {
                chaptersSeen.add(c.id);
                if (chapter) end(chapter, "done", plural(Math.max(1, lines - chapterFrom), "line"));
                chapter = begin(stagesOf(step), "write", c.label, c.note, R);
                chapterFrom = lines;
              }
              chapterNote = Date.now();
              yield run("running");
            } else if (chapter && Date.now() - chapterNote > 700) {
              chapterNote = Date.now();
              chapter.note = `${plural(Math.max(1, lines - chapterFrom), "line")} so far`;
              yield run("running");
            }
          }
        }
        if (chapter) end(chapter, "done", plural(Math.max(1, lineCount(cleanFile(raw, true)) - chapterFrom), "line"));
        }
        counted();
        aborted();
        let assembled = cleanFile(raw, true);
        if (!assembled.trim()) { yield say("\n</artifact>\n"); panelOpen = false; throw new Error("the model sent an empty file"); }
        end(writing, "done", plural(assembled.split("\n").length, "line"));
        if (assembled.length > sent) yield say(assembled.slice(sent));
        if (!assembled.endsWith("\n")) yield say("\n");
        if (kind.kind === "html") {
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
        const checking = begin(stagesOf(step), "check", "Check", "does it parse, and do its files fit together");
        yield run("running");
        const problemsOf = () => quickErrors({ title: file.name, kind: kind.kind, language: kind.language, content: finished }, [...current.values()].filter((f) => f.kind === "html").map((f) => f.content));
        let mended = 0;
        for (let attempt = 0; attempt < 2; attempt++) {
          const errs = problemsOf();
          if (!errs.length) break;
          step.note = `Mending ${plural(errs.length, "problem")} in ${file.name}…`;
          const fixing = begin(stagesOf(step), "fix", `Fix ${attempt + 1}`, `${plural(errs.length, "problem")}: ${clip(errs[0], 90)}`, R);
          fixing.file = file.name;
          yield run("running");
          const others = clip(done.map((f) => `${f.title}\n${interfaceOf(f)}`).join("\n\n"), share);
          let fixed = "";
          try { fixed = (yield* mend({ title: file.name, kind: kind.kind, language: kind.language, content: finished }, errs, others, `${o.id}:repair:${i}:${attempt}`, fixing, plural(errs.length, "problem"), R)) ?? ""; }
          catch (e) { if (o.signal?.aborted) throw e; }
          if (!rewriteIsSound(finished, fixed)) { end(fixing, "error", "the fix changed nothing"); break; }
          finished = fixed;
          mended++;
          end(fixing, "done", "applied");
        }
        const left = problemsOf();
        if (left.length) end(checking, "error", clip(left[0], 120)); else end(checking, "done", mended ? "fixed" : "no problem found");
        if (finished !== assembled && finished.trim() !== assembled.trim()) {
          const at = artifactsIn(text).map((a) => a.title.toLowerCase()).lastIndexOf(file.name.toLowerCase());
          if (at >= 0) { text = replaceArtifact(text, at, finished); yield { id: o.id, type: "replace", text }; }
          assembled = finished;
        }
        const written: FileLike = { title: file.name, kind: kind.kind, language: kind.language, content: assembled };
        current.set(file.name.toLowerCase(), written);
        touched.push(written);
        step.note = `${plural(assembled.split("\n").length, "line")} written.`;
      }
      step.status = "done";
    } catch (e) {
      if (o.signal?.aborted) throw e;
      if (panelOpen) yield say("\n</artifact>\n");
      if (editBefore !== null) { text = editBefore; yield { id: o.id, type: "replace", text }; }
      step.status = "error";
      step.note = `Failed: ${(e as Error).message}`;
      for (const st of step.stages ?? []) if (st.status === "running") end(st, "error", (e as Error).message);
    }
    yield run("running");
  }

  // ---- the test run: the page is run the way the preview runs it (keys pressed, buttons clicked), and what it shows is mended
  const pages = [...current.values()].filter((f) => f.kind === "html");
  const linkedTouched = (f: FileLike) => linkedFiles(f.content).some((n) => touched.some((t) => t.title.toLowerCase() === n));
  let unresolved: string[] = []; // what the last test run of the page still showed when the fixes were over
  const page = o.check ? (touched.find((f) => f.kind === "html") ?? pages.find(linkedTouched)) : undefined;
  if (o.check && page) {
    const MAX_FIXES = /<!--\s*x-construct\s/.test(page.content) ? 4 : 2;
    // what the page is seen to do (a canvas that never moves) is only a problem for a program that is meant to react
    // whether the program is meant to react is a question of meaning, so the small model is asked; a page with a script of its own is one when it cannot answer
    const scripted = /<script\b[^>]*>\s*\S/i.test(page.content) || linkedFiles(page.content).some((n) => /\.m?js$/i.test(n));
    const interactive = (o.askRouter ? await o.askRouter("Is it about a program that a person plays or uses by pressing keys or clicking buttons (a game, an app, a tool), or about something in such a program that does not work?").catch(() => null) : null) ?? scripted;
    let before: { file: FileLike; problems: number; stage: BuildStage } | null = null;
    let looked = false;
    for (let round = 0; round <= MAX_FIXES; round++) {
      aborted();
      const test = begin(verify, "run", round ? `Test run ${round + 1}` : "Test run", `loading ${page.title}, pressing its keys, clicking its buttons`);
      yield run("running");
      let report: Awaited<ReturnType<NonNullable<StepwiseOptions["check"]>>>;
      try { const now = current.get(page.title.toLowerCase()) ?? page; report = await o.check(now, [...current.values()], (readMark(now.content, "x-construct") as { scenarios?: Scenario[] } | null)?.scenarios ?? []); }
      catch (e) { if (o.signal?.aborted) throw e; end(test, "skipped", `could not run the page: ${(e as Error).message}`); break; }
      test.shot = report.shot;
      const regress = lostEffects(baseline, report.probe, request).map((m) => `Regression: ${m}`);
      const scenes = report.scenarios ?? [];
      const problems = [...report.errors, ...scenes.filter((s) => !s.ok).map((s) => `Scenario: ${s.text} — ${s.detail}`), ...(interactive ? (report.notes ?? []).map((n) => `Observed: ${n}`) : []), ...regress];
      if (before && problems.length >= before.problems) {
        // the last fix made it worse: the file goes back to what it was
        current.set(before.file.title.toLowerCase(), before.file);
        const ti = touched.findIndex((f) => f.title === before!.file.title);
        if (ti >= 0) touched[ti] = before.file;
        const at = artifactsIn(text).map((a) => a.title.toLowerCase()).lastIndexOf(before.file.title.toLowerCase());
        if (at >= 0) { text = replaceArtifact(text, at, before.file.content); yield { id: o.id, type: "replace", text }; }
        end(before.stage, "error", "it did not help, so it was undone");
        end(test, "error", `${plural(problems.length, "problem")}: ${clip(problems[0], 110)}`);
        yield run("running");
        break;
      }
      // the page runs and reacts: a model that can see looks at it once, for what no test of the code shows (a board with no pieces)
      if (!problems.length && !looked && o.lookAt && report.shot) {
        looked = true;
        const look = begin(verify, "look", "Look at the screen", "a model that can see checks what the page shows");
        yield run("running");
        let said: string | null = null;
        try { said = await o.lookAt(report.shot, `${LOOK_INSTRUCTIONS}\n\n${lookPrompt(request)}`); }
        catch (e) { if (o.signal?.aborted) throw e; }
        const bad = said === null ? null : parseLook(said);
        // a game described with the engine or the blocks is checked from its description (gameFlaw, xFlaws) and by the run: a small model's remark on one frame
        // (a bird resting on the floor, a screen between two lives) is noted, never a reason to rewrite a game that plays
        const declared = /\bGame\.run\s*\(/.test(page.content) || usesBlocks(page.content);
        if (said === null) end(look, "skipped", "no model that can see images answered");
        else if (bad && declared) end(look, "done", `noted, not acted on: ${clip(bad, 100)}`);
        else if (bad) { problems.push(`Seen: ${bad}`); end(look, "error", clip(bad, 110)); }
        else end(look, "done", "it shows what was asked");
        yield run("running");
      }
      unresolved = problems;
      if (!problems.length) { end(test, "done", scenes.length ? `it loads, ${scenes.length === 1 ? "its scene holds" : `its ${scenes.length} scenes hold`}, no error` : "it loads, reacts to keys and clicks, no error"); break; }
      end(test, "error", `${plural(problems.length, "problem")}: ${clip(problems[0], 110)}`);
      yield run("running");
      if (round === MAX_FIXES) break;
      // the file that has to change: the one a message names, else the page
      const here = [...current.values()];
      const arts = [current.get(page.title.toLowerCase()) ?? page, ...here.filter((f) => f.title !== page.title)];
      const blamed = blame(arts, [{ errors: report.errors }]);
      const behaviour = problems.filter((p) => p.startsWith("Scenario:") || p.startsWith("Observed:") || p.startsWith("Regression:") || p.startsWith("Seen:"));
      // what a key or a button does lives in the script, when the page has one of its own files
      const linked = linkedFiles(arts[0].content);
      const script = behaviour.length ? here.find((f) => /\.m?js$/i.test(f.title) && linked.includes(f.title.toLowerCase())) : undefined;
      const owner = blamed.length ? arts[blamed[0].idx] : (script ?? arts[0]);
      const mine = blamed.filter((b) => arts[b.idx] === owner).map((b) => b.msg);
      const was = originals.get(owner.title.toLowerCase());
      const change = regress.length && was ? diffText(was.content, owner.content) : "";
      const fixing = begin(verify, "fix", `Fix ${round + 1}`, `${owner.title}: ${clip((mine[0] ?? problems[0]), 90)}`, roleOfFile(owner.title));
      fixing.file = owner.title;
      yield run("running");
      const others = clip(here.filter((f) => f.title !== owner.title).map((f) => `${f.title}\n${interfaceOf(f)}`).join("\n\n"), Math.max(600, Math.floor(o.maxChars * 0.3)));
      const names = [...new Set([...scriptOf(owner).matchAll(/(?:function\s+([\w$]+)\s*\(|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>))/g)].map((m) => m[1] ?? m[2]))];
      const undefinedHints = [...new Set(problems.flatMap((p) => /(?:ReferenceError: )?([\w$]+) is not defined/.exec(p)?.[1] ?? []))]
        .map((n) => `${n} is called but never written. Write ${n} (a function with that name, placed in the script), or call a function the page already has${names.length ? `: ${names.slice(0, 12).join(", ")}` : ""}.`);
      const issues = [...mine, ...undefinedHints, ...behaviour, ...(change ? [`This is the change that was made to ${owner.title}; what stopped working comes from it, or from what it removed:\n${change}`] : [])].slice(0, 7);
      let mendedFile = "";
      try {
        if (owner.kind === "html" && /<!--\s*x-construct\s/.test(owner.content)) {
          // a page the construction engine made is mended by the engine: it plans what is missing, writes what is still a stub and corrects the units the problems name
          const R2 = roleOfFile(owner.title);
          const asChange = issues.filter((x) => /^(Scenario|Observed|Seen):/.test(x));
          // an error names a name that is not defined: the units that use that name are the ones to correct, each told its own error (never a list of every function)
          const unitBlocks = [...owner.content.matchAll(/\/\* unit:([\w$]+) \*\/\n([\s\S]*?)\n\/\* end:\1 \*\//g)].map((m) => ({ name: m[1], code: m[2] }));
          const engineProblems = [...mine, ...behaviour].flatMap((msg) => {
            const id = /([\w$]+) is not defined/.exec(msg)?.[1] ?? /reading '([\w$]+)'/.exec(msg)?.[1];
            const users = id ? unitBlocks.filter((u) => new RegExp(`(?<![\\w$.])${id.replace(/\$/g, "\\$")}\\b`).test(u.code)) : [];
            return users.length ? users.map((u) => `${u.name}: ${msg}`) : [msg];
          });
          const gen = buildProgram(request, { resume: owner.content, problems: engineProblems, change: asChange.length ? `The program does not do what it must: ${asChange.join(" | ")}` : undefined, room: o.maxChars, aborted: () => !!o.signal?.aborted, ask: (sid: string, msgs2: ChatMessage[], _label: string, schema?: object, onText?: (text: string) => void) => unitAsk(`${o.id}:fix:${round}:x:${sid}`, msgs2, R2, schema, _label, onText) });
          for (;;) {
            const r = await gen.next();
            if (r.done) { mendedFile = r.value.html; break; }
            const ev = r.value;
            if (ev.type === "relay") yield ev.value as ChatEvent;
            else if (ev.type === "note") { fixing.note = clip(ev.text, 80); yield run("running"); }
          }
        } else mendedFile = (yield* mend(owner, issues, others, `${o.id}:fix:${round}`, fixing, `${owner.title}`, roleOfFile(owner.title))) ?? "";
      }
      catch (e) { if (o.signal?.aborted) throw e; }
      if (owner.kind === "html" && mendedFile) mendedFile = wireHtml(mendedFile, { css: ordered.map((f) => f.name).filter((n) => /\.css$/i.test(n)), js: ordered.map((f) => f.name).filter((n) => /\.m?js$/i.test(n)) });
      if (!rewriteIsSound(owner.content, mendedFile)) { end(fixing, "error", "the fix changed nothing"); yield run("running"); break; }
      before = { file: owner, problems: problems.length, stage: fixing };
      if (behaviour.some((b) => b.startsWith("Seen:"))) looked = false; // the screen is looked at again after the fix
      const updatedFile: FileLike = { ...owner, content: mendedFile };
      current.set(owner.title.toLowerCase(), updatedFile);
      const ti = touched.findIndex((f) => f.title === owner.title);
      if (ti >= 0) touched[ti] = updatedFile; else touched.push(updatedFile);
      const at = artifactsIn(text).map((a) => a.title.toLowerCase()).lastIndexOf(owner.title.toLowerCase());
      if (at >= 0) { text = replaceArtifact(text, at, mendedFile); yield { id: o.id, type: "replace", text }; }
      end(fixing, "done", `${owner.title} changed`);
      yield run("running");
    }
  }

  // ---- the main session explains
  const failed = steps.filter((s) => s.status === "error");
  const report = steps.map((s) => `- ${s.file} (${s.action === "new" ? "written" : "changed"}): ${s.job}${s.status === "error" ? ` — FAILED, ${s.note}` : ""}${warnings.has(s.file) ? ` — CAREFUL: the change may have removed ${warnings.get(s.file)}; tell the user to check it` : ""}`).join("\n");
  const stillBroken = unresolved.length ? `\n- TEST RUN: after the fixes, ${page?.title ?? "the page"} still shows ${plural(unresolved.length, "problem")}: ${unresolved.slice(0, 3).map((u) => clip(u, 160)).join(" | ")}. It does NOT work yet.` : "";
  const explain: ChatMessage[] = [
    ...stubHistory(o.messages).map(withoutArtifactRules),
    { role: "user", content: `[Build report. You wrote these files yourself; the user can open them next to your message.]\n${report}${stillBroken}\n\nReply to the user now, in their language, as one assistant speaking in the first person singular ("I made...", never "we"): say in 2 to 5 short sentences what you did and how to use it${failed.length ? `, and say plainly that ${failed.map((s) => s.file).join(", ")} could not be made and why` : ""}${unresolved.length ? ", and say plainly that the test run still shows a problem, in simple words, so the program may not work yet: never say it was fixed or that it works" : ""}. Do not write code, file contents or <artifact> tags, and never ask the user to send the file: the files are yours and already open next to your message.` }
  ];
  // the instruction goes last, after the report, so the explanation answers the request that started it
  const summary = begin(verify, "explain", "Summary", "telling you what was done");
  yield run("running");
  let explanation = "";
  try {
    explanation = stripEdits(stripSubagents(yield* helper(`${o.id}:explain`, explain))).replace(/<artifact[\s\S]*?(?:<\/artifact>|$)/gi, "").trim();
  } catch (e) {
    if (o.signal?.aborted) throw e;
  }
  // the summary is a few sentences: a model that goes on to copy a page into it is cut where the code begins
  explanation = explanation.split(/\n\s*(?:<!doctype|<html|<script|<style|```)/i)[0].trim();
  if (explanation.length > 1500) explanation = `${explanation.slice(0, 1500).replace(/\s+\S*$/, "")}…`;
  if (!explanation) explanation = failed.length === steps.length ? (resumable(text) ? "I could not finish the page. Say “continue” and I will take it up again where it stopped." : "I could not make the files.") : `Done: ${touched.map((f) => f.title).join(", ")}.${failed.length ? ` ${failed.map((s) => s.file).join(", ")} failed.` : ""}`;
  end(summary, "done");
  yield run("done");
  yield say(`\n${explanation}`);
  return { handled: true, text, stats: total };
}
