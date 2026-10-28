/**
 * The prompts of the writers of the construction engine, one per kind of unit, for the prompt lab. They are made by the engine's own
 * context builder and instructions (`ContextEngine`, `WRITE_INSTRUCTIONS`), so the model is asked exactly what a real build asks of it,
 * for the units of a small platformer. Each has the code that works as its ideal and CODE CHECKS (`run`, `loads`): the answer is run, so
 * the score tells whether the unit works, not whether it looks like the ideal.
 */
import { ContextEngine } from "./construct/context";
import { WRITE_INSTRUCTIONS } from "./construct/docs";
import type { Plan, Unit } from "./construct/types";

export const STATE = {
  mode: "playing", score: 0, coinCount: 0, lives: 3, time: 300, camera: 0,
  input: { left: false, right: false },
  player: { x: 40, y: 160, w: 16, h: 24, vx: 0, vy: 0, grounded: false },
  ground: [{ x: 0, y: 200, w: 400, h: 40 }, { x: 460, y: 200, w: 340, h: 40 }],
  platforms: [{ x: 200, y: 140, w: 48, h: 12 }],
  enemies: [{ x: 300, y: 176, w: 16, h: 24, vx: -1, vy: 0, alive: true }],
  coins: [{ x: 210, y: 120, w: 10, h: 10, taken: false }],
  flag: { x: 760, y: 120, w: 8, h: 80 }
};
export const LAYOUT = `<canvas id="stage" width="640" height="240"></canvas>
<div id="hud"></div>
<style>
body { margin: 0; background: #5c94fc; font-family: monospace; }
#stage { display: block; margin: 0 auto; background: #87ceeb; }
#hud { position: fixed; top: 6px; left: 12px; color: #fff; font-size: 16px; text-shadow: 1px 1px #000; }
</style>`;

export const HITS = "function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }";
export const MOVE = "function moveThing(thing, dt) { return { ...thing, x: thing.x + (thing.vx || 0) * dt, y: thing.y + (thing.vy || 0) * dt }; }";
export const LAND = `function landOn(thing, solids) {
  if (thing.vy < 0) return { ...thing, grounded: false };
  for (const s of solids) {
    if (hits(thing, s) && thing.y + thing.h - thing.vy <= s.y + 1) return { ...thing, y: s.y - thing.h, vy: 0, grounded: true };
  }
  return { ...thing, grounded: false };
}`;
export const STOMP = "function stomps(player, enemy) { return hits(player, enemy) && player.vy > 0 && player.y + player.h - enemy.y <= enemy.h / 2; }";
export const COINS = `function collectCoins(player, coins) {
  let gained = 0;
  const list = coins.map((c) => { if (!c.taken && hits(player, c)) { gained++; return { ...c, taken: true }; } return c; });
  return { coins: list, gained };
}`;
export const TICK = `function onTick() {
  if (S.mode !== "playing") return;
  var p = { ...S.player, vx: (S.input.right ? 3 : 0) - (S.input.left ? 3 : 0), vy: S.player.vy + 0.5 };
  p = landOn(moveThing(p, 1), S.ground.concat(S.platforms));
  S.enemies = S.enemies.map(function (e) { return e.alive ? moveThing(e, 1) : e; });
  S.enemies.forEach(function (e, i) {
    if (!e.alive || !hits(p, e)) return;
    if (stomps(p, e)) { S.enemies[i] = { ...e, alive: false }; S.score += 100; p = { ...p, vy: -6 }; }
    else { S.lives -= 1; p = { ...p, x: 40, y: 160, vx: 0, vy: 0 }; }
  });
  if (p.y > 260) { S.lives -= 1; p = { ...p, x: 40, y: 160, vx: 0, vy: 0 }; }
  var got = collectCoins(p, S.coins);
  S.coins = got.coins; S.coinCount += got.gained; S.score += got.gained * 10;
  S.player = p;
  S.time -= 1 / 60;
  if (hits(p, S.flag)) S.mode = "won";
  else if (S.lives <= 0 || S.time <= 0) S.mode = "over";
}`;
export const JUMP = "function onJump() { if (S.mode === \"playing\" && S.player.grounded) { S.player = { ...S.player, vy: -9, grounded: false }; } }";
export const SCENE = `function drawScene() {
  ctx.fillStyle = "#87ceeb"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#8b5a2b";
  S.ground.concat(S.platforms).forEach(function (s) { ctx.fillRect(s.x - S.camera, s.y, s.w, s.h); });
  ctx.fillStyle = "#ffd700";
  S.coins.forEach(function (c) { if (!c.taken) ctx.fillRect(c.x - S.camera, c.y, c.w, c.h); });
  ctx.fillStyle = "#a0522d";
  S.enemies.forEach(function (e) { if (e.alive) ctx.fillRect(e.x - S.camera, e.y, e.w, e.h); });
  ctx.fillStyle = "#e52521";
  ctx.fillRect(S.player.x - S.camera, S.player.y, S.player.w, S.player.h);
}`;
export const HUD = "function drawHud() { var el = document.getElementById(\"hud\"); el.textContent = \"Score \" + S.score + \"   Lives \" + S.lives + \"   Time \" + Math.ceil(S.time); }";

