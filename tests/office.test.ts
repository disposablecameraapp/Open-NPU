import { describe, expect, it } from "vitest";
import { buildOffice, readOffice, officeForModel, officePreview, slidesOf } from "../src/core/office";
import { Workbook, parseSheets } from "../src/core/sheet";

const DOC = `# Report\n\nSome **bold** and *italic* text.\n\n- one\n- two\n  - nested\n\n1. first\n2. second\n\n| Name | Qty |\n|---|---|\n| Pen | 3 |\n\n---\n\n## Next page\n\nEnd.`;
const SHEET = `## Budget\n| Item | Qty | Price | Total |\n|---|---|---|---|\n| Pens | 10 | 1.5 | =B2*C2 |\n| Ink | 2 | 7 | =B3*C3 |\n| Sum | | | =SUM(D2:D3) |\n\n## Stats\n| Avg |\n|---|\n| =AVERAGE(Budget!D2:D3) |`;
const DECK = `# Open NPU\nLocal AI on a Snapdragon\n\n---\n\n# Why\n- Fast\n  - really\n- Private\nNotes: say hello\n\n---\n\n# Numbers\n| A | B |\n|---|---|\n| 1 | 2 |`;

describe("formulas", () => {
  it("calculates", () => {
    const wb = new Workbook(parseSheets(SHEET));
    expect(wb.cell("Budget", 1, 3)).toBe(15);
    expect(wb.cell("Budget", 3, 3)).toBe(29);
    expect(wb.cell("Stats", 1, 0)).toBe(14.5);
    expect(wb.formula('IF(1>2,"a","b")&"!"', "Budget")).toBe("b!");
    expect(String(wb.formula("1/0", "Budget"))).toBe("#DIV/0!");
  });
});

describe("office round trip", () => {
  it("docx", async () => {
    const back = await readOffice("docx", await buildOffice("docx", DOC));
    expect(back).toContain("# Report");
    expect(back).toContain("**bold**");
    expect(back).toContain("- two");
    expect(back).toContain("1. second");
    expect(back).toContain("| Pen | 3 |");
    expect(back).toContain("---");
  });
  it("xlsx", async () => {
    const back = await readOffice("xlsx", await buildOffice("xlsx", SHEET));
    expect(back).toContain("=B2*C2");
    expect(back).toContain("=AVERAGE(Budget!D2:D3)");
    expect(officeForModel("xlsx", back)).toContain("D4 =SUM(D2:D3) = 29".replace("D4", "D4"));
  });
  it("pptx", async () => {
    const back = await readOffice("pptx", await buildOffice("pptx", DECK));
    expect(slidesOf(back)).toHaveLength(3);
    expect(back).toContain("# Why");
    expect(back).toContain("Notes: say hello");
    expect(back).toContain("| 1 | 2 |");
    expect(officePreview("pptx", DECK)).toContain("slide");
  });
});

describe("drawn blocks inside Office files", () => {
  const png = { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), mime: "image/png", w: 800, h: 400, credit: "" };
  it("a Word file holds the app's blocks as tables, lists and pictures", async () => {
    const { figureKey } = await import("../src/core/figures");
    const diagram = "flowchart TD\nA --> B";
    const src = `# Study\n\n\`\`\`kpi\nFinal | 16 289 € | after 10 years\n\`\`\`\n\n\`\`\`quiz\nQ: Capital of France?\n- Lyon\n+ Paris\n> It is.\n\`\`\`\n\n\`\`\`checklist\n[x] done\n[ ] todo\n\`\`\`\n\n\`\`\`sheet\nItem | Price | Qty | Total\nTea | 2,5 | 2 | =B2*C2\n\`\`\`\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n\n\`\`\`python\nprint(1)\n\`\`\``;
    const bytes = await buildOffice("docx", src, { [figureKey("mermaid", diagram)]: png });
    const { readZip, fromBytes } = await import("../src/core/zip");
    const files = await readZip(bytes);
    expect(Object.keys(files).some((f) => f.startsWith("word/media/"))).toBe(true);
    const back = await readOffice("docx", bytes);
    expect(back).toContain("| Final | 16 289 € | after 10 years |");
    expect(back).toContain("Paris ✓");
    expect(back).toContain("☑ done");
    expect(back).toContain("| Tea | 2,5 | 2 | 5 |");
    expect(back).toContain("print(1)");
    expect(fromBytes(files["word/document.xml"])).toContain("<w:drawing>");
    // without the picture the figure is said to be missing, never silently dropped
    expect(await readOffice("docx", await buildOffice("docx", src))).toContain("diagram not drawn");
  });

  it("a sheet block becomes a workbook, with European numbers and AVG", async () => {
    const back = await readOffice("xlsx", await buildOffice("xlsx", "```sheet\nItem | Price | Qty | Total\nTea | 2,5 | 2 | =B2*C2\nCoffee | 3 | 1 | =B3*C3\nMean | | | =AVG(D2:D3)\n```"));
    expect(back).toContain("| Tea | 2.5 | 2 | =B2*C2 |");
    expect(officeForModel("xlsx", back)).toContain("D4 =AVERAGE(D2:D3) = 4");
  });

  it("a slide can hold a diagram drawn by the window, shown whole", async () => {
    const { figureKey } = await import("../src/core/figures");
    const { layoutAll } = await import("../src/core/slides");
    const code = "sequenceDiagram\nA->>B: hi";
    const src = `# Calls\n- one\n\`\`\`mermaid\n${code}\n\`\`\``;
    const pics = { [figureKey("mermaid", code)]: png };
    const slide = slidesOf(src)[0];
    expect(slide.figure?.raw).toBe(code);
    const { laid } = layoutAll(src, pics);
    const img = laid[0].above.find((p) => p.k === "image");
    expect(img && img.k === "image" && img.contain).toBe(true);
    if (img && img.k === "image") expect(Math.abs(img.w / img.h - 2)).toBeLessThan(0.01);
    const bytes = await buildOffice("pptx", src, pics);
    const { readZip } = await import("../src/core/zip");
    expect(Object.keys(await readZip(bytes)).some((f) => f.startsWith("ppt/media/"))).toBe(true);
    // not drawn yet: the slide is made without it
    expect(layoutAll(src).laid[0].above.some((p) => p.k === "image")).toBe(false);
  });
});
