/**
 * A page of blocks written in many short sessions, so that a small model never has to hold the whole game in mind.
 *
 *   1. Look       one call: the base CSS and its colour variables, shown at once, so the page starts styled
 *   2. Outline    one call: the numbers the game keeps (declared at once), the sections (screens and panels) with the blocks each uses, the objects to draw
 *   3. Drawings   one call per object, by a drawer that sees only that object (name, size, description, the palette)
 *   4. Sections   for each section, the list of tasks (one call, skipped when the section is simple), then one call per task, in order;
 *                 a task's CSS comes just before its markup
 *   5. Mending    after every task, in code: the fragment is replaced by the right form (tags, effects, names), and when the checker still
 *                 finds something in what the task wrote, that task alone is written again once with the exact problems
 *
 * Every call gets the same short frame (the request, the outline, the names defined so far, read from the page itself, never from a
 * model), its own task, the page of each block it uses, and the end of its own section; never the whole page. The page grows
 * only at its end, and every piece is complete HTML with its CSS before it, so the preview built from it shows the game taking shape. A call that comes back empty twice is replaced by a stub and the build goes
 * on: it never stops half-way. The model is never trusted with a name: names are checked against what exists and replaced by the closest.
 */
import type { ChatMessage } from "../shared/types";
import { blocksFor, catalogText, docFor } from "./xdocs";
import { XArt, XOutline, bibleOf, defaultOutline, mendFragment, parseOutline, parseTasks, slug, stateTag, statesUsed } from "./xplan";
import { xFlaws } from "./xcheck";

export type XEvent =
  | { type: "note"; text: string }
  | { type: "retract"; chars: number }
  /** A line for the log only. */
  | { type: "log"; text: string }
  /** More of the page, to append to what was shown. */
  | { type: "chunk"; text: string }
  | { type: "warn"; text: string }
  /** A change of a request that has several begins (n of total): each is its own step. */
  | { type: "step"; n: number; total: number; text: string }
  /** Something the session behind a call produced, to pass on as it is (the live strip of the card). */
  | { type: "relay"; value: unknown };

export interface XHost {
  /** One session of its own; yields what to relay while it runs and returns its whole reply. */
  ask(sid: string, messages: ChatMessage[], label: string, schema?: object, onText?: (text: string) => void): AsyncGenerator<unknown, string>;
  /** Characters a session can take next to its instructions. */
  room: number;
  aborted?: () => boolean;
  /** What the person asked for on the step in progress, once: leave it out (`skip`) or write the one before it again (`back`). */
  control?: () => "skip" | "back" | undefined;
  /** The text of a page this build stopped on: it goes on from the first section that was not finished instead of starting again. */
  resume?: string;
}

const BUILD_MARK = /<!--\s*x-build\s*([\s\S]*?)-->/;
/** What a page of blocks keeps of how it was planned, so a build that was stopped can be taken up again. */
export function readBuild(html: string): { request: string; outline: string; style?: string } | null {
  const m = BUILD_MARK.exec(html);
  if (!m) return null;
  try { const j = JSON.parse(m[1]); return typeof j.request === "string" ? { request: j.request, outline: typeof j.outline === "string" ? j.outline : "", style: typeof j.style === "string" ? j.style : undefined } : null; } catch { return null; }
}
/** A page of blocks this build began and did not finish. */
export const resumable = (html: string): boolean => !!readBuild(html) && !/<!--\s*\/x-build\s*-->/.test(html);

export interface XResult { html: string; warnings: string[]; calls: number; outline?: XOutline }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const tailOf = (s: string, n: number) => (s.length > n ? s.slice(s.length - n) : s);

export const OUTLINE_INSTRUCTIONS = `You plan a game that will be written in small steps. Reply with lines only, in exactly this form, with no explanation:
STYLE: one line on the look (mood, palette)
STATE: the numbers the game keeps, like lives=3, score=0
SECTION: <short title> | <blocks it uses, from the list, or none> | <topic>; <topic>; <topic>
ART: <name> | <width>x<height> | <what it looks like>
The sections are the screens and panels the game is made of: a title screen, each level or area, the HUD, the end screens. List every one the game needs, as many as it takes. The ART lines are the objects of the game world that need a picture: the hero, each kind of enemy, and the pieces of the level (a brick, a pipe, a coin, a flag...), each at the size of ONE object (usually 16 to 64 pixels, never a whole row or the whole level). Text, numbers, buttons, panels and the HUD are HTML and CSS, never ART.
Blocks available:
${catalogText()}`;

