// Spreadsheet side of Office files: cell addresses, the text form of a sheet (a table whose first line is row 1)
// and a formula evaluator, so the assistant can see the RESULT of a calculation and not only the formula.

export interface Sheet { name: string; rows: string[][] }
export type Value = number | string | boolean | null | SheetError;
export class SheetError { constructor(public code: string) {} toString() { return this.code; } }

export function colName(i: number): string { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }
export function colIndex(s: string): number { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
export const addr = (row: number, col: number) => `${colName(col)}${row + 1}`;
export function parseAddr(a: string): { row: number; col: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(a.trim());
  return m ? { row: Number(m[2]) - 1, col: colIndex(m[1]) } : null;
}

const NUM = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
export const isNumeric = (s: string) => NUM.test(s.trim());
export const isFormula = (s: string) => s.startsWith("=") && s.length > 1;

// ---------------------------------------------------------------- text form

const escCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const splitRow = (line: string): string[] => {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\\" && t[i + 1] === "|") { cur += "|"; i++; } else if (t[i] === "|") { out.push(cur.trim()); cur = ""; } else cur += t[i];
  }
  out.push(cur.trim());
  return out;
};

/** A number as people type it ("1 200,50 €", "3,5", "1,234.5") in the plain form a formula reads; any other text is left as it is. A percentage stays as written. */
export function plainNumber(cell: string): string {
  const s = cell.trim().replace(/[€$£]\s*$|^[€$£]\s*/g, "").replace(/[\u00a0\u202f ](?=\d{3}\b)/g, "");
  if (s === cell.trim() && !/,/.test(s)) return cell;
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return s.replace(/,/g, "");
  if (/^[-+]?\d+,\d+$/.test(s)) return s.replace(",", ".");
  return /^[-+]?\d+(\.\d+)?$/.test(s) && s !== cell.trim() ? s : cell;
}

/** "## Name" then a table; the first table line is row 1 and the first column is A. Without any "##", one sheet. */
export function parseSheets(src: string): Sheet[] {
  const sheets: Sheet[] = [];
  let cur: Sheet | null = null;
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const h = /^#{1,3}\s+(.+?)\s*$/.exec(raw);
    if (h) { cur = { name: h[1].replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || `Sheet${sheets.length + 1}`, rows: [] }; sheets.push(cur); continue; }
    if (!raw.includes("|")) continue;
    const cells = splitRow(raw).map(plainNumber);
    if (cells.length && cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // the markdown separator line
    if (!cur) { cur = { name: "Sheet1", rows: [] }; sheets.push(cur); }
    cur.rows.push(cells);
  }
  return sheets.filter((s) => s.rows.length);
}

export function sheetsText(sheets: Sheet[]): string {
  return sheets.map((s) => {
    const width = Math.max(1, ...s.rows.map((r) => r.length));
    const lines = s.rows.map((r) => `| ${Array.from({ length: width }, (_, i) => escCell(r[i] ?? "")).join(" | ")} |`);
    lines.splice(1, 0, `|${Array(width).fill("---").join("|")}|`);
    return `## ${s.name}\n${lines.join("\n")}`;
  }).join("\n\n");
}

// ---------------------------------------------------------------- formulas

type Tok = { t: "num" | "str" | "ref" | "name" | "op"; v: string };

function tokenize(f: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|"((?:[^"]|"")*)"|((?:'[^']+'|[A-Za-z_][\w.]*)!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)(?![\w(])|([A-Za-z_][\w.]*)|(<>|<=|>=|[-+*/^&=<>(),%:]))/gy;
  let m: RegExpExecArray | null;
  let at = 0;
  while (at < f.length && (m = re.exec(f))) {
    at = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: "num", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "str", v: m[2].replace(/""/g, '"') });
    else if (m[4] !== undefined) out.push({ t: "ref", v: `${m[3] ? m[3].slice(0, -1).replace(/^'|'$/g, "") : ""}!${m[4].replace(/\$/g, "")}` });
    else if (m[5] !== undefined) out.push({ t: "name", v: m[5] });
    else out.push({ t: "op", v: m[6] });
  }
  if (f.slice(at).trim()) throw new SheetError("#NAME?");
  return out;
}

