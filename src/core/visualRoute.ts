import { CHART_INSTRUCTIONS, CHART_CALC_INSTRUCTIONS } from "./chart";
import { DIAGRAM_INSTRUCTIONS } from "./diagram";
import { BLOCK_INSTRUCTIONS } from "./blocks";

/**
 * Which kind of picture a request asks for, decided by the words, with no model call. The point is to keep the assistant from writing a web
 * page for something the app draws better and in a second: a page of HTML takes minutes of the NPU and battery, and a small model's page looks
 * poor; a chart block is a few lines the app draws, with sliders, number fields and typeset formulas.
 *
 *  - "chart"      numbers on axes: a curve, bars, a pie, a scatter plot, a radar
 *  - "calculator" a chart with inputs the person types and results it works out (compound interest, a loan, a BMI...)
 *  - "diagram"    structure or steps: a flow, a sequence, an organisation chart, a mind map, a timeline, a Gantt plan, states, classes, tables
 *  - "quiz"       multiple-choice questions (QCM), flashcards: marked by the app, with a score
 *  - "sheet"      a spreadsheet that recalculates when a cell is edited
 *  - "checklist"  a list to tick
 *
 * It never forces: a request for a document (a report, a course, a sheet to read, a guide) is a document, whatever figures it holds, and the
 * figures are blocks inside it. Only a request that is just the picture gets the picture alone.
 */
export type VisualKind = "chart" | "calculator" | "diagram" | "quiz" | "sheet" | "checklist";
export interface VisualRoute { kind: VisualKind; why: string }

