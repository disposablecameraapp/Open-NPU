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
  | { t: "h"; n: number; text: string }
  | { t: "p"; text: string }
  | { t: "li"; text: string; level: number; num: boolean; list: number }
  | { t: "table"; rows: string[][] }
  | { t: "break" };

function blocksOf(src: string): Block[] {
  const out: Block[] = [];
  const lines = cleanKey(src).replace(/\r/g, "").split("\n");
  let list = 0, lastWasList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { if (lastWasList) { /* a blank line inside a list keeps it */ } continue; }
    let m: RegExpExecArray | null;
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

export async function buildDocx(src: string): Promise<Uint8Array> {
  const blocks = blocksOf(src);
  const listIds = new Map<number, number>();
  let body = "";
  for (const b of blocks) {
    if (b.t === "h") body += `<w:p><w:pPr><w:pStyle w:val="Heading${b.n}"/></w:pPr>${wRuns(b.text)}</w:p>`;
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
  const document = `${P.XML_HEAD}<w:document ${P.NS_W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1273" w:bottom="1440" w:left="1273" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files: ZipFiles = {
    "[Content_Types].xml": toBytes(P.contentTypes(P.DEFAULT_TYPES, [
      ["/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"],
      ["/word/styles.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"],
      ["/word/numbering.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"]
    ])),
    "_rels/.rels": toBytes(P.rels([{ id: "rId1", type: "officeDocument", target: "word/document.xml" }])),
    "word/_rels/document.xml.rels": toBytes(P.rels([{ id: "rId1", type: "styles", target: "styles.xml" }, { id: "rId2", type: "numbering", target: "numbering.xml" }])),
    "word/document.xml": toBytes(document),
    "word/styles.xml": toBytes(P.WORD_STYLES),
    "word/numbering.xml": toBytes(P.wordNumbering(listIds.size))
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

export async function buildXlsx(src: string): Promise<Uint8Array> {
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
  return kind === "docx" ? buildDocx(source) : kind === "xlsx" ? buildXlsx(source) : buildDeck(source, pics);
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
const html = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;

/** HTML for the side panel: sheets with their formulas calculated, slides as 16:9 cards. (A Word text is shown as markdown by the app.) */
export function officePreview(kind: OfficeKind, source: string, pics: Pics = {}): string {
  if (kind === "xlsx") {
    const sheets = parseSheets(source);
    if (!sheets.length) return html("<p>No sheet yet.</p>");
    const wb = new Workbook(sheets);
    return html(sheets.map((s) => {
      const width = Math.max(1, ...s.rows.map((r) => r.length));
      const head = `<tr><th></th>${Array.from({ length: width }, (_, x) => `<th>${colName(x)}</th>`).join("")}</tr>`;
      const header = s.rows.length > 1 && s.rows[0].every((c) => c && !isNumeric(c) && !isFormula(c));
      const rows = s.rows.map((r, y) => `<tr${header && y === 0 ? ' class="h"' : ""}><td class="rn">${y + 1}</td>${Array.from({ length: width }, (_, x) => {
        const v = wb.cell(s.name, y, x), t = wb.show(v);
        return `<td class="${typeof v === "number" ? "n" : typeof v === "object" && v !== null ? "e" : ""}"${isFormula(r[x] ?? "") ? ` title="${esc(r[x])}"` : ""}>${esc(t)}</td>`;
      }).join("")}</tr>`).join("");
      return `<h2 class="sh">${esc(s.name)}</h2><table>${head}${rows}</table>`;
    }).join(""));
  }
  return deckHtml(source, pics);
}
const runsHtml = (t: string) => runsOf(t).map((r) => `${r.b ? "<b>" : ""}${r.i ? "<i>" : ""}${esc(r.t)}${r.i ? "</i>" : ""}${r.b ? "</b>" : ""}`).join("");
