import { Template, asList, asRows, asText, esc, schemaStr } from "./kit";
import { parseNumber } from "./word";
import { colName } from "../sheet";

/**
 * Spreadsheets from a description: a template says which sheets, columns and formulas exist; the model only gives the rows,
 * the settings (rates, goals) and the words of the headers in the language of the request. The formulas are already in place
 * and calculate for any number of rows; blank rows are added so the person can keep filling it in. Customisation: `headers`
 * renames any column, `extra_columns` adds input columns, `blank_rows` sets how many empty formula rows follow the data.
 */
interface Col { key: string; h: string; type?: "text" | "num" | "money" | "pct" | "date"; f?: string; total?: string }
interface SheetDef { name: string; key: string; cols: Col[] | ((d: Data) => Col[]); blank?: number; gen?: (d: Data) => number; totals?: boolean; seed?: (i: number, d: Data) => Record<string, string> }
interface Setting { key: string; h: string; def: string }
interface SumRow { key: string; h: string; f: string }
interface Def { id: string; name: string; summary: string; words: RegExp; settings?: Setting[]; sheets: SheetDef[]; summaryRows?: SumRow[] }
type Data = Record<string, unknown>;

const t = (key: string, h: string): Col => ({ key, h, type: "text" });
const n = (key: string, h: string, total?: string): Col => ({ key, h, type: "num", total });
const m = (key: string, h: string, total?: string): Col => ({ key, h, type: "money", total });
const p = (key: string, h: string): Col => ({ key, h, type: "pct" });
const d = (key: string, h: string): Col => ({ key, h, type: "date" });
const fx = (key: string, h: string, f: string, total?: string, type: Col["type"] = "money"): Col => ({ key, h, f, total, type });