export const OUTLINE_EXAMPLE = `STYLE: bright, flat colours, blue sky
STATE: lives=3, score=0, time=200
SECTION: Title | none | the title; a play button; the keys
SECTION: Level 1 | platformer, timer | ground and pits; bricks and question blocks; two kinds of enemy; the flag
SECTION: HUD | none | score, lives and time at the top
SECTION: Game over | none | a retry button
ART: hero | 28x36 | a small hero in a red cap, seen from the side`;

const DETAIL_INSTRUCTIONS = "You list what has to be written for one section of a game page, one item per line, each line starting with '- '. An item is one thing written in one go: a panel, a button, a map, a conversation, a fight, a piece of text. Say which element carries it. No explanation, no code.";

export const WRITE_INSTRUCTIONS = (docs: string) => `You write one part of a game page made of blocks. Reply with only the HTML of the task, and a <style> block when it needs CSS. No <html>, <head>, <body>, <script> and no scene tag around it: the section is already a scene. Use only the tags, effects and tests of the reference, spelled exactly as shown. Use the names already defined (states, scenes, classes, colour variables) instead of making up new ones. Write only the tags of the reference and ordinary HTML: a name from the drawn objects or the outline is not a tag. Draw nothing yourself: drawn objects are placed with <x-art of="name"></x-art> or, in a legend, with the look art:name. Style buttons, panels and text with the classes the base CSS already defines (.btn, .panel, .hud...), adding a rule only for what is new. Match the weight of the task: a button is a button and a menu screen is a few elements; do what the task asks, in the look of the game, no more and no less.
${docs}`;

const LOOK_INSTRUCTIONS = "You write the base CSS of a whole game page: :root variables for the colours and fonts (name them for their use, like --bg, --text, --accent, and one per colour shared by several drawn objects), body, and the classes every section will reuse once: .btn (buttons), .panel, .hud, .title, given the look of the game (rounded or square like its style, outline, palette colours). Do not style the game world (the player, enemies, tiles, blocks, pipes, ground, clouds): blocks and drawings make those. No fixed width or height for the page and no centring box: the game fills the window. Reply with one <style> block and nothing else.";

export const REPAIR_INSTRUCTIONS = (docs: string) => `You correct one part of a game page made of blocks. Reply with the whole corrected part only, same rules as before: only HTML (and a <style> block if needed), no wrapper, no script. Change only what the problems name.\n${docs}`;

export const ARTIST_INSTRUCTIONS = "You draw one object for a game as SVG, in the style card you are given. Reply with one <svg> element and nothing else: viewBox 0 0 W H for the size you are given (the size of one object, not of a whole row or level), simple shapes (rect, circle, ellipse, path, polygon, line), no text, no script, no images. Follow the style card to the letter so that this drawing looks like the ones before it: the same outline width and colour, the same shading, the same level of detail. Give it what makes it readable and recognisable (a pipe has a wider rim and a darker side that gives it relief, a creature has eyes) and stop there: a drawing is a quick job. For a colour that other objects share, write fill=\"var(--name, #fallback)\" with a name from the palette list; other colours are plain.";

