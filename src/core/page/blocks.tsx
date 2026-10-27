import type { CSSProperties, ReactNode } from "react";
import type { Config } from "@measured/puck";
import { mixColor } from "../color";
import { AOS_NAME, BLOCKS, ITEM_FIELDS, PAGE_TYPES, RADII, SPACING, BACKGROUNDS, fromPuckData, type Field, type PageSpec } from "./catalog";
import { pageLook, type PageLook } from "./theme";
import { iconFor, iconMarkup, isEmoji } from "./icons";

type Props = Record<string, unknown>;
export type BlockProps = Props & { alt?: boolean; hero?: PageLook };
const T = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const itemsOf = (v: unknown): Props[] => (Array.isArray(v) ? v.filter((x): x is Props => !!x && typeof x === "object") : []);
const pointsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(T).filter(Boolean) : T(v).split("\n").map((x) => x.trim()).filter(Boolean));
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
export const anchorOf = (s: Props): string => slug(T(s.id) || T(s.title) || T(s.type));

/** Text with **bold** and line breaks; everything else is escaped by React, so nothing the model writes can add markup. */
function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  return <>{lines.map((line, i) => <span key={i}>{line.split(/\*\*(.+?)\*\*/g).map((part, k) => (k % 2 ? <b key={k}>{part}</b> : part))}{i < lines.length - 1 ? <br /> : null}</span>)}</>;
}
const Btn = ({ label, href, alt, pulse }: { label: string; href?: string; alt?: boolean; pulse?: boolean }) => (label ? <a className={`btn${alt ? " alt" : ""}${pulse ? " animate__animated animate__pulse animate__infinite animate__slow" : ""}`} href={href || "#contact"}>{label}</a> : null);
const Head = ({ s, center }: { s: Props; center?: boolean }) => (T(s.title) || T(s.subtitle) ? <header className={center ? "c" : undefined}>{T(s.title) ? <h2>{T(s.title)}</h2> : null}{T(s.subtitle) ? <p className="muted">{T(s.subtitle)}</p> : null}</header> : null);
/** How a block appears on scroll, in the names of the AOS library: its own choice, else a fade up when the page moves at all. "stagger" is done card by card. */
const aosOf = (s: BlockProps): string | undefined => { const a = T(s.animate); return a === "none" || a === "stagger" || s.hero?.motion === "none" ? undefined : AOS_NAME[a || "fade-up"]; };
const stagger = (s: BlockProps, i: number): Props => (T(s.animate) === "stagger" && s.hero?.motion !== "none" ? { "data-aos": "fade-up", "data-aos-delay": String(Math.min(i, 8) * 90) } : {});
/** A figure that counts up (countUp.js reads these attributes): the text is the final value, so without scripts it still reads right. */
function counter(s: BlockProps, v: string): Props {
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(v);
  if (!m || s.hero?.motion === "none") return {};
  return { "data-count": m[2].replace(/,/g, ""), "data-prefix": m[1], "data-suffix": m[3], "data-decimals": String((m[2].split(".")[1] ?? "").length) };
}
const Section = ({ s, cls = "", alt, children, id }: { s: BlockProps; cls?: string; alt?: boolean; children: ReactNode; id?: string }) => <section className={[cls, alt ? "alt" : ""].filter(Boolean).join(" ") || undefined} id={id ?? anchorOf(s)} data-aos={aosOf(s)}><div className="wrap">{children}</div></section>;

/** An icon or an emoji as the page's style says: a name (rocket, shield-check, "secure") is drawn as a Lucide line icon, an emoji is shown as it is. null when there is nothing to show. */
function icoNode(value: string, look: PageLook | undefined, emojiFallback = "", nameFallback = ""): ReactNode {
  const style = look?.icons ?? "icons";
  if (style === "none") return null;
  const v = value || (style === "emoji" ? emojiFallback : nameFallback);
  if (!v) return null;
  if (isEmoji(v)) return v;
  const name = iconFor(v);
  return name ? <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconMarkup(name) }} /> : null;
}
const Ico = ({ value, look, emoji, name }: { value: string; look?: PageLook; emoji?: string; name?: string }) => { const n = icoNode(value, look, emoji, name); return n ? <span className="ic">{n}</span> : null; };

