/* Smoke test of the map block in Chromium: rendering, moves, every role, restart, scenes, camera, wandering.
 * Usage (from the repo root): node scripts/xblocks-smoke/map.cjs */
const { open, check } = require("./harness.cjs");

const ROWS_HALL = [
  "##########",
  "#@..$..e.#",
  "#.##.#...#",
  "#k.D.N...#",
  "#.#.####.#",
  "#...T..X.#",
  "##########",
];
const LEGEND_HALL = `
  # wall
  @ player
  . floor
  $ item gold+1 "Coin." as:coin
  e enemy hp-1 "Ouch!" as:bat
  k item key+1 "Got a key." as:key
  D door needs:key "Locked. Find a key." as:gate
  N npc "Hello, traveller." as:guide
  T trap hp-1 "Spikes!" as:spikes
  X exit needs:gold>=2 "Come back with 2 gold."`;

const pageA = `<!doctype html><body>
<x-state gold="0" hp="5" hp-max="5" key="0"></x-state>
<p>Gold <x-value of="gold"></x-value> HP <x-value of="hp"></x-value></p>
<x-map id="hall" tile="32"><x-legend>${LEGEND_HALL}
</x-legend>
${ROWS_HALL.join("\n")}
</x-map>
</body>`;

const ROWS_ROOM = ["#######", "#@.S.W#", "#.....#", "#######"];
const ROWS_CAVE = ["############", "#@.........#", "#..........#", "#..........#", "############"];
const pageB = `<!doctype html><body>
<x-state gold="0"></x-state>
<x-scene id="room">
  <x-map id="room-map" tile="32"><x-legend>
  # wall
  @ player
  . floor
  S switch gold+1 "Click."
  W warp to:cave "Portal."
  </x-legend>
${ROWS_ROOM.join("\n")}
  </x-map>
</x-scene>
<x-scene id="cave">
  <x-map id="cave-map" tile="32" view="4x3"><x-legend>
  # wall
  @ player
  . floor
  </x-legend>
${ROWS_CAVE.join("\n")}
  </x-map>
</x-scene>
</body>`;

const ROWS_FIELD = ["#########", "#@......#", "#.......#", "#..b.s..#", "#.......#", "#########"];
const ROWS_FAR = ["#####", "#@..#", "#.b.#", "#...#", "#####"];
const pageC = `<!doctype html><body>
<x-scene id="a"><x-map id="field-map" tile="32"><x-legend>
  # wall
  @ player
  . floor
  b enemy hp-1 as:wisp
  s enemy still as:stone
  Q zzz
  </x-legend>
${ROWS_FIELD.join("\n")}
</x-map></x-scene>
<x-scene id="far"><x-map id="far-map" tile="32"><x-legend>
  # wall
  @ player
  . floor
  b enemy as:ghost
  </x-legend>
${ROWS_FAR.join("\n")}
</x-map></x-scene>
</body>`;

const RECORD = "window.__ev = []; window.X.on('*', function (d, n) { window.__ev.push(n); });";
const toasts = (p) => p.evaluate(() => Array.from(document.querySelectorAll(".x-toast")).map((t) => t.textContent).join("|"));
const apiOf = (p, id) => p.evaluate((i) => { const m = document.getElementById(i).api; return { me: m.me(), ents: m.entities() }; }, id);
const events = (p) => p.evaluate(() => window.__ev.slice());

