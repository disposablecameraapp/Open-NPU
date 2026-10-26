/**
 * Small blocks a model writes as plain lines instead of code, and the app draws: figures (a row of big numbers), cards (flashcards to flip),
 * tables. Lines with "|" between the parts are what a small model writes without a slip, so there is no JSON to break.
 */

export interface Kpi { label: string; value: string; note?: string }
export interface Card { front: string; back: string }

const lines = (raw: string) => raw.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter((l) => l && !/^```/.test(l));
const cell = (s: string, max: number) => s.replace(/\*\*/g, "").trim().slice(0, max);

/** "Label | value | note" per line; "Label: value" is understood too. */
export function parseKpis(raw: string): Kpi[] {
  const out: Kpi[] = [];
  for (const l of lines(raw).slice(0, 12)) {
    const parts = l.includes("|") ? l.split("|").map((p) => p.trim()) : /^([^:]{1,40}):\s*(.+)$/.exec(l)?.slice(1, 3) ?? [];
    if (parts.length < 2 || !parts[0] || !parts[1]) continue;
    out.push({ label: cell(parts[0], 40), value: cell(parts[1], 24), note: parts[2] ? cell(parts.slice(2).join(" | "), 60) : undefined });
  }
  return out;
}

/** "Question | Answer" per line. */
export function parseCards(raw: string): Card[] {
  const out: Card[] = [];
  for (const l of lines(raw).slice(0, 40)) {
    const at = l.indexOf("|");
    const parts = at >= 0 ? [l.slice(0, at), l.slice(at + 1)] : /^(.+?\?)\s+(.+)$/.exec(l)?.slice(1, 3) ?? [];
    if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) continue;
    out.push({ front: cell(parts[0], 200), back: cell(parts[1], 400) });
  }
  return out;
}

// ------------------------------------------------------------------ quiz

export interface QuizQuestion { question: string; options: { text: string; right: boolean }[]; why?: string }

/**
 * A multiple-choice quiz: a line for the question, then "- wrong" and "+ right" lines, and "> why" for the explanation. A new question starts at a
 * line that is neither an option nor an explanation ("Q: ..." or "1. ..."), once the previous one has options.
 */
export function parseQuiz(raw: string): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  let cur: QuizQuestion | null = null;
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    const l = line.trim();
    if (!l || /^```/.test(l)) continue;
    const opt = /^(?:([-+*•])|\(?([a-dA-D])[.)])\s+(.+)$/.exec(l);
    const why = /^(?:>|(?:why|explanation|explication|pourquoi)\s*:)\s*(.+)$/i.exec(l);
    if (why && cur) { cur.why = cell(why[1], 300); continue; }
    if (opt && cur) {
      let text = opt[3].trim();
      let right = opt[1] === "+";
      const mark = /\s*(?:✓|✔|\(correct\)|\(correcte?\)|\(bonne r[ée]ponse\)|\(right\))\s*$/i.exec(text);
      if (mark) { right = true; text = text.slice(0, mark.index); }
      else if (/\s\*$/.test(text)) { right = true; text = text.replace(/\s\*$/, ""); }
      cur.options.push({ text: cell(text, 160), right });
      continue;
    }
    if (cur && cur.options.length === 0 && !opt) { cur.question = cell(`${cur.question} ${l}`, 300); continue; }
    if (cur && cur.options.length) out.push(cur);
    cur = { question: cell(l.replace(/^(?:q(?:uestion)?\s*\d*\s*[:.)]|\d+\s*[.)])\s*/i, ""), 300), options: [] };
  }
  if (cur && cur.options.length) out.push(cur);
  // a question with no marked answer has none to check: it is dropped rather than showing a wrong correction
  return out.filter((q) => q.options.length >= 2 && q.options.some((o) => o.right)).slice(0, 30);
}

// ------------------------------------------------------------------ checklist

export interface CheckItem { text: string; done: boolean }
/** "[ ] item" and "[x] item" per line (a leading dash is fine). */
export function parseChecklist(raw: string): CheckItem[] {
  const out: CheckItem[] = [];
  for (const l of raw.replace(/\r\n/g, "\n").split("\n")) {
    const box = /^\s*(?:[-*•]\s*)?\[([ xX✓✔])?\]\s*(.+)$/.exec(l);
    const plain = box ? null : /^\s*[-*•]\s+(.+)$/.exec(l);
    if (box) out.push({ done: /[xX✓✔]/.test(box[1] ?? ""), text: cell(box[2], 200) });
    else if (plain) out.push({ done: false, text: cell(plain[1], 200) });
  }
  return out.slice(0, 60);
}

// ------------------------------------------------------------------ sheet

export interface SheetCell { text: string; value?: number; formula?: boolean; error?: string }

const colName = (i: number) => String.fromCharCode(65 + i);
const refOf = (ref: string): [number, number] | null => { const m = /^([A-Z])(\d{1,3})$/.exec(ref.toUpperCase()); return m ? [m[1].charCodeAt(0) - 65, +m[2] - 1] : null; };

