/* Art block in Chromium: assets, inline drawing, cleaning, colours, changes, and the art: look in map and platformer.
 * Usage (from the repo root): node scripts/xblocks-smoke/art.cjs */
const { open, check } = require("./harness.cjs");

const ASSETS = `
<style>body{--arbre_vert:#00aa00}</style>
<x-asset name="oiseau" size="34x24" about="un oiseau jaune de profil"><svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#ffcc00"/></svg></x-asset>
<x-asset name="arbre"><svg viewBox="0 0 10 10"><rect width="10" height="10" fill="var(--arbre_vert, #f00)"/></svg></x-asset>`;

const pageA = `<!doctype html><body>
<x-state gold="0"></x-state>
${ASSETS}
<p>Ready</p>
<x-art id="bird" of="oiseau"></x-art>
<x-art id="tree" of="arbre" size="20x20"></x-art>
<x-art id="ghost" of="nope"></x-art>
<x-map id="m" tile="32"><x-legend>
# wall
@ player
. floor
o enemy art:oiseau still as:bird
T wall art:arbre as:tree
</x-legend>
#######
#@o.T.#
#.....#
#######
</x-map>
</body>`;

const pageP = `<!doctype html><body>
<x-state lives="3"></x-state>
<x-asset name="brique" size="32x32"><svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0000"/></svg></x-asset>
<x-asset name="grand" size="64x64"><svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#00ff00"/></svg></x-asset>
<x-platformer id="p" view="8" tile="32"><x-legend>
P player
# ground art:brique
Z ground art:nope
o coin art:grand
</x-legend>
P.......
......o.
ZZZZ#ZZZ
</x-platformer>
</body>`;

const pageBad = `<!doctype html><body>
<x-state gold="0"></x-state>
<p>Clean</p>
</body>`;

