/**
 * A platformer described, not written: the model fills two small closed forms (the game, and the level) and this file turns them
 * into the page of blocks, always the same right way. A small model never writes a tag, a legend or a style rule, so it cannot
 * invent a tag, repeat itself in markup or forget a name; it chooses what the game is (texts, colours, how things look, where
 * things are) and the app writes the buttons, the screens, the rules and the level rows.
 *
 *   spec    the title and texts, the palette, the line weight and shading, the lives and time, the objects worth a drawing of their own
 *   level   the length, the stretches of ground, and the things (brick, block, pipe, coin, enemy, flag...) with their place
 *
 * Both are read tolerantly (`normalizeSpec`, `normalizeLevel`): a missing or odd value is replaced by a sound default, and a level
 * that cannot be used is replaced by a standard one. Drawings are optional: what the model does not draw, the block draws itself
 * in the palette's colours.
 */
import { firstJson } from "./look";
import { slug } from "./xplan";

export const ART_ROLES = ["hero", "enemy", "flyer", "brick", "block", "ground", "platform", "pipe", "coin", "flag", "spike", "spring", "scenery"] as const;
export type ArtRole = (typeof ART_ROLES)[number];
export const THING_KINDS = ["brick", "block", "platform", "coin", "pipe", "enemy", "flyer", "spike", "spring", "checkpoint", "flag", "cloud", "hill", "bush", "water"] as const;
export type ThingKind = (typeof THING_KINDS)[number];

export interface SpecArt { role: ArtRole; name: string; about: string; w: number; h: number }
export interface GameSpec {
  title: string;
  howto: string;
  labels: { play: string; retry: string; win: string; over: string; lives: string; coins: string; score: string; time: string };
  mood: string;
  palette: Record<"sky" | "sky2" | "ground" | "brick" | "block" | "platform" | "pipe" | "coin" | "flag" | "accent" | "text" | "panel" | "hero" | "enemy", string>;
  line: { width: number; color: string };
  shapes: "rounded" | "angular";
  detail: "flat" | "simple" | "detailed";
  lives: number;
  time: number;
  coins: boolean;
  score: boolean;
  art: SpecArt[];
}
export interface Thing { kind: ThingKind; x: number; y: number; w: number; h: number; name?: string; gives?: "coin" | "mushroom" }
export interface Level { width: number; ground: { from: number; to: number }[]; things: Thing[]; start: number }

const str = (description: string) => ({ type: "string", description });
const int = (description: string, minimum?: number, maximum?: number) => ({ type: "integer", description, ...(minimum !== undefined ? { minimum } : {}), ...(maximum !== undefined ? { maximum } : {}) });

export const SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "palette", "art"],
  properties: {
    title: str("the name of the game, as shown on its title screen"),
    howto: str("one short line telling how to play, with the keys the player asked for"),
    labels: { type: "object", additionalProperties: false, properties: { play: str("the play button"), retry: str("the button to try again"), win: str("the message when the player wins"), over: str("the message when the player loses"), lives: str("the word for lives"), coins: str("the word for coins"), score: str("the word for score"), time: str("the word for time") } },
    mood: str("a few words on the look: colours, mood"),
    palette: {
      type: "object", additionalProperties: false,
      properties: Object.fromEntries(["sky", "sky2", "ground", "brick", "block", "platform", "pipe", "coin", "flag", "accent", "text", "panel", "hero", "enemy"].map((k) => [k, str(`#hex colour of the ${k}${k === "sky" ? " at the top" : k === "sky2" ? " near the horizon" : k === "accent" ? " (buttons, titles)" : k === "panel" ? " (menus, behind the text)" : ""}`)]))
    },
    line: { type: "object", additionalProperties: false, properties: { width: int("outline width in pixels for every drawing", 1, 6), color: str("#hex colour of the outlines") } },
    shapes: { type: "string", enum: ["rounded", "angular"] },
    detail: { type: "string", enum: ["flat", "simple", "detailed"], description: "how detailed the drawings are, as the player asked or as the genre suggests" },
    lives: int("lives at the start; 0 when the game has none", 0, 99),
    time: int("seconds on the clock; 0 when there is no time limit", 0, 9999),
    coins: { type: "boolean", description: "the game has coins to collect" },
    score: { type: "boolean", description: "the game keeps a score" },
    art: {
      type: "array", maxItems: 40,
      description: "the objects that get a drawing of their own: the hero, each kind of enemy, special things. Bricks, blocks, ground, platforms and pipes are drawn by the game in the palette: list them only when the player asked for a particular look",
      items: { type: "object", additionalProperties: false, required: ["role", "name", "about"], properties: { role: { type: "string", enum: [...ART_ROLES] }, name: str("short lowercase name"), about: str("what it looks like, one short sentence"), w: int("width in pixels (one tile is 32)", 8, 128), h: int("height in pixels", 8, 128) } }
    }
  }
};

