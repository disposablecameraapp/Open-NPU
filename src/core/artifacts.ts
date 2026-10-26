import type { ArtifactKind } from "../shared/types";

export interface ArtifactSegment {
  t: "artifact";
  /** Position among the artifacts of the message; stable while streaming. */
  index: number;
  title: string;
  kind: ArtifactKind;
  language: string;
  content: string;
  /** Still being written (no closing tag yet). */
  open: boolean;
}
export type Segment = { t: "text"; v: string } | ArtifactSegment;

export const ARTIFACT_INSTRUCTIONS = [
  "You can create artifacts: self-contained files the user opens in a side panel.",
  "When asked to make something substantial (a web page, small app or game, diagram, document, report, or a script) put the whole thing inside one artifact:",
  '<artifact type="html" title="Short title">…full content…</artifact>',
  "type is one of: html (a complete single-file page, inline CSS and JavaScript, no external resources), svg, markdown (documents, reports, plans), code (add language=\"python\" or similar), docx / xlsx / pptx (a real Word, Excel or PowerPoint file, see below).",
  "Write one short sentence before the artifact and do not put the content in a code fence. Answer short questions normally, without an artifact.",
  "To change an artifact you already wrote (fix an error, add something), do NOT write it again. Send only the parts that change, with lines copied exactly from the current file:",
  '<edit file="Short title">',
  "<<<<<<< SEARCH",
  "the old lines",
  "=======",
  "the new lines",
  ">>>>>>> REPLACE",
  "</edit>",
  "Use one block per place, keep the old lines short but unique, and only write the whole file again if most of it changes.",
  "Word, Excel and PowerPoint: the artifact holds a plain text form and the app makes the real file from it (the user saves it with Save as).",
  'docx = markdown: "# " headings, "- " bullets, "1. " numbers, | tables | (first line = header), **bold**, *italic*, a line --- = page break.',
  'pptx = slides separated by a line ---. Per slide: "# Title" (at most 9 words), then at most 6 short lines ("- " bullets, two spaces more = sub-bullet). Optional: "Theme: clean|midnight|sunrise|forest|editorial|violet" before the first slide; "Chart: bar|line|pie" right above a | table | draws a chart; "Flow: step -> step -> step" draws a diagram; "Notes: ..." is the speaker notes. The first slide is the cover.',
  'xlsx = "## Sheet name" then a | table |: its first line is row 1 and its first column is A. Numbers plain (1250, 0.2), real formulas in cells (=B2*C2, =SUM(D2:D9), =IF(), AVERAGE, MIN, MAX, COUNT, ROUND, SUMIF, COUNTIF, Sheet2!A1). Never type a result a formula can calculate.',
  "A Word, Excel or PowerPoint file the user attaches reaches you in the same text form (a workbook also lists each formula's calculated result). Analyse it from that text; to change it use the <edit> blocks, or write the whole file again. Pictures and the exact layout of the original are not carried over: say so if it matters."
].join("\n");

/** Who is speaking. The app uses several short sessions behind one reply; the user must hear a single assistant that owns its files. */
export const VOICE_RULES = [
  'You are one assistant. Speak in the first person singular ("I made", "I changed"), never "we", "our team" or "the helpers".',
  'Every file in this conversation was written by you, earlier, at the user\'s request. Files under "Current files" are your own work, sent back to you so you can change them; the user did not paste them. Never say "the code you gave me", "the code you provided" or "the code you sent". Say "the code I wrote" or "the game I made".'
].join("\n");

const OPEN = "<artifact";
const CLOSE = "</artifact>";

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? "";
  return out;
}

