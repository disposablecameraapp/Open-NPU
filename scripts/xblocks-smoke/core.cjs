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
  await p.evaluate(() => { window.X.set("tasks", [{ title: "a" }, { title: "b" }, { title: "c" }]); window.X.run("remove:tasks 1"); });
  await p.waitForTimeout(30); s = await t.state(); check("remove by index", s.tasks.map((x) => x.title).join() === "a,c", JSON.stringify(s.tasks));
  const bad = await p.evaluate(() => { window.X.problems.length = 0; window.X.set("gold", 0); window.X.set("hp", 2); window.X.run("gold+=1 ??? hp-=1"); const a = [window.X.get("gold"), window.X.get("hp"), window.X.problems.length > 0]; window.X.problems.length = 0; const r = window.X.test("hp-1 > 0"); return a.concat([r, window.X.problems.length > 0]); });
  check("unreadable effect reported, rest runs", bad[0] === 1 && bad[1] === 1 && bad[2] === true, JSON.stringify(bad));
  check("leftover condition refused", bad[3] === false && bad[4] === true, JSON.stringify(bad));
  check("no errors", t.errors.length === 0, t.errors.join("|"));
  console.log("problems", JSON.stringify(await t.problems()));
  await t.close();
})();