export const LEVEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["width", "ground", "things"],
  properties: {
    width: int("length of the level in tiles, usually 60 to 120", 20, 400),
    ground: { type: "array", maxItems: 80, description: "the stretches of ground, left to right; what lies between two stretches is a hole to fall into. The first one starts at 0 and the last one reaches the end", items: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: int("first tile", 0, 400), to: int("last tile", 0, 400) } } },
    things: {
      type: "array", maxItems: 400,
      items: {
        type: "object", additionalProperties: false, required: ["kind", "x", "y"],
        properties: {
          kind: { type: "string", enum: [...THING_KINDS] },
          x: int("tile across, 0 is the left edge", 0, 400),
          y: int("tiles above the ground surface: 0 stands on the ground, 3 is a jump up", 0, 14),
          w: int("tiles wide, for a row of bricks, a platform, water or a pipe; 1 if left out", 1, 40),
          h: int("tiles tall, for a pipe; 1 if left out", 1, 8),
          name: str("for an enemy: the name of its drawing, when it has one"),
          gives: { type: "string", enum: ["coin", "mushroom"], description: "for a block: what comes out" }
        }
      }
    }
  }
};

export const SPEC_INSTRUCTIONS = `You design a small 2D platformer game from the player's request. Reply with one JSON object that follows the schema, and nothing else.
Write the title and the labels in the language of the request. Choose the palette for the game the player describes (a blue sky and green hills means a blue sky colour and green grounds). Choose one outline width and colour and one level of detail for every drawing, so that they all look like the same game.
Only things with a character of their own get an entry in "art": the hero and each kind of enemy (a size of 28 to 36 pixels). Bricks, question blocks, ground, platforms and pipes are drawn by the game in your palette, so leave them out.
Example of the form:
{"title":"Super Runner","howto":"Arrow keys to move, space to jump","labels":{"play":"Play","retry":"Try again","win":"You win!","over":"Game over","lives":"Lives","coins":"Coins","score":"Score","time":"Time"},"mood":"bright, flat, cheerful","palette":{"sky":"#5c94fc","sky2":"#bfe3ff","ground":"#b5651d","brick":"#c9622a","block":"#f4b73a","platform":"#9a5a2b","pipe":"#2ea043","coin":"#ffd23f","flag":"#2e7d32","accent":"#f5b83d","text":"#ffffff","panel":"#1d2433","hero":"#e53935","enemy":"#8b4a22"},"line":{"width":2,"color":"#1d1d2b"},"shapes":"rounded","detail":"simple","lives":3,"time":300,"coins":true,"score":true,"art":[{"role":"hero","name":"hero","about":"a small runner with a red cap and blue overalls, seen from the side","w":28,"h":36},{"role":"enemy","name":"goomba","about":"a brown mushroom with two eyes and two feet","w":28,"h":28}]}`;

export const ART_SHEET_INSTRUCTIONS = "You draw every object of a game one after the other, in one reply, all in the same style. For each object write a comment line with its name, like <!-- hero -->, then one <svg> element, then the next object. Each <svg> has viewBox 0 0 W H for the size given for that object, simple shapes (rect, circle, ellipse, path, polygon, line), no text, no script, no images. Follow the style card to the letter for ALL of them: the same outline width and colour, the same shading, the same level of detail, as if one hand drew them. Start with the first object: it sets the manner of the rest. Give each what makes it readable and recognisable (a pipe has a wider rim and a darker side that gives it relief, a creature has eyes), then move on: a quick job per object. For a colour shared by several objects write fill=\"var(--name, #fallback)\" with a name from the palette list; other colours are plain. Write nothing but the comments and the svg elements.";

