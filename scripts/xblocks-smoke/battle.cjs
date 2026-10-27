/* Checks the battle block in Chromium: menus, damage, types, speed order, victory, defeat, flight,
 * switching, forced switch, fallback move, keys, restart. Usage: node scripts/xblocks-smoke/battle.cjs */
const { open, check } = require("./harness.cjs");

const TAGS = `<x-type name="fire" strong="grass" weak="water"></x-type>
<x-type name="water" strong="fire"></x-type>`;
const BATTLE = (body) => `<!doctype html><html><body>
<x-state gold="0"></x-state>
<button id="go" data-click="emit:battle:b1">go</button>
<x-battle id="b1" on-win="gold+=5" on-lose="lost+=1" on-flee="fled+=1">
${TAGS}
${body}
</x-battle>
</body></html>`;

const YOU = `<x-fighter side="you" name="Pikou" hp="20" attack="10" defense="5" speed="9" type="fire" sprite="🐭">
  <x-move name="Charge" power="5" type="normal" uses="10"></x-move>
  <x-move name="Braise" power="10" type="fire" uses="2"></x-move>
</x-fighter>`;
const FRAIL = `<x-fighter side="you" name="Pikou" hp="3" attack="10" defense="5" speed="1" type="fire">
  <x-move name="Charge" power="5" type="normal" uses="10"></x-move>
</x-fighter>`;
const NOUSES = `<x-fighter side="you" name="Pikou" hp="20" attack="10" defense="5" speed="9" type="fire">
  <x-move name="Charge" power="5" type="normal" uses="0"></x-move>
</x-fighter>`;
const RAT = (hp, o = {}) => `<x-fighter side="enemy" name="Rat" hp="${hp}" attack="${o.attack || 4}" defense="${o.defense || 20}" speed="${o.speed || 1}" type="${o.type || "grass"}" sprite="🐀">
  <x-move name="Morsure" power="4" type="normal" uses="5"></x-move>
</x-fighter>`;

const menuIndex = (st, label) => st.menu.indexOf(label);