/** What only a program can do: the request is for a page, a game or code, not for a picture. */
const PAGE_WORDS = /\b(html|css|javascript|js|typescript|react|python|three\.?js|webgl|canvas|svg|page web|web ?page|web ?site|site web|landing|portfolio|game|jeu|snake|tetris|pong|2048|pacman|platformer|application|app|extension|bookmarklet|script|programme?|animation en temps r[ée]el|real-?time animation|3d)\b/i;
/** Structure or steps rather than numbers. */
const STRUCTURE = /\b(flow ?charts?|workflow|organigramme|org(?:anisation)? chart|mind ?maps?|carte (?:mentale|heuristique)|timeline|chronologie|frise|gantt|roadmap|uml|merise|sequence diagram|class diagram|state (?:diagram|machine)|er diagram|entity[- ]relationship|git ?graph|user journey|parcours (?:utilisateur|client)|architecture|pipeline|lifecycle|cycle|process(?:us)?|[ée]tapes|hi[ée]rarchie|arbre (?:de d[ée]cision|g[ée]n[ée]alogique)|diagrammes? (?:de|d['’]) ?(?:flux|s[ée]quences?|classes?|[ée]tats?|gantt|architecture|processus|cas|activit[ée]s?|entit[ée]s?)|sch[ée]mas? (?:de|d['’]|du|des) ?(?:processus|fonctionnement|architecture|base|flux|d[ée]cision|r[ée]seau|d[ée]roulement))\b/i;
/** Words that make a picture a chart. "diagram" alone is both, so it is looked at with the numbers around it. */
const CHART_WORDS = /\b(graph(?:e|es|s|ique|iques)?|charts?|plots?|courbes?|histogram\w*|camemberts?|pie|donut|radar|scatter|nuages? de points|barres?|bar chart|visuali[sz]\w*|[ée]volution|r[ée]partition)\b/i;
const DIAGRAM_WORD = /\b(diagrams?|diagrammes?|sch[ée]mas?)\b/i;
/** Numbers, rates, amounts, functions: what a chart is made of. */
const NUMBERS = /\d|\btaux\b|\brates?\b|\bint[ée]r[eê]ts?\b|\binterest\b|\bmontants?\b|\bamounts?\b|\bsomme\b|\bdur[ée]es?\b|\bprix\b|\bprices?\b|%|pourcent|percent|\bbudget\b|\bco[uû]ts?\b|\bvaleurs?\b|\bvalues?\b|\bcurseurs?\b|\bsliders?\b|\bfonctions?\b|\bfunctions?\b|\bsin\b|\bcos\b|\bexp\b|\bcroissance\b|\bgrowth\b|\bstat\w*|\bdonn[ée]es\b|\bdata\b|\bventes?\b|\bsales\b|\brevenus?\b|\bcourbe\b|\bcompar\w+|\b[ée]volution\b|\bpr[êe]t\b|\bloan\b|\bcapital\b|\b[ée]pargne\b|\bsavings?\b|\bpopulation\b|\btemp[ée]rature\b/i;
/** A tool for a domain with inputs and results (not the keypad calculator, which is a program). */
const CALCULATOR = /\b(calculat(?:eur|or)s?|simulat(?:eur|or)s?|convertisseurs?|converters?)\s+(?:de|d['’]|du|des|of|for|to)\b/i;
const TYPED_INPUTS = /\b(o[uù] je peux|que je puisse|pour que je puisse|where i can|so (?:that )?i can|je veux (?:pouvoir )?(?:choisir|entrer|rentrer|saisir|modifier|r[ée]gler)|i want to (?:choose|enter|type|set|change))\b[^.\n]{0,80}\b(taux|rate|montant|amount|nombre|number|valeur|value|dur[ée]e|duration|prix|price|param\w*|curseur|slider)\b/i;
/** The person wants a document, which holds whatever pictures it needs: a markdown artifact, not a lone block. */
const DOCUMENT = /\b(documents?|doc|rapports?|reports?|fiches?|(?:un|le|mon|ce|ton|ma) cours|guides?|dossiers?|essais?|essays?|articles?|pr[ée]sentations?|slides?|m[ée]mos?|synth[èe]ses?|comptes?[- ]rendus?|tutoriels?|tutorials?|manuels?|r[ée]sum[ée]s?|summary|r[ée]dige|r[ée]diger|proposal|wiki|ebook|livre|book|cahier|support de cours|[ée]tude)\b/i;
const JUST_PICTURE = /\b(juste|seulement|uniquement|only|just)\b/i;
const QUIZ = /\b(qcms?|mcq|quizz?|questionnaires?|multiple[- ]choice|choix multiples?|teste[- ]moi|interroge[- ]moi|quiz me|test my knowledge|flash ?cards?|cartes? (?:de )?(?:r[ée]vision|m[ée]moire))\b/i;
const SHEET = /\b(tableur|spreadsheet|feuille de calcul|tableau de calcul|calcul automatique|budget (?:mensuel|annuel|pr[ée]visionnel)|facture|invoice)\b/i;
const CHECKLIST = /\b(check ?lists?|liste (?:[àa] cocher|de contr[ôo]le|de v[ée]rification)|packing list|liste de courses|shopping list)\b/i;
const FORMULA_WORDS = /\b(formule|formula|[ée]quation|equation)\b/i;

/**
 * The picture this request is for, or null when it is not for a picture (a question, a program, a document) or when the chat already has files,
 * where a request is a change to them and the build steps decide. The reason is a short sentence for the log.
 */
export function routeVisual(request: string, opts: { hasFiles?: boolean } = {}): VisualRoute | null {
  const r = request.trim();
  if (!r || opts.hasFiles) return null;
  if (PAGE_WORDS.test(r) && !/\bpas (?:de )?(?:html|code|page)\b|\bwithout (?:html|code)\b|\bsans (?:html|code)\b/i.test(r)) return null;
  if (DOCUMENT.test(r) && !JUST_PICTURE.test(r)) return null;
  if (QUIZ.test(r)) return { kind: "quiz", why: "questions with answers to pick: a quiz block, marked by the app" };
  if (SHEET.test(r) && !/\b(xlsx?|csv|fichier excel|excel file)\b/i.test(r)) return { kind: "sheet", why: "a table with formulas: a sheet block that recalculates" };
  if (CHECKLIST.test(r)) return { kind: "checklist", why: "a list to tick: a checklist block" };
  const structure = STRUCTURE.test(r), chartWord = CHART_WORDS.test(r), diagramWord = DIAGRAM_WORD.test(r), numbers = NUMBERS.test(r);
  const calc = CALCULATOR.test(r) || (TYPED_INPUTS.test(r) && (chartWord || diagramWord || FORMULA_WORDS.test(r)));
  if (calc && !(structure && !numbers)) return { kind: "calculator", why: "a tool with inputs and results: drawn from a chart block, not coded as a page" };
  if (structure && !(chartWord && numbers && !DIAGRAM_WORD.test(r))) return { kind: "diagram", why: "structure or steps: drawn from a Mermaid block" };
  if (chartWord) return { kind: numbers && TYPED_INPUTS.test(r) ? "calculator" : "chart", why: "numbers on axes: drawn from a chart block" };
  if (diagramWord) return numbers ? { kind: "chart", why: "a diagram of numbers: drawn from a chart block" } : { kind: "diagram", why: "a diagram with no numbers: drawn from a Mermaid block" };
  return null;
}

const DOC_FIRST = "If the person actually wants a document (a report, a course, a guide), write that document as a markdown artifact and put the blocks inside it instead.";
const NO_PAGE = "Do not write an artifact, an HTML page, an SVG or code for it: the app draws the block, with its own look.";

/** What the model is told when a request is for a picture: only the rules for that kind, and not to write a page. */
export function visualRules(route: VisualRoute): string {
  const only = (what: string, block: string) => `This request is for ${what}. Answer with one short sentence and one ${block} block. ${NO_PAGE} ${DOC_FIRST}\n\n${BLOCK_INSTRUCTIONS}`;
  if (route.kind === "quiz") return only("a multiple-choice quiz", "quiz (or cards for flashcards)");
  if (route.kind === "sheet") return only("a spreadsheet", "sheet");
  if (route.kind === "checklist") return only("a checklist", "checklist");
  if (route.kind === "diagram") return `This request is for a diagram of structure. Answer with one short sentence and one mermaid block. ${NO_PAGE} ${DOC_FIRST}\n\n${DIAGRAM_INSTRUCTIONS}`;
  if (route.kind === "calculator") return `This request is for a calculator with inputs and results. Answer with one short sentence and ONE chart block that has params (the numbers the person types or slides), formulas (the base formula, then the same formula with the person's values) and outputs (the results). ${NO_PAGE} ${DOC_FIRST}\n\n${CHART_CALC_INSTRUCTIONS}`;
  return `This request is for a chart. Answer with one short sentence and one chart block. ${NO_PAGE} ${DOC_FIRST}\n\n${CHART_INSTRUCTIONS}\n\n${DIAGRAM_INSTRUCTIONS.split("\n")[0]}`;
}

/** The short version for any other request: both kinds exist, and so does the rule to prefer them to a page. */
export const VISUAL_OVERVIEW = [
  CHART_INSTRUCTIONS,
  DIAGRAM_INSTRUCTIONS
].join("\n\n");
