import { iconFor, iconMarkup } from "./page/icons";
import { repairJson } from "./look";
import { ENGINE_SOURCE, withEngine } from "./engineRuntime";
export { ENGINE_SOURCE, withEngine } from "./engineRuntime";
/**
 * A small game engine the model describes instead of programming. Like a chart or a diagram, the model writes a short
 * description (JSON: things, rules) and this runtime does the hard part: the loop, keys, mouse, movement, collisions,
 * score, lives, game over and restart. The description is forced into shape by a JSON schema when the server accepts
 * one (`GAME_SCHEMA`), checked by `gameFlaw`, and put in a page by `gamePage`. For anything the rules cannot say, the
 * page's own script talks to the running game (`Game.run` returns it: `on("update")`, `add`, `things`, `over`).
 */

export const GAME_OPS = ["score", "lives", "remove", "spawn", "bounce", "velocity", "speedUp", "lose", "win"] as const;
export const GAME_CONTROLS = ["none", "arrows", "horizontal", "vertical", "mouse", "mouseX"] as const;
export const GAME_EDGES = ["keep", "stop", "bounce", "wrap", "remove"] as const;
export const GAME_SHAPES = ["rect", "circle", "text", "icon"] as const;
export const GAME_FIT = ["easy", "hard", "impossible"] as const;
export const GAME_AT = ["random", "top", "bottom", "left", "right", "center", "hit"] as const;

export interface GameAction { op: (typeof GAME_OPS)[number]; who?: string; name?: string; by?: number; each?: number; vx?: number; vy?: number; at?: (typeof GAME_AT)[number]; text?: string }
export interface GameWhen { hit?: string[]; key?: string; every?: number; click?: boolean; start?: boolean; score?: number }
export interface GameThing {
  name: string; shape?: (typeof GAME_SHAPES)[number]; color?: string; text?: string; icon?: string; w?: number; h?: number;
  x?: number; y?: number; vx?: number; vy?: number; gravity?: number; speed?: number;
  control?: (typeof GAME_CONTROLS)[number]; edges?: (typeof GAME_EDGES)[number];
  count?: number; grid?: number[]; gap?: number; life?: number; pair?: number;
}
export interface GameSpec { fit?: (typeof GAME_FIT)[number]; fit_reason?: string; title?: string; width?: number; height?: number; background?: string; lives?: number; things: GameThing[]; rules: { when: GameWhen; do: GameAction[] }[] }

const num = (description: string) => ({ type: "number", description });
const str = (description: string) => ({ type: "string", description });

/** The JSON schema of a game, sent to the server so the model cannot answer anything else. */
export const GAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fit", "things", "rules"],
  properties: {
    fit: { type: "string", enum: [...GAME_FIT], description: "judge first, before describing: can the engine's things, movement, controls, collisions, timed spawns, score and lives say this game? easy = directly; hard = only with workarounds, say which in fit_reason; impossible = it needs something they cannot express (turn-based or board logic, typed text, generated maps or levels, computed behaviour, several screens), say what in fit_reason" },
    fit_reason: str("one short sentence: why easy, what the workaround is, or what cannot be said"),
    title: str("name of the game"),
    width: num("canvas width in pixels, 320 to 900"),
    height: num("canvas height in pixels, 240 to 900"),
    background: str("CSS colour of the background"),
    lives: num("lives at the start; leave out when the game has none"),
    things: {
      type: "array", minItems: 1,
      items: {
        type: "object", additionalProperties: false, required: ["name"],
        properties: {
          name: str("short lowercase name, used by the rules"),
          shape: { type: "string", enum: [...GAME_SHAPES] },
          color: str("CSS colour"),
          text: str("what a text thing shows (an emoji works well)"),
          icon: str("optional: a Lucide icon name (heart, star, rocket, skull, ghost, coin...) drawn in the colour of the thing when the shape is icon"),
          w: num("width in pixels (a circle: its diameter)"), h: num("height in pixels"),
          x: num("start position across, 0 (left) to 1 (right)"), y: num("start position down, 0 (top) to 1 (bottom)"),
          vx: num("speed across in pixels per second"), vy: num("speed down in pixels per second"),
          gravity: num("downward acceleration in pixels per second squared"), speed: num("speed of a thing the player moves, pixels per second"),
          control: { type: "string", enum: [...GAME_CONTROLS], description: "how the player moves it" },
          edges: { type: "string", enum: [...GAME_EDGES], description: "what happens at the border of the screen" },
          count: num("how many exist at the start, placed at random"),
          grid: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2, description: "[columns, rows] of copies in a grid starting at x,y" },
          gap: num("space between the cells of a grid in pixels"),
          life: num("seconds before it disappears"),
          pair: num("makes a barrier of two parts, one from the top and one from the bottom of the screen, with an opening of this many pixels at a random height (pipes of flappy bird, gates); give w, vx and spawn it with at right; the two parts count as one for remove")
        }
      }
    },
    rules: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["when", "do"],
        properties: {
          when: {
            type: "object", additionalProperties: false,
            properties: {
              hit: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2, description: "names of the two things that touch" },
              key: str("a key: Space, ArrowUp, ArrowLeft, a letter"),
              every: num("seconds between two runs"),
              click: { type: "boolean" }, start: { type: "boolean" },
              score: num("when the score reaches this number")
            }
          },
          do: {
            type: "array", minItems: 1, maxItems: 6,
            items: {
              type: "object", additionalProperties: false, required: ["op"],
              properties: {
                op: { type: "string", enum: [...GAME_OPS] },
                who: str("a, b (the two that touched) or a thing name"),
                name: str("thing to create (spawn)"),
                by: num("amount (score, lives, speedUp factor); for remove with a thing name: how many of them, the ones nearest the left first (a barrier of two parts counts as one)"),
                each: num("remove only: points given for each one removed"),
                vx: num("new speed across"), vy: num("new speed down"),
                at: { type: "string", enum: [...GAME_AT] },
                text: str("message (win, lose)")
              }
            }
          }
        }
      }
    }
  }
} as const;