function Card({ it, pop, btn, extra, look, emoji, name }: { it: Props; pop?: boolean; btn?: string; extra?: Props; look?: PageLook; emoji?: string; name?: string }) {
  const pts = pointsOf(it.points), cta = T(it.cta) || btn || "";
  return <div className={`card${pop ? " pop" : ""}`} {...extra}>
    {T(it.badge) ? <span className="badge">{T(it.badge)}</span> : null}
    <Ico value={T(it.icon)} look={look} emoji={emoji} name={name} />
    {T(it.value) ? <div className="price">{T(it.value)}</div> : null}
    {T(it.title) ? <h3>{T(it.title)}</h3> : null}
    {T(it.meta) ? <p className="muted">{T(it.meta)}</p> : null}
    {T(it.text) ? <p><Rich text={T(it.text)} /></p> : null}
    {pts.length ? <ul className="pts">{pts.map((p, i) => <li key={i}>{p}</li>)}</ul> : null}
    {cta ? <Btn label={cta} href={T(it.href)} /> : null}
  </div>;
}
const Grid = ({ children }: { children: ReactNode }) => <div className="grid">{children}</div>;

const BLOCK_VIEW: Record<string, (p: BlockProps) => ReactNode> = {
  hero: (s) => {
    const split = T(s.layout) === "split", icon = icoNode(T(itemsOf(s.items)[0]?.icon), s.hero, "✨", "sparkles");
    const fx = T(s.effect) && T(s.effect) !== "none" && s.hero?.motion !== "none" ? T(s.effect) : "";
    // entrance with animate.css when the page moves; a typed title keeps its own
    const mv = s.hero?.motion !== "none", lively = s.hero?.motion === "lively";
    const a = (name: string) => (mv ? `animate__animated animate__${name}` : undefined);
    return <section className={`hero ${split ? "split" : "center"}${fx ? ` fx-${fx}` : ""}`} id={anchorOf(s)}>
      <div className="bg"><div dangerouslySetInnerHTML={{ __html: s.hero?.heroSvg ?? "" }} style={{ position: "absolute", inset: 0 }} />
        {fx === "aurora" ? <><i className="orb o1" /><i className="orb o2" /><i className="orb o3" /></> : null}
        {fx === "float" ? <><i className="shape s1" /><i className="shape s2" /><i className="shape s3" /><i className="shape s4" /></> : null}
        {fx === "particles" ? <canvas id="particles" className="particles" data-color={`#${s.hero?.theme.accent ?? "888888"}`} /> : null}</div>
      <div className="wrap"><div><h1 className={fx === "typewriter" ? undefined : a("fadeInDown")}>{T(s.title)}</h1>{T(s.subtitle) ? <p className={`lead ${a("fadeInUp") ?? ""} ${mv ? "animate__delay-1s" : ""}`.trim()}>{T(s.subtitle)}</p> : null}{T(s.text) ? <p><Rich text={T(s.text)} /></p> : null}<div className={`btns ${a("zoomIn") ?? ""} ${mv ? "animate__delay-2s" : ""}`.trim()}><Btn label={T(s.cta)} href={T(s.cta_href)} pulse={lively} /><Btn label={T(s.cta2)} href={T(s.cta2_href)} alt /></div></div>{split && icon ? <div className="art">{icon}</div> : null}</div>
    </section>;
  },
  features: (s) => <Section s={s} alt={s.alt}><Head s={s} /><Grid>{itemsOf(s.items).map((it, i) => <Card key={i} it={it} extra={stagger(s, i)} look={s.hero} />)}</Grid></Section>,
  steps: (s) => <Section s={s} cls="steps" alt={s.alt}><Head s={s} /><Grid>{itemsOf(s.items).map((it, i) => <div className="card" key={i} {...stagger(s, i)}><div className="n">{i + 1}</div><h3>{T(it.title)}</h3><p><Rich text={T(it.text)} /></p></div>)}</Grid></Section>,
  stats: (s) => <Section s={s} cls="stats" alt={s.alt}><Head s={s} center /><Grid>{itemsOf(s.items).map((it, i) => <div className="card" key={i} {...stagger(s, i)}><div className="v" {...counter(s, T(it.value))}>{T(it.value)}</div><p>{T(it.title) || T(it.text)}</p></div>)}</Grid></Section>,
  pricing: (s) => <Section s={s} alt={s.alt}><Head s={s} center /><Grid>{itemsOf(s.items).map((it, i) => <Card key={i} it={it} pop={!!T(it.badge)} btn="→" extra={stagger(s, i)} look={s.hero} />)}</Grid></Section>,
  testimonials: (s) => <Section s={s} alt={s.alt}><Head s={s} center /><Grid>{itemsOf(s.items).map((it, i) => <div className="card" key={i} {...stagger(s, i)}><blockquote>“{T(it.text) || T(it.q)}”</blockquote><div className="who"><b>{T(it.title)}</b>{T(it.meta) ? ` · ${T(it.meta)}` : ""}</div></div>)}</Grid></Section>,
  faq: (s) => <Section s={s} alt={s.alt}><Head s={s} /><div style={{ maxWidth: 760 }}>{itemsOf(s.items).map((it, i) => <details key={i} {...stagger(s, i)}><summary>{T(it.q) || T(it.title)}</summary><p><Rich text={T(it.a) || T(it.text)} /></p></details>)}</div></Section>,
  team: (s) => <Section s={s} alt={s.alt}><Head s={s} /><Grid>{itemsOf(s.items).map((it, i) => <div className="card" key={i} {...stagger(s, i)}><div className="av">{icoNode(T(it.icon), s.hero) ?? (T(it.title)[0] ?? "•").toUpperCase()}</div><h3>{T(it.title)}</h3><p className="muted">{T(it.meta)}</p><p>{T(it.text)}</p></div>)}</Grid></Section>,
  timeline: (s) => <Section s={s} alt={s.alt}><Head s={s} /><div className="tl">{itemsOf(s.items).map((it, i) => <div className="e" key={i} {...stagger(s, i)}><div className="when">{T(it.meta) || T(it.value)}</div><h3>{T(it.title)}</h3><p className="muted"><Rich text={T(it.text)} /></p></div>)}</div></Section>,
  gallery: (s) => <Section s={s} alt={s.alt}><Head s={s} /><Grid>{itemsOf(s.items).map((it, i) => { const a = s.hero?.theme.accents ?? ["888888"]; const bg = `linear-gradient(${120 + i * 37}deg,#${a[i % a.length]},#${mixColor(a[(i + 1) % a.length], s.hero?.theme.bg ?? "FFFFFF", 0.25)})`; return <div className="tile" key={i} style={{ background: bg }} {...stagger(s, i)}><div>{icoNode(T(it.icon), s.hero, "🖼", "image")}<br /><span>{T(it.title)}</span></div></div>; })}</Grid></Section>,
  menu: (s) => <Section s={s} cls="menu" alt={s.alt}><Head s={s} /><div style={{ maxWidth: 760 }}>{itemsOf(s.items).map((it, i) => <div className="row" key={i} {...stagger(s, i)}><div><h3>{T(it.title)}</h3><p className="muted" style={{ margin: 0 }}>{T(it.text)}</p></div><span className="dots" /><span className="v">{T(it.value)}</span></div>)}</div></Section>,
  products: (s) => <Section s={s} alt={s.alt}><Head s={s} /><Grid>{itemsOf(s.items).map((it, i) => <Card key={i} it={it} btn="→" extra={stagger(s, i)} look={s.hero} />)}</Grid></Section>,
  events: (s) => <Section s={s} alt={s.alt}><Head s={s} /><Grid>{itemsOf(s.items).map((it, i) => <Card key={i} it={it} extra={stagger(s, i)} look={s.hero} emoji="📅" name="calendar" />)}</Grid></Section>,
  logos: (s) => <Section s={s} alt={s.alt}><Head s={s} center /><div className="logos">{itemsOf(s.items).map((it, i) => <span key={i}>{T(it.title)}</span>)}</div></Section>,
  cta: (s) => <section className="cta" id={anchorOf(s)}><div className="wrap"><h2>{T(s.title)}</h2>{T(s.subtitle) ? <p>{T(s.subtitle)}</p> : null}<Btn label={T(s.cta)} href={T(s.cta_href)} /></div></section>,
  text: (s) => <Section s={s} alt={s.alt}><Head s={s} /><div style={{ maxWidth: 760 }}>{T(s.text) ? <p><Rich text={T(s.text)} /></p> : null}{itemsOf(s.items).map((it, i) => <div key={i}><h3>{T(it.title)}</h3><p><Rich text={T(it.text)} /></p></div>)}</div></Section>,
  contact: (s) => <Section s={s} alt={s.alt} id={anchorOf(s) === "section" ? "contact" : anchorOf(s)}><Head s={s} />{T(s.email) ? <form action={`mailto:${T(s.email)}`} method="post" encType="text/plain"><input name="name" placeholder="Name" required /><input name="email" type="email" placeholder="Email" required /><textarea name="message" rows={5} placeholder="Message" required /><button className="btn" type="submit">{T(s.cta) || "Send"}</button></form> : null}{T(s.text) ? <p><Rich text={T(s.text)} /></p> : null}</Section>
};
export const Block = ({ type, ...props }: BlockProps & { type: string }) => <>{(BLOCK_VIEW[type] ?? BLOCK_VIEW.text)(props)}</>;

