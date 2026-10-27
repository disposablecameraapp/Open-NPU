import { describe, expect, it } from "vitest";
import { BLOCKS_EXAMPLE, blocksFlaw, layoutText, withBlocks, usesBlocks } from "../src/core/gameBlocks";
import { withEngine } from "../src/core/engineRuntime";
import { chooseGameWay, WORLD_WORDS } from "../src/core/engine";
import { quickErrors } from "../src/core/codecheck";
import { writerInstructions } from "../src/core/build";

describe("game blocks", () => {
  it("the example is a sound page", () => {
    expect(blocksFlaw(BLOCKS_EXAMPLE)).toEqual([]);
    expect(quickErrors({ title: "crypt.html", kind: "html", language: "html", content: BLOCKS_EXAMPLE })).toEqual([]);
  });
  it("adds its runtime once, wherever a page is shown, tested or saved", () => {
    const page = withEngine(BLOCKS_EXAMPLE);
    expect(page).toContain('id="blocks"');
    expect(withEngine(page)).toBe(page);
    expect(withBlocks("<p>hi</p>")).toBe("<p>hi</p>");
    expect(usesBlocks(BLOCKS_EXAMPLE)).toBe(true);
  });
  it("reads mistakes from the text of the map", () => {
    const bad = BLOCKS_EXAMPLE.replace("#@..$....#", "#..$....#").replace("# wall #334155", "");
    const flaws = blocksFlaw(bad).join("\n");
    expect(flaws).toMatch(/Row 2 .* characters wide/);
    expect(flaws).toMatch(/exactly one player/);
    expect(flaws).toMatch(/not in the legend: "#"/);
  });
  it("a page with its own script is refused", () => {
    expect(blocksFlaw(BLOCKS_EXAMPLE.replace("</body>", "<script>var a=1</script></body>")).join()).toMatch(/no <script>/);
  });
  it("a world game is written with the blocks, an arcade game with the engine", async () => {
    expect((await chooseGameWay("make a 2d rpg dungeon game with an inventory")).way).toBe("blocks");
    expect((await chooseGameWay("make a pong game")).way).toBe("engine");
    expect((await chooseGameWay("make a dungeon game from scratch with no library")).way).toBe("code");
    expect(WORLD_WORDS.test("a recipe")).toBe(false);
  });
  it("the writer is given the language", () => {
    expect(writerInstructions({ name: "g.html", job: "" }, [{ name: "g.html", job: "" }], { blocks: true })).toContain("<game-map");
  });
  it("describes a layout as text", () => {
    const t = layoutText({ viewport: { w: 900, h: 500 }, boxes: [{ name: "game-map", x: 0, y: 0, w: 600, h: 300 }, { name: "aside", x: 500, y: 100, w: 400, h: 300 }], alerts: ["overlap: game-map / aside (100x200px)"] });
    expect(t).toMatch(/A game-map/);
    expect(t).toContain("overlap: game-map / aside");
    expect(t).toContain("*");
  });
});