export const LEVEL_INSTRUCTIONS = `You lay out the level of a 2D platformer. Reply with one JSON object that follows the schema, and nothing else.
Positions are in tiles: x counts from the left edge (0), y counts up from the ground surface (0 stands on the ground, 3 is about one jump up). The ground is given as stretches with holes between them. A level runs from the start on the left to a flag on the right, with a few holes, floating platforms and rows of bricks, question blocks (some give a mushroom), coins in lines or arcs, one or two pipes (w 1, h 2), enemies walking on the ground, and clouds and hills for scenery (kinds cloud and hill, high up or on the ground). Ease the player in: the first screen is empty ground and a first coin or block, the difficulty rises towards the flag, and the flag (kind flag, y 0) is near the right end on ground. Spread things along the whole length; do not stack many on one spot.
Example of the form:
{"width":80,"ground":[{"from":0,"to":27},{"from":31,"to":52},{"from":56,"to":79}],"things":[{"kind":"coin","x":8,"y":3},{"kind":"block","x":12,"y":3,"gives":"coin"},{"kind":"brick","x":14,"y":3,"w":3},{"kind":"block","x":15,"y":3,"gives":"mushroom"},{"kind":"enemy","x":20,"y":0},{"kind":"pipe","x":34,"y":0,"w":1,"h":2},{"kind":"platform","x":40,"y":4,"w":4},{"kind":"cloud","x":6,"y":9},{"kind":"hill","x":2,"y":0},{"kind":"flag","x":76,"y":0}]}`;

