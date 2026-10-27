import { Template, asRows, asText, schemaStr } from "./kit";
import { pageCss, stack } from "../page/css";
import { pageTheme } from "../page/theme";
import { PAGE_SCHEMA, RADII, type PageSpec } from "../page/catalog";
import { pageToHtml } from "../page/html";
import { ICON_NAMES } from "../page/icons";

/**
 * Web pages from a description: the model gives a theme (words or a name), a few options and a list of sections with their
 * content; the app turns it into ONE self-contained page (no network, no library): a responsive layout, a sticky menu,
 * sections of 17 kinds, and a hero with a procedural background. The theme is the same engine as for slides (readable colours
 * guaranteed, `findTheme` reads words like "vieux" or "tech"), so a look is chosen once and applies to the whole page.
 * A tool (calculator, converter, simulator) is a page too: inputs, results computed by formulas that are checked before use.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rich = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
// ---------------------------------------------------------------- tools
const MATH = ["min", "max", "round", "floor", "ceil", "pow", "sqrt", "abs", "log", "log10", "exp", "PI"];
/** A formula the page may run: numbers, the names of the inputs, + - * / % ( ) , ? : comparisons and a few Math functions. */
export function safeFormula(f: string, ids: string[]): string | null {
  const t = f.trim().replace(/\^/g, "**");
  if (!t || t.length > 300 || /[^\w\s+\-*/%().,?:<>=!&|]/.test(t)) return null;
  for (const w of t.match(/[A-Za-z_]\w*/g) ?? []) if (!ids.includes(w) && !MATH.includes(w) && w !== "Math") return null;
  return t.replace(/\b(min|max|round|floor|ceil|pow|sqrt|abs|log10|log|exp)\b/g, "Math.$1").replace(/\bPI\b/g, "Math.PI").replace(/Math\.Math\./g, "Math.");
}
const TOOL_SCHEMA = { type: "object", additionalProperties: false, required: ["title", "inputs", "outputs"], properties: {
  language: { type: "string", enum: ["en", "fr", "es", "de", "pt", "it"] }, title: schemaStr(), description: schemaStr("one sentence about what it computes"), theme: schemaStr("theme words or name"), accent: { type: "string", pattern: "^[0-9A-Fa-f]{6}$" },
  inputs: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", pattern: "^[a-z][a-z0-9_]{0,15}$", description: "short lowercase name used in the formulas" }, label: schemaStr(), unit: schemaStr(), value: schemaStr("the default value"), min: schemaStr(), max: schemaStr(), step: schemaStr(), options: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, properties: { label: schemaStr(), value: schemaStr() } }, description: "for a choice list: each option's label and numeric value" } } } },
  outputs: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["label", "formula"], properties: { label: schemaStr(), formula: schemaStr("an arithmetic formula using the input ids, e.g. weight / (height/100)^2"), unit: schemaStr(), decimals: { type: "integer", minimum: 0, maximum: 6 }, note: schemaStr() } } },
  notes: schemaStr("a short note under the results")
} } as const;

