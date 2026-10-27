/**
 * The blocks of a page, described once. From this description come the JSON schema the model must follow, the fields of the
 * visual editor (Puck) and the React components that draw the page; so the model, the editor and the page always agree.
 * A page is `{ title, theme, ..., sections: [{ type, ...fields }] }`: that JSON is the page, the HTML is drawn from it.
 */
export type FieldKind = "text" | "textarea" | "select";
export interface Field { kind: FieldKind; label: string; options?: string[] }
export interface BlockDef { type: string; label: string; summary: string; fields: Record<string, Field>; item?: Record<string, Field>; maxItems?: number }

const text = (label: string): Field => ({ kind: "text", label });
const area = (label: string): Field => ({ kind: "textarea", label });
const choice = (label: string, options: string[]): Field => ({ kind: "select", label, options });
const head = { title: text("Title"), subtitle: area("Subtitle") };

export const ITEM_FIELDS: Record<string, Field> = { title: text("Title"), text: area("Text"), icon: text("Icon (a name like rocket, or an emoji)"), value: text("Figure or price"), meta: text("Date, role, place"), badge: text("Badge"), points: area("Points (one per line)"), cta: text("Button label"), href: text("Button link"), q: text("Question"), a: area("Answer") };
const pick = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, ITEM_FIELDS[k]]));

export const BLOCKS: BlockDef[] = [
  { type: "hero", label: "Hero", summary: "The top of the page: title, line, buttons, a procedural background", fields: { ...head, text: area("Text"), cta: text("Button"), cta_href: text("Button link"), cta2: text("Second button"), cta2_href: text("Second button link"), layout: choice("Layout", ["center", "split"]) }, item: pick("icon"), maxItems: 1 },
  { type: "features", label: "Features", summary: "Cards with an emoji, a title and a text", fields: head, item: pick("icon", "title", "text") },
  { type: "steps", label: "Steps", summary: "Numbered steps", fields: head, item: pick("title", "text") },
  { type: "stats", label: "Figures", summary: "Big numbers with a label", fields: head, item: pick("value", "title") },
  { type: "pricing", label: "Pricing", summary: "Plans with a price, points and a button; a badge marks the highlighted one", fields: head, item: pick("title", "value", "badge", "points", "cta", "href") },
  { type: "testimonials", label: "Testimonials", summary: "Quotes with who said them", fields: head, item: pick("text", "title", "meta") },
  { type: "faq", label: "FAQ", summary: "Questions that open", fields: head, item: pick("q", "a") },
  { type: "team", label: "Team", summary: "People with a role", fields: head, item: pick("icon", "title", "meta", "text") },
  { type: "timeline", label: "Timeline", summary: "Dated events", fields: head, item: pick("meta", "title", "text") },
  { type: "gallery", label: "Gallery", summary: "Coloured tiles with an emoji and a caption", fields: head, item: pick("icon", "title") },
  { type: "menu", label: "Menu / price list", summary: "Lines with a price", fields: head, item: pick("title", "text", "value") },
  { type: "products", label: "Products", summary: "Cards with a price and a button", fields: head, item: pick("icon", "title", "text", "value", "badge", "cta", "href") },
  { type: "events", label: "Events", summary: "Dated events as cards", fields: head, item: pick("icon", "title", "meta", "text", "cta", "href") },
  { type: "logos", label: "Logos / partners", summary: "A line of names", fields: head, item: pick("title") },
  { type: "cta", label: "Call to action", summary: "A bold band with one button", fields: { ...head, cta: text("Button"), cta_href: text("Button link") } },
  { type: "text", label: "Text", summary: "Free text, with optional titled paragraphs", fields: { ...head, text: area("Text") }, item: pick("title", "text") },
  { type: "contact", label: "Contact", summary: "A contact form that opens the mail program", fields: { ...head, text: area("Text"), email: text("Email"), cta: text("Button") } }
];
export const ICON_STYLES = ["icons", "emoji", "none"];
export const ANIMATIONS = ["fade-up", "fade", "slide-left", "slide-right", "zoom", "flip", "stagger", "none"];
/** The page animations as the AOS library names them. */
export const AOS_NAME: Record<string, string> = { "fade-up": "fade-up", fade: "fade", "slide-left": "fade-right", "slide-right": "fade-left", zoom: "zoom-in", flip: "flip-up" };
export const EFFECTS = ["none", "aurora", "float", "gradient", "particles", "typewriter"];
export const MOTIONS = ["subtle", "lively", "none"];
for (const b of BLOCKS) { b.fields = { ...b.fields, animate: choice("Appears with", ANIMATIONS), ...(b.type === "hero" ? { effect: choice("Hero effect", EFFECTS) } : {}) }; }
export const BLOCK_TYPES = BLOCKS.map((b) => b.type);
export const blockOf = (type: string): BlockDef | undefined => BLOCKS.find((b) => b.type === type);

export const PAGE_TYPES = ["landing", "portfolio", "restaurant", "event", "blog", "product", "nonprofit", "agency", "personal", "school", "app"] as const;
export const RADII: Record<string, string> = { none: "0", small: "6px", medium: "12px", large: "20px", pill: "28px" };
export const SPACING: Record<string, string> = { compact: "56px", comfortable: "84px", spacious: "120px" };
export const BACKGROUNDS = ["plain", "gradient", "mesh", "waves", "rings", "dots", "stripes", "grid", "confetti", "blocks"];

export interface PageSpec {
  language?: string; motion?: string; icon_style?: string; title?: string; page_type?: string; theme?: string; accent?: string; radius?: string; spacing?: string; background?: string; seed?: number; footer?: string;
  links?: { label?: string; href?: string }[];
  sections?: Record<string, unknown>[];
}

