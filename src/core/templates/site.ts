import { Template, asList, asRows, asText, schemaStr, schemaStrs } from "./kit";
import { BG_KINDS, backgroundPrims, legalize, seedOf } from "../look";
import { primsSvg, themeOf, type Theme } from "../slides";
import { colorOf } from "../slides";
import { inkOn, mixColor } from "../color";

/**
 * Web pages from a description: the model gives a theme (words or a name), a few options and a list of sections with their
 * content; the app turns it into ONE self-contained page (no network, no library): a responsive layout, a sticky menu,
 * sections of 17 kinds, and a hero with a procedural background. The theme is the same engine as for slides (readable colours
 * guaranteed, `findTheme` reads words like "vieux" or "tech"), so a look is chosen once and applies to the whole page.
 * A tool (calculator, converter, simulator) is a page too: inputs, results computed by formulas that are checked before use.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rich = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
const SERIF = /georgia|cambria|palatino|garamond|times/i;
const stack = (f: string) => `'${f}', ${SERIF.test(f) ? "Georgia, 'Times New Roman', serif" : "'Segoe UI', system-ui, -apple-system, Calibri, Arial, sans-serif"}`;
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";

export const SECTION_TYPES = ["hero", "features", "steps", "stats", "pricing", "testimonials", "faq", "team", "timeline", "gallery", "menu", "products", "events", "logos", "cta", "text", "contact"] as const;
const PAGE_TYPES = ["landing", "portfolio", "restaurant", "event", "blog", "product", "nonprofit", "agency", "personal", "school", "app"] as const;
const RADII: Record<string, string> = { none: "0", small: "6px", medium: "12px", large: "20px", pill: "28px" };
const SPACING: Record<string, string> = { compact: "56px", comfortable: "84px", spacious: "120px" };

const ITEM = { type: "object", additionalProperties: false, properties: { title: schemaStr(), text: schemaStr(), icon: schemaStr("one emoji"), value: schemaStr("a figure or a price"), meta: schemaStr("a date, a role, a period, a place"), badge: schemaStr("a short label such as Popular"), points: schemaStrs(), cta: schemaStr("button label"), href: schemaStr(), q: schemaStr(), a: schemaStr() } } as const;
const SECTION = { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", enum: [...SECTION_TYPES] }, id: schemaStr("short anchor name"), title: schemaStr(), subtitle: schemaStr(), text: schemaStr(), items: { type: "array", maxItems: 12, items: ITEM }, cta: schemaStr("main button label"), cta_href: schemaStr(), cta2: schemaStr("second button label"), cta2_href: schemaStr(), email: schemaStr(), layout: { type: "string", enum: ["center", "split", "cards", "list"] } } } as const;

const SITE_SCHEMA = { type: "object", additionalProperties: false, properties: {
  language: { type: "string", enum: ["en", "fr", "es", "de", "pt", "it"] }, title: schemaStr("the name of the site or the person"),
  page_type: { type: "string", enum: [...PAGE_TYPES] }, theme: schemaStr("a theme name or 2 to 4 words that describe the look (old warm serif, tech dark, school colourful, elegant gold)"),
  accent: { type: "string", pattern: "^[0-9A-Fa-f]{6}$", description: "an accent colour if the person named one" },
  radius: { type: "string", enum: Object.keys(RADII) }, spacing: { type: "string", enum: Object.keys(SPACING) }, background: { type: "string", enum: [...BG_KINDS], description: "the procedural background of the top of the page" }, seed: { type: "integer", minimum: 0, maximum: 99999 },
  sections: { type: "array", minItems: 3, maxItems: 14, items: SECTION }, footer: schemaStr("a line for the foot of the page"), links: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, properties: { label: schemaStr(), href: schemaStr() } } }
} } as const;

function css(t: Theme, radius: string, space: string): string {
  const on = inkOn(t.accent), line = mixColor(t.bg, t.text, 0.14), a2 = t.accents[1] ?? t.accent;
  return `:root{--bg:#${t.bg};--text:#${t.text};--title:#${t.title};--muted:#${t.muted};--accent:#${t.accent};--accent2:#${a2};--panel:#${t.panel};--line:#${line};--on:#${on};--r:${radius};--sp:${space}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.65 ${stack(t.bodyFont)}}
h1,h2,h3{font-family:${stack(t.titleFont)};color:var(--title);line-height:1.15;margin:0 0 .5em}h1{font-size:clamp(2.3rem,5.5vw,4rem)}h2{font-size:clamp(1.7rem,3.4vw,2.5rem)}h3{font-size:1.2rem}p{margin:0 0 1em}a{color:var(--accent)}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}.muted{color:var(--muted)}
nav{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}nav .wrap{display:flex;align-items:center;gap:20px;height:64px}nav b{font-family:${stack(t.titleFont)};color:var(--title);font-size:1.15rem;margin-right:auto}nav a{color:var(--text);text-decoration:none;font-size:.95rem}nav a:hover{color:var(--accent)}
@media(max-width:720px){nav a:not(.btn){display:none}}
.btn{display:inline-block;padding:.8em 1.5em;border-radius:var(--r);background:var(--accent);color:var(--on)!important;font-weight:600;text-decoration:none;border:2px solid var(--accent)}.btn.alt{background:transparent;color:var(--accent)!important}
section{padding:var(--sp) 0}section.alt{background:var(--panel)}section>.wrap>header{max-width:680px;margin-bottom:40px}section>.wrap>header.c{margin-left:auto;margin-right:auto;text-align:center}
.hero{position:relative;overflow:hidden;padding:calc(var(--sp)*1.3) 0}.hero .bg{position:absolute;inset:0;z-index:0}.hero .bg svg{width:100%;height:100%;display:block}.hero .bg:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--bg) 0%,color-mix(in srgb,var(--bg) 60%,transparent) 45%,transparent 80%)}.hero.center .bg:after{background:radial-gradient(ellipse at center,color-mix(in srgb,var(--bg) 70%,transparent) 0%,transparent 70%)}.hero .wrap{position:relative;z-index:1}.hero .lead{font-size:1.25rem;max-width:620px;color:var(--muted)}.hero.center{text-align:center}.hero.center .lead{margin-left:auto;margin-right:auto}.hero .btns{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.hero.center .btns{justify-content:center}
.hero.split .wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center}.hero .art{aspect-ratio:1;border-radius:calc(var(--r)*3);background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;font-size:6rem;box-shadow:0 30px 60px -30px var(--accent)}@media(max-width:820px){.hero.split .wrap{grid-template-columns:1fr}.hero .art{display:none}}
.grid{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:26px}section.alt .card{background:var(--bg)}.card .ic{font-size:2rem;margin-bottom:10px;display:block}.card p{color:var(--muted);margin:0}
.price{font-size:2.4rem;font-weight:700;color:var(--title);font-family:${stack(t.titleFont)}}.card.pop{border:2px solid var(--accent);position:relative}.badge{display:inline-block;font-size:.75rem;font-weight:700;padding:.2em .8em;border-radius:99px;background:var(--accent);color:var(--on);margin-bottom:10px}ul.pts{list-style:none;padding:0;margin:14px 0 18px}ul.pts li{padding:5px 0 5px 24px;position:relative;color:var(--text)}ul.pts li:before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:700}
.stats .v{font-size:3rem;font-weight:700;color:var(--accent);font-family:${stack(t.titleFont)};line-height:1}.stats .card{text-align:center}
.steps .n{width:42px;height:42px;border-radius:50%;background:var(--accent);color:var(--on);display:grid;place-items:center;font-weight:700;margin-bottom:12px}
blockquote{margin:0;font-size:1.1rem;font-style:italic}.who{margin-top:14px;font-style:normal;font-size:.9rem;color:var(--muted)}
details{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 22px;margin-bottom:12px}section.alt details{background:var(--bg)}summary{cursor:pointer;font-weight:600;color:var(--title)}details p{margin:12px 0 0;color:var(--muted)}
.tl{border-left:3px solid var(--accent);padding-left:26px;margin-left:8px}.tl .e{position:relative;margin-bottom:28px}.tl .e:before{content:"";position:absolute;left:-35px;top:6px;width:14px;height:14px;border-radius:50%;background:var(--accent)}.tl .when{font-weight:700;color:var(--accent)}
.av{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));color:var(--on);display:grid;place-items:center;font-size:1.8rem;margin-bottom:12px}
.tile{aspect-ratio:4/3;border-radius:var(--r);display:grid;place-items:center;font-size:3rem;color:var(--on);text-align:center;padding:12px}.tile span{font-size:.95rem;font-weight:600}
.menu .row{display:flex;gap:12px;align-items:baseline;padding:12px 0;border-bottom:1px dashed var(--line)}.menu .row h3{margin:0}.menu .row .dots{flex:1}.menu .row .v{font-weight:700;color:var(--accent)}
.logos{display:flex;flex-wrap:wrap;gap:12px 36px;justify-content:center;color:var(--muted);font-weight:700;font-size:1.15rem;letter-spacing:.04em}
.cta{text-align:center;background:var(--accent);color:var(--on)}.cta h2,.cta p{color:var(--on)}.cta .btn{background:var(--on);color:var(--accent)!important;border-color:var(--on)}
form{display:grid;gap:14px;max-width:560px}input,textarea{font:inherit;padding:.8em 1em;border-radius:var(--r);border:1px solid var(--line);background:var(--bg);color:var(--text)}
footer{padding:40px 0;border-top:1px solid var(--line);color:var(--muted);font-size:.92rem}footer .wrap{display:flex;gap:20px;flex-wrap:wrap;justify-content:space-between}footer a{color:var(--muted);margin-left:16px}`;
}

const sectionHtml = (s: Record<string, unknown>, i: number, t: Theme, hero: { svg: string }): string => {
  const type = asText(s.type), items = asRows(s.items), title = asText(s.title), sub = asText(s.subtitle), text = asText(s.text), id = slug(asText(s.id) || title || type);
  const alt = i % 2 === 1 ? " alt" : "";
  const head = (center = false) => (title || sub ? `<header${center ? ' class="c"' : ""}>${title ? `<h2>${esc(title)}</h2>` : ""}${sub ? `<p class="muted">${esc(sub)}</p>` : ""}</header>` : "");
  const btn = (label: string, href: string, alt2 = false) => (label ? `<a class="btn${alt2 ? " alt" : ""}" href="${esc(href || "#contact")}">${esc(label)}</a>` : "");
  const card = (it: Record<string, unknown>, extra = "") => `<div class="card${extra}">${asText(it.badge) ? `<span class="badge">${esc(asText(it.badge))}</span>` : ""}${asText(it.icon) ? `<span class="ic">${esc(asText(it.icon))}</span>` : ""}${asText(it.value) ? `<div class="price">${esc(asText(it.value))}</div>` : ""}${asText(it.title) ? `<h3>${esc(asText(it.title))}</h3>` : ""}${asText(it.meta) ? `<p class="muted">${esc(asText(it.meta))}</p>` : ""}${asText(it.text) ? `<p>${rich(asText(it.text))}</p>` : ""}${asList(it.points).length ? `<ul class="pts">${asList(it.points).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}${asText(it.cta) ? btn(asText(it.cta), asText(it.href)) : ""}</div>`;
  const grid = (cls = "") => `<div class="grid ${cls}">${items.map((it) => card(it)).join("")}</div>`;
  switch (type) {
    case "hero": {
      const split = asText(s.layout) === "split";
      const icon = asText(items[0]?.icon) || "✨";
      return `<section class="hero ${split ? "split" : "center"}" id="${id}"><div class="bg">${hero.svg}</div><div class="wrap"><div><h1>${esc(title)}</h1>${sub ? `<p class="lead">${esc(sub)}</p>` : ""}${text ? `<p>${rich(text)}</p>` : ""}<div class="btns">${btn(asText(s.cta), asText(s.cta_href))}${btn(asText(s.cta2), asText(s.cta2_href), true)}</div></div>${split ? `<div class="art">${esc(icon)}</div>` : ""}</div></section>`;
    }
    case "features": return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head()}${grid()}</div></section>`;
    case "steps": return `<section class="steps${alt}" id="${id}"><div class="wrap">${head()}<div class="grid">${items.map((it, k) => `<div class="card"><div class="n">${k + 1}</div><h3>${esc(asText(it.title))}</h3><p>${rich(asText(it.text))}</p></div>`).join("")}</div></div></section>`;
    case "stats": return `<section class="stats${alt}" id="${id}"><div class="wrap">${head(true)}<div class="grid">${items.map((it) => `<div class="card"><div class="v">${esc(asText(it.value))}</div><p>${esc(asText(it.title) || asText(it.text))}</p></div>`).join("")}</div></div></section>`;
    case "pricing": return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head(true)}<div class="grid">${items.map((it) => card({ ...it, cta: asText(it.cta) || "→" }, asText(it.badge) ? " pop" : "")).join("")}</div></div></section>`;
    case "testimonials": return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head(true)}<div class="grid">${items.map((it) => `<div class="card"><blockquote>“${esc(asText(it.text) || asText(it.q))}”</blockquote><div class="who"><b>${esc(asText(it.title))}</b>${asText(it.meta) ? ` · ${esc(asText(it.meta))}` : ""}</div></div>`).join("")}</div></div></section>`;
    case "faq": return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head()}<div style="max-width:760px">${items.map((it) => `<details><summary>${esc(asText(it.q) || asText(it.title))}</summary><p>${rich(asText(it.a) || asText(it.text))}</p></details>`).join("")}</div></div></section>`;
    case "team": return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head()}<div class="grid">${items.map((it) => `<div class="card"><div class="av">${esc(asText(it.icon) || (asText(it.title)[0] ?? "•").toUpperCase())}</div><h3>${esc(asText(it.title))}</h3><p class="muted">${esc(asText(it.meta))}</p><p>${esc(asText(it.text))}</p></div>`).join("")}</div></div></section>`;
    case "timeline": return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head()}<div class="tl">${items.map((it) => `<div class="e"><div class="when">${esc(asText(it.meta) || asText(it.value))}</div><h3>${esc(asText(it.title))}</h3><p class="muted">${rich(asText(it.text))}</p></div>`).join("")}</div></div></section>`;
    case "gallery": return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head()}<div class="grid">${items.map((it, k) => `<div class="tile" style="background:linear-gradient(${120 + k * 37}deg,${t.accents[k % t.accents.length] ? "#" + t.accents[k % t.accents.length] : "var(--accent)"},#${mixColor(t.accents[(k + 1) % t.accents.length], t.bg, 0.25)})"><div>${esc(asText(it.icon) || "🖼")}<br><span>${esc(asText(it.title))}</span></div></div>`).join("")}</div></div></section>`;
    case "menu": return `<section class="menu${alt}" id="${id}"><div class="wrap">${head()}<div style="max-width:760px">${items.map((it) => `<div class="row"><div><h3>${esc(asText(it.title))}</h3><p class="muted" style="margin:0">${esc(asText(it.text))}</p></div><span class="dots"></span><span class="v">${esc(asText(it.value))}</span></div>`).join("")}</div></div></section>`;
    case "products": return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head()}<div class="grid">${items.map((it) => card({ ...it, cta: asText(it.cta) || "→" })).join("")}</div></div></section>`;
    case "events": return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head()}<div class="grid">${items.map((it) => card({ ...it, icon: asText(it.icon) || "📅" })).join("")}</div></div></section>`;
    case "logos": return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head(true)}<div class="logos">${items.map((it) => `<span>${esc(asText(it.title))}</span>`).join("")}</div></div></section>`;
    case "cta": return `<section class="cta" id="${id}"><div class="wrap"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}${btn(asText(s.cta), asText(s.cta_href))}</div></section>`;
    case "contact": { const mail = asText(s.email); return `<section class="${alt.trim()}" id="${id || "contact"}"><div class="wrap">${head()}${mail ? `<form action="mailto:${esc(mail)}" method="post" enctype="text/plain"><input name="name" placeholder="Name" required><input name="email" type="email" placeholder="Email" required><textarea name="message" rows="5" placeholder="Message" required></textarea><button class="btn" type="submit">${esc(asText(s.cta) || "Send")}</button></form>` : ""}${text ? `<p>${rich(text)}</p>` : ""}</div></section>`; }
    default: return `<section class="${alt.trim()}" id="${id}"><div class="wrap">${head()}<div style="max-width:760px">${text ? `<p>${rich(text)}</p>` : ""}${items.map((it) => `<h3>${esc(asText(it.title))}</h3><p>${rich(asText(it.text))}</p>`).join("")}</div></div></section>`;
  }
};

function themeFor(d: Record<string, unknown>): Theme {
  // a listed theme, a made one's id or plain words ("old warm serif", "tech dark"): the same reading as for slides
  let t = themeOf(`Theme: ${asText(d.theme) || "clean"}\n\n---\n#`);
  const accent = asText(d.accent) ? colorOf(asText(d.accent)) : undefined;
  if (accent) t = { ...t, accent, accents: [accent, ...t.accents.slice(1)] };
  return legalize(t).theme;
}

export function renderSite(d: Record<string, unknown>): { source: string; title: string } {
  const t = themeFor(d);
  const sections = asRows(d.sections).filter((s) => asText(s.type));
  const title = asText(d.title) || "Site";
  const kind = (BG_KINDS as readonly string[]).includes(asText(d.background)) ? (asText(d.background) as (typeof BG_KINDS)[number]) : (t.bgkind ?? "mesh");
  const seed = Number.isInteger(d.seed) ? (d.seed as number) : seedOf(title);
  const heroT = { ...t, bg: t.bg };
  const svg = primsSvg(backgroundPrims(kind, seed, heroT, 0.9), "xMidYMid slice");
  const nav = sections.filter((s) => asText(s.type) !== "hero" && asText(s.type) !== "cta" && asText(s.title)).slice(0, 5);
  const cta = sections.find((s) => asText(s.type) === "hero");
  const body = sections.map((s, i) => sectionHtml(s, i, t, { svg })).join("\n");
  const links = asRows(d.links).filter((l) => asText(l.label));
  const spec = JSON.stringify(d).replace(/</g, "\\u003c");
  const html = `<!DOCTYPE html>
<html lang="${asText(d.language) || "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${css(t, RADII[asText(d.radius)] ?? RADII.medium, SPACING[asText(d.spacing)] ?? SPACING.comfortable)}
</style>
</head>
<body>
<nav><div class="wrap"><b>${esc(title)}</b>${nav.map((s) => `<a href="#${slug(asText(s.id) || asText(s.title))}">${esc(asText(s.title))}</a>`).join("")}${cta && asText(cta.cta) ? `<a class="btn" href="${esc(asText(cta.cta_href) || "#contact")}">${esc(asText(cta.cta))}</a>` : ""}</div></nav>
${body}
<footer><div class="wrap"><span>${esc(asText(d.footer) || `© ${new Date().getFullYear()} ${title}`)}</span><span>${links.map((l) => `<a href="${esc(asText(l.href) || "#")}">${esc(asText(l.label))}</a>`).join("")}</span></div></footer>
<script type="application/json" id="site-spec">${spec}</script>
</body>
</html>
`;
  return { source: html, title };
}

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

export function renderTool(d: Record<string, unknown>): { source: string; title: string } {
  const t = themeFor(d), title = asText(d.title) || "Calculator";
  const inputs = asRows(d.inputs).filter((r) => /^[a-z][a-z0-9_]*$/.test(asText(r.id)));
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
${css(t, RADII.medium, "40px")}
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

export const SITE_TEMPLATES: Template[] = [
  { id: "site", kind: "site", name: "One-page website", summary: "A responsive one-page site: hero, features, steps, stats, pricing, testimonials, faq, team, timeline, gallery, menu, products, events, logos, call to action, text, contact", words: /\b(landing page|landing|web ?site|site web|site vitrine|site internet|one[- ]?page|page d'accueil|home ?page|portfolio|sitio web|p[áa]gina web|webseite|site pessoal|sito web|vitrine)\b/i,
    schema: SITE_SCHEMA,
    problems: (x) => { const d = x as Record<string, unknown>; if (!d || typeof d !== "object") return ["the answer is not a JSON object"]; const s = asRows(d.sections); const out: string[] = []; if (s.length < 3) out.push("a page needs at least 3 sections"); if (s.length && asText(s[0].type) !== "hero") out.push("the first section must be the hero"); if (!asText(d.title)) out.push("the title is missing"); return out; },
    render: (x) => renderSite((x ?? {}) as Record<string, unknown>) },
  { id: "calculator", kind: "tool", name: "Calculator / simulator / converter", summary: "A page with inputs and results computed by formulas (BMI, tip, loan payment, unit conversion, estimates)", words: /\b(simulat\w+|convertisseur|converter|calculateur|calculadora de|rechner|estimat\w+|imc|bmi|tip calculator|pourboire|calculator for|calcul(?:ate)? (?:my|the|a)\b)\b/i,
    schema: TOOL_SCHEMA,
    problems: (x) => { const d = x as Record<string, unknown>; if (!d || typeof d !== "object") return ["the answer is not a JSON object"]; const ids = asRows(d.inputs).map((r) => asText(r.id)); const out: string[] = []; for (const o of asRows(d.outputs)) if (!safeFormula(asText(o.formula), ids)) out.push(`the formula "${asText(o.formula)}" of "${asText(o.label)}" is not valid: use only the input ids (${ids.join(", ")}), numbers, + - * / ^ ( ) and min max round floor ceil pow sqrt abs log exp`); if (!asRows(d.outputs).length) out.push("there is no result"); return out; },
    render: (x) => renderTool((x ?? {}) as Record<string, unknown>) }
];
