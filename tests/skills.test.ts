import { describe, it, expect } from "vitest";
import { composeInstructions, instructionTiers, INSTRUCTION_LIMITS } from "../src/core/instructions";
import { autoSkill, categoryOf, matchSkills, skillFromMarkdown, skillProblems, skillSize, skillToMarkdown, stepPrompt, cleanTags, MAX_TAGS, type Skill } from "../src/core/skills";
import { allSkills } from "../src/core/skillsDefault";
import { collapseLibraries, inlineLibraries, libraryFromFile, libraryFromZipFile, readLibraryZip, registerLibraries } from "../src/core/skillLibs";
import { toBytes, writeZip } from "../src/core/zip";

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

describe("skills loaded by themselves", () => {
  const all = allSkills(undefined);
  it("loads the installed skill that fits the request, and nothing when it is uninstalled", () => {
    expect(autoSkill(all, "fais-moi un site web pour mon café", false)?.id).toBe("build-website");
    expect(autoSkill(all, "make a pong game", false)?.id).toBe("build-game");
    expect(autoSkill(all, "crée un tableur excel de budget", false)?.id).toBe("make-excel");
    expect(autoSkill(all, "fais une présentation PowerPoint sur le climat", false)?.id).toBe("make-presentation");
    expect(autoSkill(all, "change the title color", true)?.id).toBe("edit-files");
    expect(autoSkill(all, "change the title color", false)).toBeNull();
    expect(autoSkill(all, "what is the capital of France", false)).toBeNull();
    expect(autoSkill(allSkills(undefined, ["make-excel"]), "crée un tableur excel", false)).toBeNull();
  });
  it("every default skill that loads by itself has a valid pattern", () => {
    for (const s of all.filter((x) => x.core)) expect(() => new RegExp(s.when ?? "", "i"), s.id).not.toThrow();
    expect(all.filter((x) => x.core).every((x) => x.when)).toBe(true);
  });
});

describe("libraries that travel with a skill", () => {
  const lib = { name: "helpers", kind: "js" as const, source: "window.round2 = (x) => Math.round(x * 100) / 100;", use: "round2(x) rounds." };
  const skill: Skill = { id: "t", name: "T", description: "d", tags: ["create"], instructions: "rules", steps: [{ title: "a", prompt: "b" }], models: [], libraries: [lib, { name: "pub", kind: "css", source: "", url: "https://example.com/a.css", license: "MIT" }] };
  it("round-trips through the text form with the code in a fence", () => {
    const back = skillFromMarkdown(skillToMarkdown(skill));
    expect(typeof back).toBe("object");
    if (typeof back === "object") { expect(back.libraries).toEqual(skill.libraries); expect(back.steps).toEqual(skill.steps); }
  });
  it("refuses a bad name, a non-https address and a library with nothing in it", () => {
    expect(skillProblems({ ...skill, libraries: [{ name: "Bad Name", kind: "js", source: "x" }] }).length).toBeGreaterThan(0);
    expect(skillProblems({ ...skill, libraries: [{ name: "a", kind: "js", source: "", url: "http://x.com/a.js" }] }).length).toBeGreaterThan(0);
    expect(skillProblems({ ...skill, libraries: [{ name: "a", kind: "js", source: "" }] }).length).toBeGreaterThan(0);
    expect(skillProblems(skill)).toEqual([]);
  });
  it("puts the code of a library inside the page, once, and shows it short to the model again", () => {
    registerLibraries([skill]);
    const page = `<html><body><script src="lib:helpers"></script><script>round2(1.234)</script><script src="lib:helpers"></script><script src="lib:unknown"></script></body></html>`;
    const full = inlineLibraries(page);
    expect(full.match(/window\.round2/g)?.length).toBe(1);
    expect(full).not.toContain('src="lib:helpers"');
    expect(full).toContain('src="lib:unknown"');
    expect(collapseLibraries(full)).toContain('<script src="lib:helpers"></script>');
    expect(collapseLibraries(full)).not.toContain("Math.round");
    registerLibraries([]);
    expect(collapseLibraries(full)).toBe(full); // skill uninstalled: the code stays whole, the page still works
  });
  it("tells the model about the libraries it can use, without their code", () => {
    const p = stepPrompt(skill, 0);
    expect(p).toContain("lib:NAME");
    expect(p).toContain("round2(x) rounds.");
    expect(p).not.toContain("Math.round");
  });
});

describe("a library from a file or a zip on the PC", () => {
  it("finds the file to load in a zip and refuses ES modules", async () => {
    const z = await writeZip({
      "mylib/package.json": toBytes(JSON.stringify({ name: "@me/mylib", license: "MIT", main: "dist/mylib.cjs.js", unpkg: "dist/mylib.umd.min.js" })),
      "mylib/dist/mylib.umd.min.js": toBytes("window.mylib={hi:1};"),
      "mylib/dist/mylib.esm.js": toBytes("export const hi = 1;"),
      "mylib/dist/mylib.cjs.js": toBytes("module.exports={hi:1};"),
      "mylib/node_modules/x/index.js": toBytes("x")
    });
    const lib = await readLibraryZip(z);
    expect(lib.best).toBe("mylib/dist/mylib.umd.min.js");
    expect(lib.name).toBe("mylib");
    expect(lib.candidates.some((c) => c.path.includes("node_modules"))).toBe(false);
    expect(libraryFromZipFile(lib, lib.best!)).toMatchObject({ name: "mylib", kind: "js", license: "MIT", source: "window.mylib={hi:1};" });
    expect(typeof libraryFromZipFile(lib, "mylib/dist/mylib.esm.js")).toBe("string");
    expect(libraryFromFile("anim.min.css", "/* MIT */ a{}")).toMatchObject({ name: "anim", kind: "css", license: "MIT" });
    expect(typeof libraryFromFile("notes.txt", "x")).toBe("string");
  });
});
