import { describe, expect, it } from "vitest";
import { buildXPage, cleanSvg, plainArt, type XEvent, type XHost } from "../src/core/xbuild";
import { defaultOutline, mendFragment, mendNames, nearestName, parseOutline, parseTasks } from "../src/core/xplan";
import { blocksFor, docFor } from "../src/core/xdocs";
import { xFlaws } from "../src/core/xcheck";

const OUTLINE = `STYLE: bright, flat colours
STATE: lives=3, score=0, time=200
SECTION 1: Title | none | the title; a play button
SECTION 2: Level 1 | platformer, timer | ground; coins; an enemy; the flag
SECTION 3: HUD | none | score and lives
SECTION 4: Game over | none | a retry button
ART: hero | 28x36 | a small hero`;

/** A model that answers by the label of the call, and records what it was sent. */
function fake(replies: Record<string, string | ((n: number) => string)>, seen: { label: string; system: string; user: string }[] = []): XHost {
  const count: Record<string, number> = {};
  return {
    room: 6000,
    async *ask(_sid, messages, label) {
      const key = Object.keys(replies).find((k) => label.startsWith(k)) ?? "";
      count[key] = (count[key] ?? 0) + 1;
      seen.push({ label, system: String(messages[0].content), user: String(messages[1].content) });
      const r = replies[key];
      yield { label };
      return typeof r === "function" ? r(count[key]) : (r ?? "");
    }
  };
}

const ALL = {
  Outline: OUTLINE,
  Look: "<style>:root{--bg:#223;--text:#fff;--accent:#fc0;--hero:#c33} body{margin:0;background:var(--bg);color:var(--text)}</style>",
  "Drawing hero": `<svg viewBox="0 0 28 36"><circle cx="14" cy="10" r="8" fill="var(--hero,#c33)" onclick="x()"/><script>alert(1)</script></svg>`,
  "Tasks of Level": "- the ground and the pits\n- the coins and an enemy\n- the flag",
  "Title:": `<h1>Run!</h1><button data-click="go:level_1">Play</button>`,
  "Level 1: the ground": `<x-platformer tile="32" view="16"><x-legend>
# ground
P player
o coin score+=1
F flag
</x-legend>
.........
..P...oF.
#########</x-platformer>`,
  "Level 1: the coins": `<x-rule when="lives<=0" do="go:Game_over"></x-rule>`,
  "Level 1: the flag": `<x-rule on="flag" do="go:you win"></x-rule>`,
  "HUD:": `<span>Score <x-value of="score"></x-value></span> <span>Lives <x-value of="lives"></x-value></span>`,
  "Game over:": `<h2>Game over</h2><button data-click="restart">Retry</button>`
};

async function run(host: XHost) {
  const events: XEvent[] = [];
  const gen = buildXPage("a platformer like the first mario", host);
  for (;;) { const r = await gen.next(); if (r.done) return { result: r.value, events }; events.push(r.value); }
}

