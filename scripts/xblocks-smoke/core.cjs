const { open, check } = require("./harness.cjs");
(async () => {
  const t = await open(`<!doctype html><body>
<x-state hp="3" gold="0" name="Ana" tasks='[]' hp-max="5"></x-state>
<p id="v">Gold <x-value of="gold"></x-value></p>
<button id="b" data-click="gold+=2 hp-=1">buy</button>
<div id="w" data-when="gold>=4 && hp<3">rich</div>
<form id="f" data-submit="add:tasks {title: name, done: false}"><button id="s">add</button></form>
<x-list of="tasks"><template><li class="t" data-click="toggle:tasks.{index}.done">{title}</li></template></x-list>
<x-scene id="a"><p>A</p></x-scene><x-scene id="b2"><p>B</p></x-scene>
<button id="g" data-click="go:b2">go</button>
<x-rule when="gold>=6" do="win"></x-rule>
<x-rule on="enter:b2" do="gold+=10"></x-rule>
</body>`);
  const p = t.page;
  let s = await t.state();
  check("state read", s.hp === 3 && s.gold === 0 && s.name === "Ana" && Array.isArray(s.tasks));
  check("css bridge", await p.evaluate(() => document.body.dataset.hp === "3" && getComputedStyle(document.body).getPropertyValue("--hp").trim() === "3"));
  await p.click("#b"); await p.click("#b"); await p.waitForTimeout(50);
  s = await t.state();
  check("effects += -=", s.gold === 4 && s.hp === 1, JSON.stringify(s));
  check("value shown", (await p.textContent("#v")).includes("4"));
  check("data-when", await p.evaluate(() => document.getElementById("w").style.display === ""));
  await p.click("#s"); await p.waitForTimeout(50);
  s = await t.state(); check("add to list", s.tasks.length === 1 && s.tasks[0].title === "Ana", JSON.stringify(s.tasks));
  check("list rendered", (await p.textContent("x-list")).includes("Ana"));
  await p.click(".t"); await p.waitForTimeout(50);
  s = await t.state(); check("toggle path", s.tasks[0].done === true, JSON.stringify(s.tasks));
  check("scene", await p.evaluate(() => document.getElementById("b2").hidden === true));
  await p.click("#g"); await p.waitForTimeout(80);
  s = await t.state();
  check("go scene + event rule", s.gold >= 10 && (await p.evaluate(() => document.getElementById("b2").hidden === false)), JSON.stringify(s));
  check("edge rule win", await p.evaluate(() => !!document.getElementById("x-over")));
  check("tolerant effects", await p.evaluate(() => { window.X.run("gold = 0 hp++ gold + 1 hp -= 1"); return true; }));
  await p.waitForTimeout(40); s = await t.state(); check("tolerant result", s.gold === 1, JSON.stringify(s));
  check("max clamp", await p.evaluate(() => { window.X.run("hp += 50"); return window.X.get("hp") === 5; }));
  check("no errors", t.errors.length === 0, t.errors.join("|"));
  console.log("problems", JSON.stringify(await t.problems()));
  await t.close();
})();
