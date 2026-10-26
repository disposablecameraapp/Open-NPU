// What a slide says must come from the text it was made from. A model can invent a figure or a name; this module checks every figure and
// every proper name of a slide against the source and takes out what is not there, whatever the model wrote.
// It also finds the passages of the source a slide needs (the "facts" a writer works from) and audits a finished deck.
import type { Slide } from "./slides";

const NUM = /(?<![\p{L}\p{N}])[$€£]?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*)(?!\d)/gu;
const digitsOf = (n: string) => {
  const d = n.replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
  return (/^\d{1,3}(?:,\d{3})+$/.test(d) || /^\d{1,3}(?:\.\d{3})+$/.test(d) ? d.replace(/[.,]/g, "") : d.replace(",", ".")).replace(/^0+(?=\d)/, "");
};
/** The figures of a text as plain numbers ("$27.6bn" -> "27.6", "1 986" -> "1986", "46%" -> "46"). */
export function figuresOf(text: string): string[] {
  return (text.replace(/\[\d{1,2}\]/g, " ").match(NUM) ?? []).map(digitsOf).filter(Boolean);
}
const ACRONYM_OR_NAME = /(?<![\p{L}\p{N}])(?:[A-Z]{2,}[A-Za-z0-9-]*|\p{Lu}\p{Ll}{2,}(?:-\p{Lu}\p{Ll}+)*)(?![\p{L}\p{N}])/gu;
const COMMON = new Set("the this that these those there then they their what when where which while with without from into over under after before about also and for but not are was were has have had its his her our your one two three four five six seven eight nine ten first second last next new key main more most many some such only each every both other another like how why who".split(" "));
/** Proper names and acronyms of a text, lower-cased, leaving out the first word of a sentence (it is capital anyway). */
export function namesOf(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.replace(/\[\d{1,2}\]/g, " ").split(/(?<=[.!?:;])\s+|\n+/)) {
    const ws = sentence.trim().split(/\s+/);
    const body = ws.slice(/^[A-Z]{2,}/.test(ws[0] ?? "") ? 0 : 1).join(" ");
    for (const m of body.matchAll(ACRONYM_OR_NAME)) { const w = m[0].toLowerCase(); if (!COMMON.has(w)) out.push(w); }
  }
  return out;
}

