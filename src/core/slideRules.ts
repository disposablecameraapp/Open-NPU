// Rules of a good slide, checked and mended by the app on every slide it makes, so that a small model only has to write words.
// They come from what presentation researchers and designers agree on (the source of each is named in `expert`); see docs/slide-rules.md.
// A rule `check`s a slide (a sentence saying what is wrong, or null) and may `repair` it without any model; a rule with no repair
// is given back to the writer as the reason to write the slide again.
import { LIMITS, THEMES, contrastRatio, layoutSlide, styledTheme, type Slide, type Theme } from "./slides";

export interface RuleCtx { theme: Theme; role: "cover" | "content" | "closing"; /** Rules the user's own request switches off. */ off?: ReadonlySet<string> }
export interface Rule {
  id: string;
  expert: string;
  rule: string;
  check(s: Slide, c: RuleCtx): string | null;
  repair?(s: Slide, c: RuleCtx): Slide;
}

export const BODY_WORDS = { text: 40, withVisual: 28 };
export const MIN_BODY_PT = 18;

const hasVisual = (s: Slide) => !!(s.flow || s.figure || s.table || s.image || s.columns);
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const bodyWords = (s: Slide) => s.lines.reduce((n, l) => n + words(l.text), 0);
const toNotes = (s: Slide, moved: string[]): Slide => (moved.length ? { ...s, notes: [s.notes, ...moved].filter(Boolean).join("\n").split(/\s+/).slice(0, 400).join(" ") } : s);
/** The last lines of a slide go to its speaker notes: what is said stays, what is read off the slide goes. */
const shorten = (s: Slide, keep: number): Slide => toNotes({ ...s, lines: s.lines.slice(0, Math.max(1, keep)) }, s.lines.slice(Math.max(1, keep)).map((l) => l.text));

/** No list of one term: a lone bullet is the message of the slide, a lone figure too, a single column is plain lines. */
export function tidySlide(slide: Slide): Slide {
  let s = slide;
  if (s.stats?.length === 1) { const x = s.stats[0]; s = { ...s, stats: undefined, blocks: [...(s.blocks ?? []), { kind: "callout" as const, text: `${x.value} ${x.label}`.trim() }].slice(0, 2) }; }
  if (s.columns && s.columns.length < 2) s = { ...s, lines: [...s.lines, ...s.columns.flatMap((c) => c.lines.map((text) => ({ text, level: 0, bullet: true })))], columns: undefined };
  const bare = !s.flow && !s.figure && !s.table && !s.image && !s.stats && !s.columns && !s.blocks;
  if (bare && s.lines.length === 1 && words(s.lines[0].text) <= 30) s = { ...s, blocks: [{ kind: "callout", text: s.lines[0].text }], lines: [] };
  return s;
}

