import { unit, type Template } from "./types";

const state = {
  mode: "playing", time: 0, score: 0, lives: 3, cameraX: 0, worldW: 2400, worldH: 450,
  input: { left: false, right: false, jump: false },
  player: { x: 60, y: 300, w: 28, h: 36, vx: 0, vy: 0, grounded: false, facing: 1, spawnX: 60, spawnY: 300 },
  platforms: [
    { x: 0, y: 400, w: 900, h: 50 }, { x: 1000, y: 400, w: 1400, h: 50 },
    { x: 300, y: 320, w: 120, h: 20 }, { x: 520, y: 250, w: 120, h: 20 }, { x: 1200, y: 310, w: 140, h: 20 }, { x: 1500, y: 240, w: 140, h: 20 }
  ],
  enemies: [
    { x: 600, y: 372, w: 28, h: 28, vx: -1.2, vy: 0, alive: true, minX: 450, maxX: 850 },
    { x: 1300, y: 372, w: 28, h: 28, vx: 1.2, vy: 0, alive: true, minX: 1100, maxX: 1800 }
  ],
  coins: [
    { x: 340, y: 280, w: 16, h: 16, taken: false }, { x: 560, y: 210, w: 16, h: 16, taken: false },
    { x: 1240, y: 270, w: 16, h: 16, taken: false }, { x: 1540, y: 200, w: 16, h: 16, taken: false }, { x: 1900, y: 360, w: 16, h: 16, taken: false }
  ],
  flag: { x: 2300, y: 320, w: 20, h: 80 }
};

const layout = `<canvas id="stage" width="800" height="450"></canvas>
<div id="hud"><span id="score"></span><span id="lives"></span><span id="message"></span></div>
<style>
body { background: #1b1f2a; color: #fff; display: flex; flex-direction: column; align-items: center; padding-top: 16px; }
#stage { background: #87ceeb; border: 3px solid #fff; border-radius: 6px; }
#hud { width: 800px; display: flex; justify-content: space-between; font-size: 20px; font-weight: 700; margin-top: 8px; }
#message { color: #ffd54a; }
</style>`;

