import { iconFor, iconMarkup } from "./page/icons";
import { repairJson } from "./look";
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
  const lose = rules.some((r) => r.do?.some((a) => a.op === "lose")) || (spec.lives ?? 0) > 0;
  if (!lose && !rules.some((r) => r.do?.some((a) => a.op === "win"))) out.push("the game can neither be lost nor won: add a rule with lose or win (or lives)");
  return out;
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

/** The runtime, as plain browser script. No dependency, no network. */
export const ENGINE_SOURCE = String.raw`
var Game = (function () {
  var NAV = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function iconImg(name, color) {
    var p = (window.__icons || {})[name]; if (!p) return null;
    var im = new Image();
    im.src = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + (color || "#fff") + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>');
    return im;
  }
  function run(spec) {
    spec = spec || {};
    var W = spec.width || 480, H = spec.height || 640;
    var host = document.getElementById("game") || document.body;
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H; cv.tabIndex = 0;
    cv.style.cssText = "display:block;margin:0 auto;max-width:100%;touch-action:none;outline:none";
    host.appendChild(cv);
    var cx = cv.getContext("2d");
    var g = { width: W, height: H, score: 0, lives: spec.lives || 0, state: "play", message: "", time: 0, items: [], templates: {}, keys: {}, pointer: { x: W / 2, y: H / 2 }, _on: { update: [], over: [] } };
    (spec.things || []).forEach(function (t) { g.templates[t.name] = t; });
    var timers = [], fired = {}, pid = 0, hurtUntil = 0;
    function make(t, at, from) {
      var w = t.w || (t.shape === "circle" ? 20 : 30), h = t.h || (t.shape === "circle" ? w : 30);
      var it = { name: t.name, t: t, shape: t.shape || "rect", color: t.color || "#e8e8e8", text: t.text, w: w, h: h, x: 0, y: 0, vx: t.vx || 0, vy: t.vy || 0, age: 0, dead: false };
      if (at === "top") { it.x = rnd(0, W - w); it.y = -h; }
      else if (at === "bottom") { it.x = rnd(0, W - w); it.y = H; }
      else if (at === "left") { it.x = -w; it.y = rnd(0, H - h); }
      else if (at === "right") { it.x = W; it.y = rnd(0, H - h); }
      else if (at === "center") { it.x = (W - w) / 2; it.y = (H - h) / 2; }
      else if (at === "hit" && from) { it.x = from.x + from.w / 2 - w / 2; it.y = from.y + from.h / 2 - h / 2; }
      else if (at === "random" || (t.x == null && t.y == null)) { it.x = rnd(0, W - w); it.y = rnd(0, H / 2); }
      else { it.x = (t.x == null ? 0.5 : t.x) * (W - w); it.y = (t.y == null ? 0.5 : t.y) * (H - h); }
      g.items.push(it);
      return it;
    }
    // a barrier of two parts with an opening at a random height: both parts share an id so they go together
    function makePair(t, at) {
      var w = t.w || 60, gap = t.pair, pad = Math.max(30, H * 0.12), cy = rnd(pad + gap / 2, H - pad - gap / 2), id = ++pid, x = at === "left" ? -w : at === "random" || at === "center" ? (W - w) / 2 : W, out = [];
      [[0, cy - gap / 2], [cy + gap / 2, H]].forEach(function (b) {
        var it = { name: t.name, t: t, shape: t.shape || "rect", color: t.color || "#e8e8e8", text: t.text, w: w, h: b[1] - b[0], x: x, y: b[0], vx: t.vx || 0, vy: t.vy || 0, age: 0, dead: false, pid: id };
        g.items.push(it); out.push(it);
      });
      return out[0];
    }
    function build() {
      g.items = []; g.score = 0; g.lives = spec.lives || 0; g.state = "play"; g.message = ""; g.time = 0; fired = {}; hurtUntil = 0;
      timers = [];
      (spec.rules || []).forEach(function (r, i) { if (r.when && r.when.every > 0) timers[i] = r.when.every; });
      (spec.things || []).forEach(function (t) {
        if (t.grid && t.grid.length === 2) {
          var gap = t.gap == null ? 4 : t.gap, w = t.w || 40, h = t.h || 16;
          var x0 = (t.x == null ? 0.5 : t.x) * W - (t.grid[0] * (w + gap) - gap) / 2, y0 = (t.y == null ? 0.1 : t.y) * H;
          for (var r = 0; r < t.grid[1]; r++) for (var c = 0; c < t.grid[0]; c++) {
            var it = make(t, "none"); it.x = x0 + c * (w + gap); it.y = y0 + r * (h + gap);
          }
        } else if (t.pair > 0) {
          makePair(t, "right");
        } else {
          var n = t.count || 1;
          for (var k = 0; k < n; k++) { var one = make(t, n > 1 ? "random" : "none"); if (t.life) one.life = t.life; }
        }
      });
      (spec.rules || []).forEach(function (r) { if (r.when && r.when.start) act(r.do, {}); });
    }
    function targets(who, ctx) {
      if (who === "a") return ctx.a ? [ctx.a] : [];
      if (who === "b") return ctx.b ? [ctx.b] : [];
      return g.items.filter(function (i) { return i.name === who && !i.dead; });
    }
    // remove: the thing named, or the n nearest the left (a barrier of two parts is one); each removed one can give points
    function removeThings(a, ctx) {
      var all = targets(a.who, ctx), seen = {}, groups = [];
      all.forEach(function (i) { var k = i.pid ? "p" + i.pid : "i" + groups.length; if (!seen[k]) { seen[k] = []; groups.push(seen[k]); } seen[k].push(i); });
      if (a.by > 0 && a.who !== "a" && a.who !== "b") groups.sort(function (p, q) { return p[0].x - q[0].x; });
      var n = a.by > 0 && a.who !== "a" && a.who !== "b" ? Math.min(a.by, groups.length) : groups.length;
      for (var k = 0; k < n; k++) { groups[k].forEach(function (i) { i.dead = true; }); if (a.each) g.score += a.each; }
      // a part of a barrier that was hit takes its other part with it
      all.forEach(function (i) { if (i.dead && i.pid) g.items.forEach(function (j) { if (j.pid === i.pid) j.dead = true; }); });
    }
    function act(list, ctx) {
      (list || []).forEach(function (a) {
        if (g.state !== "play") return;
        var op = a.op, by = a.by == null ? 1 : a.by;
        if (op === "score") g.score += by;
        else if (op === "lives") { var d = a.by == null ? -1 : a.by; if (d < 0) { if (g.time < hurtUntil) return; hurtUntil = g.time + 1; } g.lives += d; if (spec.lives > 0 && g.lives <= 0) finish("lose", a.text); }
        else if (op === "lose") finish("lose", a.text);
        else if (op === "win") finish("win", a.text);
        else if (op === "remove") removeThings(a, ctx);
        else if (op === "spawn") { var tp = g.templates[a.name]; if (tp) { if (tp.pair > 0) makePair(tp, a.at || "right"); else make(tp, a.at || "top", ctx.a || ctx.b); } }
        else if (op === "velocity") targets(a.who, ctx).forEach(function (i) { if (a.vx != null) i.vx = a.vx; if (a.vy != null) i.vy = a.vy; });
        else if (op === "speedUp") targets(a.who, ctx).forEach(function (i) { var f = a.by || 1.05; i.vx *= f; i.vy *= f; });
        else if (op === "bounce") targets(a.who, ctx).forEach(function (i) {
          var o = i === ctx.a ? ctx.b : ctx.a; if (!o) { i.vx = -i.vx; i.vy = -i.vy; return; }
          var dx = (i.x + i.w / 2) - (o.x + o.w / 2), dy = (i.y + i.h / 2) - (o.y + o.h / 2);
          var ox = (i.w + o.w) / 2 - Math.abs(dx), oy = (i.h + o.h) / 2 - Math.abs(dy);
          if (ox < oy) i.vx = dx < 0 ? -Math.abs(i.vx) : Math.abs(i.vx); else i.vy = dy < 0 ? -Math.abs(i.vy) : Math.abs(i.vy);
          // a paddle sends the ball left or right according to where it was hit
          if (ox >= oy && o.t && o.t.control && o.t.control !== "none") i.vx = (dx / (o.w / 2)) * Math.max(Math.abs(i.vy), 150);
        });
      });
      spec.rules && spec.rules.forEach(function (r, i) { if (r.when && r.when.score != null && !fired[i] && g.score >= r.when.score) { fired[i] = 1; act(r.do, {}); } });
    }
    function finish(kind, text) {
      g.state = kind === "win" ? "won" : "over";
      g.message = text || (kind === "win" ? "You win!" : "Game over");
      g._on.over.forEach(function (f) { f(g); });
    }
    function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
    function step(dt) {
      g.time += dt;
      var k = g.keys;
      g.items.forEach(function (i) {
        var t = i.t, sp = t.speed || 260, c = t.control || "none";
        if (c === "arrows" || c === "horizontal") { i.vx = ((k.ArrowRight || k.KeyD) ? 1 : 0) * sp - ((k.ArrowLeft || k.KeyA) ? 1 : 0) * sp; }
        if (c === "arrows" || c === "vertical") { i.vy = ((k.ArrowDown || k.KeyS) ? 1 : 0) * sp - ((k.ArrowUp || k.KeyW) ? 1 : 0) * sp; }
        if (c === "mouse" || c === "mouseX") i.x += (g.pointer.x - i.w / 2 - i.x) * Math.min(1, dt * 20);
        if (c === "mouse") i.y += (g.pointer.y - i.h / 2 - i.y) * Math.min(1, dt * 20);
        if (t.gravity) i.vy += t.gravity * dt;
        i.x += i.vx * dt; i.y += i.vy * dt; i.age += dt;
        if (i.life && i.age > i.life) i.dead = true;
        var e = t.edges || (c !== "none" ? "stop" : "keep");
        if (e === "remove") { if (i.x > W || i.x + i.w < 0 || i.y > H || i.y + i.h < 0) { if (i.age > 0.2) i.dead = true; } }
        else if (e === "wrap") { if (i.x > W) i.x = -i.w; if (i.x + i.w < 0) i.x = W; if (i.y > H) i.y = -i.h; if (i.y + i.h < 0) i.y = H; }
        else if (e === "stop" || e === "bounce") {
          if (i.x < 0) { i.x = 0; if (e === "bounce") i.vx = Math.abs(i.vx); }
          if (i.x + i.w > W) { i.x = W - i.w; if (e === "bounce") i.vx = -Math.abs(i.vx); }
          if (i.y < 0) { i.y = 0; if (e === "bounce") i.vy = Math.abs(i.vy); }
          if (i.y + i.h > H) { i.y = H - i.h; if (e === "bounce") i.vy = -Math.abs(i.vy); else i.vy = Math.min(i.vy, 0); }
        }
      });
      (spec.rules || []).forEach(function (r, ri) {
        var w = r.when || {};
        if (w.every > 0) { timers[ri] -= dt; if (timers[ri] <= 0) { timers[ri] += w.every; act(r.do, {}); } }
        if (w.hit && w.hit.length === 2) {
          var A = g.items.filter(function (i) { return i.name === w.hit[0] && !i.dead; }), B = g.items.filter(function (i) { return i.name === w.hit[1] && !i.dead; });
          A.forEach(function (a) { B.forEach(function (b) { if (a !== b && !a.dead && !b.dead && hits(a, b)) act(r.do, { a: a, b: b }); }); });
        }
      });
      g.items = g.items.filter(function (i) { return !i.dead; });
      g._on.update.forEach(function (f) { f(dt, g); });
    }
    function draw() {
      cx.fillStyle = spec.background || "#10131a"; cx.fillRect(0, 0, W, H);
      g.items.forEach(function (i) {
        cx.fillStyle = i.color;
        if (i.shape === "circle") { cx.beginPath(); cx.arc(i.x + i.w / 2, i.y + i.h / 2, i.w / 2, 0, 6.2832); cx.fill(); }
        else if (i.shape === "icon") { if (!i.img) i.img = iconImg(i.t.icon, i.color); if (i.img && i.img.complete && i.img.naturalWidth) cx.drawImage(i.img, i.x, i.y, i.w, i.h); else { cx.beginPath(); cx.arc(i.x + i.w / 2, i.y + i.h / 2, i.w / 2, 0, 6.2832); cx.fill(); } }
        else if (i.shape === "text") { cx.font = Math.round(i.h) + "px sans-serif"; cx.textBaseline = "top"; cx.fillText(i.text || i.name, i.x, i.y); }
        else cx.fillRect(i.x, i.y, i.w, i.h);
      });
      cx.fillStyle = "#fff"; cx.font = "bold 18px sans-serif"; cx.textBaseline = "top"; cx.textAlign = "left";
      cx.fillText("Score " + g.score + (spec.lives > 0 ? "   Lives " + g.lives : ""), 10, 8);
      if (g.state !== "play") {
        cx.fillStyle = "rgba(0,0,0,.6)"; cx.fillRect(0, 0, W, H);
        cx.fillStyle = "#fff"; cx.textAlign = "center"; cx.font = "bold 32px sans-serif"; cx.fillText(g.message, W / 2, H / 2 - 30);
        cx.font = "18px sans-serif"; cx.fillText("Press Space or click to play again", W / 2, H / 2 + 14); cx.textAlign = "left";
      }
    }
    function onKey(e) {
      g.keys[e.code] = true;
      if (NAV[e.code]) e.preventDefault();
      if (g.state !== "play") { if (e.code === "Space" || e.code === "Enter") build(); return; }
      (spec.rules || []).forEach(function (r) { var k = r.when && r.when.key; if (k && (k === e.code || k === e.key || "Key" + k.toUpperCase() === e.code)) act(r.do, {}); });
    }
    function point(e) { var r = cv.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; g.pointer.x = (p.clientX - r.left) * W / r.width; g.pointer.y = (p.clientY - r.top) * H / r.height; }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", function (e) { g.keys[e.code] = false; });
    cv.addEventListener("mousemove", point); cv.addEventListener("touchmove", function (e) { point(e); e.preventDefault(); }, { passive: false });
    function down(e) {
      point(e); cv.focus();
      if (g.state !== "play") { build(); return; }
      (spec.rules || []).forEach(function (r) { if (r.when && r.when.click) act(r.do, {}); });
    }
    cv.addEventListener("mousedown", down); cv.addEventListener("touchstart", down, { passive: true });
    g.on = function (what, fn) { (g._on[what] = g._on[what] || []).push(fn); return g; };
    g.add = function (name, props) { var t = g.templates[name]; if (!t) return null; var it = make(t, "none"); for (var p in props) it[p] = props[p]; return it; };
    g.things = function (name) { return g.items.filter(function (i) { return i.name === name; }); };
    g.over = function (text) { finish("lose", text); };
    g.win = function (text) { finish("win", text); };
    g.restart = build;
    var last = 0;
    function frame(ts) {
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (g.state === "play") step(dt);
      draw();
      requestAnimationFrame(frame);
    }
    build();
    requestAnimationFrame(frame);
    return g;
  }
  return { run: run };
})();
`;