export const flat = (code: string) => code.replace(/\s*\n\s*/g, " ");
const U = (kind: Unit["kind"], name: string, does: string, serves: string[], extra: Partial<Unit> = {}): Unit => ({ id: name, kind, name, does, serves, uses: [], examples: [], ...extra });

export const REQS = [
  "The player runs left and right with the arrow keys and jumps with the up arrow",
  "The player falls with gravity and stands on the ground and on platforms; there are holes in the ground",
  "Enemies walk; jumping on one from above kills it, touching it from the side costs a life",
  "Coins can be picked up and raise the score",
  "A countdown runs and the top bar shows score, lives and time",
  "Reaching the flag wins; no lives or no time left is game over"
].map((text, i) => ({ id: `R${i + 1}`, text }));

export const UNITS: Unit[] = [
  U("state", "S", "everything the program remembers: the mode, score, lives, time, camera, the keys, the player, the ground, platforms, enemies, coins and the flag", REQS.map((r) => r.id)),
  U("layout", "layout", "the page: a canvas for the scene and a box for the top bar", ["R5"]),
  U("fn", "hits", "true when two things with x, y, w, h overlap", ["R2", "R3"], { signature: "hits(a, b)" }),
  U("fn", "moveThing", "a copy of a thing moved by its speed for dt", ["R1", "R2"], { signature: "moveThing(thing, dt)" }),
  U("fn", "stomps", "true when the player lands on an enemy from above: they overlap, the player is falling and its feet are in the upper half of the enemy", ["R3"], { signature: "stomps(player, enemy)", uses: ["hits"], examples: [
    { call: "stomps({x:0,y:10,w:16,h:24,vx:0,vy:3},{x:4,y:30,w:16,h:24})", expect: "true" },
    { call: "stomps({x:0,y:30,w:16,h:24,vx:0,vy:0},{x:10,y:30,w:16,h:24})", expect: "false" }] }),
  U("fn", "landOn", "puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands", ["R2"], { signature: "landOn(thing, solids)", uses: ["hits"], examples: [
    { call: "landOn({x:0,y:178,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}])", expect: "{x:0,y:176,w:16,h:24,vy:0,grounded:true}" },
    { call: "landOn({x:0,y:100,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}])", expect: "{x:0,y:100,w:16,h:24,vy:2,grounded:false}" }] }),
  U("fn", "collectCoins", "marks the coins the player touches as taken and says how many were picked up now", ["R4"], { signature: "collectCoins(player, coins)", uses: ["hits"], examples: [
    { call: "collectCoins({x:0,y:0,w:10,h:10},[{x:5,y:5,w:4,h:4,taken:false}])", expect: "{coins:[{x:5,y:5,w:4,h:4,taken:true}],gained:1}" },
    { call: "collectCoins({x:0,y:0,w:10,h:10},[{x:50,y:5,w:4,h:4,taken:false}])", expect: "{coins:[{x:50,y:5,w:4,h:4,taken:false}],gained:0}" }] }),
  U("handler", "onTick", "one step of the game every 16 ms, only while playing: the player moves 3 left or right by the keys and falls (vy grows by 0.5) and lands on the ground and platforms; the enemies move; a stomp kills an enemy (+100, a small bounce), a side touch or a fall below y 260 costs a life and puts the player back at x 40, y 160; coins picked up give +10 and count in coinCount; the time goes down by 1/60; reaching the flag sets the mode to \"won\"; no lives or no time sets it to \"over\"", ["R1", "R2", "R3", "R4", "R5", "R6"], { on: "tick 16", uses: ["moveThing", "landOn", "hits", "stomps", "collectCoins"] }),
  U("handler", "onJump", "while playing and standing on something, the player jumps: vy becomes -9 and grounded false", ["R1"], { on: "keydown ArrowUp" }),
  U("view", "drawScene", "draws the sky, the ground and platforms, the coins not taken, the living enemies and the player as filled rectangles, each at its x minus S.camera", ["R1", "R2", "R3", "R4"], { into: "stage" }),
  U("view", "drawHud", "writes the score, the lives and the time left (rounded up) into the top bar", ["R5"], { into: "hud" })
];