export interface Source { figures: Set<string>; words: Set<string>; text: string }
export function sourceOf(text: string): Source {
  const clean = text.replace(/<\/?search_results[^>]*>/g, " ");
  return { figures: new Set(figuresOf(clean)), words: new Set((clean.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).flatMap((w) => [w, w.replace(/['’]s$/, "")])), text: clean };
}

/** What a line says that the source does not: figures and names found nowhere in it. */
export function ungrounded(line: string, src: Source): string[] {
  const bad: string[] = [];
  for (const f of figuresOf(line)) if (!src.figures.has(f)) bad.push(f);
  for (const n of namesOf(line)) if (!src.words.has(n) && !src.words.has(n.replace(/s$/, ""))) bad.push(n);
  return bad;
}

const slideTexts = (s: Slide): string[] => [
  ...s.lines.map((l) => l.text), ...(s.flow ?? []), ...(s.stats ?? []).map((x) => `${x.value} ${x.label}`),
  ...(s.columns ?? []).flatMap((c) => [c.head, ...c.lines]), ...(s.blocks ?? []).map((b) => b.text)
];

/** Everything on the slide that the source does not support, for the writer to be asked again. */
export function groundingProblems(s: Slide, src: Source): string[] {
  const bad = [...new Set([...figuresOf(s.title).filter((f) => !src.figures.has(f)), ...slideTexts(s).flatMap((t) => ungrounded(t, src))])];
  return bad.length ? [`These are not in the text you were given, remove them or use only what the text says: ${bad.slice(0, 6).join(", ")}.`] : [];
}

/** The slide with every line that the source does not support taken out; what was taken out is returned too. */
export function groundSlide(s: Slide, src: Source): { slide: Slide; removed: string[] } {
  const removed: string[] = [];
  const ok = (t: string) => { const b = ungrounded(t, src); if (b.length) removed.push(t); return !b.length; };
  let x: Slide = { ...s, lines: s.lines.filter((l) => ok(l.text)) };
  if (x.flow) { const f = x.flow.filter(ok); x = { ...x, flow: f.length >= 2 ? f : undefined }; }
  if (x.stats) { const st = x.stats.filter((v) => ok(`${v.value} ${v.label}`)); x = { ...x, stats: st.length >= 2 ? st : undefined }; }
  if (x.columns) { const c = x.columns.map((col) => ({ ...col, lines: col.lines.filter(ok) })).filter((col) => col.lines.length); x = { ...x, columns: c.length >= 2 ? c : undefined }; }
  if (x.blocks) { const b = x.blocks.filter((v) => ok(v.text)); x = { ...x, blocks: b.length ? b : undefined }; }
  const titleBad = figuresOf(x.title).filter((f) => !src.figures.has(f));
  if (titleBad.length) { removed.push(x.title); x = { ...x, title: x.title.replace(/\s*[\d.,]+\s*%?/g, " ").replace(/\s+/g, " ").trim() || x.title }; }
  return { slide: x, removed };
}

// ---------------------------------------------------------------- the passages a slide needs

export const sentencesOf = (text: string): string[] =>
  text.replace(/<\/?search_results[^>]*>/g, " ").split(/(?<=[.!?])\s+|\n+/).map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter((x) => x.split(/\s+/).length >= 4);

const stems = (t: string) => (t.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !COMMON.has(w)).map((w) => w.replace(/(?:ing|ed|es|s|ment|tion)$/, ""));

/** Without a model: the sentences of the source that share the most words with a topic, in the order of the source. */
export function retrieve(text: string, topic: string, n = 5): string[] {
  const t = new Set(stems(topic));
  if (!t.size) return [];
  const all = sentencesOf(text);
  const scored = all.map((s, i) => ({ s, i, score: [...new Set(stems(s))].filter((w) => t.has(w)).length })).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i).map((x) => x.s);
}

/** A bullet from a sentence of the source, its first clause, kept word for word. */
export function bulletFrom(sentence: string, maxWords = 14): string {
  const clause = sentence.split(/\s*[;:—–]\s*|,\s+(?=(?:and|but|while|which|as)\b)/)[0];
  const w = clause.trim().split(/\s+/);
  return (w.length > maxWords ? w.slice(0, maxWords).join(" ").replace(/[,;:]$/, "") : clause.trim()).replace(/[.]$/, "");
}

// ---------------------------------------------------------------- the audit of a finished deck

export interface Audit { checks: { id: string; ok: boolean; note: string }[]; ok: boolean }

/** The test a deck must pass before it is shown: every slide has something to read, nothing in it is invented, the source was covered. */
export function auditDeck(slides: Slide[], source: string | null, opts: { summary?: boolean; off?: ReadonlySet<string> } = {}): Audit {
  const checks: Audit["checks"] = [];
  const blank = slides.map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && !s.lines.length && !s.table && !s.flow && !s.figure && !s.image && !s.stats && !s.columns && !s.blocks);
  checks.push({ id: "no-empty-slide", ok: !blank.length, note: blank.length ? `empty: slides ${blank.map((x) => x.i + 1).join(", ")}` : "every slide has content" });
  const titles = slides.map((s) => s.title.trim().toLowerCase());
  const dup = titles.filter((t, i) => t && titles.indexOf(t) !== i);
  checks.push({ id: "unique-titles", ok: !dup.length, note: dup.length ? `repeated: ${dup[0]}` : "titles differ" });
  const labels = slides.slice(1, -1).filter((s) => s.title.trim().split(/\s+/).length < 2);
  if (!opts.off?.has("assertion-title")) checks.push({ id: "titles-say-something", ok: !labels.length, note: labels.length ? `label titles: ${labels.map((s) => s.title).slice(0, 3).join(", ")}` : "titles state the point" });
  if (source) {
    const src = sourceOf(source);
    const bad = slides.flatMap((s, i) => groundingProblems(s, src).length ? [i + 1] : []);
    checks.push({ id: "grounded", ok: !bad.length, note: bad.length ? `figures or names not in the text on slides ${bad.join(", ")}` : "every figure and name is in the text" });
    if (!opts.summary) {
      const all = slides.map((s) => `${s.title} ${slideTexts(s).join(" ")} ${s.notes}`).join(" ").toLowerCase();
      const wanted = [...new Set(figuresOf(source.replace(/<search_results[\s\S]*?<\/search_results>/g, " ")))].filter((f) => f.length >= 2);
      const seen = wanted.filter((f) => all.includes(f)).length;
      const cover = wanted.length ? seen / wanted.length : 1;
      checks.push({ id: "covers-the-text", ok: cover >= 0.25, note: `${Math.round(cover * 100)}% of the figures of the text are on the slides` });
    }
  }
  return { checks, ok: checks.every((c) => c.ok) };
}
