import { describe, expect, it } from "vitest";
import { CHART_CALC_INSTRUCTIONS, chartModel, chartOutputs, formulaLines, parseChartSpec, type ChartSpec } from "../src/core/chart";
import { routeVisual } from "../src/core/visualRoute";
import { diagramKind, healDiagram, mendDiagram } from "../src/core/diagram";
import { blockFlaw, settleBlocks, cellNumber, evalSheet, parseCards, parseChecklist, parseKpis, parseQuiz, parseSheet } from "../src/core/blocks";
import { parseFormula } from "../src/core/chart";
import { parseMarkdown } from "../src/core/markdown";
import { buildSystemPrompt } from "../src/core/projects";

const example = () => {
  const m = /```chart\n([\s\S]*?)\n```/.exec(CHART_CALC_INSTRUCTIONS);
  return m![1];
};

describe("the calculator chart", () => {
  it("the example the model is given is a valid chart, with formulas, results and an axis that follows the duration", () => {
    const spec = parseChartSpec(example()) as ChartSpec;
    expect(typeof spec).toBe("object");
    expect(spec.x.maxExpr).toBe("t");
    expect(spec.outputs).toHaveLength(2);
    expect(spec.formulas).toHaveLength(2);
  });
  it("works the results and writes the formula with the typed values", () => {
    const spec = parseChartSpec(example()) as ChartSpec;
    const out = chartOutputs(spec, { P: 10000, r: 5, t: 10 });
    expect(out[0].value).toBeCloseTo(16288.95, 2);
    expect(out[0].text).toMatch(/^16\s?288,95\s€$/);
    const lines = formulaLines(spec, { P: 10000, r: 5, t: 10 });
    expect(lines[0].filled).toBe(false);
    expect(lines[1].tex).toContain("10\\,000");
    expect(lines[1].tex).toContain("16\\,288,95");
  });
  it("the axis ends at the duration the person typed, even beyond the slider", () => {
    const spec = parseChartSpec(example()) as ChartSpec;
    const m = chartModel(spec, { P: 10000, r: 5, t: 45 });
    expect(m.xMax).toBe(45);
    expect(m.series[0].pts[45].y).toBeCloseTo(10000 * 1.05 ** 45, 2);
  });
  it("says what is wrong with an unreadable result or formula line", () => {
    expect(parseChartSpec('{"series":[{"name":"a","data":[1,2]}],"outputs":[{"label":"x","y":"2 +"}]}')).toMatch(/result "x" cannot be read/);
    expect(parseChartSpec('{"series":[{"name":"a","data":[1,2]}],"formulas":["A = [[nope]]"]}')).toMatch(/\[\[nope\]\]/);
  });
});

describe("more kinds of chart", () => {
  it("reads scatter points, a donut, a radar and piled bars", () => {
    const sc = parseChartSpec('{"type":"scatter","series":[{"name":"a","points":[[1,2],[3,5],[2,4]]}]}') as ChartSpec;
    const m = chartModel(sc);
    expect(m.series[0].pts.map((p) => p.x)).toEqual([1, 2, 3]);
    expect(parseChartSpec('{"type":"doughnut","labels":["a","b"],"series":[{"name":"s","data":[1,3]}]}')).toMatchObject({ type: "donut" });
    const radar = chartModel(parseChartSpec('{"type":"radar","labels":["a","b","c"],"series":[{"name":"s","data":[3,6,9]}]}') as ChartSpec);
    expect(radar.series[0].pts).toHaveLength(3);
    expect(radar.yMax).toBeGreaterThanOrEqual(9);
    expect(parseChartSpec('{"type":"radar","labels":["a"],"series":[{"name":"s","data":[1]}]}')).toMatch(/3 names/);
    const st = chartModel(parseChartSpec('{"type":"bar","stack":true,"labels":["a","b"],"series":[{"name":"x","data":[2,3]},{"name":"y","data":[4,1]}]}') as ChartSpec);
    expect(st.yMax).toBeGreaterThanOrEqual(6);
  });
});

