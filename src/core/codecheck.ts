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
  /** With the probe: what the page offers to press and click, and for each input whether it changed anything. */
  probe?: { plan: ProbePlan; effects: Record<string, boolean>; seen?: Record<string, boolean> };
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

/** The page with the hook and the repeatable clock in it, for the probe. */
export function probeDocument(html: string): string {
  const doc = instrumentedDocument(html);
  return doc.replace(/(<script>[^<]*window\.__npu=\{p:\[\]\}[\s\S]*?<\/script>)/, `$1<script>${PROBE_PRELUDE}</script>`);
}

/** The artifact as a document with the hook in it. The hook is only for the check; the real preview never gets it. */
export function instrumentedDocument(html: string): string {
  const doc = previewDocument("html", html);
  const meta = doc.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/);
  if (!meta || meta.index === undefined) return doc;
  const at = meta.index + meta[0].length;
  return `${doc.slice(0, at)}<script>${STORAGE_SHIM}</script><script>${PAGE_HOOK}</script>${doc.slice(at)}`;
}

/**
 * Makes a page repeatable so that what an input does can be told by comparing two runs: the clock is ours (timers, frames and
 * Date move only when asked), Math.random is a fixed sequence, and the page's listeners and own variables can be listed and
 * fingerprinted. Nothing here knows what program the page is: it only asks "did pressing this change anything?".
 */