export function renderTool(d: Record<string, unknown>, live = false): { source: string; title: string } {
  const t = pageTheme(d as PageSpec), title = asText(d.title) || "Calculator";
  const inputs = asRows(d.inputs).filter((r) => /^[a-z][a-z0-9_]*$/.test(asText(r.id)) && (!live || asText(r.label)));
  // while it is written, a page with no field yet is not drawn: it would be a title above two empty cards
  if (live && !inputs.length) return { source: "", title };
  const ids = inputs.map((r) => asText(r.id));
  const outs = asRows(d.outputs).map((o) => ({ o, f: safeFormula(asText(o.formula), ids) })).filter((x) => x.f);
  const field = (r: Record<string, unknown>) => {
    const id = asText(r.id), opts = asRows(r.options).filter((x) => asText(x.label));
    const control = opts.length ? `<select id="${id}">${opts.map((x, i) => `<option value="${esc(asText(x.value))}"${asText(r.value) === asText(x.value) || (!asText(r.value) && i === 0) ? " selected" : ""}>${esc(asText(x.label))}</option>`).join("")}</select>`
      : `<input id="${id}" type="number" step="${esc(asText(r.step) || "any")}" value="${esc(asText(r.value))}"${asText(r.min) ? ` min="${esc(asText(r.min))}"` : ""}${asText(r.max) ? ` max="${esc(asText(r.max))}"` : ""}>`;
    return `<label>${esc(asText(r.label))}${asText(r.unit) ? ` <span class="muted">(${esc(asText(r.unit))})</span>` : ""}${control}</label>`;
  };
  const code = `const ids=${JSON.stringify(ids)};const fx=[${outs.map((x) => `[${JSON.stringify(asText(x.o.label))},(${ids.join(",")})=>(${x.f}),${JSON.stringify(asText(x.o.unit))},${Number.isInteger(x.o.decimals) ? x.o.decimals : 2},${JSON.stringify(asText(x.o.note))}]`).join(",")}];
const val=id=>parseFloat(document.getElementById(id).value);
function go(){const v=ids.map(val);document.getElementById("res").innerHTML=fx.map(([l,f,u,d,n])=>{let r;try{r=f(...v)}catch(e){r=NaN}const ok=Number.isFinite(r);return '<div class="out"><span class="muted">'+l+'</span><b>'+(ok?r.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—')+(ok&&u?' <small>'+u+'</small>':'')+'</b>'+(n?'<small class="muted">'+n+'</small>':'')+'</div>'}).join("")}
document.querySelectorAll("input,select").forEach(e=>e.addEventListener("input",go));go();`.replace(/<\/script/gi, "<\\/script");
  const html = `<!DOCTYPE html>
<html lang="${asText(d.language) || "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${pageCss(t, RADII.medium, "40px")}
body{display:grid;place-items:start center;min-height:100vh;padding:32px 16px}.tool{width:100%;max-width:640px}.tool .card{padding:28px;margin-bottom:20px}label{display:grid;gap:6px;margin-bottom:16px;font-weight:600;color:var(--title)}label input,label select{font-weight:400}
.out{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;padding:12px 0;border-bottom:1px dashed var(--line)}.out:last-child{border:0}.out b{font-size:1.6rem;color:var(--accent);font-family:${stack(t.titleFont)}}.out small{flex-basis:100%}
</style>
</head>
<body>
<main class="tool"><h1>${esc(title)}</h1>${asText(d.description) ? `<p class="muted">${esc(asText(d.description))}</p>` : ""}
<div class="card">${inputs.map(field).join("")}</div>
<div class="card" id="res" aria-live="polite"></div>
${asText(d.notes) ? `<p class="muted"><small>${esc(asText(d.notes))}</small></p>` : ""}</main>
<script>
${code}
</script>
<script type="application/json" id="site-spec">${JSON.stringify({ ...d, outputs: outs.map((x) => x.o) }).replace(/</g, "\\u003c")}</script>
</body>
</html>
`;
  return { source: html, title };
}

const KINDS = ["hero", "features", "steps", "stats", "pricing", "testimonials", "faq", "team", "timeline", "gallery", "menu", "products", "events", "logos", "cta", "text", "contact"];
const first = (r: Record<string, unknown>, keys: string[]) => { for (const k of keys) if (asText(r[k])) return asText(r[k]); return ""; };
/** One item written with the words of its kind (name, description, price, question...) as the fields of a block item. */
function itemOf(r: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {}, set = (k: string, v: string) => { if (v) o[k] = v; };
  set("title", first(r, ["title", "name", "label", "event", "author", "caption", "step_title"]));
  if (asText(r.quote)) { set("text", asText(r.quote)); set("title", first(r, ["author", "name"])); set("meta", asText(r.role)); }
  else set("text", first(r, ["text", "description", "bio", "answer_text"]));
  if (asText(r.question)) { set("q", asText(r.question)); set("a", asText(r.answer)); delete o.title; }
  if (asText(r.year) || asText(r.date)) { set("meta", first(r, ["year", "date"])); if (!o.title) set("title", first(r, ["event", "text"])); }
  set("meta", asText(o.meta) || first(r, ["role", "place", "when"]));
  set("value", first(r, ["value", "price"]));
  set("icon", asText(r.icon));
  if (Array.isArray(r.points)) o.points = r.points.map(asText).filter(Boolean);
  for (const k of ["badge", "cta", "href"]) set(k, asText(r[k]));
  return o;
}
/** A page the model wrote with one key per block (hero, features...) instead of a `sections` list is turned into sections; a page with `sections` is left as it is. */
export function shapePage(x: unknown): PageSpec {
  const d = ((x ?? {}) as Record<string, unknown>);
  if (Array.isArray(d.sections)) return d as PageSpec;
  const sections: Record<string, unknown>[] = [];
  for (const k of KINDS) {
    const v = d[k];
    if (!v || typeof v !== "object") continue;
    if (k === "hero" && !Array.isArray(v)) { const h = v as Record<string, unknown>; sections.push({ type: "hero", title: asText(h.title), subtitle: asText(h.subtitle), text: asText(h.text), cta: first(h, ["cta", "cta_text", "button"]), cta_href: asText(h.cta_href) }); continue; }
    const body = Array.isArray(v) ? { items: v } as Record<string, unknown> : v as Record<string, unknown>;
    const items = asRows(body.items ?? (Array.isArray(v) ? v : [])).map(itemOf).filter((i) => Object.keys(i).length);
    if (k === "cta" || k === "text" || k === "contact") { sections.push({ type: k, title: asText(body.title), subtitle: asText(body.subtitle), text: asText(body.text), cta: first(body, ["cta", "cta_text", "button"]), email: asText(body.email), ...(items.length ? { items } : {}) }); continue; }
    if (items.length) sections.push({ type: k, title: asText(body.title), subtitle: asText(body.subtitle), items });
  }
  const rest = { ...d };
  for (const k of KINDS) delete rest[k];
  return { ...rest, title: asText(rest.title) || asText(sections[0]?.title), sections } as PageSpec;
}

