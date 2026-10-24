import { Script } from "vm";
import { STORAGE_SHIM, previewDocument } from "./artifacts";
import { missingElements } from "./bundle";

/** What running one artifact found. `ran`: page = executed in a hidden window, syntax = parsed only, none = nothing could be checked. */
export interface CheckReport {
  ran: "page" | "syntax" | "none";
  errors: string[];
  /** Things seen that are not errors but matter to a reviewer ("the canvas never changes"). */
  notes?: string[];
  /** Small screenshot of the page at the end of the run (data URL). */
  shot?: string;
}

export interface PageProblem {
  /** error = uncaught exception, promise = unhandled rejection, console = console.error, csp = blocked by the page's CSP */
  k: "error" | "promise" | "console" | "csp";
  m: string;
  l: number | null;
}

/**
 * Runs first in the page (inlined right after the CSP meta, on one line so line numbers stay those of the artifact).
 * Collects everything that goes wrong into window.__npu.p and silences dialogs, which would block a hidden window.
 */
export const PAGE_HOOK = [
  "(function(){var P=window.__npu={p:[]};",
  "function add(k,m,l){if(P.p.length<50)P.p.push({k:k,m:String(m).slice(0,300),l:l||null})}",
  'window.addEventListener("error",function(e){if(e.target&&e.target!==window)return;add("error",e.message,e.lineno)},true);',
  'window.addEventListener("unhandledrejection",function(e){var r=e.reason;add("promise",r&&r.message?r.message:r)});',
  'document.addEventListener("securitypolicyviolation",function(e){add("csp",e.blockedURI||e.violatedDirective)});',
  'var ce=console.error;console.error=function(){add("console",[].slice.call(arguments).join(" "));try{ce.apply(console,arguments)}catch(_){}};',
  'window.alert=window.confirm=function(){return true};window.prompt=function(){return ""};',
  "})();"
].join("");

/** The artifact as a document with the hook in it. The hook is only for the check; the real preview never gets it. */
export function instrumentedDocument(html: string): string {
  const doc = previewDocument("html", html);
  const meta = doc.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/);
  if (!meta || meta.index === undefined) return doc;
  const at = meta.index + meta[0].length;
  return `${doc.slice(0, at)}<script>${STORAGE_SHIM}</script><script>${PAGE_HOOK}</script>${doc.slice(at)}`;
}

const KEY_CODES: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, " ": 32, Enter: 13, w: 87, a: 65, s: 83, d: 68 };

/** Presses the usual game keys and clicks every button, so errors that only show on input show up too. */
export const KEYS_SCRIPT = `(function(){
  var codes=${JSON.stringify(KEY_CODES)};
  var targets=[document.body].concat([].slice.call(document.querySelectorAll("canvas")));
  Object.keys(codes).forEach(function(k){
    ["keydown","keyup"].forEach(function(type){
      targets.forEach(function(t){
        t.dispatchEvent(new KeyboardEvent(type,{key:k,code:k===" "?"Space":k.length>1?k:"Key"+k.toUpperCase(),keyCode:codes[k],which:codes[k],bubbles:true,cancelable:true}));
      });
    });
  });
  return true;
})()`;

export const CLICKS_SCRIPT = `(function(){
  var els=[].slice.call(document.querySelectorAll("button,[onclick],input[type=button],input[type=submit],input[type=checkbox],input[type=radio],summary,canvas")).slice(0,20);
  els.forEach(function(el){
    var r=el.getBoundingClientRect();
    var o={bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2};
    ["pointerdown","mousedown","pointerup","mouseup","click"].forEach(function(t){
      try{el.dispatchEvent(t.indexOf("pointer")===0?new PointerEvent(t,o):new MouseEvent(t,o))}catch(e){}
    });
  });
  return els.length;
})()`;

