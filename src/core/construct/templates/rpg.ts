import { unit, type Template } from "./types";

// 0 floor, 1 wall, 2 water, 3 door
const rows = [
  "111111111111111",
  "100000000000001",
  "101110000211101",
  "100010000200001",
  "100000011200001",
  "100000010000001",
  "101110010011101",
  "100010000000101",
  "100000000000301",
  "100000000000001",
  "111111111111111"
];

const state = {
  mode: "playing", message: "Find the elder, get the key, open the door.",
  map: rows.map((r) => r.split("").map(Number)),
  player: { col: 1, row: 1, facing: "down", hp: 5, maxHp: 5 },
  npcs: [{ col: 3, row: 1, name: "Elder", lines: ["The door in the south-east is locked.", "Take this key, and mind the slimes."], given: false }],
  items: [{ col: 6, row: 1, kind: "potion", taken: false }, { col: 12, row: 5, kind: "coin", taken: false }, { col: 2, row: 9, kind: "coin", taken: false }],
  enemies: [{ col: 8, row: 5, hp: 2, alive: true, dir: 1 }, { col: 11, row: 8, hp: 2, alive: true, dir: -1 }],
  dialog: { open: false, speaker: "", text: "", index: 0 },
  bag: { keys: 0, potions: 0, gold: 0 }
};

const layout = `<canvas id="stage" width="600" height="440"></canvas>
<div id="hud"><span id="hp"></span><span id="gold"></span><span id="keys"></span><div id="dialog"></div><div id="message"></div></div>
<style>
body { background: #14181f; color: #fff; display: flex; flex-direction: column; align-items: center; padding-top: 16px; }
#stage { border: 3px solid #fff; border-radius: 6px; background: #000; }
#hud { width: 600px; margin-top: 8px; font-size: 18px; }
#hud span { margin-right: 18px; font-weight: 700; }
#dialog { min-height: 24px; margin-top: 6px; color: #ffd54a; }
#message { margin-top: 4px; color: #9ad; }
</style>`;

