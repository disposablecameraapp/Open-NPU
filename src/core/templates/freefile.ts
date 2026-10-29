import type { ChatEvent, ChatMessage, ChatStats } from "../../shared/types";
import type { BuildRun, BuildStage, BuildStep } from "../../shared/types";
import type { Session } from "../build";
import { withAnswer } from "../chat";
import { parseSheets } from "../sheet";
import { langOf } from "./kit";

/**
 * A spreadsheet or a Word document written freely, when no template fits or the plan of calculations did not hold: the model writes the table (or the Markdown) as text, the app makes the file
 * from it and shows it growing. It is a document, never a program: this is what keeps "make me an empty accounting journal for Excel" from becoming a web page.
 */
export interface FreeOptions { id: string; stream: Session; signal?: AbortSignal; modelOf?: () => string | undefined }
export type FreeResult = { handled: true; text: string; stats: ChatStats } | { handled: false };

const SHEET_RULES = [
  "You write one Excel file as text, nothing else. For each sheet: a line `## Sheet name`, then a Markdown table.",
  "The first table line is row 1 (the headers) and the first column is column A: never write column letters or row numbers as cells.",
  "Numbers are plain (1250, 0.2). A cell that starts with = is a formula (SUM, AVERAGE, MIN, MAX, IF, ROUND, SUMIF, COUNTIF, + - * /): never type a result that a formula can calculate. A formula may name a row by its label between square brackets, like =[Total costs]/[Quantity], or use addresses like =B2*C2.",
  "Write the headers and the labels in the language of the request. For an empty journal, register or template to fill in: real headers, a few empty rows, and the formulas that total or balance them already in place.",
  "Example of the form:\n## Budget\n| Item | Planned | Actual | Difference |\n|---|---|---|---|\n| Rent | 800 | 800 | =C2-B2 |\n| Food | 300 | | =C3-B3 |\n| Total | =SUM(B2:B3) | =SUM(C2:C3) | =C4-B4 |",
  "Reply with the sheet(s) only: no explanation, no code fence."
].join("\n");
const DOC_RULES = "You write one Word document as Markdown text, nothing else: a # title, ## headings, paragraphs, lists and tables. Write in the language of the request. Reply with the document only: no explanation, no code fence around it.";

/** What is the file in a reply: the think block and the fence around it are taken off, and for a sheet only its title lines and table lines are kept (a half-written last row is fine while it grows). */
export function fileText(reply: string, kind: "xlsx" | "docx"): string {
  const text = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").replace(/^\s*(?:```|~~~)[a-z]*\s*\n/i, "").replace(/\n\s*(?:```|~~~)\s*$/, "");
  if (kind === "docx") return text.trim();
  return text.split("\n").filter((l) => /^\s*#{1,3}\s+\S/.test(l) || l.includes("|")).join("\n").trim();
}

const titleOf = (source: string, kind: "xlsx" | "docx", lang: string): string => {
  const h = (kind === "docx" ? /^#\s+(.+)$/m : /^#{1,3}\s+(.+)$/m).exec(source)?.[1]?.replace(/[*_`]/g, "").trim();
  return (h || (kind === "xlsx" ? (lang === "fr" ? "Feuille" : "Sheet") : lang === "fr" ? "Document" : "Document")).slice(0, 80);
};

export async function* writeFreely(o: FreeOptions, request: string, kind: "xlsx" | "docx", add: (s: ChatStats) => void, total: ChatStats): AsyncGenerator<ChatEvent, FreeResult> {
  const lang = langOf(request);
  const stages: BuildStage[] = [];
  const steps: BuildStep[] = [{ file: kind === "xlsx" ? "Spreadsheet" : "Document", action: "new", job: "written from the request", status: "running", stages }];
  const g: BuildStage = { id: "write", label: "Write", status: "running", note: kind === "xlsx" ? "writing the table" : "writing the document", agent: "Writer", model: o.modelOf?.(), at: Date.now() };
  stages.push(g);
  let live = "";
  const run = (status: BuildRun["status"] = "running"): ChatEvent => ({ id: o.id, type: "build", build: { status, steps: steps.map((s) => ({ ...s, stages: s.stages?.map((x) => ({ ...x })) })), phase: status === "running" ? (kind === "xlsx" ? "Writing the sheet…" : "Writing the document…") : "", live: status === "running" && live ? live : undefined } });
  const artifactOf = (source: string) => `<artifact type="${kind}" title="${titleOf(source, kind, lang).replace(/"/g, "'")}">\n${source}\n</artifact>`;
  yield run();
  const msgs: ChatMessage[] = [{ role: "system", content: kind === "xlsx" ? SHEET_RULES : DOC_RULES }, { role: "user", content: request.slice(0, 9000) }];
  let reply = "", think = "", shownText = "", lastDraw = 0, lastThink = 0;
  try {
    // ":x:" in the session id: a short closed job, the model does not think first
    for await (const ev of o.stream(`${o.id}:x:free:${kind}`, msgs, true, "plan")) {
      if (ev.type === "done") add(ev.stats);
      if (ev.type === "thinking") { think += ev.text; if (!reply && Date.now() - lastThink > 400) { lastThink = Date.now(); live = think.slice(-900); yield run(); } continue; }
      if (ev.type !== "answer" && ev.type !== "retract") continue;
      reply = withAnswer(reply, ev);
      live = "";
      const now = Date.now();
      if (now - lastDraw < 250) continue;
      lastDraw = now;
      const part = fileText(reply, kind);
      if (part && part !== shownText && (kind === "docx" || parseSheets(part).length)) { shownText = part; yield { id: o.id, type: "replace", text: artifactOf(part) }; }
    }
  } catch (e) { if (o.signal?.aborted) throw e; }
  if (o.signal?.aborted) throw new Error("aborted");
  live = "";
  const source = fileText(reply, kind);
  const ok = kind === "docx" ? source.length > 20 : parseSheets(source).some((s) => s.rows.length >= 1 && s.rows.some((r) => r.length >= 2));
  if (!ok) {
    g.status = "skipped"; g.note = "no usable text came back";
    yield { id: o.id, type: "notice", text: "The file could not be written from the request." };
    yield run();
    if (shownText) yield { id: o.id, type: "replace", text: "" };
    return { handled: false };
  }
  g.status = "done"; g.sec = Math.round(((Date.now() - (g.at ?? Date.now())) / 1000) * 10) / 10; g.note = `${source.split("\n").length} lines`;
  steps[0].status = "done";
  yield run("done");
  const say = kind === "xlsx"
    ? (lang === "fr" ? "J'ai fait la feuille. Cliquez dans une case pour y écrire, ou sélectionnez des cases, une ligne ou une colonne pour me demander de les modifier." : "I made the sheet. Click a cell to write in it, or select cells, a row or a column to ask me to change them.")
    : (lang === "fr" ? "J'ai écrit le document. Cliquez sur un paragraphe pour le modifier, ou demandez-moi les changements." : "I wrote the document. Click a paragraph to change it, or ask me for changes.");
  const text = `${artifactOf(source)}\n\n${say}`;
  yield { id: o.id, type: "replace", text };
  return { handled: true, text, stats: total };
}