/** A cheap fingerprint of every 2D canvas, to tell whether anything was ever drawn or moved. */
export const SNAP_SCRIPT = `(function(){
  return [].slice.call(document.querySelectorAll("canvas")).slice(0,4).map(function(c){
    try{
      var x=c.getContext("2d"); if(!x||!c.width||!c.height) return "n/a";
      var d=x.getImageData(0,0,c.width,c.height).data,h=0,ink=0;
      for(var i=0;i<d.length;i+=16){h=(h*31+d[i]+d[i+1]*3+d[i+2]*7+d[i+3])|0; if(d[i+3]) ink++;}
      return ink?String(h):"empty";
    }catch(e){return "n/a"}
  });
})()`;

/** What the canvas fingerprints taken at load, after the keys and after the clicks say. */
export function canvasNotes(snaps: string[][]): string[] {
  const last = snaps[snaps.length - 1] ?? [];
  const notes: string[] = [];
  last.forEach((end, i) => {
    if (end === "n/a") return;
    const label = last.length > 1 ? `Canvas ${i + 1}` : "The canvas";
    if (end === "empty") notes.push(`${label} is empty: nothing was drawn on it.`);
    else if (snaps.every((s) => s[i] === end)) notes.push(`${label} never changed after load, even after arrow keys, WASD, space, Enter and clicks: nothing moves or reacts.`);
  });
  return notes;
}

/**
 * The page's problems, and whether it can be seen: `blank` = nothing in the body, `hidden` = there is content but all of it
 * is invisible (opacity 0, display none, visibility hidden or no size), with the element that hides it.
 */
export const REPORT_SCRIPT = `(function(){
  var b=document.body,t=b?b.innerText.trim():"";
  var media="canvas,svg,img,video,input,button,textarea,select,table,iframe";
  var shown=!!(b&&b.querySelector(media));
  var hidden=null;
  function name(n){var c=typeof n.className==="string"?n.className.trim().split(/\\s+/).filter(Boolean):[];return n.tagName.toLowerCase()+(n.id?"#"+n.id:"")+(c.length?"."+c.join("."):"")}
  function why(e){
    for(var n=e;n;n=n.parentElement){
      var s=getComputedStyle(n);
      if(s.display==="none")return{el:name(n),why:"display: none"};
      if(parseFloat(s.opacity)<0.05)return{el:name(n),why:"opacity: "+s.opacity};
      if(n===e&&(s.visibility==="hidden"||s.visibility==="collapse"))return{el:name(n),why:"visibility: "+s.visibility};
    }
    var r=e.getBoundingClientRect();
    return r.width&&r.height?null:{el:name(e),why:"no size"};
  }
  if(b&&(t||shown)){
    var els=[].slice.call(b.querySelectorAll("*")).filter(function(e){
      return e.matches(media)||[].some.call(e.childNodes,function(n){return n.nodeType===3&&n.textContent.trim()});
    }).slice(0,200);
    var first=null,seen=false;
    for(var i=0;i<els.length&&!seen;i++){var w=why(els[i]);if(!w)seen=true;else if(!first)first=w}
    if(!seen&&first)hidden=first;
  }
  return {problems:window.__npu?window.__npu.p:[],blank:!t&&!shown,hidden:hidden};
})()`;

export interface HiddenBy { el: string; why: string }

/**
 * "The page is blank" for a page that has content nobody can see. A small model writes `opacity: 0` for a fade-in and never
 * the code that fades it in. With the stylesheets, the message names the file that sets it so that file gets the fix.
 */
