const { open, check } = require("./harness.cjs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const t = await open(`<!doctype html><body>
<x-state time="0" n="0" ended="0" shot="0" w="0" w2="0" pause="0" go="0" hid="0" clk="75" five="5"></x-state>
<x-timer id="fast" every="100ms" do="time+=1"></x-timer>
<x-timer id="three" every="50ms" times="3" do="n+=1"></x-timer>
<x-timer id="once" after="300ms" do="shot+=1"></x-timer>
<x-timer id="paused" every="50ms" while="pause==0" do="w+=1"></x-timer>
<x-timer id="late" every="50ms" start="go==1" do="w2+=1"></x-timer>
<x-timer id="bad" every="banana" do="bad+=1"></x-timer>
<p><x-clock id="c1" of="clk" format="s"></x-clock> <x-clock id="c2" of="clk"></x-clock> <x-clock id="c3" of="clk" format="mm:ss"></x-clock> <x-clock id="c4" of="five"></x-clock></p>
<x-rule on="end:three" do="ended+=1"></x-rule>
<x-scene id="a"><p>A</p></x-scene>
<x-scene id="b"><x-timer id="sb" every="50ms" do="hid+=1"></x-timer></x-scene>
</body>`, ["timer"]);
  const p = t.page;
  const text = (id) => p.textContent("#" + id);
  const st = async () => t.state();

  check("clock s and m:ss", (await text("c1")) === "75" && (await text("c2")) === "1:15", `${await text("c1")} / ${await text("c2")}`);
  check("clock mm:ss and minutes from a plain number", (await text("c3")) === "01:15" && (await text("c4")) === "0:05", `${await text("c3")} / ${await text("c4")}`);

  await p.evaluate(() => window.X.set("clk", 3725)); await wait(40);
  check("clock follows the state", (await text("c2")) === "62:05" && (await text("c1")) === "3725", `${await text("c2")}`);

  await wait(1000);
  let s = await st();
  check("every ticks while time passes", s.time >= 4, "time=" + s.time);

  check("times stops after n and emits end", s.n === 3 && s.ended === 1, `n=${s.n} ended=${s.ended}`);

  check("after fires once", s.shot === 1, "shot=" + s.shot);

  await p.evaluate(() => window.X.set("pause", 1)); await wait(60);
  const w0 = (await st()).w; await wait(300);
  check("while pauses the timer", (await st()).w === w0, `w ${w0} -> ${(await st()).w}`);
  await p.evaluate(() => window.X.set("pause", 0)); await wait(300);
  check("while resumes the timer", (await st()).w > w0);

  check("start waits for its condition", (await st()).w2 === 0);
  await p.evaluate(() => window.X.set("go", 1)); await wait(300);
  check("start begins the timer once true", (await st()).w2 > 0, "w2=" + (await st()).w2);

  check("a timer in a hidden scene does not run", (await st()).hid === 0, "hid=" + (await st()).hid);
  await p.evaluate(() => window.X.go("b")); await wait(300);
  const h1 = (await st()).hid;
  check("it runs when its scene is shown", h1 > 0, "hid=" + h1);
  await p.evaluate(() => window.X.go("a")); await wait(120);
  const h2 = (await st()).hid; await wait(300);
  check("and stops when the scene is hidden again", (await st()).hid === h2);

  await p.evaluate(() => window.X.restart()); await wait(400);
  s = await st();
  check("restart resets state and timers", s.n === 3 && s.ended === 1 && s.w2 === 0 && s.time > 0 && s.hid === 0,
    JSON.stringify({ n: s.n, ended: s.ended, w2: s.w2, time: s.time, hid: s.hid }));

  const problems = await t.problems();
  check("bad every is reported, not thrown", problems.some((x) => x.includes("banana")), JSON.stringify(problems));
  check("no page errors", t.errors.length === 0, t.errors.join("|"));
  await t.close();
})();
