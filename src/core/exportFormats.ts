import type { ArtifactKind } from "../shared/types";

export interface ExportFormat { ext: string; label: string }

const LIBRE = { text: "odt", sheet: "ods", deck: "odp" } as const;

/**
 * The files an artifact can be saved as. A text document (markdown or Word) is kept as markdown, Word, LibreOffice Writer or PDF;
 * a workbook as Excel, LibreOffice Calc or PDF; a presentation as PowerPoint, LibreOffice Impress or PDF. The first one is the
 * file's own format. Other kinds (pages, code) are not listed here: they keep their own way of being saved.
 */
export function exportFormats(kind: ArtifactKind): ExportFormat[] | null {
  const pdf = { ext: "pdf", label: "PDF" };
  if (kind === "markdown") return [{ ext: "md", label: "Markdown" }, { ext: "docx", label: "Word" }, { ext: LIBRE.text, label: "LibreOffice Writer" }, pdf];
  if (kind === "docx") return [{ ext: "docx", label: "Word" }, { ext: LIBRE.text, label: "LibreOffice Writer" }, pdf, { ext: "md", label: "Markdown" }];
  if (kind === "xlsx") return [{ ext: "xlsx", label: "Excel" }, { ext: LIBRE.sheet, label: "LibreOffice Calc" }, pdf];
  if (kind === "pptx") return [{ ext: "pptx", label: "PowerPoint" }, { ext: LIBRE.deck, label: "LibreOffice Impress" }, pdf];
  return null;
}

/** The Office format an artifact is built as before it is converted to another one. */
export const officeSourceOf = (kind: ArtifactKind): "docx" | "xlsx" | "pptx" | null =>
  kind === "markdown" || kind === "docx" ? "docx" : kind === "xlsx" ? "xlsx" : kind === "pptx" ? "pptx" : null;

/** Formats that only the office suite can produce. */
export const needsOfficeSuite = (ext: string): boolean => ext === "odt" || ext === "ods" || ext === "odp";