const code: Record<string, string> = {
  S: JSON.stringify(state, null, 2),
  layout,
  isWalkable: `function isWalkable(map, col, row) {
  if (row < 0 || row >= map.length || col < 0 || col >= map[0].length) return false;
  return map[row][col] === 0;
}`,
  thingAt: `function thingAt(list, col, row) {
  for (var i = 0; i < list.length; i++) { if (list[i].col === col && list[i].row === row) return i; }
  return -1;
}`,
  nextTo: `function nextTo(player, thing) {
  return Math.abs(player.col - thing.col) + Math.abs(player.row - thing.row) === 1;
}`,
  playerStep: `function playerStep(world, dc, dr) {
  if (world.mode !== "playing" || world.dialog.open) return world;
  var facing = dc < 0 ? "left" : dc > 0 ? "right" : dr < 0 ? "up" : "down";
  var col = world.player.col + dc, row = world.player.row + dr;
  var blocked = thingAt(world.npcs, col, row) >= 0 || thingAt(world.enemies.filter(function (e) { return e.alive; }), col, row) >= 0;
  if (!isWalkable(world.map, col, row) || blocked) return { ...world, player: { ...world.player, facing: facing } };
  var items = world.items.slice();
  var bag = { ...world.bag }, hp = world.player.hp, message = world.message;
  for (var i = 0; i < items.length; i++) {
    if (!items[i].taken && items[i].col === col && items[i].row === row) {
      var kind = items[i].kind;
      items[i] = { ...items[i], taken: true };
      if (kind === "coin") { bag.gold += 5; message = "You found a coin."; }
      else { hp = Math.min(world.player.maxHp, hp + 2); message = "You drink a potion."; }
    }
  }
  return { ...world, items: items, bag: bag, message: message, player: { ...world.player, col: col, row: row, facing: facing, hp: hp } };
}`,
  interact: `function interact(world) {
  if (world.mode !== "playing") return world;
  if (world.dialog.open) {
    var npc = world.npcs.filter(function (n) { return n.name === world.dialog.speaker; })[0];
    var next = world.dialog.index + 1;
    if (npc && next < npc.lines.length) return { ...world, dialog: { ...world.dialog, index: next, text: npc.lines[next] } };
    var give = !!npc && !npc.given;
    return {
      ...world,
      dialog: { open: false, speaker: "", text: "", index: 0 },
      npcs: world.npcs.map(function (n) { return n.name === world.dialog.speaker ? { ...n, given: true } : n; }),
      bag: give ? { ...world.bag, keys: world.bag.keys + 1 } : world.bag,
      message: give ? "You got a key." : world.message
    };
  }
  var p = world.player;
  for (var i = 0; i < world.npcs.length; i++) {
    if (nextTo(p, world.npcs[i])) return { ...world, dialog: { open: true, speaker: world.npcs[i].name, text: world.npcs[i].lines[0], index: 0 } };
  }
  for (var j = 0; j < world.enemies.length; j++) {
    var e = world.enemies[j];
    if (e.alive && nextTo(p, e)) {
      var hp = e.hp - 1;
      var enemies = world.enemies.map(function (x, n) { return n === j ? { ...x, hp: hp, alive: hp > 0 } : x; });
      return { ...world, enemies: enemies, bag: hp > 0 ? world.bag : { ...world.bag, gold: world.bag.gold + 10 }, message: hp > 0 ? "You hit the slime." : "The slime is gone." };
    }
  }
  var dc = p.facing === "left" ? -1 : p.facing === "right" ? 1 : 0, dr = p.facing === "up" ? -1 : p.facing === "down" ? 1 : 0;
  if (world.map[p.row + dr] && world.map[p.row + dr][p.col + dc] === 3) {
    if (world.bag.keys > 0) return { ...world, mode: "won", message: "The door opens. You win! Press Enter" };
    return { ...world, message: "The door is locked." };
  }
  return { ...world, message: "There is nothing here." };
}`,
  enemyStep: `function enemyStep(world) {
  if (world.mode !== "playing") return world;
  var hp = world.player.hp, message = world.message;
  var enemies = world.enemies.map(function (e) {
    if (!e.alive) return e;
    var col = e.col + e.dir;
    var free = isWalkable(world.map, col, e.row) && !(col === world.player.col && e.row === world.player.row);
    return free ? { ...e, col: col } : { ...e, dir: -e.dir };
  });
  for (var i = 0; i < enemies.length; i++) {
    if (enemies[i].alive && nextTo(world.player, enemies[i])) { hp -= 1; message = "A slime bites you."; }
  }
  return { ...world, enemies: enemies, player: { ...world.player, hp: Math.max(0, hp) }, message: hp <= 0 ? "You fell. Press Enter" : message, mode: hp <= 0 ? "over" : world.mode };
}`,
  drawMap: `function drawMap() {
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  var T = 40;
  var colours = ["#2f5d3a", "#555b66", "#2b5f9e", "#8a5a2b"];
  for (var r = 0; r < S.map.length; r++) {
    for (var c = 0; c < S.map[r].length; c++) { ctx.fillStyle = colours[S.map[r][c]]; ctx.fillRect(c * T, r * T, T, T); }
  }
  for (var i = 0; i < S.items.length; i++) { var it = S.items[i]; if (it.taken) continue; ctx.fillStyle = it.kind === "coin" ? "#ffd54a" : "#e91e63"; ctx.beginPath(); ctx.arc(it.col * T + 20, it.row * T + 20, 8, 0, Math.PI * 2); ctx.fill(); }
  for (var j = 0; j < S.npcs.length; j++) { var n = S.npcs[j]; ctx.fillStyle = "#b388ff"; ctx.fillRect(n.col * T + 8, n.row * T + 6, 24, 28); }
  for (var k = 0; k < S.enemies.length; k++) { var e = S.enemies[k]; if (!e.alive) continue; ctx.fillStyle = "#7cb342"; ctx.fillRect(e.col * T + 6, e.row * T + 14, 28, 20); }
  var p = S.player;
  ctx.fillStyle = "#ff7043"; ctx.fillRect(p.col * T + 8, p.row * T + 6, 24, 28);
  ctx.fillStyle = "#fff"; ctx.fillRect(p.col * T + 8 + (p.facing === "right" ? 16 : p.facing === "left" ? 0 : 8), p.row * T + 10 + (p.facing === "down" ? 10 : 0), 8, 6);
}`,
  drawHud: `function drawHud() {
  const hud = document.getElementById("hud");
  hud.querySelector("#hp").textContent = "HP " + S.player.hp + "/" + S.player.maxHp;
  hud.querySelector("#gold").textContent = "Gold " + S.bag.gold;
  hud.querySelector("#keys").textContent = "Keys " + S.bag.keys;
  hud.querySelector("#dialog").textContent = S.dialog.open ? S.dialog.speaker + ": " + S.dialog.text : "";
  hud.querySelector("#message").textContent = S.message;
}`,
  onLeft: `function onLeft() { Object.assign(S, playerStep(S, -1, 0)); }`,
  onRight: `function onRight() { Object.assign(S, playerStep(S, 1, 0)); }`,
  onUp: `function onUp() { Object.assign(S, playerStep(S, 0, -1)); }`,
  onDown: `function onDown() { Object.assign(S, playerStep(S, 0, 1)); }`,
  onAct: `function onAct() { Object.assign(S, interact(S)); }`,
  onEnemies: `function onEnemies() { Object.assign(S, enemyStep(S)); }`,
  onRestart: `function onRestart() {
  if (S.mode === "playing") return;
  S.mode = "playing"; S.message = "Find the elder, get the key, open the door.";
  S.player = { ...S.player, col: 1, row: 1, hp: S.player.maxHp, facing: "down" };
  S.bag = { keys: 0, potions: 0, gold: 0 };
  S.items = S.items.map(function (i) { return { ...i, taken: false }; });
  S.npcs = S.npcs.map(function (n) { return { ...n, given: false }; });
  S.enemies = S.enemies.map(function (e) { return { ...e, alive: true, hp: 2 }; });
  S.dialog = { open: false, speaker: "", text: "", index: 0 };
}`
};

