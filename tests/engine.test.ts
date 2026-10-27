import { describe, expect, it } from "vitest";
import { ARCADE_WORDS, ENGINE_SOURCE, GAME_SCHEMA, GameSpec, exportGame, gameFlaw, gamePage, parseGameSpec, specOfPage, withEngine } from "../src/core/engine";
import { stepwise, Session } from "../src/core/build";
import type { ChatEvent, ChatMessage } from "../src/shared/types";

const catcher: GameSpec = {
  title: "Catch", lives: 3,
  things: [{ name: "basket", w: 80, h: 16, x: 0.5, y: 0.92, control: "horizontal", color: "#4af" }, { name: "apple", shape: "circle", w: 22, vy: 160, edges: "remove", color: "#f55" }],
  rules: [{ when: { every: 1 }, do: [{ op: "spawn", name: "apple", at: "top" }] }, { when: { hit: ["basket", "apple"] }, do: [{ op: "score" }, { op: "remove", who: "b" }] }]
};

describe("the game engine", () => {
  it("a described game is checked, and the reasons are in words", () => {
    expect(gameFlaw(catcher)).toEqual([]);
    expect(gameFlaw({ things: [{ name: "a" }], rules: [] })).toContain("nothing moves and the player has no control");
    const bad = gameFlaw({ ...catcher, rules: [{ when: { hit: ["basket", "pear"] }, do: [{ op: "remove", who: "c" }] }] });
    expect(bad.join("|")).toMatch(/"pear" is not a thing/);
    expect(bad.join("|")).toMatch(/"c" is not a thing/);
  });
  it("reads the JSON out of whatever wraps it", () => {
    expect(parseGameSpec("Here:\n```json\n" + JSON.stringify(catcher) + "\n```\nenjoy")?.title).toBe("Catch");
    expect(parseGameSpec("no json")).toBeNull();
  });
  it("the stored page is the description only, the engine is added when the page is shown, and the description comes back", () => {
    const page = gamePage(catcher);
    expect(page).toContain("Game.run(");
    expect(page).not.toContain("var Game =");
    expect(page.split("\n").length).toBeLessThan(80);
    expect(specOfPage(page)).toEqual(catcher);
    expect(specOfPage("<html></html>")).toBeNull();
    expect(withEngine(page)).toContain("var Game =");
    expect(withEngine(withEngine(page))).toBe(withEngine(page));
    expect(withEngine("<body><script>Game.run({things:[]})</script></body>")).toContain('id="engine"');
  });
  it("exports as a page, as plain code, or as the description", () => {
    expect(exportGame(catcher, "html")).toMatchObject({ name: "catch.html" });
    expect(exportGame(catcher, "html").content).toContain("var Game =");
    const js = exportGame(catcher, "js");
    expect(js.name).toBe("catch.js");
    expect(() => new Function(js.content.replace("const game = Game.run", "Game.run").replace(/Game\.run\([\s\S]*$/, ""))).not.toThrow();
    expect(JSON.parse(exportGame(catcher, "json").content)).toEqual(catcher);
  });
  it("the engine script parses and the schema is closed", () => {
    expect(() => new Function(ENGINE_SOURCE)).not.toThrow();
    expect(GAME_SCHEMA.additionalProperties).toBe(false);
    expect(ARCADE_WORDS.test("fais un casse-briques")).toBe(true);
    expect(ARCADE_WORDS.test("make a snake game")).toBe(false);
  });
  it("an arcade request is written with the engine shown by examples, in one session, with no schema and no page to adapt", async () => {
    const stats = { ttftSec: 0.1, tokPerSec: 10, tokens: 5, totalSec: 0.5 };
    const seen: { sid: string; system: string; user: string; schema: unknown }[] = [];
    const page = gamePage(catcher);
    const stream: Session = async function* (sid, m: ChatMessage[], _w, _r, schema) {
      seen.push({ sid, system: String(m[0]?.content ?? ""), user: String(m[m.length - 1]?.content ?? ""), schema });
      yield { id: sid, type: "answer", text: page } as ChatEvent;
      yield { id: sid, type: "done", stats } as ChatEvent;
    };
    const g = stepwise({ id: "t", messages: [{ role: "system", content: "s" }, { role: "user", content: "make a catch the apples arcade game" }], stream, maxChars: 20000 });
    const events: ChatEvent[] = [];
    let r = await g.next(); while (!r.done) { events.push(r.value); r = await g.next(); }
    const write = seen.find((s) => s.sid === "t:write:0")!;
    expect(write.schema).toBeUndefined();
    expect(write.system).toContain("small game engine");
    expect(write.system).toContain("{op:");
    expect(write.user).toContain("How a game is written with the engine");
    expect(write.user).toContain("Game.run(");
    expect(write.user).not.toContain("Start from it");
    expect(seen.some((s) => s.sid.includes(":game:"))).toBe(false); // no hidden description step
    expect(events.map((e) => (e as any).text ?? "").join("")).toContain("Game.run(");
  });
});

import { chooseGameWay } from "../src/core/engine";
describe("engine or code by hand", () => {
  it("the words decide when they can, the router when they cannot", async () => {
    expect((await chooseGameWay("make a pong game from scratch in vanilla js")).way).toBe("code");
    expect((await chooseGameWay("fais un casse-briques sans librairie")).way).toBe("code");
    expect((await chooseGameWay("pong with the engine")).way).toBe("engine");
    expect((await chooseGameWay("make a space invaders game", async () => true)).way).toBe("engine");
    expect((await chooseGameWay("make a playable flappy bird game", async () => true)).way).toBe("engine");
    expect((await chooseGameWay("make a to-do app")).way).toBe("code");
  });
});

import { gamePage, parseGameSpec } from "../src/core/engine";
describe("fit", () => {
  it("is read from the description and left out of the page", () => {
    const spec = parseGameSpec('{"fit":"hard","fit_reason":"x","things":[{"name":"a"}],"rules":[]}')!;
    expect(spec.fit).toBe("hard");
    expect(gamePage(spec)).not.toContain("fit_reason");
  });
});

describe("flappy bird in the engine", () => {
  const spec: GameSpec = {
    fit: "hard", lives: 3, things: [
      { name: "bird", shape: "circle", gravity: 900, edges: "stop", x: 0.2, y: 0.5 },
      { name: "pipe", pair: 150, w: 60, vx: -200, edges: "remove" },
      { name: "ground", h: 8, w: 800, x: 0, y: 1 }
    ],
    rules: [
      { when: { key: "Space" }, do: [{ op: "velocity", who: "bird", vy: -330 }] },
      { when: { start: true }, do: [{ op: "spawn", name: "pipe", at: "right" }] },
      { when: { every: 1.8 }, do: [{ op: "spawn", name: "pipe", at: "right" }, { op: "score", by: 1 }] },
      { when: { hit: ["bird", "pipe"] }, do: [{ op: "lives", by: -1 }, { op: "remove", who: "b" }] },
      { when: { hit: ["bird", "ground"] }, do: [{ op: "lives", by: -1 }, { op: "velocity", who: "bird", vy: -330 }] }
    ]
  };
  it("is a valid description and its engine still parses", () => {
    expect(gameFlaw(spec)).toEqual([]);
    expect(() => new Function(ENGINE_SOURCE)).not.toThrow();
    expect(GAME_SCHEMA.properties.things.items.properties).toHaveProperty("pair");
  });
});

describe("the file name of a game", () => {
  it("is the game's own name, never index", async () => {
    const { gameFileName } = await import("../src/core/engine");
    expect(gameFileName("make a playable flappy bird game")).toBe("flappy-bird.html");
    expect(gameFileName("fais un jeu")).toBe("game.html");
  });
});

describe("a description is mended, not thrown away", () => {
  it("drops what names a thing that does not exist and keeps the game", async () => {
    const { healGame } = await import("../src/core/engine");
    const spec: GameSpec = {
      lives: 3, things: [{ name: "bird", gravity: 900 }, { name: "pipe", pair: 150, vx: -200 }],
      rules: [
        { when: { key: "Space" }, do: [{ op: "velocity", who: "bird", vy: -300 }] },
        { when: { hit: ["player", "pipe"] }, do: [{ op: "lives", by: -1 }] },
        { when: { every: 2 }, do: [{ op: "spawn", name: "pipe" }, { op: "spawn", name: "ghost" }] }
      ]
    };
    expect(gameFlaw(spec).length).toBeGreaterThan(0);
    const { spec: fixed, dropped } = healGame(spec);
    expect(gameFlaw(fixed)).toEqual([]);
    expect(fixed.rules).toHaveLength(2);
    expect(fixed.rules[1].do).toHaveLength(1);
    expect(dropped.length).toBe(2);
  });
});

describe("the example of the format", () => {
  it("is a description that holds up and is in the instructions", async () => {
    const { GAME_EXAMPLE, GAME_INSTRUCTIONS } = await import("../src/core/engine");
    expect(gameFlaw(JSON.parse(GAME_EXAMPLE))).toEqual([]);
    expect(GAME_INSTRUCTIONS).toContain(GAME_EXAMPLE);
  });
});

describe("what a description must say about the player", () => {
  it("flags a game the person cannot act in and a rule that removes the thing they move", () => {
    const still: GameSpec = { lives: 3, things: [{ name: "bird", gravity: 900 }, { name: "pipe", vx: -100 }], rules: [{ when: { hit: ["bird", "pipe"] }, do: [{ op: "lives", by: -1 }] }] };
    expect(gameFlaw(still).join(" ")).toContain("the player cannot do anything");
    const eats: GameSpec = { lives: 3, things: [{ name: "bird", gravity: 900 }, { name: "floor" }], rules: [{ when: { key: "Space" }, do: [{ op: "velocity", who: "bird", vy: -300 }] }, { when: { hit: ["floor", "bird"] }, do: [{ op: "remove", who: "b" }] }] };
    expect(gameFlaw(eats).join(" ")).toContain("removes bird");
    const ok = { ...eats, rules: [eats.rules[0], { when: { hit: ["bird", "floor"] }, do: [{ op: "remove", who: "b" }] }] };
    expect(gameFlaw(ok)).toEqual([]);
  });
});

describe("what the engine fills in for a small model", () => {
  it("makes frame-based numbers per second, spawned things move in and go away, the player stays on screen", async () => {
    const { normalizeGame } = await import("../src/core/engine");
    const spec: GameSpec = {
      things: [
        { name: "bird", gravity: 0.5, edges: "remove" },
        { name: "pipe", pair: 150, vx: -3 },
        { name: "heart" }
      ],
      rules: [
        { when: { key: "Space" }, do: [{ op: "velocity", who: "bird", vy: -8 }] },
        { when: { every: 5 }, do: [{ op: "spawn", name: "heart", at: "right" }, { op: "lives", by: 1 }] }
      ]
    };
    const n = normalizeGame(spec);
    const by = (name: string) => n.things.find((t) => t.name === name)!;
    expect(by("bird").gravity).toBe(1800);
    expect(by("bird").edges).toBe("stop");
    expect(n.rules[0].do[0].vy).toBe(-480);
    expect(by("pipe").vx).toBe(-180);
    expect(by("heart").vx).toBe(-160);
    expect(by("heart").edges).toBe("remove");
    expect(n.lives).toBe(3);
    expect(spec.things[0].gravity).toBe(0.5); // the original is not touched
  });
  it("does not put a thing that rules spawn on the screen at the start", () => {
    expect(ENGINE_SOURCE).toContain("spawned[t.name] && !t.count");
  });
});

describe("the engine reaches the places that run a page", () => {
  it("is added by the preview and the test run (bundleHtml) and by what is opened or saved (siteFiles)", async () => {
    const { bundleHtml } = await import("../src/core/bundle");
    const { siteFiles } = await import("../src/core/site");
    const page = gamePage(catcher);
    expect(bundleHtml(page, []).html).toContain("var Game =");
    expect(siteFiles([{ title: "catch.html", kind: "html", language: "html", content: page }])[0].content).toContain("var Game =");
  });
});