describe("a page of blocks written in steps", () => {
  it("writes a page of its own parts, in order, and mends what is a little off", async () => {
    const { result, events } = await run(fake(ALL));
    const html = result.html;
    expect(html).toMatch(/<x-scene id="title">[\s\S]*<h1>Run!<\/h1>/);
    expect(html).toContain('<x-scene id="level_1">');
    expect(html).toContain('go:game_over'); // "Game_over" was a little off: replaced, not only reported
    expect(html).toContain('<x-asset name="hero"');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("alert(1)");
    expect(html).toMatch(/<x-state [^>]*lives="3"/);
    expect(html).toContain("--hero");
    expect(html.trim().endsWith("</html>")).toBe(true);
    // the page only grows at its end: what was shown is the beginning of what it is
    const streamed = events.filter((e): e is Extract<XEvent, { type: "chunk" }> => e.type === "chunk").map((e) => e.text).join("");
    expect(streamed).toBe(html);
  });

  it("starts styled and fills in: the CSS first, the numbers and drawings before the sections, each task's CSS before its markup", async () => {
    const { events } = await run(fake({ ...ALL, "Level 1: the ground": `<style>.hero{width:28px}</style><x-platformer tile="32"><x-legend>\n# ground\nP player\nF flag\n</x-legend>\n.PF\n###</x-platformer>` }));
    const chunks = events.filter((e): e is Extract<XEvent, { type: "chunk" }> => e.type === "chunk").map((e) => e.text);
    expect(chunks[0]).toMatch(/<style>[\s\S]*--bg/); // the first thing shown is the base CSS
    const so = (n: number) => chunks.slice(0, n).join("");
    const html = chunks.join("");
    expect(html.indexOf("<x-state")).toBeLessThan(html.indexOf("<x-scene"));
    expect(html.indexOf("<x-asset")).toBeLessThan(html.indexOf("<x-scene"));
    expect(html.indexOf(".hero{width:28px}")).toBeLessThan(html.indexOf("<x-platformer"));
    expect(html.indexOf("<x-platformer")).toBeLessThan(html.indexOf("</html>"));
    expect(so(1)).not.toContain("<x-scene"); // nothing but the head and its CSS at first
    // every prefix of the page that ends on a chunk is a page a browser can show
    for (let i = 1; i <= chunks.length; i++) expect(so(i).split("<x-scene").length - 1).toBeGreaterThanOrEqual(so(i).split("</x-scene>").length - 1);
  });

  it("gives every call a short frame, never the whole page", async () => {
    const seen: { label: string; system: string; user: string }[] = [];
    await run(fake(ALL, seen));
    const write = seen.filter((s) => s.label.startsWith("Level 1:"));
    expect(write.length).toBe(3);
    for (const w of write) {
      expect(w.user.length + w.system.length).toBeLessThan(9000);
      expect(w.user).toContain("scenes (for go:): title, level_1, game_over");
      expect(w.user).toContain("hero 28x36");
    }
    expect(write[1].user).toContain("This section so far"); // its own section, not the others
    expect(write[1].user).not.toContain("Run!");
    expect(write[0].system).toContain("PLATFORMER");
    expect(seen.find((s) => s.label.startsWith("Title:"))!.system).not.toContain("PLATFORMER"); // only the blocks it uses
  });

  it("uses the standard outline when the model gives nothing, and never stops half-way", async () => {
    const { result } = await run(fake({ ...ALL, Outline: "I think we should make a fun game!" }));
    expect(result.outline.sections.map((s) => s.id)).toContain("level_1");
    expect(result.warnings.join("\n")).toContain("standard outline");
    expect(result.html.trim().endsWith("</html>")).toBe(true);
  });

  it("leaves a stub for a task that comes back empty twice and goes on", async () => {
    const { result } = await run(fake({ ...ALL, "Level 1: the coins": "" }));
    expect(result.html).toContain("<!-- left out:");
    expect(result.warnings.join("\n")).toContain("could not be written");
    expect(result.html).toContain("</x-scene>");
  });

  it("writes a task again, once, with the exact problems, when the checker still finds something", async () => {
    const seen: { label: string; system: string; user: string }[] = [];
    const bad = `<x-map tile="32"><x-legend>\n# wall\n@ player\n</x-legend>\n####\n#@.#\n###</x-map>`;
    const good = `<x-map tile="32"><x-legend>\n# wall\n@ player\n</x-legend>\n####\n#@.#\n####</x-map>`;
    await run(fake({ ...ALL, "Level 1: the ground": (n) => (n === 1 ? bad : good), "Correcting": good }, seen));
    const fix = seen.find((s) => s.label.startsWith("Correcting"));
    expect(fix).toBeTruthy();
    expect(fix!.user).toMatch(/Problems:\n- /);
  });

  it("declares a number a section used and the outline forgot", async () => {
    const { result } = await run(fake({ ...ALL, "HUD:": `<x-value of="coins"></x-value>` }));
    expect(result.html).toMatch(/<x-state [^>]*coins="0"/);
  });
});

