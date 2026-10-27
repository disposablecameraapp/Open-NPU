import { describe, expect, it } from "vitest";
import { layoutText, usesBlocks, withBlocks } from "../src/core/gameBlocks";
import { withEngine } from "../src/core/engineRuntime";
import { chooseGameWay, WORLD_WORDS } from "../src/core/engine";
import { quickErrors } from "../src/core/codecheck";
import { X_BLOCK_NAMES, X_RUNTIME } from "../src/core/xblocks.generated";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGE = `<!doctype html><html><body><x-scene id="a"><x-platformer tile="32"><x-legend>
# ground
P player
F flag
</x-legend>
..PF
####</x-platformer></x-scene><x-state lives="3"></x-state></body></html>`;

describe("pages of blocks", () => {
  it("get their runtime once, wherever a page is shown, tested or saved", () => {
    const page = withEngine(PAGE);
    expect(page).toContain('id="xblocks"');
    expect(withEngine(page)).toBe(page);
    expect(withBlocks("<p>hi</p>")).toBe("<p>hi</p>");
    expect(usesBlocks(PAGE)).toBe(true);
    expect(usesBlocks('<game-map tile="32"></game-map>')).toBe(true);
  });
  it("carry every block that exists", () => {
    expect(X_BLOCK_NAMES).toEqual(expect.arrayContaining(["core", "map", "platformer", "battle", "dialog", "timer", "calc"]));
  });
  it("use the runtime built from the block files (run `node scripts/build-xblocks.js` after changing one)", () => {
    const dir = join(__dirname, "..", "src", "core", "xblocks");
    for (const n of X_BLOCK_NAMES) expect(X_RUNTIME).toContain(readFileSync(join(dir, `${n}.js`), "utf8").trim());
  });
  it("go through the page checker", () => {
    expect(quickErrors({ title: "g.html", kind: "html", language: "html", content: PAGE })).toEqual([]);
    expect(quickErrors({ title: "g.html", kind: "html", language: "html", content: PAGE.replace("..PF", "..F") }).join()).toMatch(/player/);
  });
  it("are chosen for a platformer or a world, the arcade engine for an arcade game", async () => {
    expect((await chooseGameWay("make a platformer like the first mario")).way).toBe("blocks");
    expect((await chooseGameWay("make a 2d rpg dungeon game with an inventory")).way).toBe("blocks");
    expect((await chooseGameWay("make a pong game")).way).toBe("engine");
    expect((await chooseGameWay("make a dungeon game from scratch with no library")).way).toBe("code");
    expect(WORLD_WORDS.test("a recipe")).toBe(false);
  });
  it("describe a layout as text", () => {
    const t = layoutText({ viewport: { w: 900, h: 500 }, boxes: [{ name: "x-map", x: 0, y: 0, w: 600, h: 300 }, { name: "aside", x: 500, y: 100, w: 400, h: 300 }], alerts: ["overlap: x-map / aside (100x200px)"] });
    expect(t).toMatch(/A /);
    expect(t).toContain("overlap");
    expect(t).toContain("*");
  });
});