// ------------------------------------------------------------------ reading what the model said

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const hex = (v: unknown, dflt: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim() : dflt);
const text = (v: unknown, dflt: string, max = 80) => (typeof v === "string" && v.trim() ? v.trim().replace(/[<>]/g, "").slice(0, max) : dflt);
const whole = (v: unknown, dflt: number, lo: number, hi: number) => { const n = typeof v === "number" ? v : parseInt(String(v), 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt; };
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const DEFAULT_PALETTE: GameSpec["palette"] = { sky: "#5c94fc", sky2: "#bfe3ff", ground: "#b5651d", brick: "#c9622a", block: "#f4b73a", platform: "#9a5a2b", pipe: "#2ea043", coin: "#ffd23f", flag: "#2e7d32", accent: "#f5b83d", text: "#ffffff", panel: "#1d2433", hero: "#e53935", enemy: "#8b4a22" };

export function defaultSpec(request = ""): GameSpec {
  return normalizeSpec({}, request);
}

/** The game as the model described it, with every missing or odd value replaced: colours must be colours, numbers numbers, names usable. */
export function normalizeSpec(raw: unknown, request = ""): GameSpec {
  const o = rec(raw), lab = rec(o.labels), pal = rec(o.palette), line = rec(o.line);
  const palette = Object.fromEntries(Object.entries(DEFAULT_PALETTE).map(([k, d]) => [k, hex(pal[k], d)])) as GameSpec["palette"];
  const wants = (re: RegExp) => re.test(request);
  const art: SpecArt[] = [];
  for (const a of Array.isArray(o.art) ? o.art : []) {
    const r = rec(a), role = ART_ROLES.find((x) => x === r.role);
    const name = slug(text(r.name, ""));
    if (!role || !name || art.some((x) => x.name === name)) continue;
    const about = text(r.about, "", 160);
    if (!about || art.some((x) => x.about.toLowerCase() === about.toLowerCase())) continue; // one description copied onto several lines is one drawing
    const tile = role === "brick" || role === "block" || role === "ground" || role === "platform" || role === "coin" || role === "spike" || role === "spring" || role === "flag";
    art.push({ role, name, about, w: whole(r.w, tile ? 32 : 28, 8, 128), h: whole(r.h, tile ? 32 : role === "hero" ? 36 : 28, 8, 128) });
  }
  if (!art.some((a) => a.role === "hero")) art.unshift({ role: "hero", name: "hero", about: "the main character, seen from the side", w: 28, h: 36 });
  art.sort((a, b) => (a.role === "hero" ? -1 : 0) - (b.role === "hero" ? -1 : 0)); // the hero is drawn first: it sets the manner of the others
  const lives = whole(o.lives, 3, 0, 99);
  return {
    title: text(o.title, "Platformer", 60),
    howto: text(o.howto, "Arrow keys to move, space to jump", 120),
    labels: {
      play: text(lab.play, "Play", 24), retry: text(lab.retry, "Try again", 24), win: text(lab.win, "You win!", 40), over: text(lab.over, "Game over", 40),
      lives: text(lab.lives, "Lives", 16), coins: text(lab.coins, "Coins", 16), score: text(lab.score, "Score", 16), time: text(lab.time, "Time", 16)
    },
    mood: text(o.mood, "bright and cheerful", 100),
    palette,
    line: { width: whole(line.width, 2, 1, 6), color: hex(line.color, "#1d1d2b") },
    shapes: o.shapes === "angular" ? "angular" : "rounded",
    detail: o.detail === "flat" || o.detail === "detailed" ? o.detail : "simple",
    lives: lives || (o.lives === 0 || wants(/\bno lives?\b|sans vies?/i) ? 0 : 3),
    time: typeof o.time === "number" || typeof o.time === "string" ? whole(o.time, 300, 0, 9999) : wants(/\btime( limit)?\b|\btemps\b|\bchrono/i) ? 300 : 0,
    coins: o.coins === false ? false : true,
    score: o.score === false ? false : true,
    art
  };
}

export const specFrom = (reply: string | null, request = ""): { spec: GameSpec; ok: boolean } => {
  const j = reply ? firstJson(reply) : null;
  return { spec: normalizeSpec(j, request), ok: !!j && typeof j === "object" };
};

/** A standard level: ground with two holes, platforms and bricks, a question block with a mushroom, coins, a pipe, two enemies, clouds, a flag. */
export function defaultLevel(width = 80): Level {
  const w = Math.max(40, width), end = w - 1;
  const g = [{ from: 0, to: Math.round(w * 0.34) }, { from: Math.round(w * 0.34) + 3, to: Math.round(w * 0.66) }, { from: Math.round(w * 0.66) + 4, to: end }];
  const at = (f: number) => Math.round(w * f);
  const t = (kind: ThingKind, x: number, y: number, extra: Partial<Thing> = {}): Thing => ({ kind, x, y, w: 1, h: 1, ...extra });
  return {
    width: w, ground: g, start: 2,
    things: [
      t("coin", at(0.1), 3), t("coin", at(0.1) + 1, 3), t("block", at(0.15), 3, { gives: "coin" }), t("brick", at(0.17), 3, { w: 2 }), t("block", at(0.2), 3, { gives: "mushroom" }),
      t("enemy", at(0.27), 0), t("pipe", at(0.38), 0, { h: 2 }), t("platform", at(0.46), 4, { w: 4 }), t("coin", at(0.46), 5, { w: 4 }), t("enemy", at(0.55), 0),
      t("brick", at(0.6), 3, { w: 3 }), t("pipe", at(0.7), 0, { h: 3 }), t("enemy", at(0.78), 0), t("flag", w - 4, 0),
      t("cloud", 6, 10), t("cloud", at(0.4), 11), t("cloud", at(0.75), 10), t("hill", 1, 0), t("hill", at(0.5), 0)
    ]
  };
}

/** The level as the model laid it out, made playable: inside the level, ground under the start and the flag, a flag at all, no two things in one place. */
export function normalizeLevel(raw: unknown): { level: Level; ok: boolean } {
  const o = rec(raw);
  const width = whole(o.width, 80, 20, 400);
  const ground: { from: number; to: number }[] = [];
  for (const g of Array.isArray(o.ground) ? o.ground : []) {
    const r = rec(g), a = whole(r.from, 0, 0, width - 1), b = whole(r.to, a, 0, width - 1);
    if (b >= a) ground.push({ from: a, to: b });
  }
  ground.sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const g of ground) { const last = merged[merged.length - 1]; if (last && g.from <= last.to + 1) last.to = Math.max(last.to, g.to); else merged.push({ ...g }); }
  const things: Thing[] = [];
  const taken = new Set<string>();
  for (const th of Array.isArray(o.things) ? o.things : []) {
    const r = rec(th), kind = THING_KINDS.find((k) => k === r.kind);
    if (!kind) continue;
    const x = whole(r.x, 0, 0, width - 1), y = whole(r.y, 0, 0, 14);
    const w = kind === "flag" || kind === "enemy" || kind === "flyer" ? 1 : whole(r.w, 1, 1, 40), h = kind === "pipe" ? whole(r.h, 2, 1, 8) : 1;
    const key = `${kind}:${x}:${y}`;
    if (taken.has(key)) continue;
    taken.add(key);
    things.push({ kind, x, y, w: Math.min(w, width - x), h, name: typeof r.name === "string" ? slug(r.name) : undefined, gives: r.gives === "mushroom" ? "mushroom" : r.gives === "coin" ? "coin" : undefined });
  }
  const ok = merged.length > 0 && things.length >= 3;
  if (!ok) return { level: defaultLevel(width), ok: false };
  const cover = (a: number, b: number) => { if (!merged.some((g) => g.from <= a && g.to >= b)) merged.push({ from: a, to: b }); };
  cover(0, Math.min(5, width - 1));
  if (!things.some((t) => t.kind === "flag")) things.push({ kind: "flag", x: width - 4, y: 0, w: 1, h: 1 });
  const flag = things.find((t) => t.kind === "flag")!;
  cover(Math.max(0, flag.x - 2), Math.min(width - 1, flag.x + 2));
  merged.sort((a, b) => a.from - b.from);
  return { level: { width, ground: merged, things, start: 2 }, ok: true };
}

