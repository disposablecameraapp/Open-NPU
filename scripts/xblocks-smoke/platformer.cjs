/* Platformer block in Chromium. Time is stepped by el.api (fixed steps), never by the real clock.
 * Usage: node scripts/xblocks-smoke/platformer.cjs */
const { open, check } = require("./harness.cjs");

function rows(list, width) {
  return list.map((s) => s.padEnd(width, ".")).join("\n");
}
function put(row, col, ch) {
  return row.slice(0, col) + ch + row.slice(col + 1);
}

/* level 1: jump onto a platform, collect a coin, hit a block from below, reach the flag */
const W1 = 26;
const L1 = rows([
  "", "", "", "", "",
  "......?",                     // block at column 6, row 5
  "............o",               // coin above the platform, column 12
  "..........=====",             // platform, columns 10 to 14, top at row 7
  ".P.....................F",    // player at column 1, flag at column 22
  "#".repeat(W1),                // ground
], W1);

const LEGEND1 = `
P player
# ground
B brick
? block bonus+=1 as:box
= platform
o coin coins+=1 as:coin
F flag #2e7d32 "Arrivée !"
^ spike lives-=1 as:spike
w walker score+=100 as:goomba
`;

const html1 = (rowsText, legend, extra = "") => `<!doctype html><html><head><meta charset="utf-8"></head><body>
<x-state coins="0" bonus="0" lives="3" score="0"></x-state>
<div style="width:900px">
<x-platformer id="p" view="16" ${extra}>
<x-legend>${legend}</x-legend>
${rowsText}
</x-platformer>
</div></body></html>`;

/* level 2: spike hurt, walker stomp, fall into a gap, big player absorbs a hit, a walker that turns at a ledge */
const W2 = 30;
const r8 = put(".P...^...w".padEnd(W2, "."), 25, "v");
const r9 = "#".repeat(20) + ".." + "#".repeat(8);
const L2 = rows([...Array(8).fill(""), r8, r9], W2);   // the player row is 8, the ground row is 9
const LEGEND2 = `
P player
# ground
w walker stomp:score+=100 hurt:lives-=1 as:goomba still
v walker as:walker2
^ spike lives-=1 as:spike
`;

async function driver(p) {
  const tick = (n = 1) => p.evaluate((n) => {
    const a = document.querySelector("x-platformer").api;
    for (let i = 0; i < n; i++) a.step(1 / 120);
    return { m: a.me(), ev: Object.assign({}, window.__ev), over: window.X.isOver() };
  }, n);
  const events = (names) => p.evaluate((names) => {
    window.__ev = {};
    names.forEach((n) => window.X.on(n, (d, name) => { window.__ev[name] = (window.__ev[name] || 0) + 1; }));
  }, names);
  return {
    tick,
    events,
    clear: () => p.evaluate(() => { window.__ev = {}; }),
    until: async (pred, max = 1500) => {
      let s = null;
      for (let i = 0; i < max; i++) { s = await tick(1); if (pred(s)) return s; }
      return s;
    },
    press: (c) => p.evaluate((c) => document.querySelector("x-platformer").api.press(c), c),
    release: (c) => p.evaluate((c) => document.querySelector("x-platformer").api.release(c), c),
    place: (x, y) => p.evaluate(([x, y]) => document.querySelector("x-platformer").api.place(x, y), [x, y]),
    tile: (c, r) => p.evaluate(([c, r]) => document.querySelector("x-platformer").api.tile(c, r), [c, r]),
    ents: () => p.evaluate(() => document.querySelector("x-platformer").api.entities()),
    at: (fx, fy) => p.evaluate(([fx, fy]) => document.querySelector("x-platformer").api.at(fx, fy), [fx, fy]),
  };
}