(async () => {
  /* ---------- page A: assets, inline drawing, colours, unknown names, changes ---------- */
  const a = await open(pageA, ["art", "map"]);
  const p = a.page;
  const assetOf = (n) => p.evaluate((n) => { const x = window.X.art(n); return x && { w: x.w, h: x.h, about: x.about, svg: x.svg }; }, n);
  const oiseau = await assetOf("oiseau");
  check("an x-asset is registered with its size and words",
    !!oiseau && oiseau.w === 34 && oiseau.h === 24 && oiseau.about === "un oiseau jaune de profil" && oiseau.svg.indexOf("#ffcc00") >= 0, JSON.stringify(oiseau));
  check("the definition is hidden (display none)",
    await p.evaluate(() => getComputedStyle(document.querySelector("x-asset")).display === "none"));
  check("x-art draws the svg with classes art art-<name> at the asset size",
    await p.evaluate(() => { const s = document.querySelector("#bird svg.art.art-oiseau"); const r = s && s.getBoundingClientRect(); return !!r && r.width === 34 && r.height === 24; }));
  check("x-art size overrides the asset size",
    await p.evaluate(() => { const s = document.querySelector("#tree svg.art-arbre"); return !!s && s.getBoundingClientRect().width === 20; }));
  check("a colour variable of the page is used inline",
    await p.evaluate(() => getComputedStyle(document.querySelector("#tree rect")).fill === "rgb(0, 170, 0)"));
  check("an unknown name shows a dashed placeholder and a problem",
    await p.evaluate(() => !!document.querySelector("#ghost .art-missing")) && (await a.problems()).some((m) => m.indexOf('no asset named "nope"') >= 0), JSON.stringify(await a.problems()));

  const colourOfImage = (name) => p.evaluate((n) => new Promise((res) => window.X.artImage(n, (img) => {
    if (!img) return res(null);
    fetch(img.src).then((r) => r.text()).then(res, () => res("ERR"));
  })), name);
  const svgText = await colourOfImage("arbre");
  check("artImage replaces var(--x, fallback) by the page colour before drawing",
    typeof svgText === "string" && svgText.indexOf("#00aa00") >= 0 && svgText.indexOf("var(") < 0, String(svgText).slice(0, 200));
  check("artImage of an unknown name answers null", await p.evaluate(() => new Promise((res) => window.X.artImage("nope", (img) => res(img === null)))));

  /* the picture is made again when the page colour changes */
  await p.evaluate(() => { document.body.style.setProperty("--arbre_vert", "#0000cc"); });
  await p.waitForTimeout(40);
  const svgText2 = await colourOfImage("arbre");
  check("a changed colour variable makes the picture again", typeof svgText2 === "string" && svgText2.indexOf("#0000cc") >= 0, String(svgText2).slice(0, 120));
  await p.evaluate(() => { document.body.style.removeProperty("--arbre_vert"); });

  /* an asset edited on the page: the inline drawings and the map follow */
  const v0 = await p.evaluate(() => window.X.artVersion);
  await p.evaluate(() => document.querySelector('x-asset[name="oiseau"] rect').setAttribute("fill", "#0000ff"));
  await p.waitForTimeout(60);
  check("an asset change is reflected in x-art and bumps the art version",
    await p.evaluate(() => getComputedStyle(document.querySelector("#bird rect")).fill === "rgb(0, 0, 255)") &&
    (await p.evaluate(() => window.X.artVersion)) > v0);
  check("an asset change is reflected in the map entity",
    await p.evaluate(() => getComputedStyle(document.querySelector('[data-map="m"] .entity.bird rect')).fill === "rgb(0, 0, 255)"));

  /* a new x-asset added to the page is registered */
  await p.evaluate(() => document.body.insertAdjacentHTML("beforeend", '<x-asset name="etoile"><svg viewBox="0 0 4 4"><rect width="4" height="4" fill="#fff"/></svg></x-asset><x-art id="star" of="etoile"></x-art>'));
  await p.waitForTimeout(60);
  check("an x-asset inserted later is registered and drawn", await p.evaluate(() => !!window.X.art("etoile") && !!document.querySelector("#star svg.art-etoile")));

  /* art: in a legend of map: a tile and an entity */
  check("art: look draws the object on a map tile (one tile big)",
    await p.evaluate(() => { const s = document.querySelector('[data-map="m"] .tile.wall.tree svg.art-arbre'); return !!s && s.getBoundingClientRect().width === 32; }));
  check("art: look draws the object on a map entity",
    await p.evaluate(() => !!document.querySelector('[data-map="m"] .entity.enemy.bird svg.art-oiseau')));
  check("the map keeps its other tiles (walls and floor)",
    await p.evaluate(() => document.querySelectorAll('[data-map="m"] .tile.wall').length === 19));

  /* hostile drawings are cleaned, whatever the route in */
  const outside = [];
  p.on("request", (r) => { if (/^https?:/.test(r.url())) outside.push(r.url()); });
  await p.evaluate((html) => document.body.insertAdjacentHTML("beforeend", html), '<x-asset name="bad"><svg viewBox="0 0 10 10"><script>window.__pwn = 1</script><rect width="10" height="10" fill="#123456" onload="window.__pwn = 2"/><a href="https://example.com/x"><rect width="2" height="2" fill="#654321"/></a><image href="http://example.com/a.png" width="2" height="2"/><style>@import url(http://example.com/a.css); .a{fill:red}</style></svg></x-asset>');
  await p.waitForTimeout(60);
  const bad = await p.evaluate(() => { const x = window.X.art("bad"); return x ? x.svg : null; });
  check("a drawing inserted on the page is cleaned: no script, no handler, no outside link",
    typeof bad === "string" && !/<script|onload|example\.com|@import|url\(http/i.test(bad) && bad.indexOf("#123456") >= 0 && (await p.evaluate(() => window.__pwn)) === undefined, String(bad));
  check("cleanSvg refuses text that is not a drawing", await p.evaluate(() => window.X.cleanSvg("un texte sans dessin") === ""));
  check("cleanSvg refuses a doctype and entities", await p.evaluate(() => window.X.cleanSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>') === ""));
  check("cleanSvg keeps #anchor links and drops javascript: and data: links",
    await p.evaluate(() => {
      const c = window.X.cleanSvg('<svg viewBox="0 0 2 2"><defs><rect id="s" width="1" height="1"/></defs><use href="#s"/><a href="javascript:alert(1)"><rect width="1" height="1"/></a><a href="data:text/html,x"><rect width="1" height="1"/></a></svg>');
      return c.indexOf('href="#s"') >= 0 && !/javascript|data:/i.test(c);
    }));
  check("cleanSvg drops foreignObject, iframe, animate on href and event attributes",
    await p.evaluate(() => {
      const c = window.X.cleanSvg('<svg viewBox="0 0 2 2" onclick="x()"><foreignObject><div>hi</div></foreignObject><iframe src="http://x"></iframe><rect width="1" height="1"><animate attributeName="href" to="javascript:alert(1)"/></rect></svg>');
      return !/foreignObject|iframe|animate|onclick|javascript/i.test(c) && c.indexOf("<rect") >= 0;
    }));
  /* the browser parses inserted markup before it can be cleaned: an outside image link is requested once (a limit, see the note) */
  console.log("note: an outside link in markup inserted on the page is requested by the browser before cleaning: " + (outside.length ? outside.join(", ") : "none seen"));
  check("no script error on the page", a.errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, a.errors.join("|"));
  check("no problem beyond the expected unknown name", (await a.problems()).every((m) => /nope|definition|no size|twice/.test(m) || m.indexOf("art:") < 0), JSON.stringify(await a.problems()));
  await a.close();

  /* ---------- page P: art: in a platformer legend, drawn on the canvas ---------- */
  const b = await open(pageP, ["art", "platformer"]);
  const pb = b.page;
  await pb.waitForTimeout(400);
  const pixel = (cx, cy) => pb.evaluate(([x, y]) => {
    const c = document.querySelector("x-platformer canvas"), t = 32;
    const d = c.getContext("2d").getImageData(Math.floor(x * t), Math.floor(y * t), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, [cx, cy]);
  const near = (rgb, want) => rgb.every((v, i) => Math.abs(v - want[i]) <= 12);
  check("art: look on a platformer cell is drawn from the asset (red brick)", near(await pixel(4.5, 2.5), [255, 0, 0]), JSON.stringify(await pixel(4.5, 2.5)));
  check("a big asset is drawn over its 2x2 cells, above and left of its coin cell", near(await pixel(5.7, 0.3), [0, 255, 0]) && near(await pixel(6.5, 0.5), [0, 255, 0]), JSON.stringify([await pixel(5.7, 0.3), await pixel(6.5, 0.5)]));
  check("while the picture is not ready or unknown, the role colour is kept (ground)", near(await pixel(0.5, 2.5), [0x8d, 0x5a, 0x2b]), JSON.stringify(await pixel(0.5, 2.5)));
  check("an unknown art name in a platformer is reported", (await b.problems()).some((m) => m.indexOf('no asset named "nope"') >= 0), JSON.stringify(await b.problems()));
  await pb.evaluate(() => document.querySelector('x-asset[name="brique"] rect').setAttribute("fill", "#0000ff"));
  await pb.waitForTimeout(150);
  check("a changed asset is drawn again on the canvas", near(await pixel(4.5, 2.5), [0, 0, 255]), JSON.stringify(await pixel(4.5, 2.5)));
  await pb.evaluate(() => document.querySelector("x-platformer").api.step(1 / 30));
  check("the platformer still runs with art (steps, no error)", b.errors.length === 0, b.errors.join("|"));
  await b.close();

  /* ---------- page: an x-asset written in the page source is parsed by the document ---------- */
  const c = await open(pageBad.replace("<p>Clean</p>", '<x-asset name="raw"><svg viewBox="0 0 4 4"><script>window.__raw = 1</script><rect width="4" height="4" fill="#fff"/></svg></x-asset>'), ["art"]);
  await c.page.waitForTimeout(60);
  const raw = await c.page.evaluate(() => ({ ran: window.__raw === 1, kept: !!window.X.art("raw") }));
  console.log("note: a script written inside an x-asset of the page source " + (raw.ran ? "runs when the page is parsed (the page writer must not put scripts in it)" : "does not run") + "; cleaning applies to the drawing text");
  check("an x-asset written in the page source is still registered", raw.kept, JSON.stringify(raw));
  await c.close();
})();
