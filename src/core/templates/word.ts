import { LANGS, Lang, Template, asList, asRows, asText, esc, label, schemaStr, schemaStrs } from "./kit";

/**
 * Word documents from a description: a template is a list of blocks (a title, lines, paragraphs, lists, tables, entries,
 * numbered parts) and the model only fills in the fields. The fixed words (To, Subject, Sincerely, Total...) come from the
 * language of the request. Any block with no data is left out, so a document is customised by what is given; `extra` adds
 * parts of any kind at the end, and the text form that comes out is an ordinary document the usual edit blocks can change.
 */
type Block =
  | { t: "title" }
  | { t: "sub"; k: string }
  | { t: "line"; k: string; l?: string }
  | { t: "para"; k: string; h?: string }
  | { t: "paras"; k: string; h?: string }
  | { t: "bul" | "num"; k: string; h?: string }
  | { t: "table"; k: string; h?: string; cols: [string, string][] }
  | { t: "kv"; h?: string; items: [string, string][] }
  | { t: "entries"; k: string; h?: string }
  | { t: "parts"; k: string; h?: string }
  | { t: "rule" }
  | { t: "fixed"; l: string };

const title: Block = { t: "title" };
const sub = (k: string): Block => ({ t: "sub", k });
const line = (k: string, l?: string): Block => ({ t: "line", k, l });
const para = (k: string, h?: string): Block => ({ t: "para", k, h });
const paras = (k: string, h?: string): Block => ({ t: "paras", k, h });
const bul = (k: string, h?: string): Block => ({ t: "bul", k, h });
const num = (k: string, h?: string): Block => ({ t: "num", k, h });
const table = (k: string, cols: [string, string][], h?: string): Block => ({ t: "table", k, h, cols });
const kv = (items: [string, string][], h?: string): Block => ({ t: "kv", items, h });
const entries = (k: string, h?: string): Block => ({ t: "entries", k, h });
const parts = (k: string, h?: string): Block => ({ t: "parts", k, h });
const fixed = (l: string): Block => ({ t: "fixed", l });
const rule: Block = { t: "rule" };

const PART = { type: "object", additionalProperties: false, properties: { heading: schemaStr(), text: schemaStr(), points: schemaStrs() } } as const;
const ENTRY = { type: "object", additionalProperties: false, properties: { title: schemaStr(), org: schemaStr(), period: schemaStr(), place: schemaStr(), text: schemaStr(), points: schemaStrs() } } as const;

function schemaOf(blocks: Block[], extra: Record<string, object>): object {
  const p: Record<string, object> = { language: { type: "string", enum: [...LANGS], description: "the language of the document, the one of the request" }, ...extra };
  for (const b of blocks) {
    if (b.t === "title") p.title = schemaStr("the title");
    else if (b.t === "sub" || b.t === "line" || b.t === "para") p[b.k] = schemaStr();
    else if (b.t === "paras" || b.t === "bul" || b.t === "num") p[b.k] = schemaStrs();
    else if (b.t === "table") p[b.k] = { type: "array", maxItems: 40, items: { type: "object", additionalProperties: false, properties: Object.fromEntries(b.cols.map(([, f]) => [f, schemaStr()])) } };
    else if (b.t === "kv") for (const [, f] of b.items) p[f] = schemaStr();
    else if (b.t === "entries") p[b.k] = { type: "array", maxItems: 12, items: ENTRY };
    else if (b.t === "parts") p[b.k] = { type: "array", maxItems: 16, items: PART };
  }
  p.extra = { type: "array", maxItems: 8, items: PART, description: "more parts at the end of the document, for anything the template has no place for" };
  return { type: "object", additionalProperties: false, properties: p };
}

