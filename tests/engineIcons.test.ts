import { describe, it, expect } from "vitest";
import { GAME_SCHEMA, gameFlaw, gamePage, type GameSpec } from "../src/core/engine";

describe("an icon as the look of a thing in a described game", () => {
  const spec: GameSpec = {
    title: "Stars", things: [{ name: "player", shape: "icon", icon: "rocket", color: "#7cf", w: 36, h: 36, control: "horizontal", y: 0.9 }, { name: "star", shape: "icon", icon: "star", color: "#fd5", vy: 120, edges: "remove" }],
    rules: [{ when: { hit: ["player", "star"] }, do: [{ op: "score", by: 1 }, { op: "remove", who: "b" }] }, { when: { every: 1 }, do: [{ op: "spawn", name: "star", at: "top" }] }, { when: { score: 10 }, do: [{ op: "win", text: "You win" }] }]
  };
  it("is optional in the schema and checked: an icon shape needs a real icon", () => {
    expect(JSON.stringify(GAME_SCHEMA)).toContain('"icon"');
    expect(gameFlaw(spec)).toEqual([]);
    expect(gameFlaw({ ...spec, things: [{ ...spec.things[0], icon: "zzzzqq" }, spec.things[1]] }).join(" ")).toContain("shape icon needs");
    expect(gameFlaw({ ...spec, things: [{ name: "player", shape: "rect", control: "horizontal" }, spec.things[1]] })).toEqual([]); // no icon needed
  });
  it("writes only the icons used into the page, as inline drawings with no network", () => {
    const page = gamePage(spec);
    expect(page).toContain('<script id="icons">window.__icons=');
    expect(page).toContain('"rocket"');
    expect(page).not.toMatch(/(src|href)=["']https?:/); // the only address is the SVG namespace, which loads nothing
    expect(gamePage({ ...spec, things: [{ name: "p", control: "horizontal" }, { name: "s", vy: 50 }] })).not.toContain('id="icons"');
  });
});