describe("routing a request to a picture instead of a page", () => {
  const kind = (r: string, files = false) => routeVisual(r, { hasFiles: files })?.kind ?? null;
  it("sends the compound interest request that produced an ugly page to a calculator chart", () => {
    expect(kind("fais un diagram d'interet composer ou je peux choisir le taux annuelle, le montant de depart et la durée du placement de la somme, qui montre la formule de base, la formule avec mes valeurs et un graph de la some sur la durée donner\n\nje veux pouvoir rentrer le nombre exact pour chaque des valeurs")).toBe("calculator");
  });
  it("tells charts, diagrams and calculators apart", () => {
    expect(kind("trace un graphique de la population de la France")).toBe("chart");
    expect(kind("make a pie chart of my budget")).toBe("chart");
    expect(kind("fais un organigramme d'une startup")).toBe("diagram");
    expect(kind("draw a sequence diagram of a login")).toBe("diagram");
    expect(kind("diagramme du cycle de l'eau")).toBe("diagram");
    expect(kind("fais un calculateur de pret immobilier")).toBe("calculator");
    expect(kind("diagramme des ventes 2020 2021 2022")).toBe("chart");
  });
  it("leaves programs, pages, questions and edits to the build steps", () => {
    expect(kind("make a snake game")).toBeNull();
    expect(kind("fais une calculatrice")).toBeNull();
    expect(kind("crée une page web avec un graphique")).toBeNull();
    expect(kind("explique moi les intérêts composés")).toBeNull();
    expect(kind("le diagram est hideux, rend le plus beau", true)).toBeNull();
  });
  it("gives a routed request the rules of its picture and no artifact rules", () => {
    const p = buildSystemPrompt({ knowledgeChars: 1000, artifacts: true, visual: routeVisual("fais un organigramme") });
    expect(p).toContain("mermaid");
    expect(p).not.toContain("<artifact");
    const q = buildSystemPrompt({ knowledgeChars: 1000, artifacts: true });
    expect(q).toContain("<artifact");
    expect(q).toContain("```mermaid");
    expect(q).toContain("```chart");
  });
});

describe("diagrams", () => {
  it("quotes the labels that would stop a flowchart from drawing", () => {
    const t = mendDiagram("flowchart TD\n  A[Début (étape 1)] --> B{Ok ? oui, non}\n  B --> C[(Base)]");
    expect(t).toContain('A["Début (étape 1)"]');
    expect(t).toContain('B{"Ok ? oui, non"}');
    expect(t).toContain("C[(Base)]");
  });
  it("removes a code fence, an init block and curly quotes, and gives a bare flow its first line", () => {
    expect(mendDiagram("```mermaid\nsequenceDiagram\n A->>B: salut\n```")).toBe("sequenceDiagram\n A->>B: salut");
    expect(mendDiagram('%%{init: {"theme":"dark"}}%%\nflowchart LR\n A --> B')).toBe("flowchart LR\n A --> B");
    expect(mendDiagram("A --> B\nB --> C")).toMatch(/^flowchart TD/);
    expect(diagramKind("mindmap\n  root((x))")).toBe("mindmap");
    expect(diagramKind("hello")).toBeNull();
  });
});

describe("figures, cards and tables", () => {
  it("reads figures and cards written as lines", () => {
    expect(parseKpis("Final | 16 289 € | after 10 years\nInterest: 6 289 €\nnothing")).toEqual([{ label: "Final", value: "16 289 €", note: "after 10 years" }, { label: "Interest", value: "6 289 €", note: undefined }]);
    expect(parseCards("- Capital of France? | Paris\n2. 2+2 | 4")).toEqual([{ front: "Capital of France?", back: "Paris" }, { front: "2+2", back: "4" }]);
  });
  it("reads a markdown table with its alignment, and keeps a paragraph that merely contains a bar", () => {
    const [t] = parseMarkdown("| Year | Amount |\n|:--|--:|\n| 1 | 10 500 |\n| 2 | 11 025 |");
    expect(t).toMatchObject({ t: "table", align: ["l", "r"] });
    expect((t as any).rows).toHaveLength(2);
    expect(parseMarkdown("a | b is not a table")[0].t).toBe("p");
  });
});

describe("quizzes, lists, sheets and documents", () => {
  const kind = (r: string, files = false) => routeVisual(r, { hasFiles: files })?.kind ?? null;
  it("routes a quiz, a checklist and a spreadsheet to their blocks", () => {
    expect(kind("fais moi un qcm sur la révolution française")).toBe("quiz");
    expect(kind("quiz me on the periodic table")).toBe("quiz");
    expect(kind("fais une checklist pour partir en voyage")).toBe("checklist");
    expect(kind("fais un tableur de budget mensuel avec des totaux")).toBe("sheet");
  });
  it("never forces a block where a document is the logical thing", () => {
    expect(kind("fais un rapport sur les intérêts composés avec un graphique")).toBeNull();
    expect(kind("écris une fiche de révision avec un qcm")).toBeNull();
    expect(kind("fais un cours sur le TCP avec un schéma")).toBeNull();
    expect(kind("fais juste un graphique du rapport")).not.toBeNull();
    expect(kind("fais un jeu de quiz")).toBeNull();
  });
});