export const PROBE_PRELUDE = String.raw`(function(){
var W=window,seed=12345,base=1700000000000,now=0,nextId=1,order=0,timers={};
Math.random=function(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
var RD=Date;
function FD(){if(arguments.length===0)return new RD(base+now);return new (Function.prototype.bind.apply(RD,[null].concat([].slice.call(arguments))))()}
FD.prototype=RD.prototype;FD.now=function(){return base+now};FD.UTC=RD.UTC;FD.parse=RD.parse;W.Date=FD;
try{W.performance.now=function(){return now}}catch(e){}
function add(fn,ms,every,args){var id=nextId++;var d=Math.max(0,+ms||0);timers[id]={fn:fn,at:now+d,every:every?Math.max(1,d):0,args:args,n:order++};return id}
W.setTimeout=function(fn,ms){return add(fn,ms,false,[].slice.call(arguments,2))};
W.setInterval=function(fn,ms){return add(fn,ms,true,[].slice.call(arguments,2))};
W.clearTimeout=W.clearInterval=function(id){delete timers[id]};
W.requestAnimationFrame=function(cb){return add(function(){cb(now)},16,false,[])};
W.cancelAnimationFrame=function(id){delete timers[id]};
function fail(e){try{W.dispatchEvent(new ErrorEvent("error",{message:String(e&&e.message||e),error:e}))}catch(_){}}
W.__npuAdvance=function(ms){var end=now+ms,guard=0;
for(;;){var pick=null,pid=null;for(var k in timers){var t=timers[k];if(t.at<=end&&(!pick||t.at<pick.at||(t.at===pick.at&&t.n<pick.n))){pick=t;pid=k}}
if(!pick||++guard>20000)break;
now=Math.max(now,pick.at);
if(pick.every){pick.at+=pick.every;pick.n=order++}else delete timers[pid];
try{if(typeof pick.fn==="function")pick.fn.apply(W,pick.args)}catch(e){fail(e)}}
now=end;return true};
var reg=[],oa=EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener=function(type,fn,o){try{reg.push({el:this,type:String(type)})}catch(e){}return oa.apply(this,arguments)};
var baseNames={};Object.getOwnPropertyNames(W).forEach(function(k){baseNames[k]=1});
function visible(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0}
function clickables(){var q=[].slice.call(document.querySelectorAll("button,[onclick],input[type=button],input[type=submit],input[type=checkbox],input[type=radio],summary,select,[role=button]")).filter(visible);
reg.forEach(function(r){if(r.type==="click"&&r.el&&r.el.nodeType===1&&r.el!==document.body&&r.el!==document.documentElement&&q.indexOf(r.el)<0&&visible(r.el))q.push(r.el)});
return q.slice(0,6)}
function texts(){return [].slice.call(document.querySelectorAll("input:not([type]),input[type=text],input[type=search],input[type=number],input[type=email],textarea"))}
function label(e,i){var t=(e.id?"#"+e.id:(e.textContent||e.value||e.tagName||"").trim().replace(/\s+/g," ").slice(0,18));return "click:"+(t||e.tagName.toLowerCase())+(i>0?"#"+i:"")}
W.__npuPlan=function(){var types={};reg.forEach(function(r){types[r.type]=1});
return {kb:!!(types.keydown||types.keyup||types.keypress),texts:texts().length,clicks:clickables().map(label)}};
function key(k){var code=k.length===1&&k!==" "?"Key"+k.toUpperCase():k===" "?"Space":k;var kc={ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40," ":32,Enter:13,Escape:27,Backspace:8}[k]||(k.length===1?k.toUpperCase().charCodeAt(0):0);
var targets=[document.activeElement||document.body,document.body].concat([].slice.call(document.querySelectorAll("canvas")));
["keydown","keyup"].forEach(function(type){targets.forEach(function(t){try{t.dispatchEvent(new KeyboardEvent(type,{key:k,code:code,keyCode:kc,which:kc,bubbles:true,cancelable:true}))}catch(e){fail(e)}})});
W.__npuAdvance(120)}
var GROUPS={"keys:arrows":["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"],"keys:action":[" ","Enter"],"keys:other":["Escape","Backspace","w","a","s","d","1","2","3","+","4","=","."]};
W.__npuApply=function(spec){
if(spec==="fill"){texts().forEach(function(e){e.value=e.type==="number"?"5":"test";["input","change"].forEach(function(t){e.dispatchEvent(new Event(t,{bubbles:true}))})});return true}
if(GROUPS[spec]){GROUPS[spec].forEach(key);return true}
if(spec.indexOf("click:")===0){var i=+spec.slice(6);var el=clickables()[i];if(el){try{el.click()}catch(e){fail(e)}}return true}
return false};
function seenHash(){var parts=[];
[].slice.call(document.querySelectorAll("canvas")).slice(0,4).forEach(function(c){try{var x=c.getContext("2d");if(x&&c.width&&c.height){var d=x.getImageData(0,0,c.width,c.height).data,h=0;for(var i=0;i<d.length;i+=4)h=(Math.imul(h,31)+d[i]+d[i+1]*3+d[i+2]*7+d[i+3])|0;parts.push("c"+h)}}catch(e){}});
parts.push(document.body?document.body.innerHTML:"");
[].forEach.call(document.querySelectorAll("input,textarea,select"),function(e){parts.push(e.value+"|"+e.checked)});
var s=parts.join("|"),h=5381;for(var j=0;j<s.length;j++)h=(Math.imul(h,33)+s.charCodeAt(j))|0;return h+":"+s.length}
W.__npuSeen=seenHash;
W.__npuFp=function(){var parts=[];
[].slice.call(document.querySelectorAll("canvas")).slice(0,4).forEach(function(c){try{var x=c.getContext("2d");if(x&&c.width&&c.height){var d=x.getImageData(0,0,c.width,c.height).data,h=0;for(var i=0;i<d.length;i+=4)h=(Math.imul(h,31)+d[i]+d[i+1]*3+d[i+2]*7+d[i+3])|0;parts.push("c"+h)}}catch(e){}});
parts.push(document.body?document.body.innerHTML:"");
[].forEach.call(document.querySelectorAll("input,textarea,select"),function(e){parts.push(e.value+"|"+e.checked)});
Object.getOwnPropertyNames(W).forEach(function(k){if(baseNames[k]||k.indexOf("__npu")===0||k==="__npu")return;var v;try{v=W[k]}catch(e){return}
if(typeof v==="function"||v===W||(v&&v.nodeType))return;try{parts.push(k+"="+JSON.stringify(v).slice(0,2000))}catch(e){}});
var s=parts.join("|"),h=5381;for(var j=0;j<s.length;j++)h=(Math.imul(h,33)+s.charCodeAt(j))|0;return h+":"+s.length};
})();`;

export interface ProbePlan { kb: boolean; texts: number; clicks: string[] }

/** The inputs worth trying on a page, as labels: key groups when the page listens to the keyboard, each button it has. */
export function probeInputs(plan: ProbePlan): string[] {
  return [...(plan.kb ? ["keys:arrows", "keys:action", "keys:other"] : []), ...plan.clicks.map((_, i) => `click:${i}`)];
}

/** The page's own labels for its clickable things, by position (the probe's `click:3` names the fourth). */
export const probeLabel = (plan: ProbePlan, input: string): string => (input.startsWith("click:") ? plan.clicks[Number(input.slice(6))] ?? input : input);

/**
 * What a first run says about a page with no earlier version to compare to. A page that listens to the keyboard where no key
 * changes anything, or whose buttons change nothing, has dead controls. A single button that does nothing is not reported: a
 * button may rightly do nothing in a given state.
 */
