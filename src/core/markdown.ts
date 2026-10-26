import { fileOfRef } from "./wikimedia";
/** Tiny markdown parser for chat answers: AST only, rendered with React elements (never innerHTML). */
export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "math"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: number; c: Inline[] }
  | { t: "code"; lang: string; v: string; open: boolean }
  | { t: "image"; alt: string; file: string }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
  | { t: "table"; head: Inline[][]; align: ("l" | "r" | "c")[]; rows: Inline[][][] }
  | { t: "math"; v: string }
  | { t: "hr" };

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let buf = "";
  const flush = () => { if (buf) { out.push({ t: "text", v: buf }); buf = ""; } };
  while (i < s.length) {
    const rest = s.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^`([^`\n]+)`/.exec(rest))) { flush(); out.push({ t: "code", v: m[1] }); i += m[0].length; continue; }
    if ((m = /^\$\$([^$]+?)\$\$/.exec(rest)) || (m = /^\\\((.+?)\\\)/.exec(rest)) || (m = /^\\begin\{(\w+\*?)\}[\s\S]*?\\end\{\1\}/.exec(rest)) || (m = /^\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/.exec(rest))) { flush(); out.push({ t: "math", v: (m[0].startsWith("\\begin") ? m[0] : m[1]).trim() }); i += m[0].length; continue; }
    if ((m = /^\*\*([^*\n]+?)\*\*/.exec(rest)) || (m = /^__([^_\n]+?)__/.exec(rest))) { flush(); out.push({ t: "bold", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((!/[A-Za-z0-9]/.test(s[i - 1] ?? " ") && (m = /^\*([^*\s][^*\n]*?)\*/.exec(rest))) || (/^[\s(]?$/.test(s[i - 1] ?? " ") && (m = /^_([^_\s][^_\n]*?)_/.exec(rest)))) { flush(); out.push({ t: "em", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((m = /^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/.exec(rest))) { flush(); out.push({ t: "link", href: m[2], c: parseInline(m[1]) }); i += m[0].length; continue; }
    buf += s[i++];
  }
  flush();
  return out;
}

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const splitRow = (l: string): string[] => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const isSpecial = (l: string) => /^(\s*```|\s*!\[[^\]\n]*\]\(wikimedia:|\s*(\$\$|\\\[|\\begin\{)|\s{0,3}#{1,6}\s|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*>|\s*\|.*\|\s*$|\s*([-*_])(\s*\2){2,}\s*$)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m: RegExpExecArray | null;
    if ((m = /^\s*```(\S*)/.exec(line))) {
      const body: string[] = [];
      i++;
      let open = true;
      while (i < lines.length) {
        if (/^\s*```\s*$/.test(lines[i])) { open = false; i++; break; }
        body.push(lines[i++]);
      }
      blocks.push(/^(latex|tex|math|katex)$/i.test(m[1]) ? { t: "math", v: body.join("\n").replace(/^\s*(\$\$|\\\[)|(\$\$|\\\])\s*$/g, "").trim() } : { t: "code", lang: m[1], v: body.join("\n"), open });
      continue;
    }
    if ((m = /^\s*\\begin\{(\w+\*?)\}/.exec(line))) {
      const end = `\\end{${m[1]}}`;
      let j = i;
      while (j < lines.length && !lines[j].includes(end)) j++;
      blocks.push({ t: "math", v: lines.slice(i, j + 1).join(" ").trim() });
      i = j + 1;
      continue;
    }
    const dm = /^\s*(\$\$|\\\[)(.*)$/.exec(line);
    if (dm) {
      const close = dm[1] === "$$" ? "$$" : "\\]";
      const at = dm[2].indexOf(close);
      if (at >= 0) {
        if (!dm[2].slice(at + close.length).trim()) { blocks.push({ t: "math", v: dm[2].slice(0, at).trim() }); i++; continue; }
      } else {
        const body = [dm[2]];
        let j = i + 1;
        while (j < lines.length && !lines[j].includes(close)) body.push(lines[j++]);
        if (j >= lines.length) { blocks.push({ t: "math", v: body.join(" ").trim() }); i = j; continue; } // still being written
        const k = lines[j].indexOf(close);
        if (!lines[j].slice(k + close.length).trim()) { body.push(lines[j].slice(0, k)); blocks.push({ t: "math", v: body.join(" ").trim() }); i = j + 1; continue; }
      }
    }
    if ((m = /^\s*!\[([^\]\n]*)\]\((wikimedia:[^)\n]+)\)\s*$/.exec(line))) {
      const file = fileOfRef(m[2]);
      if (file) { blocks.push({ t: "image", alt: m[1].slice(0, 160), file }); i++; continue; }
    }
    if (/^\s*\|?.*\|.*$/.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && splitRow(line).length >= 2) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c): "l" | "r" | "c" => (/^:-+:$/.test(c) ? "c" : /-:$/.test(c) ? "r" : "l"));
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(splitRow(lines[i++]).map(parseInline));
      blocks.push({ t: "table", head: head.map(parseInline), align, rows: rows.map((r) => head.map((_h, k) => r[k] ?? [])) });
      continue;
    }
    if ((m = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line))) { blocks.push({ t: "h", level: m[1].length, c: parseInline(m[2]) }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ t: "hr" }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push({ t: "quote", c: parseInline(q.join(" ")) });
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const mm = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!mm || /\d/.test(mm[1]) !== ordered) break;
        let text = mm[2];
        i++;
        while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s/.test(lines[i])) text += " " + lines[i++].trim();
        items.push(parseInline(text));
      }
      blocks.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i])) para.push(lines[i++]);
    blocks.push({ t: "p", c: parseInline(para.join(" ")) });
  }
  return blocks;
}
