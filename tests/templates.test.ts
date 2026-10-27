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
    expect(kindOfRequest("fais un doc exel et met y les infos comptable")).toBe("xlsx");
    expect(kindOfRequest("fais un fichier excell")).toBe("xlsx");
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
    const unusual = await go("make a budget in Excel with a dashboard and a custom macro", { fill: "{}" }, true);
    expect(unusual.result.handled).toBe(false);
    // an ordinary request, however long, is never sent to the router: the template can do it
    const plain = await go("make a budget in Excel", { fill: JSON.stringify({ title: "Budget", income: [{ source: "Salary", amount: "2000" }], expenses: [{ category: "Rent", planned: "800", actual: "800" }] }) }, true);
    expect(plain.result.handled).toBe(true);
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
  it("shows the sheet as soon as its headers are written, and the thought of a model that thinks first", async () => {
    const stats = { ttftSec: 0.1, tokPerSec: 20, tokens: 10, totalSec: 0.5 };
    const json = JSON.stringify({ language: "fr", title: "Stock", headers: { sku: "Réf", item: "Article", stock: "Stock" }, items: [{ sku: "A1", item: "Jouet", stock: "2000" }] });
    const stream = async function* (sid: string): AsyncGenerator<ChatEvent> {
      if (sid.includes(":fill")) { yield { id: sid, type: "thinking", text: "Je calcule le CUMP" } as ChatEvent; for (let i = 0; i < json.length; i += 9) yield { id: sid, type: "answer", text: json.slice(i, i + 9) } as ChatEvent; }
      else yield { id: sid, type: "answer", text: "Fait." } as ChatEvent;
      yield { id: sid, type: "done", stats } as ChatEvent;
    };
    const g = makeFromTemplate({ id: "t", messages: [{ role: "user", content: "fais un tableau excel de l'inventaire" }], stream: stream as never, drawEveryMs: 0 });
    const texts: string[] = []; let thought = false; let r = await g.next();
    while (!r.done) { const ev = r.value as ChatEvent & { text?: string; build?: { live?: string } }; if (ev.type === "replace" && ev.text) texts.push(ev.text); if (ev.type === "build" && ev.build?.live?.includes("CUMP")) thought = true; r = await g.next(); }
    expect(thought).toBe(true);
    const first = texts.find((t) => t.includes("Réf"));
    expect(first).toBeDefined();
    expect(first).not.toContain("Jouet");
    expect(first).not.toContain("=SUM(");
    expect(texts.some((t) => t.includes("Jouet"))).toBe(true);
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

import { renderTool, safeFormula } from "../src/core/templates/site";
import { pageToHtml, pageSpecOf } from "../src/core/page/html";
import { toPuckData, fromPuckData } from "../src/core/page/catalog";
describe("website and tool templates", () => {
  const site = { language: "en", title: "Maison Dupain", page_type: "restaurant", theme: "vieux chaleureux", background: "waves", seed: 3, sections: [
    { type: "hero", title: "Bread, the old way", subtitle: "Stone-baked since 1962", cta: "Order", cta_href: "#menu", layout: "split", items: [{ icon: "🥖" }] },
    { type: "features", title: "Why us", items: [{ icon: "🌾", title: "Local flour", text: "From **two** farms" }, { icon: "🔥", title: "Wood oven", text: "Every dawn" }] },
    { type: "menu", title: "Menu", items: [{ title: "Baguette", text: "Crisp", value: "1.20" }] },
    { type: "faq", title: "Questions", items: [{ q: "Do you deliver?", a: "Yes." }] },
    { type: "contact", title: "Visit", email: "hi@example.com", cta: "Send" }] };
  it("make one self-contained page with the sections, the theme and a procedural hero", () => {
    const source = pageToHtml(site);
    expect(source).toContain("<!DOCTYPE html>");
    expect(source).toContain("Bread, the old way");
    expect(source).toContain("<summary>Do you deliver?");
    expect(source).toContain("mailto:hi@example.com");
    expect(source).toContain("<svg");
    expect(source).toContain("<b>two</b>");
    expect(source).toMatch(/font-family:'(Georgia|Garamond|Palatino Linotype)'/);
    expect(source).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(pageSpecOf(source)?.title).toBe("Maison Dupain");
    // what the visual editor holds goes back to the same page
    expect(fromPuckData(toPuckData(site)).sections?.map((x) => x.type)).toEqual(site.sections.map((x) => x.type));
    expect((fromPuckData(toPuckData(site)).sections?.[1] as { items: { text: string }[] }).items[0].text).toBe("From **two** farms");
  });
  it("checks that the first section is the hero and escapes what the model wrote", () => {
    const t = TEMPLATES.find((x) => x.id === "site")!;
    expect(t.problems({ title: "x", sections: [{ type: "text" }, { type: "text" }, { type: "text" }] })).toContain("the first section must be the hero");
    const hostile = pageToHtml({ title: "<script>alert(1)</script>", sections: [{ type: "hero", title: "<img onerror=x>" }] });
    expect(hostile).not.toContain("<script>alert");
    expect(hostile).not.toContain("<img onerror");
  });
  it("run a formula only when it is arithmetic on the inputs", () => {
    expect(safeFormula("weight / (height/100)^2", ["weight", "height"])).toBe("weight / (height/100)**2");
    expect(safeFormula("round(a*1.2)", ["a"])).toBe("Math.round(a*1.2)");
    expect(safeFormula("alert(1)", ["a"])).toBeNull();
    expect(safeFormula("a; fetch('x')", ["a"])).toBeNull();
    expect(safeFormula("constructor.constructor('x')()", ["a"])).toBeNull();
    expect(safeFormula("window", ["a"])).toBeNull();
  });
  it("make a calculator page whose results are computed in the page", async () => {
    const tool = { title: "BMI", inputs: [{ id: "weight", label: "Weight", unit: "kg", value: "70" }, { id: "height", label: "Height", unit: "cm", value: "175" }], outputs: [{ label: "BMI", formula: "weight / (height/100)^2", decimals: 1 }, { label: "bad", formula: "alert(1)" }] };
    const t = TEMPLATES.find((x) => x.id === "calculator")!;
    expect(t.problems(tool).join("|")).toMatch(/"alert\(1\)"/);
    const { source } = renderTool(tool);
    expect(source).toContain("weight / (height/100)**2");
    expect(source).not.toContain("alert(1)");
    // run the page's own script against a minimal page: the results are computed from the inputs
    const script = /<script>\n([\s\S]*?)\n<\/script>/.exec(source)![1];
    const values: Record<string, string> = { weight: "70", height: "175" };
    const els: Record<string, { value: string; innerHTML: string }> = { weight: { value: "70", innerHTML: "" }, height: { value: "175", innerHTML: "" }, res: { value: "", innerHTML: "" } };
    const doc = { getElementById: (id: string) => els[id], querySelectorAll: () => [] };
    new Function("document", script)(doc);
    expect(els.res.innerHTML).toContain("22.9");
    els.weight.value = "90"; values.weight = "90";
    new Function("document", script)(doc);
    expect(els.res.innerHTML).toContain("29.4");
  });
  it("a site or a tool goes through a template unless the person wants code by hand", () => {
    expect(templateKind("make me a landing page for my bakery", false, false)).toBe("site");
    expect(templateKind("make me a landing page for my bakery", false, true)).toBeNull();
    expect(templateKind("make a landing page from scratch in vanilla js", false, false)).toBeNull();
    expect(templateKind("fais-moi un simulateur de prêt", false, false)).toBe("tool");
    expect(templateKind("make a snake game", false, false)).toBeNull();
  });
});

import { iconFor, isEmoji, ICON_NAMES } from "../src/core/page/icons";
import { pageToFiles } from "../src/core/page/html";
describe("icons, animations and the exported site", () => {
  const spec = { title: "Nova", motion: "lively", icon_style: "icons", sections: [
    { type: "hero", title: "Hi", subtitle: "x", cta: "Go", effect: "particles", layout: "split", items: [{ icon: "rocket" }] },
    { type: "features", title: "F", animate: "stagger", items: [{ icon: "secure", title: "Safe" }, { icon: "🔥", title: "Hot" }, { icon: "nonsense-xyz", title: "None" }] },
    { type: "stats", title: "S", animate: "zoom", items: [{ value: "$27.6bn", title: "FDI" }, { value: "180%", title: "GDP" }] }] };
  it("find an icon by its name or by what it means, and tell an emoji from a name", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(300);
    expect(iconFor("rocket")).toBe("rocket");
    expect(iconFor("Shield Check")).toBe("shield-check");
    expect(iconFor("secure")).not.toBeNull();
    expect(iconFor("protection")).toMatch(/shield|lock/);
    expect(iconFor("zzzqqq")).toBeNull();
    expect(isEmoji("🔥")).toBe(true);
    expect(isEmoji("rocket")).toBe(false);
  });
  it("draw line icons by default, keep emojis as they are, and follow the style the person chose", () => {
    const html = pageToHtml(spec as never);
    expect(html).toContain('<svg viewBox="0 0 24 24"');
    expect(html).toContain("🔥");
    expect(pageToHtml({ ...spec, icon_style: "none" } as never)).not.toContain('<span class="ic">');
    expect(pageToHtml({ ...spec, icon_style: "emoji" } as never)).toContain("🔥");
  });
  it("animate with the libraries: AOS attributes, counting figures, animate.css entrances, only when the page moves", () => {
    const html = pageToHtml(spec as never);
    expect(html).toContain('data-aos="zoom-in"');
    expect(html).toContain('data-aos="fade-up" data-aos-delay="90"');
    expect(html).toContain('data-count="27.6"');
    expect(html).toContain('data-prefix="$"');
    expect(html).toContain("animate__fadeInDown");
    expect(html).toContain('id="particles"');
    const still = pageToHtml({ ...spec, motion: "none" } as never);
    expect(still).not.toContain('data-aos="');
    expect(still).not.toContain("animate__");
    expect(still).not.toContain("AOS.init");
  });
  it("export as the files of a site: html, css, js, the libraries it uses, the licences and the description", () => {
    const files = pageToFiles(spec as never);
    const names = files.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["index.html", "style.css", "script.js", "vendor/aos.js", "vendor/aos.css", "vendor/animate.css", "vendor/countUp.js", "licenses.txt", "page.json"]));
    const index = files.find((f) => f.name === "index.html")!.content;
    expect(index).toContain('<link rel="stylesheet" href="style.css">');
    expect(index).toContain('<script src="vendor/aos.js"></script>');
    expect(index).not.toContain("--accent:");
    expect(files.find((f) => f.name === "licenses.txt")!.content).toMatch(/AOS[\s\S]*Lucide/);
    const plain = pageToFiles({ title: "x", motion: "none", sections: [{ type: "text", title: "a" }, { type: "text", title: "b" }, { type: "text", title: "c" }] } as never).map((f) => f.name);
    expect(plain).not.toContain("script.js");
    expect(plain.some((n) => n.startsWith("vendor/"))).toBe(false);
  });
});

