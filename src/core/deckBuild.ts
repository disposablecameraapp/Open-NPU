// A presentation made in steps, each one a short session: 1 plan (theme, slide list, what each slide shows), 2 the text of each slide
// within fixed limits, 3 a visual where the plan wants one (a chart or a diagram drawn by the app, a Wikimedia picture), 4 a screenshot of
// every slide and a look at it (text cut off, a picture that did not load, something a viewer model sees), with a fix and a second look.
// The result is the usual pptx artifact: the text form, so the person can edit it by hand and the model can change it with <edit> blocks.
import type { BuildRun, BuildStage, BuildStep, ChatEvent, ChatMessage, ChatStats } from "../shared/types";
import { withAnswer } from "./chat";
import { textOf } from "./attachments";
import { Slide, THEMES, deckHtml, layoutSlide, plain, slideProblems, slidesOf, themeOf, trimSlide, wikiFilesIn, type Pics, LIMITS } from "./slides";
import { figureKey, type FigureLang } from "./figures";
import type { Session } from "./build";

export const MAX_DECK_SLIDES = 20;
const MAX_IMAGE_SLIDES = 3;
const MAX_DIAGRAM_SLIDES = 3;

const CREATE = /\b(make|create|build|generate|write|prepare|produce|draft|design|put together|need|want|give me|fais|fait|faire|cr[ée]e[rz]?|g[ée]n[èe]re[rz]?|pr[ée]pare[rz]?|produis|r[ée]dige[rz]?|monte[rz]?|veux|voudrais|besoin|donne(?:-moi)?)\b/i;
const DECK_WORDS = /\b(slides?|slideshow|diapos?|diapositives?|diaporama|presentations?|pr[ée]sentations?|powerpoint|pptx|keynote|deck)\b/i;
const NOT_A_REQUEST = /\b(summari[sz]e|r[ée]sume|analy[sz]e|analyse|explain|explique|what is|qu'est-ce|translate|traduis|read|lis)\b.*\b(this|the|my|ce|cette|mon|ma|le|la)\b.*\b(slides?|deck|presentation|pr[ée]sentation|diapo\w*|pptx)\b/i;

/** A request to make a presentation from nothing. A change to one that exists goes the usual way, with edit blocks. */
export const wantsDeck = (request: string, chatHasDeck: boolean) => !chatHasDeck && DECK_WORDS.test(request) && CREATE.test(request) && !NOT_A_REQUEST.test(request);

/** How many slides the person asked for, when they said. */
export function slideCountOf(request: string): number | null {
  const m = /\b(\d{1,2})\s*(?:[-–]?\s*)?(?:slides?|diapos?|diapositives?|pages?)\b/i.exec(request) ?? /\b(?:slides?|diapos?|diapositives?)\s*(?:count|:)?\s*(\d{1,2})\b/i.exec(request);
  const n = m ? Number(m[1]) : NaN;
  return n >= 2 ? Math.min(MAX_DECK_SLIDES, n) : null;
}

export type VisualKind = "none" | "chart" | "flow" | "image" | "diagram";
export interface PlanSlide { role: "cover" | "content" | "closing"; topic: string; visual: VisualKind; hint: string }
export interface DeckPlan { title: string; theme: string; slides: PlanSlide[] }

export const DECK_PLANNER = [
  "You plan a PowerPoint presentation. You write no slide text yet. Reply with lines in exactly this form and nothing else:",
  "Title: <the title of the presentation>",
  `Theme: <one of ${THEMES.map((t) => t.id).join(", ")}>`,
  "Slide: cover | <what it is about> | none",
  "Slide: content | <one topic of the slide> | <visual>",
  "Slide: closing | <what it says> | none",
  "<visual> is one of:",
  "none   (a few bullets)",
  "flow <the steps, 3 to 5, separated by ->>   (a process, a sequence, a cycle, how something works)",
  "chart <bar|line|pie> <what the numbers are>   (ONLY when the user gave the numbers; never invent data)",
  "diagram <sequence|timeline|mindmap|org|states|gantt> <what it shows>   (structure that a simple flow cannot show: who talks to whom, dates in order, an idea and its branches, a hierarchy, states, a schedule; at most 3 in all, only when the diagram tool is available)",
  "image <2 to 4 English search words>   (a real place, animal, plant, person, object or artwork that a photo makes clearer; at most 3 in all)",
  "Rules: the first slide is the cover, the last one is the closing. One idea per slide. Different slides, different visuals: most slides are none or flow, not everything has a picture. Choose the theme from the subject:",
  ...THEMES.map((t) => `- ${t.id}: ${t.hint}`),
  "Write the slides in the language of the request, but the image search words in English."
].join("\n");

export const deckPlannerPrompt = (request: string, count: number | null, images: boolean, diagrams = false) =>
  `The user asked:\n${request.trim().slice(0, 1500)}\n\n${count ? `Make exactly ${count} slides.` : "Make 6 to 9 slides."} ${images ? "Pictures from Wikimedia Commons are available." : "No pictures are available: never use the image visual."} ${diagrams ? "" : "The diagram visual is not available."}\nWrite the plan now.`;

export function parsePlan(reply: string, request: string, count: number | null, images: boolean, diagrams = false): DeckPlan {
  const text = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, " ");
  const title = /^\s*title\s*:\s*(.+)$/im.exec(text)?.[1]?.trim().replace(/^["'*]+|["'*]+$/g, "");
  const themeWord = /^\s*theme\s*:\s*([\w -]+)/im.exec(text)?.[1] ?? "";
  const theme = themeOf(`Theme: ${themeWord}`).id;
  let images3 = 0, diagrams3 = 0;
  const slides: PlanSlide[] = [];
  for (const m of text.matchAll(/^\s*slide(?:\s*\d+)?\s*:\s*(cover|content|closing|title|conclusion|end)?\s*\|?\s*([^|\n]+?)\s*(?:\|\s*(.*))?$/gim)) {
    const kind = (m[1] ?? "content").toLowerCase();
    const role: PlanSlide["role"] = kind === "cover" || kind === "title" ? "cover" : kind === "closing" || kind === "conclusion" || kind === "end" ? "closing" : "content";
    const v = (m[3] ?? "none").trim();
    let visual: VisualKind = "none", hint = "";
    const vm = /^(flow|chart|image|diagram)\b\s*(.*)$/i.exec(v);
    if (vm && role === "content") {
      visual = vm[1].toLowerCase() as VisualKind;
      hint = vm[2].trim();
      if (visual === "image" && (!images || images3 >= MAX_IMAGE_SLIDES || !hint)) visual = "none";
      else if (visual === "image") images3++;
      if (visual === "diagram" && (!diagrams || diagrams3 >= MAX_DIAGRAM_SLIDES)) visual = "none";
      else if (visual === "diagram") diagrams3++;
      if (visual === "flow" && !/->|→/.test(hint)) hint = "";
    }
    slides.push({ role, topic: m[2].trim().replace(/^["'*]+|["'*]+$/g, ""), visual, hint });
  }
  const wanted = count ?? 0;
  if (slides.length < 3) {
    const subject = (title || request).replace(/\s+/g, " ").trim().slice(0, 80);
    const n = Math.max(3, wanted || 6);
    const generic = ["Overview", "Key ideas", "How it works", "Examples", "Benefits", "Challenges", "What next"];
    return { title: subject, theme, slides: [{ role: "cover", topic: subject, visual: "none", hint: "" }, ...generic.slice(0, n - 2).map((g): PlanSlide => ({ role: "content", topic: `${g}: ${subject}`, visual: "none", hint: "" })), { role: "closing", topic: "Conclusion", visual: "none", hint: "" }] };
  }
  // the first is the cover and the last the closing, whatever the model called them
  slides[0] = { ...slides[0], role: "cover", visual: "none", hint: "" };
  if (slides.length > 2) slides[slides.length - 1] = { ...slides[slides.length - 1], role: "closing", visual: "none", hint: "" };
  const cap = Math.min(MAX_DECK_SLIDES, wanted || 12);
  let out = slides.slice(0, cap);
  if (wanted && out.length > wanted) out = [...out.slice(0, wanted - 1), out[out.length - 1]];
  return { title: title || out[0].topic, theme, slides: out };
}

export const SLIDE_WRITER = [
  "You write ONE slide of a presentation, as plain text in exactly this form (no code fence, no explanation):",
  "# Title of the slide",
  "- a short bullet",
  "- another short bullet",
  `Limits, never exceeded: the title ${LIMITS.titleWords} words at most; ${LIMITS.bullets} lines at most (4 when the slide also has a picture, chart or diagram); each line ${LIMITS.bulletWords} words at most, a phrase and not a sentence; no line starts with a number or a dash other than the bullet dash.`,
  "Write something true and concrete, not filler. Use the language of the request. Plain text only: **bold** for a key word is fine, nothing else.",
  "A cover slide has the title and ONE subtitle line (no bullet). A closing slide has a title and at most 2 lines (a message, what to remember, or a call to action).",
  "When asked for a diagram, add a line `Flow: step -> step -> step` (3 to 5 steps of 1 to 3 words) and at most 2 bullets.",
  "When asked for a chart, add `Chart: bar` (or line or pie) and then a markdown table: a header row, then 3 to 6 rows, first column the label, the others numbers only. Use only numbers from the request: never invent any.",
  "When asked for a diagram of structure (sequence, timeline, mindmap, org, states, gantt), write a fenced block ```mermaid whose first line names the kind (sequenceDiagram, timeline, mindmap, flowchart TD, stateDiagram-v2, gantt), with at most 8 nodes or steps and labels of 1 to 3 words, and at most 2 bullets.",
  "For a picture, write nothing about it: the app adds it."
].join("\n");

export function slidePrompt(request: string, plan: DeckPlan, index: number, problems: string[] = [], previous = ""): string {
  const s = plan.slides[index];
  const outline = plan.slides.map((x, i) => `${i + 1}. ${x.topic}${i === index ? "  <- THIS SLIDE" : ""}`).join("\n");
  const visual = s.visual === "flow" ? `Add a diagram.${s.hint ? ` Steps: ${s.hint}.` : ""}` : s.visual === "chart" ? `Add a chart: ${s.hint}.` : s.visual === "image" ? "It will have a picture beside the text: keep to 4 lines." : s.visual === "diagram" ? `Add a mermaid diagram: ${s.hint}. Keep to 2 bullets.` : "";
  return `The user asked:\n${request.trim().slice(0, 1200)}\n\nPresentation: ${plan.title}\nAll slides:\n${outline}\n\nWrite slide ${index + 1} (${s.role}): ${s.topic}. ${visual}${previous ? `\n\nYour previous try:\n${previous}\n\nIt breaks these rules, fix them:\n${problems.map((p) => `- ${p}`).join("\n")}` : ""}`;
}

/** The slide a model wrote, from its reply (fences and thoughts removed); null when there is nothing usable. */
export function parseSlideReply(reply: string): Slide | null {
  let t = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, " ").replace(/^\s*---+\s*$/gm, "");
  const wrapped = /^\s*```(?!mermaid|diagram|chart)[\w-]*[ \t]*\n([\s\S]*?)\n?```\s*$/.exec(t);
  if (wrapped) t = wrapped[1];
  return slidesOf(t)[0] ?? null;
}

export function slideSource(s: Slide): string {
  const out: string[] = [];
  if (s.title) out.push(`# ${s.title}`);
  for (const l of s.lines) out.push(l.bullet ? `${"  ".repeat(l.level)}- ${l.text}` : l.text);
  if (s.flow) out.push(`Flow: ${s.flow.join(" -> ")}`);
  if (s.table) { if (s.chart) out.push(`Chart: ${s.chart}`); const w = Math.max(...s.table.map((r) => r.length)); const line = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => (r[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`; out.push(line(s.table[0]), `|${Array(w).fill("---").join("|")}|`, ...s.table.slice(1).map(line)); }
  if (s.figure) out.push(`\`\`\`${s.figure.lang}\n${s.figure.raw}\n\`\`\``);
  if (s.image) out.push(`![${s.image.caption.replace(/[\]\n]/g, " ")}](wikimedia:${s.image.file.replace(/\)/g, "%29")})`);
  if (s.notes) out.push(`Notes: ${s.notes.replace(/\n/g, " ")}`);
  return out.join("\n");
}

export const deckSource = (themeId: string, slides: Slide[]) => `Theme: ${themeId}\n\n---\n\n${slides.map(slideSource).join("\n\n---\n\n")}\n`;

/** A chart needs real numbers: without at least two rows of them the slide goes back to plain text. */
export function chartIsUsable(s: Slide): boolean {
  if (!s.table || !s.chart) return false;
  return s.table.slice(1).filter((r) => r.slice(1).some((c) => /^-?[\d.,]+%?$/.test(c.replace(/\s/g, "")))).length >= 2;
}

export const LOOK_SLIDE = "You look at a screenshot of one slide of a presentation and say whether it looks finished and readable: text cut off or running over its box, text too small to read, things on top of each other, a big empty area, a picture that is missing or distorted, a chart with unreadable labels. Reply with exactly one line: OK, or PROBLEM: followed by one short sentence saying what is wrong. Judge only what is visible.";
export const lookSlidePrompt = (title: string) => `This is the slide titled "${title}". Is anything wrong?`;
const parseProblem = (reply: string): string | null => { const m = /PROBLEM\s*:\s*(.+)/i.exec(reply.replace(/<think>[\s\S]*?<\/think>/g, " ")); return m ? m[1].trim().split("\n")[0].slice(0, 200) : null; };

export interface Candidate { file: string; description: string; license: string }
export interface RenderResult { shot?: string; problems: string[] }

export interface DeckOptions {
  id: string;
  messages: ChatMessage[];
  stream: Session;
  signal?: AbortSignal;
  modelOf?: () => string | undefined;
  /** Wikimedia Commons candidates for some words; absent when the Pictures tool is off. */
  candidates?: (query: string) => Promise<Candidate[]>;
  /** A diagram (Mermaid) or chart block drawn by the window, as a picture; null when it cannot be drawn. */
  figure?: (lang: FigureLang, raw: string) => Promise<Pics[string] | null>;
  /** A picture ready to draw (also tells whether it can be loaded); null when it cannot. */
  picture?: (file: string) => Promise<Pics[string] | null>;
  /** One slide's page drawn in a hidden window: its screenshot and what is wrong in it (text cut off, picture not loaded). */
  render?: (html: string) => Promise<RenderResult>;
  /** A model that can see says what is wrong with a slide's screenshot; null when none can. */
  lookAt?: (shot: string, question: string) => Promise<string | null>;
}

export type DeckResult = { handled: true; text: string; stats: ChatStats } | { handled: false };

const secOf = (t: number) => Math.round(((Date.now() - t) / 1000) * 10) / 10;

async function collect(stream: Session, sid: string, messages: ChatMessage[], add: (s: ChatStats) => void, signal?: AbortSignal, role?: Parameters<Session>[3]): Promise<string> {
  let text = "";
  for await (const ev of stream(sid, messages, true, role)) {
    text = withAnswer(text, ev);
    if (ev.type === "done") add(ev.stats);
  }
  if (signal?.aborted) throw new Error("aborted");
  return text;
}

export async function* makeDeck(o: DeckOptions): AsyncGenerator<ChatEvent, DeckResult> {
  const total: ChatStats = { ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0 };
  const add = (s: ChatStats) => {
    total.tokens += s.tokens;
    total.totalSec = Math.round((total.totalSec + s.totalSec) * 100) / 100;
    if (total.ttftSec === null) total.ttftSec = s.ttftSec;
    if (total.answerSec == null) total.answerSec = s.answerSec;
    if (total.tokPerSec === null) total.tokPerSec = s.tokPerSec;
  };
  const aborted = () => { if (o.signal?.aborted) throw new Error("aborted"); };
  const lastUser = o.messages.map((m) => m.role).lastIndexOf("user");
  if (lastUser < 0) return { handled: false };
  const request = textOf(o.messages[lastUser].content);
  const images = !!o.candidates;
  const diagrams = !!o.figure;
  const count = slideCountOf(request);

  const steps: BuildStep[] = [];
  const start: BuildStage[] = [];
  let phase = "";
  const run = (status: BuildRun["status"] = "running"): ChatEvent => ({ id: o.id, type: "build", build: { status, steps: steps.map((s) => ({ ...s, stages: s.stages?.map((g) => ({ ...g })) })), phase, start: start.map((g) => ({ ...g })) } });
  const begin = (list: BuildStage[], id: string, label: string, note: string, agent: string, model?: string): BuildStage => { const g: BuildStage = { id, label, status: "running", note, agent, model, at: Date.now() }; list.push(g); return g; };
  const end = (g: BuildStage, status: BuildStage["status"], note?: string) => { g.status = status; g.sec = secOf(g.at ?? Date.now()); if (note !== undefined) g.note = note; };

  // 1 ---- plan
  const planning = begin(start, "plan", "Plan", "choosing a theme and the slides", "Planner", o.modelOf?.());
  phase = "Planning the presentation: theme, slides and what each one shows…";
  yield run();
  let plan: DeckPlan;
  try {
    let reply = await collect(o.stream, `${o.id}:deckplan`, [{ role: "system", content: DECK_PLANNER }, { role: "user", content: deckPlannerPrompt(request, count, images, diagrams) }], add, o.signal, "plan");
    plan = parsePlan(reply, request, count, images, diagrams);
    if (plan.slides.length < 3 || !/^\s*slide/im.test(reply)) { reply = ""; plan = parsePlan(reply, request, count, images, diagrams); }
  } catch (e) {
    if (o.signal?.aborted) throw e;
    plan = parsePlan("", request, count, images, diagrams);
  }
  end(planning, "done", `${plan.slides.length} slides · ${THEMES.find((t) => t.id === plan.theme)?.name} theme`);
  for (const [i, s] of plan.slides.entries()) steps.push({ file: `Slide ${i + 1} · ${s.topic.slice(0, 40)}`, action: "new", job: s.visual === "none" ? "text" : `text and ${s.visual}`, status: "waiting", stages: [] });
  yield run();

  // 2 ---- the text of each slide
  const slides: Slide[] = [];
  for (const [i, ps] of plan.slides.entries()) {
    aborted();
    const step = steps[i];
    step.status = "running";
    const g = begin(step.stages!, "write", "Text", "writing the slide within its limits", "Writer", o.modelOf?.());
    phase = `Writing slide ${i + 1} of ${plan.slides.length} · ${ps.topic}`;
    yield run();
    let slide: Slide | null = null, problems: string[] = [], reply = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try { reply = await collect(o.stream, `${o.id}:slide${i}:${attempt}`, [{ role: "system", content: SLIDE_WRITER }, { role: "user", content: slidePrompt(request, plan, i, problems, attempt ? slide ? slideSource(slide) : reply : "") }], add, o.signal); } catch (e) { if (o.signal?.aborted) throw e; break; }
      const s = parseSlideReply(reply);
      if (!s) { problems = ["Reply with the slide in the form shown, starting with # and the title."]; continue; }
      slide = s;
      problems = slideProblems(s);
      if (ps.visual === "image" || ps.visual === "diagram") { const extra = s.lines.length > 4 ? [`Too many lines for a slide with a picture (${s.lines.length}): at most 4.`] : []; problems = [...problems, ...extra]; }
      if (!problems.length) break;
    }
    if (!slide) slide = { title: ps.topic, lines: [], table: null, notes: "" };
    if (problems.length) { slide = trimSlide(slide); if (ps.visual === "image" || ps.visual === "diagram") slide = { ...slide, lines: slide.lines.slice(0, ps.visual === "diagram" ? 2 : 4) }; }
    if (ps.visual !== "chart") { slide = { ...slide, chart: undefined, table: ps.role === "content" && slide.table ? slide.table : null }; }
    if (ps.visual === "chart" && !chartIsUsable(slide)) { slide = { ...slide, chart: undefined, table: null }; steps[i].job = "text (no data for a chart)"; }
    if (ps.visual !== "flow") slide.flow = undefined;
    if (ps.visual !== "diagram") slide.figure = undefined;
    if (ps.visual === "flow" && !slide.flow && ps.hint) { const f = ps.hint.split(/\s*(?:->|→)\s*/).map((x) => x.trim()).filter(Boolean); if (f.length >= 2) slide.flow = f.slice(0, 6); }
    slide.image = undefined; // the picture is the next step's
    slides.push(slide);
    end(g, "done", problems.length ? "cut down to the limits" : `${slide.lines.length} lines`);
    yield run();
  }

  // 3 ---- the diagrams and the pictures
  const pics: Pics = {};
  for (const [i, ps] of plan.slides.entries()) {
    if (ps.visual !== "diagram" || !o.figure) continue;
    aborted();
    const step = steps[i];
    const g = begin(step.stages!, "visual", "Diagram", `drawing the ${ps.hint || "diagram"}`, "Illustrator");
    phase = `Slide ${i + 1} · drawing the diagram`;
    yield run();
    const fig = slides[i].figure;
    let drawn = false;
    if (fig) { try { const p = await o.figure(fig.lang, fig.raw); if (p) { pics[figureKey(fig.lang, fig.raw)] = p; drawn = true; } } catch (e) { if (o.signal?.aborted) throw e; } }
    if (!drawn) { slides[i] = { ...slides[i], figure: undefined }; steps[i].job = `${steps[i].job} (the diagram could not be drawn)`; }
    end(g, drawn ? "done" : "skipped", drawn ? "drawn" : "could not be drawn, the slide keeps its text");
    yield run();
  }
  for (const [i, ps] of plan.slides.entries()) {
    if (ps.visual !== "image" || !o.candidates) continue;
    aborted();
    const step = steps[i];
    const g = begin(step.stages!, "visual", "Picture", `looking on Wikimedia Commons for “${ps.hint}”`, "Illustrator");
    phase = `Slide ${i + 1} · looking for a picture of ${ps.hint}`;
    yield run();
    try {
      const list = (await o.candidates(ps.hint)).filter((c) => !/\.(svg|gif|tif|tiff)$/i.test(c.file));
      for (const c of list.slice(0, 3)) {
        const p = o.picture ? await o.picture(c.file) : null;
        if (!p) continue;
        pics[c.file] = p;
        slides[i] = { ...slides[i], image: { caption: plain(c.description).slice(0, 70), file: c.file } };
        break;
      }
    } catch (e) { if (o.signal?.aborted) throw e; }
    const ok = !!slides[i].image;
    if (!ok) steps[i].job = `${steps[i].job} (no picture found)`;
    end(g, ok ? "done" : "skipped", ok ? slides[i].image!.file.slice(0, 50) : "none found, the slide keeps its text");
    yield run();
  }

  // 4 ---- a screenshot of every slide, a look, a fix
  let source = deckSource(plan.theme, slides);
  const render = o.render;
  if (render) {
    for (const [i] of slides.entries()) {
      aborted();
      const step = steps[i];
      const g = begin(step.stages!, "run", "Screenshot", "drawing the slide and checking it", "Tester");
      phase = `Slide ${i + 1} · checking how it looks`;
      yield run();
      let result = await render(deckHtml(source, pics, i)).catch((): RenderResult => ({ problems: [] }));
      let seen = result.problems.slice();
      if (result.shot && o.lookAt) { const verdict = parseProblem((await o.lookAt(result.shot, `${LOOK_SLIDE}\n\n${lookSlidePrompt(slides[i].title)}`).catch(() => null)) ?? ""); if (verdict) seen.push(verdict); }
      g.shot = result.shot;
      end(g, seen.length ? "error" : "done", seen.length ? seen[0].slice(0, 90) : "looks fine");
      yield run();
      for (let round = 0; seen.length && round < 2; round++) {
        aborted();
        const fix = begin(step.stages!, "fix", "Fix", seen[0].slice(0, 80), "Fixer", o.modelOf?.());
        phase = `Slide ${i + 1} · fixing: ${seen[0]}`;
        yield run();
        const before = slides[i];
        let next: Slide | null = null;
        try {
          const reply = await collect(o.stream, `${o.id}:fix${i}:${round}`, [{ role: "system", content: SLIDE_WRITER }, { role: "user", content: `${slidePrompt(request, plan, i, seen, slideSource({ ...before, image: undefined }))}\n\nMake the slide shorter and simpler so that it fits: fewer words per line, fewer lines.` }], add, o.signal);
          next = parseSlideReply(reply);
        } catch (e) { if (o.signal?.aborted) throw e; }
        let candidate: Slide = next ? { ...next, flow: before.flow && next.flow ? next.flow : before.flow, table: before.table, chart: before.chart, image: before.image, notes: next.notes || before.notes } : before;
        if (slideProblems(candidate).length) candidate = trimSlide(candidate);
        if (JSON.stringify(candidate) === JSON.stringify(before)) candidate = { ...trimSlide(before), lines: before.lines.slice(0, Math.max(1, before.lines.length - 1)) };
        const trial = deckSource(plan.theme, slides.map((s, k) => (k === i ? candidate : s)));
        const after = await render(deckHtml(trial, pics, i)).catch((): RenderResult => ({ problems: seen }));
        const better = after.problems.length <= result.problems.length;
        if (better) { slides[i] = candidate; source = trial; result = after; seen = after.problems.slice(); fix.shot = after.shot; }
        end(fix, better ? "done" : "skipped", better ? (seen.length ? "better, still not perfect" : "fixed") : "made it worse, undone");
        yield run();
        if (!better) break;
      }
      if (step) step.status = "done";
    }
  }
  for (const s of steps) s.status = "done";

  // the layout's own verdict, kept for the summary
  const left = slides.map((s, i) => ({ i, p: layoutSlide(s, themeOf(source), { index: i, count: slides.length, pics }).overflow })).filter((x) => x.p.length);

  // 5 ---- the summary
  const files = wikiFilesIn(source);
  const title = plan.title.replace(/"/g, "'").slice(0, 80);
  const artifact = `<artifact type="pptx" title="${title}">\n${source.trim()}\n</artifact>`;
  phase = "Writing the summary…";
  yield run();
  const report = `Presentation "${plan.title}": ${slides.length} slides, theme ${THEMES.find((t) => t.id === plan.theme)?.name}. Pictures: ${files.length}. Charts: ${slides.filter((s) => s.chart).length}. Diagrams: ${slides.filter((s) => s.flow).length}.${left.length ? ` Slides still tight: ${left.map((x) => x.i + 1).join(", ")}.` : ""}`;
  let explanation = "";
  try {
    explanation = (await collect(o.stream, `${o.id}:deckexplain`, [{ role: "user", content: `[You made a presentation yourself; it is open next to your message and the user can edit its text with the Edit button, or ask you to change it.]\n${report}\n\nReply to the user, in the language of their request: ${request.trim().slice(0, 300)}\nSay in 2 or 3 short sentences what you made (title, number of slides, the look), that they can save it as a PowerPoint file with Save as, and offer one concrete change. First person singular. No code, no <artifact> tag.` }], add, o.signal)).replace(/<artifact[\s\S]*?(?:<\/artifact>|$)/gi, "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  } catch (e) { if (o.signal?.aborted) throw e; }
  if (!explanation) explanation = `Done: “${plan.title}”, ${slides.length} slides.`;
  phase = "";
  yield run("done");
  const text = `${artifact}\n\n${explanation}`;
  yield { id: o.id, type: "answer", text };
  return { handled: true, text, stats: total };
}
