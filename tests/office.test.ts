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
