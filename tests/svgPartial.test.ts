import { describe, expect, it } from "vitest";
import { paletteOf, partialSvg } from "../src/core/svgPartial";

describe("a drawing shown while it is being written", () => {
  it("is cut at its last whole tag and the open tags are closed", () => {
    const out = partialSvg('Here: <svg viewBox="0 0 28 36"><g><path d="M2 8 L14 2" fill="red"/><circle cx="14" cy="10" r="8" fi')!;
    expect(out).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 36"><g><path d="M2 8 L14 2" fill="red"/></g></svg>');
  });
  it("takes its colours from the page and drops what could run", () => {
    const out = partialSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect fill="var(--cap)" onclick="x()" width="4" height="4"/></svg>', paletteOf(":root { --cap: #c33; }"))!;
    expect(out).toContain('fill="#c33"');
    expect(out).not.toMatch(/script|onclick/);
  });
  it("is nothing until a drawing starts", () => {
    expect(partialSvg("thinking about the hero")).toBeNull();
  });
});
