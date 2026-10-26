import { describe, expect, it } from "vitest";
import { buildOffice } from "../src/core/office";
import { LEGACY_NOTE, documentText, isDocument, legacyKind, rtfText } from "../src/core/officeRead";
import { classifyFile, refusal } from "../src/core/attachments";
import { toBytes, writeZip } from "../src/core/zip";

const odf = (body: string, kind: "text" | "spreadsheet" | "presentation") => writeZip({
  mimetype: toBytes(`application/vnd.oasis.opendocument.${kind}`),
  "content.xml": toBytes(`<?xml version="1.0"?><office:document-content xmlns:office="urn:o" xmlns:text="urn:t" xmlns:table="urn:tb" xmlns:draw="urn:d" xmlns:presentation="urn:p"><office:body>${body}</office:body></office:document-content>`)
});

describe("documents the model cannot read are turned into text", () => {
  it("knows which files are documents", () => {
    expect(isDocument("a.docx") && isDocument("b.XLSX") && isDocument("c.odp") && isDocument("d.rtf") && isDocument("old.doc")).toBe(true);
    expect(isDocument("notes.txt")).toBe(false);
    expect(legacyKind("old.doc")).toBe("docx");
    expect(legacyKind("old.xls")).toBe("xlsx");
    expect(legacyKind("old.ppt")).toBe("pptx");
    expect(legacyKind("new.docx")).toBeNull();
  });

  it("attachments classify them as documents, and refuse the ones that are too big", () => {
    expect(classifyFile("plan.docx", "")).toBe("document");
    expect(classifyFile("letter.rtf", "application/rtf")).toBe("document");
    expect(classifyFile("old.xls", "application/vnd.ms-excel")).toBe("document");
    expect(refusal({ name: "big.xlsx", size: 31 * 1024 ** 2, type: "" }, false)).toMatch(/larger than/);
    expect(refusal({ name: "ok.xlsx", size: 1024, type: "" }, false)).toBeNull();
  });

  it("reads a Word, Excel and PowerPoint file made by the app", async () => {
    const docx = await documentText("r.docx", await buildOffice("docx", "# Title\n\nHello **world**."));
    expect(docx.kind).toBe("docx");
    expect(docx.text).toContain("# Title");
    const xlsx = await documentText("b.xlsx", await buildOffice("xlsx", "## S\n| a | b |\n|---|---|\n| 2 | =A2*3 |"));
    expect(xlsx.text).toContain("=A2*3 = 6");
    const pptx = await documentText("d.pptx", await buildOffice("pptx", "# Hello\n\n---\n\n# Two\n- a"));
    expect(pptx.text).toContain("# Two");
  });

  it("reads OpenDocument text, sheets and slides", async () => {
    const odt = await documentText("a.odt", await odf('<office:text><text:h text:outline-level="1">Heading</text:h><text:p>Some <text:span>text</text:span>.</text:p><text:list><text:list-item><text:p>one</text:p></text:list-item></text:list></office:text>', "text"));
    expect(odt.text).toContain("# Heading");
    expect(odt.text).toContain("Some text.");
    expect(odt.text).toContain("- one");
    const ods = await documentText("a.ods", await odf('<office:spreadsheet><table:table table:name="Data"><table:table-row><table:table-cell office:value-type="float" office:value="2"><text:p>2</text:p></table:table-cell><table:table-cell table:formula="of:=[.A1]*3" office:value-type="float" office:value="6"><text:p>6</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet>', "spreadsheet"));
    expect(ods.text).toContain("## Data");
    expect(ods.text).toContain("=A1*3");
    const odp = await documentText("a.odp", await odf('<office:presentation><draw:page><draw:frame presentation:class="title"><draw:text-box><text:p>First</text:p></draw:text-box></draw:frame><draw:frame presentation:class="outline"><draw:text-box><text:list><text:list-item><text:p>point</text:p></text:list-item></text:list></draw:text-box></draw:frame></draw:page></office:presentation>', "presentation"));
    expect(odp.text).toContain("# First");
    expect(odp.text).toContain("- point");
  });

  it("reads RTF as plain text", () => {
    const rtf = "{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Hello \\b world\\b0\\par Caf\\'e9 \\u8364? done\\par}";
    expect(rtfText(rtf)).toBe("Hello world\nCafé € done");
  });

  it("says plainly when it cannot read a file", async () => {
    await expect(documentText("old.doc", new Uint8Array([1, 2, 3]))).rejects.toThrow(LEGACY_NOTE("old.doc"));
    await expect(documentText("broken.docx", new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/broken\.docx/);
  });
});
