/** The part of a pdf.js document we read, so the extraction can be tested without a browser. */
export interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
  getOutline?(): Promise<OutlineItem[] | null>;
  getDestination?(name: string): Promise<unknown[] | null>;
  getPageIndex?(ref: unknown): Promise<number>;
}
interface OutlineItem { title: string; dest: string | unknown[] | null; items?: OutlineItem[] }
interface TextItem { str: string; hasEOL?: boolean; transform?: number[] }

/** Marker lines in the extracted text; the chapter splitter reads them back. */
export const PAGE_MARK = /^\[page (\d+)\]$/;
export const CHAPTER_MARK = /^\[chapter: (.+)\]$/;

const HEADING = /^(chapter|chapitre|part|partie|section|annexe|appendix|unit|unité|module|lesson|leçon)\s+([\dIVXLC]+|[A-Z])\b.{0,70}$/i;
const NUMBERED = /^\d{1,2}(\.\d{1,2})?\.?\s+\p{Lu}[^\n]{2,70}$/u;

/** Chapter titles by page from the PDF's own outline (top level; the next level when the top has a single entry). */
async function outlineTitles(doc: PdfDocLike): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  try {
    let items = (await doc.getOutline?.()) ?? [];
    if (items.length === 1 && items[0].items?.length) items = items[0].items;
    for (const it of items.slice(0, 300)) {
      let dest = it.dest;
      if (typeof dest === "string") dest = (await doc.getDestination?.(dest)) ?? null;
      const ref = Array.isArray(dest) ? dest[0] : null;
      if (ref === null || ref === undefined || (typeof ref !== "number" && !doc.getPageIndex)) continue;
      const page = (typeof ref === "number" ? ref : await doc.getPageIndex!(ref)) + 1;
      const title = it.title.replace(/\s+/g, " ").trim();
      if (title) out.set(page, [...(out.get(page) ?? []), title]);
    }
  } catch { /* no usable outline: headings are looked for in the text */ }
  return out;
}

/** Chapter headings found in a page's text, when the PDF has no outline. */
function headingsOf(lines: string[]): string[] {
  const found: string[] = [];
  lines.forEach((l, k) => {
    const t = l.trim();
    if (HEADING.test(t) || (k < 3 && NUMBERED.test(t) && !/[.;,]$/.test(t))) found.push(t);
  });
  return found;
}

/** Text of a PDF page by page, lines rebuilt from the text positions. Pages are marked `[page N]` and chapters `[chapter: Title]`, so the model can say where something is and only the needed chapters have to be sent. */
export async function extractPdfText(doc: PdfDocLike, maxChars = 2_000_000): Promise<string> {
  const outline = await outlineTitles(doc);
  const pages: { n: number; text: string }[] = [];
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
    pages.push({ n, text });
    total += text.length;
  }
  const useOutline = outline.size >= 2;
  return pages.map(({ n, text }) => {
    const titles = useOutline ? outline.get(n) ?? [] : headingsOf(text.split("\n"));
    return [`[page ${n}]`, ...titles.map((t) => `[chapter: ${t}]`), text].join("\n");
  }).join("\n\n");
}
