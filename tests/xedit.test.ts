import { describe, expect, it } from "vitest";
import { editXPage, elementEnd, locate, namesOf, unitsOf, type XEditResult } from "../src/core/xedit";
import type { XEvent, XHost } from "../src/core/xbuild";
import { xFlaws } from "../src/core/xcheck";

const LEVEL = `<x-platformer tile="32" view="16"><x-legend>
# ground
P player
o coin score+=1
g walker as:goomba stomp:score+=100 hurt:lives-=1
F flag
</x-legend>
...........
..P..o.g.F.
###########</x-platformer>`;

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Game</title>
<style>
:root{--sky:#7ec8ff;--pipe:#2a9d3a}
body{margin:0;background:var(--sky)}
h1{font-size:40px;text-align:center}
.overlay{position:fixed;top:8px;left:12px}
</style></head>
<body>
<x-state lives="3" score="0"></x-state>
<x-asset name="hero" size="28x36" about="a small hero in a red cap" style="display:none">
<svg viewBox="0 0 28 36"><rect x="6" y="2" width="16" height="10" fill="#d33"/></svg>
</x-asset>
<x-asset name="goomba" size="32x32" about="a brown mushroom walking enemy" style="display:none">
<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#8b5a2b"/></svg>
</x-asset>
<x-scene id="title">
<h1>Run</h1><button data-click="go:level_1">Play</button>
</x-scene>
<x-scene id="level_1">
${LEVEL}
</x-scene>
<div id="hud" class="overlay">
<span>Score <x-value of="score"></x-value></span>
</div>
</body></html>
`;

/** A model that answers by the label of the call. */
function fake(replies: Record<string, string | ((n: number) => string)>): XHost & { asked: { label: string; user: string }[] } {
  const asked: { label: string; user: string }[] = [];
  const count: Record<string, number> = {};
  return {
    room: 6000, asked,
    async *ask(_sid, messages, label) {
      asked.push({ label, user: String(messages[1].content) });
      const key = Object.keys(replies).find((k) => label.startsWith(k)) ?? "";
      count[key] = (count[key] ?? 0) + 1;
      const r = replies[key];
      yield 0;
      return typeof r === "function" ? r(count[key]) : (r ?? "");
    }
  };
}
async function run(request: string, host: XHost, html = PAGE): Promise<{ result: XEditResult; events: XEvent[] }> {
  const events: XEvent[] = [];
  const g = editXPage(request, html, host);
  for (;;) { const r = await g.next(); if (r.done) return { result: r.value, events }; events.push(r.value); }
}

describe("the units of a page", () => {
  it("are found with their exact place", () => {
    const units = unitsOf(PAGE);
    expect(units.filter((u) => u.kind === "scene").map((u) => u.id)).toEqual(["title", "level_1"]);
    expect(units.filter((u) => u.kind === "asset").map((u) => u.id)).toEqual(["hero", "goomba"]);
    expect(units.find((u) => u.kind === "block")!.label).toContain("x-platformer in level_1");
    expect(units.find((u) => u.kind === "overlay")!.id).toBe("hud");
    expect(units.filter((u) => u.kind === "style").map((u) => u.id)).toEqual([":root", "body", "h1", ".overlay"]);
    for (const u of units) expect(PAGE.slice(u.start, u.end)).toBe(u.text);
    expect(elementEnd("<div><div>a</div></div>x", 0)).toBe(23);
  });
  it("are chosen by the words of the request", () => {
    const u = unitsOf(PAGE);
    expect(locate("make the goomba red", u)[0].unit.id).toBe("goomba");
    expect(locate("rends les ennemis plus petits", u)[0].unit.id).toBe("goomba");
    expect(locate("make the level wider", u)[0].unit.kind).toBe("block");
    expect(locate("show the score bigger", u)[0].unit.id).toBe("hud");
    expect(locate("make the hero's cap blue", u)[0].unit.id).toBe("hero");
  });
});

describe("changing a page of blocks", () => {
  it("changes one drawing and nothing else, to the byte", async () => {
    const host = fake({ Changing: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#d22" onclick="x()"/></svg>' });
    const { result } = await run("make the goomba red", host);
    const goomba = unitsOf(PAGE).find((u) => u.id === "goomba")!;
    expect(result.html.slice(0, goomba.start)).toBe(PAGE.slice(0, goomba.start));
    expect(result.html.slice(result.html.length - (PAGE.length - goomba.end))).toBe(PAGE.slice(goomba.end));
    expect(result.html).toContain("#d22");
    expect(result.html).not.toContain("onclick");
    expect(result.html).toContain('<x-asset name="goomba"');
    expect(result.changes).toHaveLength(1);
    expect(host.asked.length).toBe(1); // found by its words: no model asked which part
    expect(host.asked[0].user.length).toBeLessThan(2500); // only that unit, never the page
    expect(host.asked[0].user).not.toContain("Run");
  });

  it("changes one CSS rule", async () => {
    const host = fake({ "Which part": "1", Changing: "h1{font-size:64px;text-align:center;color:#c00}" });
    const { result } = await run("make the title bigger and red", host);
    expect(result.html).toContain("font-size:64px");
    expect(result.html).toContain("body{margin:0;background:var(--sky)}");
    expect(xFlaws(result.html).length).toBe(xFlaws(PAGE).length);
  });

  it("changes the level and keeps the page sound, writing again once with the exact problem when the first answer was not", async () => {
    const bad = LEVEL.replace("..P..o.g.F.", "....o.g.F."); // the player is gone
    const good = LEVEL.replace("###########", "#############").replace("...........", ".............").replace("..P..o.g.F.", "..P..o.g.F...");
    const host = fake({ Changing: (n) => (n === 1 ? bad : good) });
    const { result } = await run("make the level wider", host);
    expect(host.asked.length).toBe(2);
    expect(host.asked[1].user).toContain("these problems");
    expect(result.html).toContain("#############");
    expect(result.refused).toEqual([]);
  });

  it("refuses a change it cannot make soundly, and the page stays as it was", async () => {
    const bad = LEVEL.replace("..P..o.g.F.", "....o.g.F.");
    const { result } = await run("make the level wider", fake({ Changing: bad }));
    expect(result.html).toBe(PAGE);
    expect(result.refused.join()).toMatch(/player/);
    expect(result.warnings.join()).toContain("was not applied");
  });

  it("each change stands or falls alone", async () => {
    const bad = LEVEL.replace("..P..o.g.F.", "....o.g.F.");
    const host = fake({ "Separate": "- make the goomba red\n- make the level wider", "Changing: make the goomba": '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#d22"/></svg>', "Changing: make the level": bad });
    const { result } = await run("make the goomba red; make the level wider", host);
    expect(result.html).toContain("#d22");
    expect(unitsOf(result.html).find((u) => u.kind === "block")!.text).toBe(LEVEL);
    expect(result.changes).toHaveLength(1);
    expect(result.refused).toHaveLength(1);
  });

  it("adds to the end of a section, with a drawing for what it uses", async () => {
    const add = '<style>.cloud{width:60px}</style><x-rule on="stomp:goomba" do="score+=100"></x-rule><div class="cloud"><x-art of="cloud"></x-art></div>';
    const host = fake({ Adding: add, "Drawing cloud": '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#fff"/></svg>' });
    const { result } = await run("add a cloud to level 1", host);
    const level = unitsOf(result.html).find((u) => u.id === "level_1" && u.kind === "scene")!;
    expect(level.text).toContain('<x-art of="cloud">');
    expect(level.text.indexOf(LEVEL.slice(0, 40))).toBeLessThan(level.text.indexOf("cloud"));
    expect(result.html).toContain('<x-asset name="cloud"');
    expect(namesOf(PAGE).every((n) => namesOf(result.html).includes(n))).toBe(true);
  });

  it("says so when nothing matches, instead of touching something at random", async () => {
    const { result } = await run("zzzz qqqq", fake({}));
    expect(result.html).toBe(PAGE);
    expect(result.refused.length).toBe(1);
  });

  it("keeps the names of the page: a screen that loses its markup is still there", async () => {
    const host = fake({ Changing: "<h1>Hello</h1>" });
    const { result } = await run("make the title screen say Hello", host);
    expect(namesOf(result.html)).toEqual(expect.arrayContaining(["scene:title", "scene:level_1", "asset:goomba"]));
    expect(result.html).toContain("<h1>Hello</h1>");
  });
});
