import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("the preview frame spares the graphics chip", () => {
  const frame = readFileSync("src/renderer/public/artifact-frame.html", "utf8");
  const view = readFileSync("src/renderer/ArtifactView.tsx", "utf8");
  it("hands the page frames at 60 a second while it is played, about 15 while it is only in view, about 2 while the window has no focus", () => {
    expect(frame).toContain("GAP = { play: 15, watch: 66, away: 500 }");
    expect(frame).toContain("window.requestAnimationFrame = function");
    expect(frame).toContain("window.cancelAnimationFrame = function");
    // writing a page drops the window's listeners: the one that carries the attention is put back after it
    expect(frame.indexOf("document.close();")).toBeLessThan(frame.indexOf('window.addEventListener("message", onAttention)'));
  });
  it("tells the frame who is looking: the pointer over the panel or the keyboard in it is play, the focus elsewhere is watch, no focus is away", () => {
    expect(view).toContain('"play" | "watch" | "away"');
    expect(view).toContain("npuAttention");
    expect(view).toContain("attended: attendedNow()");
  });
});
