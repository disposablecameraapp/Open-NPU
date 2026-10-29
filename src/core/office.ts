// Word, Excel and PowerPoint files, in both directions, through ONE plain-text form per kind that a model writes well:
//   docx  markdown (# headings, - bullets, 1. numbers, | tables |, **bold**, *italic*, a line --- is a page break)
//   pptx  slides separated by a line ---; "# title", "- bullets", plain lines, a | table |, "Notes:" for the speaker
//   xlsx  "## Sheet" then a | table | whose first line is row 1 and first column is A; a cell starting with = is a formula
// The model reads and edits that text (the usual <edit> blocks work on it) and the app turns it into the real file;
// a real file the user attaches is turned into the same text. Formulas are calculated here, so results can be read.
import { readZip, writeZip, toBytes, fromBytes, type ZipFiles } from "./zip";
import { parseXml, elems, first, all, textOf, esc, escText, type XNode } from "./xml";
import { Workbook, addr, colName, formulaResults, isFormula, isNumeric, parseAddr, parseSheets, sheetsText, type Sheet } from "./sheet";
import * as P from "./officeParts";
import { buildPptx as buildDeck, deckHtml, plain, type Pics } from "./slides";
import { figureKey } from "./figures";
import { cellNumber, evalSheet, parseCards, parseChecklist, parseKpis, parseQuiz, parseSheet } from "./blocks";
import { parseFormula } from "./chart";
export { slidesOf, type Slide } from "./slides";

export type OfficeKind = "docx" | "xlsx" | "pptx";
export const OFFICE_KINDS: OfficeKind[] = ["docx", "xlsx", "pptx"];
export const MAX_OFFICE_BYTES = 30 * 1024 ** 2;
export const officeKindOf = (name: string): OfficeKind | null => {
  const m = /\.(docx|xlsx|pptx|docm|xlsm|pptm)$/i.exec(name);
  return m ? (m[1].toLowerCase().slice(0, 4) as OfficeKind) : null;
};
export const OFFICE_LABEL: Record<OfficeKind, string> = { docx: "Word document", xlsx: "Excel workbook", pptx: "PowerPoint presentation" };
export const OFFICE_MIME: Record<OfficeKind, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

// ---------------------------------------------------------------- inline formatting

interface Run { t: string; b?: boolean; i?: boolean }
export function runsOf(text: string): Run[] {
  const out: Run[] = [];
  const re = /\*\*(.+?)\*\*|(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])|__(.+?)__|`([^`]+)`/g;
  let at = 0;
  for (let m; (m = re.exec(text)); ) {
    if (m.index > at) out.push({ t: text.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ t: m[1], b: true });
    else if (m[2] !== undefined) out.push({ t: m[2], i: true });
    else if (m[3] !== undefined) out.push({ t: m[3], b: true });
    else out.push({ t: m[4] });
    at = re.lastIndex;
  }
  if (at < text.length) out.push({ t: text.slice(at) });
  return out.length ? out : [{ t: "" }];
}

const splitCells = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
const isRule = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
const cleanKey = (s: string) => s.replace(/ /g, " ");

type Block =
  | { t: "figure"; key: string; alt: string }
  | { t: "code"; text: string }
  | { t: "h"; n: number; text: string }
  | { t: "p"; text: string }
  | { t: "li"; text: string; level: number; num: boolean; list: number }
  | { t: "table"; rows: string[][] }
  | { t: "break" };

const cellMd = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const tableMd = (rows: string[][]) => (rows.length ? [`| ${rows[0].map(cellMd).join(" | ")} |`, `|${rows[0].map(() => "---").join("|")}|`, ...rows.slice(1).map((r) => `| ${r.map(cellMd).join(" | ")} |`)].join("\n") : "");

/** What the app draws from a fenced block (key figures, flashcards, a quiz, a checklist, a sheet) as the plain markdown a Word file can hold; diagrams and charts are left for the window to draw as pictures. */
export function blockToMarkdown(lang: string, raw: string): string | null {
  switch (lang.toLowerCase()) {
    case "kpi": case "figures": { const k = parseKpis(raw); return k.length ? tableMd([["Figure", "Value", "Note"], ...k.map((x) => [x.label, x.value, x.note ?? ""])]) : null; }
    case "cards": case "flashcards": { const c = parseCards(raw); return c.length ? tableMd([["Question", "Answer"], ...c.map((x) => [x.front, x.back])]) : null; }
    case "checklist": case "todo": { const c = parseChecklist(raw); return c.length ? c.map((x) => `- ${x.done ? "\u2611" : "\u2610"} ${x.text}`).join("\n") : null; }
    case "quiz": case "qcm": case "mcq": {
      const q = parseQuiz(raw);
      return q.length ? q.map((x, i) => `**${i + 1}. ${x.question}**\n\n${x.options.map((o) => `- ${o.text}${o.right ? " \u2713" : ""}`).join("\n")}${x.why ? `\n\n*${x.why}*` : ""}`).join("\n\n") : null;
    }
    case "sheet": case "spreadsheet": {
      const rows = parseSheet(raw);
      if (!rows.length) return null;
      const shown = evalSheet(rows, parseFormula);
      return tableMd(shown.map((r) => r.map((c) => c.text)));
    }
    default: return null;
  }
}

function blocksOf(src: string): Block[] {
  const out: Block[] = [];
  const text0 = cleanKey(src).replace(/\r/g, "").replace(/```([\w-]*)[ \t]*\n([\s\S]*?)```/g, (m, lang: string, body: string) => (/^(mermaid|diagram|chart)$/i.test(lang) ? m : blockToMarkdown(lang, body) !== null ? `\n${blockToMarkdown(lang, body)}\n` : m));
  const lines = text0.split("\n");
  let list = 0, lastWasList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { if (lastWasList) { /* a blank line inside a list keeps it */ } continue; }
    let m: RegExpExecArray | null;
    if ((m = /^\s*```([\w-]*)\s*$/.exec(line))) {
      const body: string[] = [];
      while (++i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i]);
      const lang = m[1].toLowerCase();
      if (lang === "mermaid" || lang === "diagram" || lang === "chart") out.push({ t: "figure", key: figureKey(lang === "chart" ? "chart" : "mermaid", body.join("\n")), alt: lang === "chart" ? "Chart" : "Diagram" });
      else if (body.some((l) => l.trim())) out.push({ t: "code", text: body.join("\n") });
      lastWasList = false;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) || /^\s*<pagebreak\s*\/?>\s*$/i.test(line)) { out.push({ t: "break" }); lastWasList = false; continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { out.push({ t: "h", n: m[1].length, text: m[2].trim() }); lastWasList = false; continue; }
    if (line.includes("|") && /^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { const c = splitCells(lines[i]); if (!isRule(c)) rows.push(c); i++; }
      i--;
      out.push({ t: "table", rows });
      lastWasList = false;
      continue;
    }
    if ((m = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/.exec(line))) {
      const num = /\d/.test(m[2]);
      if (!lastWasList || (num && out[out.length - 1]?.t === "li" && !(out[out.length - 1] as { num: boolean }).num)) list++;
      out.push({ t: "li", text: m[3].trim(), level: Math.min(2, Math.floor(m[1].replace(/\t/g, "  ").length / 2)), num, list });
      lastWasList = true;
      continue;
    }
    // soft-wrapped lines of one paragraph are joined
    let text = line.trim();
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*(#{1,6}\s|[-*+•]\s|\d+[.)]\s|\||-{3,}\s*$)/.test(lines[i + 1])) text += ` ${lines[++i].trim()}`;
    out.push({ t: "p", text });
    lastWasList = false;
  }
  return out;
}