export const parseNumber = (v: unknown): number | null => {
  const s = asText(v).replace(/[^\d,.\-]/g, "");
  if (!s) return null;
  const t = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
export const money = (n: number, cur = "") => `${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ""}`;

function render(blocks: Block[], d: Record<string, unknown>): string {
  const lang = ((LANGS as readonly string[]).includes(asText(d.language)) ? d.language : "en") as Lang;
  const out: string[] = [];
  const h = (key?: string) => (key ? out.push(`## ${label(lang, key)}`) : 0);
  for (const b of blocks) {
    switch (b.t) {
      case "title": if (asText(d.title)) out.push(`# ${asText(d.title)}`); break;
      case "sub": if (asText(d[b.k])) out.push(`*${asText(d[b.k])}*`); break;
      case "line": if (asText(d[b.k])) out.push(b.l ? `**${label(lang, b.l)}:** ${asText(d[b.k])}` : asText(d[b.k])); break;
      case "para": if (asText(d[b.k])) { h(b.h); out.push(asText(d[b.k])); } break;
      case "paras": if (asList(d[b.k]).length) { h(b.h); out.push(...asList(d[b.k])); } break;
      case "bul": case "num": { const l = asList(d[b.k]); if (l.length) { h(b.h); out.push(l.map((x, i) => (b.t === "bul" ? `- ${x}` : `${i + 1}. ${x}`)).join("\n")); } break; }
      case "table": {
        const rows = asRows(d[b.k]).filter((r) => b.cols.some(([, f]) => asText(r[f])));
        if (rows.length) { h(b.h); out.push([`| ${b.cols.map(([l]) => esc(label(lang, l))).join(" | ")} |`, `|${b.cols.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${b.cols.map(([, f]) => esc(asText(r[f]))).join(" | ")} |`)].join("\n")); }
        break;
      }
      case "kv": { const l = b.items.filter(([, f]) => asText(d[f])); if (l.length) { h(b.h); out.push(...l.map(([k, f]) => `**${label(lang, k)}:** ${asText(d[f])}`)); } break; }
      case "entries": {
        const rows = asRows(d[b.k]).filter((r) => asText(r.title) || asText(r.org));
        if (rows.length) { h(b.h); for (const r of rows) { out.push(`### ${[asText(r.title), asText(r.org)].filter(Boolean).join(" — ")}${asText(r.period) ? ` (${asText(r.period)})` : ""}${asText(r.place) ? `, ${asText(r.place)}` : ""}`); if (asText(r.text)) out.push(asText(r.text)); if (asList(r.points).length) out.push(asList(r.points).map((x) => `- ${x}`).join("\n")); } }
        break;
      }
      case "parts": {
        const rows = asRows(d[b.k]).filter((r) => asText(r.heading) || asText(r.text) || asList(r.points).length);
        if (rows.length) { h(b.h); for (const r of rows) { if (asText(r.heading)) out.push(`## ${asText(r.heading)}`); if (asText(r.text)) out.push(asText(r.text)); if (asList(r.points).length) out.push(asList(r.points).map((x) => `- ${x}`).join("\n")); } }
        break;
      }
      case "rule": out.push("---"); break;
      case "fixed": out.push(label(lang, b.l)); break;
    }
  }
  for (const r of asRows(d.extra)) { if (asText(r.heading)) out.push(`## ${asText(r.heading)}`); if (asText(r.text)) out.push(asText(r.text)); if (asList(r.points).length) out.push(asList(r.points).map((x) => `- ${x}`).join("\n")); }
  return out.join("\n\n") + "\n";
}