/** The drawings a reply holds so far, each complete: `<!-- name -->` then an `<svg>`. A name that is missing or unknown is left to the caller (null). */
export function svgBlocks(text: string): { name: string | null; svg: string }[] {
  const out: { name: string | null; svg: string }[] = [];
  const re = /(?:<!--\s*([^>]*?)\s*-->\s*)?(<svg\b[\s\S]*?<\/svg\s*>)/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ name: m[1] ? slug(m[1].split(/[:(,]/)[0]) : null, svg: m[2] });
  return out;
}

export const levelFrom = (reply: string | null): { level: Level; ok: boolean } => normalizeLevel(reply ? firstJson(reply) : null);

// ------------------------------------------------------------------ writing the page

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The drawing style, as the short card every drawing is given. */
export function styleCardOf(spec: GameSpec): string {
  const p = spec.palette;
  return [
    `LINES: ${spec.line.width}px ${spec.line.color}`,
    `SHAPES: ${spec.shapes === "rounded" ? "rounded corners and round forms" : "angular, straight edges"}, ${spec.detail === "flat" ? "very simplified" : spec.detail === "detailed" ? "with the small details that make each object recognisable" : "simplified"}`,
    `FILL: ${spec.detail === "flat" ? "flat colours only, no shading" : "flat colours, a lighter edge on the top and a darker side on every solid shape, for a little relief"}`,
    `PALETTE: ${[p.hero, p.enemy, p.brick, p.block, p.pipe, p.coin, p.accent, p.text].join(" ")}`,
    `DETAIL: ${spec.detail}, ${spec.mood}`
  ].join("\n");
}