export const given = (code: string) => `- given: ${flat(code)}`;
export const stateGiven = given(`var S = ${JSON.stringify(STATE)};`);
export const recorder = given(`var calls = [], ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }), canvas = { width: 640, height: 240, getContext: function () { return ctx; } }; var document = { getElementById: function () { return canvas; } };`);
export const boxes = given(`var els = {}, document = { getElementById: function (id) { return els[id] || (els[id] = { textContent: "", innerHTML: "" }); } };`);

interface Spec { name: string; unit: string; ideal: string; checks: string[] }
const SPECS: Spec[] = [
  { name: "U1 the state", unit: "S", ideal: JSON.stringify(STATE, null, 2), checks: ["json", 'contains: "mode"', 'contains: "player"', 'contains: "enemies"', 'regex: "(input|keys)"', 'regex: "w"\\s*:', "not: //", "not: function", "not: []"] },
  { name: "U2 the layout", unit: "layout", ideal: LAYOUT, checks: ['contains: <canvas id="stage"', 'contains: id="hud"', "regex: <style", "not: <script", "not: <body", "not: <html"] },
  { name: "U3 stomps (a function with examples)", unit: "stomps", ideal: STOMP, checks: [
    given(HITS), "loads",
    "run: stomps({x:0,y:10,w:16,h:24,vx:0,vy:3},{x:4,y:30,w:16,h:24}) => true",
    "run: stomps({x:0,y:30,w:16,h:24,vx:0,vy:0},{x:10,y:30,w:16,h:24}) => false",
    "run: stomps({x:0,y:10,w:16,h:24,vx:0,vy:-2},{x:4,y:30,w:16,h:24}) => false",
    "run: stomps({x:0,y:0,w:16,h:24,vx:0,vy:3},{x:100,y:30,w:16,h:24}) => false",
    "run: stomps({x:0,y:20,w:16,h:24,vx:0,vy:3},{x:4,y:30,w:16,h:24}) => false",
    "run: stomps(Object.freeze({x:0,y:10,w:16,h:24,vx:0,vy:3}), Object.freeze({x:4,y:30,w:16,h:24})) => true"] },
  { name: "U4 landOn (a function that returns a changed copy)", unit: "landOn", ideal: LAND, checks: [
    given(HITS), "loads",
    "run: landOn({x:0,y:178,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}]) => {x:0,y:176,w:16,h:24,vy:0,grounded:true}",
    "run: landOn({x:0,y:100,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}]) => {x:0,y:100,w:16,h:24,vy:2,grounded:false}",
    "run: landOn({x:0,y:178,w:16,h:24,vy:-2},[{x:0,y:200,w:100,h:40}]) => {x:0,y:178,w:16,h:24,vy:-2,grounded:false}",
    "run: landOn({x:90,y:210,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}]).grounded => false",
    "run: landOn({x:0,y:178,w:16,h:24,vy:2},[{x:300,y:200,w:10,h:10},{x:0,y:200,w:100,h:40}]).y => 176",
    "run: landOn(Object.freeze({x:0,y:178,w:16,h:24,vy:2}),Object.freeze([{x:0,y:200,w:100,h:40}])).grounded => true"] },
  { name: "U5 collectCoins (a function that returns two things)", unit: "collectCoins", ideal: COINS, checks: [
    given(HITS), "loads",
    "run: collectCoins({x:0,y:0,w:10,h:10},[{x:5,y:5,w:4,h:4,taken:false}]) => {coins:[{x:5,y:5,w:4,h:4,taken:true}],gained:1}",
    "run: collectCoins({x:0,y:0,w:10,h:10},[{x:50,y:5,w:4,h:4,taken:false}]) => {coins:[{x:50,y:5,w:4,h:4,taken:false}],gained:0}",
    "run: collectCoins({x:0,y:0,w:10,h:10},[{x:5,y:5,w:4,h:4,taken:true}]).gained => 0",
    "run: collectCoins({x:0,y:0,w:10,h:10},[{x:1,y:1,w:2,h:2,taken:false},{x:6,y:6,w:2,h:2,taken:false},{x:90,y:6,w:2,h:2,taken:false}]).gained => 2",
    "run: collectCoins({x:0,y:0,w:10,h:10},[]) => {coins:[],gained:0}"] },
  { name: "U6 onTick (the handler that does the most)", unit: "onTick", ideal: TICK, checks: [
    stateGiven, given(HITS), given(MOVE), given(LAND), given(STOMP), given(COINS), "loads",
    "run: (S.input.right = true, onTick(), S.player.x) => 43",
    "run: (S.input.left = true, onTick(), S.player.x) => 37",
    "run: (onTick(), S.player.vy) => 0.5",
    "run: (S.player.y = 176, S.player.vy = 1, onTick(), S.player.grounded) => true",
    "run: (onTick(), Math.round(S.time * 60)) => 17999",
    "run: (S.player = {x:300,y:160,w:16,h:24,vx:0,vy:3,grounded:false}, onTick(), [S.enemies[0].alive, S.score]) => [false, 100]",
    "run: (S.player = {x:300,y:176,w:16,h:24,vx:0,vy:0,grounded:true}, onTick(), S.lives) => 2",
    "run: (S.lives = 1, S.player = {x:300,y:176,w:16,h:24,vx:0,vy:0,grounded:true}, onTick(), S.mode) => \"over\"",
    "run: (S.player = {x:205,y:100,w:16,h:24,vx:0,vy:0,grounded:false}, onTick(), [S.coinCount, S.score]) => [1, 10]",
    "run: (S.player = {x:420,y:260,w:16,h:24,vx:0,vy:0,grounded:false}, onTick(), [S.lives, S.player.x, S.player.y]) => [2, 40, 160]",
    "run: (S.player = {x:755,y:150,w:16,h:24,vx:0,vy:0,grounded:false}, onTick(), S.mode) => \"won\"",
    "run: (S.mode = \"over\", S.input.right = true, onTick(), S.player.x) => 40"] },
  { name: "U7 onJump (a key handler)", unit: "onJump", ideal: JUMP, checks: [
    stateGiven, "loads",
    "run: (S.player.grounded = true, onJump(), [S.player.vy, S.player.grounded]) => [-9, false]",
    "run: (onJump(), S.player.vy) => 0",
    "run: (S.player.grounded = true, S.mode = \"over\", onJump(), S.player.vy) => 0"] },
  { name: "U8 drawScene (a view on a canvas)", unit: "drawScene", ideal: SCENE, checks: [
    stateGiven, recorder, "loads",
    "run: (drawScene(), calls.filter(function (c) { return c[0] === 'fillRect'; }).length >= 6) => true",
    "run: (drawScene(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false",
    "run: (drawScene(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 40 && c[2] === 160 && c[3] === 16 && c[4] === 24; })) => true",
    "run: (S.camera = 100, drawScene(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === -60 && c[2] === 160; })) => true",
    "run: (S.coins[0].taken = true, drawScene(), calls.filter(function (c) { return c[0] === 'fillRect' && c[1] === 210 && c[2] === 120; }).length) => 0",
    "run: (S.enemies[0].alive = false, drawScene(), calls.filter(function (c) { return c[0] === 'fillRect' && c[1] === 300 && c[2] === 176; }).length) => 0",
    "run: (drawScene(), calls.some(function (c) { return (c[0] === 'fillRect' && c[1] === 210 && c[2] === 120) || c[0] === 'arc'; })) => true"] },
  { name: "U9 drawHud (a view on a box)", unit: "drawHud", ideal: HUD, checks: [
    stateGiven, boxes, "loads",
    "run: (S.score = 120, drawHud(), /120/.test(els.hud.textContent + els.hud.innerHTML)) => true",
    "run: (S.lives = 7, drawHud(), /7/.test(els.hud.textContent + els.hud.innerHTML)) => true",
    "run: (S.time = 241.2, drawHud(), /242/.test(els.hud.textContent + els.hud.innerHTML)) => true",
    "run: (drawHud(), Object.keys(els).join()) => \"hud\""] }
];

