import { useMemo, useState } from "react";
import { evalSheet, parseCards, parseChecklist, parseKpis, parseQuiz, parseSheet, sheetColumn } from "../core/blocks";
import { fmtFull, parseFormula } from "../core/chart";
import { sheetBlockSource } from "../core/office";
import { api } from "./api";

/** A row of key figures: a big number under its label. */
export function KpiBlock({ raw }: { raw: string }) {
  const items = useMemo(() => parseKpis(raw), [raw]);
  if (!items.length) return null;
  return (
    <div className="kpi-row">
      {items.map((k, i) => <div key={i} className="kpi"><span className="kpi-label">{k.label}</span><strong className="kpi-value">{k.value}</strong>{k.note && <span className="kpi-note">{k.note}</span>}</div>)}
    </div>
  );
}

/** Flashcards: click a card to turn it, the arrows to move on. */
export function CardsBlock({ raw }: { raw: string }) {
  const cards = useMemo(() => parseCards(raw), [raw]);
  const [at, setAt] = useState(0);
  const [back, setBack] = useState(false);
  if (!cards.length) return null;
  const i = Math.min(at, cards.length - 1), c = cards[i];
  const go = (d: number) => { setAt((n) => (n + d + cards.length) % cards.length); setBack(false); };
  return (
    <div className="cards-block">
      <button type="button" className={`flashcard ${back ? "back" : ""}`} onClick={() => setBack((b) => !b)} aria-label={back ? "Show the question" : "Show the answer"}>
        <span className="flashcard-side">{back ? "Answer" : "Question"}</span>
        <span className="flashcard-text">{back ? c.back : c.front}</span>
      </button>
      <div className="cards-nav">
        <button className="linkbtn" onClick={() => go(-1)} aria-label="Previous card">←</button>
        <span className="muted small">{i + 1} / {cards.length}</span>
        <button className="linkbtn" onClick={() => go(1)} aria-label="Next card">→</button>
      </div>
    </div>
  );
}

/** A multiple-choice quiz: pick an answer, see at once whether it is right and why, and a score at the end. */
export function QuizBlock({ raw }: { raw: string }) {
  const questions = useMemo(() => parseQuiz(raw), [raw]);
  const [picked, setPicked] = useState<Record<number, number>>({});
  if (!questions.length) return null;
  const done = Object.keys(picked).length;
  const score = questions.reduce((n, q, i) => n + (picked[i] !== undefined && q.options[picked[i]]?.right ? 1 : 0), 0);
  return (
    <div className="quiz-block">
      {questions.map((q, i) => {
        const chosen = picked[i];
        return (
          <div key={i} className="quiz-q">
            <div className="quiz-question"><span className="quiz-num">{i + 1}</span>{q.question}</div>
            <div className="quiz-options">
              {q.options.map((o, k) => {
                const state = chosen === undefined ? "" : o.right ? "right" : chosen === k ? "wrong" : "";
                return <button key={k} type="button" className={`quiz-option ${state}`} disabled={chosen !== undefined} onClick={() => setPicked((p) => ({ ...p, [i]: k }))}>{o.text}{state === "right" && <span aria-label="right"> ✓</span>}{state === "wrong" && <span aria-label="wrong"> ✗</span>}</button>;
              })}
            </div>
            {chosen !== undefined && q.why && <div className="quiz-why">{q.why}</div>}
          </div>
        );
      })}
      {done === questions.length && <div className="quiz-score"><strong>{score} / {questions.length}</strong><button className="linkbtn" onClick={() => setPicked({})}>Try again</button></div>}
    </div>
  );
}

/** A list to tick, with how far along it is. */
export function ChecklistBlock({ raw }: { raw: string }) {
  const items = useMemo(() => parseChecklist(raw), [raw]);
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  if (!items.length) return null;
  const on = (i: number) => ticked[i] ?? items[i].done;
  const count = items.filter((_it, i) => on(i)).length;
  return (
    <div className="check-block">
      <div className="check-bar"><span style={{ width: `${(count / items.length) * 100}%` }} /></div>
      {items.map((it, i) => <label key={i} className={`check-item ${on(i) ? "done" : ""}`}><input type="checkbox" checked={on(i)} onChange={(e) => setTicked((t) => ({ ...t, [i]: e.target.checked }))} /><span>{it.text}</span></label>)}
      <span className="muted small">{count} / {items.length}</span>
    </div>
  );
}

/** A spreadsheet: the cells that are not formulas can be edited, and the formulas follow. */
export function SheetBlock({ raw }: { raw: string }) {
  const rows = useMemo(() => parseSheet(raw), [raw]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  if (!rows.length) return null;
  const grid = rows.map((r, i) => r.map((c, j) => edits[`${j},${i}`] ?? c));
  const cells = evalSheet(grid, parseFormula);
  // the sheet as it stands (with the person's edits) is saved as an Excel file whose formulas stay formulas
  const saveXlsx = () => { void api().saveOffice("xlsx", sheetBlockSource(grid.map((r) => r.join(" | ")).join("\n")), "sheet"); };
  return (
    <div className="md-table sheet-block">
      <div className="chart-actions" style={{ justifyContent: "flex-end" }}><button className="linkbtn" onClick={saveXlsx} title="Saves this sheet as an Excel file, formulas included">Save as .xlsx</button></div>
      <table>
      <thead><tr><th className="sheet-corner" />{rows[0].map((_c, j) => <th key={j}>{sheetColumn(j)}</th>)}</tr></thead>
      <tbody>{cells.map((row, i) => (
        <tr key={i}><th className="sheet-row">{i + 1}</th>{row.map((c, j) => {
          const numeric = c.value !== undefined;
          return (
            <td key={j} className={c.error ? "sheet-error" : c.formula ? "sheet-formula" : ""} title={c.error ?? (c.formula ? grid[i][j] : undefined)}>
              {c.formula
                ? (c.error ? "⚠" : fmtFull(c.value ?? NaN))
                : <input className={numeric ? "num" : ""} value={grid[i][j]} onChange={(e) => setEdits((m) => ({ ...m, [`${j},${i}`]: e.target.value }))} aria-label={`${sheetColumn(j)}${i + 1}`} size={Math.max(4, Math.min(24, grid[i][j].length + 1))} />}
            </td>
          );
        })}</tr>
      ))}</tbody>
    </table></div>
  );
}

