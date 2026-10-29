import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/core/construct/pipeline";
import { normalizeArt, normalizeSvg } from "../src/core/construct/art";
import { unitsFromPage } from "../src/core/construct/assemble";
import { ContextEngine } from "../src/core/construct/context";
import { checkUnit } from "../src/core/construct/pipeline";
import { playPage } from "../src/core/construct/sandbox";
import { TEMPLATES, pickTemplate, templatePage } from "../src/core/construct/templates";

describe.each(TEMPLATES.map((t) => [t.id, t] as const))("the %s template", (_id, t) => {
  const engine = new ContextEngine(t.plan, 20000);
  for (const u of t.plan.units) engine.accept(u.name, { code: t.code[u.name], verified: true, problems: [] });

  it("has code for every unit and serves every requirement", () => {
    for (const u of t.plan.units) expect(t.code[u.name], u.name).toBeTruthy();
    for (const r of t.plan.requirements) expect(t.plan.units.some((u) => u.serves.includes(r.id)), r.id).toBe(true);
  });

  it("passes the engine's own checks, unit by unit (parse, examples, a run on the real state)", async () => {
    for (const u of t.plan.units) {
      // a restart pressed while the game runs does nothing, by design
      const found = (await checkUnit(u, t.code[u.name], engine)).filter((p) => !(u.name === "onRestart" && /S did not change at all/.test(p)));
      expect(found, u.name).toEqual([]);
    }
  });

  it("plays with no error: loaded, drawn, keys pressed, 200 ticks", async () => {
    const html = templatePage(t);
    const script = /<script>\n([\s\S]*)\n<\/script>/.exec(html)![1].replace(/<\\\/script/gi, "</script");
    const hs = t.plan.units.filter((h) => h.kind === "handler" && h.on);
    const keyOf = (on: string, ev: string) => new RegExp(`^${ev} (\\S+)$`).exec(on)?.[1];
    const errs = await playPage({
      script,
      ticks: hs.filter((h) => /^tick \d+$/.test(h.on!)).map((h) => h.name),
      down: hs.flatMap((h) => { const k = keyOf(h.on!, "keydown"); return k ? [{ name: h.name, key: k }] : []; }),
      up: hs.flatMap((h) => { const k = keyOf(h.on!, "keyup"); return k ? [{ name: h.name, key: k }] : []; }),
      clicks: []
    }, t.plan.units.map((u) => u.name));
    expect(errs).toEqual([]);
  });

  it("is a page of the engine's own form, so a change can take it up", () => {
    const html = templatePage(t);
    expect(html).toContain("<!-- x-construct");
    expect(html).toContain(`/* unit:${t.plan.units.find((u) => u.kind === "fn")!.name} */`);
  });
});

describe("choosing a template", () => {
  it("asks each closed question in turn and takes the first yes, or none", async () => {
    const asked: string[] = [];
    const pick = await pickTemplate(async (q) => { asked.push(q); return /seen from above/.test(q); });
    expect(pick?.id).toBe("rpg");
    expect(asked).toHaveLength(2);
    expect(await pickTemplate(async () => false)).toBeNull();
    expect(await pickTemplate(async () => null)).toBeNull();
  });
});

/** The template's units loaded as the page loads them, with S in reach, to play a few turns by hand. */
function load(id: string): Record<string, (...a: unknown[]) => unknown> & { S: any } {
  const t = TEMPLATES.find((x) => x.id === id)!;
  const names = t.plan.units.filter((u) => u.kind === "fn" || u.kind === "handler").map((u) => u.name);
  const src = `var S = ${t.code.S};\n${names.map((n) => t.code[n]).join("\n")}\nreturn { S: S, ${names.join(", ")} };`;
  return new Function(src)();
}

