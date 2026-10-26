import { describe, it, expect } from "vitest";
import { composeInstructions, instructionTiers, INSTRUCTION_LIMITS } from "../src/core/instructions";
import { categoryOf, matchSkills, skillFromMarkdown, skillProblems, skillSize, skillToMarkdown, stepPrompt, cleanTags, MAX_TAGS, type Skill } from "../src/core/skills";
import { allSkills } from "../src/core/skillsDefault";

describe("instructions in three parts", () => {
  it("gives a model as many parts as its context carries, each cut to its limit", () => {
    const p = { customInstructions: "a".repeat(900), customInstructions2: "b".repeat(50), customInstructions3: "c" };
    expect(instructionTiers(4096)).toBe(1);
    expect(instructionTiers(8192)).toBe(2);
    expect(instructionTiers(32768)).toBe(3);
    expect(composeInstructions(p, 4096)).toBe("a".repeat(INSTRUCTION_LIMITS[0]));
    expect(composeInstructions(p, 8192)).toBe("a".repeat(500) + "\n" + "b".repeat(50));
    expect(composeInstructions(p, 32768).endsWith("\nc")).toBe(true);
  });
});

describe("skills", () => {
  const all = allSkills(undefined);
  it("the default skills are all usable, small, and in a category", () => {
    expect(all.length).toBeGreaterThanOrEqual(12);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    for (const s of all) {
      expect(skillProblems(s), s.id).toEqual([]);
      expect(s.steps.length, s.id).toBeGreaterThan(1);
      expect(skillSize(s).tokens, s.id).toBeLessThan(900);
      expect(categoryOf(s), s.id).not.toBe("other");
    }
  });
  it("round-trips through the text form and reads a plain text as one step", () => {
    const s = all[0];
    const back = skillFromMarkdown(skillToMarkdown(s));
    expect(typeof back).toBe("object");
    if (typeof back === "object") { expect(back.steps).toEqual(s.steps); expect(back.tags).toEqual(s.tags); expect(back.name).toBe(s.name); }
    const plain = skillFromMarkdown("Rewrite politely\nMake the text polite.");
    expect(typeof plain === "object" && plain.steps.length).toBe(1);
    expect(typeof skillFromMarkdown("  ")).toBe("string");
  });
  it("limits the tags, finds skills by name and tag, and says which step is running", () => {
    expect(cleanTags(Array.from({ length: 15 }, (_, i) => `#Tag ${i}`)).length).toBe(MAX_TAGS);
    expect(matchSkills(all, "summ")[0].id).toBe("summarize");
    expect(matchSkills(all, "#code").length).toBeGreaterThan(0);
    const s: Skill = all[0];
    expect(stepPrompt(s, 1)).toContain(`step 2 of ${s.steps.length}`);
  });
});
