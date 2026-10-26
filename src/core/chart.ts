/**
 * Interactive charts that a model writes as a few lines of JSON instead of a page of JavaScript: the app draws them, in the chat,
 * with sliders for the numbers that can change and a read-out on hover. Formulas are read by a small parser of our own (no eval,
 * which the window does not allow and which would run whatever the model wrote), so a wrong chart is a message, never a crash.
 */

export interface ChartParam { id: string; label: string; min: number; max: number; value: number; step: number; unit?: string }
export interface ChartSeries { name: string; y?: string; data?: number[] }
export interface ChartSpec {
  type: "line" | "area" | "bar" | "pie";
  title: string;
  note?: string;
  x: { label: string; min: number; max: number; step: number };
  yLabel: string;
  labels?: string[];
  params: ChartParam[];
  series: ChartSeries[];
}

// ------------------------------------------------------------------ formulas

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] | string {
  const out: Tok[] = [];
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/²/g, "^2").replace(/³/g, "^3").replace(/,(?=\d{1,2}(?!\d))/g, ",");
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_À-ɏ][\wÀ-ɏ]*/.exec(s.slice(i));
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
    if ("+-*/^%(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    return `unexpected "${c}"`;
  }
  return out;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, pow: Math.pow, sign: Math.sign
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export type Formula = (vars: Record<string, number>) => number;

/** A formula as a function of its variables, or the reason it cannot be read. 2^3^2 is 2^9, -x^2 is -(x^2), 3x is 3*x. */
export function parseFormula(src: string, names: string[] = []): Formula | string {
  const toks = tokenize(src);
  if (typeof toks === "string") return toks;
  const known = new Set([...names, ...Object.keys(CONSTS), ...Object.keys(FUNCS)]);
  let p = 0;
  type Node = (v: Record<string, number>) => number;
  const peek = () => toks[p];
  const op = (v: string) => { const t = peek(); if (t && t.t === "op" && t.v === v) { p++; return true; } return false; };
  let problem = "";
  const fail = (m: string): Node => { if (!problem) problem = m; return () => NaN; };

  const primary = (): Node => {
    const t = toks[p++];
    if (!t) return fail("the formula ends too early");
    if (t.t === "num") return () => t.v;
    if (t.t === "id") {
      const name = t.v;
      if (op("(")) {
        const f = FUNCS[name.toLowerCase()];
        if (!f) return fail(`unknown function ${name}`);
        const args: Node[] = [];
        if (!op(")")) { do args.push(sum()); while (op(",")); if (!op(")")) return fail("a bracket is not closed"); }
        return (v) => f(...args.map((a) => a(v)));
      }
      const lower = name.toLowerCase();
      if (name in CONSTS || lower in CONSTS) { const c = CONSTS[name] ?? CONSTS[lower]; if (!names.includes(name)) return () => c; }
      if (!known.has(name)) return fail(`unknown name ${name} (the names are ${names.join(", ") || "none"})`);
      return (v) => v[name] ?? NaN;
    }
    if (t.v === "(") { const n = sum(); if (!op(")")) return fail("a bracket is not closed"); return n; }
    return fail(`unexpected "${t.v}"`);
  };
  // 3x, 2(x+1), 5pi: a number or a bracket followed by a name or a bracket multiplies
  const implicit = (a: Node): Node => {
    for (;;) {
      const t = peek();
      if (t && (t.t === "id" || (t.t === "op" && t.v === "("))) { const b = power(); const prev = a; a = (v) => prev(v) * b(v); } else return a;
    }
  };
  // -x^2 is -(x^2) and 2^-1 is 0.5: a minus in front takes the whole power, a minus in the exponent belongs to it
  function unary(): Node {
    if (op("-")) { const n = unary(); return (v) => -n(v); }
    if (op("+")) return unary();
    return power();
  }
  function power(): Node {
    const base = implicit(primary());
    if (op("^")) { const e = unary(); return (v) => Math.pow(base(v), e(v)); }
    return base;
  }
  const product = (): Node => {
    let a = unary();
    for (;;) {
      if (op("*")) { const b = unary(); const prev = a; a = (v) => prev(v) * b(v); }
      else if (op("/")) { const b = unary(); const prev = a; a = (v) => prev(v) / b(v); }
      else if (op("%")) { const b = unary(); const prev = a; a = (v) => prev(v) % b(v); }
      else return a;
    }
  };
  function sum(): Node {
    let a = product();
    for (;;) {
      if (op("+")) { const b = product(); const prev = a; a = (v) => prev(v) + b(v); }
      else if (op("-")) { const b = product(); const prev = a; a = (v) => prev(v) - b(v); }
      else return a;
    }
  }
  const root = sum();
  if (p < toks.length && !problem) problem = `unexpected "${(toks[p] as { v: string | number }).v}"`;
  return problem ? problem : root;
}