describe("the templates play", () => {
  it("the platformer: the player falls onto the ground, runs right, jumps, and the camera follows", () => {
    const g = load("platformer");
    for (let i = 0; i < 20; i++) g.onTick();
    expect(g.S.player.grounded).toBe(true);
    expect(g.S.player.y).toBe(400 - g.S.player.h);
    g.onRightDown();
    for (let i = 0; i < 60; i++) g.onTick();
    expect(g.S.player.x).toBeGreaterThan(200);
    g.onJumpDown();
    g.onTick();
    expect(g.S.player.vy).toBeLessThan(0);
    expect(g.S.cameraX).toBeGreaterThanOrEqual(0);
  });

  it("the platformer: a pit costs a life and the last one ends the game, Enter starts again", () => {
    const g = load("platformer");
    g.S.player.x = 920; g.S.player.y = 100;
    for (let i = 0; i < 200 && g.S.lives === 3; i++) g.onTick();
    expect(g.S.lives).toBe(2);
    g.S.lives = 1; g.S.player.x = 920; g.S.player.y = 100;
    for (let i = 0; i < 200 && g.S.mode === "playing"; i++) g.onTick();
    expect(g.S.mode).toBe("over");
    g.onRestart();
    expect(g.S.mode).toBe("playing");
    expect(g.S.lives).toBe(3);
  });

  it("the rpg: walls block, the elder gives the key, the door opens with it", () => {
    const g = load("rpg");
    g.onUp();
    expect(g.S.player.row).toBe(1);
    g.onRight(); g.onRight();
    expect(g.S.player.col).toBe(2);
    g.onRight();
    expect(g.S.player.col).toBe(2); // the elder is in the way
    g.onAct();
    expect(g.S.dialog.open).toBe(true);
    g.onAct(); g.onAct();
    expect(g.S.dialog.open).toBe(false);
    expect(g.S.bag.keys).toBe(1);
    g.S.player.col = 11; g.S.player.row = 8; g.S.player.facing = "right";
    g.onAct();
    expect(g.S.mode).toBe("won");
  });

  it("the rpg: a monster next to the player hurts it, and Space hits back", () => {
    const g = load("rpg");
    g.S.enemies[0].col = 6; g.S.enemies[0].row = 4; g.S.enemies[0].dir = 1; g.S.player.col = 5; g.S.player.row = 4;
    g.onEnemies();
    expect(g.S.player.hp).toBeLessThan(5);
    g.onAct(); g.onAct();
    expect(g.S.enemies[0].alive).toBe(false);
  });
});

describe("a template page is taken up like a finished build", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s: every unit is found again in its page, with its code", (_id, t) => {
    const found = unitsFromPage(templatePage(t), t.plan);
    for (const u of t.plan.units) expect(found.has(u.name), u.name).toBe(true);
    expect(found.get("onTick" in t.code ? "onTick" : "onAct")!.code).toBe(t.code["onTick" in t.code ? "onTick" : "onAct"]);
  });
});

describe("the pictures of a program are kept coherent by code", () => {
  const art = { stroke: 2, palette: { outline: "#3b2314", shirt: "#e53935", skin: "#ffcc99" } };
  it("gives a drawing its real size, one stroke width and the palette's colours, and drops what draws nothing", () => {
    const raw = "Here: <svg viewBox='0 0 400 400' width='400' height='400'><script>x()</script><text>hi</text><rect x='1' y='1' width='10' height='10' fill='#e03030' stroke='#000000' stroke-width='7'/></svg>";
    const out = normalizeSvg(raw, art, [28, 36])!;
    expect(out).toContain("viewBox='0 0 28 36'");
    expect(out).toContain("width='28' height='36'");
    expect(out).toContain("stroke-width='2'");
    expect(out).toContain("fill='var(--shirt, #e53935)'");
    expect(out).toContain("stroke='var(--outline, #3b2314)'");
    expect(out).not.toMatch(/script|text/);
    expect(normalizeSvg("<svg viewBox='0 0 4 4'></svg>", art, [4, 4])).toBeNull();
    expect(normalizeSvg("no picture here", art, [4, 4])).toBeNull();
  });
  it("puts every sprite of a state right (a model drawing at another size and colour), and leaves a state without art alone", () => {
    const t = TEMPLATES.find((x) => x.id === "platformer")!;
    const o = JSON.parse(t.code.S);
    o.art.sprites.enemy = "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='#8c3a2e' stroke='#111111' stroke-width='9'/></svg>";
    const fixed = JSON.parse(normalizeArt(JSON.stringify(o)));
    expect(fixed.art.sprites.enemy).toContain("viewBox='0 0 28 28'");
    expect(fixed.art.sprites.enemy).toContain("stroke-width='2'");
    expect(fixed.art.sprites.enemy).toContain("fill='var(--enemy, #8d3b2f)'");
    expect(normalizeArt('{"a":1}')).toBe('{"a":1}');
    expect(normalizeArt("not json")).toBe("not json");
  });
  it("the template's own drawings are already in that form", () => {
    const t = TEMPLATES.find((x) => x.id === "platformer")!;
    const o = JSON.parse(t.code.S);
    expect(JSON.parse(normalizeArt(t.code.S)).art.sprites).toEqual(o.art.sprites);
  });
});