export const RULES: Rule[] = [
  {
    id: "one-idea", expert: "Duarte (Slide:ology), Reynolds (Presentation Zen)", rule: "One idea per slide: few lines, and fewer when there is a visual.",
    check: (s) => (s.lines.length > (hasVisual(s) ? 4 : LIMITS.bullets) ? `Too many lines for one idea (${s.lines.length}).` : null),
    repair: (s) => shorten(s, hasVisual(s) ? 4 : LIMITS.bullets)
  },
  {
    id: "word-budget", expert: "Kawasaki (10/20/30), Duarte (a slide is read at a glance), Mayer (coherence)", rule: `At most ${BODY_WORDS.text} words of body text, ${BODY_WORDS.withVisual} next to a visual; the rest is said, in the speaker notes.`,
    check: (s) => (bodyWords(s) > (hasVisual(s) ? BODY_WORDS.withVisual : BODY_WORDS.text) ? `Too many words on the slide (${bodyWords(s)}): at most ${hasVisual(s) ? BODY_WORDS.withVisual : BODY_WORDS.text}.` : null),
    repair: (s) => { let x = s; const max = hasVisual(s) ? BODY_WORDS.withVisual : BODY_WORDS.text; while (x.lines.length > 1 && bodyWords(x) > max) x = shorten(x, x.lines.length - 1); return x; }
  },
  {
    id: "readable-size", expert: "Kawasaki (30 pt), Duarte (24 pt)", rule: `Body text is never drawn smaller than ${MIN_BODY_PT} pt: past that, lines move to the speaker notes.`,
    check: (s, c) => { const b = layoutSlide(s, c.theme, { index: 1, count: 3, pics: {} }).body; return b && b.paras.some((p) => !p.level && p.size < MIN_BODY_PT) ? `The text is too small to read from a room (under ${MIN_BODY_PT} pt).` : null; },
    repair: (s, c) => { let x = s; for (let k = 0; k < 4 && x.lines.length > 1; k++) { const b = layoutSlide(x, c.theme, { index: 1, count: 3, pics: {} }).body; if (!b || !b.paras.some((p) => !p.level && p.size < MIN_BODY_PT)) break; x = shorten(x, x.lines.length - 1); } return x; }
  },
  {
    id: "assertion-title", expert: "Alley (assertion-evidence: a sentence that states the point, tested against topic titles)", rule: "A content slide's title says what the slide proves, in 3 to 9 words, not a one-word label.",
    check: (s, c) => (c.role === "content" && words(s.title) < 3 ? `The title "${s.title}" is a label: write a short sentence that states the point of the slide (3 to 9 words).` : null)
  },
  {
    id: "evidence-not-bullets", expert: "Alley and Garner (visual evidence beat bullet lists on comprehension and recall), Mayer (words and pictures together)", rule: "A slide with a figure, a flow or a table must not also repeat it in bullets; no slide is a lone list of one term.",
    check: (s) => (s.lines.length === 1 && !hasVisual(s) && !s.blocks && !s.stats ? "A list of one term." : null),
    repair: tidySlide
  },
  {
    id: "no-final-period", expert: "Reynolds, Duarte (phrases, not sentences, on the slide)", rule: "Bullets are phrases: no full stop at the end of a short line.",
    check: (s) => (s.lines.some((l) => /[.]$/.test(l.text) && words(l.text) <= LIMITS.bulletWords && !/\b(?:etc|vs|no)\.$/i.test(l.text)) ? "A bullet ends with a full stop." : null),
    repair: (s) => ({ ...s, lines: s.lines.map((l) => (/[.]$/.test(l.text) && words(l.text) <= LIMITS.bulletWords && !/\b(?:etc|vs|no)\.$/i.test(l.text) ? { ...l, text: l.text.replace(/\.$/, "") } : l)) })
  },
  {
    id: "honest-chart", expert: "Tufte (no chartjunk, data first), Few", rule: "A pie has at most 6 slices and no negative value, otherwise it is a bar chart.",
    check: (s) => (s.chart === "pie" && s.table && (s.table.length - 1 > 6 || s.table.slice(1).some((r) => r.slice(1).some((v) => /^\s*-/.test(v)))) ? "A pie chart with too many slices or a negative value." : null),
    repair: (s) => ({ ...s, chart: "bar" })
  },
  {
    id: "contrast", expert: "WCAG 2 (4.5:1 for text, 3:1 for large text), Duarte (a clear signal)", rule: "Text and figures stand out from their background.",
    check: (s, c) => { const t = styledTheme(c.theme, s.style); return contrastRatio(t.text, t.bg) < 4.5 ? "The text colour does not stand out from the background." : s.stats && contrastRatio(t.accent, t.panel) < 3 ? "The figures do not stand out from their cards." : null; },
    repair: (s) => ({ ...s, style: s.style ? { ...s.style, accent: undefined, bg: contrastRatio(styledTheme(THEMES[0], s.style).text, s.style.bg ?? "FFFFFF") < 4.5 ? undefined : s.style.bg } : s.style })
  }
];

// ---------------------------------------------------------------- what the user asked wins over the rules

