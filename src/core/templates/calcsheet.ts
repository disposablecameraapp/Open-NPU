import type { ChatEvent, ChatMessage, ChatStats } from "../../shared/types";
import type { BuildRun, BuildStage, BuildStep } from "../../shared/types";
import type { Session } from "../build";
import { withAnswer } from "../chat";
import { firstJson } from "../look";
import { Workbook, parseSheets, plainLabel } from "../sheet";
import { langOf, type Lang } from "./kit";

/**
 * A sheet that works out the figures of a statement (an accounting exercise, a cost, a valuation). The model never calculates and never writes a cell address:
 * it reads the figures (label, value, unit), plans the calculations in words, then turns each into one of seven operations on labels, every answer held to a
 * closed JSON schema (the operation is one of the seven, an argument is one of the labels that exist). The app checks the plan by running it, puts it right
 * where code can (the order of the calculations, the spelling of a label), asks again once with the exact faults, and writes the sheet with real formulas that
 * name rows by their label (`=[Coût de production]/[Jouets produits]`), so the person can change a figure and everything recalculates.
 * Measured on a 4B model: reading the figures 94 to 98 %, turning calculations in words into operations 100 %, planning them from nothing 17 to 72 %.
 */
export const OPS = ["sum", "sub", "mul", "div", "min", "max", "avg"] as const;
export type Op = (typeof OPS)[number];
export interface CalcInput { label: string; value: number; unit: string }
export interface CalcStep { label: string; op: Op; args: string[] }
export interface CalcAnswer { question: string; step: string }
export interface CalcPlan { inputs: CalcInput[]; steps: CalcStep[]; answers: CalcAnswer[] }
export interface CalcWord { label: string; how: string }
export type CalcResult = { handled: true; text: string; stats: ChatStats } | { handled: false };

export interface CalcOptions {
  id: string;
  stream: Session;
  signal?: AbortSignal;
  modelOf?: () => string | undefined;
}

// ---------------------------------------------------------------- reading what the model wrote

