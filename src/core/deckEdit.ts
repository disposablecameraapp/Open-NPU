// A change to a presentation that exists, with no limit on what is asked and as smoothly as the making of one. The deck is cut into its parts
// (the Theme line, then one text per slide). A request is turned into a list of operations (edit, take a word out, add or remove a picture,
// delete, move or add a slide, change the theme): the obvious ones from the words, the rest by a small JSON the model fills in. Each operation
// touches only what it names, every touched slide shows its stages and a screenshot, the preview follows each step, and what the model writes
// (a change of text, a new slide) is drawn as it comes in. A request that is not a change (a question) is left to the usual answer.
import type { BuildRun, BuildStage, BuildStep, ChatEvent, ChatMessage, ChatStats } from "../shared/types";
import { withAnswer } from "./chat";
import { textOf } from "./attachments";
import { deckHtml, plain, slideProblems, slidesOf, trimSlide, wikiFilesIn, type Pics, type Slide } from "./slides";
import { SLIDE_WRITER, parseSlideReply, slideSource, userRequest, type DeckOptions, type RenderResult } from "./deckBuild";
import { EDITOR_INSTRUCTIONS, editorPrompt } from "./build";
import { ARTIFACT_INSTRUCTIONS } from "./artifacts";
import { applyEdits, latestArtifacts, parseReply } from "./review";
import { isFrench } from "./deckFacts";
import { findTheme } from "./themeGen";
import { firstJson } from "./look";
import { pickedSlides, takePicks, type SlidePick } from "./slidePicks";

// ---------------------------------------------------------------- the deck as parts
export interface DeckParts { head: string; parts: string[] }

/** The Theme line (if any) and the text of each slide. */
export function splitDeck(content: string): DeckParts {
  let head = "";
  const parts: string[] = [];
  for (const seg of content.replace(/\r/g, "").split(/^[ \t]*---+[ \t]*$/m)) {
    const t = seg.trim();
    if (!t) continue;
    if (!head && !parts.length && /^theme\s*:/i.test(t) && !/^#/m.test(t)) head = t;
    else parts.push(t);
  }
  const lead = !head && parts[0] ? /^(theme\s*:[^\n]*)\n+([\s\S]*)$/i.exec(parts[0]) : null;
  if (lead && lead[2].trim()) { head = lead[1].trim(); parts[0] = lead[2].trim(); }
  return { head, parts };
}
export const joinDeck = (d: DeckParts): string => `${[d.head, ...d.parts].filter(Boolean).join("\n\n---\n\n")}\n`;

// ---------------------------------------------------------------- what a request asks
export type Op =
  | { op: "edit"; slides: number[] | "all"; what: string }
  | { op: "word"; slides: number[] | "all"; what: string }
  | { op: "picture"; slides: number[]; what: string }
  | { op: "remove_picture"; slides: number[] | "all" }
  | { op: "delete"; slides: number[] }
  | { op: "move"; slides: number[]; after: number }
  | { op: "add"; after: number; what: string }
  | { op: "theme"; what: string };

const SLIDE_WORD = "(?:slides?|diapos?|diapositives?)";
const numbersIn = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);