export function renderHead(spec: GameSpec): string {
  const p = spec.palette, radius = spec.shapes === "rounded" ? 14 : 2;
  const font = spec.shapes === "rounded" ? `"Trebuchet MS", "Segoe UI", system-ui, sans-serif` : `"Courier New", ui-monospace, monospace`;
  const css = `:root { --sky: ${p.sky}; --sky2: ${p.sky2}; --ground: ${p.ground}; --accent: ${p.accent}; --text: ${p.text}; --panel: ${p.panel}; --hero: ${p.hero}; --enemy: ${p.enemy}; --brick: ${p.brick}; --pipe: ${p.pipe}; --line: ${spec.line.width}px; --line-color: ${spec.line.color}; --radius: ${radius}px; --font: ${font}; }
html, body { min-height: 100vh; }
body { margin: 0; background: linear-gradient(var(--sky), var(--sky2)); background-attachment: fixed; color: var(--text); font: 600 16px/1.4 var(--font); }
x-scene { display: block; min-height: 100vh; position: relative; }
.screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
.panel { background: var(--panel); color: var(--text); border: var(--line) solid var(--line-color); border-radius: var(--radius); padding: 28px 36px; text-align: center; box-shadow: 0 6px 0 rgba(0, 0, 0, .25); max-width: min(92vw, 520px); }
.title { margin: 0 0 10px; font-size: clamp(28px, 6vw, 48px); letter-spacing: .02em; color: var(--accent); text-shadow: 0 3px 0 rgba(0, 0, 0, .35); }
.panel p { margin: 0 0 22px; opacity: .85; }
.btn { font: inherit; font-weight: 700; font-size: 18px; padding: 12px 28px; color: #1b1b1b; background: var(--accent); border: var(--line) solid var(--line-color); border-radius: var(--radius); box-shadow: 0 4px 0 rgba(0, 0, 0, .35); cursor: pointer; transition: transform .08s, box-shadow .08s, filter .15s; }
.btn:hover { filter: brightness(1.08); }
.btn:active { transform: translateY(3px); box-shadow: 0 1px 0 rgba(0, 0, 0, .35); }
.btn:focus-visible { outline: 3px solid var(--text); outline-offset: 3px; }
.hud { position: absolute; top: 10px; left: 12px; right: 12px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: space-between; z-index: 5; pointer-events: none; }
#x-over { display: none !important; } /* the game's own end screen: the scenes below are the end screens here */
.hud span { background: var(--panel); border: var(--line) solid var(--line-color); border-radius: var(--radius); padding: 4px 12px; font-size: 15px; opacity: .93; }`;
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(spec.title)}</title>\n<style>\n${css}\n</style></head>\n<body>\n`;
}

const stateOf = (spec: GameSpec) => {
  const s: Record<string, number> = { lives: spec.lives, score: 0, coins: 0, big: 0, playing: 0 };
  if (spec.time) s.time = spec.time;
  return `<x-state ${Object.entries(s).map(([k, v]) => `${k}="${v}"`).join(" ")}></x-state>\n`;
};
export const renderState = stateOf;

/** One character per kind of thing, and one more for each kind of enemy that has a drawing. */
function legendFor(spec: GameSpec, level: Level): { legend: string; charOf: (t: Thing) => string } {
  const p = spec.palette;
  const art = (role: ArtRole, name?: string) => spec.art.find((a) => a.role === role && (!name || a.name === name)) ?? spec.art.find((a) => a.role === role);
  const look = (role: ArtRole, color: string) => { const a = art(role); return a ? `art:${a.name}` : color; };
  const lines: string[] = [];
  const hero = art("hero");
  lines.push(`@ player${hero ? ` art:${hero.name}` : ""}`);
  lines.push(`# ground ${look("ground", p.ground)}`);
  lines.push(`B brick ${look("brick", p.brick)}`);
  lines.push(`? block ${look("block", p.block)} coins+=1 score+=10`);
  lines.push(`M block ${look("block", p.block)} gives:big score+=50`);
  lines.push(`= platform ${look("platform", p.platform)}`);
  lines.push(`T pipe ${p.pipe}`);
  lines.push(`o coin ${look("coin", p.coin)} coins+=1 score+=10`);
  const enemyChars = new Map<string, string>();
  const letters = "ghijklmnpqrstuvxyz";
  const enemies = spec.art.filter((a) => a.role === "enemy");
  const flyers = spec.art.filter((a) => a.role === "flyer");
  let li = 0;
  for (const e of enemies) { const c = letters[li++ % letters.length]; enemyChars.set(e.name, c); lines.push(`${c} walker as:${e.name} stomp:score+=100 hurt:lives-=1 art:${e.name}`); }
  if (!enemies.length) { enemyChars.set("", "g"); lines.push(`g walker as:walker stomp:score+=100 hurt:lives-=1 ${p.enemy}`); }
  const flyerChar = "f";
  lines.push(`${flyerChar} flyer as:${flyers[0]?.name ?? "flyer"} stomp:score+=100 hurt:lives-=1${flyers[0] ? ` art:${flyers[0].name}` : ""}`);
  lines.push(`^ spike ${look("spike", p.enemy)} lives-=1`);
  lines.push(`s spring ${look("spring", p.accent)}`);
  lines.push(`c checkpoint ${p.flag}`);
  lines.push(`F flag ${look("flag", p.flag)}`);
  lines.push(`~ scenery as:cloud`);
  lines.push(`n scenery as:hill`);
  lines.push(`b scenery as:bush`);
  lines.push(`w water`);
  const charOf = (t: Thing): string => {
    switch (t.kind) {
      case "brick": return "B"; case "block": return t.gives === "mushroom" ? "M" : "?"; case "platform": return "="; case "coin": return "o"; case "pipe": return "T";
      case "enemy": return (t.name && enemyChars.get(t.name)) || enemyChars.get("") || [...enemyChars.values()][0] || "g"; // an enemy without a name takes the first drawn one: the same look
      case "flyer": return flyerChar; case "spike": return "^"; case "spring": return "s"; case "checkpoint": return "c"; case "flag": return "F";
      case "cloud": return "~"; case "hill": return "n"; case "bush": return "b"; case "water": return "w";
    }
  };
  return { legend: lines.join("\n"), charOf };
}