const code: Record<string, string> = {
  S: JSON.stringify(state, null, 2),
  layout,
  moveThing: `function moveThing(thing, dt) {
  return { ...thing, x: thing.x + thing.vx * dt, y: thing.y + thing.vy * dt };
}`,
  hits: `function hits(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}`,
  applyInput: `function applyInput(player, input) {
  var vx = 0;
  if (input.left) vx -= 3.2;
  if (input.right) vx += 3.2;
  var vy = player.vy, grounded = player.grounded;
  if (input.jump && player.grounded) { vy = -11.5; grounded = false; }
  return { ...player, vx: vx, vy: vy, grounded: grounded, facing: vx > 0 ? 1 : vx < 0 ? -1 : player.facing };
}`,
  applyGravity: `function applyGravity(thing) {
  return { ...thing, vy: Math.min(thing.vy + 0.5, 12) };
}`,
  landOn: `function landOn(thing, solids) {
  var before = thing.y + thing.h - thing.vy;
  for (var i = 0; i < solids.length; i++) {
    var s = solids[i];
    var over = thing.x + thing.w > s.x && thing.x < s.x + s.w;
    if (over && thing.vy >= 0 && before <= s.y + 1 && thing.y + thing.h >= s.y) {
      return { ...thing, y: s.y - thing.h, vy: 0, grounded: true };
    }
  }
  return { ...thing, grounded: false };
}`,
  patrol: `function patrol(enemy) {
  if (enemy.x <= enemy.minX) return { ...enemy, vx: Math.abs(enemy.vx) };
  if (enemy.x + enemy.w >= enemy.maxX) return { ...enemy, vx: -Math.abs(enemy.vx) };
  return { ...enemy };
}`,
  resolveEnemyHit: `function resolveEnemyHit(player, enemy) {
  if (!enemy.alive || !hits(player, enemy)) return { player: player, enemy: enemy, result: "none" };
  var before = player.y + player.h - player.vy;
  if (player.vy > 0 && before <= enemy.y + enemy.h / 2) return { player: { ...player, vy: -7 }, enemy: { ...enemy, alive: false }, result: "stomp" };
  return { player: player, enemy: enemy, result: "hurt" };
}`,
  takeCoins: `function takeCoins(player, coins) {
  var gained = 0;
  var next = coins.map(function (c) {
    if (!c.taken && hits(player, c)) { gained += 1; return { ...c, taken: true }; }
    return c;
  });
  return { coins: next, gained: gained };
}`,
  followCamera: `function followCamera(playerX, worldW, viewW) {
  return Math.max(0, Math.min(playerX - viewW / 3, worldW - viewW));
}`,
  respawn: `function respawn(player) {
  return { ...player, x: player.spawnX, y: player.spawnY, vx: 0, vy: 0, grounded: false };
}`,
  drawWorld: `function drawWorld() {
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  var cam = S.cameraX;
  ctx.fillStyle = "#6b4a2b";
  for (var i = 0; i < S.platforms.length; i++) { var p = S.platforms[i]; ctx.fillRect(p.x - cam, p.y, p.w, p.h); ctx.fillStyle = "#3f8f3a"; ctx.fillRect(p.x - cam, p.y, p.w, 6); ctx.fillStyle = "#6b4a2b"; }
  ctx.fillStyle = "#ffd54a";
  for (var j = 0; j < S.coins.length; j++) { var c = S.coins[j]; if (!c.taken) { ctx.beginPath(); ctx.arc(c.x - cam + c.w / 2, c.y + c.h / 2, c.w / 2, 0, Math.PI * 2); ctx.fill(); } }
  ctx.fillStyle = "#8d3b2f";
  for (var k = 0; k < S.enemies.length; k++) { var e = S.enemies[k]; if (e.alive) ctx.fillRect(e.x - cam, e.y, e.w, e.h); }
  ctx.fillStyle = "#ffffff"; ctx.fillRect(S.flag.x - cam, S.flag.y, 4, S.flag.h);
  ctx.fillStyle = "#e53935"; ctx.fillRect(S.flag.x - cam + 4, S.flag.y, S.flag.w, 24);
  var pl = S.player;
  ctx.fillStyle = "#e53935"; ctx.fillRect(pl.x - cam, pl.y, pl.w, pl.h);
  ctx.fillStyle = "#ffcc99"; ctx.fillRect(pl.x - cam + (pl.facing > 0 ? 14 : 2), pl.y + 6, 12, 10);
}`,
  drawHud: `function drawHud() {
  const hud = document.getElementById("hud");
  hud.querySelector("#score").textContent = "Score " + S.score;
  hud.querySelector("#lives").textContent = "Lives " + S.lives;
  hud.querySelector("#message").textContent = S.mode === "won" ? "You made it! Press Enter" : S.mode === "over" ? "Game over. Press Enter" : "";
}`,
  onLeftDown: `function onLeftDown() { S.input.left = true; }`,
  onLeftUp: `function onLeftUp() { S.input.left = false; }`,
  onRightDown: `function onRightDown() { S.input.right = true; }`,
  onRightUp: `function onRightUp() { S.input.right = false; }`,
  onJumpDown: `function onJumpDown() { S.input.jump = true; }`,
  onJumpUp: `function onJumpUp() { S.input.jump = false; }`,
  onRestart: `function onRestart() {
  if (S.mode === "playing") return;
  S.player = respawn(S.player);
  S.lives = 3; S.score = 0; S.time = 0; S.cameraX = 0; S.mode = "playing";
  S.coins = S.coins.map(function (c) { return { ...c, taken: false }; });
  S.enemies = S.enemies.map(function (e) { return { ...e, alive: true, x: e.minX + 10 }; });
}`,
  onTick: `function onTick() {
  if (S.mode !== "playing") return;
  S.time += 0.016;
  var p = applyInput(S.player, S.input);
  p = applyGravity(p);
  p = moveThing(p, 1);
  p = landOn(p, S.platforms);
  p.x = Math.max(0, Math.min(p.x, S.worldW - p.w));
  var hurt = false;
  S.enemies = S.enemies.map(function (e) {
    if (!e.alive) return e;
    var moved = moveThing(patrol(e), 1);
    var r = resolveEnemyHit(p, moved);
    if (r.result === "stomp") { p = r.player; S.score += 100; return r.enemy; }
    if (r.result === "hurt") hurt = true;
    return moved;
  });
  var got = takeCoins(p, S.coins);
  S.coins = got.coins; S.score += got.gained * 10;
  if (hurt || p.y > S.worldH) {
    S.lives -= 1;
    p = respawn(p);
    if (S.lives <= 0) S.mode = "over";
  }
  if (hits(p, S.flag)) S.mode = "won";
  S.player = p;
  S.cameraX = followCamera(p.x, S.worldW, 800);
}`
};