/** The slides a request names ("slide 3", "slides 2 and 4", "the 5th slide"), "all" for every one, else none. */
export function slidesNamed(request: string, count: number, picks: SlidePick[] = []): number[] | "all" {
  const found = new Set<number>();
  for (const m of request.matchAll(new RegExp(`\\b${SLIDE_WORD}\\s*(?:n[°o]\\s*)?#?(\\d{1,2}(?:\\s*(?:,|and|et|&|/)\\s*\\d{1,2})*)`, "gi"))) for (const n of numbersIn(m[1])) found.add(n);
  for (const m of request.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|e|[èe]me|[èe]re|er)\\s+${SLIDE_WORD}\\b`, "gi"))) found.add(Number(m[1]));
  const list = [...found].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  if (list.length) return list;
  // the slides the person pointed at in the preview: "the second" is the second one chosen, and with no rank all of them
  const pointed = pickedSlides(request, picks).filter((n) => n >= 1 && n <= count);
  if (pointed.length) return [...new Set(pointed)];
  return new RegExp(`\\b(?:all|every|each|toutes?|tous|chaque)\\b.{0,24}\\b${SLIDE_WORD}\\b|\\b(?:whole|entire|tout)\\b.{0,12}\\b(?:deck|presentation|pr[ée]sentation|diaporama)\\b`, "i").test(request) ? "all" : [];
}

const REMOVE = /\b(remove|delete|drop|erase|get rid of|take out|enl[èe]ve[rz]?|supprime[rz]?|retire[rz]?|efface[rz]?)\b/i;
const ADD = /\b(add|insert|put|include|attach|ajoute[rz]?|rajoute[rz]?|mets|met|mettre|ins[èe]re[rz]?|place[rz]?)\b/i;
const PICTURE = /\b(pictures?|images?|photos?|illustrations?)\b/i;
const OTHER_VISUAL = /\b(diagrams?|diagrammes?|charts?|graphs?|graphiques?|sch[ée]mas?|flow ?charts?|timelines?|frises?)\b/i;
const ANY = /\b(slides?|diapos?|diapositives?|deck|presentation|pr[ée]sentation|theme|th[èe]me|colou?rs?|couleurs?|font|police|image|picture|photo|diagram|chart|graph|title|titre|text|texte|word|mot|shorter|longer|plus court|plus long|add|remove|delete|change|replace|rewrite|translate|move|swap|make|fix|update|edit|ajoute\w*|enl[èe]ve\w*|supprime\w*|retire\w*|remplace\w*|traduis\w*|d[ée]place\w*|mets|met|rends|modifie\w*|corrige\w*|r[ée]duis|agrandis|inverse|ordre|order|style|look|background|fond)\b/i;

/** The changes a request makes that need no model to read: a word to take out, a picture for a named slide, a slide to delete. */
export function obviousOps(request: string, count: number, picks: SlidePick[] = []): Op[] | null {
  const slides = slidesNamed(request, count, picks);
  const quotes = [...request.matchAll(/["“«„]([^"”»“\n]{1,60})["”»]/g)].map((m) => m[1].trim()).filter(Boolean);
  if (REMOVE.test(request) && quotes.length === 1 && !PICTURE.test(request)) return [{ op: "word", slides: Array.isArray(slides) && !slides.length ? "all" : slides, what: quotes[0] }];
  if (REMOVE.test(request) && Array.isArray(slides) && slides.length && new RegExp(`${SLIDE_WORD}\\s*(?:n[°o]\\s*)?\\d`, "i").test(request) && !quotes.length && !PICTURE.test(request) && !/\b(text|texte|line|ligne|title|titre|bullet|word|mot|notes?|chart|diagram)/i.test(request)) return [{ op: "delete", slides }];
  if (PICTURE.test(request) && ADD.test(request) && !OTHER_VISUAL.test(request) && Array.isArray(slides) && slides.length) {
    const about = quotes[0] ?? /\b(?:of|de|d'|about|sur|showing|montrant|representing|repr[ée]sentant)\s+(?:the\s+|a\s+|an\s+|le\s+|la\s+|les\s+|l')?([^.,;!?\n]{3,60})/i.exec(request.replace(PICTURE, " "))?.[1]?.replace(new RegExp(`\\s+(?:to|on|in|for|sur|[àa]|pour)\\s+(?:the\\s+|la\\s+)?${SLIDE_WORD}\\b.*$`, "i"), "").replace(AIM, "").trim() ?? "";
    return [{ op: "picture", slides, what: about }];
  }
  return null;
}

/** What follows the subject of a picture ("... to illustrate and fill the blank part"): not words to search for. */
const AIM = /\s+(?:to|pour|afin|and|et|so that|that|which|qui|,)\s+(?:illustrate|illustrat\w*|ilustrate|decorate|fill|lighten|show|make|illustrer|d[ée]corer|remplir|combler|aérer|montrer|rendre)\b.*$/i;
const OPS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["ops"],
  properties: { ops: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, required: ["op"], properties: {
    op: { type: "string", enum: ["edit", "word", "picture", "remove_picture", "delete", "move", "add", "theme", "none"] },
    slides: { type: "array", maxItems: 20, items: { type: "integer" } },
    all: { type: "boolean" },
    after: { type: "integer" },
    what: { type: "string" }
  } } } }
} as const;

const PLANNER = [
  "You read what a person asks for their PowerPoint presentation and turn it into operations. Reply with one JSON object {\"ops\": [...]} and nothing else.",
  "Each operation has \"op\" and:",
  "- edit: any change to what is on slides (text, shorter, longer, translated, reworded, notes, a chart, a flow, a diagram, a quote, a callout, colours or fonts of one slide). \"slides\": the numbers, or \"all\": true for every slide. \"what\": the change, in the person's words.",
  "- word: take one word or phrase out of the text. \"slides\" or \"all\": true, \"what\": the word.",
  "- picture: add a picture to the slides named. \"slides\": numbers, \"what\": 2 to 4 English search words for the picture.",
  "- remove_picture: take the picture off the slides (\"slides\" or \"all\": true).",
  "- delete: remove whole slides (\"slides\").",
  "- move: move the slide in \"slides\" (one number) to come after slide \"after\" (0 = first).",
  "- add: a whole NEW slide, \"after\": the slide it follows (0 = first), \"what\": what it is about, in the person's words. Adding a point, a bullet, a line or a sentence to a slide that exists is an edit of that slide, never an add.",
  "- theme: change the look of the whole deck (theme, colours, fonts, mood). \"what\": the words of the look wanted.",
  "- none: the message is not a change to the presentation (a question, thanks, a request to explain).",
  "A request may need several operations, in order. Slide numbers are those of the deck as it is now. When the person does not name a slide, choose the slides the change is about from the list below, or all of them when it is about the whole deck."
].join("\n");

const FORMAT = ARTIFACT_INSTRUCTIONS.split("\n").find((l) => l.startsWith("pptx =")) ?? "";

const MORE_TEXT = /\b(points?|bullets?|lines?|lignes?|items?|[ée]l[ée]ments?|id[ée]es?|arguments?|examples?|exemples?)\b/i;
const NEW_SLIDE = /\b(?:new|another|nouvelle|nouveau|autre|extra|additional|suppl[ée]mentaire)\s+(?:slide|diapo|diapositive)|\b(?:slide|diapo|diapositive)\s+(?:de\s+)?(?:plus|en plus|suppl[ée]mentaire)\b/i;
/** The person pointed at a slide and asked for one more point: that is a change of the slide, not a new slide. */
export function pointsToEdit(ops: Op[], request: string, count: number, picks: SlidePick[] = []): Op[] {
  if (!MORE_TEXT.test(request) || NEW_SLIDE.test(request)) return ops;
  const named = slidesNamed(request, count, picks);
  if (!Array.isArray(named) || named.length !== 1) return ops;
  return ops.map((o) => (o.op === "add" ? ({ op: "edit", slides: named, what: request.slice(0, 300) } as Op) : o));
}

const clean = (n: unknown): number[] => (Array.isArray(n) ? n.map(Number).filter((x) => Number.isInteger(x) && x >= 0) : []);
/** The operations of a model's JSON, checked against the deck: what does not hold (a slide that does not exist, an empty instruction) is left out. */
export function opsFrom(raw: unknown, count: number): Op[] {
  const list = (raw as { ops?: unknown })?.ops;
  if (!Array.isArray(list)) return [];
  const out: Op[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const what = typeof r.what === "string" ? r.what.trim() : "";
    const nums = clean(r.slides).filter((x) => x >= 1 && x <= count);
    const slides: number[] | "all" = r.all === true ? "all" : nums;
    const has = slides === "all" || slides.length > 0;
    const after = Number.isInteger(r.after) ? Math.min(count, Math.max(0, r.after as number)) : count;
    switch (r.op) {
      case "edit": if (has && what) out.push({ op: "edit", slides, what }); break;
      case "word": if (has && what) out.push({ op: "word", slides, what }); break;
      case "picture": if (Array.isArray(slides) && slides.length) out.push({ op: "picture", slides, what }); break;
      case "remove_picture": if (has) out.push({ op: "remove_picture", slides }); break;
      case "delete": if (Array.isArray(slides) && slides.length && slides.length < count) out.push({ op: "delete", slides }); break;
      case "move": if (Array.isArray(slides) && slides.length === 1) out.push({ op: "move", slides, after }); break;
      case "add": if (what) out.push({ op: "add", after, what }); break;
      case "theme": if (what) out.push({ op: "theme", what }); break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- small text changes the app makes itself
const KEEP = /^\s*(?:theme|style|layout|chart|flow|notes?|!\[)/i;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A word taken out of the text of a slide, with the label colon and the space after it; the lines that are settings of the slide are left alone. */
export function withoutWord(text: string, word: string): string {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])[ \\t]*:?[ \\t]*`, "giu");
  return text.split("\n").map((l) => (KEEP.test(l) ? l : l.replace(re, "").replace(/[ \t]{2,}/g, " ").replace(/ +([,.;!?])/g, "$1").replace(/^(\s*(?:[-*]\s+)?)\s+/, "$1").replace(/[ \t]+$/, ""))).join("\n");
}
/** The picture lines (Wikimedia, and a drawn diagram or chart block stay) taken off a slide. */
export const withoutPicture = (text: string): string => text.split("\n").filter((l) => !/^\s*!\[[^\]]*\]\(wikimedia:/i.test(l)).join("\n");

