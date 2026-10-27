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
  /** More of the page, to append to what was shown. */
  | { type: "chunk"; text: string }
  | { type: "warn"; text: string }
  /** Something the session behind a call produced, to pass on as it is (the live strip of the card). */
  | { type: "relay"; value: unknown };

export interface XHost {
  /** One session of its own; yields what to relay while it runs and returns its whole reply. */
  ask(sid: string, messages: ChatMessage[], label: string): AsyncGenerator<unknown, string>;
  /** Characters a session can take next to its instructions. */
  room: number;
  aborted?: () => boolean;
}

export interface XResult { html: string; warnings: string[]; calls: number; outline: XOutline }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const tailOf = (s: string, n: number) => (s.length > n ? s.slice(s.length - n) : s);

export const OUTLINE_INSTRUCTIONS = `You plan a game that will be written in small steps. Reply with lines only, in exactly this form, with no explanation:
STYLE: one line on the look (mood, palette)
STATE: the numbers the game keeps, like lives=3, score=0
SECTION: <short title> | <blocks it uses, from the list, or none> | <topic>; <topic>; <topic>
ART: <name> | <width>x<height> | <what it looks like>
The sections are the screens and panels the game is made of: a title screen, each level or area, the HUD, the end screens. List every one the game needs, as many as it takes. The ART lines are the objects to draw (the hero, each kind of enemy, the things to collect), each with a size in pixels.
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

export const WRITE_INSTRUCTIONS = (docs: string) => `You write one part of a game page made of blocks. Reply with only the HTML of the task, and a <style> block when it needs CSS. No <html>, <head>, <body>, <script> and no scene tag around it: the section is already a scene. Use only the tags, effects and tests of the reference, spelled exactly as shown. Use the names already defined (states, scenes, classes, colour variables) instead of making up new ones. Draw nothing yourself: drawn objects are placed with <x-art of="name"></x-art> or, in a legend, with the look art:name.
${docs}`;

const LOOK_INSTRUCTIONS = "You write the base CSS of a whole game page: :root variables for the colours and fonts (name them for their use, like --bg, --text, --accent, and one per colour shared by several drawn objects), body, buttons, panels, the HUD. Reply with one <style> block and nothing else.";

const REPAIR_INSTRUCTIONS = (docs: string) => `You correct one part of a game page made of blocks. Reply with the whole corrected part only, same rules as before: only HTML (and a <style> block if needed), no wrapper, no script. Change only what the problems name.\n${docs}`;

const ARTIST_INSTRUCTIONS = "You draw one object for a game as SVG. Reply with one <svg> element and nothing else: viewBox 0 0 W H for the size you are given, simple shapes (rect, circle, ellipse, path, polygon, line), no text, no script, no images. Give it character: outlines, a highlight, a shadow, the details that make it recognisable (eyes, beak, buttons). For a colour that other objects share, write fill=\"var(--name, #fallback)\" with a name from the palette list; other colours are plain.";

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

const assetTag = (a: XArt, svg: string) => `<x-asset name="${a.name}" size="${a.w}x${a.h}" about="${a.about.replace(/"/g, "'")}" style="display:none">\n${svg}\n</x-asset>`;

function cssVarsOf(css: string): string[] { return [...new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))]; }

// ------------------------------------------------------------------ the build

