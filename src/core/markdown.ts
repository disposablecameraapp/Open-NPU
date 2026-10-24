/** Tiny markdown parser for chat answers: AST only, rendered with React elements (never innerHTML). */
export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: number; c: Inline[] }
  | { t: "code"; lang: string; v: string; open: boolean }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
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
    if ((m = /^\*\*([^*\n]+?)\*\*/.exec(rest)) || (m = /^__([^_\n]+?)__/.exec(rest))) { flush(); out.push({ t: "bold", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((!/[A-Za-z0-9]/.test(s[i - 1] ?? " ") && (m = /^\*([^*\s][^*\n]*?)\*/.exec(rest))) || (/^[\s(]?$/.test(s[i - 1] ?? " ") && (m = /^_([^_\s][^_\n]*?)_/.exec(rest)))) { flush(); out.push({ t: "em", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((m = /^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/.exec(rest))) { flush(); out.push({ t: "link", href: m[2], c: parseInline(m[1]) }); i += m[0].length; continue; }
    buf += s[i++];
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const isSpecial = (l: string) => /^(\s*```|\s{0,3}#{1,6}\s|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*>|\s*([-*_])(\s*\2){2,}\s*$)/.test(l);
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
      blocks.push({ t: "code", lang: m[1], v: body.join("\n"), open });
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