describe("a change to a platformer is a change of data", () => {
  it("a faster player is one number of the config; a new map is one more entry of the levels", () => {
    const g = load("platformer");
    for (let i = 0; i < 20; i++) g.onTick();
    g.onRightDown();
    for (let i = 0; i < 10; i++) g.onTick();
    const slow = g.S.player.x;
    const f = load("platformer");
    f.S.config.walk = 6.4;
    for (let i = 0; i < 20; i++) f.onTick();
    f.onRightDown();
    for (let i = 0; i < 10; i++) f.onTick();
    expect(f.S.player.x).toBeGreaterThan(slow);
  });
  it("reaching the flag leads to the next level, then to the win", () => {
    const g = load("platformer");
    expect(g.S.levels.length).toBe(2);
    for (let i = 0; i < 20; i++) g.onTick();
    g.S.player.x = g.S.flag.x - 5;
    g.onTick();
    expect(g.S.levelIndex).toBe(1);
    expect(g.S.worldW).toBe(g.S.levels[1].worldW);
    g.S.player.x = g.S.flag.x - 5; g.S.player.y = 364;
    g.onTick();
    expect(g.S.mode).toBe("won");
    g.onRestart();
    expect(g.S.levelIndex).toBe(0);
    expect(g.S.mode).toBe("playing");
  });
});

describe("a request to a template is changed one wish at a time", () => {
  it("sets aside what the template already does, works out each new wish alone, and does not take its own requirements back as new ones", async () => {
    const t = TEMPLATES.find((x) => x.id === "platformer")!;
    const seen: string[] = [];
    const logs: string[] = [];
    const host = {
      resume: templatePage(t), change: "I want a timer at the top and the character runs left and right", template: t.label, room: 12000, problems: [],
      async *ask(sid: string) {
        seen.push(sid);
        if (/Requirements/.test(sid)) return JSON.stringify({ title: "Mario", language: "English", requirements: [{ text: "A time left is shown at the top of the screen" }, { text: "The character runs left and right with the arrow keys" }] });
        if (/Covered/.test(sid)) return "P1 | new\nP2 | covered";
        if (/Change \(P1\)/.test(sid)) return "view drawTimer | shows the time left at the top | into: hud\nrequirement | R1: A character is shown on a level made of platforms and can run left and right with the arrow keys";
        if (/Unit: drawTimer/.test(sid)) return 'function drawTimer() {\n  const hud = document.getElementById("hud");\n  hud.querySelector("#message").textContent = "Time " + Math.round(S.time);\n}';
        return "";
      }
    };
    const gen = buildProgram("x", host as never);
    let r = await gen.next();
    while (!r.done) { if (r.value.type === "log") logs.push(r.value.text); r = await gen.next(); }
    expect(seen.filter((s) => /Change/.test(s))).toHaveLength(1); // only the new wish is worked out
    expect(logs.join("\n")).toContain("wishes: 2, already met by the template: 1, to work out: 1");
    expect(seen.filter((s) => /Plan \(R/.test(s))).toEqual([]); // nothing planned twice
    expect(r.value.html).toContain("function drawTimer");
    expect(r.value.html).toContain("function onTick"); // the rest of the template is as it was
  });
});