async function level1() {
  const t = await open(html1(L1, LEGEND1), ["platformer"]);
  const p = t.page, D = await driver(p);
  await D.events(["jump", "land", "coin", "hit:block", "flag", "hurt", "fall"]);
  await D.tick(0); // from here the clock is the test's
  await D.tick(30);

  const st0 = await t.state();
  check("state written (player_x, player_y)", typeof st0.player_x === "number" && typeof st0.player_y === "number", JSON.stringify([st0.player_x, st0.player_y]));

  /* walk to column 6, stop, jump under the block */
  await D.press("ArrowRight");
  await D.until((s) => s.m.x >= 5.8);
  await D.release("ArrowRight");
  await D.tick(30);
  await D.press("Space");
  await D.tick(40);
  await D.release("Space");
  const hit = await D.until((s) => s.ev["hit:block"] >= 1, 200);
  const st1 = await t.state();
  check("block hit from below: event, bonus, block becomes used",
    hit.ev["hit:block"] >= 1 && st1.bonus === 1 && (await D.tile(6, 5)) === "used", JSON.stringify({ ev: hit.ev, bonus: st1.bonus }));
  await D.tick(30);

  /* walk right, jump at column 9 onto the platform, keep walking to the flag */
  let onPlatform = false;
  await D.press("ArrowRight");
  await D.until((s) => s.m.x >= 8.8);
  await D.press("Space");
  await D.tick(30);
  await D.release("Space");
  const done = await D.until((s) => {
    if (s.m.grounded && s.m.feet === 7 && s.m.col >= 10 && s.m.col <= 14) onPlatform = true;
    return s.over;
  }, 3000);
  await D.release("ArrowRight");

  check("jump onto the platform (landed on its top, then jump and land events)",
    onPlatform && done.ev.jump >= 1 && done.ev.land >= 1, JSON.stringify({ onPlatform, ev: done.ev }));
  const st2 = await t.state();
  check("coin collected on the platform", st2.coins === 1 && (await D.tile(12, 6)) === "air", JSON.stringify({ coins: st2.coins }));
  check("reach the flag: the game is won, the flag's words are shown",
    done.over === "win" && (await p.evaluate(() => (document.getElementById("x-over") || {}).textContent || "")).includes("Arrivée"),
    String(done.over));
  check("level 1: no error, no problem", t.errors.length === 0 && (await t.problems()).length === 0,
    t.errors.concat(await t.problems()).join("|"));
  await t.close();
}

