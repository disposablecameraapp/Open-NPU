/**
 * The shelved platformer path (`src/core/shelved/`): nothing in the app uses it. These tests keep it working on its own, so it can be
 * taken back if it is ever wanted, without it standing in for the general construction engine.
 */
import { describe, expect, it } from "vitest";
import { buildSpecPage } from "../../src/core/shelved/xspecbuild";
import { defaultLevel, joinLevels, normalizeLevel, normalizeSpec, svgBlocks } from "../../src/core/shelved/xspec";
import type { XEvent, XHost } from "../../src/core/xbuild";

const SPEC = JSON.stringify({ title: "Run", howto: "Arrows", labels: { play: "Play", retry: "Try again", win: "You win!", over: "Game over", lives: "Lives", coins: "Coins", score: "Score", time: "Time" }, palette: { sky: "#5c94fc", pipe: "#2ea043" }, line: { width: 3, color: "#202030" }, lives: 3, time: 120, art: [{ role: "hero", name: "hero", about: "a runner in a red cap", w: 28, h: 36 }, { role: "enemy", name: "goomba", about: "a brown mushroom", w: 28, h: 28 }] });
const LEVEL = JSON.stringify({ width: 60, ground: [{ from: 0, to: 25 }, { from: 29, to: 59 }], things: [{ kind: "coin", x: 8, y: 3 }, { kind: "block", x: 12, y: 3, gives: "mushroom" }, { kind: "brick", x: 14, y: 3, w: 3 }, { kind: "enemy", x: 20, y: 0, name: "goomba" }, { kind: "pipe", x: 34, y: 0, h: 2 }, { kind: "flag", x: 56, y: 0 }] });
const svg = (fill: string) => `<svg viewBox="0 0 28 36"><circle cx="14" cy="10" r="8" fill="${fill}"/></svg>`;

function host(answer: (label: string, user: string) => string, resume?: string): { host: XHost; asked: { label: string; user: string }[] } {
  const asked: { label: string; user: string }[] = [];
  return {
    asked,
    host: {
      room: 8000, resume,
      ask: async function* (_sid, messages, label, _schema, onText) { const user = typeof messages[1].content === "string" ? messages[1].content : ""; asked.push({ label, user }); const t = answer(label, user); onText?.(t); return t; }
    }
  };
}
async function run(h: XHost, request = "a platformer") { const events: XEvent[] = []; const g = buildSpecPage(request, h); let r = await g.next(); while (!r.done) { events.push(r.value); r = await g.next(); } return { events, result: r.value }; }
const drawn = (user: string) => ["hero", "goomba"].filter((n) => user.includes(`- ${n} (`)).map((n) => `<!-- ${n} -->\n${svg("#369")}`).join("\n");
const answer = (label: string, user: string) => (label.startsWith("Design") ? SPEC : label.startsWith("Level") ? LEVEL : label.startsWith("Drawing") ? drawn(user) : "");

describe("the shelved platformer path", () => {
  it("makes the page from two closed forms and one reply of drawings", async () => {
    const h = host(answer);
    const { result } = await run(h.host);
    for (const id of ["title", "win", "over", "level_1"]) expect(result.html).toContain(`<x-scene id="${id}">`);
    expect(result.html).toContain("# at 0-25 0-1");
    expect(result.html).toContain("@ player art:hero");
    expect(result.html).toContain('<x-asset name="goomba"');
    expect(result.html).toContain("<!-- /x-build -->");
    expect(h.asked.map((a) => a.label.split(" ")[0])).toEqual(["Design", "Level", "Drawing"]);
  });

  it("writes a long level in parts and draws many objects in several replies", async () => {
    const wide = JSON.parse(SPEC);
    wide.art = [wide.art[0], wide.art[1], ...["a", "b", "c", "d", "e"].map((n) => ({ role: "enemy", name: `foe_${n}`, about: `a foe of kind ${n}`, w: 28, h: 28 }))];
    let levelCalls = 0;
    const h = host((label, user) => {
      if (label.startsWith("Design")) return JSON.stringify(wide);
      if (label.startsWith("Level")) { levelCalls++; return JSON.stringify({ width: 40, more: levelCalls < 3, ground: [{ from: 0, to: 39 }], things: [{ kind: "coin", x: 5, y: 3 }, { kind: "brick", x: 10, y: 3 }, { kind: "enemy", x: 20, y: 0 }, { kind: "coin", x: 30, y: 3 }] }); }
      if (label.startsWith("Drawing")) return [...user.matchAll(/^- (\w+) \(/gm)].map((x) => `<!-- ${x[1]} -->\n${svg("#369")}`).join("\n");
      return "";
    });
    const { result } = await run(h.host);
    expect(levelCalls).toBe(3);
    expect(result.html).toContain("# at 0-119 0-1");
    expect(h.asked.filter((a) => a.label.startsWith("Drawing")).length).toBeGreaterThan(1);
    for (const a of wide.art) expect(result.html).toContain(`<x-asset name="${a.name}"`);
  });

  it("takes a stopped page up again and keeps a drawing that never came as the colour of its kind", async () => {
    const first = await run(host(answer).host);
    const cut = first.result.html.slice(0, first.result.html.indexOf('<x-asset name="goomba"'));
    const h = host(answer, cut);
    const { result } = await run(h.host);
    expect(h.asked.map((a) => a.label.split(" ")[0])).toEqual(["Drawing"]);
    expect(result.html).toContain('<x-asset name="goomba"');
    const none = await run(host((l, u) => (l.startsWith("Drawing") ? "" : answer(l, u))).host);
    expect(none.result.html).not.toContain("art:");
  });

  it("repairs what a model gets wrong", () => {
    const spec = normalizeSpec({ palette: { sky: "blue" }, art: [{ role: "hero", name: "H", about: "x" }, { role: "enemy", name: "e", about: "x" }] });
    expect(spec.palette.sky).toBe("#5c94fc");
    expect(spec.art.map((a) => a.name)).toEqual(["h"]); // one description copied is one drawing
    expect(normalizeLevel({ width: 50, ground: [], things: [] }).ok).toBe(false);
    expect(joinLevels([defaultLevel(40), defaultLevel(40)]).width).toBe(80);
    expect(svgBlocks('<!-- hero: a runner -->\n<svg viewBox="0 0 8 8"><rect/></svg>\n<!-- coin -->\n<svg viewBox="0 0 8 8"><circ').map((b) => b.name)).toEqual(["hero"]);
  });
});