export function inertControls(plan: ProbePlan, state: Record<string, boolean>, seen?: Record<string, boolean>): string[] {
  // what the person sees decides: a variable that changes while the screen stays the same is a dead control
  const effects = seen ?? state;
  const out: string[] = [];
  const keys = ["keys:arrows", "keys:action", "keys:other"].filter((k) => k in effects);
  if (plan.kb && keys.length && keys.every((k) => !effects[k])) out.push("The page listens to the keyboard, but pressing the arrow keys, Space, Enter, letters and digits changes nothing at all: the keyboard controls do not work.");
  const clicks = Object.keys(effects).filter((k) => k.startsWith("click:"));
  if (clicks.length && clicks.every((k) => !effects[k])) out.push(`Clicking ${clicks.length === 1 ? "its button" : "any of its buttons"} changes nothing at all${plan.texts ? ", even with the text fields filled in" : ""}: the buttons do not work.`);
  return out;
}

/**
 * Controls that changed the page before a change and no longer do after it. A button the new page still has is judged on its label;
 * the keyboard counts as lost when the page stopped listening to it. A request that asks to take controls away is left alone.
 */
export function lostEffects(before: { plan: ProbePlan; effects: Record<string, boolean> } | undefined, after: { plan: ProbePlan; effects: Record<string, boolean> } | undefined, request = ""): string[] {
  if (!before || !after || /\b(remove|delete|disable|drop|without|get rid|supprim\w*|enl[eè]v\w*|retir\w*|sans|d[ée]sactiv\w*)\b/i.test(request)) return [];
  const out: string[] = [];
  const afterByLabel = new Map(Object.keys(after.effects).map((k) => [probeLabel(after.plan, k), after.effects[k]]));
  for (const k of Object.keys(before.effects)) {
    if (!before.effects[k]) continue;
    const name = probeLabel(before.plan, k);
    const now = afterByLabel.get(name);
    const isKeys = name.startsWith("keys:");
    if (now === false || (isKeys && now === undefined)) {
      const what = isKeys ? `Pressing ${name === "keys:arrows" ? "the arrow keys" : name === "keys:action" ? "Space or Enter" : "letters and digits"}` : `Clicking ${name.slice(6)}`;
      out.push(`${what} used to change the page before the change was made, and ${now === undefined ? "the page no longer listens to the keyboard" : "now changes nothing"}.`);
    }
  }
  return out;
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

const sourceLine = (content: string, line: number | null, offset = 0) => {
  if (!line) return "";
  const src = content.split("\n")[line - 1]?.trim();
  return src ? ` (line ${line + offset}: ${src.length > 110 ? `${src.slice(0, 110)}…` : src})` : ` (line ${line + offset})`;
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
export function jsSyntaxError(code: string, lineOffset = 0): string | null {
  if (/^\s*(import\s[\w{*'"]|export\s)/m.test(code)) return null;
  try {
    new Script(code, { filename: "artifact.js" });
    return null;
  } catch (e) {
    const err = e as Error;
    const line = Number(/^artifact\.js:(\d+)/.exec(err.stack ?? "")?.[1]) || null;
    return `${err.name}: ${err.message}${sourceLine(code, line, lineOffset)}`;
  }
}

export const isJs = (language: string) => /^(js|javascript|mjs|node)$/i.test(language);
export const isPython = (language: string) => /^(py|python|python3)$/i.test(language);

/** The scripts written inside a page (no src), with the line of the page each one starts on. */
export function inlineScripts(html: string): { code: string; line: number }[] {
  const out: { code: string; line: number }[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(m[1]) || /\btype\s*=\s*["'](?!text\/javascript|module)/i.test(m[1]) || !m[2].trim()) continue;
    const bodyAt = (m.index ?? 0) + m[0].indexOf(">") + 1;
    out.push({ code: m[2], line: html.slice(0, bodyAt).split("\n").length });
  }
  return out;
}

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
    // a page that carries its own script (one file for a whole game) is held to the same standard as a script file:
    // it must parse, and every element it looks for must exist in the page
    const markup = f.content.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
    for (const s of inlineScripts(f.content)) {
      const e = jsSyntaxError(s.code, s.line - 1);
      if (e) out.push(`In the page's script: ${e}`);
      else out.push(...missingElements(s.code, [markup]));
    }
    const ext = /\b(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+/i.exec(f.content);
    if (ext) out.push(`It loads "${ext[0].replace(/^[^=]*=\s*["']/, "")}" from the network, but pages have no network: inline it.`);
  }
  return out;
}