export function describeHidden(h: HiddenBy | null | undefined, sheets: { title: string; content: string }[] = []): string[] {
  if (!h) return [];
  const named = h.el.match(/[.#][\w-]+/g);
  const tokens = named ?? h.el.match(/^[a-z][a-z0-9]*/i) ?? [];
  const sheet = sheets.find((f) => tokens.some((t) => new RegExp(`${t.replace(/[.#]/g, "\\$&")}(?![\\w-])[^{}]*\\{[^}]*\\b(?:opacity|display|visibility)\\s*:`, "i").test(f.content)));
  return [`${sheet ? `${sheet.title}: ` : ""}Everything on the page is invisible: ${h.el} has ${h.why}, so the page looks blank. Remove that rule, or show it again (a fade-in needs the code that does it).`];
}

const sourceLine = (content: string, line: number | null) => {
  if (!line) return "";
  const src = content.split("\n")[line - 1]?.trim();
  return src ? ` (line ${line}: ${src.length > 110 ? `${src.slice(0, 110)}…` : src})` : ` (line ${line})`;
};

/** Plain sentences for the model, deduplicated. Line numbers of the page are those of the artifact; with `locate`, those of the file the code comes from. */
export function describeProblems(problems: PageProblem[], blank: boolean, content: string, max = 6, locate?: (line: number | null) => { file: string; line: number; src: string } | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => { if (!seen.has(s)) { seen.add(s); out.push(s); } };
  for (const p of problems) {
    const m = p.m.replace(/^Uncaught\s+/, "");
    if (p.k === "error") {
      const at = locate?.(p.l);
      if (at) add(`${at.file}: ${m} (line ${at.line}${at.src ? `: ${at.src.length > 110 ? `${at.src.slice(0, 110)}…` : at.src}` : ""})`);
      else add(`${m}${sourceLine(content, p.l)}`);
    }
    else if (p.k === "promise") add(`Unhandled promise rejection: ${m}`);
    else if (p.k === "console") add(`console.error: ${m}`);
    else if (p.m === "eval") add("It uses eval() or new Function(), which is blocked.");
    else add(`It tries to load "${p.m}", but pages cannot use the network or external files. Inline everything.`);
  }
  if (blank && !out.length) add("The page is blank: nothing is drawn or written after it loads.");
  return out.length > max ? [...out.slice(0, max), `…and ${out.length - max} more`] : out;
}

/** Syntax error of a JavaScript file with its line, or null. ES modules (import / export) cannot be parsed this way and pass. */
export function jsSyntaxError(code: string): string | null {
  if (/^\s*(import\s[\w{*'"]|export\s)/m.test(code)) return null;
  try {
    new Script(code, { filename: "artifact.js" });
    return null;
  } catch (e) {
    const err = e as Error;
    const line = Number(/^artifact\.js:(\d+)/.exec(err.stack ?? "")?.[1]) || null;
    return `${err.name}: ${err.message}${sourceLine(code, line)}`;
  }
}

export const isJs = (language: string) => /^(js|javascript|mjs|node)$/i.test(language);
export const isPython = (language: string) => /^(py|python|python3)$/i.test(language);

/** Strings and comments out of a stylesheet, so that braces inside them are not counted. */
const bareCss = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""');

/**
 * What can be told about a file the moment it is written, without running a page: a script that does not parse, a
 * stylesheet whose braces do not match, a page that asks for the network (it has none) or never opens a body.
 * Cheap, and exact: each message names the line.
 */
export function quickErrors(f: { title: string; kind: string; language: string; content: string }, pages: string[] = []): string[] {
  const out: string[] = [];
  if (f.kind === "code" && isJs(f.language)) {
    const e = jsSyntaxError(f.content);
    if (e) out.push(e);
    else out.push(...missingElements(f.content, pages));
  } else if (f.kind === "code" && /^css$/i.test(f.language)) {
    const t = bareCss(f.content);
    const open = (t.match(/\{/g) ?? []).length, close = (t.match(/\}/g) ?? []).length;
    if (open !== close) out.push(`The braces do not match: ${open} "{" and ${close} "}".`);
  } else if (f.kind === "html") {
    if (!/<body[\s>]/i.test(f.content)) out.push("The page has no <body>.");
    const ext = /\b(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+/i.exec(f.content);
    if (ext) out.push(`It loads "${ext[0].replace(/^[^=]*=\s*["']/, "")}" from the network, but pages have no network: inline it.`);
  }
  return out;
}