export async function* buildXPage(request: string, host: XHost): AsyncGenerator<XEvent, XResult> {
  let calls = 0;
  const warnings: string[] = [];
  const warn = (text: string) => { warnings.push(text); return { type: "warn", text } as XEvent; };
  const stop = () => { if (host.aborted?.()) throw new Error("aborted"); };
  const wordBlocks = blocksFor(request);
  const docRoom = Math.max(1500, Math.floor(host.room * 0.35));
  const localRoom = Math.max(600, Math.floor(host.room * 0.2));

  /** A call, passed on as it runs; an empty answer is asked once more with a plainer request, then given up (null). */
  async function* call(label: string, system: string, user: string, again?: string): AsyncGenerator<XEvent, string | null> {
    for (const [i, content] of [user, again].entries()) {
      if (content === undefined) break;
      stop();
      calls++;
      const messages: ChatMessage[] = [{ role: "system", content: system }, { role: "user", content }];
      yield { type: "note", text: i ? `${label} (again)` : label };
      const gen = host.ask(`${label}:${calls}`, messages, label);
      let reply = "";
      for (;;) {
        const r = await gen.next();
        if (r.done) { reply = r.value; break; }
        yield { type: "relay", value: r.value };
      }
      if (reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim()) return reply;
    }
    return null;
  }

  // 1. the look comes first: the page starts styled (the base CSS is the first thing shown), so what is added after it never shows in default fonts
  const css: string[] = [];
  const lookReply = yield* call("Look", LOOK_INSTRUCTIONS, `The game: ${clip(request.trim(), 900)}`);
  let lookCss = lookReply ? mendFragment(lookReply, { scenes: [], states: [] }).css : "";
  if (!lookCss) { lookCss = ":root { --bg: #10151f; --text: #eef2f8; --accent: #f5b83d; }\nbody { margin: 0; background: var(--bg); color: var(--text); font: 16px system-ui, sans-serif; }"; yield warn("no base CSS came back: a plain one is used"); }
  lookCss += "\nhtml, body { min-height: 100vh; }"; // so a background reaches the whole window even while the page is empty
  css.push(lookCss);
  let page = `<!doctype html>\n<html><head><meta charset="utf-8"><title>Game</title>\n<style>\n${lookCss}\n</style></head>\n<body>\n`;
  yield { type: "chunk", text: page };
  const palette = () => cssVarsOf(css.join("\n")).join(", ") || "none yet";

  // 2. outline --------------------------------------------------------------
  const outlineReply = yield* call("Outline", `${OUTLINE_INSTRUCTIONS}\nExample of the form:\n${OUTLINE_EXAMPLE}`, `The game to plan:\n${clip(request.trim(), 1800)}\nIts look: ${clip(lookCss.replace(/\s+/g, " "), 300)}`);
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
  // the numbers the game keeps are declared at once, so a page seen while it is written already has them
  const declared = { ...outline.state };
  const stateNow = `${stateTag(declared)}\n`;
  page += stateNow; yield { type: "chunk", text: stateNow };

  // a block the outline asked for that does not exist: asked firmly, three times, before anything new is made
  for (const wanted of outline.wanted.slice(0, 2)) {
    let none = 0;
    for (let i = 0; i < 3; i++) {
      const r = yield* call(`Does "${wanted}" exist?`, EXISTS_INSTRUCTIONS(catalogText()), `The game: ${clip(request, 400)}\nThe need: a block called "${wanted}".`);
      if (r && /^\s*NONE\b/im.test(r)) none++;
    }
    yield warn(none >= 2 ? `"${wanted}" is not in the library: it is written from the core (lists, rules, effects)` : `"${wanted}" is covered by the library`);
  }

  // 3. drawings: each object is drawn apart, by a drawer that sees only it, and is shown (hidden) as soon as it exists
  const assets = new Map<string, string>();
  for (const a of outline.art.slice(0, 16)) {
    const reply = yield* call(`Drawing ${a.name}`, ARTIST_INSTRUCTIONS, `Object: ${a.name}\nSize: ${a.w}x${a.h}\nLooks like: ${a.about}\nPalette: ${palette()}`);
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
    const docs = docFor(sec.blocks, docRoom);
    yield { type: "note", text: `Section: ${sec.title}` };
    const open = sec.kind === "screen" ? `<x-scene id="${sec.id}">\n` : `<div id="${sec.id}" class="overlay">\n`;
    const close = sec.kind === "screen" ? "</x-scene>\n" : "</div>\n";
    page += open; yield { type: "chunk", text: open };
    let mine = "";

    // the tasks of the section
    let tasks = sec.topics;
    if (sec.topics.length > 2) {
      const r = yield* call(`Tasks of ${sec.title}`, DETAIL_INSTRUCTIONS, `The game: ${clip(request, 600)}\nSection: ${sec.title}\nBlocks it uses: ${sec.blocks.join(", ") || "none"}\nTopics: ${sec.topics.join("; ")}`);
      const listed = r ? parseTasks(r) : [];
      if (listed.length) tasks = listed; else yield warn(`no task list came back for ${sec.title}: its topics are the tasks`);
    }
    if (!tasks.length) tasks = [sec.title];

    for (const task of tasks) {
      stop();
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
      if (reply === null) { yield warn(`"${task}" could not be written: left out`); const stub = `<!-- left out: ${task.replace(/--/g, "-")} -->\n`; mine += stub; page += stub; yield { type: "chunk", text: stub }; continue; }
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
      mine += piece; page += piece; yield { type: "chunk", text: piece };
    }
    page += close; yield { type: "chunk", text: close };
  }

  // 5. the end of the page: the numbers the sections used without declaring them (the others were declared at the start, so the page seen while it was written already had them)
  const missing = statesUsed(page).filter((n) => !(n in declared));
  for (const n of missing) declared[n] = 0;
  const tail = `${missing.length ? `${stateTag(Object.fromEntries(missing.map((n) => [n, 0])))}\n` : ""}</body></html>\n`;
  page += tail; yield { type: "chunk", text: tail };
  if (missing.length) yield { type: "note", text: `declared ${missing.join(", ")}` };
  const left = xFlaws(page);
  for (const f of left.slice(0, 8)) yield warn(f);
  return { html: page, warnings, calls, outline };
}
