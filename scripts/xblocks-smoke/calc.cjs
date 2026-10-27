const { open, check } = require("./harness.cjs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const t = await open(`<!doctype html><body>
<x-state prix="3" qte="4" zero="0" tasks='[{"title":"a","done":true,"eur":2},{"title":"b","done":false,"eur":5},{"title":"c","done":true,"eur":1}]'></x-state>
<x-calc name="total" value="prix * qte + 1"></x-calc>
<x-calc name="arith" value="2 + 3 * 4 - (10 - 4) / 3"></x-calc>
<x-calc name="neg" value="-prix + 10 % 4"></x-calc>
<x-calc name="mn" value="min(prix, qte, 2)"></x-calc>
<x-calc name="rd" value="round(7.666, 2)"></x-calc>
<x-calc name="rr" value="round(7.66)"></x-calc>
<x-calc name="fl" value="floor(2.7) + ceil(2.1) + abs(-4)"></x-calc>
<x-calc name="cnt" value="count(tasks)"></x-calc>
<x-calc name="cdone" value="count(tasks, done == true)"></x-calc>
<x-calc name="cdone2" value="count(tasks, done)"></x-calc>
<x-calc name="sumeur" value="sum(tasks, eur)"></x-calc>
<x-calc name="len" value="tasks.length"></x-calc>
<x-calc name="div" value="prix / zero"></x-calc>
<x-calc name="bad" value="prix +* 2"></x-calc>
<x-calc name="x" value="y + 1"></x-calc>
<x-calc name="y" value="x + 1"></x-calc>
<x-scene id="s1"><x-calc name="hidc" value="prix * 10"></x-calc><p>one</p></x-scene>
<x-scene id="s2"><p>two</p></x-scene>
</body>`, ["calc"]);
  const p = t.page;
  const st = () => t.state();
  const run = (src) => p.evaluate((s) => window.X.run(s), src);
  const problems = async () => t.problems();

  let s = await st();
  check("total from state", s.total === 13, "total=" + s.total);
  check("precedence, parentheses, unary minus", s.arith === 12 && s.neg === -1, `arith=${s.arith} neg=${s.neg}`);
  check("min, round, floor, ceil, abs", s.mn === 2 && s.rd === 7.67 && s.rr === 8 && s.fl === 9, JSON.stringify({ mn: s.mn, rd: s.rd, rr: s.rr, fl: s.fl }));
  check("count, sum and length of a list", s.cnt === 3 && s.cdone === 2 && s.cdone2 === 2 && s.sumeur === 8 && s.len === 3,
    JSON.stringify({ cnt: s.cnt, cdone: s.cdone, cdone2: s.cdone2, sumeur: s.sumeur, len: s.len }));

  await run("qte+=1"); await wait(40);
  check("recomputes when a read state changes", (await st()).total === 16, "total=" + (await st()).total);
  await run('add:tasks {title: "d", done: true, eur: 4}'); await wait(40);
  s = await st();
  check("recomputes when a list changes", s.cdone === 3 && s.cnt === 4 && s.sumeur === 12 && s.len === 4,
    JSON.stringify({ cdone: s.cdone, cnt: s.cnt, sumeur: s.sumeur, len: s.len }));

  s = await st();
  check("division by zero gives 0 and a message", s.div === 0 && (await problems()).some((x) => x.includes("division by zero")), `div=${s.div}`);
  check("a syntax error gives 0 and a message", s.bad === 0 && (await problems()).some((x) => x.includes("calc bad")), `bad=${s.bad}`);

  await wait(200);
  check("calcs that change each other stop", (await problems()).some((x) => x.includes("loop")) && (await p.evaluate(() => 1)) === 1);

  await p.evaluate(() => window.X.restart()); await wait(60);
  s = await st();
  check("restart brings the calcs back", s.total === 13 && s.cdone === 2 && s.cnt === 3, JSON.stringify({ total: s.total, cdone: s.cdone, cnt: s.cnt }));

  await p.evaluate(() => window.X.go("s2")); await run("prix=4"); await wait(40);
  s = await st();
  check("a calc in a hidden scene still computes", s.hidc === 40 && s.total === 17, `hidc=${s.hidc} total=${s.total}`);

  check("no page errors", t.errors.length === 0, t.errors.join("|"));
  await t.close();
})();