/** A number as a person types it in a cell: 1 200,50 € · 12 % · -3. */
export function cellNumber(t: string): number | null {
  const s = t.trim().replace(/[   ]/g, "").replace(/[€$£]/g, "");
  if (!/^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)%?$/.test(s)) return null;
  const n = parseFloat(s.replace(",", "."));
  return s.endsWith("%") ? n / 100 : n;
}

/** The grid worked out: a cell that starts with = is a formula of the other cells (B2*C2, SUM(D2:D6), AVG(A1:A9)); the others are text or numbers. */
export function evalSheet(rows: string[][], parse: (src: string, names: string[]) => ((v: Record<string, number>) => number) | string): SheetCell[][] {
  const memo = new Map<string, SheetCell>();
  const busy = new Set<string>();
  const cellAt = (c: number, r: number): SheetCell => {
    const key = `${c},${r}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const raw = rows[r]?.[c] ?? "";
    let out: SheetCell;
    if (!raw.trim().startsWith("=")) { const n = cellNumber(raw); out = { text: raw, value: n ?? undefined }; }
    else if (busy.has(key)) out = { text: "⚠", formula: true, error: "a cell that needs itself" };
    else {
      busy.add(key);
      // ranges become lists of cells, so SUM(A1:A3) is SUM(A1,A2,A3)
      const src = raw.trim().slice(1).replace(/\b([A-Za-z])(\d{1,3}):([A-Za-z])(\d{1,3})\b/g, (_m, a: string, i: string, b: string, j: string) => {
        const list: string[] = [];
        for (let cc = Math.min(a.toUpperCase().charCodeAt(0), b.toUpperCase().charCodeAt(0)); cc <= Math.max(a.toUpperCase().charCodeAt(0), b.toUpperCase().charCodeAt(0)); cc++)
          for (let rr = Math.min(+i, +j); rr <= Math.max(+i, +j); rr++) list.push(`${String.fromCharCode(cc)}${rr}`);
        return list.slice(0, 400).join(",");
      });
      const names = [...new Set([...src.matchAll(/\b[A-Za-z]\d{1,3}\b/g)].map((m) => m[0]))];
      const vars: Record<string, number> = {};
      let problem = "";
      for (const n of names) {
        const at = refOf(n);
        if (!at) continue;
        const dep = cellAt(at[0], at[1]);
        // text and empty cells count for nothing in a sum, as in a spreadsheet; a cell in error spreads its error
        if (dep.error) problem = dep.error;
        vars[n] = dep.value ?? 0;
      }
      const f = parse(src, names);
      if (typeof f === "string") out = { text: "⚠", formula: true, error: f };
      else if (problem) out = { text: "⚠", formula: true, error: problem };
      else { const v = f(vars); out = isFinite(v) ? { text: String(+v.toFixed(6)), value: v, formula: true } : { text: "⚠", formula: true, error: "this gives no number" }; }
      busy.delete(key);
    }
    memo.set(key, out);
    return out;
  };
  return rows.map((row, r) => row.map((_c, c) => cellAt(c, r)));
}

export const sheetColumn = colName;

/** Rows of a sheet block: one per line, cells between bars; a separator line of dashes is skipped. */
export function parseSheet(raw: string): string[][] {
  const rows = raw.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() && !/^\s*\|?\s*:?-{2,}[\s|:-]*$/.test(l) && !/^```/.test(l)).slice(0, 60)
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()).slice(0, 12));
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: width }, (_v, i) => r[i] ?? ""));
}

export const BLOCK_INSTRUCTIONS = [
  "Other things the app draws or runs, with no code: key figures, a quiz, flashcards, a checklist, a spreadsheet, tables and formulas.",
  "Key figures: a fenced block kpi, one figure per line: Label | value | small note (the note is optional). Example: ```kpi\nFinal amount | 16 289 € | after 10 years\nInterest | 6 289 €\n```",
  "Multiple-choice quiz (QCM): a fenced block quiz. A line for the question, then one line per option: - for a wrong one, + for the right one; a line starting with > explains the answer. Example: ```quiz\nQ: Capital of France?\n- Lyon\n+ Paris\n- Rome\n> Paris has been the capital since 987.\n```. The app marks the answers and gives the score.",
  "Flashcards to flip: a fenced block cards, one card per line: Question | Answer.",
  "Checklist the person can tick: a fenced block checklist, one item per line: [ ] item (or [x] when done).",
  "Spreadsheet that recalculates when a cell is edited: a fenced block sheet, one row per line, cells between |. A cell that starts with = is a formula: =B2*C2, =SUM(D2:D6), =AVG(A1:A9). The first line is row 1, the first column is A. Example: ```sheet\nItem | Price | Qty | Total\nCoffee | 3,5 | 4 | =B2*C2\nTea | 2,8 | 2 | =B3*C3\nTotal | | | =SUM(D2:D3)\n```",
  "Tables: a markdown table with a header row and a | --- | separator. Formulas: $...$ inline and $$...$$ on their own line, in LaTeX; the app typesets them."
].join("\n");
