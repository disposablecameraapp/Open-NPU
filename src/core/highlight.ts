/** A small syntax highlighter: enough colour to read code at a glance, no dependencies. */
export type TokClass = "com" | "str" | "num" | "kw" | "fn" | "tag" | "attr" | "op";
export interface Tok { c: TokClass | null; v: string }

const words = (s: string) => new RegExp(`^(?:${s.trim().split(/\s+/).join("|")})$`);

const KEYWORDS: Record<string, RegExp> = {
  python: words("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self print"),
  js: words("var let const function return if else for while do break continue switch case default new delete typeof instanceof in of class extends super this import export from async await try catch finally throw yield null undefined true false void static get set interface type enum implements public private protected readonly"),
  c: words("auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class public private protected new delete namespace using template true false null nullptr fn let mut pub impl use mod match loop func package string bool var interface go defer chan"),
  shell: words("if then else elif fi for in do done while until case esac function return exit export local echo cd set unset"),
  css: words("important"),
  json: words("true false null")
};

interface Rule { c: TokClass | null; re: RegExp; test?: (v: string) => TokClass | null }

const NUM = /\b(?:0x[\da-fA-F]+|\d[\d_]*\.?\d*(?:e[+-]?\d+)?)\b/y;
const IDENT = /[A-Za-z_$][\w$]*/y;
const OP = /[+\-*/%=<>!&|^~?:]+/y;

function rulesFor(lang: string): { rules: Rule[]; kw: RegExp | null } {
  const l = lang.toLowerCase();
  const dq = /"(?:[^"\\\n]|\\.)*"?/y, sq = /'(?:[^'\\\n]|\\.)*'?/y;
  if (/^(py|python|python3)$/.test(l)) return { kw: KEYWORDS.python, rules: [
    { c: "com", re: /#[^\n]*/y }, { c: "str", re: /(?:[rbfRBF]{0,2})(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))/y },
    { c: "str", re: /[rbfRBF]{0,2}"(?:[^"\\\n]|\\.)*"?/y }, { c: "str", re: /[rbfRBF]{0,2}'(?:[^'\\\n]|\\.)*'?/y },
    { c: "fn", re: /@[A-Za-z_][\w.]*/y }
  ] };
  if (/^(sh|bash|shell|zsh|powershell|ps1|yaml|yml|toml|ini)$/.test(l)) return { kw: KEYWORDS.shell, rules: [{ c: "com", re: /#[^\n]*/y }, { c: "str", re: dq }, { c: "str", re: sq }] };
  if (/^(css|scss|less)$/.test(l)) return { kw: KEYWORDS.css, rules: [
    { c: "com", re: /\/\*[\s\S]*?(?:\*\/|$)/y }, { c: "str", re: dq }, { c: "str", re: sq },
    { c: "kw", re: /@[\w-]+/y }, { c: "num", re: /#[\da-fA-F]{3,8}\b/y }, { c: "num", re: /-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?/y },
    { c: "attr", re: /[\w-]+(?=\s*:(?!:))/y }
  ] };
  if (l === "json") return { kw: KEYWORDS.json, rules: [{ c: "attr", re: /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y }, { c: "str", re: dq }] };
  // everything else reads like C / JavaScript
  return { kw: /^(js|javascript|jsx|mjs|ts|typescript|tsx|node)$/.test(l) ? KEYWORDS.js : KEYWORDS.c, rules: [
    { c: "com", re: /\/\/[^\n]*/y }, { c: "com", re: /\/\*[\s\S]*?(?:\*\/|$)/y },
    { c: "str", re: /`(?:[^`\\]|\\[\s\S])*`?/y }, { c: "str", re: dq }, { c: "str", re: sq }
  ] };
}

function scan(code: string, lang: string): Tok[] {
  const { rules, kw } = rulesFor(lang);
  const out: Tok[] = [];
  const push = (c: TokClass | null, v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.c === c) last.v += v; else out.push({ c, v });
  };
  let i = 0;
  while (i < code.length) {
    let hit: { c: TokClass | null; v: string } | null = null;
    for (const r of rules) {
      r.re.lastIndex = i;
      const m = r.re.exec(code);
      if (m && m[0]) { hit = { c: r.c, v: m[0] }; break; }
    }
    if (!hit) {
      IDENT.lastIndex = i;
      const id = IDENT.exec(code);
      if (id) {
        const after = code[i + id[0].length];
        hit = { c: kw?.test(id[0]) ? "kw" : after === "(" ? "fn" : null, v: id[0] };
      } else {
        NUM.lastIndex = i;
        const n = NUM.exec(code);
        if (n && n[0]) hit = { c: "num", v: n[0] };
        else { OP.lastIndex = i; const o = OP.exec(code); hit = o && o[0] ? { c: "op", v: o[0] } : { c: null, v: code[i] }; }
      }
    }
    push(hit.c, hit.v);
    i += hit.v.length;
  }
  return out;
}

/** HTML: tags and attributes, with the code inside <script> and <style> highlighted as JavaScript and CSS. */
function scanHtml(code: string): Tok[] {
  const out: Tok[] = [];
  const parts = code.split(/(<script\b[^>]*>[\s\S]*?(?:<\/script>|$)|<style\b[^>]*>[\s\S]*?(?:<\/style>|$))/i);
  for (const part of parts) {
    const emb = /^(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)?$/i.exec(part);
    if (emb) {
      out.push(...markup(emb[1]), ...scan(emb[3], emb[2].toLowerCase() === "style" ? "css" : "js"), ...(emb[4] ? markup(emb[4]) : []));
    } else out.push(...markup(part));
  }
  return out;
}

function markup(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /<!--[\s\S]*?(?:-->|$)|<\/?[A-Za-z][\w:-]*|\/?>|"[^"]*"?|'[^']*'?|[\w:@.-]+(?==)|&\w+;/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ c: null, v: s.slice(last, m.index) });
    const v = m[0];
    out.push({ c: v.startsWith("<!--") ? "com" : v[0] === "<" || v === ">" || v === "/>" ? "tag" : v[0] === '"' || v[0] === "'" ? "str" : v[0] === "&" ? "num" : "attr", v });
    last = m.index! + v.length;
  }
  if (last < s.length) out.push({ c: null, v: s.slice(last) });
  return out;
}

export function highlight(code: string, lang: string): Tok[] {
  const l = lang.toLowerCase();
  if (/^(html|htm|xml|svg|vue)$/.test(l)) return scanHtml(code);
  if (/^(markdown|md|text|txt|plain|)$/.test(l)) return [{ c: null, v: code }];
  return scan(code, l);
}
