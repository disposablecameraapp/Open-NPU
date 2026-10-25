import type { Attachment, ChatMessage, ContentPart } from "../shared/types";

export const MAX_ATTACHMENT_BYTES = 8 * 1024 ** 2;
export const MAX_PDF_BYTES = 40 * 1024 ** 2;
export const MAX_IMAGE_BYTES = 6 * 1024 ** 2;

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|ya?ml|toml|ini|log|xml|html?|css|svg|sql|sh|ps1|bat|py|js|mjs|cjs|jsx|ts|tsx|java|kt|c|h|cc|cpp|hpp|cs|go|rs|rb|php|swift|lua|r|tex|rtf)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

export type FileKind = "text" | "image" | "pdf" | "unsupported";

export function classifyFile(name: string, mime: string): FileKind {
  if (/\.pdf$/i.test(name) || mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image";
  if (IMAGE_EXT.test(name)) return "image";
  if (mime.startsWith("text/") || mime === "application/json" || mime === "image/svg+xml" || TEXT_EXT.test(name)) return "text";
  return "unsupported";
}

/** Plain-words reason a file cannot be attached, or null when it can. */
export function refusal(file: { name: string; size: number; type: string }, canSeeImages: boolean): string | null {
  const kind = classifyFile(file.name, file.type);
  if (kind === "unsupported") return `${file.name}: this file type is not supported. PDF, text, code, CSV, JSON and images work.`;
  if (kind === "image") {
    if (!canSeeImages) return `${file.name}: the selected model cannot see images. Choose a vision model (name with VL or Vision) in Models.`;
    if (file.size > MAX_IMAGE_BYTES) return `${file.name}: image is larger than ${MAX_IMAGE_BYTES / 1024 ** 2} MB.`;
  } else if (kind === "pdf") {
    if (file.size > MAX_PDF_BYTES) return `${file.name}: PDF is larger than ${MAX_PDF_BYTES / 1024 ** 2} MB.`;
  } else if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name}: file is larger than ${MAX_ATTACHMENT_BYTES / 1024 ** 2} MB.`;
  return null;
}

/** Split the context share for files fairly, like project knowledge: small files whole, big ones cut. */
export function fitAttachmentText(files: { name: string; text: string }[], budgetChars: number): { name: string; text: string; cut: boolean }[] {
  const order = files.map((f, i) => ({ f, i })).sort((a, b) => a.f.text.length - b.f.text.length);
  let left = budgetChars;
  const take = new Map<number, number>();
  order.forEach(({ f, i }, k) => {
    const t = Math.min(f.text.length, Math.max(Math.floor(left / (order.length - k)), 0));
    take.set(i, t);
    left -= t;
  });
  return files.map((f, i) => ({ name: f.name, text: f.text.slice(0, take.get(i) ?? 0), cut: (take.get(i) ?? 0) < f.text.length }));
}

/** The message sent to the model for one user turn: files first, then what the user typed. */
export function userContent(text: string, attachments: Attachment[], budgetChars: number): string | ContentPart[] {
  const texts = attachments.filter((a) => a.kind === "text");
  const images = attachments.filter((a) => a.kind === "image" && a.dataUrl);
  const fitted = fitAttachmentText(texts.map((a) => ({ name: a.name, text: a.text ?? "" })), budgetChars);
  const docs = fitted.map((f) => `<attachment name="${f.name.replace(/"/g, "'")}">\n${f.text}${f.cut ? "\n[…cut to fit the model's context]" : ""}\n</attachment>`).join("\n");
  const full = docs ? `${docs}\n\n${text}` : text;
  if (!images.length) return full;
  return [...images.map((a): ContentPart => ({ type: "image_url", image_url: { url: a.dataUrl! } })), { type: "text", text: full }];
}

/** Plain text of a message (for history, search and titles). */
export function textOf(m: ChatMessage["content"]): string {
  return typeof m === "string" ? m : m.map((p) => (p.type === "text" ? p.text : "")).join("");
}

/** Said when a PDF has no text layer (a scan or a photo): there is nothing to read without OCR. */
export const noPdfText = (name: string) => `${name}: this PDF has no selectable text (a scan?). Paste the text, or use a vision model with page images.`;