/** Everything the user's own words can switch off: the rules above, and the app's own choices of layout, filling and sources. */
export const SWITCHES: { id: string; rule: string }[] = [
  ...RULES.map((r) => ({ id: r.id, rule: r.rule })),
  { id: "fill", rule: "A slide with a lot of white or very few words gets a picture or larger text." },
  { id: "layout-choice", rule: "The app turns figures into cards, dates into a timeline, three short points into columns, and a closing line into a message." },
  { id: "one-look", rule: "At most a third of the slides restyled and two fonts for the deck." },
  { id: "grounding", rule: "Every figure and name on a slide must be in the text given." }
];
const ALL = SWITCHES.map((s) => s.id);
const DENSE = ["one-idea", "word-budget", "readable-size", "no-final-period", "fill"];
const ASKS: { re: RegExp; off: string[] }[] = [
  { re: /\b(?:dense|detailed|in detail|lots? of text|a lot of text|full sentences|complete sentences|paragraphs?|handout|beaucoup de texte|texte dense|phrases compl[èe]tes|d[ée]taill[ée]e?s?|paragraphes?)\b/i, off: DENSE },
  { re: /\b(?:small|tiny|fine) (?:text|font|print|type)\b|\bpetit(?:e)?s? (?:texte|police|caract[èe]res)\b|\bpetits? caract[èe]res\b/i, off: ["readable-size", "word-budget", "one-idea", "fill"] },
  { re: /\b\d+\s*(?:bullets?|points?|lines?|items?|puces|lignes)\b/i, off: ["one-idea", "word-budget", "layout-choice"] },
  { re: /\b(?:minimal(?:ist)?|very little text|only (?:images|pictures)|peu de texte|minimaliste|juste des images)\b/i, off: ["fill"] },
  { re: /\b(?:short|one[- ]word|single[- ]word) titles?\b|\btitres? (?:courts?|d'un mot)\b/i, off: ["assertion-title"] },
  { re: /\bdifferent (?:fonts?|looks?|styles?|colou?rs?) (?:on|for|per|in) (?:each|every)|\b(?:chaque|toutes? les) (?:slide|diapo)s? (?:un |une )?(?:style|couleur|police)s? diff[ée]rent|\bpolices? diff[ée]rentes\b/i, off: ["one-look"] },
  { re: /\b(?:only|just) bullets?\b|\bbullets? only\b|\b(?:uniquement|que) (?:des )?puces\b|\bno (?:cards|columns|timeline|diagrams?)\b|\bsans (?:cartes|colonnes|frise|sch[ée]mas?)\b/i, off: ["layout-choice", "evidence-not-bullets"] },
  { re: /\b(?:add|include|use|bring) (?:your|outside|extra|additional|some) (?:own )?(?:knowledge|facts|examples|research|context)\b|\bfrom your (?:own )?knowledge\b|\bajoute (?:des )?(?:exemples|faits|connaissances)\b|\bavec tes connaissances\b/i, off: ["grounding"] },
  { re: /\b(?:ignore|no|without) (?:the )?(?:slide )?rules\b|\bsans (?:les )?r[èe]gles\b/i, off: ALL }
];
const STYLE_WORDS = /\b(?:text|font|size|words?|bullets?|points?|lines?|small|big|large|dense|short|long|detail\w*|pictures?|images?|colou?rs?|style|titles?|charts?|tables?|minimal\w*|simple|plain|texte|police|taille|mots?|puces?|lignes?|petit\w*|grand\w*|court\w*|long\w*|d[ée]tail\w*|couleurs?|titres?|graphiques?|tableaux?|sans|only|just|uniquement|que)\b/i;

/** The part of a request that is an instruction: a pasted text in the middle says nothing about how the slides should look. */
export const instructionOf = (request: string): string => (request.length <= 700 ? request : `${request.slice(0, 300)}\n${request.slice(-300)}`);
/** Whether the request says anything about the form of the slides (so that it is worth reading against the rules). */
export const mentionsForm = (request: string) => STYLE_WORDS.test(instructionOf(request));

/** The rules the words of the request switch off, found by patterns, with the words that did it. */
export function switchesFromWords(request: string): Map<string, string> {
  const out = new Map<string, string>();
  const t = instructionOf(request);
  for (const a of ASKS) { const m = a.re.exec(t); if (m) for (const id of a.off) if (!out.has(id)) out.set(id, m[0]); }
  return out;
}

export const BRIEF_SYSTEM = [
  "You read what a user asked for a presentation, and say which default rules of good slides the user asked to break.",
  "A rule is broken only when the user asked for something that goes against it (a lot of text, a tiny font, exactly 8 bullets, one-word titles, only bullets, outside knowledge, a different font on every slide). An ordinary request breaks none.",
  "Reply with one line per rule broken, exactly: <rule id> | <the words of the request that ask for it, copied exactly>. If none, reply NONE.",
  "Rules:",
  ...SWITCHES.map((s) => `${s.id}: ${s.rule}`)
].join("\n");
export const briefPrompt = (request: string) => `The request:\n${instructionOf(request).slice(0, 900)}\n\nWhich rules does it ask to break?`;
const squash = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** A model's answer, kept only where the words it quotes are really in the request (a model cannot switch a rule off on its own). */
export function parseBrief(reply: string, request: string): Map<string, string> {
  const out = new Map<string, string>();
  const hay = squash(instructionOf(request));
  for (const line of reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, " ").split("\n")) {
    const m = /^\s*[-*]?\s*([\w-]+)\s*\|\s*(.+?)\s*$/.exec(line);
    if (!m || !ALL.includes(m[1])) continue;
    const words = m[2].replace(/^["“'«]+|["”'»]+$/g, "");
    if (squash(words).split(" ").length >= 1 && squash(words).length >= 3 && hay.includes(squash(words))) out.set(m[1], words);
  }
  return out;
}

/** The reasons a writer is asked to write the slide again for: what the app cannot mend by itself. */
export function writerProblems(s: Slide, c: RuleCtx): string[] {
  return RULES.filter((r) => !r.repair && !c.off?.has(r.id)).map((r) => r.check(s, c)).filter((x): x is string => !!x);
}

/** Every rule applied to one slide: what could be mended is mended, in the order of the list, and said. */
export function applyRules(slide: Slide, c: RuleCtx): { slide: Slide; fixed: string[]; open: string[] } {
  let s = slide;
  const fixed: string[] = [], open: string[] = [];
  for (const r of RULES) {
    if (c.off?.has(r.id)) continue;
    const why = r.check(s, c);
    if (!why) continue;
    if (!r.repair) { open.push(why); continue; }
    const next = r.repair(s, c);
    if (JSON.stringify(next) !== JSON.stringify(s)) { s = next; fixed.push(r.id); } else open.push(why);
  }
  return { slide: s, fixed, open };
}

/** Rules about the whole deck: titles differ, and the look stays one look (at most a third of the slides restyled, two fonts). */
export function deckRules(slides: Slide[], topics: string[], off?: ReadonlySet<string>): { slides: Slide[]; fixed: string[] } {
  const fixed: string[] = [];
  const seen = new Set<string>();
  let out = slides.map((s, i) => {
    const k = s.title.trim().toLowerCase();
    if (seen.has(k) && topics[i] && topics[i].trim().toLowerCase() !== k) { fixed.push("unique-titles"); s = { ...s, title: topics[i].trim().slice(0, LIMITS.titleChars) }; }
    seen.add(s.title.trim().toLowerCase());
    return s;
  });
  if (off?.has("one-look")) return { slides: out, fixed: [...new Set(fixed)] };
  const styled = out.map((s, i) => (s.style ? i : -1)).filter((i) => i >= 0);
  const room = Math.max(1, Math.floor(out.length / 3));
  const drop = new Set(styled.slice(room));
  const fonts = new Set<string>();
  out = out.map((s, i) => {
    if (!s.style) return s;
    let st = s.style;
    if (drop.has(i)) { fixed.push("one-look"); return { ...s, style: undefined }; }
    for (const f of [st.font, st.titleFont]) if (f) { if (fonts.size >= 2 && !fonts.has(f)) { fixed.push("one-look"); st = { ...st, font: st.font === f ? undefined : st.font, titleFont: st.titleFont === f ? undefined : st.titleFont }; } else fonts.add(f); }
    return { ...s, style: Object.keys(st).some((k) => (st as Record<string, unknown>)[k] !== undefined) ? st : undefined };
  });
  return { slides: out, fixed: [...new Set(fixed)] };
}