export const RPG: Template = {
  id: "rpg",
  label: "Top-down RPG",
  question: "Is it a game seen from above on a tile map where the player walks around, talks to characters, fights monsters or collects items (an RPG or adventure)?",
  code,
  plan: {
    title: "Adventure",
    language: "English",
    requirements: [
      { id: "R1", text: "A tile map with walls and water is shown, and the player walks on it with the arrow keys, one tile at a time." },
      { id: "R2", text: "Walls, water, characters and monsters block the player." },
      { id: "R3", text: "Space talks to the character next to the player, line by line; the elder gives a key." },
      { id: "R4", text: "Monsters walk back and forth, and hurt the player when next to it; Space hits a monster next to the player." },
      { id: "R5", text: "Coins and potions are picked up by walking on them; potions heal." },
      { id: "R6", text: "The locked door opens with the key and wins the game; with no hit points left the game is over; Enter restarts." },
      { id: "R7", text: "Hit points, gold, keys, the talk and a message line are shown." }
    ],
    units: [
      unit({ kind: "state", name: "S", does: "the map, player, characters, items, monsters, dialog and bag", serves: ["R1", "R2", "R3", "R4", "R5", "R6", "R7"] }),
      unit({ kind: "layout", name: "layout", does: "the canvas and the bar with hit points, gold, keys, talk and message", serves: ["R1", "R7"] }),
      unit({ kind: "fn", name: "isWalkable", does: "true when a tile is inside the map and open ground", serves: ["R1", "R2"], signature: "isWalkable(map, col, row) -> boolean", examples: [["isWalkable([[0,1]], 0, 0)", "true"], ["isWalkable([[0,1]], 1, 0)", "false"], ["isWalkable([[0,1]], 5, 0)", "false"]], shared: true }),
      unit({ kind: "fn", name: "thingAt", does: "the index of the thing on a tile, or -1", serves: ["R2", "R5"], signature: "thingAt(list, col, row) -> number", examples: [["thingAt([{col:1,row:2}], 1, 2)", "0"], ["thingAt([{col:1,row:2}], 0, 0)", "-1"]], shared: true }),
      unit({ kind: "fn", name: "nextTo", does: "true when two things are on neighbouring tiles", serves: ["R3", "R4"], signature: "nextTo(player, thing) -> boolean", examples: [["nextTo({col:1,row:1},{col:2,row:1})", "true"], ["nextTo({col:1,row:1},{col:2,row:2})", "false"]], shared: true }),
      unit({ kind: "fn", name: "playerStep", does: "the world after the player tries to walk one tile and picks up what is there", serves: ["R1", "R2", "R5"], uses: ["isWalkable", "thingAt"], signature: "playerStep(world, dc, dr) -> world" }),
      unit({ kind: "fn", name: "interact", does: "the world after Space: next line of a talk, start a talk, hit a monster, or try the door", serves: ["R3", "R4", "R6"], uses: ["nextTo"], signature: "interact(world) -> world" }),
      unit({ kind: "fn", name: "enemyStep", does: "the world after the monsters walk one tile and bite the player when next to it", serves: ["R4", "R6"], uses: ["isWalkable", "nextTo"], signature: "enemyStep(world) -> world" }),
      unit({ kind: "view", name: "drawMap", does: "draws the tiles, items, characters, monsters and the player", serves: ["R1", "R2", "R3", "R4", "R5"], into: "stage" }),
      unit({ kind: "view", name: "drawHud", does: "writes hit points, gold, keys, the talk and the message", serves: ["R7", "R3"], into: "hud" }),
      unit({ kind: "handler", name: "onLeft", does: "walks left", serves: ["R1"], uses: ["playerStep"], on: "keydown ArrowLeft" }),
      unit({ kind: "handler", name: "onRight", does: "walks right", serves: ["R1"], uses: ["playerStep"], on: "keydown ArrowRight" }),
      unit({ kind: "handler", name: "onUp", does: "walks up", serves: ["R1"], uses: ["playerStep"], on: "keydown ArrowUp" }),
      unit({ kind: "handler", name: "onDown", does: "walks down", serves: ["R1"], uses: ["playerStep"], on: "keydown ArrowDown" }),
      unit({ kind: "handler", name: "onAct", does: "talks, hits or opens the door", serves: ["R3", "R4", "R6"], uses: ["interact"], on: "keydown Space" }),
      unit({ kind: "handler", name: "onEnemies", does: "the monsters take their turn", serves: ["R4"], uses: ["enemyStep"], on: "tick 500" }),
      unit({ kind: "handler", name: "onRestart", does: "starts again after the end", serves: ["R6"], on: "keydown Enter" })
    ]
  }
};