const secOf = (t: number) => Math.round(((Date.now() - t) / 1000) * 10) / 10;
const titleOfText = (t: string) => slidesOf(t)[0]?.title || t.split("\n")[0].replace(/^#\s*/, "").slice(0, 40);

export type DeckChangeResult = { handled: true; text: string; stats: ChatStats } | { handled: false };

export async function* changeDeck(o: DeckOptions): AsyncGenerator<ChatEvent, DeckChangeResult> {
  const lastUser = o.messages.map((m) => m.role).lastIndexOf("user");
  if (lastUser < 0) return { handled: false };
  const deck = latestArtifacts(o.messages).filter((a) => a.kind === "pptx").pop();
  if (!deck) return { handled: false };
  const said0 = userRequest(textOf(o.messages[lastUser].content));
  const { picks, rest } = takePicks(said0);
  const asked = rest.trim();
  if (!ANY.test(asked) && !picks.length) return { handled: false };
  const state = splitDeck(deck.content);
  const count = state.parts.length;
  if (!count) return { handled: false };
  const ids = state.parts.map((_, i) => i + 1); // the number a slide had when the request was made, kept while slides move and go
  let nextId = 1000;

  const fr = isFrench(asked);
  const total: ChatStats = { ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0 };
  const add = (s: ChatStats) => { total.tokens += s.tokens; total.totalSec = Math.round((total.totalSec + s.totalSec) * 100) / 100; if (total.ttftSec === null) total.ttftSec = s.ttftSec; if (total.tokPerSec === null) total.tokPerSec = s.tokPerSec; };
  const aborted = () => { if (o.signal?.aborted) throw new Error("aborted"); };
  const stream = async function* (sid: string, msgs: ChatMessage[], schema?: object, onText?: (t: string) => ChatEvent | null): AsyncGenerator<ChatEvent, string> {
    let text = "", last = 0;
    for await (const ev of o.stream(sid, msgs, true, schema ? "plan" : undefined, schema)) {
      text = withAnswer(text, ev);
      if (ev.type === "done") add(ev.stats);
      if (onText && (ev.type === "answer" || ev.type === "retract") && Date.now() - last > 250) { last = Date.now(); const e = onText(text); if (e) yield e; }
    }
    aborted();
    return text;
  };

  const title = deck.title.replace(/"/g, "'");
  const artifact = (draft?: { at: number; text: string; replace?: boolean }) => {
    const p = [...state.parts];
    if (draft && draft.at >= 0) p.splice(draft.at, draft.replace ? 1 : 0, draft.text);
    return `<artifact type="pptx" title="${title}">\n${joinDeck({ head: state.head, parts: p }).trim()}\n</artifact>`;
  };
  const show = (draft?: { at: number; text: string; replace?: boolean }): ChatEvent => ({ id: o.id, type: "replace", text: artifact(draft) });

  // 1 ---- what is asked: from the words when they say it, else a small JSON from the model
  const steps: BuildStep[] = [];
  const start: BuildStage[] = [];
  let phase = "";
  const run = (status: BuildRun["status"] = "running"): ChatEvent => ({ id: o.id, type: "build", build: { status, steps: steps.map((s) => ({ ...s, stages: s.stages?.map((g) => ({ ...g })) })), phase, start: start.map((g) => ({ ...g })) } });
  const begin = (list: BuildStage[], id: string, label: string, note: string, agent: string, model?: string): BuildStage => { const g: BuildStage = { id, label, status: "running", note, agent, model, at: Date.now() }; list.push(g); return g; };
  const end = (g: BuildStage, status: BuildStage["status"], note?: string) => { g.status = status; g.sec = secOf(g.at ?? Date.now()); if (note !== undefined) g.note = note; };

  let ops = obviousOps(asked, count, picks);
  if (!ops) {
    const reading = begin(start, "plan", "Understand", "reading what is asked", "Planner", o.modelOf?.());
    phase = "Reading what you ask for…";
    yield run();
    const outline = state.parts.map((t, i) => `${i + 1}. ${titleOfText(t)}${/^layout\s*:\s*(\w+)/im.exec(t) ? ` (${/^layout\s*:\s*(\w+)/im.exec(t)![1]})` : ""}`).join("\n");
    let raw: unknown = null;
    try {
      const reply = yield* stream(`${o.id}:deckops`, [{ role: "system", content: PLANNER }, { role: "user", content: `The slides:\n${outline}\n\nThe person asks:\n${asked.slice(0, 1500)}${picks.length ? `\n\nThe person pointed at these slides in the preview, in this order (\"the first\", \"the second\" mean them):\n${picks.map((p, i) => `${i + 1}. slide ${p.n} (${p.title})`).join("\n")}` : ""}\n\nWrite the JSON now.` }], OPS_SCHEMA as unknown as object);
      raw = firstJson(reply);
    } catch (e) { if (o.signal?.aborted) throw e; }
    ops = raw ? pointsToEdit(opsFrom(raw, count), asked, count, picks) : null;
    const none = !!raw && Array.isArray((raw as { ops?: unknown }).ops) && (raw as { ops: { op?: string }[] }).ops.every((x) => x?.op === "none");
    if (none) { end(reading, "done", "not a change"); return { handled: false }; }
    // a plan that could not be read: the slides the request names are edited, else every slide
    if (!ops || !ops.length) { const named = slidesNamed(asked, count, picks); ops = [{ op: "edit", slides: named, what: asked }]; if (Array.isArray(named) && !named.length) ops = [{ op: "edit", slides: "all", what: asked }]; }
    end(reading, "done", `${ops.length} change${ops.length > 1 ? "s" : ""}`);
  }

  // the deck opens at once as it is, then follows each change
  yield show();
  yield run();

  const pics: Pics = {};
  const said: string[] = [];
  const say = (french: string, english: string) => said.push(fr ? french : english);
  const touched = new Set<number>();
  const indexOf = (id: number) => ids.indexOf(id);
  const formatNote = FORMAT ? `\nThe form of a presentation's text:\n${FORMAT}\n` : "";

  /** One slide's text changed as the model is asked: edit blocks on that text alone, then the slide written again if they did not hold. */
  async function* changeText(id: number, text: string, what: string, stage: BuildStage): AsyncGenerator<ChatEvent, string | null> {
    const file = { title: deck!.title, kind: "pptx", language: "", content: text };
    const ask: ChatMessage[] = [{ role: "system", content: EDITOR_INSTRUCTIONS + formatNote }, { role: "user", content: editorPrompt(asked, file, what, text.trim(), "") }];
    const reply = yield* stream(`${o.id}:deckedit:${id}`, ask);
    const done = applyEdits(text, parseReply(reply).edits);
    if (done.applied && done.content !== text) return done.content;
    stage.note = "writing the slide again";
    yield run();
    const at = indexOf(id);
    const again = yield* stream(`${o.id}:deckredo:${id}`, [{ role: "system", content: `${SLIDE_WRITER}\n${formatNote}` }, { role: "user", content: `The user asked:\n${asked.slice(0, 1200)}\n\nThe change for this slide: ${what}\n\nThe slide as it is now:\n${text.trim()}\n\nSend the complete slide again with only that change, in the same form.` }], undefined, (t) => {
      let s: Slide | null = null;
      try { s = parseSlideReply(t); } catch { /* cut in the middle of a line */ }
      return s && s.title.trim() && at >= 0 ? show({ at, text: slideSource(s).trim(), replace: true }) : null;
    });
    const s = parseSlideReply(again);
    if (!s) return null;
    const old = slidesOf(text)[0];
    const fixed = slideProblems(s).length ? trimSlide(s) : s;
    return slideSource({ ...fixed, image: fixed.image ?? old?.image, notes: fixed.notes || old?.notes || "" }).trim();
  }

  const screenshot = async function* (step: BuildStep, at: number): AsyncGenerator<ChatEvent> {
    if (!o.render) return;
    const src = joinDeck(state);
    for (const f of wikiFilesIn(src)) if (!pics[f] && o.picture) { const p = await o.picture(f).catch(() => null); if (p) pics[f] = p; }
    const shot = begin(step.stages!, "shot", "Screenshot", "drawing the slide and checking it", "Tester");
    phase = `Slide ${at + 1} · checking how it looks`;
    yield run();
    const result = await o.render(deckHtml(src, pics, at)).catch((): RenderResult => ({ problems: [] }));
    shot.shot = result.shot;
    end(shot, result.problems.length ? "error" : "done", result.problems.length ? result.problems[0].slice(0, 90) : "looks fine");
  };
  const stepFor = (label: string, job: string): BuildStep => { const s: BuildStep = { file: label, action: "edit", job, status: "running", stages: [] }; steps.push(s); return s; };
  const labelOf = (id: number) => { const at = indexOf(id); return `Slide ${at + 1} · ${titleOfText(state.parts[at] ?? "").slice(0, 40)}`; };

  for (const op of ops) {
    aborted();
    try {
      const targets = "slides" in op ? (op.slides === "all" ? [...ids] : op.slides.map((n) => ids[n - 1]).filter((x) => x !== undefined)) : [];
      if (op.op === "edit" || op.op === "word" || op.op === "picture" || op.op === "remove_picture") {
        const okAt: number[] = [];
        for (const id of targets) {
          aborted();
          const at = indexOf(id);
          if (at < 0) continue;
          const text = state.parts[at];
          const what = op.op === "word" ? `taking out “${op.what}”` : op.op === "picture" ? "adding a picture" : op.op === "remove_picture" ? "taking the picture off" : op.what.slice(0, 80);
          const step = stepFor(labelOf(id), what);
          const g = begin(step.stages!, "edit", op.op === "picture" ? "Picture" : "Text", what, op.op === "edit" ? "Editor" : op.op === "picture" ? "Illustrator" : "App", op.op === "edit" ? o.modelOf?.() : undefined);
          g.file = deck.title;
          phase = `Slide ${at + 1} · ${what}`;
          yield run();
          let next: string | null = null;
          if (op.op === "word") {
            const t = withoutWord(text, op.what);
            if (t === text) { end(g, "skipped", `no “${op.what}” on this slide`); step.status = "done"; yield run(); continue; }
            next = t;
          } else if (op.op === "remove_picture") {
            const t = withoutPicture(text);
            if (t === text) { end(g, "skipped", "no picture on this slide"); step.status = "done"; yield run(); continue; }
            next = t;
          } else if (op.op === "picture") {
            if (!o.candidates) { end(g, "error", "the Pictures tool is off"); step.status = "error"; yield run(); say("L’outil Images est désactivé : je n’ai pas pu chercher d’image.", "The Pictures tool is off, so I could not look for a picture."); continue; }
            const slide = slidesOf(text)[0];
            const query = op.what || slide?.title || "";
            g.note = `looking on Wikimedia Commons for “${query}”`;
            yield run();
            let found: { file: string; caption: string } | null = null;
            // the whole subject first, then its first words (a flag is a drawing: a svg is kept, its thumbnail is a png)
            const tries = [...new Set([query, query.split(/\s+/).slice(0, 3).join(" ")].map((x) => x.trim()).filter(Boolean))];
            try {
              for (const q of tries) {
                for (const c of (await o.candidates(q)).filter((x) => !/\.(gif|tif|tiff)$/i.test(x.file)).slice(0, 4)) {
                  const p = o.picture ? await o.picture(c.file) : null;
                  if (!p) continue;
                  pics[c.file] = p;
                  found = { file: c.file, caption: plain(c.description).slice(0, 70) };
                  break;
                }
                if (found) break;
              }
            } catch (e) { if (o.signal?.aborted) throw e; }
            if (!found || !slide) { end(g, "error", "no picture found"); step.status = "error"; yield run(); say(`Je n’ai pas trouvé d’image pour la diapo ${at + 1}.`, `I found no picture for slide ${at + 1}.`); continue; }
            next = slideSource({ ...slide, lines: slide.lines.slice(0, 4), image: { caption: found.caption, file: found.file } }).trim(); // a slide with a picture holds at most 4 lines
          } else {
            next = yield* changeText(id, text, op.what, g);
          }
          if (!next || next === text) { end(g, "error", "no change came back"); step.status = "error"; yield run(); say(`Je n’ai pas réussi à modifier la diapo ${at + 1}.`, `I could not change slide ${at + 1}.`); continue; }
          end(g, "done", op.op === "word" ? `took out “${op.what}”` : op.op === "picture" ? "picture added" : op.op === "remove_picture" ? "picture taken off" : "changed");
          state.parts[at] = next;
          touched.add(id);
          okAt.push(at + 1);
          yield show();
          yield run();
          yield* screenshot(step, at);
          step.status = "done";
          yield run();
        }
        const list = okAt.join(", "), one = okAt.length === 1;
        if (!okAt.length) { if (op.op === "word") say(`Je n’ai trouvé « ${op.what} » nulle part : rien n’a changé.`, `I found no “${op.what}”, so nothing changed.`); }
        else if (op.op === "word") say(`J’ai retiré « ${op.what} » ${one ? `de la diapo ${list}` : `des diapos ${list}`}.`, `I took out “${op.what}” ${one ? `on slide ${list}` : `on slides ${list}`}.`);
        else if (op.op === "picture") say(`J’ai ajouté une image ${one ? `à la diapo ${list}` : `aux diapos ${list}`}.`, `I added a picture ${one ? `to slide ${list}` : `to slides ${list}`}.`);
        else if (op.op === "remove_picture") say(`J’ai retiré l’image ${one ? `de la diapo ${list}` : `des diapos ${list}`}.`, `I took the picture off ${one ? `slide ${list}` : `slides ${list}`}.`);
        else say(`J’ai modifié ${one ? `la diapo ${list}` : `les diapos ${list}`}.`, `I changed ${one ? `slide ${list}` : `slides ${list}`}.`);
      } else if (op.op === "delete") {
        const step = stepFor(fr ? "Diapos supprimées" : "Slides removed", "removing slides");
        const g = begin(step.stages!, "edit", "Remove", `removing ${targets.length} slide${targets.length > 1 ? "s" : ""}`, "App");
        const gone: number[] = [];
        for (const id of targets) { const at = indexOf(id); if (at >= 0 && state.parts.length > 1) { gone.push(at + 1); state.parts.splice(at, 1); ids.splice(at, 1); } }
        end(g, gone.length ? "done" : "skipped");
        step.status = "done";
        if (gone.length) say(`J’ai supprimé ${gone.length === 1 ? `la diapo ${gone[0]}` : `les diapos ${gone.join(", ")}`}.`, `I removed ${gone.length === 1 ? `slide ${gone[0]}` : `slides ${gone.join(", ")}`}.`);
        yield show();
        yield run();
      } else if (op.op === "move") {
        const id = targets[0];
        const from = indexOf(id);
        const step = stepFor(fr ? "Ordre des diapos" : "Order of the slides", "moving a slide");
        const g = begin(step.stages!, "edit", "Move", `moving slide ${from + 1}`, "App");
        const anchor = op.after === 0 ? -1 : ids[op.after - 1];
        const [text] = state.parts.splice(from, 1);
        ids.splice(from, 1);
        const to = anchor === -1 ? 0 : indexOf(anchor) + 1;
        state.parts.splice(to, 0, text);
        ids.splice(to, 0, id);
        end(g, "done", `now slide ${to + 1}`);
        step.status = "done";
        say(`J’ai déplacé la diapo ${from + 1} en position ${to + 1}.`, `I moved slide ${from + 1} to position ${to + 1}.`);
        yield show();
        yield run();
      } else if (op.op === "add") {
        const anchor = op.after === 0 ? -1 : ids[op.after - 1];
        const to = anchor === -1 ? 0 : indexOf(anchor) + 1;
        const step = stepFor(`${fr ? "Nouvelle diapo" : "New slide"} ${to + 1} · ${op.what.slice(0, 30)}`, "writing a new slide");
        const g = begin(step.stages!, "write", "Text", "writing the new slide", "Writer", o.modelOf?.());
        g.file = deck.title;
        phase = `Writing the new slide ${to + 1}…`;
        yield run();
        const outline = state.parts.map((t, i) => `${i + 1}. ${titleOfText(t)}`).join("\n");
        const reply = yield* stream(`${o.id}:deckadd:${nextId}`, [{ role: "system", content: `${SLIDE_WRITER}\n${formatNote}` }, { role: "user", content: `The user asked:\n${asked.slice(0, 1500)}\n\nThe presentation so far:\n${outline}\n\nWrite one new slide, which comes after slide ${to}: ${op.what}. Send only that slide, in the form shown, starting with # and the title.` }], undefined, (t) => {
          let s: Slide | null = null;
          try { s = parseSlideReply(t); } catch { /* cut in the middle of a line */ }
          return s && s.title.trim() ? show({ at: to, text: slideSource(s).trim() }) : null;
        });
        let s = parseSlideReply(reply);
        if (!s) { end(g, "error", "no slide came back"); step.status = "error"; yield run(); say("Je n’ai pas réussi à écrire la nouvelle diapo.", "I could not write the new slide."); continue; }
        if (slideProblems(s).length) s = trimSlide(s);
        const id = nextId++;
        state.parts.splice(to, 0, slideSource(s).trim());
        ids.splice(to, 0, id);
        touched.add(id);
        end(g, "done", s.title.slice(0, 50));
        yield show();
        yield run();
        yield* screenshot(step, to);
        step.status = "done";
        say(`J’ai ajouté la diapo ${to + 1} : « ${s.title} ».`, `I added slide ${to + 1}: “${s.title}”.`);
        yield run();
      } else if (op.op === "theme") {
        const step = stepFor(fr ? "Apparence" : "Look", "changing the look of every slide");
        const g = begin(step.stages!, "edit", "Look", `looking for “${op.what}”`, "App");
        phase = "Changing the look…";
        yield run();
        const found = findTheme(op.what);
        if (found) state.head = `Theme: ${found.id}`;
        else {
          // words no theme matches: the line of the Theme is changed by the model, like any other text
          g.agent = "Editor";
          g.model = o.modelOf?.();
          const next = yield* changeText(0, state.head || "Theme: clean", op.what, g);
          if (next && /^theme\s*:/i.test(next)) state.head = next.split("\n")[0].trim();
          else { end(g, "error", "no look came back"); step.status = "error"; yield run(); say("Je n’ai pas réussi à changer l’apparence.", "I could not change the look."); continue; }
        }
        end(g, "done", state.head.slice(0, 60));
        step.status = "done";
        say("J’ai changé l’apparence de toute la présentation.", "I changed the look of the whole presentation.");
        yield show();
        yield run();
      }
    } catch (e) {
      if (o.signal?.aborted) throw e;
      for (const s of steps) { if (s.status === "running") { s.status = "error"; s.note = (e as Error).message; } for (const g of s.stages ?? []) if (g.status === "running") end(g, "error", (e as Error).message); }
      say("Une des modifications a échoué ; le reste de la présentation n’a pas bougé.", "One of the changes failed; the rest of the presentation is untouched.");
      yield show();
    }
  }
  for (const s of steps) if (s.status === "running" || s.status === "waiting") s.status = "done";

  const done = said.length ? said.join(" ") : (fr ? "Rien n’a changé." : "Nothing changed.");
  phase = "";
  yield run("done");
  const text = `${artifact()}\n\n${done}`;
  yield { id: o.id, type: "replace", text };
  return { handled: true, text, stats: total };
}