(async () => {
  /* ---------- page A: the hall (tiles, moves, every role, restart, dialog) ---------- */
  const walls = ROWS_HALL.join("").split("").filter((c) => c === "#").length;
  const a = await open(pageA, ["map"]);
  const p = a.page;
  await p.evaluate("Math.random = () => 0.9; " + RECORD);
  const pos = async () => { const s = await a.state(); return [s.player_x, s.player_y]; };
  const at = async (x, y) => JSON.stringify(await pos()) === JSON.stringify([x, y]);

  check("renders every tile, walls and the player",
    await p.evaluate(() => document.querySelectorAll('[data-map="hall"] .map-grid > .tile').length === 70) &&
    await p.evaluate((n) => document.querySelectorAll('[data-map="hall"] .tile.wall').length === n, walls) &&
    await p.evaluate(() => { const e = document.querySelector('[data-map="hall"] .entity.player'); return !!e && /translate\(32px,\s*32px\)/.test(e.style.transform); }));

  await a.press("ArrowUp");
  check("a wall stops the player (arrow up)", await at(1, 1), JSON.stringify(await pos()));

  await a.press("ArrowRight", 3);
  const s1 = await a.state();
  check("arrow keys move one tile; coin gives its effect and disappears",
    s1.gold === 1 && await at(4, 1) && await p.evaluate(() => document.querySelectorAll(".tile.coin").length === 0) &&
    (await events(p)).includes("pickup:coin") && (await events(p)).includes("pickup:item"), JSON.stringify(s1));

  await a.press("s", 2);
  check("WASD moves (s down)", await at(4, 3), JSON.stringify(await pos()));

  await a.press("a");
  check("a locked door says why and stays shut",
    (await toasts(p)).includes("Locked. Find a key.") && await at(4, 3) && await p.evaluate(() => document.querySelectorAll(".tile.gate").length === 1));

  await a.press("ArrowRight");
  check("an npc says its words, emits talk, and the player does not move",
    (await toasts(p)).includes("Hello, traveller.") && (await events(p)).includes("talk:guide") && await at(4, 3));

  await a.press("w", 2); await a.press("q"); await a.press("z"); await a.press("d");
  check("ZQSD moves and walls stop it (w, q, z into the wall, d)", await at(4, 1), JSON.stringify(await pos()));

  await a.press("ArrowRight", 3);
  const s2 = await a.state();
  check("an enemy is defeated by walking into it: its effect applies, it is gone, the player stays",
    s2.hp === 4 && await at(6, 1) && await p.evaluate(() => document.querySelectorAll(".entity.enemy").length === 0) &&
    (await events(p)).includes("hit:enemy"), JSON.stringify(s2));

  await a.press("ArrowLeft", 5); await a.press("ArrowDown", 2);
  check("a key is picked up", (await a.state()).key === 1 && await at(1, 3) && await p.evaluate(() => document.querySelectorAll(".tile.key").length === 0));

  await a.press("ArrowRight", 2);
  const s3 = await a.state();
  check("a door opens with a key, the key is used up, the door becomes floor",
    s3.key === 0 && await at(3, 3) && await p.evaluate(() => document.querySelectorAll(".tile.gate").length === 0) &&
    (await events(p)).includes("open:door"), JSON.stringify(s3));

  await a.press("ArrowDown", 2); await a.press("ArrowRight");
  const s4 = await a.state();
  check("a trap hurts on entry, again on each new entry", s4.hp === 3 && await at(4, 5), JSON.stringify(s4));
  await a.press("ArrowRight"); await a.press("ArrowLeft");
  check("a trap hurts again when entered again", (await a.state()).hp === 2 && (await events(p)).includes("enter:trap"));

  await a.press("ArrowRight", 3);
  check("an exit whose condition fails says why and does not end the game",
    (await toasts(p)).includes("Come back with 2 gold.") && await at(6, 5) && await p.evaluate(() => !document.getElementById("x-over")),
    JSON.stringify([await pos(), await toasts(p), await a.problems()]));

  await p.evaluate(() => window.X.set("gold", 2));
  await a.press("ArrowRight");
  check("the exit ends the game when its condition holds",
    await p.evaluate(() => !!document.getElementById("x-over")) && (await events(p)).includes("win"));

  await a.press("r");
  const s5 = await a.state();
  check("R restarts: state, tiles and enemies are drawn from the start",
    s5.gold === 0 && s5.hp === 5 && s5.key === 0 && await at(1, 1) &&
    await p.evaluate(() => document.querySelectorAll(".tile.coin").length === 1 && document.querySelectorAll(".entity.enemy").length === 1 && document.querySelectorAll(".tile.gate").length === 1 && !document.getElementById("x-over")), JSON.stringify(s5));

  await p.evaluate(() => window.X.set("dialog_open", 1));
  await a.press("ArrowRight");
  const blockedOk = await at(1, 1);
  await p.evaluate(() => window.X.set("dialog_open", 0));
  await a.press("ArrowRight");
  check("keys are ignored while a dialogue is open", blockedOk && await at(2, 1));
  check("page A: no error and no problem reported", a.errors.length === 0 && (await a.problems()).length === 0, a.errors.join("|") + " " + JSON.stringify(await a.problems()));
  await a.close();

  /* ---------- page B: scenes, switch, warp, the hidden map, the camera ---------- */
  const b = await open(pageB, ["map"]);
  const pb = b.page;
  await pb.evaluate(RECORD);
  await b.press("ArrowRight", 2);
  const sb1 = await b.state();
  const roomAfterSwitch = await pb.evaluate(() => document.querySelectorAll('[data-map="room-map"] .tile.switch').length);
  await b.press("ArrowRight"); await b.press("ArrowLeft");
  check("a switch gives its effect once, then becomes floor", sb1.gold === 1 && roomAfterSwitch === 0 && (await b.state()).gold === 1, JSON.stringify(sb1));

  await b.press("ArrowRight", 2);
  check("a warp moves to its scene", await pb.evaluate(() => document.getElementById("cave").hidden === false && document.getElementById("room").hidden === true) &&
    (await events(pb)).includes("enter:cave"));

  await b.press("ArrowRight");
  const roomMe = (await apiOf(pb, "room-map")).me, caveMe = (await apiOf(pb, "cave-map")).me;
  check("a hidden map does not answer the keys; the visible one does",
    roomMe.x === 5 && caveMe.x === 2, JSON.stringify([roomMe, caveMe]));

  await b.press("ArrowRight", 6);
  const camera = await pb.evaluate(() => {
    const g = document.querySelector('[data-map="cave-map"] .map-grid');
    return { t: g.style.transform, w: document.querySelector('[data-map="cave-map"]').getBoundingClientRect().width };
  });
  check("with view, the camera follows the player and the window keeps its size",
    camera.t.indexOf("-208px") >= 0 && camera.w === 128, JSON.stringify(camera));
  check("page B: no error and no problem reported", b.errors.length === 0 && (await b.problems()).length === 0, b.errors.join("|") + " " + JSON.stringify(await b.problems()));
  await b.close();

  /* ---------- page C: wandering, still enemies, hidden maps, unknown role ---------- */
  const c = await open(pageC, ["map"]);
  const pc = c.page;
  await pc.evaluate(() => { Math.random = () => 0.9; });
  await pc.waitForTimeout(1500);
  const field = await apiOf(pc, "field-map"), far = await apiOf(pc, "far-map");
  const fe = field.ents, fa = far.ents;
  check("an enemy wanders every 650 ms (here: always up, so it stops at the wall)", fe[1].y < 3, JSON.stringify(fe));
  check("a still enemy does not move", fe[2].x === 5 && fe[2].y === 3, JSON.stringify(fe));
  check("a map in a hidden scene does not wander", fa[1].x === 2 && fa[1].y === 2, JSON.stringify(fa));
  await c.press("ArrowRight");
  const farNow = await apiOf(pc, "far-map"), fieldNow = await apiOf(pc, "field-map");
  check("a map in a hidden scene does not answer the keys", farNow.me.x === 1 && farNow.me.y === 1 && fieldNow.me.x === 2, JSON.stringify([farNow.me, fieldNow.me]));
  check("an unknown role is reported", (await c.problems()).indexOf("unknown map role: zzz") >= 0, JSON.stringify(await c.problems()));
  check("page C: no error", c.errors.length === 0, c.errors.join("|"));
  await c.close();
})();