interface Def { id: string; name: string; summary: string; words: RegExp; blocks: Block[]; extra?: Record<string, object>; prepare?: (d: Record<string, unknown>) => Record<string, unknown> }
const make = (x: Def): Template => ({
  id: x.id, kind: "docx", name: x.name, summary: x.summary, words: x.words,
  schema: schemaOf(x.blocks, x.extra ?? {}),
  problems: (data) => (!data || typeof data !== "object" || Array.isArray(data) ? ["the answer is not a JSON object"] : x.blocks.some((b) => b.t === "title") && !asText((data as Record<string, unknown>).title) ? ["the title is missing"] : []),
  render: (data, opts) => {
    // totals computed by the template (not written by the model) wait for the first line item while the document is being written
    const raw = data as Record<string, unknown>, d = x.prepare && !(opts?.live && !asRows(raw.items).length) ? x.prepare(raw) : raw;
    return { source: render(x.blocks, d), title: asText(d.title) || x.name };
  }
});

const letter = (id: string, name: string, words: RegExp, extraBlocks: Block[] = []): Def => ({
  id, name, summary: `${name}: sender, recipient, date, subject, body, closing`, words,
  blocks: [para("sender"), para("recipient"), line("place_date"), line("subject", "subject"), title, para("salutation"), paras("body"), ...extraBlocks, para("closing"), para("signature"), bul("attachments", "attachments")]
});

