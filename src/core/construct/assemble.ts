/**
 * The page, put together from the accepted units by code, never by a model. It is valid after every unit: what is not written yet is
 * a stub, so the program already runs (empty) at the first step and fills in as units are accepted.
 */
import { markOf } from "./marks";
import type { Scenario } from "./scenarios";
import type { Accepted, Plan, Unit } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const safeScript = (code: string) => code.replace(/<\/script/gi, "<\\/script");

/** Splits a layout reply into its HTML and its CSS. */
export function splitLayout(code: string): { html: string; css: string } {
  const css = [...code.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1].trim()).join("\n");
  const html = code.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "").trim();
  return { html, css };
}

/**
 * The ids a piece of code draws on with a 2D context (`const c = document.getElementById("stage"); c.getContext("2d")`). A layout written
 * with a plain element there cannot be drawn on; the assembly makes it a canvas, which is what the code plainly means.
 */
export function canvasIds(codes: string[]): string[] {
  const ids = new Set<string>();
  for (const code of codes) {
    for (const m of code.matchAll(/getElementById\(\s*["']([\w-]+)["']\s*\)\s*\.getContext\b/g)) ids.add(m[1]);
    for (const m of code.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*(?:document\.)?getElementById\(\s*["']([\w-]+)["']\s*\)/g)) {
      if (new RegExp(`\\b${m[1].replace(/\$/g, "\\$")}\\s*\\.getContext\\b`).test(code)) ids.add(m[2]);
    }
  }
  return [...ids];
}

/** An empty element of the layout with one of these ids becomes a canvas, keeping its attributes. */
export function asCanvases(html: string, ids: string[]): { html: string; made: string[] } {
  const made: string[] = [];
  let out = html;
  for (const id of ids) {
    const re = new RegExp(`<(div|section|span|main|article)\\b([^>]*\\bid\\s*=\\s*["']${id.replace(/[-]/g, "\\-")}["'][^>]*)>\\s*</\\1>`, "i");
    if (re.test(out)) { out = out.replace(re, (_m, _t, attrs) => `<canvas${attrs}></canvas>`); made.push(id); }
  }
  return { html: out, made };
}

const stub = (u: Unit) => (u.kind === "view" ? `function ${u.name}(S) {}` : u.kind === "handler" ? `function ${u.name}() {}` : `function ${u.name}() { return undefined; }`);

/** The JavaScript that connects an event to a handler: the handler runs, then the page is drawn again. */
export function wiring(handlers: Unit[]): { events: string; loads: string } {
  const events: string[] = [], loads: string[] = [];
  // every element with the id is wired (a model repeats an id for a button on two screens)
  const guarded = (id: string, type: string, name: string, prevent = false) => `Array.prototype.forEach.call(document.querySelectorAll('[id=' + JSON.stringify(${JSON.stringify(id)}) + ']'), function (el) { el.addEventListener(${JSON.stringify(type)}, function (e) { ${prevent ? "e.preventDefault(); " : ""}__run(${name}, e); __go(); }); });`;
  for (const h of handlers) {
    const on = h.on ?? "";
    let m = /^(click|input|change) #([\w-]+)$/.exec(on);
    if (m) { events.push(guarded(m[2], m[1], h.name)); continue; }
    m = /^submit #([\w-]+)$/.exec(on);
    if (m) { events.push(guarded(m[1], "submit", h.name, true)); continue; }
    m = /^tick (\d+)$/.exec(on);
    if (m) { events.push(`setInterval(function () { __run(${h.name}); __go(); }, ${m[1]});`); continue; }
    m = /^(keydown|keyup) (\S+)$/.exec(on);
    if (m) {
      const test = m[2] === "Space" ? 'e.key === " " || e.code === "Space"' : `e.key === ${JSON.stringify(m[2])}`;
      events.push(`document.addEventListener(${JSON.stringify(m[1])}, function (e) { if (${test}) { e.preventDefault(); __run(${h.name}, e); __go(); } });`);
      continue;
    }
    if (on === "key") { events.push(`document.addEventListener("keydown", function (e) { __run(${h.name}, e); __go(); });`); continue; }
    if (on === "load") loads.push(`__run(${h.name});`);
  }
  return { events: events.join("\n"), loads: loads.join("\n") };
}

export function assemblePage(plan: Plan, accepted: Map<string, Accepted>, done = false, scenarios: Scenario[] = []): string {
  const code = (u: Unit) => accepted.get(u.name)?.code;
  const layout = plan.units.find((u) => u.kind === "layout");
  const split = splitLayout((layout && code(layout)) || "<div id=\"app\"></div>");
  const { css } = split;
  const drawn = asCanvases(split.html, canvasIds(plan.units.filter((u) => u.kind !== "layout" && u.kind !== "state").map((u) => code(u) ?? "")));
  const html = drawn.html;
  const state = plan.units.find((u) => u.kind === "state");
  const stateCode = (state && code(state)) || "{}";
  const block = (u: Unit) => `/* unit:${u.name} */\n${safeScript(code(u) ?? stub(u))}\n/* end:${u.name} */`;
  const fns = plan.units.filter((u) => u.kind === "fn"), views = plan.units.filter((u) => u.kind === "view"), handlers = plan.units.filter((u) => u.kind === "handler");
  const wire = wiring(handlers.filter((h) => accepted.has(h.name)));
  const script = `"use strict";
var S = ${safeScript(stateCode)};
${drawn.made.map((id) => `(function () { var c = document.getElementById(${JSON.stringify(id)}); if (c) { c.width = c.clientWidth || c.width; c.height = c.clientHeight || c.height; } })();`).join("\n")}
${[...fns, ...views, ...handlers].map(block).join("\n")}
function __run(f, e) { try { return f(e); } catch (err) { console.error(err); } }
function render() { ${html.includes("<canvas") ? 'Array.prototype.forEach.call(document.querySelectorAll("canvas"), function (c) { var x = c.getContext("2d"); if (x) x.clearRect(0, 0, c.width, c.height); }); ' : ""}${views.map((v) => `try { ${v.name}(S); } catch (err) { console.error(err); }`).join(" ")} }
var __last = "", __queued = false, __at = 0;
function __paint(t) { __queued = false; if (t - __at < 30) { __go(); return; } __at = t; var s; try { s = JSON.stringify(S); } catch (err) { s = "" + Math.random(); } if (s === __last) return; __last = s; render(); }
function __go() { if (!__queued) { __queued = true; requestAnimationFrame(__paint); } }
${wire.events}
${wire.loads}
render();
try { __last = JSON.stringify(S); } catch (err) { __last = ""; }`;
  const style = `html, body { min-height: 100vh; }\nbody { margin: 0; font-family: system-ui, "Segoe UI", sans-serif; }\n${css}`;
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(plan.title)}</title>\n<style>\n${style}\n</style></head>\n<body>\n${html}\n${markOf("x-construct", { title: plan.title, language: plan.language, requirements: plan.requirements, units: plan.units, ...(scenarios.length ? { scenarios } : {}) })}<script>\n${script}\n</script>${done ? "\n<!-- /x-construct -->" : ""}\n</body></html>\n`;
}

/** The accepted units found again in a page this engine made, for taking a stopped build up again. */
export function unitsFromPage(html: string, plan: Plan): Map<string, Accepted> {
  const out = new Map<string, Accepted>();
  const state = plan.units.find((u) => u.kind === "state");
  const sm = /var S = ([\s\S]*?);\s*\n\/\* unit:/.exec(html) ?? /var S = ([\s\S]*?);\s*\nfunction __run/.exec(html);
  if (state && sm && sm[1].trim() !== "{}") out.set(state.name, { code: sm[1], verified: true, problems: [] });
  const layout = plan.units.find((u) => u.kind === "layout");
  if (layout && !/<div id="app"><\/div>/.test(html)) {
    const body = /<body>\n([\s\S]*?)\n<!-- x-construct/.exec(html)?.[1] ?? "";
    const css = /<style>\n[\s\S]*?body \{ margin: 0; font-family: system-ui, "Segoe UI", sans-serif; \}\n([\s\S]*?)\n<\/style>/.exec(html)?.[1] ?? "";
    if (body.trim()) out.set(layout.name, { code: `${body}${css.trim() ? `\n<style>\n${css}\n</style>` : ""}`, verified: true, problems: [] });
  }
  for (const m of html.matchAll(/\/\* unit:([\w$]+) \*\/\n([\s\S]*?)\n\/\* end:\1 \*\//g)) {
    const u = plan.units.find((x) => x.name === m[1]);
    if (!u) continue;
    const body = m[2].replace(/<\\\/script/gi, "</script");
    if (body.trim() === stub(u)) continue; // a stub is not written work
    out.set(u.name, { code: body, verified: true, problems: [] });
  }
  return out;
}