/** The menu at the top of the page: the titled sections and the hero's main button. */
export function Nav({ spec, sections }: { spec: PageSpec; sections: Props[] }) {
  const links = sections.filter((s) => T(s.type) !== "hero" && T(s.type) !== "cta" && T(s.title)).slice(0, 5);
  const hero = sections.find((s) => T(s.type) === "hero");
  return <nav><div className="wrap"><b>{T(spec.title) || "Site"}</b>{links.map((s, i) => <a key={i} href={`#${anchorOf(s)}`}>{T(s.title)}</a>)}{hero && T(hero.cta) ? <a className="btn" href={T(hero.cta_href) || "#contact"}>{T(hero.cta)}</a> : null}</div></nav>;
}
export function Foot({ spec }: { spec: PageSpec }) {
  const links = (spec.links ?? []).filter((l) => T(l.label));
  return <footer><div className="wrap"><span>{T(spec.footer) || `© ${T(spec.title)}`}</span><span>{links.map((l, i) => <a key={i} href={T(l.href) || "#"}>{T(l.label)}</a>)}</span></div></footer>;
}

/** The whole page, drawn from its description. */
export function PageView({ spec, look }: { spec: PageSpec; look?: PageLook }) {
  const lk = look ?? pageLook(spec);
  const sections = (spec.sections ?? []).filter((s) => T(s.type));
  return <>
    <Nav spec={spec} sections={sections} />
    {sections.map((s, i) => <Block key={i} {...s} type={T(s.type)} alt={i % 2 === 1} hero={lk} />)}
    <Foot spec={spec} />
  </>;
}

