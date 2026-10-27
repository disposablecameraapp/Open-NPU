import { describe, expect, it } from "vitest";
import { exportFormats, needsOfficeSuite, officeSourceOf } from "../src/core/exportFormats";
import { docHtml, sheetsPrintHtml } from "../src/core/office";
import { deckPrintHtml } from "../src/core/slides";

describe("export formats", () => {
  it("offers markdown, Word, LibreOffice and PDF for a text document", () => {
    for (const kind of ["markdown", "docx"] as const) {
      const ext = exportFormats(kind)!.map((f) => f.ext);
      expect(ext).toEqual(expect.arrayContaining(["md", "docx", "odt", "pdf"]));
      expect(officeSourceOf(kind)).toBe("docx");
    }
  });
  it("offers the LibreOffice twin and PDF for a workbook and a deck", () => {
    expect(exportFormats("xlsx")!.map((f) => f.ext)).toEqual(["xlsx", "ods", "pdf"]);
    expect(exportFormats("pptx")!.map((f) => f.ext)).toEqual(["pptx", "odp", "pdf"]);
  });
  it("leaves pages and code to their own way of saving", () => {
    expect(exportFormats("html")).toBeNull();
    expect(exportFormats("code")).toBeNull();
    expect(needsOfficeSuite("odt") && !needsOfficeSuite("pdf")).toBe(true);
  });
});

describe("pages printed to PDF without an office suite", () => {
  it("draws a text document with its headings, lists and tables", () => {
    const h = docHtml("# Title\n\nSome **bold** text.\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(h).toContain("<h1>Title</h1>");
    expect(h).toContain("<b>bold</b>");
    expect(h).toContain("<ul>");
    expect(h).toContain("<th>a</th>");
  });
  it("draws the calculated sheet", () => {
    expect(sheetsPrintHtml("## S\n| a | b |\n|---|---|\n| 2 | =A2*3 |")).toContain("<td>6</td>");
  });
  it("makes one page per slide with no notes", () => {
    const h = deckPrintHtml("# One\n- a\nNotes: secret\n---\n# Two\n- b");
    expect((h.match(/<section class="slide"/g) ?? []).length).toBe(2);
    expect(h).not.toContain("secret");
  });
});