/** The level as put lines (columns, then the row counted up from the bottom: two rows of ground, so the surface is row 2). */
export function levelLines(spec: GameSpec, level: Level): { legend: string; lines: string } {
  const { legend, charOf } = legendFor(spec, level);
  const out: string[] = [];
  for (const g of level.ground) out.push(`# at ${g.from}-${g.to} 0-1`);
  for (const t of level.things) {
    const x2 = Math.min(level.width - 1, t.x + t.w - 1), y1 = t.y + 2, y2 = t.y + 2 + t.h - 1;
    out.push(`${charOf(t)} at ${t.x === x2 ? t.x : `${t.x}-${x2}`} ${y1 === y2 ? y1 : `${y1}-${y2}`}`);
  }
  out.push(`@ at ${level.start} 2`);
  return { legend, lines: out.join("\n") };
}

const hud = (spec: GameSpec) => {
  const l = spec.labels, bits: string[] = [];
  if (spec.lives) bits.push(`<span>${esc(l.lives)} <x-value of="lives"></x-value></span>`);
  if (spec.coins) bits.push(`<span>${esc(l.coins)} <x-value of="coins"></x-value></span>`);
  if (spec.score) bits.push(`<span>${esc(l.score)} <x-value of="score"></x-value></span>`);
  if (spec.time) bits.push(`<span>${esc(l.time)} <x-clock of="time" format="m:ss"></x-clock></span>`);
  return bits.length ? `<div class="hud">${bits.join("")}</div>\n` : "";
};

/** The four scenes, as separate pieces so each can be shown as soon as it exists. The level comes last: a page seen while it is written shows its last scene. */
export function renderScenes(spec: GameSpec, level: Level): { id: string; html: string }[] {
  const l = spec.labels, { legend, lines } = levelLines(spec, level);
  const screen = (id: string, heading: string, sub: string, button: string, click: string) =>
    `<x-scene id="${id}">\n<div class="screen"><div class="panel">\n<h1 class="title">${esc(heading)}</h1>\n${sub ? `<p>${esc(sub)}</p>\n` : ""}<button class="btn" data-click="${click}">${esc(button)}</button>\n</div></div>\n</x-scene>\n`;
  // a win or a loss moves to its scene and also ends the game (`lose`; the flag ends it itself), so the level stops under the end screen
  const rules = [
    `<x-rule on="enter:level_1" do="playing=1"></x-rule>`,
    `<x-rule on="flag" do="playing=0 go:win"></x-rule>`,
    spec.lives ? `<x-rule when="lives<=0" do="playing=0 go:over lose"></x-rule>` : "",
    spec.time ? `<x-timer every="1s" do="time-=1" while="time>0 && playing==1"></x-timer>\n<x-rule when="time<=0" do="playing=0 go:over lose"></x-rule>` : ""
  ].filter(Boolean).join("\n");
  return [
    { id: "title", html: screen("title", spec.title, spec.howto, l.play, "go:level_1") },
    { id: "win", html: screen("win", l.win, "", l.retry, "restart go:level_1") },
    { id: "over", html: screen("over", l.over, "", l.retry, "restart go:level_1") },
    { id: "level_1", html: `<x-scene id="level_1">\n${hud(spec)}<x-platformer tile="32" view="20">\n<x-legend>\n${legend}\n</x-legend>\n${lines}\n</x-platformer>\n</x-scene>\n${rules}\n` }
  ];
}

export const SPEC_TAIL = "<!-- /x-build -->\n</body></html>\n";

/** A comment that keeps what the page was made from (so a stopped page can be taken up again), written so that no `--` ends it early. */
export const markOf = (name: string, data: unknown) => `<!-- ${name} ${JSON.stringify(data).replace(/--/g, "-\\u002d")} -->\n`;
export const readMark = (html: string, name: string): unknown => {
  const m = new RegExp(`<!--\\s*${name}\\s+([\\s\\S]*?)-->`).exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};