export const STYLE_CARD_INSTRUCTIONS = "You set the drawing style of a game once, so that every object drawn later looks as if it belongs to the same game. Reply with these lines only, one short line each: LINES: the outline width in pixels and its colour, like 2px #1d1d2b. SHAPES: rounded or angular, and how simplified. FILL: flat colours, or flat plus a lighter edge and a darker side for relief. PALETTE: five to eight colours as #hex in the family the game calls for. DETAIL: how detailed, from a bare silhouette to detailed, as the player asked or as the game's genre implies. Decide from the game described: add no detail the player did not ask for and leave out nothing that makes an object readable.";
export const DEFAULT_STYLE_CARD = "LINES: 2px #1d1d2b\nSHAPES: slightly rounded, simplified\nFILL: flat colours, a lighter top edge and a darker side on solid objects for relief\nDETAIL: simple, readable at a small size";
export const styleCardOf = (reply: string | null): string => {
  const lines = (reply ?? "").replace(/<think>[\s\S]*?<\/think>/g, " ").split("\n").map((l) => l.replace(/^[\s>*#\-\d.)]+/, "").replace(/\*\*/g, "").trim()).filter((l) => /^(lines|shapes|fill|palette|detail)\s*:\s*\S/i.test(l));
  return lines.length >= 3 ? lines.map((l) => l.replace(/^(\w+)\s*:\s*/, (_m, k: string) => `${k.toUpperCase()}: `)).join("\n") : DEFAULT_STYLE_CARD;
};

const EXISTS_INSTRUCTIONS = (catalog: string) => `A block exists if one of the listed blocks does the job with other settings, or if two listed blocks, or a list and a rule, do it together. Answer with one line: EXISTS <block name or the pair> or NONE <one short reason>. Say NONE only when no listed block and no pair of them can do it.\n${catalog}`;

// ------------------------------------------------------------------ small pieces

export const cleanSvg = (text: string, w: number, h: number): string | null => {
  const m = /<svg\b[\s\S]*?<\/svg\s*>/i.exec(text.replace(/<think>[\s\S]*?<\/think>/g, " "));
  if (!m) return null;
  let svg = m[0].replace(/<(script|foreignObject|iframe|image)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<(script|foreignObject|iframe|image)\b[^>]*\/>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "");
  svg = svg.replace(/\b(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "");
  if (!/<(rect|circle|ellipse|path|polygon|polyline|line|g)\b/i.test(svg)) return null;
  if (!/\bviewBox\s*=/i.test(svg)) svg = svg.replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`);
  return svg.trim();
};

/** An object that could not be drawn is still there: a plain rounded shape in the colour its name suggests, so the game never has a hole. */
export const plainArt = (a: XArt): string => `<svg viewBox="0 0 ${a.w} ${a.h}"><rect x="1" y="1" width="${a.w - 2}" height="${a.h - 2}" rx="${Math.round(Math.min(a.w, a.h) / 5)}" fill="var(--${slug(a.name)}, #8a94a6)" stroke="#222" stroke-width="2"/></svg>`;

export const assetTag = (a: XArt, svg: string) => `<x-asset name="${a.name}" size="${a.w}x${a.h}" about="${a.about.replace(/"/g, "'")}" style="display:none">\n${svg}\n</x-asset>`;

function cssVarsOf(css: string): string[] { return [...new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))]; }

/** One call, passed on as it runs (the notes and what the session produces); an empty answer is asked once more with a plainer request, then given up (null). */
export async function* xcall(host: XHost, counter: { n: number; act?: "skip" | "back" }, label: string, system: string, user: string, again?: string, schema?: object): AsyncGenerator<XEvent, string | null> {
  for (const [i, content] of [user, again].entries()) {
    if (content === undefined) break;
    if (host.aborted?.()) throw new Error("aborted");
    counter.n++;
    const messages: ChatMessage[] = [{ role: "system", content: system }, { role: "user", content }];
    yield { type: "note", text: i ? `${label} (again)` : label };
    const gen = host.ask(`${label}:${counter.n}`, messages, label, schema);
    let reply = "";
    try {
      for (;;) {
        const r = await gen.next();
        if (r.done) { reply = r.value; break; }
        yield { type: "relay", value: r.value };
      }
    } catch (e) {
      // a session the server cut off ("terminated") costs that session only: it is asked once more, then left to the caller's fallback
      if (host.aborted?.() || /aborted/i.test((e as Error).message)) throw e;
      yield { type: "warn", text: `${label}: the session failed (${(e as Error).message}), ${i ? "left out" : "asking again"}` };
      continue;
    }
    const act = host.control?.();
    if (act) { counter.act = act; return null; }
    if (reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim()) return reply;
  }
  return null;
}

// ------------------------------------------------------------------ the build

export async function* buildXPage(request: string, host: XHost): AsyncGenerator<XEvent, XResult> {
  const warnings: string[] = [];
  const warn = (text: string) => { warnings.push(text); return { type: "warn", text } as XEvent; };
  const stop = () => { if (host.aborted?.()) throw new Error("aborted"); };
  const wordBlocks = blocksFor(request);
  const docRoom = Math.max(1500, Math.floor(host.room * 0.35));
  const localRoom = Math.max(600, Math.floor(host.room * 0.2));

  /** A call, passed on as it runs; an empty answer is asked once more with a plainer request, then given up (null). */
  const counter: { n: number; act?: "skip" | "back" } = { n: 0 };
  const call = (label: string, system: string, user: string, again?: string) => xcall(host, counter, label, system, user, again);

  // 1. the look comes first: the page starts styled (the base CSS is the first thing shown), so what is added after it never shows in default fonts
  const css: string[] = [];
  const stored = host.resume ? readBuild(host.resume) : null;
  let page = "";
  let lookCss = "";
  if (stored) {
    page = host.resume!.replace(/\s*<\/body>\s*<\/html>\s*$/i, "\n");
    for (const m of page.matchAll(/<style>\n?([\s\S]*?)\n?<\/style>/g)) css.push(m[1]);
    yield { type: "note", text: "Taking up where it stopped" };
  } else {
    const lookReply = yield* call("Look", LOOK_INSTRUCTIONS, `The game: ${clip(request.trim(), 900)}`);
    lookCss = lookReply ? mendFragment(lookReply, { scenes: [], states: [] }).css : "";
    if (!lookCss) { lookCss = ":root { --bg: #10151f; --text: #eef2f8; --accent: #f5b83d; }\nbody { margin: 0; background: var(--bg); color: var(--text); font: 16px system-ui, sans-serif; }"; yield warn("no base CSS came back: a plain one is used"); }
    lookCss += "\nhtml, body { min-height: 100vh; }"; // so a background reaches the whole window even while the page is empty
    css.push(lookCss);
    page = `<!doctype html>\n<html><head><meta charset="utf-8"><title>Game</title>\n<style>\n${lookCss}\n</style></head>\n<body>\n`;
    yield { type: "chunk", text: page };
  }
  const palette = () => cssVarsOf(css.join("\n")).join(", ") || "none yet";

  // 2. outline --------------------------------------------------------------
  const outlineReply = stored ? stored.outline : yield* call("Outline", `${OUTLINE_INSTRUCTIONS}\nExample of the form:\n${OUTLINE_EXAMPLE}`, `The game to plan:\n${clip(request.trim(), 1800)}\nIts look: ${clip(lookCss.replace(/\s+/g, " "), 300)}`);
  let outline = outlineReply ? parseOutline(outlineReply) : null;
  if (!outline || outline.sections.length < 2) {
    yield warn(outline ? "the outline had fewer than two sections: the standard outline of this kind of game is used" : "the outline came back empty: the standard outline of this kind of game is used");
    const std = defaultOutline(request, wordBlocks);
    outline = { ...std, style: outline?.style || std.style, state: { ...std.state, ...(outline?.state ?? {}) }, art: outline?.art.length ? outline.art : std.art, wanted: outline?.wanted ?? [] };
  }
  if (!Object.keys(outline.state).length) outline.state = defaultOutline(request, wordBlocks).state;
  // the blocks the words call for are always used: when no section carries one, the first section that is not a title does
  for (const b of wordBlocks) {
    if (outline.sections.some((s) => s.blocks.includes(b))) continue;
    const target = outline.sections.find((s) => s.kind === "screen" && !/title|menu|game ?over|win|end|intro/i.test(s.title)) ?? outline.sections[0];
    target.blocks.push(b);
  }
  yield { type: "note", text: `${outline.sections.length} sections` };
  // one style card for every drawing: line weight, shading, palette, detail. It is made once, from the game, so the drawings belong together
  let styleCard = stored?.style ?? "";
  if (!styleCard) {
    const hero = outline.art.find((a) => /hero|player|character|main/i.test(a.name)) ?? outline.art[0];
    const reply = yield* call("Style", STYLE_CARD_INSTRUCTIONS, `The game: ${clip(request.trim(), 700)}\nIts look: ${outline.style || "not said"}\nColours of the page: ${cssVarsOf(css.join("\n")).join(", ") || "none yet"}${hero ? `\nThe main character: ${hero.about}` : ""}`);
    styleCard = styleCardOf(reply);
  }
  // the numbers the game keeps are declared at once, so a page seen while it is written already has them
  const declared = { ...outline.state };
  if (stored) {
    // the unfinished section and what came after it are written again; what is whole stays
    const done = new Set(outline.sections.filter((sec) => page.includes(`<!-- /${sec.id} -->`)).map((sec) => sec.id));
    const first = outline.sections.find((sec) => !done.has(sec.id));
    if (first) { const at = Math.max(page.indexOf(`<x-scene id="${first.id}">`), -1) >= 0 ? page.indexOf(`<x-scene id="${first.id}">`) : page.indexOf(`<div id="${first.id}" class="overlay">`); if (at >= 0) page = page.slice(0, at); }
    page = page.replace(/<!--\s*\/x-build\s*-->\s*$/, "");
    yield { type: "chunk", text: page };
  } else {
    const mark = `<!-- x-build ${JSON.stringify({ request: request.trim(), outline: outlineReply ?? "", style: styleCard }).replace(/--/g, "-\\u002d")} -->\n`;
    const stateNow = `${stateTag(declared)}\n${mark}`;
    page += stateNow; yield { type: "chunk", text: stateNow };
  }

  // a block the outline asked for that does not exist: asked firmly, three times, before anything new is made
  for (const wanted of stored ? [] : outline.wanted.slice(0, 2)) {
    let none = 0;
    for (let i = 0; i < 3; i++) {
      const r = yield* call(`Does "${wanted}" exist?`, EXISTS_INSTRUCTIONS(catalogText()), `The game: ${clip(request, 400)}\nThe need: a block called "${wanted}".`);
      if (r && /^\s*NONE\b/im.test(r)) none++;
    }
    yield warn(none >= 2 ? `"${wanted}" is not in the library: it is written from the core (lists, rules, effects)` : `"${wanted}" is covered by the library`);
  }

  // 3. drawings: each object is drawn apart, by a drawer that sees only it, and is shown (hidden) as soon as it exists
  const assets = new Map<string, string>();
  if (stored) for (const m of page.matchAll(/<x-asset name="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/x-asset>/g)) assets.set(m[1], m[2]);
  for (const a of outline.art) {
    if (assets.has(a.name)) continue;
    const ref = [...assets.values()].find((v) => !v.includes("#8a94a6"));
    const reply = yield* call(`Drawing ${a.name}`, ARTIST_INSTRUCTIONS, `Style card (every drawing follows it exactly):\n${styleCard}\n${ref ? `\nAlready drawn, match its line weight, shading and detail:\n${clip(ref, 1800)}\n` : ""}\nObject: ${a.name}\nSize: ${a.w}x${a.h}\nLooks like: ${a.about}\nPalette: ${palette()}`);
    const svg = reply ? cleanSvg(reply, a.w, a.h) : null;
    if (svg) assets.set(a.name, svg); else { assets.set(a.name, plainArt(a)); yield warn(`${a.name} could not be drawn: a plain shape stands in for it`); }
    const tag = `${assetTag(a, assets.get(a.name)!)}\n`;
    page += tag; yield { type: "chunk", text: tag };
  }

  // 4. the page, written section after section ---------------------------------
  const scenes = outline.sections.filter((s) => s.kind === "screen").map((s) => s.id);
  const artLine = () => (assets.size ? `Drawn objects (place them with <x-art of="name"></x-art>, or art:name in a legend): ${outline.art.filter((a) => assets.has(a.name)).map((a) => `${a.name} ${a.w}x${a.h} (${a.about})`).join("; ")}` : "");
  const outlineLine = () => outline!.sections.map((s) => `${s.id}${s.kind === "overlay" ? " (shown on every screen)" : ""}: ${s.title}`).join("\n");

  for (const sec of outline.sections) {
    stop();
    if (stored && page.includes(`<!-- /${sec.id} -->`)) continue;
    const docs = docFor(sec.blocks, docRoom);
    yield { type: "note", text: `Section: ${sec.title}` };
    const open = sec.kind === "screen" ? `<x-scene id="${sec.id}">\n` : `<div id="${sec.id}" class="overlay">\n`;
    const close = sec.kind === "screen" ? "</x-scene>\n" : "</div>\n";
    page += open; yield { type: "chunk", text: open };
    let mine = "";

    // the tasks of the section
    let tasks = sec.blocks.length ? sec.topics : [sec.topics.join("; ")].filter(Boolean); // a section with no block (a menu, an end screen) is one piece, written in one go
    if (sec.blocks.length && sec.topics.length > 2) {
      const r = yield* call(`Tasks of ${sec.title}`, DETAIL_INSTRUCTIONS, `The game: ${clip(request, 600)}\nSection: ${sec.title}\nBlocks it uses: ${sec.blocks.join(", ") || "none"}\nTopics: ${sec.topics.join("; ")}`);
      const listed = r ? parseTasks(r) : [];
      if (listed.length) tasks = listed; else yield warn(`no task list came back for ${sec.title}: its topics are the tasks`);
    }
    if (!tasks.length) tasks = [sec.title];

    // the pieces of this section already written, so the last can be taken back and written again
    const pieces: { text: string; css: boolean }[] = [];
    for (let ti = 0; ti < tasks.length; ti++) {
      const task = tasks[ti];
      stop();
      counter.act = undefined;
      const known = [...new Set([...Object.keys(declared), ...statesUsed(page)])];
      const frame = (extra = "") => [
        `The game: ${clip(request.trim(), 700)}`,
        `The outline:\n${outlineLine()}`,
        `Already defined:\n${bibleOf({ state: Object.fromEntries(known.map((k) => [k, 0])), scenes, body: page, css: css.join("\n"), style: outline!.style }, 800)}`,
        artLine(),
        mine ? `This section so far (its end):\n${tailOf(mine, localRoom)}` : "",
        `Section: ${sec.title} (${sec.id}), ${sec.kind === "screen" ? "a screen" : "a panel shown on every screen"}.`,
        extra
      ].filter(Boolean).join("\n\n");
      const reply = yield* call(`${sec.title}: ${clip(task, 50)}`, WRITE_INSTRUCTIONS(docs), `${frame()}\n\nWrite this: ${task}`, `Section: ${sec.title}. Write this, in the form of the reference: ${task}`);
      if (counter.act === "back") {
        counter.act = undefined;
        const last = pieces.pop();
        if (last) { page = page.slice(0, page.length - last.text.length); mine = mine.slice(0, Math.max(0, mine.length - last.text.length)); if (last.css) css.pop(); yield { type: "retract", chars: last.text.length }; ti = Math.max(-1, ti - 2); } else ti--;
        yield { type: "note", text: `${sec.title} (going back)` };
        continue;
      }
      if (reply === null) { yield warn(`"${task}" could not be written: left out`); const stub = `<!-- left out: ${task.replace(/--/g, "-")} -->\n`; mine += stub; page += stub; pieces.push({ text: stub, css: false }); yield { type: "chunk", text: stub }; continue; }
      let m = mendFragment(reply, { scenes, states: known });
      const before = new Set(xFlaws(page + close));
      const fresh = () => xFlaws(page + m.body + close).filter((f) => !before.has(f));
      let problems = fresh();
      if (problems.length) {
        const fixed = yield* call(`Correcting: ${clip(task, 40)}`, REPAIR_INSTRUCTIONS(docs), `${frame()}\n\nThe part as written:\n${m.body}\n\nProblems:\n${problems.map((p) => `- ${p}`).join("\n")}`);
        if (fixed) {
          const m2 = mendFragment(fixed, { scenes, states: known });
          if (m2.body) { const prev = m; m = { body: m2.body, css: m2.css || prev.css, fixed: m2.fixed }; problems = fresh(); }
        }
        if (problems.length) yield warn(`${sec.title} · ${clip(task, 40)}: ${problems[0]}`);
      }
      // its CSS comes just before it, so it is styled the moment it appears
      if (m.css) css.push(m.css);
      const piece = `${m.css ? `<style>\n${m.css}\n</style>\n` : ""}${m.body}\n`;
      mine += piece; page += piece; pieces.push({ text: piece, css: !!m.css }); yield { type: "chunk", text: piece };
    }
    const closing = `${close}<!-- /${sec.id} -->\n`;
    page += closing; yield { type: "chunk", text: closing };
  }

  // 5. the end of the page: the numbers the sections used without declaring them (the others were declared at the start, so the page seen while it was written already had them)
  const missing = statesUsed(page).filter((n) => !(n in declared));
  for (const n of missing) declared[n] = 0;
  const tail = `${missing.length ? `${stateTag(Object.fromEntries(missing.map((n) => [n, 0])))}\n` : ""}<!-- /x-build -->\n</body></html>\n`;
  page += tail; yield { type: "chunk", text: tail };
  if (missing.length) yield { type: "note", text: `declared ${missing.join(", ")}` };
  const left = xFlaws(page);
  for (const f of left.slice(0, 8)) yield warn(f);
  return { html: page, warnings, calls: counter.n, outline };
}
