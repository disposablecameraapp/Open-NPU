import { Template, TemplateKind, TemplateInfo } from "./kit";
import { WORD_TEMPLATES } from "./word";
import { EXCEL_TEMPLATES } from "./excel";

export * from "./kit";
export const TEMPLATES: Template[] = [...WORD_TEMPLATES, ...EXCEL_TEMPLATES];
export const templateById = (id: string, kind?: TemplateKind): Template | undefined => TEMPLATES.find((t) => t.id === id && (!kind || t.kind === kind));
export const infoOf = (t: Template): TemplateInfo => ({ id: t.id, kind: t.kind, name: t.name, summary: t.summary, words: t.words });

/** Words that say which kind of file is wanted: a file is only made from a template when the person names Excel or Word (or the file type). */
const SHEET = /\b(excel|xlsx|spreadsheets?|tableur|feuille de calcul|classeur|hoja de c[áa]lculo|tabellenkalkulation|planilha|foglio di calcolo)\b/i;
const DOC = /\b(word|docx|document word|fichier word|word document|word file|documento de word|word-dokument|documento word)\b/i;
export const kindOfRequest = (request: string): TemplateKind | null => (SHEET.test(request) ? "xlsx" : DOC.test(request) ? "docx" : null);

/** The templates whose words match the request, best first. A template of the wanted kind comes before one of another kind. */
export function matchTemplates(request: string, kind?: TemplateKind): Template[] {
  const scored = TEMPLATES.filter((t) => !kind || t.kind === kind).map((t) => {
    // the longest words win: "lettre de motivation" is a cover letter, not just a letter
    const m = request.match(new RegExp(t.words.source, "gi")) ?? [];
    return { t, score: m.reduce((n, x) => n + x.length, 0) };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.t);
}