async function level2() {
  const t = await open(html2(), ["platformer"]);
  const p = t.page, D = await driver(p);
  await D.events(["hurt", "stomp:goomba", "fall"]);
  await D.tick(0);
  await D.tick(30);

  /* spike at column 5: hurt, lives down, back to the start with a short invulnerability */
  await D.press("ArrowRight");
  const sp = await D.until((s) => s.ev.hurt >= 1, 900);
  await D.release("ArrowRight");
  const st1 = await t.state();
  check("spike hurts: lives -1, back to the start, invulnerable", st1.lives === 2 && sp.m.col === 1 && sp.m.invuln > 0,
    JSON.stringify({ lives: st1.lives, col: sp.m.col, invuln: sp.m.invuln }));
  await D.tick(150);

  /* stomp the still walker: fall onto it from above */
  await D.place(9.5, 4);
  const stomp = await D.until((s) => s.ev["stomp:goomba"] >= 1, 300);
  const st2 = await t.state();
  check("walker stomped from above: event, score from its line, no life lost, player bounces",
    stomp.ev["stomp:goomba"] === 1 && st2.score === 100 && st2.lives === 2 && stomp.m.vy < 0,
    JSON.stringify({ score: st2.score, lives: st2.lives, vy: stomp.m.vy }));
  const goomba = (await D.ents()).find((e) => e.name === "goomba");
  check("stomped walker is gone", !!goomba && goomba.dead === true);
  await D.tick(150);

  /* a restart brings the still walker back (lives 3, score 0); side contact then costs one life */
  await p.evaluate(() => window.X.restart());
  await D.clear();
  await D.tick(30);
  await D.place(9.5, 8);
  const hurtSide = await D.until((s) => s.ev.hurt >= 1, 120);
  const st2b = await t.state();
  check("contact with a still walker from the side: hurt effect costs a life, no stomp",
    hurtSide.ev.hurt >= 1 && st2b.lives === 2 && (st2b.score || 0) === 0 && !hurtSide.ev["stomp:goomba"],
    JSON.stringify({ lives: st2b.lives, score: st2b.score, ev: hurtSide.ev }));
  await D.tick(150);

  /* the gap at columns 20 and 21: falling costs a life and sends back to the start */
  await D.place(19.5, 8);
  await D.press("ArrowRight");
  const fl = await D.until((s) => s.ev.fall >= 1, 600);
  await D.release("ArrowRight");
  const st3 = await t.state();
  check("fall into the gap: default fall effect (lives -1), respawn", fl.ev.fall >= 1 && st3.lives === 1 && fl.m.col === 1,
    JSON.stringify({ lives: st3.lives, col: fl.m.col }));
  await D.tick(150);

  /* a big player is not killed by a spike: it shrinks instead */
  await p.evaluate(() => window.X.set("big", 1));
  await D.place(5.5, 8);
  const bh = await D.tick(3);
  const st4 = await t.state();
  check("big player hit: big set to 0, no life lost", st4.big === 0 && st4.lives === 1 && bh.ev.hurt >= 1,
    JSON.stringify({ big: st4.big, lives: st4.lives }));

  /* the second walker walks back and forth on the right, turning at the ledge instead of falling in the gap */
  await D.tick(720);
  const w2 = (await D.ents()).find((e) => e.name === "walker2");
  check("walker turns at the ledge and stays on the ground", !!w2 && !w2.dead && w2.x >= 21.5 && w2.x <= 29.2,
    JSON.stringify(w2));

  /* restart: state and level come back */
  await p.evaluate(() => window.X.restart());
  await D.tick(2);
  const st5 = await t.state();
  const m5 = (await D.tick(0)).m;
  const goomba2 = (await D.ents()).find((e) => e.name === "goomba");
  check("restart: lives back to 3, player at the start, walker alive again",
    st5.lives === 3 && m5.col === 1 && !!goomba2 && goomba2.dead === false, JSON.stringify({ lives: st5.lives, col: m5.col }));
  check("level 2: no error, no problem", t.errors.length === 0 && (await t.problems()).length === 0,
    t.errors.concat(await t.problems()).join("|"));
  await t.close();
}

function html2() {
  return html1(L2, LEGEND2).replace('<x-state coins="0" bonus="0" lives="3" score="0"></x-state>', '<x-state lives="3" score="0"></x-state>');
}

/* ---------- second pass: the picture, the canvas, pipes, scenery, water and the mushroom ---------- */
function grid(w, h) { return Array.from({ length: h }, () => Array(w).fill(".")); }
function paint(g, r, c0, s) { [...s].forEach((ch, i) => { g[r][c0 + i] = ch; }); }
function text(g) { return g.map((r) => r.join("")).join("\n"); }

/* level 3: 40 x 14, ground with a pit, bricks, ? blocks, a pipe, coins, a walker, clouds, bushes, hills and a flag */
const LEGEND3 = `
P player
# ground
B brick
? block gives:big
= platform
o coin coins+=1
| pipe
w walker score+=100 as:goomba
F flag "Arrivée !"
C scenery as:cloud
b scenery as:bush
h scenery as:hill
`;
function level3() {
  const g = grid(40, 14);
  paint(g, 1, 22, "CCCC"); paint(g, 2, 4, "CCC");
  paint(g, 6, 11, "ooo"); paint(g, 6, 17, "oo"); paint(g, 6, 19, "ooo"); paint(g, 6, 27, "o");
  paint(g, 7, 19, "===");
  paint(g, 8, 9, "B?B?B?B");
  paint(g, 11, 16, "b"); paint(g, 11, 30, "hh"); paint(g, 11, 36, "b");
  paint(g, 9, 26, "||"); paint(g, 10, 26, "||"); paint(g, 11, 26, "||");
  paint(g, 11, 2, "P"); paint(g, 11, 22, "w");
  for (let r = 6; r <= 11; r++) g[r][38] = "F";
  paint(g, 12, 0, "#".repeat(40)); paint(g, 13, 0, "#".repeat(40));
  paint(g, 12, 19, ".."); paint(g, 13, 19, "..");
  return text(g);
}
const html3 = (attrs = "", legend = LEGEND3, body = level3()) => `<!doctype html><html><head><meta charset="utf-8"></head><body>
<x-state lives="3" score="0" coins="0" bonus="0"></x-state>
<div style="width:900px">
<x-platformer id="p" view="16" ${attrs}>
<x-legend>${legend}</x-legend>
${body}
</x-platformer>
</div></body></html>`;