const num = (v: Value): number => {
  if (v instanceof SheetError) throw v;
  if (v === null || v === "") return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (isNumeric(v)) return Number(v);
  throw new SheetError("#VALUE!");
};
const str = (v: Value): string => (v instanceof SheetError ? (() => { throw v; })() : v === null ? "" : typeof v === "number" ? String(round(v)) : String(v));
const round = (n: number) => Math.round(n * 1e10) / 1e10;
const truthy = (v: Value) => (typeof v === "string" ? v.toUpperCase() === "TRUE" : !!num(v));

/** Evaluates one formula against a workbook. Cycles and unknown names give Excel's own error codes. */
export class Workbook {
  private cache = new Map<string, Value>();
  private busy = new Set<string>();
  constructor(public sheets: Sheet[]) {}

  sheet(name: string): Sheet | undefined { return name ? this.sheets.find((s) => s.name.toLowerCase() === name.toLowerCase()) : this.sheets[0]; }

  /** The value of one cell: a number, text or an error. Formulas are calculated. */
  cell(sheetName: string, row: number, col: number): Value {
    const s = this.sheet(sheetName);
    if (!s) return new SheetError("#REF!");
    const raw = s.rows[row]?.[col] ?? "";
    if (!isFormula(raw)) return raw === "" ? null : isNumeric(raw) ? Number(raw) : /^(true|false)$/i.test(raw) ? raw.toLowerCase() === "true" : raw;
    const key = `${s.name}!${row},${col}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    if (this.busy.has(key)) return new SheetError("#CIRC!");
    this.busy.add(key);
    let v: Value;
    try { v = this.run(raw.slice(1), s.name); } catch (e) { v = e instanceof SheetError ? e : new SheetError("#VALUE!"); }
    this.busy.delete(key);
    this.cache.set(key, v);
    return v;
  }

  /** Text of a value as the sheet would show it. */
  show(v: Value): string { return v instanceof SheetError ? v.code : v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : typeof v === "number" ? String(round(v)) : v; }

  /** One formula (without the =) as a value; an error becomes its Excel code. */
  formula(f: string, home: string): Value { try { return this.run(f, home); } catch (e) { return e instanceof SheetError ? e : new SheetError("#VALUE!"); } }

  private run(f: string, home: string): Value {
    const toks = tokenize(f);
    let i = 0;
    const peek = () => toks[i];
    const eat = (v?: string) => { const t = toks[i]; if (v && t?.v !== v) throw new SheetError("#NAME?"); i++; return t; };
    const range = (ref: string): Value[][] => {
      const [sn, r] = ref.split("!");
      const [a, b] = r.split(":");
      const p = parseAddr(a), q = parseAddr(b ?? a);
      if (!p || !q) throw new SheetError("#REF!");
      const rows: Value[][] = [];
      for (let y = Math.min(p.row, q.row); y <= Math.max(p.row, q.row); y++) {
        const line: Value[] = [];
        for (let x = Math.min(p.col, q.col); x <= Math.max(p.col, q.col); x++) line.push(this.cell(sn || home, y, x));
        rows.push(line);
      }
      return rows;
    };
    const flat = (args: (Value | Value[][])[]): Value[] => args.flatMap((a) => (Array.isArray(a) ? a.flat() : [a]));
    const nums = (args: (Value | Value[][])[]) => flat(args).filter((v) => { if (v instanceof SheetError) throw v; return typeof v === "number"; }) as number[];
    const crit = (c: Value): ((v: Value) => boolean) => {
      const s = str(c);
      const m = /^(<>|<=|>=|=|<|>)?(.*)$/.exec(s)!;
      const op = m[1] ?? "=", rhs = m[2];
      return (v) => {
        const nv = typeof v === "number" ? v : v !== null && isNumeric(String(v)) ? Number(v) : null;
        if (isNumeric(rhs) && nv !== null) { const r = Number(rhs); return op === "=" ? nv === r : op === "<>" ? nv !== r : op === "<" ? nv < r : op === ">" ? nv > r : op === "<=" ? nv <= r : nv >= r; }
        const a = this.show(v).toLowerCase(), b = rhs.toLowerCase();
        return op === "<>" ? a !== b : op === "=" ? a === b : false;
      };
    };
    const call = (name: string, args: (Value | Value[][])[]): Value => {
      const n = name.toUpperCase();
      const one = (k: number) => { const a = args[k]; return Array.isArray(a) ? a[0]?.[0] ?? null : a ?? null; };
      switch (n) {
        case "SUM": return nums(args).reduce((a, b) => a + b, 0);
        case "AVERAGE": case "AVG": { const v = nums(args); if (!v.length) throw new SheetError("#DIV/0!"); return v.reduce((a, b) => a + b, 0) / v.length; }
        case "MIN": { const v = nums(args); return v.length ? Math.min(...v) : 0; }
        case "MAX": { const v = nums(args); return v.length ? Math.max(...v) : 0; }
        case "COUNT": return nums(args).length;
        case "COUNTA": return flat(args).filter((v) => v !== null && v !== "").length;
        case "ROUND": return Math.round(num(one(0)) * 10 ** num(one(1) ?? 0)) / 10 ** num(one(1) ?? 0);
        case "PMT": { const r = num(one(0)), n = num(one(1)), pv = num(one(2)); if (!n) throw new SheetError("#NUM!"); return r === 0 ? -pv / n : (-pv * r) / (1 - (1 + r) ** -n); }
        case "SUMPRODUCT": { const cols = args.map((a) => flat([a])); const len = Math.min(...cols.map((c) => c.length)); let t = 0; for (let i = 0; i < len; i++) t += cols.reduce((m, c) => m * (typeof c[i] === "number" ? (c[i] as number) : 0), 1); return t; }
        case "ABS": return Math.abs(num(one(0)));
        case "SQRT": { const x = num(one(0)); if (x < 0) throw new SheetError("#NUM!"); return Math.sqrt(x); }
        case "POWER": return num(one(0)) ** num(one(1));
        case "MOD": { const d = num(one(1)); if (!d) throw new SheetError("#DIV/0!"); return ((num(one(0)) % d) + d) % d; }
        case "IF": return truthy(one(0)) ? (args.length > 1 ? one(1) : true) : args.length > 2 ? one(2) : false;
        case "IFERROR": return one(0) instanceof SheetError ? one(1) : one(0);
        case "AND": return flat(args).every(truthy);
        case "OR": return flat(args).some(truthy);
        case "NOT": return !truthy(one(0));
        case "LEN": return str(one(0)).length;
        case "UPPER": return str(one(0)).toUpperCase();
        case "LOWER": return str(one(0)).toLowerCase();
        case "CONCATENATE": case "CONCAT": return flat(args).map(str).join("");
        case "COUNTIF": { const t = crit(one(1)); return flat([args[0]]).filter(t).length; }
        case "SUMIF": { const t = crit(one(1)); const a = flat([args[0]]), b = args[2] ? flat([args[2]]) : a; return a.reduce<number>((s, v, k) => s + (t(v) && typeof b[k] === "number" ? (b[k] as number) : 0), 0); }
        default: throw new SheetError("#NAME?");
      }
    };
    // precedence, loosest first: comparison, &, + -, * /, ^, unary and %
    const expr = (): Value | Value[][] => {
      let l = concat();
      while (peek() && ["=", "<>", "<", ">", "<=", ">="].includes(peek().v) && peek().t === "op") {
        const op = eat().v; const r = concat();
        let a = scalar(l), b = scalar(r);
        // an empty cell is 0 beside a number, as in a spreadsheet
        if (a === null && typeof b === "number") a = 0; else if (b === null && typeof a === "number") b = 0;
        const x = typeof a === "number" && typeof b === "number" ? a : this.show(a).toLowerCase(), y = typeof a === "number" && typeof b === "number" ? b : this.show(b).toLowerCase();
        l = op === "=" ? x === y : op === "<>" ? x !== y : op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y;
      }
      return l;
    };
    const scalar = (v: Value | Value[][]): Value => { const s = Array.isArray(v) ? v[0]?.[0] ?? null : v; if (s instanceof SheetError) throw s; return s; };
    const concat = (): Value | Value[][] => { let l = add(); while (peek()?.v === "&" && peek().t === "op") { eat(); l = str(scalar(l)) + str(scalar(add())); } return l; };
    const add = (): Value | Value[][] => {
      let l = mul();
      while (peek() && (peek().v === "+" || peek().v === "-") && peek().t === "op") { const op = eat().v; const r = mul(); l = op === "+" ? num(scalar(l)) + num(scalar(r)) : num(scalar(l)) - num(scalar(r)); }
      return l;
    };
    const mul = (): Value | Value[][] => {
      let l = pow();
      while (peek() && (peek().v === "*" || peek().v === "/") && peek().t === "op") {
        const op = eat().v; const r = num(scalar(pow()));
        if (op === "/" && r === 0) throw new SheetError("#DIV/0!");
        l = op === "*" ? num(scalar(l)) * r : num(scalar(l)) / r;
      }
      return l;
    };
    const pow = (): Value | Value[][] => { let l = unary(); while (peek()?.v === "^" && peek().t === "op") { eat(); l = num(scalar(l)) ** num(scalar(unary())); } return l; };
    const unary = (): Value | Value[][] => {
      if (peek()?.t === "op" && (peek().v === "-" || peek().v === "+")) { const neg = eat().v === "-"; const v = num(scalar(unary())); return neg ? -v : v; }
      let v = primary();
      while (peek()?.v === "%" && peek().t === "op") { eat(); v = num(scalar(v)) / 100; }
      return v;
    };
    const primary = (): Value | Value[][] => {
      const t = eat();
      if (!t) throw new SheetError("#VALUE!");
      if (t.t === "num") return Number(t.v);
      if (t.t === "str") return t.v;
      if (t.t === "ref") { const r = range(t.v); return t.v.includes(":") ? r : r[0][0]; }
      if (t.t === "name") {
        if (/^(true|false)$/i.test(t.v) && peek()?.v !== "(") return t.v.toLowerCase() === "true";
        eat("(");
        const args: (Value | Value[][])[] = [];
        // IF and IFERROR do not fail for what they do not use: an argument that errors is a value they can look at, as in a spreadsheet
        const lazy = /^(IF|IFERROR)$/i.test(t.v);
        const arg = (): Value | Value[][] => { if (!lazy) return expr(); try { return expr(); } catch (e) { if (e instanceof SheetError) return e; throw e; } };
        if (peek()?.v !== ")") for (;;) { args.push(arg()); if (peek()?.v === ",") { eat(); continue; } break; }
        eat(")");
        return call(t.v, args);
      }
      if (t.v === "(") { const v = expr(); eat(")"); return v; }
      throw new SheetError("#VALUE!");
    };
    const out = expr();
    if (i < toks.length) throw new SheetError("#NAME?");
    const v = scalar(out);
    return typeof v === "number" && !Number.isFinite(v) ? new SheetError("#NUM!") : v;
  }
}

/** Every formula cell with its calculated result, "D2 = 1250" per line, for the model to read. */
export function formulaResults(sheets: Sheet[], limit = 400): string {
  const wb = new Workbook(sheets);
  const lines: string[] = [];
  for (const s of sheets) s.rows.forEach((r, y) => r.forEach((c, x) => { if (isFormula(c) && lines.length < limit) lines.push(`${sheets.length > 1 ? `${s.name}!` : ""}${addr(y, x)} ${c} = ${wb.show(wb.cell(s.name, y, x)) || "(empty)"}`); }));
  return lines.join("\n");
}