const MONTHS = (lang: string) => Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleString(lang === "pt" ? "pt-PT" : lang, { month: "long" }));
const langOfData = (x: Data) => (["en", "fr", "es", "de", "pt", "it"].includes(asText(x.language)) ? asText(x.language) : "en");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const DEFS: Def[] = [
  { id: "budget", name: "Monthly budget", summary: "Income, planned and actual expenses, balance", words: /\b(budget|presupuesto|haushaltsplan|orçamento|bilancio familiare)\b/i,
    sheets: [
      { name: "Income", key: "income", cols: [t("source", "Source"), m("amount", "Amount", "sum")], blank: 4, totals: true },
      { name: "Expenses", key: "expenses", cols: [t("category", "Category"), m("planned", "Planned", "sum"), m("actual", "Actual", "sum"), fx("difference", "Difference", "={col:actual}-{col:planned}", "sum"), fx("used", "Used %", '=IF({col:planned}=0,"",{col:actual}/{col:planned})', "", "pct")], blank: 8, totals: true }],
    summaryRows: [{ key: "total_income", h: "Total income", f: "=SUM({rng:Income.amount})" }, { key: "total_planned", h: "Planned expenses", f: "=SUM({rng:Expenses.planned})" }, { key: "total_actual", h: "Actual expenses", f: "=SUM({rng:Expenses.actual})" }, { key: "balance", h: "Balance", f: "=B2-B4" }] },
  { id: "expense-tracker", name: "Expense tracker", summary: "Dated expenses by category with totals per category", words: /\b(expense|expenses|d[ée]penses?|gastos|ausgaben|despesas|spese|spending|tracker de d[ée]penses)\b/i,
    sheets: [{ name: "Expenses", key: "expenses", cols: [d("date", "Date"), t("description", "Description"), t("category", "Category"), m("amount", "Amount", "sum"), t("paid_by", "Paid by")], blank: 30, totals: true }],
    summaryRows: [] },
  { id: "savings", name: "Savings goal", summary: "Monthly deposits, running total and progress to a goal", words: /\b(savings?|[ée]pargne|ahorros?|sparziel|poupan[çc]a|risparmi\w*|savings goal)\b/i,
    settings: [{ key: "goal", h: "Goal", def: "5000" }, { key: "start", h: "Starting balance", def: "0" }],
    sheets: [{ name: "Savings", key: "deposits", cols: [t("month", "Month"), m("deposit", "Deposit", "sum"), fx("cumulative", "Cumulative", "={set:start}+SUM($B$2:B{r})"), fx("progress", "Progress", "={col:cumulative}/{set:goal}", "", "pct")], gen: () => 12, blank: 0, seed: (i, x) => ({ month: cap(MONTHS(langOfData(x))[i] ?? "") }) }] },
  { id: "loan", name: "Loan schedule", summary: "Monthly payment and amortisation table", words: /\b(loan|pr[êe]t|cr[ée]dit|pr[ée]stamo|kredit|empr[ée]stimo|prestito|mortgage|hypoth[èe]que|amortiss\w+|amortization)\b/i,
    settings: [{ key: "principal", h: "Amount borrowed", def: "200000" }, { key: "annual_rate", h: "Annual rate (%)", def: "4" }, { key: "years", h: "Years", def: "20" }],
    sheets: [{ name: "Schedule", key: "schedule", gen: (x) => Math.min(480, Math.max(1, Math.round((parseNumber(x.years) ?? 20) * 12))), blank: 0, cols: [fx("period", "Period", "={r}-1", "", "num"), fx("payment", "Payment", "=-PMT({set:annual_rate}/100/12,{set:years}*12,{set:principal})", "sum"), fx("interest", "Interest", "={col:opening}*{set:annual_rate}/100/12", "sum"), fx("principal_paid", "Principal", "={col:payment}-{col:interest}", "sum"), fx("opening", "Opening balance", "=IF({r}=2,{set:principal},{prev:balance})"), fx("balance", "Balance", "={col:opening}-{col:principal_paid}")] }],
    summaryRows: [{ key: "monthly", h: "Monthly payment", f: "=-PMT({set:annual_rate}/100/12,{set:years}*12,{set:principal})" }, { key: "total_interest", h: "Total interest", f: "=SUM({rng:Schedule.interest})" }] },
  { id: "invoice", name: "Invoice", summary: "Invoice lines with totals and tax", words: /\b(invoice|facture|factura|rechnung|fatura|fattura|quote|devis|presupuesto|angebot)\b.*\b(excel|spreadsheet|tableur|xlsx|feuille)\b|\b(excel|spreadsheet|tableur|xlsx|feuille)\b.*\b(invoice|facture|factura|rechnung|fatura|fattura|quote|devis)\b/i,
    settings: [{ key: "tax_rate", h: "Tax rate (%)", def: "20" }],
    sheets: [{ name: "Invoice", key: "items", cols: [t("description", "Description"), n("qty", "Qty"), m("unit_price", "Unit price"), fx("amount", "Amount", "={col:qty}*{col:unit_price}", "sum")], blank: 8, totals: true }],
    summaryRows: [{ key: "subtotal", h: "Subtotal", f: "=SUM({rng:Invoice.amount})" }, { key: "tax", h: "Tax", f: "=B2*{set:tax_rate}/100" }, { key: "total", h: "Total", f: "=B2+B3" }] },
  { id: "inventory", name: "Inventory", summary: "Stock with reorder alerts and value", words: /\b(inventory|inventaire|inventario|bestand|invent[áa]rio|stock|stocks)\b/i,
    sheets: [{ name: "Inventory", key: "items", cols: [t("sku", "SKU"), t("item", "Item"), t("category", "Category"), n("stock", "In stock", "sum"), n("reorder", "Reorder level"), m("unit_cost", "Unit cost"), fx("value", "Value", "={col:stock}*{col:unit_cost}", "sum"), fx("status", "Status", '=IF({col:stock}<={col:reorder},"Reorder","OK")', "", "text")], blank: 20, totals: true }] },
  { id: "project-tracker", name: "Project tracker", summary: "Tasks with owner, status, priority, dates and progress", words: /\b(project tracker|suivi de projet|seguimiento de proyecto|projektverfolgung|acompanhamento de projeto|task tracker|suivi des t[âa]ches|to-?do list|kanban)\b/i,
    sheets: [{ name: "Tasks", key: "tasks", cols: [t("task", "Task"), t("owner", "Owner"), t("status", "Status"), t("priority", "Priority"), d("start", "Start"), d("due", "Due"), p("done", "% done"), t("notes", "Notes")], blank: 25, totals: false }],
    summaryRows: [{ key: "count", h: "Tasks", f: "=COUNTA({rng:Tasks.task})" }, { key: "average", h: "Average progress", f: "=IFERROR(AVERAGE({rng:Tasks.done}),0)" }] },
  { id: "gantt", name: "Weekly planning (Gantt)", summary: "Tasks over weeks with a bar drawn by formula", words: /\b(gantt|planning|calendrier de projet|cronograma|zeitplan|cronograma de projeto|project schedule|weekly plan)\b/i,
    settings: [{ key: "weeks", h: "Number of weeks", def: "12" }],
    sheets: [{ name: "Plan", key: "tasks", blank: 10, cols: (x) => { const w = Math.min(52, Math.max(4, Math.round(parseNumber(x.weeks) ?? 12))); return [t("task", "Task"), t("owner", "Owner"), n("start_week", "Start week"), n("duration", "Weeks"), fx("end_week", "End week", "={col:start_week}+{col:duration}-1", "", "num"), ...Array.from({ length: w }, (_, i) => fx(`w${i + 1}`, `W${i + 1}`, `=IF(AND(${i + 1}>={col:start_week},${i + 1}<={col:end_week}),"■","")`, "", "text"))]; } }] },
  { id: "timesheet", name: "Timesheet", summary: "Hours per day, project and rate, with amounts", words: /\b(timesheet|feuille de temps|feuille d'heures|hoja de horas|stundenzettel|folha de horas|foglio ore|time tracking|suivi du temps)\b/i,
    settings: [{ key: "rate", h: "Hourly rate", def: "50" }],
    sheets: [{ name: "Hours", key: "entries", cols: [d("date", "Date"), t("project", "Project"), t("task", "Task"), n("hours", "Hours", "sum"), fx("amount", "Amount", "={col:hours}*{set:rate}", "sum")], blank: 30, totals: true }] },
  { id: "attendance", name: "Attendance", summary: "Presence per day with rates", words: /\b(attendance|pr[ée]sences?|asistencia|anwesenheit|presen[çc]a|presenze|roll call|feuille d'appel)\b/i,
    settings: [{ key: "days", h: "Number of days", def: "20" }],
    sheets: [{ name: "Attendance", key: "people", blank: 10, cols: (x) => { const k = Math.min(60, Math.max(1, Math.round(parseNumber(x.days) ?? 20))); return [t("name", "Name"), ...Array.from({ length: k }, (_, i) => t(`d${i + 1}`, `D${i + 1}`)), fx("present", "Present", `=COUNTIF({col:d1}:{col:d${k}},"P")`, "", "num"), fx("rate", "Rate", `={col:present}/${k}`, "", "pct")]; } }] },
  { id: "gradebook", name: "Gradebook", summary: "Students, assessments, weighted average", words: /\b(gradebook|grades?|notes? des [ée]l[èe]ves|carnet de notes|calificaciones|notenliste|boletim|registro voti|marks)\b/i,
    sheets: [{ name: "Grades", key: "students", blank: 10, cols: (x) => { const a = asRows(x.assessments).slice(0, 12); const list = a.length ? a : [{ name: "Test 1", weight: "1" }, { name: "Test 2", weight: "1" }]; const tw = list.reduce((s, r) => s + (parseNumber(r.weight) ?? 1), 0) || 1; return [t("name", "Student"), ...list.map((r, i) => n(`a${i + 1}`, `${asText(r.name) || `Test ${i + 1}`} (${Math.round(((parseNumber(r.weight) ?? 1) / tw) * 100)}%)`)), fx("average", "Weighted average", "=" + list.map((r, i) => `{col:a${i + 1}}*${(parseNumber(r.weight) ?? 1) / tw}`).join("+"), "avg", "num")]; } }] },
  { id: "decision-matrix", name: "Comparison matrix", summary: "Weighted criteria across options with a total score", words: /\b(compar\w+|decision matrix|matrice de d[ée]cision|matriz de decisi[óo]n|entscheidungsmatrix|matriz de decis[ãa]o|scorecard|weighted scoring|grille de comparaison)\b/i,
    sheets: [{ name: "Matrix", key: "criteria", blank: 3, totals: true, cols: (x) => { const o = asList(x.options).slice(0, 8); const opts = o.length ? o : ["Option A", "Option B"]; return [t("criterion", "Criterion"), n("weight", "Weight"), ...opts.map((name, i) => ({ key: `o${i + 1}`, h: name, type: "num" as const, total: `=IFERROR(SUMPRODUCT({rng:weight},{rng:o${i + 1}})/SUM({rng:weight}),0)` }))]; } }] },
  { id: "sales-pipeline", name: "Sales pipeline", summary: "Deals by stage, value and weighted forecast", words: /\b(pipeline|sales|ventes?|ventas|vertrieb|vendas|vendite|crm|prospects?)\b/i,
    sheets: [{ name: "Pipeline", key: "deals", blank: 20, totals: true, cols: [t("deal", "Deal"), t("company", "Company"), t("stage", "Stage"), m("value", "Value", "sum"), p("probability", "Probability"), fx("weighted", "Weighted", "={col:value}*{col:probability}", "sum"), d("close", "Close date"), t("owner", "Owner")] }] },
  { id: "habits", name: "Habit tracker", summary: "Habits over the days of a month with a score", words: /\b(habit|habitude|h[áa]bito|gewohnheit|h[áa]bito|abitudin\w+|routine)\b/i,
    settings: [{ key: "days", h: "Number of days", def: "30" }],
    sheets: [{ name: "Habits", key: "habits", blank: 4, cols: (x) => { const k = Math.min(31, Math.max(7, Math.round(parseNumber(x.days) ?? 30))); return [t("habit", "Habit"), ...Array.from({ length: k }, (_, i) => t(`d${i + 1}`, String(i + 1))), fx("done", "Done", `=COUNTIF({col:d1}:{col:d${k}},"x")`, "", "num"), fx("score", "Score", `={col:done}/${k}`, "", "pct")]; } }] },
  { id: "workout", name: "Workout log", summary: "Exercises with sets, reps, weight and total volume", words: /\b(workout|entra[iî]nement|entrenamiento|training|treino|allenamento|fitness|gym|musculation)\b/i,
    sheets: [{ name: "Workout", key: "sets", blank: 30, totals: true, cols: [d("date", "Date"), t("exercise", "Exercise"), n("sets", "Sets"), n("reps", "Reps"), n("weight", "Weight"), fx("volume", "Volume", "={col:sets}*{col:reps}*{col:weight}", "sum", "num")] }] },
  { id: "meal-planner", name: "Meal planner", summary: "A week of meals with calories", words: /\b(meal plan\w*|menu de la semaine|planificateur de repas|men[úu] semanal|speiseplan|planejador de refei[çc][õo]es|piano dei pasti|repas)\b/i,
    sheets: [{ name: "Meals", key: "days", gen: () => 7, blank: 0, totals: true, cols: [t("day", "Day"), t("breakfast", "Breakfast"), t("lunch", "Lunch"), t("dinner", "Dinner"), t("snack", "Snack"), n("calories", "Calories", "sum")] }] },
  { id: "shopping", name: "Shopping list", summary: "Items with prices, totals and what is left to buy", words: /\b(shopping|courses|lista de la compra|einkaufsliste|lista de compras|lista della spesa|grocery|groceries)\b/i,
    sheets: [{ name: "Shopping", key: "items", blank: 20, totals: true, cols: [t("item", "Item"), n("qty", "Qty"), m("price", "Unit price"), fx("total", "Total", "={col:qty}*{col:price}", "sum"), t("bought", "Bought (x)")] }],
    summaryRows: [{ key: "left", h: "Left to buy", f: '=SUMIF({rng:Shopping.bought},"",{rng:Shopping.total})' }] },
  { id: "kpi", name: "KPI dashboard", summary: "Targets, actuals, variance and status", words: /\b(kpi|indicateurs?|indicadores|kennzahlen|dashboard|tableau de bord|cuadro de mando|scorecard)\b/i,
    sheets: [{ name: "KPIs", key: "kpis", blank: 6, cols: [t("kpi", "KPI"), n("target", "Target"), n("actual", "Actual"), fx("variance", "Variance", "={col:actual}-{col:target}", "", "num"), fx("achievement", "% of target", '=IF({col:target}=0,"",{col:actual}/{col:target})', "", "pct"), fx("status", "Status", '=IF({col:actual}>={col:target},"On track","Behind")', "", "text")] }] },
  { id: "break-even", name: "Break-even analysis", summary: "Break-even point and a table by volume", words: /\b(break[- ]?even|seuil de rentabilit[ée]|punto de equilibrio|gewinnschwelle|ponto de equil[ií]brio|punto di pareggio)\b/i,
    settings: [{ key: "fixed", h: "Fixed costs", def: "10000" }, { key: "price", h: "Price per unit", def: "50" }, { key: "variable", h: "Variable cost per unit", def: "30" }],
    sheets: [{ name: "Volumes", key: "volumes", gen: () => 12, blank: 0, seed: (i) => ({ units: String(i * 100) }), cols: [n("units", "Units"), fx("revenue", "Revenue", "={col:units}*{set:price}"), fx("cost", "Total cost", "={set:fixed}+{col:units}*{set:variable}"), fx("profit", "Profit", "={col:revenue}-{col:cost}")] }],
    summaryRows: [{ key: "breakeven", h: "Break-even units", f: "=IFERROR({set:fixed}/({set:price}-{set:variable}),0)" }] },
  { id: "cash-flow", name: "Cash-flow forecast", summary: "Monthly inflows, outflows and closing balance", words: /\b(cash[- ]?flow|tr[ée]sorerie|flujo de caja|liquidit[äa]t|fluxo de caixa|flusso di cassa|forecast|pr[ée]vision de tr[ée]sorerie)\b/i,
    settings: [{ key: "opening", h: "Opening balance", def: "0" }],
    sheets: [{ name: "Cash flow", key: "months", gen: () => 12, blank: 0, totals: true, seed: (i, x) => ({ month: cap(MONTHS(langOfData(x))[i] ?? "") }), cols: [t("month", "Month"), fx("opening", "Opening", "=IF({r}=2,{set:opening},{prev:closing})"), m("inflows", "Inflows", "sum"), m("outflows", "Outflows", "sum"), fx("net", "Net", "={col:inflows}-{col:outflows}", "sum"), fx("closing", "Closing", "={col:opening}+{col:net}")] }] },
  { id: "pnl", name: "Profit and loss", summary: "Revenue and costs with gross profit and margin", words: /\b(profit and loss|p&l|compte de r[ée]sultat|cuenta de resultados|gewinn- und verlust|demonstra[çc][ãa]o de resultados|conto economico|income statement)\b/i,
    sheets: [{ name: "Revenue", key: "revenue", blank: 4, totals: true, cols: [t("line", "Line"), m("amount", "Amount", "sum")] }, { name: "Costs", key: "costs", blank: 8, totals: true, cols: [t("line", "Line"), m("amount", "Amount", "sum")] }],
    summaryRows: [{ key: "revenue", h: "Revenue", f: "=SUM({rng:Revenue.amount})" }, { key: "costs", h: "Costs", f: "=SUM({rng:Costs.amount})" }, { key: "profit", h: "Profit", f: "=B2-B3" }, { key: "margin", h: "Margin", f: "=IFERROR(B4/B2,0)" }] },
  { id: "okr", name: "OKR tracker", summary: "Objectives and key results with progress", words: /\b(okr|objectifs? et r[ée]sultats|objetivos y resultados|ziele und ergebnisse|objectives and key results)\b/i,
    sheets: [{ name: "OKRs", key: "key_results", blank: 10, cols: [t("objective", "Objective"), t("key_result", "Key result"), n("target", "Target"), n("current", "Current"), fx("progress", "Progress", '=IF({col:target}=0,"",{col:current}/{col:target})', "", "pct"), t("owner", "Owner"), t("status", "Status")] }] },
  { id: "bill-split", name: "Cost split", summary: "Who pays what: shares and amounts", words: /\b(split|partage|reparto|aufteilung|divis[ãa]o|ripartizione|colocation|roommates|co-?loc|shared costs)\b/i,
    settings: [{ key: "total", h: "Total to share", def: "1000" }],
    sheets: [{ name: "Split", key: "people", blank: 4, totals: true, cols: [t("name", "Person"), n("share", "Share", "sum"), fx("amount", "Amount due", "=IFERROR({set:total}*{col:share}/SUM({rng:share}),0)", "sum")] }] },
  { id: "contacts", name: "Contacts / CRM", summary: "People with company, email, phone, last contact and next step", words: /\b(contacts?|annuaire|carnet d'adresses|contactos|kontakte|contatos|rubrica|address book)\b/i,
    sheets: [{ name: "Contacts", key: "contacts", blank: 30, cols: [t("name", "Name"), t("company", "Company"), t("email", "Email"), t("phone", "Phone"), d("last_contact", "Last contact"), t("next_step", "Next step")] }] },
  { id: "guest-list", name: "Guest list", summary: "Guests with RSVP, meal, plus-one and counts", words: /\b(guest list|liste d'invit[ée]s|lista de invitados|g[äa]steliste|lista de convidados|lista degli invitati|rsvp|wedding list)\b/i,
    sheets: [{ name: "Guests", key: "guests", blank: 40, cols: [t("name", "Name"), t("rsvp", "RSVP"), t("meal", "Meal"), n("plus_one", "Plus-ones"), t("table", "Table")] }],
    summaryRows: [{ key: "yes", h: "Confirmed", f: '=COUNTIF({rng:Guests.rsvp},"yes")' }, { key: "heads", h: "Total people", f: '=COUNTIF({rng:Guests.rsvp},"yes")+SUMIF({rng:Guests.rsvp},"yes",{rng:Guests.plus_one})' }] },
  { id: "leave", name: "Leave tracker", summary: "Staff leave days taken and remaining", words: /\b(leave|cong[ée]s|vacaciones|urlaub|f[ée]rias|ferie|holiday tracker|absences?)\b/i,
    settings: [{ key: "allowance", h: "Days per year", def: "25" }],
    sheets: [{ name: "Leave", key: "people", blank: 10, cols: [t("name", "Name"), n("taken", "Days taken"), fx("remaining", "Remaining", "={set:allowance}-{col:taken}", "", "num"), t("notes", "Notes")] }] }
];

// ------------------------------------------------------------------ building
const settingRow = (def: Def, i: number) => i + 2;
function cellValue(c: Col, raw: unknown): string {
  const s = asText(raw);
  if (c.type === "money" || c.type === "num" || c.type === "pct") { const v = parseNumber(s); if (v === null) return s; return c.type === "pct" && /%/.test(s) ? String(v / 100) : String(v); }
  return s;
}

function build(def: Def, data: Data, live = false): { source: string; title: string } {
  const headers = (data.headers && typeof data.headers === "object" ? data.headers : {}) as Record<string, unknown>;
  const hd = (key: string, fallback: string) => asText(headers[key]) || fallback;
  const cur = asText(data.currency);
  const extraCols = asRows(data.extra_columns).slice(0, 6).filter((r) => asText(r.header));
  const settings = def.settings ?? [];
  // layout first: every sheet's columns and row counts, so formulas can point anywhere
  const sheets = def.sheets.filter((sd) => !live || (!sd.gen && asRows(data[sd.key]).length > 0)).map((sd) => {
    const baseCols = typeof sd.cols === "function" ? sd.cols(data) : sd.cols;
    const cols = [...baseCols, ...extraCols.map((r, i): Col => ({ key: `extra${i + 1}`, h: asText(r.header), type: asText(r.type) === "number" ? "num" : "text" }))];
    const items = asRows(data[sd.key]);
    const blank = live ? 0 : Math.max(0, Math.min(200, parseNumber(data.blank_rows) ?? sd.blank ?? 10));
    const count = sd.gen ? sd.gen(data) : Math.max(1, items.length + blank);
    return { sd, cols, items, count, first: 2, last: 1 + count };
  });
  const sheetOf = (name: string) => sheets.find((s) => s.sd.name === name);
  const setRef = (key: string) => { const i = settings.findIndex((s) => s.key === key); return i < 0 ? "0" : `Settings!$B$${settingRow(def, i)}`; };
  const resolve = (f: string, ctx: { sheet: (typeof sheets)[number] | null; row?: number }): string =>
    f.replace(/\{col:(\w+)\}/g, (_, k) => { const i = ctx.sheet?.cols.findIndex((c) => c.key === k) ?? -1; return i < 0 ? "0" : `${colName(i)}${ctx.row}`; })
      .replace(/\{prev:(\w+)\}/g, (_, k) => { const i = ctx.sheet?.cols.findIndex((c) => c.key === k) ?? -1; return i < 0 || (ctx.row ?? 2) <= 2 ? "0" : `${colName(i)}${(ctx.row ?? 2) - 1}`; })
      .replace(/\{rng:(?:(\w+)\.)?(\w+)\}/g, (_, sn, k) => { const sh = sn ? sheetOf(sn) ?? ctx.sheet ?? sheets[0] : ctx.sheet ?? sheets[0]; const i = sh.cols.findIndex((c) => c.key === k); return i < 0 ? "0" : `${sh === ctx.sheet ? "" : `${sh.sd.name.includes(" ") ? `'${sh.sd.name}'` : sh.sd.name}!`}$${colName(i)}$${sh.first}:$${colName(i)}$${sh.last}`; })
      .replace(/\{set:(\w+)\}/g, (_, k) => setRef(k))
      .replace(/\{r\}/g, String(ctx.row ?? 2));
  const table = (rows: string[][]) => `${rows.map((r, i) => `| ${r.map(esc).join(" | ")} |${i === 0 ? `\n|${r.map(() => "---").join("|")}|` : ""}`).join("\n")}`;
  const out: string[] = [];
  if (settings.length && (!live || settings.some((x) => asText(data[x.key])))) {
    out.push(`## Settings\n${table([[hd("settings_name", "Setting"), hd("settings_value", "Value")], ...settings.filter((s) => !live || asText(data[s.key])).map((s) => [hd(s.key, s.h), cellValue(n(s.key, s.h), data[s.key]) || s.def])])}`);
  }
  for (const sh of sheets) {
    const head = sh.cols.map((c) => `${hd(c.key, c.h)}${cur && c.type === "money" ? ` (${cur})` : ""}`);
    const rows: string[][] = [head];
    for (let i = 0; i < sh.count; i++) {
      const row = sh.first + i, item = { ...(sh.sd.seed?.(i, data) ?? {}), ...(sh.items[i] ?? {}) } as Record<string, unknown>;
      rows.push(sh.cols.map((c) => (c.f ? resolve(c.f, { sheet: sh, row }) : cellValue(c, item[c.key]))));
    }
    if (sh.sd.totals) {
      rows.push(sh.cols.map((c, ci) => {
        if (ci === 0) return hd("total", "Total");
        const f = c.total; if (!f) return "";
        const r = `${colName(ci)}${sh.first}:${colName(ci)}${sh.last}`;
        return f === "sum" ? `=SUM(${r})` : f === "avg" ? `=IFERROR(AVERAGE(${r}),0)` : f === "min" ? `=MIN(${r})` : f === "max" ? `=MAX(${r})` : f === "count" ? `=COUNTA(${r})` : resolve(f, { sheet: sh });
      }));
    }
    out.push(`## ${sh.sd.name}\n${table(rows)}`);
  }
  if (def.summaryRows?.length && !live && sheets.length) {
    out.push(`## Summary\n${table([[hd("summary_name", "Measure"), hd("summary_value", "Value")], ...def.summaryRows.map((s) => [hd(s.key, s.h), resolve(s.f, { sheet: null })])])}`);
  }
  return { source: out.join("\n\n") + "\n", title: asText(data.title) || def.name };
}

function schemaOf(def: Def): object {
  const num = { type: "string", description: "a number" };
  const keys = new Set<string>(["settings_name", "settings_value", "summary_name", "summary_value", "total"]);
  const sheetProps: Record<string, object> = {};
  const props: Record<string, object> = {
    language: { type: "string", enum: ["en", "fr", "es", "de", "pt", "it"] }, title: schemaStr("the name of the file"), currency: schemaStr("currency symbol or code, if money is involved"),
  };
  const blankRows = { type: "integer", minimum: 0, maximum: 200, description: "empty rows with formulas after the data, to keep filling in" };
  const extraColumns = { type: "array", maxItems: 6, description: "more input columns the person wants", items: { type: "object", additionalProperties: false, required: ["header"], properties: { header: schemaStr(), type: { type: "string", enum: ["text", "number"] } } } };
  for (const s of def.settings ?? []) keys.add(s.key);
  for (const sd of def.sheets) {
    const cols = typeof sd.cols === "function" ? sd.cols({}) : sd.cols;
    sheetProps[sd.key] = { type: "array", maxItems: 400, items: { type: "object", additionalProperties: false, properties: Object.fromEntries(cols.filter((c) => !c.f).map((c) => [c.key, schemaStr()])) } };
    for (const c of cols) keys.add(c.key);
  }
  for (const s of def.summaryRows ?? []) keys.add(s.key);
  // order matters while the model writes: the headers first (so the rows appear under their final names), then the settings, then the rows, the extras last
  props.headers = { type: "object", additionalProperties: false, description: "the header and label of each column, setting and summary line, written in the language of the request", properties: Object.fromEntries([...keys].map((k) => [k, schemaStr()])) };
  for (const s of def.settings ?? []) props[s.key] = num;
  Object.assign(props, sheetProps);
  props.blank_rows = blankRows; props.extra_columns = extraColumns;
  if (def.id === "gradebook") props.assessments = { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, properties: { name: schemaStr(), weight: schemaStr() } } };
  if (def.id === "decision-matrix") props.options = { type: "array", maxItems: 8, items: { type: "string" }, description: "the options compared" };
  if (["gantt", "attendance", "habits"].includes(def.id)) props.days = props.weeks = num;
  const order = ["language", "title", "currency", "headers", ...(def.settings ?? []).map((x) => x.key), "assessments", "options", "days", "weeks", ...def.sheets.map((x) => x.key), "blank_rows", "extra_columns"];
  return { type: "object", additionalProperties: false, properties: Object.fromEntries(order.filter((k) => props[k]).map((k) => [k, props[k]])) };
}

export const EXCEL_TEMPLATES: Template[] = DEFS.map((def): Template => ({
  id: def.id, kind: "xlsx", name: def.name, summary: def.summary, words: def.words, schema: schemaOf(def),
  problems: (x) => (!x || typeof x !== "object" || Array.isArray(x) ? ["the answer is not a JSON object"] : []),
  render: (x, opts) => build(def, (x ?? {}) as Data, !!opts?.live)
}));
