/** The part of a pdf.js document we read, so the extraction can be tested without a browser. */
export interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
}

interface TextItem { str: string; hasEOL?: boolean; transform?: number[] }

/** Text of a PDF page by page, lines rebuilt from the text positions. Pages are marked so the model can say where something is. */
export async function extractPdfText(doc: PdfDocLike, maxChars = 2_000_000): Promise<string> {
  const pages: string[] = [];
  let total = 0;
  for (let n = 1; n <= doc.numPages && total < maxChars; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let text = "";
    let lastY: number | null = null;
    for (const raw of content.items) {
      const it = raw as TextItem;
      if (typeof it.str !== "string") continue;
      const y = it.transform?.[5];
      if (text && lastY !== null && y !== undefined && Math.abs(y - lastY) > 2 && !text.endsWith("\n")) text += "\n";
      text += it.str + (it.hasEOL ? "\n" : "");
      if (y !== undefined) lastY = y;
    }
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) continue;
    pages.push(`[page ${n}]\n${text}`);
    total += text.length;
  }
  return pages.join("\n\n");
}
