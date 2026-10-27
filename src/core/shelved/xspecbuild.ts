/**
 * SHELVED: nothing imports this file (see `xspec.ts` in this folder).
 */
/**
 * The page of a platformer, made in few steps: the game described by the model (one closed form), the level (another), then the
 * page written by `xspec.ts`, then the drawings one by one (the hero first: it sets the manner of the others), each shown the
 * moment it exists. Two or three calls before anything is drawn, and none of them writes markup.
 */
import type { ChatMessage } from "../../shared/types";
import { assetTag, cleanSvg, xcall, type XEvent, type XHost, type XResult } from "../xbuild";
import { nearestName } from "../xplan";
import { ART_SHEET_INSTRUCTIONS, LEVEL_INSTRUCTIONS, LEVEL_SCHEMA, SPEC_INSTRUCTIONS, SPEC_SCHEMA, SPEC_TAIL, joinLevels, levelEnd, levelFrom, markOf, normalizeLevel, normalizeSpec, readMark, renderHead, renderScenes, renderState, specFrom, styleCardOf, svgBlocks, type GameSpec, type Level, type SpecArt } from "./xspec";
import { xFlaws } from "../xcheck";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** What stands in for a drawing that did not come: the colour of its kind, so the game still looks like one. */
const fallbackLook = (spec: GameSpec, a: SpecArt): string => {
  const p = spec.palette;
  switch (a.role) {
    case "enemy": case "flyer": case "spike": return p.enemy;
    case "brick": return p.brick; case "block": return p.block; case "ground": return p.ground; case "platform": return p.platform; case "pipe": return p.pipe;
    case "coin": return p.coin; case "flag": return p.flag; case "spring": return p.accent;
    default: return "";
  }
};