describe("when the small router is asked about a template", () => {
  it("is not asked for an ordinary subject, and is asked for a custom need", async () => {
    const { asksForCustom, unusualQuestion } = await import("../src/core/templates/build");
    expect(asksForCustom("make a website about vietnam's integration into the international economy")).toBe(false);
    expect(asksForCustom("fais un site vitrine pour ma boulangerie")).toBe(false);
    expect(asksForCustom("make a multi-page website with a login")).toBe(true);
    expect(asksForCustom("un site avec des animations personnalisées")).toBe(true);
    expect(unusualQuestion("site")).toContain("do not matter");
    expect(asksForCustom("make a very long and detailed website about the history of the textile industry in northern Vietnam, with a hero, five sections and a contact form")).toBe(false);
  });
});

describe("a website of several pages", () => {
  const stats = { ttftSec: 0.1, tokPerSec: 20, tokens: 10, totalSec: 0.5 };
  const plan = { title: "Pho Hanoi", theme: "warm red", accent: "B23A2E", pages: [{ file: "index", title: "Home", purpose: "Welcome and the main dishes." }, { file: "About", title: "About", purpose: "The story of the family." }, { file: "contact.html", title: "Contact", purpose: "Address and opening hours." }] };
  const page = (name: string) => ({ language: "en", title: name, background: "waves", sections: [{ type: "hero", title: name, subtitle: "x", cta: "Contact", cta_href: "contact" }, { type: "text", title: "One", text: "a" }, { type: "text", title: "Two", text: "b" }] });
  const run = async (request: string, planReply: string, pageReply: (sid: string) => string) => {
    const sids: string[] = [];
    const stream = async function* (sid: string): AsyncGenerator<ChatEvent> {
      sids.push(sid);
      yield { id: sid, type: "answer", text: sid.includes(":siteplan") ? planReply : sid.includes(":page:") ? pageReply(sid) : "Done." } as ChatEvent;
      yield { id: sid, type: "done", stats } as ChatEvent;
    };
    const g = makeFromTemplate({ id: "t", messages: [{ role: "user", content: request }], stream: stream as never, askRouter: async () => false, drawEveryMs: 1e9 });
    const events: ChatEvent[] = []; let r = await g.next();
    while (!r.done) { events.push(r.value); r = await g.next(); }
    return { result: r.value, sids, events };
  };
  it("asks for several pages from the words of the request", async () => {
    const { wantsSeveralPages } = await import("../src/core/templates/multipage");
    expect(wantsSeveralPages("make a multi-page website for my restaurant")).toBe(true);
    expect(wantsSeveralPages("fais un site avec plusieurs pages")).toBe(true);
    expect(wantsSeveralPages("a website with an about page and a contact page")).toBe(true);
    expect(wantsSeveralPages("make a website about vietnam's economy")).toBe(false);
  });
  it("plans the site, writes one page per run, and gives every page the same look, the same menu and working links", async () => {
    const { result, sids } = await run("make a multi-page website for my restaurant", JSON.stringify(plan), (sid) => JSON.stringify(page(sid.includes(":page:0") ? "Home" : "Other")));
    expect(result).toMatchObject({ handled: true });
    const text = (result as { text: string }).text;
    const files = [...text.matchAll(/<artifact type="html" title="([^"]+)">/g)].map((m) => m[1]);
    expect(files).toEqual(["index.html", "about.html", "contact.html"]);
    expect(sids.filter((s) => s.includes(":page:")).length).toBe(3); // one run per page
    const style = (html: string) => html.match(/<style>[\s\S]*?<\/style>/)?.[0];
    const bodies = text.split("</artifact>").slice(0, 3);
    expect(new Set(bodies.map(style)).size).toBe(1); // the CSS is the same text in every file
    for (const b of bodies) { expect(b).toContain('href="index.html"'); expect(b).toContain('href="about.html"'); expect(b).toContain('href="contact.html"'); }
    expect(bodies[0]).toContain('aria-current="page"');
    expect(bodies[1]).toContain('href="contact.html"'); // "contact" became the file name
    expect(bodies[0]).not.toContain('href="contact"');
  });
  it("falls back to a single page when the plan stays unusable", async () => {
    const { result, events } = await run("make a multi-page website for my restaurant", "no json", () => JSON.stringify(page("x")));
    expect(events.some((e) => e.type === "notice" && /Several pages skipped/.test((e as { text: string }).text))).toBe(true);
    expect(result).toMatchObject({ handled: false });
  });
});