const DEFS: Def[] = [
  { id: "report", name: "Report", summary: "A structured report: summary, sections, conclusion, recommendations, sources", words: /\b(report|rapport|informe|bericht|relat[óo]rio|rapporto|white ?paper|livre blanc|study|[ée]tude)\b/i,
    blocks: [title, sub("subtitle"), kv([["author", "author"], ["date", "date"]]), para("summary", "summary"), parts("sections"), para("conclusion", "conclusion"), bul("recommendations", "recommendations"), bul("sources", "sources")] },
  letter("letter", "Formal letter", /\b(letter|lettre|carta|brief|lettera|courrier|formal letter)\b/i),
  letter("cover-letter", "Cover letter", /\b(cover letter|lettre de motivation|carta de presentaci[óo]n|motivationsschreiben|carta de apresenta[çc][ãa]o|lettera di presentazione|motivation letter)\b/i),
  letter("resignation", "Resignation letter", /\b(resign\w*|d[ée]mission|renuncia|k[üu]ndigung|demiss[ãa]o|dimissioni)\b/i),
  letter("recommendation", "Recommendation letter", /\b(recommendation letter|lettre de recommandation|carta de recomendaci[óo]n|empfehlungsschreiben|reference letter)\b/i),
  letter("complaint", "Complaint letter", /\b(complaint|r[ée]clamation|plainte|queja|beschwerde|reclama[çc][ãa]o|reclamo)\b/i),
  { id: "cv", name: "CV / Résumé", summary: "A CV in the JSON Resume spirit: profile, experience, education, skills, languages, projects", words: /\b(cv|r[ée]sum[ée]|curriculum|lebenslauf|hoja de vida|curr[ií]culo)\b/i,
    blocks: [title, line("headline"), line("contact"), para("profile", "profile"), entries("experience", "experience"), entries("education", "education"), table("skills", [["skills", "group"], ["name", "items"]], "skills"), table("languages", [["languages", "language"], ["level", "level"]], "languages"), entries("projects", "projects"), bul("certificates", "certificates"), bul("interests", "interests")] },
  { id: "minutes", name: "Meeting minutes", summary: "Minutes: attendees, agenda, discussion, decisions, actions, next meeting", words: /\b(minutes|compte[- ]rendu|compte rendu|acta|protokoll|ata de reuni[ãa]o|verbale|meeting notes|cr de r[ée]union)\b/i,
    blocks: [title, kv([["date", "date"], ["place", "place"], ["time", "time"]]), bul("attendees", "attendees"), bul("absent", "absent"), bul("agenda", "agenda"), parts("discussion", "discussion"), num("decisions", "decisions"), table("actions", [["task", "task"], ["owner", "owner"], ["due", "due"]], "actions"), line("next_meeting", "nextMeeting")] },
  { id: "agenda", name: "Meeting agenda", summary: "An agenda with times, topics and owners", words: /\b(agenda|ordre du jour|orden del d[ií]a|tagesordnung|pauta|ordine del giorno)\b/i,
    blocks: [title, kv([["date", "date"], ["place", "place"], ["time", "time"]]), bul("attendees", "attendees"), table("items", [["time", "time"], ["agenda", "topic"], ["owner", "owner"]], "agenda"), para("notes", "notes")] },
  { id: "proposal", name: "Proposal", summary: "A business proposal: problem, solution, scope, timeline, pricing, terms", words: /\b(proposal|proposition commerciale|propuesta|angebot|proposta|offre|business proposal|offer)\b/i,
    blocks: [title, kv([["client", "client"], ["date", "date"], ["validity", "valid_until"]]), para("summary", "summary"), para("problem", "problem"), para("solution", "solution"), bul("scope", "scope"), table("timeline", [["phase", "phase"], ["duration", "duration"], ["deliverable", "deliverable"]], "timeline"), table("pricing", [["description", "item"], ["amount", "price"]], "pricing"), para("terms", "terms"), bul("next_steps", "nextSteps")] },
  { id: "invoice", name: "Invoice", summary: "An invoice with items and computed totals", words: /\b(invoice|facture|factura|rechnung|fatura|fattura)\b/i,
    blocks: [title, kv([["number", "number"], ["date", "date"], ["dueDate", "due_date"]]), para("from", "from"), para("to", "client"), table("items", [["description", "description"], ["qty", "qty"], ["unitPrice", "unit_price"], ["amount", "amount"]]), kv([["subtotal", "subtotal"], ["tax", "tax_amount"], ["total", "total"]]), para("payment", "payment"), para("notes", "notes")],
    extra: { currency: schemaStr("currency symbol or code"), tax_rate: schemaStr("tax rate in percent, e.g. 20") }, prepare: (d) => priced(d) },
  { id: "quote", name: "Quote / estimate", summary: "A quote with items, computed totals and validity", words: /\b(quote|devis|presupuesto|kostenvoranschlag|or[çc]amento|preventivo|estimate)\b/i,
    blocks: [title, kv([["number", "number"], ["date", "date"], ["validity", "valid_until"]]), para("from", "from"), para("to", "client"), table("items", [["description", "description"], ["qty", "qty"], ["unitPrice", "unit_price"], ["amount", "amount"]]), kv([["subtotal", "subtotal"], ["tax", "tax_amount"], ["total", "total"]]), para("terms", "terms")],
    extra: { currency: schemaStr("currency symbol or code"), tax_rate: schemaStr("tax rate in percent, e.g. 20") }, prepare: (d) => priced(d) },
  { id: "contract", name: "Simple contract", summary: "A short agreement: parties, numbered clauses, signatures", words: /\b(contract|contrat|contrato|vertrag|contratto|agreement|accord|nda|lease|bail)\b/i,
    blocks: [title, line("date", "date"), bul("parties", "parties"), parts("clauses", "clauses"), kv([["signatures", "signature_a"], ["signatures", "signature_b"]])] },
  { id: "memo", name: "Memo", summary: "An internal memo: to, from, date, subject, message, actions", words: /\b(memo|memorandum|note de service|nota interna|mitteilung|nota de servi[çc]o|promemoria)\b/i,
    blocks: [title, kv([["to", "to"], ["from", "from"], ["date", "date"], ["subject", "subject"]]), rule, paras("body"), bul("actions", "actions")] },
  { id: "press-release", name: "Press release", summary: "Headline, dateline, body, quote, about, press contact", words: /\b(press release|communiqu[ée] de presse|comunicado de prensa|pressemitteilung|comunicado de imprensa|comunicato stampa)\b/i,
    blocks: [title, sub("subhead"), line("dateline"), paras("body"), para("quote"), para("about", "about"), para("contact", "pressContact")] },
  { id: "lesson-plan", name: "Lesson plan", summary: "A lesson: objectives, materials, timed steps, assessment, homework", words: /\b(lesson plan|plan de cours|fiche de cours|s[ée]quence p[ée]dagogique|plan de lecci[óo]n|unterrichtsplanung|plano de aula|piano di lezione|scheda didattica)\b/i,
    blocks: [title, kv([["level", "level"], ["duration", "duration"]]), bul("objectives", "objectives"), bul("materials", "materials"), table("steps", [["time", "time"], ["steps", "activity"], ["notes", "notes"]], "steps"), para("assessment", "assessment"), para("homework", "homework")] },
  { id: "study-sheet", name: "Study sheet", summary: "A revision sheet: key points, key terms, questions", words: /\b(study sheet|fiche de r[ée]vision|fiche r[ée]vision|resumen de estudio|lernzettel|ficha de estudo|scheda di studio|cheat sheet|aide-m[ée]moire|revision notes)\b/i,
    blocks: [title, bul("key_points", "mainPoints"), table("terms", [["term", "term"], ["definition", "definition"]], "keyTerms"), parts("sections"), bul("questions", "questions")] },
  { id: "essay", name: "Essay / article", summary: "An essay or article: introduction, developed parts, conclusion, references", words: /\b(essay|dissertation|redaction|r[ée]daction|ensayo|aufsatz|reda[çc][ãa]o|saggio|article|blog post|billet)\b/i,
    blocks: [title, sub("subtitle"), para("introduction", "introduction"), parts("sections"), para("conclusion", "conclusion"), bul("references", "references")] },
  { id: "newsletter", name: "Newsletter", summary: "A newsletter: edition, intro, articles, upcoming events", words: /\b(newsletter|infolettre|bolet[ií]n|rundbrief|boletim|notiziario)\b/i,
    blocks: [title, line("edition", "edition"), para("introduction"), parts("articles"), bul("events", "events"), para("closing")] },
  { id: "project-brief", name: "Project brief", summary: "A project brief: goals, scope, stakeholders, milestones, risks, budget", words: /\b(project brief|brief de projet|cahier des charges|resumen del proyecto|projektbeschreibung|escopo do projeto|brief)\b/i,
    blocks: [title, para("overview", "overview"), bul("goals", "goals"), bul("in_scope", "scope"), bul("out_of_scope", "nonGoals"), table("stakeholders", [["name", "name"], ["role", "role"]], "stakeholders"), table("milestones", [["milestones", "milestone"], ["due", "date"]], "milestones"), table("risks", [["risk", "risk"], ["impact", "impact"], ["mitigation", "mitigation"]], "risks"), para("budget", "budget")] },
  { id: "spec", name: "Product spec (PRD)", summary: "A product requirements document: problem, goals, users, requirements, metrics, open questions", words: /\b(prd|product spec|specification|sp[ée]cification|especificaci[óo]n|spezifikation|especifica[çc][ãa]o|specifica|requirements document|user stories)\b/i,
    blocks: [title, para("problem", "problem"), bul("goals", "goals"), bul("non_goals", "nonGoals"), bul("users", "users"), table("requirements", [["number", "id"], ["requirements", "requirement"], ["priority", "priority"]], "requirements"), bul("user_stories", "mainPoints"), bul("metrics", "metrics"), bul("open_questions", "openQuestions")] },
  { id: "sop", name: "Procedure (SOP)", summary: "A standard procedure: purpose, scope, roles, numbered steps, revisions", words: /\b(sop|proc[ée]dure|procedimiento|verfahrensanweisung|procedimento|procedura|standard operating|mode op[ée]ratoire)\b/i,
    blocks: [title, para("purpose", "purpose"), para("scope", "scope"), table("roles", [["role", "role"], ["owner", "responsibility"]], "roles"), num("steps", "steps"), bul("checklist", "mainPoints"), table("revisions", [["date", "date"], ["author", "author"], ["notes", "change"]], "revision")] },
  { id: "post-mortem", name: "Post-mortem", summary: "An incident review: summary, timeline, causes, impact, lessons, actions", words: /\b(post[- ]?mortem|incident report|retour d'exp[ée]rience|retex|an[áa]lisis de incidente|nachbesprechung|relat[óo]rio de incidente)\b/i,
    blocks: [title, para("summary", "summary"), table("timeline", [["time", "time"], ["events", "event"]], "timeline"), bul("causes", "causes"), para("impact", "impact"), bul("lessons", "lessons"), table("actions", [["task", "task"], ["owner", "owner"], ["due", "due"]], "actions")] },
  { id: "decision-memo", name: "Decision memo", summary: "A decision paper: context, options with pros and cons, recommendation", words: /\b(decision memo|note de d[ée]cision|nota de decisi[óo]n|entscheidungsvorlage|nota de decis[ãa]o|options? paper)\b/i,
    blocks: [title, para("background", "background"), parts("options", "options"), bul("pros", "pros"), bul("cons", "cons"), para("recommendation", "recommendations"), bul("next_steps", "nextSteps")] },
  { id: "recipe", name: "Recipe", summary: "A recipe: servings, time, ingredients, steps, tips", words: /\b(recipe|recette|receta|rezept|receita|ricetta)\b/i,
    blocks: [title, kv([["servings", "servings"], ["duration", "duration"]]), bul("ingredients", "ingredients"), num("steps", "preparation"), bul("tips", "tips")] },
  { id: "itinerary", name: "Trip itinerary", summary: "A trip plan day by day, with practical notes and a budget", words: /\b(itinerary|itin[ée]raire|itinerario|reiseplan|roteiro|trip plan|voyage|travel plan|road ?trip)\b/i,
    blocks: [title, kv([["date", "dates"], ["budget", "budget"]]), parts("days", "itinerary"), bul("notes", "notes")] },
  { id: "event-program", name: "Event program", summary: "An event program: venue, timed sessions, speakers", words: /\b(event program|programme de l'[ée]v[ée]nement|programa del evento|veranstaltungsprogramm|programa do evento|programma dell'evento|conference program|schedule of the day)\b/i,
    blocks: [title, kv([["date", "date"], ["venue", "venue"]]), table("sessions", [["time", "time"], ["session", "session"], ["speaker", "speaker"]], "program"), para("notes", "notes")] },
  { id: "business-plan", name: "Business plan summary", summary: "A business plan summary: problem, solution, market, model, team, finances, risks", words: /\b(business plan|plan d'affaires|plan de n[ée]gocio|gesch[äa]ftsplan|plano de neg[óo]cio|piano aziendale|pitch deck text|executive summary)\b/i,
    blocks: [title, para("summary", "summary"), para("problem", "problem"), para("solution", "solution"), parts("sections"), table("team", [["name", "name"], ["role", "role"]], "stakeholders"), para("finances", "budget"), table("risks", [["risk", "risk"], ["mitigation", "mitigation"]], "risks")] }
];

function priced(d: Record<string, unknown>): Record<string, unknown> {
  const cur = asText(d.currency), rate = parseNumber(d.tax_rate) ?? 0;
  let sub = 0;
  const items = asRows(d.items).map((r) => {
    const q = parseNumber(r.qty) ?? 1, p = parseNumber(r.unit_price);
    const amount = p === null ? parseNumber(r.amount) : q * p;
    if (amount !== null) sub += amount;
    return { ...r, qty: asText(r.qty) || "1", unit_price: p === null ? asText(r.unit_price) : money(p), amount: amount === null ? "" : money(amount) };
  });
  const tax = (sub * rate) / 100;
  return { ...d, items, subtotal: money(sub, cur), tax_amount: rate ? `${money(tax, cur)} (${rate}%)` : "", total: money(sub + tax, cur) };
}

export const WORD_TEMPLATES: Template[] = DEFS.map(make);
