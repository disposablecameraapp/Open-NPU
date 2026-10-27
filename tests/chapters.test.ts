import { describe, expect, it } from "vitest";
import { newChapters } from "../src/core/chapters";

describe("chapters of a page being written", () => {
  const page = [
    "<!DOCTYPE html><html><head><style>body{margin:0}</style></head>",
    "<body><canvas id=c></canvas><script>",
    "const GRAVITY = 0.5;",
    "let player = { x: 10, y: 10 };",
    "const enemies = [];",
    "document.addEventListener('keydown', e => {});",
    "function update() { player.y += 1; }",
    "function draw() { ctx.fillRect(0,0,1,1); }",
    "function loop() { update(); draw(); requestAnimationFrame(loop); }",
    "</script></body></html>"
  ].join("\n");

  it("names each part once, in the order it appears in the text", () => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (let n = 60; n <= page.length + 20; n += 20) {
      for (const c of newChapters(page.slice(0, n), seen)) { seen.add(c.id); ids.push(c.id); }
    }
    expect(ids).toEqual(["frame", "screen", "settings", "player", "others", "controls", "moves", "draw", "loop", "close"]);
  });

  it("says nothing about a text that has not started", () => {
    expect(newChapters("<html>", new Set())).toEqual([]);
  });
});

describe("named things", () => {
  it("makes a chapter of each class the page defines, saying what it is", () => {
    const text = "<html><body><script>\nclass Goomba { update() {} }\nfunction spawnCoin() {}\nclass Game {}\n";
    expect(newChapters(text, new Set()).map((c) => c.label).filter((l) => l.startsWith("Creating"))).toEqual(["Creating goomba", "Creating coin"]);
  });
});
