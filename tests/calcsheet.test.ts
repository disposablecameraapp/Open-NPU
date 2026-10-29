import { describe, expect, it } from "vitest";
import { OPS, evalPlan, makeCalcSheet, readInputs, readSteps, readWords, sheetAnswers, sheetText, stepsSchema, methodNotes, type CalcPlan } from "../src/core/templates/calcsheet";
import { makeFromTemplate } from "../src/core/templates/build";
import { artifactsIn } from "../src/core/artifacts";
import { Workbook, parseSheets } from "../src/core/sheet";
import type { ChatEvent } from "../src/shared/types";

const REQUEST = `fais un doc exel et met y les infos comptable et les reponses au questions suivante:
au 1novembre N, le stock etait de 1200pices evalueées a 170400€
matiere premiere 350000
frais de transport de matieres 15000
frais directs de production 260000
frais indirectcs de production 90 000
au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché)
determine le cout de production de 5000 jouets
evaluer le stock sachant que l'entreprise utilise la methode CUMP`;

const INPUTS = [
  { label: "Matières premières", value: 350000, unit: "€" }, { label: "Transport de matières", value: 15000, unit: "€" },
  { label: "Frais directs de production", value: 260000, unit: "€" }, { label: "Frais indirects de production", value: 90000, unit: "€" },
  { label: "Jouets produits", value: 5000, unit: "jouets" }, { label: "Stock initial (quantité)", value: 1200, unit: "jouets" },
  { label: "Stock initial (valeur)", value: 170400, unit: "€" }, { label: "Stock final (quantité)", value: 2000, unit: "jouets" },
  { label: "Prix de marché du stock final", value: 300000, unit: "€" }
];
const WORDS = [
  { label: "Coût de production", how: "the sum of the four costs" }, { label: "Quantité disponible", how: "opening quantity plus toys produced" },
  { label: "Valeur disponible", how: "opening value plus cost of production" }, { label: "CUMP", how: "value available divided by quantity available" },
  { label: "Valeur du stock final au CUMP", how: "final quantity times the CUMP" }, { label: "Valeur retenue du stock final", how: "the lower of the CUMP value and the market price" }
];
const STEPS = [
  { label: "Coût de production", op: "sum", args: ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"] },
  { label: "Quantité disponible", op: "sum", args: ["Stock initial (quantité)", "Jouets produits"] },
  { label: "Valeur disponible", op: "sum", args: ["Stock initial (valeur)", "Coût de production"] },
  { label: "CUMP", op: "div", args: ["Valeur disponible", "Quantité disponible"] },
  { label: "Valeur du stock final au CUMP", op: "mul", args: ["Stock final (quantité)", "CUMP"] },
  { label: "Valeur retenue du stock final", op: "min", args: ["Valeur du stock final au CUMP", "Prix de marché du stock final"] }
];
const ANSWERS = [{ question: "Coût de production de 5000 jouets", step: "Coût de production" }, { question: "Valeur du stock final", step: "Valeur retenue du stock final" }];

describe("the plan of calculations", () => {
  const inputs = readInputs({ inputs: INPUTS });
  it("is read, put in order and run: 715000 and 285613", () => {
    const r = readSteps({ steps: [...STEPS].reverse() }, inputs, WORDS.map((w) => w.label));
    expect(r.problems).toEqual([]);
    expect(r.steps.map((s) => s.label)).toEqual(["Coût de production", "Quantité disponible", "Valeur disponible", "CUMP", "Valeur du stock final au CUMP", "Valeur retenue du stock final"]);
    const plan: CalcPlan = { inputs, steps: r.steps, answers: ANSWERS };
    const v = evalPlan(plan);
    expect(v.problems).toEqual([]);
    expect(v.values.get("Coût de production")).toBe(715000);
    expect(Math.round(v.values.get("Valeur retenue du stock final")!)).toBe(285613);
    const src = sheetText(plan, "fr");
    expect(src).toContain("=[Valeur disponible]/[Quantité disponible]");
    expect(sheetAnswers(src, plan, "fr").map((a) => Math.round(a.value))).toEqual([715000, 285613]);
    expect(new Workbook(parseSheets(src)).show(new Workbook(parseSheets(src)).cell("Calculs", 10, 1))).toBe("715000");
  });
  it("names what is wrong, exactly", () => {
    const planned = WORDS.map((w) => w.label);
    const bad = readSteps({ steps: [{ label: "CUMP", op: "add", args: ["x"] }, { label: "Valeur disponible", op: "div", args: ["Stock initial (valeur)", "Quantité disponible", "Jouets produits"] }, { label: "Coût de production", op: "sum", args: ["Matières premières", 5000] }] }, inputs, planned);
    expect(bad.problems.join(" ")).toMatch(/"add" is not one of/);
    expect(bad.problems.join(" ")).toMatch(/div takes exactly two/);
    expect(bad.problems.join(" ")).toMatch(/"5000" is not the label/);
    expect(bad.problems.join(" ")).toMatch(/"Quantité disponible" has no operation/);
    const loop = readSteps({ steps: [{ label: "A", op: "sum", args: ["B"] }, { label: "B", op: "sum", args: ["A"] }] }, inputs, ["A", "B"]);
    expect(loop.problems.join(" ")).toMatch(/in a circle/);
    const zero = evalPlan({ inputs: [{ label: "a", value: 1, unit: "" }, { label: "z", value: 0, unit: "" }], steps: [{ label: "q", op: "div", args: ["a", "z"] }], answers: [] });
    expect(zero.problems[0]).toMatch(/divides by zero/);
  });
  it("closes the schema: the operation and the arguments can only be what exists", () => {
    const s = stepsSchema(["a", "b"], ["c"]) as { properties: { steps: { minItems: number; items: { properties: { op: { enum: string[] }; args: { items: { enum: string[] } }; label: { enum: string[] } } } } } };
    expect(s.properties.steps.minItems).toBe(1);
    expect(s.properties.steps.items.properties.op.enum).toEqual([...OPS]);
    expect(s.properties.steps.items.properties.args.items.enum).toEqual(["a", "b", "c"]);
    expect(s.properties.steps.items.properties.label.enum).toEqual(["c"]);
  });
  it("cleans labels and reads answers by their spelling", () => {
    expect(readInputs({ inputs: [{ label: "A [x]|@", value: "1 200,5 €", unit: "" }, { label: "a [x]", value: 2, unit: "" }, { label: "n", value: "n/a", unit: "" }] }).map((i) => `${i.label}=${i.value}`)).toEqual(["A x=1200.5", "a x (2)=2"]);
    expect(readWords({ steps: [{ label: "Coût", how: "x" }], answers: [{ question: "q", step: "COUT" }] }, inputs).answers[0].step).toBe("Coût");
  });
  it("gives the model a line on the method the statement names, and only then", () => {
    expect(methodNotes(REQUEST).join(" ")).toMatch(/CUMP \(weighted average cost\)/);
    expect(methodNotes(REQUEST).join(" ")).toMatch(/lower of its cost and its market price/);
    expect(methodNotes("fais un tableur de mes notes")).toEqual([]);
  });
});

describe("a sheet made from the figures of a request", () => {
  const stats = { ttftSec: 0.1, tokPerSec: 20, tokens: 10, totalSec: 0.5 };
  const model = (replies: Record<string, unknown>, seen: { sid: string; schema?: unknown }[] = []) => async function* (sid: string, _m: unknown[], _w: boolean, _r?: string, schema?: unknown): AsyncGenerator<ChatEvent> {
    seen.push({ sid, schema });
    const key = Object.keys(replies).find((k) => sid.includes(`:${k}`));
    yield { id: sid, type: "answer", text: key ? JSON.stringify(replies[key]) : "Fait." } as ChatEvent;
    yield { id: sid, type: "done", stats } as ChatEvent;
  };
  const go = async (replies: Record<string, unknown>, seen: { sid: string; schema?: unknown }[] = []) => {
    const g = makeFromTemplate({ id: "t", messages: [{ role: "user", content: REQUEST }], stream: model(replies, seen) as never, askRouter: async () => false });
    const events: ChatEvent[] = []; let r = await g.next();
    while (!r.done) { events.push(r.value); r = await g.next(); }
    return { result: r.value, events };
  };
  it("goes from the statement to a sheet whose formulas give the answers, the figures showing first", async () => {
    const seen: { sid: string; schema?: unknown }[] = [];
    const { result, events } = await go({ "calc:inputs": { inputs: INPUTS }, "calc:words": { steps: WORDS, answers: ANSWERS }, "calc:ops": { steps: STEPS } }, seen);
    expect(result.handled).toBe(true);
    const text = (result as { text: string }).text;
    const a = artifactsIn(text)[0];
    expect(a.kind).toBe("xlsx");
    expect(a.content).toContain("=MIN([Valeur du stock final au CUMP],[Prix de marché du stock final])");
    expect(text).toMatch(/715[\s\u202f]?000/);
    expect(text).toMatch(/285[\s\u202f]?61[23]/);
    // the figures are drawn before the calculations exist
    const drawn = events.filter((e) => e.type === "replace").map((e) => (e as { text: string }).text);
    expect(drawn[0]).toContain("350000");
    expect(drawn[0]).not.toContain("=[");
    // every question is a closed one, held to a schema, and does not think
    expect(seen.filter((s) => s.sid.includes(":x:calc:")).every((s) => !!s.schema)).toBe(true);
    expect(seen.map((s) => s.sid)).toEqual(["t:x:calc:inputs:0", "t:x:calc:words:0", "t:x:calc:ops:0"]);
  });
  it("asks the operations again with the exact fault, then falls back to the usual writing", async () => {
    const seen: { sid: string; schema?: unknown }[] = [];
    const bad = { steps: STEPS.map((s) => (s.label === "CUMP" ? { ...s, op: "add" } : s)) };
    const { result, events } = await go({ "calc:inputs": { inputs: INPUTS }, "calc:words": { steps: WORDS, answers: ANSWERS }, "calc:ops": bad }, seen);
    expect(result.handled).toBe(false);
    expect(seen.map((s) => s.sid).filter((s) => s.includes("ops"))).toEqual(["t:x:calc:ops:0", "t:x:calc:ops:1"]);
    expect(events.some((e) => e.type === "notice")).toBe(true);
  });
});

describe("writing in the cells", () => {
  it("sets one cell of the text form, adds what is past the end, and keeps formulas", async () => {
    const { setCell } = await import("../src/core/sheet");
    const src = "## S\n| Item | Value |\n|---|---|\n| a | 1 |\n| Total | =B2 |";
    const one = setCell(src, 0, 1, 1, "5");
    expect(parseSheets(one)[0].rows[1]).toEqual(["a", "5"]);
    expect(parseSheets(one)[0].rows[2]).toEqual(["Total", "=B2"]);
    expect(parseSheets(setCell(src, 0, 5, 3, "x"))[0].rows[5]).toEqual(["", "", "", "x"]);
    expect(parseSheets(setCell(src, 0, 3, 0, ""))[0].rows).toHaveLength(3);
    expect(setCell(src, 4, 0, 0, "x")).toBe(src);
  });
  it("puts the cell writer in the preview only when asked", async () => {
    const { officePreview } = await import("../src/core/office");
    const src = "## S\n| a | =1+1 |";
    expect(officePreview("xlsx", src)).not.toContain("npuEditCell");
    const p = officePreview("xlsx", src, {}, undefined, false, true);
    expect(p).toContain("npuEditCell");
    expect(p).toContain('data-raw="=1+1"');
    expect(() => new Function(p.match(/<script>([\s\S]*)<\/script>/)![1])).not.toThrow();
  });
});

describe("writing in the text of a document", () => {
  it("cuts a document into blocks (a fence is one block) and writes one back", async () => {
    const { splitBlocks, replaceBlock, isFenced } = await import("../src/core/docBlocks");
    const src = "# Title\n\nFirst paragraph\nsecond line\n\n```chart\na: 1\n\nb: 2\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
    expect(splitBlocks(src)).toEqual(["# Title", "First paragraph\nsecond line", "```chart\na: 1\n\nb: 2\n```", "| a | b |\n|---|---|\n| 1 | 2 |"]);
    expect(isFenced(splitBlocks(src)[2])).toBe(true);
    expect(replaceBlock(src, 1, "Changed")).toBe("# Title\n\nChanged\n\n```chart\na: 1\n\nb: 2\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(replaceBlock(src, 0, "")).not.toContain("# Title");
    expect(replaceBlock("", 0, "New text")).toBe("New text");
    expect(replaceBlock("a\n\nb", 5, "c")).toBe("a\n\nb\n\nc");
  });
});