/** The reference the writer is given when a game goes beyond the rules and needs a little script of its own. */
export const ENGINE_DOC = [
  "The page loads a small game engine. Start the game with `const game = Game.run({...})` and write no loop, no key handling and no collision code yourself.",
  "The object has `things` (what exists: name, shape rect|circle|text|icon (an icon needs `icon`: a Lucide name such as heart, star, rocket, skull), color, w, h, x and y from 0 to 1, vx, vy, gravity, speed, control arrows|horizontal|vertical|mouse|mouseX, edges keep|stop|bounce|wrap|remove, count, grid [columns, rows], life) and `rules` ({when, do}).",
  "`when` is one of: {hit:[nameA,nameB]}, {key:\"Space\"}, {every:seconds}, {click:true}, {start:true}, {score:n}. `do` is a list of: {op:\"score\",by}, {op:\"lives\",by}, {op:\"remove\",who}, {op:\"spawn\",name,at}, {op:\"bounce\",who}, {op:\"velocity\",who,vx,vy}, {op:\"speedUp\",who,by}, {op:\"lose\",text}, {op:\"win\",text}. `who` is a thing name, or a / b for the two things of a hit rule.",
  "`game` also gives `score`, `lives`, `on(\"update\", (dt, game) => {})`, `on(\"over\", fn)`, `add(name, props)`, `things(name)`, `over(text)`, `win(text)`, `restart()`; each thing has x, y, w, h, vx, vy, name."
].join("\n");

