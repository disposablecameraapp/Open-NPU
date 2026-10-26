import { describe, expect, it } from "vitest";
import { CHART_INSTRUCTIONS, chartModel, fmt, linePath, niceTicks, parseChartSpec, parseFormula, type ChartSpec } from "../src/core/chart";
import { buildSystemPrompt } from "../src/core/projects";
import { parseMarkdown } from "../src/core/markdown";

const ev = (src: string, vars: Record<string, number> = {}) => { const f = parseFormula(src, ["x", ...Object.keys(vars)]); return typeof f === "string" ? f : f({ x: 0, ...vars }); };

describe("formulas", () => {
  it("reads the arithmetic a model writes, with the usual priorities", () => {
    expect(ev("1+2*3")).toBe(7);
    expect(ev("(1+2)*3")).toBe(9);
    expect(ev("2^3^2")).toBe(512);
    expect(ev("-x^2", { x: 3 })).toBe(-9);
    expect(ev("10 - 4 - 3")).toBe(3);
    expect(ev("7 % 4")).toBe(3);
    expect(ev("P*(1+r/100)^x", { P: 1000, r: 5, x: 10 })).toBeCloseTo(1628.89, 2);
  });
  it("knows its functions and constants, and implicit products", () => {
    expect(ev("sqrt(16) + abs(-2) + max(1, 5, 3)")).toBe(11);
    expect(ev("sin(pi/2)")).toBeCloseTo(1);
    expect(ev("ln(e)")).toBeCloseTo(1);
    expect(ev("3x", { x: 4 })).toBe(12);
    expect(ev("2(x+1)", { x: 4 })).toBe(10);
    expect(ev("2×3 ÷ 2")).toBe(3);
  });
  it("says what is wrong instead of running anything", () => {
    expect(ev("2 +")).toMatch(/ends too early/);
    expect(ev("foo(3)")).toMatch(/unknown function foo/);
    expect(ev("y + 1")).toMatch(/unknown name y/);
    expect(ev("(1+2")).toMatch(/bracket/);
    expect(ev("1 $ 2")).toMatch(/unexpected "\$"/);
    expect(ev("process.exit(1)")).toMatch(/unexpected|unknown/);
    expect(ev("1/0")).toBe(Infinity);
  });
});

const COMPOUND = JSON.stringify({
  type: "line", title: "Compound interest", x: { label: "Years", min: 0, max: 30, step: 1 }, yLabel: "Euros",
  params: [{ id: "P", label: "Start", min: 1000, max: 50000, value: 10000, step: 500 }, { id: "r", label: "Rate (%)", min: 0, max: 12, value: 5, step: 0.5 }],
  series: [{ name: "With interest", y: "P*(1+r/100)^x" }, { name: "Without", y: "P" }]
});