/** What is wrong with a description, in words the model can act on; empty when it can be played. */
export function gameFlaw(spec: GameSpec): string[] {
  const out: string[] = [];
  if (!spec || !Array.isArray(spec.things) || !spec.things.length) return ["there is no thing"];
  const names = new Set<string>();
  for (const t of spec.things) {
    if (!t || typeof t.name !== "string" || !t.name) { out.push("a thing has no name"); continue; }
    if (names.has(t.name)) out.push(`two things are called ${t.name}`);
    names.add(t.name);
    if (t.shape === "icon" && !(t.icon && iconFor(t.icon))) out.push(`${t.name}: shape icon needs "icon" to be the name of an icon (heart, star, rocket, skull...); use another shape otherwise`);
  }
  const known = (n: string | undefined, special: string[] = []) => !n || names.has(n) || special.includes(n);
  const rules = Array.isArray(spec.rules) ? spec.rules : [];
  rules.forEach((r, i) => {
    const w = r?.when ?? {};
    if (!Object.keys(w).length) out.push(`rule ${i + 1} has an empty "when"`);
    for (const n of w.hit ?? []) if (!known(n)) out.push(`rule ${i + 1}: "${n}" is not a thing`);
    if (w.hit && w.hit.length !== 2) out.push(`rule ${i + 1}: "hit" needs exactly two names`);
    const hit = !!w.hit;
    if (!Array.isArray(r?.do) || !r.do.length) out.push(`rule ${i + 1} does nothing`);
    for (const a of r?.do ?? []) {
      if (!GAME_OPS.includes(a?.op)) { out.push(`rule ${i + 1}: unknown action "${String(a?.op)}"`); continue; }
      if (!known(a.who, hit ? ["a", "b"] : [])) out.push(`rule ${i + 1}: "${a.who}" is not a thing${hit ? "" : " (a and b only exist in a hit rule)"}`);
      if (a.op === "spawn" && !(a.name && names.has(a.name))) out.push(`rule ${i + 1}: spawn needs the name of a thing`);
      if (["remove", "bounce", "velocity", "speedUp"].includes(a.op) && !a.who) out.push(`rule ${i + 1}: ${a.op} needs "who"`);
    }
  });
  const moves = spec.things.some((t) => t.control && t.control !== "none") || spec.things.some((t) => t.vx || t.vy || t.gravity) || rules.some((r) => r.when?.click || r.when?.key);
  if (!moves) out.push("nothing moves and the player has no control");
  // the person has to be able to act: a thing they move, or a key or a click that changes something
  const controlled = spec.things.filter((t) => t.control && t.control !== "none").map((t) => t.name);
  const keyed = rules.filter((r) => r.when?.key || r.when?.click);
  if (!controlled.length && !keyed.length) out.push("the player cannot do anything: give a thing a control (arrows, horizontal, vertical, mouse), or add a rule with a key or a click that changes something (a jump or flap: {key:\"Space\"} with op velocity, vy negative, on a thing that has gravity)");
  // what the player moves must never be removed by a rule (a hit rule whose "b" is the bird removes the bird)
  const player = new Set([...controlled, ...keyed.flatMap((r) => (r.do ?? []).map((a) => a.who ?? "")).filter((w) => w && w !== "a" && w !== "b")]);
  rules.forEach((r, i) => {
    for (const a of r?.do ?? []) {
      if (a.op !== "remove" || !a.who) continue;
      const hitNames = r.when?.hit ?? [];
      const target = a.who === "a" ? hitNames[0] : a.who === "b" ? hitNames[1] : a.who;
      if (target && player.has(target)) out.push(`rule ${i + 1}: remove ${a.who} removes ${target}, the thing the player moves; remove the other one (in "hit":[x,y], a is x and b is y)`);
    }
  });
  const lose = rules.some((r) => r.do?.some((a) => a.op === "lose")) || (spec.lives ?? 0) > 0;
  if (!lose && !rules.some((r) => r.do?.some((a) => a.op === "win"))) out.push("the game can neither be lost nor won: add a rule with lose or win (or lives)");
  return out;
}