/** A label the sheet can use: no bracket, bar or @ (they mean something in a formula or a table), one line. */
export const cleanLabel = (s: unknown): string => String(s ?? "").replace(/[[\]|@\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

const numberOf = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/[\s  €$£]/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

/** A label that is not used yet: the same one with a number when it is. */
function unique(label: string, taken: Set<string>): string {
  let l = label || "Valeur", n = 2;
  while (taken.has(plainLabel(l))) l = `${label || "Valeur"} (${n++})`;
  taken.add(plainLabel(l));
  return l;
}

/** The figures of the statement as the model gave them, cleaned: a figure with no number is dropped, a repeated label is numbered. */
export function readInputs(raw: unknown): CalcInput[] {
  const list = (raw as { inputs?: unknown })?.inputs;
  if (!Array.isArray(list)) return [];
  const taken = new Set<string>();
  const out: CalcInput[] = [];
  for (const x of list) {
    const o = x as { label?: unknown; value?: unknown; unit?: unknown };
    const v = numberOf(o?.value);
    if (v === null) continue;
    out.push({ label: unique(cleanLabel(o.label), taken), value: v, unit: cleanLabel(o.unit) });
  }
  return out;
}

export function readWords(raw: unknown, inputs: CalcInput[]): { words: CalcWord[]; answers: CalcAnswer[]; problems: string[] } {
  const r = raw as { steps?: unknown; answers?: unknown } | null;
  const taken = new Set(inputs.map((i) => plainLabel(i.label)));
  const words: CalcWord[] = [];
  const problems: string[] = [];
  for (const x of Array.isArray(r?.steps) ? r!.steps : []) {
    const o = x as { label?: unknown; how?: unknown };
    const label = cleanLabel(o?.label);
    if (!label) continue;
    if (taken.has(plainLabel(label))) { problems.push(`the label "${label}" is used twice or is the label of a figure: every calculation needs a label of its own`); continue; }
    taken.add(plainLabel(label));
    words.push({ label, how: String(o?.how ?? "").replace(/\s+/g, " ").trim().slice(0, 300) });
  }
  if (!words.length) problems.push("no calculation was listed");
  const known = new Map(words.map((w) => [plainLabel(w.label), w.label]));
  const answers: CalcAnswer[] = [];
  for (const x of Array.isArray(r?.answers) ? r!.answers : []) {
    const o = x as { question?: unknown; step?: unknown };
    const step = known.get(plainLabel(cleanLabel(o?.step)));
    if (!step) { problems.push(`the answer "${cleanLabel(o?.question)}" points at "${cleanLabel(o?.step)}", which is not one of your calculations`); continue; }
    answers.push({ question: cleanLabel(o?.question) || step, step });
  }
  if (!answers.length && words.length) answers.push({ question: words[words.length - 1].label, step: words[words.length - 1].label });
  return { words, answers, problems };
}

/** The operations, read against the labels that exist; the calculations are put in the order they can be made (a cycle is a fault). */
export function readSteps(raw: unknown, inputs: CalcInput[], planned: string[]): { steps: CalcStep[]; problems: string[] } {
  const list = Array.isArray((raw as { steps?: unknown })?.steps) ? ((raw as { steps: unknown[] }).steps) : [];
  const names = new Map<string, string>([...inputs.map((i) => i.label), ...planned].map((l) => [plainLabel(l), l]));
  const problems: string[] = [];
  const byLabel = new Map<string, CalcStep>();
  for (const x of list) {
    const o = x as { label?: unknown; op?: unknown; args?: unknown };
    const label = names.get(plainLabel(cleanLabel(o?.label)));
    const op = String(o?.op ?? "") as Op;
    if (!label || !planned.includes(label)) { problems.push(`"${cleanLabel(o?.label)}" is not one of the calculations to write`); continue; }
    if (!OPS.includes(op)) { problems.push(`"${label}": the operation "${String(o?.op)}" is not one of ${OPS.join(", ")}`); continue; }
    const args: string[] = [];
    for (const a of Array.isArray(o?.args) ? o.args : []) {
      const k = names.get(plainLabel(cleanLabel(a)));
      if (!k) problems.push(`"${label}": the argument "${cleanLabel(a)}" is not the label of a figure or of a calculation`);
      else args.push(k);
    }
    if (!args.length) problems.push(`"${label}" has no argument`);
    if ((op === "sub" || op === "div") && args.length !== 2) problems.push(`"${label}": ${op} takes exactly two arguments (the first ${op === "sub" ? "minus" : "divided by"} the second), not ${args.length}`);
    if (!byLabel.has(label)) byLabel.set(label, { label, op, args });
  }
  for (const p of planned) if (!byLabel.has(p)) problems.push(`the calculation "${p}" has no operation`);
  // dependency order, the planned order kept where it already works
  const done = new Set(inputs.map((i) => i.label));
  const steps: CalcStep[] = [];
  let left = planned.filter((p) => byLabel.has(p));
  while (left.length) {
    const ready = left.find((p) => byLabel.get(p)!.args.every((a) => done.has(a)));
    if (!ready) { problems.push(`the calculations ${left.map((l) => `"${l}"`).join(", ")} use each other in a circle`); break; }
    steps.push(byLabel.get(ready)!);
    done.add(ready);
    left = left.filter((p) => p !== ready);
  }
  return { steps, problems };
}

// ---------------------------------------------------------------- running the plan

/** The value of every figure and calculation, and what stops the plan from working (a division by zero, a result that is not a number). */
export function evalPlan(plan: CalcPlan): { values: Map<string, number>; problems: string[] } {
  const values = new Map<string, number>(plan.inputs.map((i) => [i.label, i.value]));
  const problems: string[] = [];
  for (const s of plan.steps) {
    const a = s.args.map((x) => values.get(x) ?? NaN);
    let r: number;
    switch (s.op) {
      case "sum": r = a.reduce((x, y) => x + y, 0); break;
      case "sub": r = a[0] - a[1]; break;
      case "mul": r = a.reduce((x, y) => x * y, 1); break;
      case "div": r = a[1] === 0 ? NaN : a[0] / a[1]; if (a[1] === 0) problems.push(`"${s.label}" divides by zero ("${s.args[1]}" is 0)`); break;
      case "min": r = Math.min(...a); break;
      case "max": r = Math.max(...a); break;
      default: r = a.reduce((x, y) => x + y, 0) / a.length;
    }
    if (!Number.isFinite(r)) { if (!problems.some((p) => p.startsWith(`"${s.label}"`))) problems.push(`"${s.label}" does not give a number`); r = 0; }
    values.set(s.label, r);
  }
  return { values, problems };
}

// ---------------------------------------------------------------- the sheet

const WORDS: Record<Lang, { item: string; value: string; unit: string; answers: string; title: string }> = {
  fr: { item: "Élément", value: "Valeur", unit: "Unité", answers: "Réponses", title: "Calculs" },
  en: { item: "Item", value: "Value", unit: "Unit", answers: "Answers", title: "Calculations" },
  es: { item: "Elemento", value: "Valor", unit: "Unidad", answers: "Respuestas", title: "Cálculos" },
  de: { item: "Posten", value: "Wert", unit: "Einheit", answers: "Antworten", title: "Berechnungen" },
  pt: { item: "Elemento", value: "Valor", unit: "Unidade", answers: "Respostas", title: "Cálculos" },
  it: { item: "Voce", value: "Valore", unit: "Unità", answers: "Risposte", title: "Calcoli" }
};

const formulaOf = (s: CalcStep): string => {
  const a = s.args.map((x) => `[${x}]`);
  switch (s.op) {
    case "sum": return `=${a.join("+")}`;
    case "sub": return `=${a[0]}-${a[1]}`;
    case "mul": return `=${a.join("*")}`;
    case "div": return `=${a[0]}/${a[1]}`;
    case "min": return `=MIN(${a.join(",")})`;
    case "max": return `=MAX(${a.join(",")})`;
    default: return `=AVERAGE(${a.join(",")})`;
  }
};

/** The text form of the sheet: the figures, then one row per calculation as a formula that names its rows, then the answers. */
export function sheetText(plan: Pick<CalcPlan, "inputs"> & Partial<CalcPlan>, lang: Lang): string {
  const w = WORDS[lang] ?? WORDS.en;
  const rows = [`| ${w.item} | ${w.value} | ${w.unit} |`, "|---|---|---|", ...plan.inputs.map((i) => `| ${i.label} | ${i.value} | ${i.unit} |`)];
  for (const s of plan.steps ?? []) rows.push(`| ${s.label} | ${formulaOf(s)} | |`);
  if (plan.answers?.length) {
    rows.push(`| ${w.answers} | | |`);
    for (const a of plan.answers) rows.push(`| ${a.question} | =[${a.step}] | |`);
  }
  return `## ${w.title}\n${rows.join("\n")}`;
}

/** The answers, read back from the sheet itself (its formulas calculated by the app's own evaluator), so what is said is what the cells hold. */
export function sheetAnswers(source: string, plan: CalcPlan, lang: Lang): { question: string; value: number }[] {
  const sheets = parseSheets(source);
  const rows = sheets[0]?.rows ?? [];
  const wb = new Workbook(sheets);
  const at = rows.map((r) => r[0]).lastIndexOf((WORDS[lang] ?? WORDS.en).answers);
  const out: { question: string; value: number }[] = [];
  if (at < 0) return out;
  plan.answers.forEach((a, k) => {
    const v = wb.cell(sheets[0].name, at + 1 + k, 1);
    if (typeof v === "number") out.push({ question: a.question, value: v });
  });
  return out;
}

// ---------------------------------------------------------------- what the model is asked

/** Methods the person may name; what a small model does not know is said in a line, only when the request names the method. */
const METHODS: { words: RegExp; note: string }[] = [
  { words: /\bCUMP\b|co[uû]t unitaire moyen pond[ée]r[ée]|weighted average cost|average cost method/i, note: "CUMP (weighted average cost) = (value of the opening stock + value of what came in) / (quantity of the opening stock + quantity that came in). What is left in stock is valued at the CUMP times its quantity." },
  { words: /\bFIFO\b|\bPEPS\b|premier entr[ée]/i, note: "FIFO (PEPS): the oldest units leave first, so the stock that is left is valued at the cost of the most recent entries." },
  { words: /co[uû]t de production|cost of production|production cost|cost of goods (?:made|produced)/i, note: "The cost of production adds every cost of making the goods in the period: raw materials, their transport, direct production costs and indirect production costs. Costs of selling are not in it. The unit cost is that total divided by the quantity produced." },
  { words: /co[uû]t d'achat|purchase cost|cost of purchase/i, note: "The purchase cost is the purchase price plus the costs of buying (transport, duties). The unit purchase cost is that total divided by the quantity bought." },
  { words: /prix (?:du )?march[ée]|market (?:price|value)|valeur de march[ée]|net realisable|valeur nette/i, note: "A stock is valued at the lower of its cost and its market price: when the market price is lower, the stock is written down to it." },
  { words: /seuil de rentabilit[ée]|break[- ]?even|point mort/i, note: "The break-even quantity = fixed costs / (unit selling price - unit variable cost)." }
];
export const methodNotes = (request: string): string[] => METHODS.filter((m) => m.words.test(request)).map((m) => m.note);

const SYSTEM = "You are an accountant who plans spreadsheets. You never calculate a number yourself: you read figures, list calculations and name operations. You reply with one JSON object that follows the schema, nothing else.";

const closed = (props: object, required: string[]) => ({ type: "object", additionalProperties: false, required, properties: props });
export const INPUTS_SCHEMA = closed({ inputs: { type: "array", minItems: 1, maxItems: 40, items: closed({ label: { type: "string" }, value: { type: "number" }, unit: { type: "string" } }, ["label", "value", "unit"]) } }, ["inputs"]);
export const WORDS_SCHEMA = closed({
  steps: { type: "array", minItems: 1, maxItems: 24, items: closed({ label: { type: "string" }, how: { type: "string" } }, ["label", "how"]) },
  answers: { type: "array", minItems: 1, maxItems: 8, items: closed({ question: { type: "string" }, step: { type: "string" } }, ["question", "step"]) }
}, ["steps", "answers"]);
/** The operations: the label is one of the planned calculations, the operation one of the seven, an argument one of the labels that exist. */
export const stepsSchema = (inputs: string[], planned: string[]) => closed({
  steps: { type: "array", minItems: planned.length, maxItems: planned.length, items: closed({ label: { type: "string", enum: planned }, op: { type: "string", enum: [...OPS] }, args: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", enum: [...inputs, ...planned] } } }, ["label", "op", "args"]) }
}, ["steps"]);

const figuresList = (inputs: CalcInput[]) => inputs.map((i) => `${i.label} = ${i.value}${i.unit ? ` ${i.unit}` : ""}`).join("\n");
const faults = (problems: string[]) => (problems.length ? `Your last answer had these problems, fix them:\n- ${problems.join("\n- ")}\n\n` : "");

export const inputsPrompt = (request: string, problems: string[] = []) =>
  `${faults(problems)}Write every figure given in this statement, one object each: a short unique label, its value as a plain number (no space, no currency sign) and its unit. Leave out what is a question or a method. Write the labels in the language of the statement.\n\nThe statement:\n${request.slice(0, 6000)}`;

export const wordsPrompt = (request: string, inputs: CalcInput[], problems: string[] = []) => {
  const notes = methodNotes(request);
  return `${faults(problems)}The statement:\n${request.slice(0, 6000)}\n\nThe figures already read from it (use these labels exactly):\n${figuresList(inputs)}\n\n${notes.length ? `Methods:\n${notes.map((n) => `- ${n}`).join("\n")}\n\n` : ""}List the calculations the sheet must make to answer what the statement asks, in the order they are made, as few as the work needs. Each has a unique label and, in \`how\`, what it is in words: which figures or earlier calculations it uses, by their exact labels, and how (sum, difference, product, quotient, lower, higher, average). Do not calculate any number. Then in \`answers\`, for each thing the statement asks for, give the question in a few words and the label of the calculation that answers it. Write the labels in the language of the statement.`;
};

export const opsPrompt = (inputs: CalcInput[], words: CalcWord[], problems: string[] = []) =>
  `${faults(problems)}The figures:\n${figuresList(inputs)}\n\nTurn these calculations into steps {label, op, args}, one per calculation. op is one of ${OPS.map((o) => `"${o}"`).join(", ")}; args are the labels of figures or of other calculations (sub and div take two: the first minus or divided by the second).\n\nThe calculations:\n${words.map((w) => `${w.label}: ${w.how}`).join("\n")}`;

// ---------------------------------------------------------------- the whole job

const artifactOf = (title: string, source: string) => `<artifact type="xlsx" title="${title.replace(/"/g, "'").slice(0, 80)}">\n${source.trim()}\n</artifact>`;

function summary(lang: Lang, rows: { question: string; value: number }[]): string {
  const f = (n: number) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 2 }).format(n);
  const list = rows.map((r) => `- ${r.question}${lang === "fr" ? " :" : ":"} ${f(r.value)}`).join("\n");
  return lang === "fr"
    ? `J'ai mis les chiffres de votre énoncé dans la feuille, puis chaque calcul en formule : si vous changez un chiffre, tout se recalcule.\n\n${list}\n\nSélectionnez des cases, une ligne ou une colonne dans l'aperçu pour me demander de les modifier.`
    : `I put the figures of your statement in the sheet, then every calculation as a formula: change a figure and everything recalculates.\n\n${list}\n\nSelect cells, a row or a column in the preview to ask me to change them.`;
}

export async function* makeCalcSheet(o: CalcOptions, request: string, add: (s: ChatStats) => void, total: ChatStats): AsyncGenerator<ChatEvent, CalcResult> {
  const lang = langOf(request);
  const stages: BuildStage[] = [];
  const steps: BuildStep[] = [{ file: "Spreadsheet", action: "new", job: "from the figures of the request", status: "running", stages }];
  let phase = "";
  const run = (status: BuildRun["status"] = "running"): ChatEvent => ({ id: o.id, type: "build", build: { status, steps: steps.map((s) => ({ ...s, stages: s.stages?.map((g) => ({ ...g })) })), phase } });
  const begin = (id: string, label: string, note: string): BuildStage => { const g: BuildStage = { id, label, status: "running", note, agent: "Writer", model: o.modelOf?.(), at: Date.now() }; stages.push(g); return g; };
  const end = (g: BuildStage, status: BuildStage["status"], note?: string) => { g.status = status; g.sec = Math.round(((Date.now() - (g.at ?? Date.now())) / 1000) * 10) / 10; if (note !== undefined) g.note = note; };
  // a session with ":x:" in its id is one of the short closed questions: it does not think
  const ask = async (sid: string, user: string, schema: object): Promise<unknown> => {
    let out = "";
    const msgs: ChatMessage[] = [{ role: "system", content: SYSTEM }, { role: "user", content: user }];
    try {
      for await (const ev of o.stream(`${o.id}:x:calc:${sid}`, msgs, true, "plan", schema)) { out = withAnswer(out, ev); if (ev.type === "done") add(ev.stats); }
    } catch (e) { if (o.signal?.aborted) throw e; return null; }
    if (o.signal?.aborted) throw new Error("aborted");
    return firstJson(out);
  };
  const fail = async function* (g: BuildStage, why: string): AsyncGenerator<ChatEvent, CalcResult> {
    end(g, "skipped", why.slice(0, 160));
    yield { id: o.id, type: "notice", text: `The calculation plan did not hold up (${why.slice(0, 160)}): the sheet is written freely.` };
    yield run();
    return { handled: false };
  };

  // 1 ---- the figures
  const g1 = begin("figures", "Figures", "reading the figures of the statement");
  phase = "Reading the figures…";
  yield run();
  let inputs: CalcInput[] = [], problems: string[] = [];
  for (let attempt = 0; attempt < 2 && !inputs.length; attempt++) {
    inputs = readInputs(await ask(`inputs:${attempt}`, inputsPrompt(request, problems), INPUTS_SCHEMA));
    problems = inputs.length ? [] : ["no figure with a number was found: write every figure of the statement"];
  }
  if (!inputs.length) return yield* fail(g1, "no figure was read");
  end(g1, "done", `${inputs.length} figures`);
  // the figures appear at once, the calculations follow
  const w = WORDS[lang] ?? WORDS.en;
  yield { id: o.id, type: "replace", text: artifactOf(w.title, sheetText({ inputs }, lang)) };
  yield run();

  // 2 ---- the calculations, in words
  const g2 = begin("plan", "Calculations", "listing the calculations the statement asks for");
  phase = "Planning the calculations…";
  yield run();
  let words: CalcWord[] = [], answers: CalcAnswer[] = [];
  problems = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = readWords(await ask(`words:${attempt}`, wordsPrompt(request, inputs, problems), WORDS_SCHEMA), inputs);
    words = r.words; answers = r.answers; problems = r.problems;
    if (words.length && !problems.length) break;
    if (attempt === 1 && words.length && answers.length) problems = [];
  }
  if (!words.length) return yield* fail(g2, problems[0] ?? "no calculation was listed");
  end(g2, "done", `${words.length} calculations`);

  // 3 ---- each calculation as an operation on labels
  const g3 = begin("ops", "Operations", "turning each calculation into an operation");
  phase = "Choosing the operations…";
  yield run();
  const labels = inputs.map((i) => i.label), planned = words.map((x) => x.label);
  let plan: CalcPlan | null = null;
  problems = [];
  for (let attempt = 0; attempt < 2 && !plan; attempt++) {
    const r = readSteps(await ask(`ops:${attempt}`, opsPrompt(inputs, words, problems), stepsSchema(labels, planned)), inputs, planned);
    problems = r.problems;
    if (problems.length) continue;
    const candidate: CalcPlan = { inputs, steps: r.steps, answers };
    problems = evalPlan(candidate).problems;
    if (!problems.length) plan = candidate;
  }
  if (!plan) return yield* fail(g3, problems[0] ?? "the operations did not hold up");
  end(g3, "done", `${plan.steps.length} operations`);

  // 4 ---- the sheet, read back with the app's own evaluator
  const g4 = begin("build", "Build", "writing the formulas");
  const source = sheetText(plan, lang);
  const results = sheetAnswers(source, plan, lang);
  if (results.length < plan.answers.length) return yield* fail(g4, "a formula of the sheet does not calculate");
  end(g4, "done", `${source.split("\n").length} lines`);
  steps[0].status = "done";
  phase = "";
  yield run("done");
  const text = `${artifactOf(w.title, source)}\n\n${summary(lang, results)}`;
  yield { id: o.id, type: "replace", text };
  return { handled: true, text, stats: total };
}