// ---------------------------------------------------------------- the visual editor's configuration
const puckField = (f: Field) => (f.kind === "select" ? { type: "select" as const, label: f.label, options: (f.options ?? []).map((o) => ({ label: o, value: o })) } : f.kind === "textarea" ? { type: "textarea" as const, label: f.label } : { type: "text" as const, label: f.label });
/** The blocks as the visual editor (Puck) knows them: the same fields and the same drawing as the page. The editor shows the page the way it will be saved. */
export function pageConfig(spec: PageSpec): Config {
  const look = pageLook(spec);
  const components: Config["components"] = {};
  for (const b of BLOCKS) {
    const name = b.type.charAt(0).toUpperCase() + b.type.slice(1);
    components[name] = {
      label: b.label,
      fields: { ...Object.fromEntries(Object.entries(b.fields).map(([k, f]) => [k, puckField(f)])), ...(b.item ? { items: { type: "array" as const, label: "Items", arrayFields: Object.fromEntries(Object.entries(b.item).map(([k, f]) => [k, puckField(f)])), getItemSummary: (it: Props) => T(it.title) || T(it.q) || T(it.meta) || T(it.value) || "Item", ...(b.maxItems ? { max: b.maxItems } : {}) } } : {}) },
      defaultProps: { title: b.label, items: [] },
      render: (props: Props) => <Block type={b.type} {...props} hero={look} />
    } as never;
  }
  void ITEM_FIELDS;
  return {
    root: {
      fields: { title: { type: "text", label: "Site name" }, theme: { type: "text", label: "Theme (a name or words: old warm serif, tech dark…)" }, accent: { type: "text", label: "Accent colour (hex)" }, radius: { type: "select", label: "Corners", options: Object.keys(RADII).map((v) => ({ label: v, value: v })) }, spacing: { type: "select", label: "Spacing", options: Object.keys(SPACING).map((v) => ({ label: v, value: v })) }, background: { type: "select", label: "Hero background", options: BACKGROUNDS.map((v) => ({ label: v, value: v })) }, footer: { type: "text", label: "Footer line" }, links: { type: "array", label: "Footer links", arrayFields: { label: { type: "text" }, href: { type: "text" } } } },
      render: ({ children, ...rest }: { children: ReactNode } & Props) => {
        // the root props are what the page is drawn with; the look follows them as they are edited
        const live = fromPuckData({ root: { props: rest }, content: [] });
        const lk = pageLook({ ...live, seed: spec.seed });
        return <div style={{ "--editing": 1 } as CSSProperties}><style dangerouslySetInnerHTML={{ __html: lk.css }} /><Nav spec={live} sections={[]} />{children}<Foot spec={live} /></div>;
      }
    } as never,
    components
  } as Config;
}
export { PAGE_TYPES };