const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const fieldSchema = (f: Field) => (f.kind === "select" ? { type: "string", enum: f.options } : str());
const ITEM_SCHEMA = { type: "object", additionalProperties: false, properties: { ...Object.fromEntries(Object.entries(ITEM_FIELDS).map(([k, f]) => [k, k === "points" ? { type: "array", maxItems: 8, items: { type: "string" } } : fieldSchema(f)])) } } as const;
const SECTION_SCHEMA = { type: "object", additionalProperties: false, required: ["type"], properties: {
  type: { type: "string", enum: BLOCK_TYPES, description: BLOCKS.map((b) => `${b.type}: ${b.summary}`).join(" | ") }, id: str("short anchor name"),
  title: str(), subtitle: str(), text: str(), cta: str("main button label"), cta_href: str(), cta2: str("second button label"), cta2_href: str(), email: str(), layout: { type: "string", enum: ["center", "split"] }, animate: { type: "string", enum: ANIMATIONS, description: "how the block appears on scroll; stagger makes its cards come one after the other" }, effect: { type: "string", enum: EFFECTS, description: "hero only: an animated effect behind the title" },
  items: { type: "array", maxItems: 12, items: ITEM_SCHEMA }
} } as const;
/** The JSON schema of a page: what the model is made to write. */
export const PAGE_SCHEMA = { type: "object", additionalProperties: false, properties: {
  language: { type: "string", enum: ["en", "fr", "es", "de", "pt", "it"] }, title: str("the name of the site or the person"), page_type: { type: "string", enum: [...PAGE_TYPES] },
  theme: str("a theme name or 2 to 4 words that describe the look (old warm serif, tech dark, school colourful, elegant gold)"), accent: { type: "string", pattern: "^[0-9A-Fa-f]{6}$", description: "an accent colour if the person named one" },
  radius: { type: "string", enum: Object.keys(RADII) }, spacing: { type: "string", enum: Object.keys(SPACING) }, background: { type: "string", enum: BACKGROUNDS, description: "the procedural background of the top of the page" }, icon_style: { type: "string", enum: ICON_STYLES, description: "icons (clean line icons, the professional default), emoji (friendlier) or none; it decides what the `icon` fields hold" }, motion: { type: "string", enum: MOTIONS, description: "how much the page moves: none, subtle (blocks appear on scroll, hover lifts) or lively (bigger movements and counting figures)" }, seed: { type: "integer", minimum: 0, maximum: 99999 },
  sections: { type: "array", minItems: 3, maxItems: 14, items: SECTION_SCHEMA }, footer: str("a line for the foot of the page"), links: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, properties: { label: str(), href: str() } } }
} } as const;

// ---------------------------------------------------------------- the editor's data
const asStr = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const itemsOf = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
export const ROOT_KEYS = ["title", "theme", "accent", "radius", "spacing", "background", "motion", "icon_style", "footer"] as const;
const nameOf = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);

/** The page as the visual editor holds it: components with props (the points of an item are one text, a line each). */
export function toPuckData(spec: PageSpec): { root: { props: Record<string, unknown> }; content: { type: string; props: Record<string, unknown> }[] } {
  const rootProps: Record<string, unknown> = { language: spec.language, page_type: spec.page_type, seed: spec.seed, links: (spec.links ?? []).map((l) => ({ label: asStr(l.label), href: asStr(l.href) })) };
  // the selects of the editor start on what the page really uses, not on their first option
  const DEFAULTS: Record<string, string> = { radius: "medium", spacing: "comfortable", motion: "subtle", icon_style: "icons", background: "mesh" };
  for (const k of ROOT_KEYS) rootProps[k] = asStr(spec[k]) || DEFAULTS[k] || "";
  const content = (spec.sections ?? []).filter((s) => blockOf(asStr(s.type))).map((s, i) => {
    const { type, items, ...rest } = s;
    return { type: nameOf(asStr(type)), props: { id: `b${i}-${asStr(type)}`, ...rest, items: itemsOf(items).map((it) => ({ ...it, points: Array.isArray(it.points) ? (it.points as unknown[]).map(asStr).join("\n") : asStr(it.points) })) } };
  });
  return { root: { props: rootProps }, content };
}
/** The editor's data back as a page. Empty values are dropped. */
export function fromPuckData(data: { root?: { props?: Record<string, unknown> }; content?: { type: string; props: Record<string, unknown> }[] }): PageSpec {
  const rp = data.root?.props ?? {};
  const spec: PageSpec = { language: asStr(rp.language) || undefined, page_type: asStr(rp.page_type) || undefined, seed: typeof rp.seed === "number" ? rp.seed : undefined, links: itemsOf(rp.links).map((l) => ({ label: asStr(l.label), href: asStr(l.href) })).filter((l) => l.label) };
  for (const k of ROOT_KEYS) { const v = asStr(rp[k]); if (v) (spec as Record<string, unknown>)[k] = v; }
  spec.sections = (data.content ?? []).map((c) => {
    const { id: _id, items, alt: _alt, ...rest } = c.props;
    const out: Record<string, unknown> = { type: c.type.toLowerCase() };
    for (const [k, v] of Object.entries(rest)) { const s = asStr(v); if (s) out[k] = s; }
    const its = itemsOf(items).map((it) => { const o: Record<string, unknown> = {}; for (const [k, v] of Object.entries(it)) { if (k === "points") { const p = asStr(v).split("\n").map((x) => x.trim()).filter(Boolean); if (p.length) o.points = p; } else if (asStr(v)) o[k] = asStr(v); } return o; }).filter((o) => Object.keys(o).length);
    if (its.length) out.items = its;
    return out;
  });
  return spec;
}