async function ticksTo(D, x) {
  let n = 0;
  for (;;) { const s = await D.tick(1); n++; if (s.m.x >= x || n > 3000) return n; }
}

async function picture() {
  const t = await open(html3(), ["platformer"], { width: 900, height: 1000 });
  const p = t.page, D = await driver(p);
  await D.tick(0);
  await D.tick(30);
  const box = await p.evaluate(() => {
    const c = document.querySelector("x-platformer canvas"), w = document.querySelector("x-platformer").getBoundingClientRect();
    const b = c.getBoundingClientRect();
    return { cw: w.width, w: b.width, h: b.height, backing: [c.width, c.height], dpr: window.devicePixelRatio || 1 };
  });
  check("canvas fills the width of its container (view = 16 cells across)",
    Math.abs(box.w - box.cw) <= 1, JSON.stringify(box));
  check("canvas height follows the level (14 rows) and keeps the proportions",
    Math.abs(box.h - 14 * box.cw / 16) <= 1, JSON.stringify(box));
  check("canvas pixels follow devicePixelRatio (never more than the tile resolution)",
    Math.abs(box.backing[0] - 16 * Math.min(box.w / 16, 32) * box.dpr) <= 1, JSON.stringify(box));

  const corner = await p.evaluate(() => {
    const c = document.querySelector("x-platformer canvas");
    return Array.from(c.getContext("2d").getImageData(0, 0, 1, 1).data);
  });
  check("no background of its own: the corner of the canvas is transparent", corner[3] === 0, JSON.stringify(corner));

  const colours = await p.evaluate(() => {
    const c = document.querySelector("x-platformer canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, seen = new Set();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) seen.add(d[i] + "," + d[i + 1] + "," + d[i + 2]);
    return seen.size;
  });
  check("default look is drawn with shading (many colours, not flat rectangles)", colours > 60, String(colours));

  await p.setViewportSize({ width: 900, height: 600 });
  await p.waitForTimeout(200);
  const small = await p.evaluate(() => {
    const b = document.querySelector("x-platformer canvas").getBoundingClientRect();
    return { w: b.width, h: b.height, vh: window.innerHeight };
  });
  check("a level taller than 80 % of the window is made smaller, proportions kept",
    small.h <= small.vh * 0.8 + 1 && Math.abs(small.w / small.h - 16 / 14) < 0.02, JSON.stringify(small));
  check("picture: no error, no problem", t.errors.length === 0 && (await t.problems()).length === 0,
    t.errors.concat(await t.problems()).join("|"));
  await t.close();

  const s = await open(html3('sky="#7ec8ff"'), ["platformer"], { width: 900, height: 1000 });
  await s.page.waitForTimeout(200);
  const px = await s.page.evaluate(() => Array.from(document.querySelector("x-platformer canvas").getContext("2d").getImageData(0, 0, 1, 1).data));
  check("sky=\"#hex\" paints the background behind the cells", px[3] === 255 && Math.abs(px[0] - 126) <= 2 && Math.abs(px[2] - 255) <= 2, JSON.stringify(px));
  await s.close();
}

async function pipeAndScenery() {
  /* a pipe (two cells wide, three high) stops the player; a bush at the player's feet does not */
  const W = 20;
  const g = grid(W, 13);
  paint(g, 11, 1, "P"); paint(g, 11, 5, "b");
  for (let r = 9; r <= 11; r++) paint(g, r, 14, "||");
  paint(g, 12, 0, "#".repeat(W));
  const legend = `
P player
# ground
| pipe
b scenery as:bush
`;
  const t = await open(html3('', legend, text(g)), ["platformer"]);
  const p = t.page, D = await driver(p);
  await D.tick(0);
  await D.tick(30);
  await D.press("ArrowRight");
  await D.until((s) => s.m.x >= 12.5, 500);
  await D.tick(120);
  const m = (await D.tick(0)).m;
  await D.release("ArrowRight");
  check("pipe is solid: the player stops at its left side", m.x > 12.9 && m.x <= 13.6 + 1e-6 && (await D.tile(14, 11)) === "pipe",
    JSON.stringify({ x: m.x, tile: await D.tile(14, 11) }));
  check("scenery does not block: the player walked through the bush cell", (await D.tile(5, 11)) === "scenery" && m.x > 12.9,
    JSON.stringify({ tile: await D.tile(5, 11), x: m.x }));
  check("pipe and scenery: no error", t.errors.length === 0 && (await t.problems()).length === 0, t.errors.concat(await t.problems()).join("|"));
  await t.close();
}

async function water() {
  /* in water the player walks more slowly: the same distance takes clearly longer */
  const W = 32;
  const g = grid(W, 13);
  paint(g, 11, 1, "P");
  for (let c = 10; c <= 20; c++) g[11][c] = "~";
  paint(g, 12, 0, "#".repeat(W));
  const legend = `
P player
# ground
~ water
`;
  const t = await open(html3('', legend, text(g)), ["platformer"]);
  const p = t.page, D = await driver(p);
  await D.tick(0);
  await D.tick(30);
  await D.press("ArrowRight");
  await ticksTo(D, 9);
  const wet = await ticksTo(D, 16);
  await ticksTo(D, 22);
  const dry = await ticksTo(D, 28);
  await D.release("ArrowRight");
  check("water slows the walk (4 cells in water take clearly longer than 4 cells on the ground)",
    wet > dry * 1.3, JSON.stringify({ wet, dry }));
  check("water does not hurt: no life lost, no hurt event", (await t.state()).lives === 3 && t.errors.length === 0, JSON.stringify(await t.state()));
  await t.close();
}

async function mushroom() {
  /* a ? block with gives:big, hit from below: a mushroom comes out, walks on, and touching it makes the player big */
  const W = 30;
  const g = grid(W, 11);
  paint(g, 8, 4, "?"); paint(g, 9, 1, "P"); paint(g, 10, 0, "#".repeat(W));
  const legend = `
P player
# ground
? block gives:big
`;
  const t = await open(html3('', legend, text(g)), ["platformer"]);
  const p = t.page, D = await driver(p);
  await D.events(["hit:block", "powerup:big", "hurt", "fall"]);
  await D.tick(0);
  await D.tick(30);
  await D.place(4.5, 9);
  await D.tick(30);
  await D.press("Space");
  await D.tick(40);
  await D.release("Space");
  const hit = await D.until((s) => s.ev["hit:block"] >= 1, 200);
  await D.tick(60);
  const out = (await D.ents()).find((e) => e.kind === "mush");
  check("block with gives:big: hit from below, the block is used and a mushroom comes out",
    hit.ev["hit:block"] === 1 && (await D.tile(4, 8)) === "used" && !!out && out.dead === false, JSON.stringify({ ev: hit.ev, out }));
  await D.press("ArrowRight");
  const got = await D.until((s) => s.ev["powerup:big"] >= 1, 1500);
  await D.release("ArrowRight");
  const st = await t.state();
  const after = (await D.ents()).find((e) => e.kind === "mush");
  check("touching the mushroom: big set to 1, powerup:big event, mushroom gone",
    got.ev["powerup:big"] === 1 && st.big === 1 && !!after && after.dead === true && !got.ev.hurt,
    JSON.stringify({ big: st.big, ev: got.ev, after }));
  check("mushroom: no error, no problem", t.errors.length === 0 && (await t.problems()).length === 0, t.errors.concat(await t.problems()).join("|"));
  await t.close();
}

/* el.api.at(fx, fy): what is under a click on the canvas (fractions of its width and height), camera included */
async function clickAt() {
  const t = await open(html3(), ["platformer"], { width: 900, height: 1000 });
  const p = t.page, D = await driver(p);
  await D.tick(0);
  await D.tick(30);
  const ground = await D.at(5.5 / 16, 12.5 / 14);
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  check("click on the ground: the tile's char, role and name, and its box as canvas fractions",
    !!ground && ground.kind === "tile" && ground.col === 5 && ground.row === 12 && ground.char === "#" && ground.role === "ground" && ground.name === "#" &&
    near(ground.box.x, 5 / 16) && near(ground.box.y, 12 / 14) && near(ground.box.w, 1 / 16) && near(ground.box.h, 1 / 14),
    JSON.stringify(ground));
  const air = await D.at(10.5 / 16, 3.5 / 14);
  check("click on empty air: kind none, char '.', at the right cell", !!air && air.kind === "none" && air.col === 10 && air.row === 3 && air.char === ".", JSON.stringify(air));
  check("click outside the canvas: null", (await D.at(1.2, 0.5)) === null);
  /* move the camera to the walker, freeze the game (manual steps), then click the middle of the walker */
  await D.place(19.5, 11);
  await D.tick(30);
  const m = (await D.tick(0)).m;
  const w = (await D.ents()).find((e) => e.kind === "walker" && !e.dead);
  const camX = Math.min(Math.max(m.x - 8, 0), 24);
  const onWalker = w ? await D.at((w.x + 0.4 - camX) / 16, (w.y + 0.4) / 14) : null;
  check("click on a walker: the entity wins over the tile (kind entity, role walker, name goomba, char w), box = its own",
    !!onWalker && onWalker.kind === "entity" && onWalker.role === "walker" && onWalker.name === "goomba" && onWalker.char === "w" &&
    near(onWalker.box.x, (w.x - camX) / 16) && near(onWalker.box.w, 0.8 / 16) && near(onWalker.box.h, 0.8 / 14),
    JSON.stringify({ onWalker, walker: w, camX }));
  const onPlayer = await D.at((m.x - camX) / 16, (m.feet - 0.5) / 14);
  check("click on the player: kind entity, name player", !!onPlayer && onPlayer.kind === "entity" && onPlayer.name === "player", JSON.stringify(onPlayer));
  check("click: no error, no problem", t.errors.length === 0 && (await t.problems()).length === 0, t.errors.concat(await t.problems()).join("|"));
  await t.close();
}

/* a level written as put lines: the same level as rows, no rows of dots */
async function putLines() {
  const lines = "# at 0-14 0\n# at 17-30 0\nP at 2 1\n? at 6 3\no at 12 4\nF at 28 1";
  const t = await open(html1(lines, LEGEND1), ["platformer"]);
  const D = await driver(t.page);
  await D.tick(0);
  const s0 = (await D.tick(30)).m;
  const cell = await t.page.evaluate(() => { const a = document.querySelector("x-platformer").api; return { rows: a.me() && true, at: a.at(0.5, 0.99) }; });
  check("put lines: a level with a player and no problem", !!s0 && (await t.problems()).length === 0, JSON.stringify(await t.problems()));
  check("put lines: the ground row is under the player", !!cell.at && (cell.at.role === "ground" || cell.at.kind === "tile" || !!cell.at.char), JSON.stringify(cell));
  await t.close();
}

(async () => {
  await level1();
  await level2();
  await picture();
  await pipeAndScenery();
  await water();
  await mushroom();
  await clickAt();
  await putLines();
})().catch((e) => { console.log("FAIL run " + e.stack); process.exitCode = 1; });