export async function* buildSpecPage(request: string, host: XHost): AsyncGenerator<XEvent, XResult> {
  const warnings: string[] = [];
  const warn = (text: string): XEvent => { warnings.push(text); return { type: "warn", text }; };
  const counter: { n: number; act?: "skip" | "back" } = { n: 0 };
  const call = (label: string, system: string, user: string, schema?: object) => xcall(host, counter, label, system, user, undefined, schema);

  const mark = host.resume ? (readMark(host.resume, "x-build") as { spec?: unknown } | null) : null;
  let page = "";
  let spec: GameSpec;
  let level: Level | null = null;

  if (host.resume && mark?.spec) {
    spec = normalizeSpec(mark.spec, request);
    page = host.resume.replace(/\s*<\/body>\s*<\/html>\s*$/i, "\n").replace(/<!--\s*\/x-build\s*-->\s*$/, "");
    const stored = readMark(page, "x-level");
    if (stored) level = normalizeLevel(stored).level;
    if (!["title", "win", "over", "level_1"].every((id) => page.includes(`<x-scene id="${id}">`))) { const i = page.indexOf("<x-scene"); if (i >= 0) page = page.slice(0, i); }
    yield { type: "note", text: "Taking up where it stopped" };
    yield { type: "chunk", text: page };
  } else {
    const reply = yield* call("Design", SPEC_INSTRUCTIONS, `The player's request:\n${clip(request.trim(), 1800)}`, SPEC_SCHEMA);
    const read = specFrom(reply, request);
    spec = read.spec;
    if (!read.ok) yield warn("the design did not come back as a form: a standard one is used");
    page = renderHead(spec) + renderState(spec) + markOf("x-build", { request: request.trim(), spec });
    yield { type: "chunk", text: page };
  }

  if (!level) {
    // the level is written in parts when it is long (the model says "more"): each part sees only the end of what exists, never all of it
    const names = spec.art.filter((a) => a.role === "enemy" || a.role === "flyer").map((a) => a.name);
    const base = `The player's request:\n${clip(request.trim(), 1200)}\nThe game: ${spec.title}. Lives: ${spec.lives}. ${spec.time ? `Time: ${spec.time} seconds.` : "No time limit."}${names.length ? ` Enemies with a drawing: ${names.join(", ")} (name them in "name").` : ""}`;
    const parts: Level[] = [];
    for (let n = 0; n < 40; n++) {
      const so = parts.length ? joinLevels(parts) : null;
      const reply = yield* call(n ? `Level (part ${n + 1})` : "Level", LEVEL_INSTRUCTIONS, so ? `${base}\n\nThis is part ${n + 1} of the level. What exists: ${levelEnd(so)}. Write the next part: x starts again at 0 and its ground starts at 0, with the same rhythm and a little more difficulty. Set "more" to true if the level goes on after this part; the last part ends with the flag.` : base, LEVEL_SCHEMA);
      const read = levelFrom(reply, n === 0);
      if (!read.ok) {
        if (n === 0) { yield warn("the level did not come back usable: a standard level is used"); parts.push(read.level); }
        else { yield warn(`part ${n + 1} of the level did not come back usable: the level ends here`); parts.push(normalizeLevel({ width: 12, ground: [{ from: 0, to: 11 }], things: [{ kind: "flag", x: 8, y: 0 }, { kind: "coin", x: 3, y: 2 }, { kind: "coin", x: 4, y: 2 }] }, { first: false, final: true }).level); }
        break;
      }
      parts.push(read.level);
      if (!read.more) break;
    }
    level = joinLevels(parts);
    const piece = markOf("x-level", level);
    page += piece; yield { type: "chunk", text: piece };
  }

  if (!["title", "win", "over", "level_1"].every((id) => page.includes(`<x-scene id="${id}">`))) {
    yield { type: "note", text: "Assembling the page" };
    for (const s of renderScenes(spec, level)) { page += s.html; yield { type: "chunk", text: s.html }; }
  }

  // the drawings: ONE reply draws every object, in the same style, hero first; each drawing is put in the page the moment its svg is closed,
  // so the game (already playable in the palette's plain shapes) takes its pictures one by one, and no object costs a call of its own
  const have = new Set([...page.matchAll(/<x-asset name="([^"]+)"/g)].map((m) => m[1]));
  const card = styleCardOf(spec);
  const palette = Object.entries(spec.palette).map(([k, v]) => `--${k}: ${v}`).join("; ");
  async function* sheet(label: string, todo: SpecArt[]): AsyncGenerator<XEvent> {
    if (host.aborted?.()) throw new Error("aborted");
    counter.n++;
    yield { type: "note", text: label };
    const drawn = [...page.matchAll(/<x-asset name="[^"]+"[^>]*>\n([\s\S]*?)\n<\/x-asset>/g)].map((m) => m[1]);
    const refs = drawn.length ? [drawn[0], ...(drawn.length > 1 ? [drawn[drawn.length - 1]] : [])] : [];
    const user = `Style card (every drawing follows it exactly):\n${card}\n${refs.length ? `\nAlready drawn, by the same hand (match its line weight, shading and detail):\n${refs.map((r) => clip(r, 1800)).join("\n")}\n` : ""}\nThe game: ${spec.title}, ${spec.mood}\nPalette: ${palette}\n\nThe objects, in this order:\n${todo.map((a) => `- ${a.name} (${a.w}x${a.h}): ${a.about}`).join("\n")}`;
    const messages: ChatMessage[] = [{ role: "system", content: ART_SHEET_INSTRUCTIONS }, { role: "user", content: user }];
    let latest = "";
    let used = 0;
    const flush = function* (text: string): Generator<XEvent> {
      const blocks = svgBlocks(text);
      for (let i = used; i < blocks.length; i++) {
        const b = blocks[i];
        // by its comment; a name the game does not know is an unlabelled one (the next object in order); a known one that is already drawn is skipped
        const near = b.name ? nearestName(b.name, spec.art.map((x) => x.name)) : null;
        const named = b.name ? spec.art.find((a) => a.name === b.name || a.name === near) : undefined;
        const art = named ? todo.find((a) => a.name === named.name) : todo.find((a) => !have.has(a.name));
        used = i + 1;
        if (!art || have.has(art.name)) continue;
        const svg = cleanSvg(b.svg, art.w, art.h);
        if (!svg) continue;
        have.add(art.name);
        const tag = `${assetTag({ name: art.name, w: art.w, h: art.h, about: art.about }, svg)}\n`;
        page += tag;
        yield { type: "chunk", text: tag };
      }
    };
    const gen = host.ask(`${label}:${counter.n}`, messages, label, undefined, (t) => { latest = t; });
    let reply = "";
    try {
      for (;;) {
        const r = await gen.next();
        if (r.done) { reply = r.value; break; }
        yield { type: "relay", value: r.value };
        yield* flush(latest);
      }
    } catch (e) {
      if (host.aborted?.() || /aborted/i.test((e as Error).message)) throw e;
      yield warn(`${label}: the session failed (${(e as Error).message})`);
    }
    const act = host.control?.();
    if (act) { counter.act = act; return; }
    yield* flush(reply || latest);
  }
  // a long list of objects is drawn in several replies, so no reply outgrows the window; each one is shown the first drawing and the latest one, never all
  const room = Math.max(3000, host.room);
  const perReply = Math.max(3, Math.floor((room * 0.3) / 1100));
  const run = async function* (list: SpecArt[], title: string): AsyncGenerator<XEvent> {
    const batches: SpecArt[][] = [];
    for (let i = 0; i < list.length; i += perReply) batches.push(list.slice(i, i + perReply));
    for (const [k, batch] of batches.entries()) yield* sheet(batches.length > 1 ? `${title} (${k + 1} of ${batches.length})` : title, batch);
  };
  const first = spec.art.filter((a) => !have.has(a.name));
  yield* run(first, "Drawing the objects");
  const again = first.filter((a) => !have.has(a.name));
  if (again.length && again.length < first.length) yield* run(again, "Drawing what is left");
  const missing = spec.art.filter((a) => !have.has(a.name));
  for (const a of missing) yield warn(`${a.name} could not be drawn: the game draws its own`);

  // a drawing that never came: the legend takes the colour of its kind instead of pointing at nothing (the page is shown again once)
  if (missing.length) {
    let fixed = page;
    for (const a of missing) { const look = fallbackLook(spec, a); fixed = fixed.replace(new RegExp(` art:${a.name}(?![\\w-])`, "g"), look ? ` ${look}` : ""); }
    if (fixed !== page) { yield { type: "retract", chars: page.length }; page = fixed; yield { type: "chunk", text: page }; }
  }

  page += SPEC_TAIL; yield { type: "chunk", text: SPEC_TAIL };
  for (const f of xFlaws(page).slice(0, 8)) yield warn(f);
  const outline = {
    style: spec.mood, state: { lives: spec.lives, score: 0, coins: 0, time: spec.time },
    sections: ["title", "level_1", "win", "over"].map((id) => ({ id, title: id, kind: "screen" as const, blocks: id === "level_1" ? ["platformer"] : [], topics: [] })),
    wanted: [], art: spec.art.map((a) => ({ name: a.name, w: a.w, h: a.h, about: a.about }))
  };
  return { html: page, warnings, calls: counter.n, outline };
}