function build(): string {
  const plan: Plan = { title: "Mario-like platformer", language: "English", requirements: REQS, units: UNITS };
  const engine = new ContextEngine(plan, 12000);
  const code: Record<string, string> = { S: JSON.stringify(STATE), layout: LAYOUT, hits: HITS, moveThing: MOVE, stomps: STOMP, landOn: LAND, collectCoins: COINS, onTick: TICK, onJump: JUMP, drawScene: SCENE, drawHud: HUD };
  for (const u of UNITS) if (u.kind === "state" || u.kind === "layout" || u.kind === "fn") engine.accept(u.name, { code: code[u.name], verified: true, problems: [] });
  const sections = SPECS.map((s) => {
    const u = UNITS.find((x) => x.name === s.unit)!;
    const system = WRITE_INSTRUCTIONS(u.kind).replace(/\s*\n\s*/g, " ");
    return `## ${s.name}

${engine.build(u).text}

### Options

- system: ${system}

### Checks

${s.checks.map((c) => (c.startsWith("- ") ? c : `- ${c}`)).join("\n")}

### Ideal

\`\`\`
${s.ideal}
\`\`\`
`;
  });
  return `---
title: The writers of the engine, unit by unit
runs: 3
max_tokens: 1200
thinking: off
---

# The writers of the engine, unit by unit

Each prompt is what a writer of the construction engine really receives for one unit of a small platformer: its instructions as the system message, and the context the engine builds for it (requirements, task, state, elements of the page, the functions it may call). The score does not look at how much the code resembles the ideal: it RUNS the answer. "the code loads" and every "gives" line are checks run on the code, in isolation, with the state and the functions the unit would find in the page; a green line means the unit does that.
Read the answers for: the name and signature asked, no code outside the unit, no new names, nothing that the page already does (loop, clearing, listeners).

${sections.join("\n")}`;
}

export const LAB_UNIT_TESTS = build();
export const UNIT_SPECS = SPECS;
