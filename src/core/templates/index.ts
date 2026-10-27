import { Template, TemplateKind, TemplateInfo } from "./kit";
import { WORD_TEMPLATES } from "./word";
import { EXCEL_TEMPLATES } from "./excel";
import { SITE_TEMPLATES } from "./site";
import { WANTS_RAW } from "../engine";

export * from "./kit";
export const TEMPLATES: Template[] = [...WORD_TEMPLATES, ...EXCEL_TEMPLATES, ...SITE_TEMPLATES];
export const templateById = (id: string, kind?: TemplateKind): Template | undefined => TEMPLATES.find((t) => t.id === id && (!kind || t.kind === kind));
export const infoOf = (t: Template): TemplateInfo => ({ id: t.id, kind: t.kind, name: t.name, summary: t.summary, words: t.words });

/** Words that say which kind of file is wanted: a file is only made from a template when the person names Excel or Word (or the file type). */
const SHEET = /\b(excel|xlsx|spreadsheets?|tableur|feuille de calcul|classeur|hoja de c[áa]lculo|tabellenkalkulation|planilha|foglio di calcolo)\b/i;
const DOC = /\b(word|docx|document word|fichier word|word document|word file|documento de word|word-dokument|documento word)\b/i;
const SITE = /\b(landing page|web ?site|site web|site vitrine|site internet|one[- ]?page|page d'accueil|home ?page|portfolio|sitio web|p[áa]gina web|webseite|sito web|vitrine)\b/i;
const TOOL = /\b(simulat\w+|convertisseur|converter|calculateur|calculadora de|rechner f[üu]r|estimat\w+|imc|bmi|tip calculator|pourboire)\b/i;
/** A site or a tool is a page: it goes through a template unless the person asks for code by hand or for separate files. */
export const kindOfRequest = (request: string): TemplateKind | null => {
  if (SHEET.test(request)) return "xlsx";
  if (DOC.test(request)) return "docx";
  if (WANTS_RAW.test(request) || /\b(html|css|javascript)\b[^.]{0,20}\b(file|fichier)s?\b|\bseparate files?\b|\bfichiers? s[ée]par[ée]s?\b/i.test(request)) return null;
  if (TOOL.test(request) && !SITE.test(request)) return "tool";
  return SITE.test(request) ? "site" : null;
};

/** The templates whose words match the request, best first. A template of the wanted kind comes before one of another kind. */
export function matchTemplates(request: string, kind?: TemplateKind): Template[] {
  const scored = TEMPLATES.filter((t) => !kind || t.kind === kind).map((t) => {
    // the longest words win: "lettre de motivation" is a cover letter, not just a letter
    const m = request.match(new RegExp(t.words.source, "gi")) ?? [];
    return { t, score: m.reduce((n, x) => n + x.length, 0) };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.t);
}
