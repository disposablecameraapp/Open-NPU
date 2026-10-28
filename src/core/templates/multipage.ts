import { asRows, asText, schemaStr } from "./kit";
import type { PageSpec } from "../page/catalog";

/**
 * A website of several pages. The model works in small runs: one for the plan of the site (its look, its pages and what each is for), then one
 * per page, which sees only the plan and its own page. The look is written once in the plan and given to every page, so the pages are alike and
 * their CSS is the same text copied into each file. The menu goes from page to page.
 */
export const MAX_PAGES = 8;

/** Words that say the site has several pages. */
const SEVERAL = /\b(multi[- ]?pages?|several pages|(?:\d+|two|three|four|five|six|deux|trois|quatre|cinq|six) pages|plusieurs pages|pages? (?:about|contact|pricing|blog|services|team)|pages? (?:[àa] propos|tarifs|[ée]quipe)|(?:about|contact|services|pricing|blog) and (?:about|contact|services|pricing|blog) pages?|with (?:an? )?(?:about|contact) page|avec (?:une )?page|site (?:avec|de) (?:plusieurs|\d+) pages|multi[- ]?page website)\b/i;
export const wantsSeveralPages = (request: string): boolean => SEVERAL.test(request);

export const SITE_PLAN_SCHEMA = { type: "object", additionalProperties: false, required: ["title", "pages"], properties: {
  language: { type: "string", enum: ["en", "fr", "es", "de", "pt", "it"] },
  title: schemaStr("the name of the site or the person"),
  theme: schemaStr("a theme name or 2 to 4 words that describe the look, for the whole site"),
  accent: { type: "string", pattern: "^[0-9A-Fa-f]{6}$" },
  footer: schemaStr("a line for the foot of every page"),
  pages: { type: "array", minItems: 2, maxItems: MAX_PAGES, items: { type: "object", additionalProperties: false, required: ["file", "title", "purpose"], properties: {
    file: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,23}$", description: "file name without .html; the first page is \"index\"" },
    title: schemaStr("the label of the page in the menu, one or two words"),
    purpose: schemaStr("what this page is for and what it should say, in one or two sentences")
  } } }
} } as const;

/**
 * The schema of ONE page of the site, smaller than a whole page's: the title, footer and links come from the plan, the look from the first page,
 * so only the first page is asked for the look and the others for their sections alone. A smaller schema starts writing sooner (the server
 * compiles it into a grammar before the first word) and leaves the small model less to wander into.
 */
export function pageSchemaOf(full: object, index: number): object {
  const f = full as { properties?: Record<string, unknown> } & Record<string, unknown>;
  const keep = index === 0 ? ["language", "theme", "accent", "radius", "spacing", "background", "icon_style", "motion", "seed", "sections"] : ["sections"];
  const properties = Object.fromEntries(Object.entries(f.properties ?? {}).filter(([k]) => keep.includes(k)));
  return { ...f, required: ["sections"], properties };
}

export interface SitePlan { language?: string; title: string; theme?: string; accent?: string; footer?: string; pages: { file: string; title: string; purpose: string }[] }

export const FILES_OF = (plan: SitePlan): string[] => plan.pages.map((p) => `${p.file}.html`);

/** The plan as the model gave it, cleaned: file names are unique, the first page is index. */
export function cleanPlan(x: unknown): SitePlan | null {
  const d = x as Record<string, unknown>;
  if (!d || typeof d !== "object") return null;
  const seen = new Set<string>();
  const pages = asRows(d.pages).map((p, i) => {
    let file = asText(p.file).toLowerCase().replace(/\.html?$/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || `page-${i + 1}`;
    if (seen.has(file)) file = `${file}-${i + 1}`;
    seen.add(file);
    return { file, title: asText(p.title) || file, purpose: asText(p.purpose) };
  }).slice(0, MAX_PAGES);
  if (pages.length && pages[0].file !== "index") {
    for (const p of pages) if (p.file === "index") p.file = "home-2"; // the first page is the home page
    pages[0].file = "index";
  }
  return { language: asText(d.language) || undefined, title: asText(d.title), theme: asText(d.theme) || undefined, accent: asText(d.accent) || undefined, footer: asText(d.footer) || undefined, pages };
}

export function planProblems(plan: SitePlan | null): string[] {
  if (!plan) return ["the answer was not a JSON object"];
  const out: string[] = [];
  if (!plan.title) out.push("the title is missing");
  if (plan.pages.length < 2) out.push("a site of several pages needs at least 2 pages");
  if (plan.pages.some((p) => !p.purpose)) out.push("every page needs a purpose");
  return out;
}

/** A link of a page: kept when it goes to a section, another site or a mail, turned into a file name when it names a page of the site, else a plain anchor. */
export function fixHref(href: string, files: string[]): string {
  const h = href.trim();
  if (!h || h === "#" || /^(#|https?:|mailto:|tel:)/i.test(h)) return h || "#";
  const name = h.replace(/^\.?\//, "").replace(/\.html?$/i, "").toLowerCase();
  return files.includes(`${name}.html`) ? `${name}.html` : "#";
}

/** The page of the site that the model filled in, with the look, the menu and the footer of the whole site. Links that name no page are turned into anchors. */
/** The look is read from the first page and given to the others, so that the CSS of every file is the same text. */
const STYLE_KEYS = ["accent", "radius", "spacing", "background", "motion", "icon_style", "seed"] as const;
export function sitePage(plan: SitePlan, data: Record<string, unknown>, index: number, first?: Record<string, unknown>): PageSpec {
  const files = FILES_OF(plan);
  const fixLinks = (xs: unknown) => asRows(xs).map((l) => ({ label: asText(l.label), href: fixHref(asText(l.href), files) }));
  const sections = asRows(data.sections).map((s) => {
    const o: Record<string, unknown> = { ...s };
    for (const k of ["cta_href", "cta2_href"]) if (typeof o[k] === "string") o[k] = fixHref(o[k] as string, files);
    return o;
  });
  const page = plan.pages[index];
  const look = { ...Object.fromEntries(STYLE_KEYS.filter((k) => (first ?? data)[k] !== undefined).map((k) => [k, (first ?? data)[k]])), ...(plan.accent ? { accent: plan.accent } : {}) };
  return {
    ...(data as PageSpec),
    language: plan.language || asText(data.language) || undefined,
    title: plan.title,
    theme: plan.theme || asText((first ?? data).theme) || undefined,
    footer: plan.footer || asText(data.footer) || undefined,
    ...Object.fromEntries(STYLE_KEYS.filter((k) => (first ?? data)[k] !== undefined).map((k) => [k, (first ?? data)[k]])),
    links: fixLinks(data.links),
    nav: plan.pages.map((p) => ({ label: p.title, href: `${p.file}.html` })),
    current: `${page.file}.html`,
    sections
  };
}