// ------------------------------------------------------------------ the spec

/**
 * The slips a small model makes in JSON, mended one after the other until the text parses: a key whose closing quote went missing
 * ("max:30), keys with no quotes, single quotes, a comma before a closing bracket, brackets left open. The mended text, or null.
 */
export function repairJson(raw: string): string | null {
  const parses = (t: string) => { try { JSON.parse(t); return true; } catch { return false; } };
  let t = raw.trim().replace(/^```\w*\n?|```$/g, "").trim();
  if (parses(t)) return t;
  const steps: ((x: string) => string)[] = [
    (x) => x.replace(/([{,]\s*)"([A-Za-z_]\w*):\s*(?=[-\d\[{"tfn])/g, '$1"$2":'),
    (x) => x.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":'),
    (x) => (x.includes('"') ? x : x.replace(/'/g, '"')),
    (x) => x.replace(/,\s*([}\]])/g, "$1"),
    (x) => {
      const stack: string[] = [];
      let str = false;
      for (let i = 0; i < x.length; i++) {
        const c = x[i];
        if (c === "\\" && str) { i++; continue; }
        if (c === '"') str = !str;
        else if (!str && (c === "{" || c === "[")) stack.push(c === "{" ? "}" : "]");
        else if (!str && (c === "}" || c === "]")) stack.pop();
      }
      return x + stack.reverse().join("");
    }
  ];
  for (const f of steps) { t = f(t); if (parses(t)) return t; }
  return null;
}

/** The chart blocks of a reply, where they are in it. */
export function chartBlocks(text: string): { start: number; end: number; raw: string }[] {
  return [...text.matchAll(/```chart[ \t]*\n([\s\S]*?)```/g)].map((m) => ({ start: (m.index ?? 0) + m[0].indexOf("\n") + 1, end: (m.index ?? 0) + m[0].length - 3, raw: m[1] }));
}

export const CHART_FIX_INSTRUCTIONS = [
  "You correct the JSON of a chart that could not be drawn. Reply with the corrected JSON object only: no explanation, no code fence.",
  'Every key and every text is in double quotes; numbers are bare. Keep the same chart (type, title, params, series). A series has a "y" formula of x and of the param ids (+ - * / ^, brackets, sin cos exp ln sqrt abs min max, pi) or a "data" list of numbers.'
].join("\n");

/**
 * Every chart of a reply is read as the app will read it. One that cannot be drawn is mended in the text (the usual slips of JSON
 * need no model), else `ask` is given the block and the reason, twice at most. What cannot be mended stays as it was.
 */