(async () => {
  /* 1. Start by a click on a page button: panel, cards, state, CSS bridge, menu */
  let t = await open(BATTLE(YOU + RAT(8)), ["battle"]);
  let p = t.page;
  await p.click("#go"); await p.waitForTimeout(80);
  let s = await t.state();
  let st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  check("start opens the battle", s.battle_open === 1 && st.open === true && await p.evaluate(() => !!document.querySelector("x-battle .battle-ui .menu")));
  check("one card per side", await p.evaluate(() => document.querySelectorAll(".battle-ui .fighter.you").length === 1 && document.querySelectorAll(".battle-ui .fighter.enemy").length === 1 && document.querySelectorAll(".battle-ui .hp-bar").length === 2));
  check("hp in state and CSS bridge", s.pikou_hp === 20 && s.rat_hp === 8 && await p.evaluate(() => document.body.dataset.pikou_hp === "20" && getComputedStyle(document.body).getPropertyValue("--pikou_hp").trim() === "20"), JSON.stringify(s));
  check("main menu without Changer (one living you)", JSON.stringify(st.menu) === '["Combattre","Fuir"]', JSON.stringify(st.menu));

  /* 2. Real clicks: Combattre, then Charge (normal move, defense 20): 2 or 3 damage, counter-attack after */
  await p.click('.menu button[data-index="0"]'); await p.waitForTimeout(40);
  await p.click('.menu button[data-index="0"]'); await p.waitForTimeout(80);
  s = await t.state(); st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  check("click flow runs a move, faster side first", s.rat_hp >= 5 && s.rat_hp <= 6 && st.log.some((l) => l === "Pikou utilise Charge."), JSON.stringify({ rat: s.rat_hp, log: st.log }));
  check("counter-attack lowers our hp", s.pikou_hp < 20, JSON.stringify(s));
  check("no error so far", t.errors.length === 0, t.errors.join("|"));
  await t.close();

  /* 3. Type table: fire against grass is doubled (17 to 20 damage on 100 PV, defense 10) */
  t = await open(BATTLE(YOU + RAT(100, { defense: 10 })), ["battle"]);
  p = t.page;
  await p.evaluate(() => document.querySelector("x-battle").api.start());
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  await p.evaluate(() => document.querySelector("x-battle").api.choose(1));
  s = await t.state();
  check("fire on grass is doubled", s.rat_hp >= 80 && s.rat_hp <= 83, JSON.stringify(s.rat_hp));
  await t.close();

  /* 4. Fire against water is halved (4 or 5 damage) */
  t = await open(BATTLE(YOU + RAT(100, { defense: 10, type: "water" })), ["battle"]);
  p = t.page;
  await p.evaluate(() => document.querySelector("x-battle").api.start());
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  await p.evaluate(() => document.querySelector("x-battle").api.choose(1));
  s = await t.state();
  check("fire on water is halved", s.rat_hp >= 95 && s.rat_hp <= 96, JSON.stringify(s.rat_hp));
  await t.close();

  /* 5. Victory: effects of on-win, event battle:won:b1, panel removed, battle_open back to 0 */
  t = await open(BATTLE(YOU + RAT(1)), ["battle"]);
  p = t.page;
  await p.evaluate(() => { window.__won = false; window.X.on("battle:won:b1", function () { window.__won = true; }); });
  await p.evaluate(() => document.querySelector("x-battle").api.start());
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  s = await t.state();
  check("victory ends the fight", s.battle_result === "won" && s.battle_open === 0 && s.gold === 5 && await p.evaluate(() => window.__won === true && !document.querySelector(".battle-ui")), JSON.stringify(s));
  await t.close();

  /* 6. Defeat: a frail player fighter faster than nothing, the faster enemy KOs first and no move is made */
  t = await open(BATTLE(FRAIL + RAT(50, { attack: 50, speed: 9 })), ["battle"]);
  p = t.page;
  await p.evaluate(() => document.querySelector("x-battle").api.start());
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  s = await t.state(); st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  check("faster enemy KOs first, defeat", s.battle_result === "lost" && s.lost === 1 && s.pikou_hp === 0 && !st.log.some((l) => l.indexOf("Pikou utilise") === 0), JSON.stringify({ s: s.battle_result, lost: s.lost, log: st.log }));
  await t.close();

  /* 7. Flight: with a random roll of 0 the escape works (fled, on-flee effect) */
  t = await open(BATTLE(YOU + RAT(8)), ["battle"]);
  p = t.page;
  await p.evaluate(() => document.querySelector("x-battle").api.start());
  await p.evaluate(() => { Math.random = () => 0; });
  st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  await p.evaluate((i) => document.querySelector("x-battle").api.choose(i), menuIndex(st, "Fuir"));
  s = await t.state();
  check("flight works and runs on-flee", s.battle_result === "fled" && s.fled === 1 && s.battle_open === 0, JSON.stringify(s));
  await t.close();

  /* 8. Restart: hit points back to the start, battle closed, and the battle can start again */
  t = await open(BATTLE(YOU + RAT(8)), ["battle"]);
  p = t.page;
  await p.evaluate(() => document.querySelector("x-battle").api.start());
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  await p.evaluate(() => window.X.restart());
  await p.waitForTimeout(60);
  s = await t.state();
  check("restart restores hit points and closes the battle", s.pikou_hp === 20 && s.rat_hp === 8 && (s.battle_open || 0) === 0 && await p.evaluate(() => !document.querySelector(".battle-ui")), JSON.stringify(s));
  await p.evaluate(() => window.X.emit("battle:b1", {}));
  await p.waitForTimeout(40);
  check("battle starts again after restart", (await t.state()).battle_open === 1 && await p.evaluate(() => !!document.querySelector(".battle-ui")));
  await t.close();

  /* 9. Keys: 1 opens the moves, Escape goes back, arrows move the cursor */
  t = await open(BATTLE(YOU + RAT(8)), ["battle"]);
  p = t.page;
  await p.evaluate(() => document.querySelector("x-battle").api.start());
  await p.waitForTimeout(40);
  await p.keyboard.press("1"); await p.waitForTimeout(40);
  st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  check("digit key opens the moves", st.mode === "moves" && st.menu.indexOf("Charge (10)") >= 0, JSON.stringify(st.menu));
  await p.keyboard.press("Escape"); await p.waitForTimeout(40);
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(40);
  const sel = await p.evaluate(() => document.querySelector(".battle-ui .menu button.sel").textContent);
  st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  check("Escape goes back, arrows move the cursor", st.mode === "main" && sel === "Fuir", JSON.stringify({ mode: st.mode, sel }));
  await t.close();

  /* 10. Switch: with two living fighters, Changer lists the other one (default values for a bad hp) */
  const SWITCH_YOU = YOU + `<x-fighter side="you" name="Lili" hp="abc" attack="6" defense="5" speed="4" type="normal">
  <x-move name="Pince" power="5" type="normal" uses="5"></x-move></x-fighter>`;
  t = await open(BATTLE(SWITCH_YOU + RAT(30, { attack: 2 })), ["battle"]);
  p = t.page;
  await p.evaluate(() => document.querySelector("x-battle").api.start());
  st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  await p.evaluate((i) => document.querySelector("x-battle").api.choose(i), menuIndex(st, "Changer"));
  st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  const lili = st.menu.find((l) => l.indexOf("Lili (") === 0);
  await p.evaluate((i) => document.querySelector("x-battle").api.choose(i), st.menu.indexOf(lili));
  st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  check("switch brings the chosen fighter in", st.fighters.some((f) => f.name === "Lili" && f.active) && st.mode === "main", JSON.stringify(st.fighters));
  check("bad hp is reported and defaults to 10", st.fighters.find((f) => f.name === "Lili").max === 10 && (await t.problems()).some((m) => m.indexOf("hp is not a number") >= 0), JSON.stringify(await t.problems()));
  await t.close();

  /* 11. Forced switch: the active fighter faints, no Retour in the menu, the next one goes in */
  t = await open(BATTLE(FRAIL + `<x-fighter side="you" name="Lili" hp="20" attack="6" defense="5" speed="4" type="normal">
  <x-move name="Pince" power="5" type="normal" uses="5"></x-move></x-fighter>` + RAT(50, { attack: 50, speed: 9 })), ["battle"]);
  p = t.page;
  await p.evaluate(() => document.querySelector("x-battle").api.start());
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  check("fainted fighter forces a switch", st.mode === "switch" && st.menu.indexOf("Retour") < 0 && st.menu.some((l) => l.indexOf("Lili (20/20)") === 0) && (await t.state()).battle_open === 1, JSON.stringify(st.menu));
  await t.close();

  /* 12. Fallback: when every move is spent, Lutte is offered and works */
  t = await open(BATTLE(NOUSES + RAT(8)), ["battle"]);
  p = t.page;
  await p.evaluate(() => document.querySelector("x-battle").api.start());
  await p.evaluate(() => document.querySelector("x-battle").api.choose(0));
  st = await p.evaluate(() => document.querySelector("x-battle").api.state());
  check("Lutte offered when no move is left", st.menu.indexOf("Lutte") === 1 && st.menu.length === 3, JSON.stringify(st.menu));
  await p.evaluate(() => document.querySelector("x-battle").api.choose(1));
  s = await t.state();
  check("Lutte hits", s.rat_hp < 8, JSON.stringify(s));
  check("no page errors", t.errors.length === 0 && (await t.problems()).length === 0, t.errors.join("|") + JSON.stringify(await t.problems()));
  await t.close();
})().catch((e) => { console.log("FAIL harness error  " + e.message); process.exitCode = 1; });
