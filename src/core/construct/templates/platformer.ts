import { unit, type Template } from "./types";

const level = (worldW: number, platforms: number[][], enemies: number[][], coins: number[][], flagX: number) => ({
  worldW,
  platforms: platforms.map(([x, y, w, h]) => ({ x, y, w, h })),
  enemies: enemies.map(([x, minX, maxX, v]) => ({ x, y: 372, w: 28, h: 28, vx: v, vy: 0, alive: true, minX, maxX })),
  coins: coins.map(([x, y]) => ({ x, y, w: 16, h: 16, taken: false })),
  flag: { x: flagX, y: 320, w: 20, h: 80 }
});

// every picture is a drawing at its real size (so a line is as thick in one as in another), in the colours of the palette, with the one outline width of the art
const sprites = {
  hero: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 36' width='28' height='36'><rect x='5' y='25' width='8' height='10' rx='2' fill='var(--pants, #2b4a9e)' stroke='var(--outline, #3b2314)' stroke-width='2'/><rect x='15' y='25' width='8' height='10' rx='2' fill='var(--pants, #2b4a9e)' stroke='var(--outline, #3b2314)' stroke-width='2'/><rect x='4' y='12' width='20' height='16' rx='4' fill='var(--shirt, #e53935)' stroke='var(--outline, #3b2314)' stroke-width='2'/><circle cx='14' cy='9' r='8' fill='var(--skin, #ffcc99)' stroke='var(--outline, #3b2314)' stroke-width='2'/><path d='M5 8 Q14 -2 23 8 L24 10 L4 10 Z' fill='var(--shirt, #e53935)' stroke='var(--outline, #3b2314)' stroke-width='2'/><circle cx='18' cy='10' r='1.5' fill='var(--outline, #3b2314)'/></svg>",
  enemy: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28' width='28' height='28'><rect x='8' y='16' width='12' height='10' rx='3' fill='var(--skin, #ffcc99)' stroke='var(--outline, #3b2314)' stroke-width='2'/><path d='M2 18 Q2 3 14 3 Q26 3 26 18 Z' fill='var(--enemy, #8d3b2f)' stroke='var(--outline, #3b2314)' stroke-width='2'/><circle cx='10' cy='14' r='2' fill='var(--white, #ffffff)'/><circle cx='18' cy='14' r='2' fill='var(--white, #ffffff)'/></svg>",
  coin: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' width='16' height='16'><circle cx='8' cy='8' r='6' fill='var(--coin, #ffd54a)' stroke='var(--outline, #3b2314)' stroke-width='2'/><rect x='7' y='4' width='2' height='8' fill='var(--outline, #3b2314)'/></svg>",
  flag: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 80' width='20' height='80'><rect x='1' y='1' width='4' height='78' fill='var(--pole, #f5f5f5)' stroke='var(--outline, #3b2314)' stroke-width='2'/><polygon points='5,3 19,12 5,22' fill='var(--shirt, #e53935)' stroke='var(--outline, #3b2314)' stroke-width='2'/></svg>"
};

const levels = [
  level(2400, [[0, 400, 900, 50], [1000, 400, 1400, 50], [300, 320, 120, 20], [520, 250, 120, 20], [1200, 310, 140, 20], [1500, 240, 140, 20]], [[600, 450, 850, -1.2], [1300, 1100, 1800, 1.2]], [[340, 280], [560, 210], [1240, 270], [1540, 200], [1900, 360]], 2300),
  level(2600, [[0, 400, 700, 50], [800, 400, 500, 50], [1400, 400, 1200, 50], [200, 320, 120, 20], [450, 250, 100, 20], [900, 300, 120, 20], [1500, 300, 140, 20], [1750, 230, 140, 20]], [[500, 300, 680, -1.4], [1000, 850, 1280, 1.4], [1700, 1450, 2300, -1.6]], [[230, 280], [480, 210], [930, 260], [1540, 260], [1790, 190], [2100, 360]], 2500)
];

const state = {
  mode: "playing", time: 0, score: 0, lives: 3, cameraX: 0, worldH: 450, levelIndex: 0,
  config: { walk: 3.2, jump: 11.5, gravity: 0.5, maxFall: 12, stompBounce: 7, startLives: 3 },
  input: { left: false, right: false, jump: false },
  player: { x: 60, y: 300, w: 28, h: 36, vx: 0, vy: 0, grounded: false, facing: 1, spawnX: 60, spawnY: 300 },
  ...levels[0],
  levels,
  art: {
    stroke: 2,
    palette: { outline: "#3b2314", skin: "#ffcc99", shirt: "#e53935", pants: "#2b4a9e", enemy: "#8d3b2f", coin: "#ffd54a", pole: "#f5f5f5", white: "#ffffff", sky: "#87ceeb", ground: "#6b4a2b", grass: "#3f8f3a" },
    sizes: { hero: [28, 36], enemy: [28, 28], coin: [16, 16], flag: [20, 80] },
    sprites
  }
};

const layout = `<canvas id="stage" width="800" height="450"></canvas>
<div id="hud"><span id="score"></span><span id="level"></span><span id="lives"></span><span id="message"></span></div>
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
  applyInput: `function applyInput(player, input, config) {
  var vx = 0;
  if (input.left) vx -= config.walk;
  if (input.right) vx += config.walk;
  var vy = player.vy, grounded = player.grounded;
  if (input.jump && player.grounded) { vy = -config.jump; grounded = false; }
  return { ...player, vx: vx, vy: vy, grounded: grounded, facing: vx > 0 ? 1 : vx < 0 ? -1 : player.facing };
}`,
  applyGravity: `function applyGravity(thing, config) {
  return { ...thing, vy: Math.min(thing.vy + config.gravity, config.maxFall) };
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
  resolveEnemyHit: `function resolveEnemyHit(player, enemy, config) {
  if (!enemy.alive || !hits(player, enemy)) return { player: player, enemy: enemy, result: "none" };
  var before = player.y + player.h - player.vy;
  if (player.vy > 0 && before <= enemy.y + enemy.h / 2) return { player: { ...player, vy: -config.stompBounce }, enemy: { ...enemy, alive: false }, result: "stomp" };
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
  loadLevel: `function loadLevel(level) {
  return JSON.parse(JSON.stringify({ worldW: level.worldW, platforms: level.platforms, enemies: level.enemies, coins: level.coins, flag: level.flag }));
}`,
  drawWorld: `function drawWorld() {
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  var cam = S.cameraX, A = S.art, P = A.palette, im;
  ctx.fillStyle = P.sky; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (var i = 0; i < S.platforms.length; i++) { var p = S.platforms[i]; ctx.fillStyle = P.ground; ctx.fillRect(p.x - cam, p.y, p.w, p.h); ctx.fillStyle = P.grass; ctx.fillRect(p.x - cam, p.y, p.w, 6); }
  for (var j = 0; j < S.coins.length; j++) {
    var c = S.coins[j]; if (c.taken) continue;
    im = sprite(A.sprites.coin, P);
    if (im) ctx.drawImage(im, c.x - cam, c.y, c.w, c.h); else { ctx.fillStyle = P.coin; ctx.fillRect(c.x - cam, c.y, c.w, c.h); }
  }
  for (var k = 0; k < S.enemies.length; k++) {
    var e = S.enemies[k]; if (!e.alive) continue;
    im = sprite(A.sprites.enemy, P);
    if (im) ctx.drawImage(im, e.x - cam, e.y, e.w, e.h); else { ctx.fillStyle = P.enemy; ctx.fillRect(e.x - cam, e.y, e.w, e.h); }
  }
  im = sprite(A.sprites.flag, P);
  if (im) ctx.drawImage(im, S.flag.x - cam, S.flag.y, S.flag.w, S.flag.h); else { ctx.fillStyle = P.pole; ctx.fillRect(S.flag.x - cam, S.flag.y, S.flag.w, S.flag.h); }
  var pl = S.player;
  im = sprite(A.sprites.hero, P);
  if (im) {
    ctx.save();
    if (pl.facing < 0) { ctx.translate(pl.x - cam + pl.w, pl.y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, pl.w, pl.h); }
    else ctx.drawImage(im, pl.x - cam, pl.y, pl.w, pl.h);
    ctx.restore();
  } else { ctx.fillStyle = P.shirt; ctx.fillRect(pl.x - cam, pl.y, pl.w, pl.h); }
}`,
  drawHud: `function drawHud() {
  const hud = document.getElementById("hud");
  hud.querySelector("#score").textContent = "Score " + S.score;
  hud.querySelector("#level").textContent = "Level " + (S.levelIndex + 1) + "/" + S.levels.length;
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
  Object.assign(S, loadLevel(S.levels[0]));
  S.levelIndex = 0;
  S.player = respawn(S.player);
  S.lives = S.config.startLives; S.score = 0; S.time = 0; S.cameraX = 0; S.mode = "playing";
}`,
  onTick: `function onTick() {
  if (S.mode !== "playing") return;
  S.time += 0.016;
  var p = applyInput(S.player, S.input, S.config);
  p = applyGravity(p, S.config);
  p = moveThing(p, 1);
  p = landOn(p, S.platforms);
  p.x = Math.max(0, Math.min(p.x, S.worldW - p.w));
  var hurt = false;
  S.enemies = S.enemies.map(function (e) {
    if (!e.alive) return e;
    var moved = moveThing(patrol(e), 1);
    var r = resolveEnemyHit(p, moved, S.config);
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
  if (hits(p, S.flag)) {
    if (S.levelIndex + 1 < S.levels.length) {
      S.levelIndex += 1; S.score += 500;
      Object.assign(S, loadLevel(S.levels[S.levelIndex]));
      p = respawn(p);
    } else S.mode = "won";
  }
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
      { id: "R7", text: "Reaching the flag leads to the next level, and to a win after the last; Enter restarts." },
      { id: "R8", text: "The score and the lives are shown." }
    ],
    units: [
      unit({ kind: "state", name: "S", does: "everything the game remembers: mode, player, platforms, enemies, coins, flag, input, camera", serves: ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"] }),
      unit({ kind: "layout", name: "layout", does: "the canvas and the bar with score, lives and message", serves: ["R1", "R8"] }),
      unit({ kind: "fn", name: "moveThing", does: "a copy of a thing moved by its speed for dt", serves: ["R1", "R2", "R4"], signature: "moveThing(thing, dt) -> thing", examples: [["moveThing({x:0,y:0,vx:2,vy:1}, 1)", "{x:2,y:1,vx:2,vy:1}"]], shared: true }),
      unit({ kind: "fn", name: "hits", does: "true when two things with x, y, w, h overlap", serves: ["R4", "R5", "R7"], signature: "hits(a, b) -> boolean", examples: [["hits({x:0,y:0,w:2,h:2},{x:1,y:1,w:2,h:2})", "true"], ["hits({x:0,y:0,w:2,h:2},{x:5,y:0,w:2,h:2})", "false"]], shared: true }),
      unit({ kind: "fn", name: "applyInput", does: "sets the horizontal speed and facing from the held keys, and starts a jump from the ground", serves: ["R1", "R2"], signature: "applyInput(player, input, config) -> player" }),
      unit({ kind: "fn", name: "applyGravity", does: "adds gravity to the vertical speed, capped", serves: ["R2"], signature: "applyGravity(thing, config) -> thing", examples: [["applyGravity({vy:0}, {gravity:0.5, maxFall:12}).vy", "0.5"]] }),
      unit({ kind: "fn", name: "landOn", does: "puts a thing that fell onto the top of a solid on it, grounded, otherwise not grounded", serves: ["R2"], signature: "landOn(thing, solids) -> thing" }),
      unit({ kind: "fn", name: "patrol", does: "turns an enemy around at the ends of its walk", serves: ["R4"], signature: "patrol(enemy) -> enemy" }),
      unit({ kind: "fn", name: "resolveEnemyHit", does: "says if the player stomped, was hurt by, or missed an enemy", serves: ["R4"], uses: ["hits"], signature: "resolveEnemyHit(player, enemy, config) -> {player, enemy, result}" }),
      unit({ kind: "fn", name: "takeCoins", does: "marks the coins the player touches as taken and counts them", serves: ["R5"], uses: ["hits"], signature: "takeCoins(player, coins) -> {coins, gained}" }),
      unit({ kind: "fn", name: "followCamera", does: "the scroll that keeps the player in view, inside the world", serves: ["R3"], signature: "followCamera(playerX, worldW, viewW) -> number", examples: [["followCamera(0, 2400, 800)", "0"], ["followCamera(2400, 2400, 800)", "1600"]] }),
      unit({ kind: "fn", name: "loadLevel", does: "a copy of one level of the levels list, ready to become the active level", serves: ["R7"], signature: "loadLevel(level) -> level" }),
      unit({ kind: "fn", name: "respawn", does: "puts the player back at the start, still", serves: ["R6"], signature: "respawn(player) -> player" }),
      unit({ kind: "view", name: "drawWorld", does: "draws the sky, platforms, coins, enemies, flag and the player as pictures of S.art (a plain shape while a picture loads), shifted by the camera", serves: ["R1", "R3", "R4", "R5"], into: "stage" }),
      unit({ kind: "view", name: "drawHud", does: "writes the score, the lives and the end message", serves: ["R8", "R7"], into: "hud" }),
      unit({ kind: "handler", name: "onLeftDown", does: "holds left", serves: ["R1"], on: "keydown ArrowLeft" }),
      unit({ kind: "handler", name: "onLeftUp", does: "releases left", serves: ["R1"], on: "keyup ArrowLeft" }),
      unit({ kind: "handler", name: "onRightDown", does: "holds right", serves: ["R1"], on: "keydown ArrowRight" }),
      unit({ kind: "handler", name: "onRightUp", does: "releases right", serves: ["R1"], on: "keyup ArrowRight" }),
      unit({ kind: "handler", name: "onJumpDown", does: "holds jump", serves: ["R2"], on: "keydown Space" }),
      unit({ kind: "handler", name: "onJumpUp", does: "releases jump", serves: ["R2"], on: "keyup Space" }),
      unit({ kind: "handler", name: "onRestart", does: "starts again after the end", serves: ["R7"], on: "keydown Enter" }),
      unit({ kind: "handler", name: "onTick", does: "the step of the game: move the player, enemies, coins, lives, win, camera", serves: ["R1", "R2", "R3", "R4", "R5", "R6", "R7"], uses: ["applyInput", "applyGravity", "moveThing", "landOn", "patrol", "resolveEnemyHit", "takeCoins", "respawn", "hits", "followCamera", "loadLevel"], on: "tick 16" })
    ]
  }
};