export async function settleCharts(text: string, ask: (system: string, user: string) => Promise<string>, tries = 2): Promise<{ text: string; mended: number; left: string[] }> {
  let out = text, mended = 0;
  const left: string[] = [];
  for (const b of chartBlocks(text).reverse()) {
    const at = chartBlocks(out).reverse().find((x) => x.raw === b.raw) ?? null;
    if (!at) continue;
    const valid = (() => { try { JSON.parse(b.raw.trim()); return true; } catch { return false; } })();
    const why = parseChartSpec(b.raw);
    if (valid && typeof why !== "string") continue;
    let fixed: string | null = repairJson(b.raw);
    if (fixed && typeof parseChartSpec(fixed) !== "string") { out = out.slice(0, at.start) + fixed + "\n" + out.slice(at.end); mended++; continue; }
    let reason = typeof why === "string" ? why : "it is not valid JSON";
    fixed = null;
    for (let k = 0; k < tries && fixed === null; k++) {
      let reply = "";
      try { reply = await ask(CHART_FIX_INSTRUCTIONS, `The chart:\n${b.raw.trim().slice(0, 2500)}\n\nWhy it cannot be drawn: ${reason}\n\nSend the corrected JSON.`); } catch { break; }
      const candidate = repairJson(reply) ?? reply.trim().replace(/^```\w*\n?|```$/g, "");
      const check = parseChartSpec(candidate);
      if (typeof check === "string") reason = check; else fixed = candidate;
    }
    if (fixed !== null) { out = out.slice(0, at.start) + fixed + "\n" + out.slice(at.end); mended++; }
    else left.push(reason);
  }
  return { text: out, mended, left };
}

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : d);
const text = (v: unknown, d = "") => (typeof v === "string" ? v.slice(0, 120) : d);
const MAX_POINTS = 400;