/**
 * What a small model leaves out of a description, filled in with what the words of the game mean: a thing spawned from an edge
 * moves inward and goes away when it leaves (a barrier, a bonus), what a key pushes up falls back down (gravity), what the player
 * moves never vanishes at the border, and lives that rules use exist. Nothing the model wrote is changed, only what is missing.
 */
export function normalizeGame(input: GameSpec): GameSpec {
  const spec: GameSpec = JSON.parse(JSON.stringify(input));
  const things = Array.isArray(spec.things) ? spec.things : [];
  const rules = Array.isArray(spec.rules) ? spec.rules : [];
  const byName = new Map(things.filter((t) => t && t.name).map((t) => [t.name, t]));
  const acts = rules.flatMap((r) => (Array.isArray(r?.do) ? r.do : []).map((a) => ({ a, when: r?.when ?? {} })));
  for (const { a } of acts) {
    if (a?.op !== "spawn" || !a.name) continue;
    const t = byName.get(a.name);
    if (!t) continue;
    const at = a.at ?? (t.pair ? "right" : "top");
    const moves = !!(t.vx || t.vy || t.gravity || (t.control && t.control !== "none"));
    if (!moves) {
      if (at === "right") t.vx = -160; else if (at === "left") t.vx = 160; else if (at === "top") t.vy = 140; else if (at === "bottom") t.vy = -140;
    }
    if (["right", "left", "top", "bottom"].includes(at) && (!t.edges || t.edges === "keep")) t.edges = "remove";
  }
  for (const t of things) if (t?.pair && t.pair > 0) { if (t.vx === undefined && !t.vy) t.vx = -180; if (!t.edges || t.edges === "keep") t.edges = "remove"; if (!t.w) t.w = 60; }
  const player = new Set<string>(things.filter((t) => t?.control && t.control !== "none").map((t) => t.name));
  for (const { a, when } of acts) if ((when.key || when.click) && a?.who && a.who !== "a" && a.who !== "b") player.add(a.who);
  for (const name of player) {
    const t = byName.get(name);
    if (t && t.edges === "remove") t.edges = "stop";
  }
  for (const { a, when } of acts) {
    if (!(when.key || when.click) || a?.op !== "velocity" || !a.who) continue;
    const t = byName.get(a.who);
    if (t && (a.vy ?? 0) < 0 && !t.gravity && !(t.control && t.control !== "none")) t.gravity = 900; // a push up that nothing pulls back down is a flap
  }
  if (!spec.lives && acts.some(({ a }) => a?.op === "lives")) spec.lives = 3;
  // numbers written the way most game code is (per frame: gravity 0.5, a jump of -8, a speed of 3) are made per second, which the engine uses
  const perSec = (v: number | undefined) => (typeof v === "number" && v !== 0 && Math.abs(v) < 20 ? v * 60 : v);
  for (const t of things) {
    if (!t) continue;
    t.vx = perSec(t.vx); t.vy = perSec(t.vy); t.speed = perSec(t.speed);
    if (typeof t.gravity === "number" && t.gravity > 0 && t.gravity < 20) t.gravity *= 3600;
  }
  for (const { a } of acts) { if (a?.op === "velocity") { a.vx = perSec(a.vx); a.vy = perSec(a.vy); } }
  return spec;
}