describe("planning without a model", () => {
  it("reads an outline written any which way", () => {
    const o = parseOutline("**Section 1:** Title | menu | start\n- SECTION: Cave | map, inventory, battle | the cave; an enemy\nART: bat | 20x20 | a bat\nSTATE: hp = 10, gold=0");
    expect(o.sections.map((s) => s.title)).toEqual(["Title", "Cave"]);
    expect(o.sections[1].blocks).toEqual(["map", "battle"]);
    expect(o.state).toEqual({ hp: 10, gold: 0 });
    expect(o.art[0]).toMatchObject({ name: "bat", w: 20, h: 20 });
  });
  it("has an outline for every kind of game", () => {
    expect(defaultOutline("x", ["platformer"]).sections.some((s) => s.blocks.includes("platformer"))).toBe(true);
    expect(defaultOutline("x", ["map", "battle"]).sections.some((s) => s.blocks.includes("battle"))).toBe(true);
    expect(defaultOutline("x", []).sections.length).toBeGreaterThan(2);
  });
  it("chooses the blocks from the words", () => {
    expect(blocksFor("a platformer like mario")).toEqual(expect.arrayContaining(["platformer", "timer"]));
    expect(blocksFor("a pokemon style rpg")).toEqual(expect.arrayContaining(["map", "dialog", "battle"]));
    expect(blocksFor("a recipe")).toEqual([]);
  });
  it("gives a block's page only when asked, and fits it in the room", () => {
    expect(docFor(["map"], 9000)).toContain("<x-map");
    expect(docFor([], 9000)).not.toContain("<x-map");
    expect(docFor(["map", "battle", "dialog"], 700).length).toBeLessThanOrEqual(700);
  });
  it("lists tasks, replaces wrong names with the right ones", () => {
    expect(parseTasks("Here:\n- a button\n2. a panel\nnot a task")).toEqual(["a button", "a panel"]);
    expect(nearestName("Level 1", ["title", "level_1"])).toBe("level_1");
    expect(nearestName("zzz", ["title", "level_1"])).toBeNull();
    expect(mendNames('<p data-click="go:Level1"></p><x-value of="Gold"></x-value>', ["level_1"], ["gold"]).html).toBe('<p data-click="go:level_1"></p><x-value of="gold"></x-value>');
  });
  it("strips what a fragment must not carry", () => {
    const m = mendFragment("```html\n<html><body><x-scene id=\"a\"><p>hi</p></x-scene><script>x()</script><style>p{color:red}</style></body></html>\n```", { scenes: [], states: [] });
    expect(m.body).toBe("<p>hi</p>");
    expect(m.css).toBe("p{color:red}");
  });
  it("keeps only a safe drawing", () => {
    expect(cleanSvg("<svg><rect width='4' height='4' onclick='x()'/><script>1</script></svg>", 8, 8)).toBe('<svg viewBox="0 0 8 8"><rect width=\'4\' height=\'4\'/></svg>');
    expect(cleanSvg("no drawing here", 8, 8)).toBeNull();
    expect(plainArt({ name: "Bird", w: 20, h: 10, about: "" })).toContain("var(--bird");
    expect(xFlaws("<p>plain</p>")).toEqual([]);
  });
});

describe("choosing the blocks from a natural request", () => {
  it("does not take a question-mark block for a quest", () => {
    expect(blocksFor("a game like Mario with question-mark blocks, goombas, a pipe and a flag")).toEqual(expect.arrayContaining(["platformer"]));
    expect(blocksFor("a game like Mario with question-mark blocks, goombas, a pipe and a flag")).not.toContain("dialog");
    expect(blocksFor("an rpg with quests and villagers to talk to")).toContain("dialog");
  });
});