describe("the quiz, list and sheet blocks", () => {
  it("reads a quiz with right and wrong options and explanations, and drops a question with no right answer", () => {
    const q = parseQuiz("Q: Capital of France?\n- Lyon\n+ Paris\n- Rome\n> Since 987.\n\n2. 2+2?\na) 3\nb) 4 ✓\n\nQ: no answer\n- a\n- b");
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ question: "Capital of France?", why: "Since 987." });
    expect(q[0].options.map((o) => o.right)).toEqual([false, true, false]);
    expect(q[1].options[1]).toEqual({ text: "4", right: true });
  });
  it("reads a checklist", () => {
    expect(parseChecklist("[x] passport\n- [ ] tickets\n- socks")).toEqual([{ text: "passport", done: true }, { text: "tickets", done: false }, { text: "socks", done: false }]);
  });
  it("works a sheet: references, ranges, chains of formulas, and a cell that needs itself", () => {
    const rows = parseSheet("Item | Price | Qty | Total\nCoffee | 3,5 | 4 | =B2*C2\nTea | 2,8 | 2 | =B3*C3\nTotal | | | =SUM(D2:D3)\nLoop | =B5 | | =D5+1");
    const out = evalSheet(rows, parseFormula);
    expect(out[1][3].value).toBeCloseTo(14);
    expect(out[3][3].value).toBeCloseTo(19.6);
    expect(out[4][1].error).toBeTruthy();
    expect(cellNumber("1 200,50 €")).toBe(1200.5);
    expect(cellNumber("12 %")).toBeCloseTo(0.12);
    expect(cellNumber("abc")).toBeNull();
  });
});

describe("automatic correction", () => {
  // a pretend drawer: a text draws when it has no line with the word BAD
  const check = async (t: string) => { const at = t.split("\n").findIndex((l) => /BAD/.test(l)); return at < 0 ? null : `Parse error on line ${at + 1}:`; };
  it("leaves a diagram that draws alone", async () => {
    expect(await healDiagram("flowchart TD\n A --> B", check)).toEqual({ text: "flowchart TD\n A --> B", how: "none" });
  });
  it("removes style lines before anything else", async () => {
    const strict = async (t: string) => (/^\s*style /m.test(t) ? "Parse error on line 3:" : null);
    expect(await healDiagram("flowchart TD\n A --> B\n style A fill:#f9f", strict)).toMatchObject({ how: "mended", text: expect.not.stringContaining("style") });
  });
  it("asks the model with the reason, and checks what it sends back", async () => {
    const asked: string[] = [];
    const r = await healDiagram("flowchart TD\n A --> B\n BAD", check, async (_t, why) => { asked.push(why); return asked.length === 1 ? "flowchart TD\n A --> BAD" : "```mermaid\nflowchart TD\n A --> B\n```"; });
    expect(asked).toHaveLength(2);
    expect(asked[0]).toMatch(/line 3/);
    expect(r).toEqual({ text: "flowchart TD\n A --> B", how: "model" });
  });
  it("leaves out the line the parser points at when nothing else works, and never the first line", async () => {
    expect(await healDiagram("flowchart TD\n A --> B\n BAD\n C --> D", check, async () => null)).toEqual({ text: "flowchart TD\n A --> B\n C --> D", how: "trimmed" });
    expect(await healDiagram("BAD\n A --> B", check)).toMatchObject({ error: expect.any(String) });
  });
  it("finds the blocks that would show less than was written, and says why", () => {
    expect(blockFlaw("quiz", "Q: a?\n- x\n- y")).toMatch(/no question could be read/);
    expect(blockFlaw("quiz", "Q: a?\n- x\n+ y\nQ: b?\n- x\n- y")).toMatch(/1 question\(s\) were dropped/);
    expect(blockFlaw("sheet", "a | b\n1 | =A9+Z1+A2*")).toMatch(/cannot be worked out/);
    expect(blockFlaw("kpi", "nothing here")).toMatch(/no figure/);
    expect(blockFlaw("quiz", "Q: a?\n- x\n+ y")).toBeNull();
    expect(blockFlaw("python", "x")).toBeNull();
  });
  it("gives a broken block to the model, keeps a good answer and leaves the rest of the reply alone", async () => {
    const reply = "Voici:\n```quiz\nQ: a?\n- x\n- y\n```\nFin\n```checklist\n[ ] ok\n```";
    const ask = async (_s: string, user: string) => { expect(user).toContain("Why it does not draw"); return "```quiz\nQ: a?\n- x\n+ y\n```"; };
    const r = await settleBlocks(reply, ask);
    expect(r.mended).toBe(1);
    expect(r.text).toContain("+ y");
    expect(r.text).toContain("[ ] ok");
    const stuck = await settleBlocks(reply, async () => "still nothing");
    expect(stuck.mended).toBe(0);
    expect(stuck.left).toHaveLength(1);
    expect(stuck.text).toBe(reply);
  });
});