function kindOf(a: Record<string, string>): { kind: ArtifactKind; language: string } {
  const type = (a.type ?? "").toLowerCase().replace(/^application\/vnd\.\w+\./, "").replace(/^text\//, "");
  if (type === "html" || type === "svg") return { kind: type, language: type };
  if (type === "markdown" || type === "md") return { kind: "markdown", language: "markdown" };
  if (type === "docx" || type === "xlsx" || type === "pptx") return { kind: type, language: type };
  if (/^(word|document\.docx)$/.test(type)) return { kind: "docx", language: "docx" };
  if (/^(excel|spreadsheet|sheet)$/.test(type)) return { kind: "xlsx", language: "xlsx" };
  if (/^(powerpoint|slides|presentation|deck)$/.test(type)) return { kind: "pptx", language: "pptx" };
  return { kind: "code", language: (a.language || (type !== "code" ? type : "") || "text").toLowerCase() };
}

/** Pointers the app puts in a chat in place of a file ("the file is under Current files"): a model sometimes copies one into the file it writes. */
const POINTERS = [/^[ \t]*\(the file "[^"\n]*" is under "Current files" at the end\)[ \t]*\r?\n?/gm, /^[ \t]*\[earlier version left out[^\]\n]*\][ \t]*\r?\n?/gm];
export const withoutPointers = (code: string): string => POINTERS.reduce((t, re) => t.replace(re, ""), code);

/** Models often wrap the body in a code fence despite being told not to. */
export function stripFence(body: string): string {
  const t = body.replace(/^\s*\n/, "");
  const m = t.match(/^```[\w+-]*[ \t]*\n?([\s\S]*?)(?:\n```\s*)?$/);
  return (m ? m[1] : t).replace(/\s+$/, "") + (body.endsWith("\n") && !m ? "\n" : "");
}

/** Split a (possibly still streaming) answer into prose and artifacts. */
export function parseSegments(text: string): Segment[] {
  const segs: Segment[] = [];
  let pos = 0;
  let n = 0;
  const pushText = (v: string) => { if (v.trim()) segs.push({ t: "text", v }); };
  for (;;) {
    const i = text.indexOf(OPEN, pos);
    if (i < 0) {
      let rest = text.slice(pos);
      // hold back a partial "<artif" at the end so it does not flash as text
      for (let k = Math.min(OPEN.length - 1, rest.length); k > 0; k--) {
        if (OPEN.startsWith(rest.slice(-k))) { rest = rest.slice(0, rest.length - k); break; }
      }
      pushText(rest);
      break;
    }
    if (!/[\s>]/.test(text[i + OPEN.length] ?? " ")) { // "<artifactory": not ours
      pushText(text.slice(pos, i + OPEN.length));
      pos = i + OPEN.length;
      continue;
    }
    pushText(text.slice(pos, i));
    const gt = text.indexOf(">", i);
    if (gt < 0) { segs.push({ t: "artifact", index: n++, title: "", kind: "code", language: "text", content: "", open: true }); break; }
    const a = attrs(text.slice(i, gt));
    const { kind, language } = kindOf(a);
    const end = text.indexOf(CLOSE, gt + 1);
    const body = text.slice(gt + 1, end < 0 ? undefined : end);
    segs.push({ t: "artifact", index: n++, title: a.title || "Untitled", kind, language, content: withoutPointers(stripFence(body)), open: end < 0 });
    if (end < 0) break;
    pos = end + CLOSE.length;
  }
  return segs;
}

/** Where each artifact body sits in the text, in the same order and with the same rules as parseSegments. */
export function artifactSpans(text: string): { bodyStart: number; bodyEnd: number; closed: boolean }[] {
  const out: { bodyStart: number; bodyEnd: number; closed: boolean }[] = [];
  let pos = 0;
  for (;;) {
    const i = text.indexOf(OPEN, pos);
    if (i < 0) break;
    if (!/[\s>]/.test(text[i + OPEN.length] ?? " ")) { pos = i + OPEN.length; continue; }
    const gt = text.indexOf(">", i);
    if (gt < 0) break;
    const end = text.indexOf(CLOSE, gt + 1);
    out.push({ bodyStart: gt + 1, bodyEnd: end < 0 ? text.length : end, closed: end >= 0 });
    if (end < 0) break;
    pos = end + CLOSE.length;
  }
  return out;
}

/** The text with artifact number `index` (as numbered by parseSegments) holding `content` instead. */
export function replaceArtifact(text: string, index: number, content: string): string {
  const span = artifactSpans(text)[index];
  if (!span) return text;
  return `${text.slice(0, span.bodyStart)}\n${content.replace(/\s+$/, "")}\n${text.slice(span.bodyEnd)}`;
}

export function artifactsIn(text: string): ArtifactSegment[] {
  return parseSegments(text).filter((s): s is ArtifactSegment => s.t === "artifact" && !s.open);
}

/** Prose only, for notifications and previews. */
export function stripArtifacts(text: string): string {
  return parseSegments(text).map((s) => (s.t === "text" ? s.v : `[${s.title || "artifact"}]`)).join("").trim();
}

export function fileExtension(kind: ArtifactKind, language: string): string {
  if (kind === "html") return "html";
  if (kind === "svg") return "svg";
  if (kind === "markdown") return "md";
  if (kind === "docx" || kind === "xlsx" || kind === "pptx") return kind;
  const map: Record<string, string> = { python: "py", javascript: "js", typescript: "ts", bash: "sh", shell: "sh", powershell: "ps1", rust: "rs", csharp: "cs", "c++": "cpp", json: "json", css: "css", sql: "sql", yaml: "yml", text: "txt" };
  return map[language] ?? (/^[a-z0-9]{1,5}$/.test(language) ? language : "txt");
}

/**
 * Full document for the preview iframe. The CSP blocks every network request, so a generated page
 * can run its scripts but cannot phone home.
 */
export function previewDocument(kind: ArtifactKind, content: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:">`;
  if (kind === "svg") return `<!doctype html><html><head>${csp}<style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100%}</style></head><body>${content}</body></html>`;
  if (/<head[\s>]/i.test(content)) return content.replace(/<head([^>]*)>/i, `<head$1>${csp}`);
  if (/<html[\s>]/i.test(content)) return content.replace(/<html([^>]*)>/i, `<html$1><head>${csp}</head>`);
  return `<!doctype html><html><head>${csp}<meta charset="utf-8"></head><body>${content}</body></html>`;
}

/**
 * Runs first in a previewed page of a site. The frame has no network and shows one page, so moving between the pages of the
 * site is done by the app: a followed link or a submitted form is sent to the parent, which shows that page. A script that
 * sets location.href goes to the address of the <base>, which the app turns into the same message.
 */
export const NAV_SHIM = [
  '(function(){function go(h){try{parent.postMessage({npuNav:String(h)},"*")}catch(e){}}',
  'document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a||e.defaultPrevented)return;',
  'var h=a.getAttribute("href")||"";if(!h||/^(javascript|mailto|tel|data|blob):/i.test(h))return;e.preventDefault();',
  'if(h.charAt(0)==="#"){var t=document.getElementById(decodeURIComponent(h.slice(1)));if(t&&t.scrollIntoView)t.scrollIntoView();return}go(h)},true);',
  'document.addEventListener("submit",function(e){e.preventDefault();var f=e.target;if(f&&f.getAttribute&&f.getAttribute("action"))go(f.getAttribute("action"))},true);',
  'window.open=function(h){if(h)go(h);return null};})();'
].join("");

/** A preview document with the navigation shim (and the base that catches location changes) right after its CSP. */
export function withNavShim(doc: string): string {
  const meta = doc.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/);
  if (!meta || meta.index === undefined) return doc;
  const at = meta.index + meta[0].length;
  return `${doc.slice(0, at)}<script>${STORAGE_SHIM}</script><base href="https://npu.invalid/"><script>${NAV_SHIM}</script>${doc.slice(at)}`;
}

/**
 * The preview frame (and the hidden window of the automatic check) is a sandbox without its own origin, where localStorage,
 * sessionStorage and document.cookie throw a SecurityError. Games and apps written by a model use them at the first line (a
 * best score, a saved list), so the page died before drawing anything. Here they are replaced by ones that live as long as
 * the page does.
 */
export const STORAGE_SHIM = [
  '(function(){function mem(){var m={};return{getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},',
  'setItem:function(k,v){m[String(k)]=String(v)},removeItem:function(k){delete m[String(k)]},clear:function(){m={}},',
  'key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}}}',
  '["localStorage","sessionStorage"].forEach(function(n){try{void window[n]}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}});',
  'try{void document.cookie}catch(e){try{var c="";Object.defineProperty(document,"cookie",{get:function(){return c},set:function(v){c=String(v).split(";")[0]},configurable:true})}catch(_){}}})();'
].join("");
