// Every document the model cannot read itself, turned into text it can: Word, Excel and PowerPoint (also the macro
// variants), OpenDocument (odt, ods, odp) and RTF. The old binary formats (.doc .xls .ppt) cannot be read inside the app;
// the caller may convert them with an office suite installed on the PC, and otherwise tells the person to save a newer one.
import { readZip, fromBytes } from "./zip";
import { parseXml, elems, first, all, textOf, type XNode } from "./xml";
import { officeKindOf, officeForModel, readOffice } from "./office";
import { sheetsText, type Sheet } from "./sheet";

export const READABLE_DOC = /\.(docx|docm|xlsx|xlsm|pptx|pptm|odt|ods|odp|rtf)$/i;
export const LEGACY_DOC = /\.(doc|dot|xls|xlt|ppt|pot|pps)$/i;
export const isDocument = (name: string) => READABLE_DOC.test(name) || LEGACY_DOC.test(name);
export const legacyKind = (name: string): "docx" | "xlsx" | "pptx" | null => (/\.(doc|dot)$/i.test(name) ? "docx" : /\.(xls|xlt)$/i.test(name) ? "xlsx" : /\.(ppt|pot|pps)$/i.test(name) ? "pptx" : null);
export const LEGACY_NOTE = (name: string) => `${name}: this is an old Office format (.doc, .xls or .ppt) that the app cannot open by itself. Save it as .docx, .xlsx or .pptx (File > Save As in Word, Excel or PowerPoint) and add it again.`;

const md = (rows: string[][]) => {
  const w = Math.max(1, ...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => (r[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
  return rows.length ? [line(rows[0]), `|${Array(w).fill("---").join("|")}|`, ...rows.slice(1).map(line)].join("\n") : "";
};

function odfText(n: XNode): string {
  return n.kids.map((k) => {
    if (typeof k === "string") return k;
    if (k.name === "text:s") return " ".repeat(Number(k.attrs["text:c"] ?? 1));
    if (k.name === "text:tab") return "\t";
    if (k.name === "text:line-break") return " ";
    if (k.name === "text:note" || k.name === "office:annotation") return "";
    return odfText(k);
  }).join("");
}

function odfBlocks(n: XNode, out: string[], depth = 0) {
  for (const k of elems(n)) {
    if (k.name === "text:h") { const t = odfText(k).trim(); if (t) out.push(`${"#".repeat(Math.min(6, Number(k.attrs["text:outline-level"] ?? 1)))} ${t}`); }
    else if (k.name === "text:p") { const t = odfText(k).trim(); if (t) out.push(t); }
    else if (k.name === "text:list") {
      const items: string[] = [];
      const walk = (l: XNode, d: number) => { for (const li of elems(l, "text:list-item")) for (const c of elems(li)) { if (c.name === "text:list") walk(c, d + 1); else { const t = odfText(c).trim(); if (t) items.push(`${"  ".repeat(Math.min(2, d))}- ${t}`); } } };
      walk(k, depth);
      if (items.length) out.push(items.join("\n"));
    } else if (k.name === "table:table") out.push(md(elems(k).filter((r) => r.name === "table:table-row" || r.name === "table:table-header-rows").flatMap((r) => (r.name === "table:table-row" ? [r] : elems(r, "table:table-row"))).map((r) => elems(r).filter((c) => c.name === "table:table-cell").map((c) => odfText(c).trim()))));
    else if (["text:section", "office:text", "table:table-cell"].includes(k.name)) odfBlocks(k, out, depth);
  }
}

/** A formula as OpenDocument writes it ("of:=SUM([.B2:.B3])") in the notation of Excel. */
const odfFormula = (f: string) => f.replace(/^of:/i, "").replace(/\[\$?([^\].]*)\.\$?([A-Za-z]+\$?\d+)(?::\$?(?:[^\].]*\.)?\$?([A-Za-z]+\$?\d+))?\]/g, (_, sheet: string, a: string, b?: string) => `${sheet ? `${/\s/.test(sheet) ? `'${sheet}'` : sheet}!` : ""}${a}${b ? `:${b}` : ""}`).replace(/;/g, ",");

function odfSheets(root: XNode): Sheet[] {
  const sheets: Sheet[] = [];
  for (const t of all(root, "table:table")) {
    const rows: string[][] = [];
    for (const row of all(t, "table:table-row")) {
      const rep = Math.min(Number(row.attrs["table:number-rows-repeated"] ?? 1), 1);
      const cells: string[] = [];
      for (const c of elems(row).filter((x) => x.name === "table:table-cell" || x.name === "table:covered-table-cell")) {
        const times = Math.min(Number(c.attrs["table:number-columns-repeated"] ?? 1), 50);
        const formula = c.attrs["table:formula"];
        const v = c.attrs["office:value"] ?? c.attrs["office:string-value"] ?? c.attrs["office:boolean-value"];
        const val = formula ? odfFormula(formula) : v ?? odfText(c).trim();
        for (let i = 0; i < (val === "" ? 1 : times); i++) cells.push(val.replace(/\r?\n/g, " "));
      }
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      for (let i = 0; i < rep; i++) rows.push(cells);
    }
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    if (rows.length) sheets.push({ name: t.attrs["table:name"] ?? `Sheet${sheets.length + 1}`, rows: rows.slice(0, 5000) });
  }
  return sheets;
}

function odfSlides(root: XNode): string {
  const out: string[] = [];
  for (const page of all(root, "draw:page")) {
    const lines: string[] = [];
    for (const fr of all(page, "draw:frame")) {
      const cls = fr.attrs["presentation:class"] ?? "";
      const box = first(fr, "draw:text-box");
      if (!box) continue;
      const parts: string[] = [];
      odfBlocks(box, parts);
      if (!parts.length) continue;
      if (cls === "title") lines.unshift(`# ${parts.join(" ").replace(/^#+\s*/, "")}`);
      else lines.push(...parts);
    }
    const notes = first(page, "presentation:notes");
    if (notes) { const n: string[] = []; for (const fr of all(notes, "draw:frame")) if (fr.attrs["presentation:class"] === "notes") { const b = first(fr, "draw:text-box"); if (b) odfBlocks(b, n); } if (n.length) lines.push(`Notes: ${n.join(" ")}`); }
    out.push(lines.join("\n") || "(empty slide)");
  }
  return out.join("\n\n---\n\n");
}

/** Plain text of an RTF file: control words dropped, paragraphs kept, accents and Unicode decoded. */
export function rtfText(src: string): string {
  const out: string[] = [];
  const skip = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "fldinst", "themedata", "colorschememapping", "latentstyles", "listtable", "listoverridetable", "rsidtbl", "generator"]);
  const stack: { skip: boolean; uc: number }[] = [];
  let cur = { skip: false, uc: 1 };
  let i = 0;
  const cp1252 = new TextDecoder("windows-1252");
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") { stack.push(cur); cur = { ...cur }; i++; if (src[i] === "\\" && src[i + 1] === "*") cur.skip = true; continue; }
    if (ch === "}") { cur = stack.pop() ?? cur; i++; continue; }
    if (ch === "\\") {
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40));
      if (m) {
        i += m[0].length;
        if (skip.has(m[1])) cur.skip = true;
        else if (!cur.skip) {
          if (m[1] === "par" || m[1] === "line" || m[1] === "sect" || m[1] === "row") out.push("\n");
          else if (m[1] === "tab" || m[1] === "cell") out.push(m[1] === "tab" ? "\t" : " | ");
          else if (m[1] === "u" && m[2]) { const n = Number(m[2]); out.push(String.fromCodePoint(n < 0 ? n + 65536 : n)); i += cur.uc; }
          else if (m[1] === "uc" && m[2]) cur.uc = Number(m[2]);
          else if (m[1] === "emdash") out.push("—"); else if (m[1] === "endash") out.push("–"); else if (m[1] === "bullet") out.push("•");
        }
        continue;
      }
      const hex = /^\\'([0-9a-fA-F]{2})/.exec(src.slice(i, i + 4));
      if (hex) { if (!cur.skip) out.push(cp1252.decode(Uint8Array.of(parseInt(hex[1], 16)))); i += 4; continue; }
      if (!cur.skip && "\\{}".includes(src[i + 1] ?? "")) out.push(src[i + 1]);
      i += 2;
      continue;
    }
    if (!cur.skip && ch !== "\r" && ch !== "\n") out.push(ch);
    i++;
  }
  return out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface DocumentText { text: string; kind: "docx" | "xlsx" | "pptx" | "text"; source: string }