export const SITE_TEMPLATES: Template[] = [
  { id: "site", kind: "site", name: "One-page website", summary: "A responsive one-page site: hero, features, steps, stats, pricing, testimonials, faq, team, timeline, gallery, menu, products, events, logos, call to action, text, contact", words: /\b(landing page|landing|web ?site|site web|site vitrine|site internet|one[- ]?page|page d'accueil|home ?page|portfolio|sitio web|p[áa]gina web|webseite|site pessoal|sito web|vitrine)\b/i,
    schema: PAGE_SCHEMA,
    hint: `Icons: with icon_style "icons" (the default, professional) the icon field of an item is an icon name from this list, chosen to fit the item; with "emoji" it is one emoji. Choose "emoji" only for a playful or personal subject, or when the person asks. Names: ${ICON_NAMES.join(", ")}.`,
    problems: (x) => { const d = shapePage(x) as Record<string, unknown>; if (!x || typeof x !== "object") return ["the answer is not a JSON object"]; const s = asRows(d.sections); const out: string[] = []; if (s.length < 3) out.push("a page needs at least 3 sections"); if (s.length && asText(s[0].type) !== "hero") out.push("the first section must be the hero"); if (!asText(d.title)) out.push("the title is missing"); return out; },
    // while it is written, a page with no section yet (or an answer that is not the page's shape) is not drawn: it would show an empty menu and footer
    render: (x, o) => {
      const spec = shapePage(x), title = asText(spec.title) || "Site";
      if (o?.live && !asRows(spec.sections).length) return { source: "", title };
      let source = pageToHtml(spec);
      // the footer the page makes by itself ("© title") is not something the model wrote: it is left out until the model gives one
      if (o?.live && !asText(spec.footer) && !asRows(spec.links).length) source = source.replace(/<footer>[\s\S]*?<\/footer>/, "");
      return { source, title };
    } },
  { id: "calculator", kind: "tool", name: "Calculator / simulator / converter", summary: "A page with inputs and results computed by formulas (BMI, tip, loan payment, unit conversion, estimates)", words: /\b(simulat\w+|convertisseur|converter|calculateur|calculadora de|rechner|estimat\w+|imc|bmi|tip calculator|pourboire|calculator for|calcul(?:ate)? (?:my|the|a)\b)\b/i,
    schema: TOOL_SCHEMA,
    problems: (x) => { const d = x as Record<string, unknown>; if (!d || typeof d !== "object") return ["the answer is not a JSON object"]; const ids = asRows(d.inputs).map((r) => asText(r.id)); const out: string[] = []; for (const o of asRows(d.outputs)) if (!safeFormula(asText(o.formula), ids)) out.push(`the formula "${asText(o.formula)}" of "${asText(o.label)}" is not valid: use only the input ids (${ids.join(", ")}), numbers, + - * / ^ ( ) and min max round floor ceil pow sqrt abs log exp`); if (!asRows(d.outputs).length) out.push("there is no result"); return out; },
    render: (x, o) => renderTool((x ?? {}) as Record<string, unknown>, !!o?.live) }
];
