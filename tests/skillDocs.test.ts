import { describe, it, expect } from "vitest";
import { SKILL_DOCS } from "../src/core/skillDocs";

describe("the skills guide", () => {
  it("is complete and its text-form example is a real skill", async () => {
    for (const h of ["## 1. Using skills", "## 4. How to write a good skill", "## 5. Loading by itself", "## 6. Libraries", "## 7. The text form", "## 10. Troubleshooting"]) expect(SKILL_DOCS, h).toContain(h);
    expect(SKILL_DOCS).not.toContain("{{");
    expect(SKILL_DOCS).not.toContain("${");
    const { skillFromMarkdown } = await import("../src/core/skills");
    const m = SKILL_DOCS.match(/````\n(---\nname: Charts with Chart\.js[\s\S]*?)\n````/);
    expect(m).not.toBeNull();
    const s = skillFromMarkdown(m![1]);
    expect(typeof s).toBe("object");
    if (typeof s === "object") { expect(s.libraries?.map((l) => l.name)).toEqual(["chartjs", "helpers"]); expect(s.when).toContain("chart"); expect(s.steps.length).toBe(3); }
  });
});