/**
 * The text of a document the model could not read, with a first line saying what it was and what is missing.
 * Throws a readable message when it cannot be read (an old format, a damaged file, a protected one).
 */
export async function documentText(name: string, bytes: Uint8Array): Promise<DocumentText> {
  if (LEGACY_DOC.test(name) && !READABLE_DOC.test(name)) throw new Error(LEGACY_NOTE(name));
  try {
    const ooxml = officeKindOf(name);
    if (ooxml) { const source = await readOffice(ooxml, bytes); return { kind: ooxml, source, text: officeForModel(ooxml, source) }; }
    if (/\.rtf$/i.test(name)) { const source = rtfText(fromBytes(bytes)); return { kind: "text", source, text: `[Word text (RTF), shown as plain text. Formatting is not shown.]\n${source}` }; }
    const files = await readZip(bytes);
    const content = files["content.xml"];
    if (!content) throw new Error("no content part");
    const root = parseXml(fromBytes(content));
    const body = first(root, "office:body") ?? root;
    if (/\.odt$/i.test(name)) { const out: string[] = []; odfBlocks(first(body, "office:text") ?? body, out); const source = out.join("\n\n"); return { kind: "docx", source, text: officeForModel("docx", source) }; }
    if (/\.ods$/i.test(name)) { const source = sheetsText(odfSheets(body)); return { kind: "xlsx", source, text: officeForModel("xlsx", source) }; }
    const source = odfSlides(body);
    return { kind: "pptx", source, text: officeForModel("pptx", source) };
  } catch (e) {
    const m = (e as Error).message;
    if (/Encrypted|password|not a valid Office|zip/i.test(m)) throw new Error(`${name}: ${/Encrypted|password/i.test(m) ? "protected by a password" : "damaged, protected by a password, or not an Office file"}, it cannot be read.`);
    throw new Error(`${name}: ${m}`);
  }
}