/** The JSON a model wrote as a chart, or why it cannot be drawn. Lenient about what is optional, strict about what cannot be guessed. */
export function parseChartSpec(raw: string): ChartSpec | string {
  let j: any;
  const body = raw.trim().replace(/^```\w*\n?|```$/g, "");
  try { j = JSON.parse(body); } catch (e) {
    const mended = repairJson(body);
    if (mended === null) return `it is not valid JSON (${(e as Error).message.slice(0, 80)})`;
    j = JSON.parse(mended);
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return "it must be a JSON object";
  const type = ["line", "area", "bar", "pie"].includes(j.type) ? j.type : j.type === undefined ? "line" : null;
  if (!type) return `unknown type "${String(j.type).slice(0, 20)}" (use line, area, bar or pie)`;
  const params: ChartParam[] = (Array.isArray(j.params) ? j.params : []).slice(0, 6).flatMap((p: any) => {
    if (!p || typeof p.id !== "string" || !/^[A-Za-z_]\w*$/.test(p.id)) return [];
    const min = num(p.min, 0), max = num(p.max, Math.max(min + 1, num(p.value, 1) * 2)), value = Math.min(max, Math.max(min, num(p.value, min)));
    return [{ id: p.id, label: text(p.label, p.id), min, max: max > min ? max : min + 1, value, step: num(p.step, (max - min) / 100) || 1, unit: typeof p.unit === "string" ? p.unit.slice(0, 8) : undefined }];
  });
  const ids = params.map((p) => p.id);
  const labels: string[] | undefined = Array.isArray(j.labels) ? j.labels.slice(0, 60).map((l: unknown) => String(l).slice(0, 30)) : undefined;
  const xs = j.x && typeof j.x === "object" ? j.x : {};
  const x = { label: text(xs.label ?? j.xLabel, "x"), min: num(xs.min, 0), max: num(xs.max, labels ? labels.length - 1 : 10), step: num(xs.step, 1) };
  if (!(x.max > x.min) && type !== "pie" && !labels) return "x.max must be above x.min";
  if (x.step <= 0) x.step = 1;
  const series: ChartSeries[] = (Array.isArray(j.series) ? j.series : []).slice(0, 6).flatMap((s: any, k: number) => {
    if (!s || typeof s !== "object") return [];
    const name = text(s.name, `Series ${k + 1}`);
    if (typeof s.y === "string" && s.y.trim()) {
      const f = parseFormula(s.y, ["x", ...ids]);
      if (typeof f === "string") return [{ name, y: `!${f}` }];
      return [{ name, y: s.y.trim().slice(0, 200) }];
    }
    if (Array.isArray(s.data)) return [{ name, data: s.data.slice(0, 200).map((d: unknown) => num(d, NaN)) }];
    return [];
  });
  if (!series.length) return "it has no series: each needs a formula \"y\" or a list \"data\"";
  const bad = series.find((s) => s.y?.startsWith("!"));
  if (bad) return `the formula of "${bad.name}" cannot be read: ${bad.y!.slice(1)}`;
  if (type === "pie" && !series[0].data) return "a pie needs a list of numbers in series[0].data, and the names in labels";
  if (type === "bar" && !labels && series.every((s) => !s.data)) return "a bar chart needs labels and a list of numbers (or a formula of the label number x)";
  return { type, title: text(j.title), note: typeof j.note === "string" ? j.note.slice(0, 240) : undefined, x, yLabel: text(xs.yLabel ?? j.y?.label ?? j.yLabel), labels, params, series };
}

// ------------------------------------------------------------------ what to draw

export const PALETTE = ["#4f8ff7", "#f59e0b", "#34c58b", "#e5566b", "#a07af0", "#2cc5d9"];

export interface Pt { x: number; y: number }
export interface DrawnSeries { name: string; color: string; pts: Pt[] }
export interface ChartModel {
  spec: ChartSpec;
  values: Record<string, number>;
  series: DrawnSeries[];
  xMin: number; xMax: number; yMin: number; yMax: number;
  xTicks: { v: number; label: string }[];
  yTicks: { v: number; label: string }[];
  slices?: { name: string; value: number; share: number; color: string }[];
  problem?: string;
}

/** "Nice" tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, want = 5): number[] {
  if (!isFinite(lo) || !isFinite(hi)) return [0, 1];
  if (hi === lo) { hi = lo + 1; }
  const span = hi - lo, raw = span / Math.max(1, want);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
  return out;
}

/** A number as people read it on an axis: 12 500, 1,2 M, 0,05. */
export function fmt(v: number): string {
  if (!isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toPrecision(3)} G`;
  if (a >= 1e6) return `${+(v / 1e6).toPrecision(3)} M`;
  if (a >= 1e4) return Math.round(v).toLocaleString("fr-FR").replace(/ | /g, " ");
  if (a >= 100) return String(+v.toFixed(0));
  if (a >= 1) return String(+v.toFixed(2));
  return a === 0 ? "0" : String(+v.toPrecision(2));
}

export function chartModel(spec: ChartSpec, values: Record<string, number> = {}): ChartModel {
  const vals: Record<string, number> = {};
  for (const p of spec.params) vals[p.id] = values[p.id] ?? p.value;
  const names = ["x", ...spec.params.map((p) => p.id)];
  const empty = (problem: string): ChartModel => ({ spec, values: vals, series: [], xMin: 0, xMax: 1, yMin: 0, yMax: 1, xTicks: [], yTicks: [], problem });

  if (spec.type === "pie") {
    const data = spec.series[0].data ?? [];
    const total = data.reduce((n, d) => n + (isFinite(d) && d > 0 ? d : 0), 0);
    if (!total) return empty("the numbers of the pie add up to nothing");
    const slices = data.map((d, i) => ({ name: spec.labels?.[i] ?? `Part ${i + 1}`, value: isFinite(d) ? d : 0, share: (isFinite(d) && d > 0 ? d : 0) / total, color: PALETTE[i % PALETTE.length] }));
    return { ...empty(""), slices, problem: undefined };
  }

  const series: DrawnSeries[] = [];
  const bars = spec.type === "bar";
  const count = bars ? Math.max(spec.labels?.length ?? 0, ...spec.series.map((s) => s.data?.length ?? 0)) || 1 : 0;
  const xs: number[] = [];
  if (bars) for (let i = 0; i < count; i++) xs.push(i);
  else {
    const n = Math.min(MAX_POINTS, Math.floor((spec.x.max - spec.x.min) / spec.x.step + 1e-9) + 1);
    const step = n >= MAX_POINTS ? (spec.x.max - spec.x.min) / (MAX_POINTS - 1) : spec.x.step;
    for (let i = 0; i < n; i++) xs.push(+(spec.x.min + i * step).toPrecision(12));
    if (xs[xs.length - 1] < spec.x.max - 1e-9 && n < MAX_POINTS) xs.push(spec.x.max);
  }
  spec.series.forEach((s, k) => {
    const color = PALETTE[k % PALETTE.length];
    if (s.y) {
      const f = parseFormula(s.y, names);
      if (typeof f === "string") return;
      series.push({ name: s.name, color, pts: xs.map((x) => ({ x, y: f({ ...vals, x }) })) });
    } else if (s.data) series.push({ name: s.name, color, pts: xs.map((x, i) => ({ x, y: s.data![i] ?? NaN })) });
  });
  const ys = series.flatMap((s) => s.pts.map((p) => p.y)).filter((y) => isFinite(y));
  if (!ys.length) return empty("no formula gives a number for these values");
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (bars || spec.type === "area") { yMin = Math.min(0, yMin); yMax = Math.max(0, yMax); }
  if (yMax === yMin) { yMax = yMin + 1; }
  const pad = (yMax - yMin) * 0.06;
  const yTicks = niceTicks(yMin - (bars || yMin === 0 ? 0 : pad), yMax + pad, 5);
  // the last tick is at or above the highest value, so nothing is drawn above the grid
  if (yTicks.length > 1 && yTicks[yTicks.length - 1] < yMax) yTicks.push(+(yTicks[yTicks.length - 1] + (yTicks[1] - yTicks[0])).toPrecision(12));
  const lo = Math.min(yMin, yTicks[0]), hi = Math.max(yMax, yTicks[yTicks.length - 1]);
  const xTicks = bars
    ? xs.map((x) => ({ v: x, label: spec.labels?.[x] ?? String(x + 1) }))
    : niceTicks(xs[0], xs[xs.length - 1], 6).map((v) => ({ v, label: fmt(v) }));
  return { spec, values: vals, series, xMin: bars ? -0.5 : xs[0], xMax: bars ? count - 0.5 : xs[xs.length - 1], yMin: lo, yMax: hi, xTicks, yTicks: yTicks.map((v) => ({ v, label: fmt(v) })) };
}

/** The SVG path of one series in a drawing area, broken where a value is not a number. */
export function linePath(pts: Pt[], sx: (x: number) => number, sy: (y: number) => number): string {
  let d = "", pen = false;
  for (const p of pts) {
    if (!isFinite(p.y)) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** The spec a model should copy for a chart that reacts to its sliders: the app asks the model for exactly this. */
export const CHART_INSTRUCTIONS = [
  "To show a chart or a diagram of numbers, write a fenced block with the language chart and JSON inside; the app draws it, with a slider for each param and a read-out on hover. Prefer it to writing a web page.",
  'type: "line", "area", "bar" or "pie". A series has a "y" formula of x and of the param ids (+ - * / ^, brackets, sin cos exp ln sqrt abs min max, pi), or a "data" list of numbers.',
  'For bar and pie put the names in "labels" and the numbers in "data". Give every number the reader may want to change as a param: {"id","label","min","max","value","step"}.',
  'Example: ```chart\n{"type":"line","title":"Compound interest","x":{"label":"Years","min":0,"max":30,"step":1},"yLabel":"Euros","params":[{"id":"P","label":"Start","min":1000,"max":50000,"value":10000,"step":500},{"id":"r","label":"Rate (%)","min":0,"max":12,"value":5,"step":0.5}],"series":[{"name":"With interest","y":"P*(1+r/100)^x"},{"name":"Without","y":"P"}]}\n```',
  "Explain in words next to the chart. For a diagram that is not numbers (a flow, a schema) or a page with real behaviour, write an artifact instead."
].join("\n");