describe("drawing while the model writes shows only what it wrote", () => {
  it("a quote shows no totals before its first line item", () => {
    const q = templateById("quote")!;
    expect(q.render({ title: "Quote", language: "en" }, { live: true }).source).not.toMatch(/Total|0\.00/i);
    expect(q.render({ title: "Quote", language: "en", items: [{ description: "Work", qty: "1", unit_price: "10" }] }, { live: true }).source).toMatch(/10\.00/);
  });
  it("a page has no made-up footer, and a calculator is not drawn before its first field", () => {
    const site = templateById("site")!;
    const spec = { title: "Acme", sections: [{ type: "hero", title: "Hello" }] };
    expect(site.render(spec, { live: true }).source).not.toContain("<footer");
    expect(site.render(spec).source).toContain("<footer");
    const calc = templateById("calculator")!;
    expect(calc.render({ title: "BMI", outputs: [] }, { live: true }).source).toBe("");
  });
});

import { slideNumberOf, slideSpan } from "../src/core/build";
import { slidesOf } from "../src/core/slides";
describe("a change on one slide of a deck", () => {
  const deck = "Theme: sunrise\n\n---\n\n# Cover\nLayout: cover\nSubtitle: A country\n\n---\n\n# Agenda\n- One\n\n---\n\n# Third\n- Two\n";
  it("finds the slide a request names", () => {
    expect(slideNumberOf("on slide 1 it says subtitle")).toBe(1);
    expect(slideNumberOf("change the 3rd slide")).toBe(3);
    expect(slideNumberOf("diapo 2: plus court")).toBe(2);
    expect(slideNumberOf("make it shorter")).toBeNull();
  });
  it("cuts a slide out so that before + text + after is the deck, the Theme line not counted", () => {
    const s = slideSpan(deck, 1)!;
    expect(s.text).toContain("# Cover");
    expect(s.text).not.toContain("Agenda");
    expect(s.before + s.text + s.after).toBe(deck);
    expect(slideSpan(deck, 3)!.text).toContain("# Third");
    expect(slideSpan(deck, 4)).toBeNull();
  });
  it("does not print the label of a subtitle line", () => {
    expect(slidesOf(deck)[0].lines.map((l) => l.text)).toEqual(["A country"]);
  });
});