// ---------------------------------------------------------------- docx: text -> file

const wRuns = (text: string, extra = "") => runsOf(text).filter((r) => r.t).map((r) => `<w:r><w:rPr>${r.b ? "<w:b/>" : ""}${r.i ? "<w:i/>" : ""}${extra}</w:rPr><w:t xml:space="preserve">${escText(r.t)}</w:t></w:r>`).join("");

export async function buildDocx(src: string, pics: Pics = {}): Promise<Uint8Array> {
  const blocks = blocksOf(src);
  const listIds = new Map<number, number>();
  const media: ZipFiles = {};
  const mediaRels: { id: string; type: string; target: string }[] = [];
  let body = "";
  for (const b of blocks) {
    if (b.t === "figure") {
      const pic = pics[b.key];
      if (!pic?.bytes || pic.mime !== "image/png") { body += `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${wRuns(`*(${b.alt.toLowerCase()} not drawn)*`)}</w:p>`; continue; }
      const id = `rId${mediaRels.length + 3}`, name = `figure${mediaRels.length + 1}.png`;
      media[`word/media/${name}`] = pic.bytes;
      mediaRels.push({ id, type: "image", target: `media/${name}` });
      // drawn at twice the pixels for sharpness: half of them at 96 dpi, never wider than the text
      const wide = Math.min(5943600, Math.round((pic.w / 2) * 9525)), high = Math.round(wide * (pic.h / pic.w));
      body += `<w:p><w:pPr><w:keepNext/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${wide}" cy="${high}"/><wp:docPr id="${mediaRels.length}" name="${b.alt} ${mediaRels.length}" descr="${b.alt}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${mediaRels.length}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wide}" cy="${high}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    } else if (b.t === "code") {
      body += b.text.split("\n").map((l) => `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/></w:rPr><w:t xml:space="preserve">${escText(l)}</w:t></w:r></w:p>`).join("") + "<w:p/>";
    } else if (b.t === "h") body += `<w:p><w:pPr><w:pStyle w:val="Heading${b.n}"/></w:pPr>${wRuns(b.text)}</w:p>`;
    else if (b.t === "p") body += `<w:p>${wRuns(b.text)}</w:p>`;
    else if (b.t === "break") body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    else if (b.t === "li") {
      if (b.num && !listIds.has(b.list)) listIds.set(b.list, listIds.size + 2);
      body += `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${b.level}"/><w:numId w:val="${b.num ? listIds.get(b.list) : 1}"/></w:numPr></w:pPr>${wRuns(b.text)}</w:p>`;
    } else {
      const cols = Math.max(1, ...b.rows.map((r) => r.length));
      const w = Math.floor(9360 / cols);
      body += `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${Array(cols).fill(`<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`
        + b.rows.map((r, y) => `<w:tr>${y === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${Array.from({ length: cols }, (_, x) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${y === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : ""}</w:tcPr><w:p>${wRuns(r[x] ?? "", y === 0 ? "<w:b/>" : "")}</w:p></w:tc>`).join("")}</w:tr>`).join("")
        + "</w:tbl><w:p/>";
    }
  }
  if (!body) body = "<w:p/>";
  const document = `${P.XML_HEAD}<w:document ${P.NS_W} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1273" w:bottom="1440" w:left="1273" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files: ZipFiles = {
    "[Content_Types].xml": toBytes(P.contentTypes(mediaRels.length ? [...P.DEFAULT_TYPES, ["png", "image/png"]] : P.DEFAULT_TYPES, [
      ["/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"],
      ["/word/styles.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"],
      ["/word/numbering.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"]
    ])),
    "_rels/.rels": toBytes(P.rels([{ id: "rId1", type: "officeDocument", target: "word/document.xml" }])),
    "word/_rels/document.xml.rels": toBytes(P.rels([{ id: "rId1", type: "styles", target: "styles.xml" }, { id: "rId2", type: "numbering", target: "numbering.xml" }, ...mediaRels])),
    "word/document.xml": toBytes(document),
    "word/styles.xml": toBytes(P.WORD_STYLES),
    "word/numbering.xml": toBytes(P.wordNumbering(listIds.size)),
    ...media
  };
  return writeZip(files);
}

// ---------------------------------------------------------------- docx: file -> text

const tagged = (n: XNode, name: string) => first(n, name);
const flagOn = (n: XNode | undefined) => !!n && !["0", "false", "off"].includes(n.attrs["w:val"] ?? "1");

function wordRuns(p: XNode): Run[] {
  const runs: Run[] = [];
  const walk = (n: XNode) => {
    for (const k of elems(n)) {
      if (k.name === "w:r") {
        const rPr = tagged(k, "w:rPr");
        let t = "";
        for (const c of elems(k)) { if (c.name === "w:t") t += textOf(c); else if (c.name === "w:tab") t += "\t"; else if (c.name === "w:br" || c.name === "w:cr") t += " "; }
        if (t) runs.push({ t, b: flagOn(rPr && tagged(rPr, "w:b")), i: flagOn(rPr && tagged(rPr, "w:i")) });
      } else if (["w:hyperlink", "w:ins", "w:smartTag", "w:sdt", "w:sdtContent", "w:fldSimple"].includes(k.name)) walk(k);
    }
  };
  walk(p);
  return runs;
}

/** Runs back to markdown; neighbours with the same look are merged and spaces stay outside the stars. */
function markdownOf(runs: Run[]): string {
  const merged: Run[] = [];
  for (const r of runs) { const l = merged[merged.length - 1]; if (l && !!l.b === !!r.b && !!l.i === !!r.i) l.t += r.t; else merged.push({ ...r }); }
  return merged.map((r) => {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.t)!;
    if (!m[2]) return r.t;
    const mark = `${r.b ? "**" : ""}${r.i ? "*" : ""}`;
    const close = `${r.i ? "*" : ""}${r.b ? "**" : ""}`;
    return `${m[1]}${mark}${m[2].replace(/\*/g, "\\*")}${close}${m[3]}`;
  }).join("").trim();
}

export async function readDocx(files: ZipFiles): Promise<string> {
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("This Word file has no document part.");
  const styleNames = new Map<string, string>();
  if (files["word/styles.xml"]) for (const s of all(parseXml(fromBytes(files["word/styles.xml"])), "w:style")) styleNames.set(s.attrs["w:styleId"], (first(s, "w:name")?.attrs["w:val"] ?? "").toLowerCase());
  const bullet = new Map<string, boolean>(); // numId -> bullets (true) or numbers
  if (files["word/numbering.xml"]) {
    const nx = parseXml(fromBytes(files["word/numbering.xml"]));
    const abs = new Map<string, boolean>();
    for (const a of all(nx, "w:abstractNum")) abs.set(a.attrs["w:abstractNumId"], first(first(a, "w:lvl") ?? a, "w:numFmt")?.attrs["w:val"] === "bullet");
    for (const n of all(nx, "w:num")) bullet.set(n.attrs["w:numId"], abs.get(first(n, "w:abstractNumId")?.attrs["w:val"] ?? "") ?? true);
  }
  const body = first(parseXml(fromBytes(doc)), "w:body");
  const out: string[] = [];
  const para = (p: XNode): string | null => {
    const text = markdownOf(wordRuns(p));
    const pPr = tagged(p, "w:pPr");
    const style = styleNames.get(tagged(pPr ?? p, "w:pStyle")?.attrs["w:val"] ?? "") ?? "";
    const hasBreak = all(p, "w:br").some((b) => b.attrs["w:type"] === "page");
    if (!text) return hasBreak ? "---" : null;
    const h = /^heading (\d)/.exec(style) ?? (style === "title" ? [0, "1"] : null);
    if (h) return `${"#".repeat(Math.min(6, Number(h[1])))} ${text}`;
    const numPr = pPr && tagged(pPr, "w:numPr");
    const numId = numPr && tagged(numPr, "w:numId")?.attrs["w:val"];
    if (numId && numId !== "0") return `${"  ".repeat(Math.min(2, Number(tagged(numPr, "w:ilvl")?.attrs["w:val"] ?? 0)))}${bullet.get(numId) === false ? "1." : "-"} ${text}`;
    if (/list (bullet|paragraph)/.test(style)) return `- ${text}`;
    if (/list number/.test(style)) return `1. ${text}`;
    return hasBreak ? `${text}\n\n---` : text;
  };
  const table = (t: XNode): string => {
    const rows = elems(t, "w:tr").map((tr) => elems(tr, "w:tc").map((tc) => elems(tc, "w:p").map((p) => markdownOf(wordRuns(p))).filter(Boolean).join(" ").replace(/\|/g, "\\|")));
    const width = Math.max(1, ...rows.map((r) => r.length));
    const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
    return rows.length ? [line(rows[0]), `|${Array(width).fill("---").join("|")}|`, ...rows.slice(1).map(line)].join("\n") : "";
  };
  const walk = (n: XNode) => {
    for (const k of elems(n)) {
      if (k.name === "w:p") { const s = para(k); if (s !== null) out.push(s); }
      else if (k.name === "w:tbl") { const s = table(k); if (s) out.push(s); }
      else if (k.name === "w:sdt") { const c = first(k, "w:sdtContent"); if (c) walk(c); }
    }
  };
  if (body) walk(body);
  // consecutive list lines stay together, everything else is separated by a blank line
  return out.reduce((s, line, i) => s + (i && /^\s*([-*]|\d+\.)\s/.test(line) && /^\s*([-*]|\d+\.)\s/.test(out[i - 1].split("\n").pop()!) ? "\n" : i ? "\n\n" : "") + line, "").trim();
}

// ---------------------------------------------------------------- xlsx: text -> file

/** A sheet block of the chat (rows between |, European numbers, AVG) as the text form of a workbook, ready for Excel. */
export function sheetBlockSource(raw: string, name = "Sheet1"): string {
  const rows = parseSheet(raw).map((r) => r.map((c) => (c.trim().startsWith("=") ? c.replace(/\bAVG\(/gi, "AVERAGE(") : cellNumber(c) !== null && !/%\s*$/.test(c) ? String(cellNumber(c)) : c)));
  return sheetsText([{ name, rows }]);
}

export async function buildXlsx(src: string): Promise<Uint8Array> {
  let n = 0;
  src = src.replace(/```(?:sheet|spreadsheet)[ \t]*\n([\s\S]*?)```/gi, (_m, raw: string) => `\n${sheetBlockSource(raw, `Sheet${++n}`)}\n`);
  const sheets = parseSheets(src);
  if (!sheets.length) sheets.push({ name: "Sheet1", rows: [[""]] });
  const wb = new Workbook(sheets);
  const sheetXml = (s: Sheet): string => {
    const width = Math.max(1, ...s.rows.map((r) => r.length));
    const header = s.rows.length > 1 && s.rows[0].every((c) => c && !isNumeric(c) && !isFormula(c));
    const widths = Array.from({ length: width }, (_, x) => Math.min(60, Math.max(8, ...s.rows.map((r) => ((isFormula(r[x] ?? "") ? wb.show(wb.cell(s.name, s.rows.indexOf(r), x)) : r[x] ?? "").length) + 2))));
    const rows = s.rows.map((r, y) => {
      const cells = Array.from({ length: width }, (_, x) => {
        const raw = r[x] ?? "";
        if (raw === "") return header && y === 0 ? `<c r="${addr(y, x)}" s="1"/>` : "";
        const st = header && y === 0 ? ' s="1"' : "";
        if (isFormula(raw)) {
          const v = wb.cell(s.name, y, x);
          const f = `<f>${escText(raw.slice(1))}</f>`;
          if (typeof v === "number") return `<c r="${addr(y, x)}"${st}>${f}<v>${v}</v></c>`;
          if (typeof v === "boolean") return `<c r="${addr(y, x)}"${st} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
          if (typeof v === "string") return `<c r="${addr(y, x)}"${st} t="str">${f}<v>${escText(v)}</v></c>`;
          if (v === null) return `<c r="${addr(y, x)}"${st}>${f}<v>0</v></c>`;
          return `<c r="${addr(y, x)}"${st} t="e">${f}<v>${esc(v.code)}</v></c>`;
        }
        if (isNumeric(raw)) return `<c r="${addr(y, x)}"${st}><v>${Number(raw)}</v></c>`;
        return `<c r="${addr(y, x)}"${st} t="inlineStr"><is><t xml:space="preserve">${escText(raw)}</t></is></c>`;
      }).join("");
      return `<row r="${y + 1}">${cells}</row>`;
    }).join("");
    return `${P.XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${P.REL}"><sheetViews><sheetView workbookViewId="0">${header ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ""}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${rows}</sheetData></worksheet>`;
  };
  const files: ZipFiles = {
    "[Content_Types].xml": toBytes(P.contentTypes(P.DEFAULT_TYPES, [
      ["/xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"],
      ["/xl/styles.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"],
      ...sheets.map((_, i): [string, string] => [`/xl/worksheets/sheet${i + 1}.xml`, "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"])
    ])),
    "_rels/.rels": toBytes(P.rels([{ id: "rId1", type: "officeDocument", target: "xl/workbook.xml" }])),
    "xl/workbook.xml": toBytes(`${P.XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${P.REL}"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    "xl/_rels/workbook.xml.rels": toBytes(P.rels([...sheets.map((_, i) => ({ id: `rId${i + 1}`, type: "worksheet", target: `worksheets/sheet${i + 1}.xml` })), { id: `rId${sheets.length + 1}`, type: "styles", target: "styles.xml" }])),
    "xl/styles.xml": toBytes(P.SHEET_STYLES)
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = toBytes(sheetXml(s)); });
  return writeZip(files);
}

// ---------------------------------------------------------------- xlsx: file -> text

const MAX_READ_ROWS = 5000;
const MAX_READ_COLS = 80;

export async function readXlsx(files: ZipFiles): Promise<string> {
  const book = files["xl/workbook.xml"];
  if (!book) throw new Error("This Excel file has no workbook part.");
  const relMap = new Map<string, string>();
  if (files["xl/_rels/workbook.xml.rels"]) for (const r of all(parseXml(fromBytes(files["xl/_rels/workbook.xml.rels"])), "Relationship")) relMap.set(r.attrs.Id, r.attrs.Target);
  const strings: string[] = [];
  if (files["xl/sharedStrings.xml"]) for (const si of all(parseXml(fromBytes(files["xl/sharedStrings.xml"])), "si")) strings.push(all(si, "t").filter((t) => true).map(textOf).join(""));
  const sheets: Sheet[] = [];
  for (const s of all(parseXml(fromBytes(book)), "sheet")) {
    let target = relMap.get(s.attrs["r:id"]) ?? "";
    target = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const xml = files[target];
    if (!xml) continue;
    const rows: string[][] = [];
    for (const row of all(parseXml(fromBytes(xml)), "row")) {
      const y = Number(row.attrs.r) - 1;
      if (!(y >= 0) || y >= MAX_READ_ROWS) continue;
      let next = 0;
      for (const c of elems(row, "c")) {
        const at = c.attrs.r ? parseAddr(c.attrs.r) : null;
        const x = at ? at.col : next;
        next = x + 1;
        if (x >= MAX_READ_COLS) continue;
        const t = c.attrs.t;
        const f = first(c, "f");
        const v = first(c, "v");
        let val = "";
        if (f && textOf(f).trim()) val = `=${textOf(f).trim()}`;
        else if (t === "s") val = strings[Number(v ? textOf(v) : -1)] ?? "";
        else if (t === "inlineStr") val = all(c, "t").map(textOf).join("");
        else if (t === "b") val = v && textOf(v) === "1" ? "TRUE" : "FALSE";
        else if (v) val = textOf(v);
        if (val === "") continue;
        (rows[y] ??= [])[x] = val.replace(/\r?\n/g, " ");
      }
    }
    const filled = Array.from(rows, (r) => Array.from(r ?? [], (c) => c ?? ""));
    for (let i = 0; i < filled.length; i++) filled[i] ??= [];
    sheets.push({ name: s.attrs.name ?? `Sheet${sheets.length + 1}`, rows: filled.length ? filled : [[""]] });
  }
  return sheetsText(sheets);
}

// ---------------------------------------------------------------- pptx: file -> text

export async function readPptx(files: ZipFiles): Promise<string> {
  const pres = files["ppt/presentation.xml"];
  if (!pres) throw new Error("This PowerPoint file has no presentation part.");
  const relsOf = (path: string) => {
    const dir = path.slice(0, path.lastIndexOf("/") + 1);
    const rp = `${dir}_rels/${path.slice(dir.length)}.rels`;
    const m = new Map<string, { type: string; path: string }>();
    if (files[rp]) for (const r of all(parseXml(fromBytes(files[rp])), "Relationship")) {
      const parts = (r.attrs.Target.startsWith("/") ? r.attrs.Target.slice(1) : dir + r.attrs.Target).split("/");
      const out: string[] = [];
      for (const p of parts) { if (p === "..") out.pop(); else if (p !== ".") out.push(p); }
      m.set(r.attrs.Id, { type: r.attrs.Type, path: out.join("/") });
    }
    return m;
  };
  const presRels = relsOf("ppt/presentation.xml");
  const order = all(parseXml(fromBytes(pres)), "p:sldId").map((s) => presRels.get(s.attrs["r:id"])?.path).filter((p): p is string => !!p && !!files[p]);
  const paraText = (p: XNode) => markdownOf(all(p, "a:r").map((r) => {
    const rPr = first(r, "a:rPr");
    return { t: elems(r, "a:t").map(textOf).join(""), b: rPr?.attrs.b === "1", i: rPr?.attrs.i === "1" };
  }));
  const textShape = (sp: XNode, asBullets: boolean): string[] => elems(first(sp, "p:txBody") ?? sp, "a:p").map((p) => {
    const t = paraText(p);
    if (!t) return "";
    const pPr = first(p, "a:pPr");
    const lvl = Number(pPr?.attrs.lvl ?? 0);
    return asBullets && !first(pPr ?? p, "a:buNone") ? `${"  ".repeat(Math.min(1, lvl))}- ${t}` : t;
  }).filter(Boolean);
  const out: string[] = [];
  for (const path of order) {
    const slide = parseXml(fromBytes(files[path]));
    const tree = first(first(slide, "p:cSld") ?? slide, "p:spTree");
    const lines: string[] = [];
    if (tree) for (const k of elems(tree)) {
      if (k.name === "p:sp") {
        if (first(first(k, "p:nvSpPr") ?? k, "p:cNvPr")?.attrs.name === "npu-label") continue; // numbers and chart labels the app drew
        const phNode = first(first(first(k, "p:nvSpPr") ?? k, "p:nvPr") ?? k, "p:ph");
        const type = phNode?.attrs.type ?? (phNode ? "body" : "");
        const text = textShape(k, !!phNode && (type === "body" || type === "obj" || type === ""));
        if (!text.length) continue;
        if (type === "title" || type === "ctrTitle") lines.unshift(`# ${text.join(" ").replace(/^[-\s]+/, "").replace(/\*\*/g, "")}`);
        else lines.push(...text);
      } else if (k.name === "p:graphicFrame") {
        const rows = all(k, "a:tr").map((tr) => elems(tr, "a:tc").map((tc) => elems(first(tc, "a:txBody") ?? tc, "a:p").map(paraText).filter(Boolean).join(" ").replace(/\|/g, "\\|")));
        if (rows.length) { const w = Math.max(...rows.map((r) => r.length)); const line = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => r[i] ?? "").join(" | ")} |`; lines.push([line(rows[0]), `|${Array(w).fill("---").join("|")}|`, ...rows.slice(1).map(line)].join("\n")); }
      }
    }
    const notePath = [...relsOf(path).values()].find((r) => r.type.endsWith("/notesSlide"))?.path;
    if (notePath && files[notePath]) {
      const nt = all(parseXml(fromBytes(files[notePath])), "p:sp").filter((sp) => first(first(first(sp, "p:nvSpPr") ?? sp, "p:nvPr") ?? sp, "p:ph")?.attrs.type === "body").flatMap((sp) => textShape(sp, false));
      if (nt.length) lines.push(`Notes: ${nt.join("\n")}`);
    }
    out.push(lines.join("\n") || "(empty slide)");
  }
  return out.join("\n\n---\n\n");
}

// ---------------------------------------------------------------- the public entry points

export async function buildOffice(kind: OfficeKind, source: string, pics: Pics = {}): Promise<Uint8Array> {
  return kind === "docx" ? buildDocx(source, pics) : kind === "xlsx" ? buildXlsx(source) : buildDeck(source, pics);
}

/** A real file as the text form the model reads and edits. Throws a readable message on a damaged file. */
export async function readOffice(kind: OfficeKind, bytes: Uint8Array): Promise<string> {
  const files = await readZip(bytes);
  return kind === "docx" ? readDocx(files) : kind === "xlsx" ? readXlsx(files) : readPptx(files);
}

/** What the model receives for an attached Office file: the text form, and for a workbook the result of every formula. */
export function officeForModel(kind: OfficeKind, source: string): string {
  const head = `[${OFFICE_LABEL[kind]}, shown as text. Pictures, charts and exact formatting are not shown. To change it, write the changed document in the same text form as a ${kind} artifact; the app saves a real .${kind} file.]`;
  if (kind === "xlsx") {
    const calc = formulaResults(parseSheets(source));
    return `${head}\n${source}${calc ? `\n\n[Calculated results of the formulas]\n${calc}` : ""}`;
  }
  return `${head}\n${source}`;
}

// ---------------------------------------------------------------- preview

const CSS = "body{font:14px/1.45 system-ui,Segoe UI,sans-serif;margin:0;padding:16px;background:#f3f3f3;color:#1b1b1b}h2.sh{margin:18px 0 6px;font-size:13px;color:#555}table{border-collapse:collapse;background:#fff}td,th{border:1px solid #d0d0d0;padding:3px 8px;min-width:48px}th{background:#eee;color:#555;font-weight:500;font-size:12px}td.n{text-align:right}td.e{color:#b00020}tr.h td{background:#2f5597;color:#fff;font-weight:600}td.rn{background:#eee;color:#555;text-align:center;font-size:12px}.slide{aspect-ratio:16/9;background:#fff;box-shadow:0 1px 6px #0003;margin:0 auto 20px;max-width:760px;padding:4% 6%;box-sizing:border-box;overflow:hidden;position:relative}.slide.cover{text-align:center;display:flex;flex-direction:column;justify-content:center}.slide h1{font-size:30px;color:#1f3864;margin:0 0 14px}.slide.cover h1{font-size:40px}.slide ul{margin:0;padding-left:24px;font-size:19px}.slide li{margin:4px 0}.slide p{margin:6px 0;font-size:19px}.slide table td{font-size:14px}.slide table tr:first-child td{background:#2f5597;color:#fff}.no{position:absolute;right:12px;bottom:8px;font-size:11px;color:#999}.notes{max-width:760px;margin:-12px auto 20px;font-size:12px;color:#555;white-space:pre-wrap}";
const GRID_COLS = 26, GRID_ROWS = 40;
const CELL_CSS = "body.pick{cursor:cell;user-select:none}";
/**
 * Choosing cells in the sheet preview, drawn like the other selections of the app (the accent frame with a label while pointing, a numbered square with a tick once added to the message):
 * a click, a drag or shift+click makes a range; a column letter or a row number takes the whole column or row. Each choice goes to the window as a pick named by its range (B2:B9),
 * and the window sends back the order of the chips (`npuMarks`), which numbers the marks and removes the ones taken off.
 */
const CELL_SHIM = "(function(){var on=false,a=null,b=null,drag=false,acc='#4e288f',ink='#ffffff',layer=null,live=null,marks=[];"
  + "function lum(h){var m=/^#?([0-9a-f]{6})$/i.exec((h||'').trim());if(!m)return 0;var n=parseInt(m[1],16);return (0.2126*((n>>16)&255)+0.7152*((n>>8)&255)+0.0722*(n&255))/255}"
  + "function name(i){var s='';for(i=i+1;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+((i-1)%26))+s;return s}"
  + "function root(){if(layer)return layer;layer=document.createElement('div');layer.style.cssText='position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none';document.documentElement.appendChild(layer);return layer}"
  + "function paint(d){d.style.border='2px solid '+acc;d.style.background='color-mix(in srgb,'+acc+' 12%,transparent)';d.style.boxShadow='0 0 0 3px color-mix(in srgb,'+acc+' 28%,transparent),inset 0 0 0 1px rgba(255,255,255,.5)'}"
  + "function boxEl(){var d=document.createElement('div');d.style.cssText='position:absolute;box-sizing:border-box;border-radius:8px;transition:opacity .2s ease';paint(d);return d}"
  + "function tip(){var t=document.createElement('div');t.style.cssText='position:absolute;left:0;bottom:calc(100% + 8px);display:flex;gap:7px;align-items:baseline;padding:5px 10px;border-radius:9px;background:#2b2b2b;color:#fff;font:600 12px/1.2 system-ui,sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3)';var n=document.createElement('span');var h=document.createElement('span');h.style.cssText='font-weight:400;opacity:.72';t.appendChild(n);t.appendChild(h);t.n=n;t.h=h;return t}"
  + "function badge(){var q=document.createElement('div');q.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:32px;height:32px;padding:0 8px;box-sizing:border-box;border-radius:9px;display:flex;align-items:center;justify-content:center;background:'+acc+';color:'+ink+';font:700 16px/1 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)';var n=document.createElement('span');q.appendChild(n);var k=document.createElement('i');k.textContent='\\u2713';k.style.cssText='position:absolute;right:-6px;top:-6px;width:16px;height:16px;border-radius:50%;background:#fff;color:'+acc+';font:700 11px/16px system-ui,sans-serif;text-align:center;font-style:normal;box-shadow:0 1px 3px rgba(0,0,0,.35)';q.appendChild(k);q.n=n;return q}"
  + "function cellOf(el){var c=el.closest&&el.closest('td,th');if(!c||!c.dataset.s)return null;var R=c.dataset.r,C=c.dataset.c;if(R===undefined&&C===undefined)return null;return {t:c.closest('table'),r:R===undefined?-1:+R,c:C===undefined?-1:+C}}"
  + "function nrows(t){return t.rows.length-1}function ncols(t){return t.rows[0].cells.length-1}"
  + "function box(x,y){var t=x.t,r0=Math.min(x.r,y.r),r1=Math.max(x.r,y.r),c0=Math.min(x.c,y.c),c1=Math.max(x.c,y.c);if(x.r<0||y.r<0){r0=0;r1=nrows(t)-1}if(x.c<0||y.c<0){c0=0;c1=ncols(t)-1}return {t:t,r0:r0,r1:r1,c0:c0,c1:c1}}"
  + "function rect(g){var p=g.t.rows[g.r0+1].cells[g.c0+1].getBoundingClientRect(),q=g.t.rows[g.r1+1].cells[g.c1+1].getBoundingClientRect();return {left:p.left+scrollX,top:p.top+scrollY,width:q.right-p.left,height:q.bottom-p.top}}"
  + "function place(d,r){d.style.left=r.left+'px';d.style.top=r.top+'px';d.style.width=r.width+'px';d.style.height=r.height+'px'}"
  + "function range(g){var rn=nrows(g.t),w=ncols(g.t);if(g.r0===0&&g.r1===rn-1&&g.c0===g.c1)return {n:name(g.c0)+':'+name(g.c0),w:'column '+name(g.c0)};if(g.c0===0&&g.c1===w-1&&g.r0===g.r1)return {n:(g.r0+1)+':'+(g.r0+1),w:'row '+(g.r0+1)};var p=name(g.c0)+(g.r0+1);var one=g.r0===g.r1&&g.c0===g.c1;return {n:one?p:p+':'+name(g.c1)+(g.r1+1),w:one?'cell '+p:'cells '+p+':'+name(g.c1)+(g.r1+1)}}"
  + "function hover(g){if(!live){live=boxEl();live.tip=tip();live.appendChild(live.tip);root().appendChild(live)}var r=rect(g);live.style.opacity=1;live.style.borderStyle='dashed';place(live,r);live.tip.style.bottom=r.top<44?'auto':'calc(100% + 8px)';live.tip.style.top=r.top<44?'calc(100% + 8px)':'auto';var q=range(g);live.tip.n.textContent=q.w;live.tip.h.textContent=drag?'release to add to message':'click to add to message'}"
  + "function send(g){var q=range(g),u=Date.now()+marks.length;var box=boxEl();var bd=badge();box.appendChild(bd);place(box,rect(g));root().appendChild(box);marks.push({uid:u,g:g,box:box,badge:bd});if(live)live.style.opacity=0;try{parent.postMessage({npuPick:{tag:'cells',selector:q.n,part:'cells',name:q.n,text:g.t.dataset.name||'',uid:u}},'*')}catch(x){}}"
  + "function number(list){marks=marks.filter(function(m){var k=list.indexOf(m.uid);if(k<0){m.box.remove();return false}m.badge.n.textContent=k+1;return true})}"
  + "function again(){for(var i=0;i<marks.length;i++)place(marks[i].box,rect(marks[i].g))}"
  + "function restyle(){ink=lum(acc)>0.6?'#1f1e1d':'#ffffff';for(var i=0;i<marks.length;i++){paint(marks[i].box);marks[i].badge.style.background=acc;marks[i].badge.style.color=ink;marks[i].badge.lastChild.style.color=acc}if(live)paint(live)}"
  + "document.addEventListener('mousedown',function(e){if(!on)return;var c=cellOf(e.target);if(!c)return;e.preventDefault();if(e.shiftKey&&a&&a.t===c.t)b=c;else{a=c;b=c}drag=true;hover(box(a,b))},true);"
  + "document.addEventListener('mousemove',function(e){if(!on)return;var c=cellOf(e.target);if(!c){if(!drag&&live)live.style.opacity=0;return}if(drag){if(c.t===a.t){b=c;hover(box(a,b))}}else hover(box(c,c))},true);"
  + "document.addEventListener('mouseup',function(){if(!on||!drag)return;drag=false;if(a)send(box(a,b))},true);"
  + "window.addEventListener('resize',again);setInterval(again,600);"
  + "window.addEventListener('message',function(e){var d=e.data;if(!d)return;if(d.accent&&d.accent!==acc){acc=d.accent;restyle()}if(typeof d.npuInspect==='boolean'){on=d.npuInspect;document.body.classList.toggle('pick',on);if(!on&&live)live.style.opacity=0}if(d.npuMarks)number(d.npuMarks)})})();";
const html = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;

/** HTML for the side panel: sheets with their formulas calculated, slides as 16:9 cards. (A Word text is shown as markdown by the app.) */
export function officePreview(kind: OfficeKind, source: string, pics: Pics = {}, picked?: number[], cellPick = false): string {
  if (kind === "xlsx") {
    const sheets = parseSheets(source);
    if (!sheets.length) return html("<p>No sheet yet.</p>");
    const wb = new Workbook(sheets);
    // the grid goes past the data (to column Z, a few rows more) so a range can be chosen beside the table, to ask for something new there
    const body = sheets.map((s, si) => {
      const width = Math.max(GRID_COLS, ...s.rows.map((r) => r.length));
      const height = Math.max(GRID_ROWS, s.rows.length + 8);
      const head = `<tr><th class="ch" data-s="${si}"></th>${Array.from({ length: width }, (_, x) => `<th class="ch" data-s="${si}" data-c="${x}">${colName(x)}</th>`).join("")}</tr>`;
      const header = s.rows.length > 1 && s.rows[0].every((c) => c && !isNumeric(c) && !isFormula(c));
      const rows = Array.from({ length: height }, (_, y) => {
        const r = s.rows[y] ?? [];
        return `<tr${header && y === 0 ? ' class="h"' : ""}><td class="rn" data-s="${si}" data-r="${y}">${y + 1}</td>${Array.from({ length: width }, (_, x) => {
          if (y >= s.rows.length || x >= (r.length)) return `<td data-s="${si}" data-r="${y}" data-c="${x}"></td>`;
          const v = wb.cell(s.name, y, x), t = wb.show(v);
          return `<td class="${typeof v === "number" ? "n" : typeof v === "object" && v !== null ? "e" : ""}" data-s="${si}" data-r="${y}" data-c="${x}"${isFormula(r[x] ?? "") ? ` title="${esc(r[x])}"` : ""}>${esc(t)}</td>`;
        }).join("")}</tr>`;
      }).join("");
      return `<h2 class="sh">${esc(s.name)}</h2><table data-name="${esc(s.name)}">${head}${rows}</table>`;
    }).join("");
    return html(body + (cellPick ? `<style>${CELL_CSS}</style><script>${CELL_SHIM}</script>` : ""));
  }
  return deckHtml(source, pics, undefined, picked);
}
const runsHtml = (t: string) => runsOf(t).map((r) => `${r.b ? "<b>" : ""}${r.i ? "<i>" : ""}${esc(r.t)}${r.i ? "</i>" : ""}${r.b ? "</b>" : ""}`).join("");

/** A text document as one printable page of HTML (for a PDF made without an office suite): headings, lists, tables, code, figures as pictures. */
export function docHtml(src: string, pics: Pics = {}): string {
  let open = "";
  const out: string[] = [];
  const close = () => { if (open) { out.push(`</${open}>`); open = ""; } };
  for (const b of blocksOf(src)) {
    if (b.t === "li") {
      const tag = b.num ? "ol" : "ul";
      if (open !== tag) { close(); out.push(`<${tag}>`); open = tag; }
      out.push(`<li style="margin-left:${b.level * 1.4}em">${runsHtml(b.text)}</li>`);
      continue;
    }
    close();
    if (b.t === "h") out.push(`<h${b.n}>${runsHtml(b.text)}</h${b.n}>`);
    else if (b.t === "p") out.push(`<p>${runsHtml(b.text)}</p>`);
    else if (b.t === "break") out.push('<div style="break-after:page"></div>');
    else if (b.t === "code") out.push(`<pre>${esc(b.text)}</pre>`);
    else if (b.t === "figure") { const u = pics[b.key]?.dataUrl; out.push(u ? `<p style="text-align:center"><img src="${u}" style="max-width:100%"></p>` : `<p><i>(${b.alt.toLowerCase()} not drawn)</i></p>`); }
    else out.push(`<table>${b.rows.map((r, y) => `<tr>${r.map((c) => `<${y ? "td" : "th"}>${runsHtml(c)}</${y ? "td" : "th"}>`).join("")}</tr>`).join("")}</table>`);
  }
  close();
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font:11pt/1.4 Calibri,Segoe UI,sans-serif;color:#111;margin:0}h1,h2,h3{color:#1f3864;break-after:avoid}table{border-collapse:collapse;margin:8px 0;break-inside:avoid}td,th{border:1px solid #999;padding:3px 7px;text-align:left}th{background:#d9e2f3}pre{background:#f2f2f2;padding:8px;white-space:pre-wrap;font:9.5pt Consolas,monospace}li{margin:2px 0}</style></head><body>${out.join("") || "<p></p>"}</body></html>`;
}

/** The sheets of a workbook as printable HTML, formulas calculated (no row numbers or column letters). */
export function sheetsPrintHtml(src: string): string {
  const sheets = parseSheets(src);
  const wb = new Workbook(sheets);
  const body = sheets.map((s) => `<h2>${esc(s.name)}</h2><table>${s.rows.map((r, y) => `<tr>${Array.from({ length: Math.max(1, ...s.rows.map((x) => x.length)) }, (_, x) => `<td>${esc(wb.show(wb.cell(s.name, y, x)))}</td>`).join("")}</tr>`).join("")}</table>`).join("") || "<p></p>";
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape}body{font:10pt Calibri,Segoe UI,sans-serif}h2{font-size:12pt}table{border-collapse:collapse;margin-bottom:14px}td{border:1px solid #bbb;padding:2px 6px}tr:first-child td{background:#2f5597;color:#fff;font-weight:600}</style></head><body>${body}</body></html>`;
}
