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

const stub = (u: Unit) => (u.kind === "view" ? `function ${u.name}(S) {}` : u.kind === "handler" ? `function ${u.name}() {}` : `function ${u.name}() { return undefined; }`);

/** The JavaScript that connects an event to a handler: the handler runs, then the page is drawn again. */
export function wiring(handlers: Unit[]): { events: string; loads: string } {
  const events: string[] = [], loads: string[] = [];
  const guarded = (id: string, type: string, name: string, prevent = false) => `(function () { var el = document.getElementById(${JSON.stringify(id)}); if (el) el.addEventListener(${JSON.stringify(type)}, function (e) { ${prevent ? "e.preventDefault(); " : ""}__run(${name}, e); __go(); }); })();`;
  for (const h of handlers) {
    const on = h.on ?? "";
    let m = /^(click|input|change) #([\w-]+)$/.exec(on);
    if (m) { events.push(guarded(m[2], m[1], h.name)); continue; }
    m = /^submit #([\w-]+)$/.exec(on);
    if (m) { events.push(guarded(m[1], "submit", h.name, true)); continue; }
    m = /^tick (\d+)$/.exec(on);
    if (m) { events.push(`setInterval(function () { __run(${h.name}); __go(); }, ${m[1]});`); continue; }
    if (on === "key") { events.push(`document.addEventListener("keydown", function (e) { __run(${h.name}, e); __go(); });`); continue; }
    if (on === "load") loads.push(`__run(${h.name});`);
  }
  return { events: events.join("\n"), loads: loads.join("\n") };
}

export function assemblePage(plan: Plan, accepted: Map<string, Accepted>, done = false, scenarios: Scenario[] = []): string {
  const code = (u: Unit) => accepted.get(u.name)?.code;
  const layout = plan.units.find((u) => u.kind === "layout");
  const { html, css } = splitLayout((layout && code(layout)) || "<div id=\"app\"></div>");
  const state = plan.units.find((u) => u.kind === "state");
  const stateCode = (state && code(state)) || "{}";
  const block = (u: Unit) => `/* unit:${u.name} */\n${safeScript(code(u) ?? stub(u))}\n/* end:${u.name} */`;
  const fns = plan.units.filter((u) => u.kind === "fn"), views = plan.units.filter((u) => u.kind === "view"), handlers = plan.units.filter((u) => u.kind === "handler");
  const wire = wiring(handlers.filter((h) => accepted.has(h.name)));
  const script = `"use strict";
var S = ${safeScript(stateCode)};
${[...fns, ...views, ...handlers].map(block).join("\n")}
function __run(f, e) { try { return f(e); } catch (err) { console.error(err); } }
function render() { ${views.map((v) => `try { ${v.name}(S); } catch (err) { console.error(err); }`).join(" ")} }
function __go() { render(); }
${wire.events}
${wire.loads}
render();`;
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