export const GAME_INSTRUCTIONS = [
  "You describe a small arcade game as JSON for a game engine that already exists. You never write code.",
  "First judge whether the engine can play this game (fit). Any game with things that move, touch, score or cost lives (pong, breakout, invaders, flappy bird, catch, dodge, runner, shooter, any other game the request describes) is easy or hard, never impossible: say it with the things and rules, using workarounds when needed. Answer impossible only when nothing can move or be touched (a board game, typed text, several screens).",
  `Reply with one JSON object that follows the schema. Positions x and y are fractions of the screen (0 to 1), sizes and speeds are in pixels and pixels per second.`,
  "Make it playable and complete: a thing the player moves, things that move by themselves or appear every few seconds (rule with every), rules for what happens when things touch (score, remove, bounce, lose a life), and a way to lose or win.",
  "Examples of rules: pong = two paddles and a ball with edges bounce, hit rules with bounce; breakout = a paddle with control horizontal, a ball with edges bounce and vy negative at the start, a grid of bricks, hit ball/brick = remove b + score + bounce a, hit ball/paddle = bounce a, lose when the ball leaves the bottom (a thin thing at the bottom, hit ball/floor = lose); catch = a basket with control horizontal and falling things spawned every second, hit = score and remove b; dodge = the player with control arrows and obstacles spawned every 0.7 s with vy, hit = lose.",
  "Techniques, to combine as the request needs (never a recipe to copy): a key that gives a thing a push = {key, velocity vy negative} with gravity on that thing; a barrier with an opening at a random height = a thing with pair (the opening in pixels), w, vx, edges remove, spawned with at right on a timer; a bonus or a hazard = a thing spawned on a timer that moves, with a hit rule (lives by 1 or -1, score, remove b); a power-up with an effect on others = a hit rule whose do removes things by name (who the name, by how many, each = points per one); losing a life gives one second of grace on its own; a floor or a wall = a thin thing with a hit rule.",
  "Describe what the request asks for, whatever it is, known or not: use the things and rules the engine has."
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

/** The page that holds a described game: the engine, the description (readable, so a change is an edit of a few lines) and nothing else. */
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
${iconsTag(spec)}<script id="engine">${ENGINE_SOURCE}</script>
<script id="rules">
const game = Game.run(${json});
</script>
</body>
</html>
`;
}

/** The engine added to a page that uses it but does not carry it (a writer that followed `ENGINE_DOC`). */
export function withEngine(html: string): string {
  if (!/\bGame\.run\s*\(/.test(html) || /id=["']engine["']|var Game\s*=/.test(html)) return html;
  const tag = `<script id="engine">${ENGINE_SOURCE}</script>\n`;
  const at = html.search(/<script\b/i);
  return at >= 0 ? html.slice(0, at) + tag + html.slice(at) : html.replace(/<\/body>/i, `${tag}</body>`);
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
  return { name: `${slug}.html`, mime: "text/html", content: gamePage(spec) };
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
export async function chooseGameWay(request: string, _ask?: (q: string) => Promise<boolean | null>): Promise<{ way: "engine" | "code"; why: string }> {
  if (!ARCADE_WORDS.test(request) && !GAME_WORDS.test(request)) return { way: "code", why: "not a game" };
  if (WANTS_RAW.test(request)) return { way: "code", why: "you asked for the code itself" };
  if (WANTS_ENGINE.test(request)) return { way: "engine", why: "you asked for the engine" };
  return { way: "engine", why: "the engine first, code only if it judges it cannot" };
}

/** A file name for a game, from what it is called in the request ("a playable flappy bird game" is flappy-bird.html), never "index". */
export function gameFileName(request: string): string {
  const m = /\b([\p{L}\d-]+(?:\s+[\p{L}\d-]+)?)\s+(?:game|jeu)\b/iu.exec(request);
  const skip = new Set(["a", "an", "the", "un", "une", "le", "la", "playable", "simple", "small", "little", "fun", "new", "jouable", "petit", "make", "me", "create", "build", "fais", "cr\u00e9e"]);
  const words = (m?.[1] ?? "").toLowerCase().split(/\s+/).filter((w) => w && !skip.has(w));
  const slug = words.join("-").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]/g, "");
  return `${slug || "game"}.html`;
}
