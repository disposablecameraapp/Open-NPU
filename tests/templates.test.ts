import { describe, expect, it } from "vitest";
import { TEMPLATES, kindOfRequest, matchTemplates, templateById, langOf } from "../src/core/templates";
import { Workbook, parseSheets } from "../src/core/sheet";
import { buildOffice, readOffice } from "../src/core/office";

describe("template libraries", () => {
  it("are many, with closed schemas and words to be found by", () => {
    expect(TEMPLATES.filter((t) => t.kind === "docx").length).toBeGreaterThanOrEqual(25);
    expect(TEMPLATES.filter((t) => t.kind === "xlsx").length).toBeGreaterThanOrEqual(25);
    expect(new Set(TEMPLATES.map((t) => `${t.kind}:${t.id}`)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect((t.schema as { additionalProperties: boolean }).additionalProperties).toBe(false);
  });
  it("are found from what people say, in several languages", () => {
    expect(matchTemplates("fais-moi un budget mensuel sur excel", "xlsx")[0].id).toBe("budget");
    expect(matchTemplates("a loan amortization schedule", "xlsx")[0].id).toBe("loan");
    expect(matchTemplates("une lettre de motivation pour un stage", "docx")[0].id).toBe("cover-letter");
    expect(matchTemplates("my CV for a data job", "docx")[0].id).toBe("cv");
    expect(matchTemplates("compte rendu de la réunion", "docx")[0].id).toBe("minutes");
    expect(matchTemplates("a recipe for crêpes", "docx")[0].id).toBe("recipe");
    expect(kindOfRequest("make me an excel file")).toBe("xlsx");
    expect(kindOfRequest("fais-moi un rapport sous Word")).toBe("docx");
    expect(kindOfRequest("rédige un rapport")).toBeNull();
    expect(langOf("fais-moi un budget pour mes courses")).toBe("fr");
    expect(langOf("write a letter to my landlord")).toBe("en");
  });
});

describe("Word templates", () => {
  it("make a document from a few fields, leaving out what has no data, in the language of the request", async () => {
    const t = templateById("minutes", "docx")!;
    const r = t.render({ language: "fr", title: "Réunion produit", date: "12 mars", attendees: ["Ana", "Luc"], decisions: ["Lancer en mai"], actions: [{ task: "Maquette", owner: "Ana", due: "20 mars" }], extra: [{ heading: "Divers", points: ["Café"] }] });
    expect(r.source).toContain("# Réunion produit");
    expect(r.source).toContain("**Date:** 12 mars");
    expect(r.source).toContain("## Participants");
    expect(r.source).toContain("1. Lancer en mai");
    expect(r.source).toContain("| Tâche | Responsable | Échéance |");
    expect(r.source).toContain("## Divers");
    expect(r.source).not.toContain("Absents");
    const back = await readOffice("docx", await buildOffice("docx", r.source));
    expect(back).toContain("# Réunion produit");
  });
  it("compute an invoice", () => {
    const r = templateById("invoice", "docx")!.render({ title: "Invoice 7", currency: "EUR", tax_rate: "20", items: [{ description: "Design", qty: "2", unit_price: "100" }, { description: "Hosting", qty: "1", unit_price: "50,50" }] });
    expect(r.source).toContain("| Design | 2 | 100.00 | 200.00 |");
    expect(r.source).toContain("**Subtotal:** 250.50 EUR");
    expect(r.source).toContain("**Total:** 300.60 EUR");
  });
  it("every template renders from empty data without failing", () => {
    for (const t of TEMPLATES.filter((x) => x.kind === "docx")) expect(() => t.render({ title: "T" })).not.toThrow();
  });
});

describe("Excel templates", () => {
  const sample: Record<string, Record<string, unknown>> = {
    budget: { income: [{ source: "Salary", amount: "2500" }], expenses: [{ category: "Rent", planned: "900", actual: "900" }, { category: "Food", planned: "400", actual: "450" }] },
    loan: { principal: "100000", annual_rate: "3", years: "2" },
    savings: { goal: "1200", deposits: [{ deposit: "100" }, { deposit: "150" }] },
    invoice: { tax_rate: "20", items: [{ description: "A", qty: "2", unit_price: "10" }] },
    "decision-matrix": { options: ["A", "B"], criteria: [{ criterion: "Price", weight: "3", o1: "4", o2: "2" }, { criterion: "Quality", weight: "1", o1: "2", o2: "5" }] },
    gradebook: { assessments: [{ name: "Exam", weight: "2" }, { name: "Quiz", weight: "1" }], students: [{ name: "Zoe", a1: "16", a2: "10" }] },
    "cash-flow": { opening: "1000", months: [{ inflows: "500", outflows: "300" }, { inflows: "400", outflows: "600" }] },
    "break-even": { fixed: "1000", price: "20", variable: "10" }
  };
  const value = (src: string, sheet: string, row: number, col: number) => new Workbook(parseSheets(src)).cell(sheet, row, col);
  it("calculate with the app's own evaluator, without a single error", () => {
    for (const t of TEMPLATES.filter((x) => x.kind === "xlsx")) {
      const src = t.render(sample[t.id] ?? {}).source;
      const wb = new Workbook(parseSheets(src));
      for (const sh of parseSheets(src)) sh.rows.forEach((row, r) => row.forEach((c, k) => { const v = String(wb.cell(sh.name, r, k) ?? ""); expect(v, `${t.id} ${sh.name} r${r + 1}c${k + 1} "${c}"`).not.toMatch(/^#/); }));
    }
  });
  it("put the numbers where the formulas look", () => {
    const budget = templateById("budget", "xlsx")!.render(sample.budget).source;
    expect(value(budget, "Summary", 4, 1)).toBe(2500 - 1350);
    const loan = templateById("loan", "xlsx")!.render(sample.loan).source;
    expect(Math.round(Number(value(loan, "Summary", 1, 1)))).toBe(4298);
    expect(parseSheets(loan).find((s) => s.name === "Schedule")!.rows.length).toBe(25);
    expect(Math.abs(Number(value(loan, "Schedule", 24, 5)))).toBeLessThan(0.01);
    const matrix = templateById("decision-matrix", "xlsx")!.render(sample["decision-matrix"]).source;
    const rows = parseSheets(matrix)[0].rows;
    expect(Number(value(matrix, "Matrix", rows.length - 1, 2))).toBeCloseTo((3 * 4 + 1 * 2) / 4);
    const cash = templateById("cash-flow", "xlsx")!.render(sample["cash-flow"]).source;
    expect(Number(value(cash, "Cash flow", 2, 5))).toBe(1000 + 200 - 200);
  });
  it("rename the headers in the language of the request, add columns and blank rows", () => {
    const src = templateById("expense-tracker", "xlsx")!.render({ headers: { date: "Date", category: "Catégorie", amount: "Montant" }, currency: "€", extra_columns: [{ header: "Reçu" }], blank_rows: 3, expenses: [{ date: "1 mars", description: "Pain", category: "Food", amount: "2,40" }] }).source;
    expect(src).toContain("| Date | Description | Catégorie | Montant (€) | Paid by | Reçu |");
    expect(parseSheets(src)[0].rows.length).toBe(1 + 4 + 1);
  });
  it("build a real file", async () => {
    const back = await readOffice("xlsx", await buildOffice("xlsx", templateById("budget", "xlsx")!.render(sample.budget).source));
    expect(back).toContain("=SUM(");
  });
});

import { makeFromTemplate, templateKind } from "../src/core/templates/build";
import { artifactsIn } from "../src/core/artifacts";
import type { ChatEvent } from "../src/shared/types";

describe("a file made from a template", () => {
  const stats = { ttftSec: 0.1, tokPerSec: 20, tokens: 10, totalSec: 0.5 };
  const go = async (request: string, replies: Record<string, string>, router: boolean | null = false) => {
    const schemas: unknown[] = [];
    const stream = async function* (sid: string, _m: unknown[], _w: boolean, _r?: string, schema?: unknown): AsyncGenerator<ChatEvent> {
      const key = Object.keys(replies).find((k) => sid.includes(k));
      if (schema) schemas.push(schema);
      yield { id: sid, type: "answer", text: key ? replies[key] : "Done." } as ChatEvent; yield { id: sid, type: "done", stats } as ChatEvent;
    };
    const g = makeFromTemplate({ id: "t", messages: [{ role: "user", content: request }], stream: stream as never, askRouter: async () => router });
    let r = await g.next(); while (!r.done) r = await g.next();
    return { result: r.value, schemas };
  };
  it("only for a new Word or Excel file that the person names", () => {
    expect(templateKind("make me a budget in Excel", false)).toBe("xlsx");
    expect(templateKind("fais-moi un budget sur Excel", true)).toBeNull();
    expect(templateKind("write a letter to my landlord", false)).toBeNull();
    expect(templateKind("fais-moi une lettre de motivation en Word", false)).toBe("docx");
  });
  it("picks the template, fills it with the schema, and gives the real file text", async () => {
    const { result, schemas } = await go("Fais-moi un budget mensuel sur Excel", { fill: JSON.stringify({ language: "fr", title: "Budget de mars", currency: "€", income: [{ source: "Salaire", amount: "2000" }], expenses: [{ category: "Loyer", planned: "800", actual: "800" }], headers: { category: "Catégorie", planned: "Prévu", actual: "Réel" } }) });
    expect(result.handled).toBe(true);
    const a = artifactsIn((result as { text: string }).text)[0];
    expect(a.kind).toBe("xlsx");
    expect(a.title).toBe("Budget de mars");
    expect(a.content).toContain("| Catégorie | Prévu (€) | Réel (€) |");
    expect(schemas).toHaveLength(1);
  });
  it("corrects once, then falls back to the usual way when the data stays unusable; the router can send an unusual need there too", async () => {
    const bad = await go("make a CV in Word", { fill: "no json" });
    expect(bad.result.handled).toBe(false);
    const unusual = await go("make a budget in Excel", { fill: "{}" }, true);
    expect(unusual.result.handled).toBe(false);
    const word = await go("make a CV as a Word document", { fill: JSON.stringify({ title: "Ana Diaz", experience: [{ title: "Engineer", org: "Acme", period: "2020-2024", points: ["Built things"] }] }) });
    expect((word.result as { text: string }).text).toContain("### Engineer — Acme (2020-2024)");
  });
});

describe("the document appears while the model fills it in", () => {
  it("shows only what has been filled so far, piece by piece, never the empty template", async () => {
    const stats = { ttftSec: 0.1, tokPerSec: 20, tokens: 10, totalSec: 0.5 };
    const json = JSON.stringify({ language: "en", title: "March budget", headers: { category: "Category" }, income: [{ source: "Salary", amount: "2000" }], expenses: [{ category: "Rent", planned: "800", actual: "800" }, { category: "Food", planned: "300", actual: "280" }] });
    const stream = async function* (sid: string): AsyncGenerator<ChatEvent> {
      if (sid.includes(":fill")) for (let i = 0; i < json.length; i += 9) yield { id: sid, type: "answer", text: json.slice(i, i + 9) } as ChatEvent;
      else yield { id: sid, type: "answer", text: "Done." } as ChatEvent;
      yield { id: sid, type: "done", stats } as ChatEvent;
    };
    const g = makeFromTemplate({ id: "t", messages: [{ role: "user", content: "make a monthly budget in Excel" }], stream: stream as never, drawEveryMs: 0 });
    const texts: string[] = []; let r = await g.next();
    while (!r.done) { const ev = r.value as ChatEvent & { text?: string }; if (ev.type === "replace" && ev.text) texts.push(ev.text); r = await g.next(); }
    expect(texts.length).toBeGreaterThan(4);
    // the first drawing has no empty row waiting to be filled, and nothing in it is a formula over rows that do not exist yet
    expect(texts[0]).not.toMatch(/\|\s+\|\s+\|\s+\|/);
    expect(texts.some((t) => t.includes("Salary") && !t.includes("Rent"))).toBe(true);
    expect(texts[0]).not.toContain("Rent");
    // it grows: a later drawing has the expenses, and the last one is the finished file with its summary
    expect(texts.some((t) => t.includes("Rent") && !t.includes("Food"))).toBe(true);
    expect(texts[texts.length - 1]).toContain("## Summary");
    expect((r.value as { handled: boolean }).handled).toBe(true);
  });
  it("repairs the JSON of a reply that stopped in the middle", async () => {
    const { repairJson } = await import("../src/core/look");
    expect(repairJson('{"title": "Hel')).toEqual({ title: "Hel" });
    expect(repairJson('{"a": [1, 2, {"b": "x"')).toEqual({ a: [1, 2, { b: "x" }] });
    expect(repairJson('{"a": "x", "b":')).toEqual({ a: "x" });
    expect(repairJson('{"a": "x", "b": tru')).toEqual({ a: "x" });
    expect(repairJson('{"a": 12.')).toEqual({ a: 12 });
    expect(repairJson("no brace yet")).toBeNull();
  });
});
