import type { Slide } from "./slides";
import { clipPhrase } from "./slides";
import type { DeckPlan } from "./deckBuild";

/**
 * What a text given to be turned into slides already says, read without a model: its parts, its figures, a rise from one
 * value to another. The small model that plans the slides tends to choose plain bullets for everything; these facts let the app
 * give a part with figures the figures layout, give a rise its chart (the numbers are the text's own), and give the writer the
 * part it is writing about instead of the whole text.
 */

const FIGURE = /(?:US)?[$€£]\s?\d[\d.,]*\s?(?:bn|billion|trillion|tn|m|million|k)?\b|\b\d[\d.,]*\s?(?:%|(?:percent|bn|billion|million|trillion)\b)/gi;

/** The parts of a text: its blank-line paragraphs, a lone heading line joined to what follows. */
export function partsOf(text: string): string[] {
  const out: string[] = [];
  for (const p of text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
    const lone = out.length && out[out.length - 1].split("\n").length === 1 && out[out.length - 1].length < 70 && !/[.!?]$/.test(out[out.length - 1]);
    if (lone) out[out.length - 1] += `\n${p}`; else out.push(p);
  }
  return out;
}

export function figuresIn(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(FIGURE)) seen.add(m[0].trim().replace(/[.,]$/, ""));
  return [...seen];
}

const words = (t: string) => new Set(t.toLowerCase().match(/\p{L}{4,}/gu) ?? []);
/** The part of the text a slide is about: the one that shares the most words with its topic. "" when none does. */
export function partFor(source: string, topic: string): string {
  const want = words(topic);
  let best = { part: "", score: 0 };
  for (const part of partsOf(source)) {
    const have = words(part.split("\n")[0] + " " + part.slice(0, 400));
    let score = 0; for (const w of want) if (have.has(w)) score++;
    if (score > best.score) best = { part, score };
  }
  return best.part;
}

/** "rose from $48bn in 2007 to $475bn in 2025" as the rows of a chart; null when the text has no such rise. */
export function trendTable(part: string): string[][] | null {
  const m = /from\s+(?:US)?[$€£]?\s?(\d[\d.,]*)\s?(bn|billion|m|million|%)?\s+in\s+((?:19|20)\d\d)\s+to\s+(?:US)?[$€£]?\s?(\d[\d.,]*)\s?(bn|billion|m|million|%)?\s+in\s+((?:19|20)\d\d)/i.exec(part);
  if (!m) return null;
  const subject = /\b(exports?|imports?|gdp|fdi|sales|revenue|growth|reserves|trade|users|population)\b[^.]{0,40}\b(?:rose|grew|increased|climbed|jumped|went up)/i.exec(part)?.[1];
  const unit = (m[2] ?? m[5] ?? "").toLowerCase().replace("billion", "bn").replace("million", "m");
  const head = `${subject ? subject[0].toUpperCase() + subject.slice(1).toLowerCase() : "Value"}${unit ? ` (${unit})` : ""}`;
  return [["Year", head], [m[3], m[1].replace(/,/g, "")], [m[6], m[4].replace(/,/g, "")]];
}

/** The plan, with a part of the text that is full of figures shown as figures and a rise shown as a chart, where the planner chose plain bullets. */
export function enrichPlan(plan: DeckPlan, source: string): DeckPlan {
  let stats = plan.slides.filter((s) => s.visual === "stats").length;
  let charts = plan.slides.filter((s) => s.visual === "chart").length;
  const slides = plan.slides.map((s) => {
    if (s.role !== "content" || s.visual !== "none") return s;
    const part = partFor(source, s.topic);
    if (!part) return s;
    if (trendTable(part) && charts < 2) { charts++; return { ...s, visual: "chart" as const, hint: "bar the rise given in the text" }; }
    if (figuresIn(part).length >= 4 && stats < 3) { stats++; return { ...s, visual: "stats" as const, hint: `the figures of this part: ${figuresIn(part).slice(0, 4).join("; ")}` }; }
    return s;
  });
  return { ...plan, slides };
}

/** A slide written from the text itself, when the model's slide came back empty: the part's sentences, shortened at a natural place. */
export function slideFromPart(topic: string, part: string): Slide {
  const sentences = part.replace(/^[^\n]*\n(?=[^\n]*[.!?])/, "").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.split(" ").length >= 4);
  const lines = sentences.slice(0, 3).map((x) => ({ text: clipPhrase(x.replace(/[.!?]$/, ""), 14), level: 0, bullet: true }));
  return { title: clipPhrase(topic, 9), lines, table: null, notes: "" };
}