/**
 * A description mended by the app instead of thrown away: what names a thing that does not exist (a typo, "player" for "bird") is
 * dropped, an icon that is not one becomes a circle, a rule that does nothing goes. A game that keeps its things and most of its
 * rules still plays and can be changed by an edit of a few lines, which beats writing the whole page again by hand.
 * Returns the mended description and what was left out, for the build to say.
 */
export function healGame(spec: GameSpec): { spec: GameSpec; dropped: string[] } {
  const dropped: string[] = [];
  const things = (Array.isArray(spec?.things) ? spec.things : []).filter((t) => t && typeof t.name === "string" && t.name);
  const seen = new Set<string>();
  const unique = things.filter((t) => (seen.has(t.name) ? (dropped.push(`a second thing called ${t.name}`), false) : (seen.add(t.name), true)))
    .map((t) => (t.shape === "icon" && !(t.icon && iconFor(t.icon)) ? { ...t, shape: "circle" as const } : t));
  const names = new Set(unique.map((t) => t.name));
  const rules: GameSpec["rules"] = [];
  for (const [i, r] of (Array.isArray(spec?.rules) ? spec.rules : []).entries()) {
    const w = r?.when ?? {};
    if (!Object.keys(w).length) { dropped.push(`rule ${i + 1} (nothing starts it)`); continue; }
    if (w.hit && (w.hit.length !== 2 || w.hit.some((n) => !names.has(n)))) { dropped.push(`rule ${i + 1} (it names a thing that does not exist)`); continue; }
    const hit = !!w.hit;
    const ok = (n: string | undefined) => !n || names.has(n) || (hit && (n === "a" || n === "b"));
    const doList = (Array.isArray(r?.do) ? r.do : []).filter((a) => {
      const good = GAME_OPS.includes(a?.op) && ok(a.who) && (a.op !== "spawn" || (!!a.name && names.has(a.name))) && (!["remove", "bounce", "velocity", "speedUp"].includes(a.op) || !!a.who);
      if (!good) dropped.push(`an action of rule ${i + 1} (${String(a?.op)})`);
      return good;
    });
    if (!doList.length) { dropped.push(`rule ${i + 1} (nothing left to do)`); continue; }
    rules.push({ when: w, do: doList });
  }
  return { spec: { ...spec, things: unique, rules }, dropped };
}

