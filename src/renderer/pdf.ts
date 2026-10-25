import { extractPdfText } from "../core/pdf";

/** Reads the text of a PDF file. pdf.js is loaded only when someone adds a PDF. */
export async function readPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return extractPdfText(doc);
}
