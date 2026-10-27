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
const L2 = rows(["", "", "", "", "", "", "", r8, r9], W2);
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

(async () => {
  await level1();
  await level2();
})().catch((e) => { console.log("FAIL run " + e.stack); process.exitCode = 1; });