describe("the chart a model writes", () => {
  it("is read, and drawn from the values of its sliders", () => {
    const spec = parseChartSpec(COMPOUND) as ChartSpec;
    expect(typeof spec).toBe("object");
    const m = chartModel(spec);
    expect(m.series).toHaveLength(2);
    expect(m.series[0].pts).toHaveLength(31);
    expect(m.series[0].pts[10].y).toBeCloseTo(16288.95, 1);
    const m2 = chartModel(spec, { r: 10 });
    expect(m2.series[0].pts[30].y).toBeGreaterThan(m.series[0].pts[30].y);
    expect(m2.values.r).toBe(10);
    expect(m.yTicks[0].v).toBeLessThanOrEqual(m.yMin);
    expect(m.yTicks.at(-1)!.v).toBeGreaterThanOrEqual(m.yMax);
  });
  it("accepts a bar chart with labels, a pie, and the JSON in a code fence", () => {
    const bar = parseChartSpec('{"type":"bar","labels":["A","B","C"],"series":[{"name":"n","data":[3,5,2]}]}') as ChartSpec;
    const m = chartModel(bar);
    expect(m.series[0].pts.map((p) => p.y)).toEqual([3, 5, 2]);
    expect(m.xTicks.map((t) => t.label)).toEqual(["A", "B", "C"]);
    expect(m.yMin).toBe(0);
    const pie = chartModel(parseChartSpec('```json\n{"type":"pie","labels":["a","b"],"series":[{"name":"s","data":[1,3]}]}\n```') as ChartSpec);
    expect(pie.slices!.map((s) => Math.round(s.share * 100))).toEqual([25, 75]);
  });
  it("says why it cannot be drawn, in words a model can act on", () => {
    expect(parseChartSpec("{nope")).toMatch(/not valid JSON/);
    expect(parseChartSpec('{"type":"sankey","series":[]}')).toMatch(/unknown type "sankey"/);
    expect(parseChartSpec('{"type":"line","series":[]}')).toMatch(/no series/);
    expect(parseChartSpec('{"type":"line","x":{"min":0,"max":5},"series":[{"name":"a","y":"x*zz"}]}')).toMatch(/unknown name zz/);
    expect(parseChartSpec('{"type":"pie","series":[{"name":"a","y":"x"}]}')).toMatch(/pie needs a list/);
    expect(parseChartSpec('{"type":"line","x":{"min":5,"max":1},"series":[{"name":"a","y":"x"}]}')).toMatch(/x.max must be above/);
  });
  it("keeps a bad slider inside its bounds and never draws more than a few hundred points", () => {
    const spec = parseChartSpec('{"type":"line","x":{"min":0,"max":100000,"step":1},"params":[{"id":"a","min":0,"max":10,"value":99}],"series":[{"name":"s","y":"a*x"}]}') as ChartSpec;
    expect(spec.params[0].value).toBe(10);
    expect(chartModel(spec).series[0].pts.length).toBeLessThanOrEqual(401);
  });
  it("breaks the line where a value is not a number, and has nice ticks", () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 1, y: NaN }, { x: 2, y: 3 }], (x) => x, (y) => y)).toBe("M0.0 1.0M2.0 3.0");
    expect(niceTicks(0, 97)).toEqual([0, 20, 40, 60, 80]);
    expect(niceTicks(0.1, 0.9)).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(fmt(12500)).toBe("12 500");
    expect(fmt(1_250_000)).toBe("1.25 M");
    expect(fmt(0.0512)).toBe("0.051");
  });
});

describe("in the chat", () => {
  it("a model is told to write the chart block, with a spec the app can draw", () => {
    expect(buildSystemPrompt({ knowledgeChars: 10 })).toContain("fenced block with the language chart");
    const example = /```chart\n([\s\S]*?)\n```/.exec(CHART_INSTRUCTIONS)![1];
    expect(typeof parseChartSpec(example)).toBe("object");
    expect(buildSystemPrompt({ knowledgeChars: 10, artifacts: false })).toBe("");
  });
  it("a chart fence reaches the renderer as a closed code block of language chart", () => {
    const blocks = parseMarkdown("Here:\n```chart\n" + COMPOUND + "\n```\nDone.");
    const code = blocks.find((b) => b.t === "code") as { lang: string; open: boolean; v: string };
    expect(code.lang).toBe("chart");
    expect(code.open).toBe(false);
    expect(typeof parseChartSpec(code.v)).toBe("object");
    expect((parseMarkdown("```chart\n{\"type\":\"li") .find((b) => b.t === "code") as { open: boolean }).open).toBe(true);
  });
});

describe("a chart still being written", () => {
  const full = '{"type":"line","title":"T","x":{"label":"x","min":0,"max":10,"step":1},"series":[{"name":"A","y":"2*x"},{"name":"B","y":"x^2+1"}]}';
  it("is drawn from what has arrived, series by series", async () => {
    const { partialChartSpec } = await import("../src/core/chart");
    expect(partialChartSpec('{"type":"line","title":"T"')).toBeNull();
    const part = partialChartSpec(full.slice(0, full.indexOf('{"name":"B"') + 18));
    expect(part?.series.map((s) => s.name)).toEqual(["A"]);
    expect(partialChartSpec(full)?.series.length).toBe(2);
  });
});