export const PLATFORMER: Template = {
  id: "platformer",
  label: "Side-view platformer",
  question: "Is it a game seen from the side where a character runs and jumps across platforms (like Mario, a runner or a jump and run)?",
  code,
  plan: {
    title: "Platformer",
    language: "English",
    requirements: [
      { id: "R1", text: "A character is shown on a level made of platforms and can run left and right with the arrow keys." },
      { id: "R2", text: "The character jumps with Space and falls under gravity, landing on platforms." },
      { id: "R3", text: "The level scrolls to follow the character." },
      { id: "R4", text: "Enemies walk back and forth; jumping on one defeats it, touching it from the side costs a life." },
      { id: "R5", text: "Coins can be collected and add to the score." },
      { id: "R6", text: "Falling into a pit costs a life; at zero lives the game is over." },
      { id: "R7", text: "Reaching the flag wins; Enter restarts." },
      { id: "R8", text: "The score and the lives are shown." }
    ],
    units: [
      unit({ kind: "state", name: "S", does: "everything the game remembers: mode, player, platforms, enemies, coins, flag, input, camera", serves: ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"] }),
      unit({ kind: "layout", name: "layout", does: "the canvas and the bar with score, lives and message", serves: ["R1", "R8"] }),
      unit({ kind: "fn", name: "moveThing", does: "a copy of a thing moved by its speed for dt", serves: ["R1", "R2", "R4"], signature: "moveThing(thing, dt) -> thing", examples: [["moveThing({x:0,y:0,vx:2,vy:1}, 1)", "{x:2,y:1,vx:2,vy:1}"]], shared: true }),
      unit({ kind: "fn", name: "hits", does: "true when two things with x, y, w, h overlap", serves: ["R4", "R5", "R7"], signature: "hits(a, b) -> boolean", examples: [["hits({x:0,y:0,w:2,h:2},{x:1,y:1,w:2,h:2})", "true"], ["hits({x:0,y:0,w:2,h:2},{x:5,y:0,w:2,h:2})", "false"]], shared: true }),
      unit({ kind: "fn", name: "applyInput", does: "sets the horizontal speed and facing from the held keys, and starts a jump from the ground", serves: ["R1", "R2"], signature: "applyInput(player, input) -> player" }),
      unit({ kind: "fn", name: "applyGravity", does: "adds gravity to the vertical speed, capped", serves: ["R2"], signature: "applyGravity(thing) -> thing", examples: [["applyGravity({vy:0}).vy", "0.5"]] }),
      unit({ kind: "fn", name: "landOn", does: "puts a thing that fell onto the top of a solid on it, grounded, otherwise not grounded", serves: ["R2"], signature: "landOn(thing, solids) -> thing" }),
      unit({ kind: "fn", name: "patrol", does: "turns an enemy around at the ends of its walk", serves: ["R4"], signature: "patrol(enemy) -> enemy" }),
      unit({ kind: "fn", name: "resolveEnemyHit", does: "says if the player stomped, was hurt by, or missed an enemy", serves: ["R4"], uses: ["hits"], signature: "resolveEnemyHit(player, enemy) -> {player, enemy, result}" }),
      unit({ kind: "fn", name: "takeCoins", does: "marks the coins the player touches as taken and counts them", serves: ["R5"], uses: ["hits"], signature: "takeCoins(player, coins) -> {coins, gained}" }),
      unit({ kind: "fn", name: "followCamera", does: "the scroll that keeps the player in view, inside the world", serves: ["R3"], signature: "followCamera(playerX, worldW, viewW) -> number", examples: [["followCamera(0, 2400, 800)", "0"], ["followCamera(2400, 2400, 800)", "1600"]] }),
      unit({ kind: "fn", name: "respawn", does: "puts the player back at the start, still", serves: ["R6"], signature: "respawn(player) -> player" }),
      unit({ kind: "view", name: "drawWorld", does: "draws the platforms, coins, enemies, flag and the player, shifted by the camera", serves: ["R1", "R3", "R4", "R5"], into: "stage" }),
      unit({ kind: "view", name: "drawHud", does: "writes the score, the lives and the end message", serves: ["R8", "R7"], into: "hud" }),
      unit({ kind: "handler", name: "onLeftDown", does: "holds left", serves: ["R1"], on: "keydown ArrowLeft" }),
      unit({ kind: "handler", name: "onLeftUp", does: "releases left", serves: ["R1"], on: "keyup ArrowLeft" }),
      unit({ kind: "handler", name: "onRightDown", does: "holds right", serves: ["R1"], on: "keydown ArrowRight" }),
      unit({ kind: "handler", name: "onRightUp", does: "releases right", serves: ["R1"], on: "keyup ArrowRight" }),
      unit({ kind: "handler", name: "onJumpDown", does: "holds jump", serves: ["R2"], on: "keydown Space" }),
      unit({ kind: "handler", name: "onJumpUp", does: "releases jump", serves: ["R2"], on: "keyup Space" }),
      unit({ kind: "handler", name: "onRestart", does: "starts again after the end", serves: ["R7"], on: "keydown Enter" }),
      unit({ kind: "handler", name: "onTick", does: "the step of the game: move the player, enemies, coins, lives, win, camera", serves: ["R1", "R2", "R3", "R4", "R5", "R6", "R7"], uses: ["applyInput", "applyGravity", "moveThing", "landOn", "patrol", "resolveEnemyHit", "takeCoins", "respawn", "hits", "followCamera"], on: "tick 16" })
    ]
  }
};