/** The first JSON object in a reply, however the model wrapped it. */
export function parseGameSpec(reply: string): GameSpec | null {
  const t = reply.replace(/```(?:json)?/gi, "");
  const from = t.indexOf("{");
  if (from < 0) return null;
  for (let to = t.lastIndexOf("}"); to > from; to = t.lastIndexOf("}", to - 1)) {
    try { const v = JSON.parse(t.slice(from, to + 1)); if (v && typeof v === "object" && Array.isArray(v.things)) return v as GameSpec; } catch { /* a shorter cut */ }
  }
  // an answer cut off where the window or the limit ended it: closed where it stopped, what was written is kept
  const cut = repairJson(reply) as GameSpec | null;
  return cut && typeof cut === "object" && Array.isArray(cut.things) && cut.things.length ? cut : null;
}

/** The reference the writer is given when a game goes beyond the rules and needs a little script of its own. */
export const ENGINE_DOC = [
  "The page loads a small game engine. Start the game with `const game = Game.run({...})` and write no loop, no key handling and no collision code yourself.",
  "The object has `title`, `width`, `height`, `background`, `lives`, `things` and `rules`. A thing: name, shape rect|circle|text|icon (an icon needs `icon`: a Lucide name such as heart, star, rocket, skull), color, w, h, x and y from 0 to 1, vx, vy (pixels per second), gravity (pixels per second squared), speed, control arrows|horizontal|vertical|mouse|mouseX, edges keep|stop|bounce|wrap|remove, count, grid [columns, rows] with gap, life (seconds), pair (a barrier of two parts, top and bottom, with an opening of that many pixels at a random height). A thing that a rule spawns is a kind of thing: it appears when the rule spawns it.",
  "A rule is `{when, do}`. `when` is one of: {hit:[nameA,nameB]}, {key:\"Space\"}, {every:seconds}, {click:true}, {start:true}, {score:n}. `do` is a list of: {op:\"score\",by}, {op:\"lives\",by}, {op:\"remove\",who,by,each}, {op:\"spawn\",name,at: top|bottom|left|right|center|random|hit}, {op:\"bounce\",who}, {op:\"velocity\",who,vx,vy}, {op:\"speedUp\",who,by}, {op:\"lose\",text}, {op:\"win\",text}. In a hit rule `who` is a or b (the first and the second name of hit) or a thing name; remove with a thing name and `by` removes that many of them, the nearest the left first, and `each` gives points for each one.",
  "`game` also gives `score`, `lives`, `on(\"update\", (dt, game) => {})`, `on(\"over\", fn)`, `add(name, props)`, `things(name)`, `over(text)`, `win(text)`, `restart()`; each thing has x, y, w, h, vx, vy, name."
].join("\n");

/** The exact shape of an answer, shown to the model: a small model that is not held to the schema by its server copies this and not its own layout. */
export const GAME_EXAMPLE = JSON.stringify({
  fit: "easy", title: "Catch", lives: 3,
  things: [
    { name: "basket", shape: "rect", color: "#4aa3ff", w: 80, h: 16, x: 0.5, y: 0.9, control: "horizontal" },
    { name: "fruit", shape: "circle", color: "#ffa94a", w: 20, vy: 160, edges: "remove" },
    { name: "floor", shape: "rect", color: "#222", w: 900, h: 6, x: 0, y: 1 }
  ],
  rules: [
    { when: { every: 1 }, do: [{ op: "spawn", name: "fruit", at: "top" }] },
    { when: { hit: ["basket", "fruit"] }, do: [{ op: "score", by: 1 }, { op: "remove", who: "b" }] },
    { when: { hit: ["floor", "fruit"] }, do: [{ op: "lives", by: -1 }, { op: "remove", who: "b" }] }
  ]
});

export const GAME_INSTRUCTIONS = [
  "You describe a small arcade game as JSON for a game engine that already exists. You never write code.",
  "First judge whether the engine can play this game (fit). Any game with things that move, touch, score or cost lives (pong, breakout, invaders, flappy bird, catch, dodge, runner, shooter, any other game the request describes) is easy or hard, never impossible: say it with the things and rules, using workarounds when needed. Answer impossible only when nothing can move or be touched (a board game, typed text, several screens).",
  `Reply with one JSON object that follows the schema. Positions x and y are fractions of the screen (0 to 1), sizes are in pixels, speeds are in pixels per SECOND (never per frame): a walk is 100 to 250, a jump or flap is a velocity of about -350, gravity is about 900, a barrier or bonus coming in moves at about -180.`,
  "Make it playable and complete: a thing the player moves, things that move by themselves or appear every few seconds (rule with every), rules for what happens when things touch (score, remove, bounce, lose a life), and a way to lose or win.",
  "Examples of rules: pong = two paddles and a ball with edges bounce, hit rules with bounce; breakout = a paddle with control horizontal, a ball with edges bounce and vy negative at the start, a grid of bricks, hit ball/brick = remove b + score + bounce a, hit ball/paddle = bounce a, lose when the ball leaves the bottom (a thin thing at the bottom, hit ball/floor = lose); catch = a basket with control horizontal and falling things spawned every second, hit = score and remove b; dodge = the player with control arrows and obstacles spawned every 0.7 s with vy, hit = lose.",
  "Techniques, to combine as the request needs (never a recipe to copy): a key that gives a thing a push = {key, velocity vy negative} with gravity on that thing; a barrier with an opening at a random height = a thing with pair (the opening in pixels), w, vx, edges remove, spawned with at right on a timer; a bonus or a hazard = a thing spawned on a timer that moves, with a hit rule (lives by 1 or -1, score, remove b); a power-up with an effect on others = a hit rule whose do removes things by name (who the name, by how many, each = points per one); losing a life gives one second of grace on its own; a floor or a wall = a thin thing with a hit rule.",
  "Describe what the request asks for, whatever it is, known or not: use the things and rules the engine has.",
  `The answer has exactly these top-level keys: fit, title, lives, things, rules. Never other keys (no build, player, obstacles, design, win). Every thing is in the list things, every behaviour is a rule in the list rules with when and do. Here is the exact shape, for another game:\n${GAME_EXAMPLE}`
].join("\n");

/** A request for the kind of game this engine plays (not a snake, a puzzle or a board game). */
export const ARCADE_WORDS = /\b(pong|breakout|casse[- ]?briques?|brick ?breaker|invaders?|space invaders|asteroids?|ast[ée]ro[iï]des?|flappy|dodge|[ée]vite\w*|catch(?:ing)?|attrape\w*|shoot(?:er|ing)|shmup|arcade|platform(?:er)?|runner|pac[- ]?man|frogger|whack[- ]?a[- ]?mole|taupe|jeu d'arcade|collect\w* (?:the |les )?(?:coins?|pi[eè]ces|stars?|[ée]toiles?))\b/i;

/** Any request for a game: the engine is tried for all of them, and only a description that does not hold up sends one to code. */
export const GAME_WORDS = /\b(games?|jeux?|jouable|playable|play)\b/i;

/** The icons the things of a game use, written into its page (nothing is written when no thing uses one). */
function iconsTag(spec: GameSpec): string {
  const names = (spec.things ?? []).filter((t) => t.shape === "icon" && t.icon).map((t) => t.icon as string);
  if (!names.length) return "";
  const map: Record<string, string> = {};
  for (const n of names) { const r = iconFor(n); if (r) map[n] = iconMarkup(r); }
  return `<script id="icons">window.__icons=${JSON.stringify(map).replace(/</g, "\\u003c")};</script>\n`;
}

/**
 * The page that holds a described game: the description, readable, and nothing else. The engine is not in it: the app adds it when the page is
 * shown, tested, opened or saved (`withEngine`), so the model that writes or changes the page reads and writes a few lines, not the whole runtime.
 */
export function gamePage(spec: GameSpec): string {
  const title = String(spec.title || "Game").replace(/[<>&"]/g, "");
  const { fit: _fit, fit_reason: _why, ...plain } = spec;
  const json = JSON.stringify(plain, null, 2).replace(/<\/(script)/gi, "<\\/$1");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  html, body { margin: 0; height: 100%; background: #0b0d12; color: #fff; font-family: system-ui, sans-serif; }
  body { display: flex; align-items: center; justify-content: center; }
  h1 { position: absolute; top: 6px; right: 12px; margin: 0; font-size: 14px; opacity: .5; font-weight: 600; }
</style>
</head>
<body>
<h1>${title}</h1>
<div id="game"></div>
${iconsTag(spec)}<script id="rules">
const game = Game.run(${json});
</script>
</body>
</html>
`;
}

/** The description found back in a page made by `gamePage` (or written by hand the same way); null when the page is not one. */
export function specOfPage(html: string): GameSpec | null {
  const m = /Game\.run\s*\(\s*(\{[\s\S]*?\})\s*\)\s*;?\s*<\/script>/.exec(html);
  if (!m) return null;
  try { const v = JSON.parse(m[1]); return v && Array.isArray(v.things) ? (v as GameSpec) : null; } catch { return null; }
}

export type GameExport = "html" | "js" | "json";

/**
 * The same game in the form the person wants to keep: the page (open it anywhere), the plain script (engine and game in one
 * file, to put in their own page: it draws into `#game` or the body), or the description in the engine's own language.
 */
export function exportGame(spec: GameSpec, as: GameExport): { name: string; mime: string; content: string } {
  const slug = String(spec.title || "game").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "game";
  if (as === "json") return { name: `${slug}.json`, mime: "application/json", content: JSON.stringify((({ fit: _f, fit_reason: _r, ...r }) => r)(spec), null, 2) + "\n" };
  if (as === "js") return { name: `${slug}.js`, mime: "text/javascript", content: `${ENGINE_SOURCE.trim()}\n\nconst game = Game.run(${JSON.stringify(spec, null, 2)});\n` };
  return { name: `${slug}.html`, mime: "text/html", content: withEngine(gamePage(spec)) };
}

/** The person asks for the code itself, written by hand, or says no to a library. */
export const WANTS_RAW = /\b(from scratch|vanilla|raw (?:code|javascript|js|canvas)|pure (?:js|javascript|canvas)|no (?:library|libraries|framework|engine)|without (?:a |any )?(?:library|libraries|framework|engine)|(?:à|a) la main|de z[ée]ro|code brut|sans (?:biblioth[eè]que|librairie|framework|moteur)|(?:pure|pur) (?:js|javascript|canvas)|handwritten|hand-written|write the (?:code|loop) yourself)\b/i;
/** The person asks for the engine, the rules or a description. */
const WANTS_ENGINE = /\b(with the engine|using the engine|game engine|avec le moteur|moteur de jeu|rules? only|just the rules|(?:json|description) (?:of|for) the game|en r[eè]gles|par r[eè]gles)\b/i;

/**
 * Engine or code written by hand? The engine first: it costs a short description instead of a whole program, so fewer tokens,
 * less battery and less time. Code by hand only when the person asks for it, or when the description does not hold up
 * (the build then falls back on its own). The router is not asked: it read gravity and flapping as "mechanics of its own".
 * Returns "engine" | "code" and the reason, shown in the build.
 */
/** A game whose world is a map (a dungeon, an adventure, a maze with things to pick up, an inventory) is written with the blocks, not the arcade engine. */
export const WORLD_WORDS = /\b(mario|platform(?:er|ing)?|plateforme\w*|plateformer|sonic|metroidvania|celeste|pok[eé]mon|rpg|jrpg|roguelike|rogue-?like|donjon|dungeon|crypt\w*|labyrinth\w*|labyrinthe|maze|zelda|top[- ]?down|aventure|adventure|inventor(?:y|ies)|inventaire|tilemap|tile[- ]?based|with (?:the )?blocks|avec (?:les )?blocs)\b/i;

/** Only what the person says outright decides a way other than the construction engine: the code itself, or the game engine by name. */
export function explicitWay(request: string): { way: "engine" | "code"; why: string } | null {
  if (WANTS_RAW.test(request)) return { way: "code", why: "you asked for the code itself" };
  if (WANTS_ENGINE.test(request)) return { way: "engine", why: "you asked for the engine" };
  return null;
}

export async function chooseGameWay(request: string, _ask?: (q: string) => Promise<boolean | null>): Promise<{ way: "engine" | "blocks" | "code"; why: string }> {
  if (!ARCADE_WORDS.test(request) && !GAME_WORDS.test(request)) return { way: "code", why: "not a game" };
  if (WANTS_RAW.test(request)) return { way: "code", why: "you asked for the code itself" };
  if (WANTS_ENGINE.test(request)) return { way: "engine", why: "you asked for the engine" };
  if (WORLD_WORDS.test(request)) return { way: "blocks", why: "a game with a world: the blocks" };
  return { way: "engine", why: "the engine first, code only if it judges it cannot" };
}

/** A file name for a game, from what it is called in the request ("a playable flappy bird game" is flappy-bird.html), never "index". */
export function gameFileName(request: string): string {
  const clean = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  // "a game like the first Super Mario Bros" is called after what it is like (a title written with capitals), as a person would name it
  const like = /\b(?:like|comme|inspired by|inspir[ée]e? (?:de|du|par)|in the style of|style)\s+(?:the\s+|le\s+|la\s+|les\s+)?(?:(?:first|original|old|premier|premi[èe]re|classic)\s+)?((?:\p{Lu}[\p{L}\d'-]*(?:\s+(?:of|the|and|&)\s+|\s+)?){1,4})/u.exec(request);
  const titled = like ? clean(like[1].replace(/\b(?:and|of|the)\s*$/i, "")) : "";
  if (titled.length >= 3 && titled.length <= 40) return `${titled}.html`;
  const m = /\b([\p{L}\d-]+(?:\s+[\p{L}\d-]+)?)\s+(?:game|jeu)\b/iu.exec(request);
  const skip = new Set(["a", "an", "the", "un", "une", "le", "la", "playable", "simple", "small", "little", "fun", "new", "jouable", "petit", "make", "me", "create", "build", "fais", "cr\u00e9e", "2d", "3d", "i", "want", "like", "retro", "classic", "pixel", "short", "quick", "complete"]);
  const words = (m?.[1] ?? "").toLowerCase().split(/\s+/).filter((w) => w && !skip.has(w));
  const slug = clean(words.join("-"));
  return `${slug || "game"}.html`;
}
