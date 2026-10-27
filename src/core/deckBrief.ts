// What a presentation request means, asked one simple question at a time instead of read from a list of words. A word list only knows how
// its author talks: another way of saying it, a typing slip or another language falls through. Here a model answers short questions, each
// with one closed answer (a number, one choice of a list), so any wording works; what it says is checked against the list, and an answer
// a few letters away from a choice ("tecnology", "grean") is taken for that choice. The words stay as the first, instant way for the
// plain cases, and a question that fails or gets no usable answer leaves the default: nothing here can stop the deck from being made.
import { STYLES, generateTheme } from "./themeGen";
import { firstJson } from "./look";
import { editDistance, plainWord, slack, snap } from "./fuzzy";

export { snap, mendWords, editDistance } from "./fuzzy";

/** A closed question: the model's JSON answer, or null when it gave none. */
export type Ask = (question: string, schema: object) => Promise<unknown>;

/** A colour a subject may suggest, with the hue the look is made from. */
export const COLOURS: { name: string; hue: number }[] = [
  { name: "red", hue: 355 }, { name: "orange", hue: 25 }, { name: "yellow", hue: 45 }, { name: "green", hue: 140 }, { name: "teal", hue: 175 },
  { name: "blue", hue: 215 }, { name: "navy", hue: 228 }, { name: "purple", hue: 270 }, { name: "pink", hue: 330 }, { name: "brown", hue: 22 }
];
export const SETTINGS = ["work", "school", "science", "fun", "creative", "luxury", "unspecified"] as const;
export type Setting = (typeof SETTINGS)[number];
/** How much of what the slides need is in the person's own text. */
export type Info = "enough" | "some" | "none";

const oneOf = (key: string, values: readonly string[]) => ({ type: "object", additionalProperties: false, required: [key], properties: { [key]: { type: "string", enum: [...values] } } });
const field = (raw: unknown, key: string): unknown => (raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : undefined);
const quiet = async (ask: Ask, q: string, schema: object): Promise<unknown> => { try { return await ask(q, schema); } catch { return null; } };

export interface Brief { count: number | null; setting: Setting | null; style: string | null; colour: string | null; info: Info | null }

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** How many slides were asked for, when the words found none: the model reads the request and answers a number, 0 for none. */
export async function askCount(ask: Ask, request: string, max: number): Promise<number | null> {
  const raw = await quiet(ask, `Here is what a person asked for.\n\n${clip(request, 2500)}\n\nQuestion: does it state a precise number of slides (or pages) for the presentation? Answer with that number, or 0 when it states none. The number of items in a list, of paragraphs or of years is not a number of slides.`, { type: "object", additionalProperties: false, required: ["count"], properties: { count: { type: "integer", minimum: 0, maximum: 40 } } });
  const n = Number(field(raw, "count"));
  return Number.isInteger(n) && n >= 3 ? Math.min(max, n) : null;
}

/** For the look, three short questions in a row: where it will be used, which style fits, which colour the subject calls to mind. */
export async function askLook(ask: Ask, subject: string, said: string): Promise<{ setting: Setting | null; style: string | null; colour: string | null }> {
  const base = `A presentation is to be made.\nWhat it is about and what was asked:\n${clip(subject, 1200)}\n${said.trim() ? `What the person said about the look: ${clip(said.trim(), 300)}\n` : ""}`;
  const setting = snap(field(await quiet(ask, `${base}\nQuestion: where will it be shown? work (a company, a meeting, a pitch), school (a class, an exam, a student), science (research, a conference), fun (children, a party, a game), creative (art, music, design), luxury (elegant, premium) or unspecified.`, oneOf("setting", SETTINGS)), "setting"), SETTINGS);
  const sober = setting === "work" || setting === "school" || setting === "science";
  const ids = STYLES.map((s) => s.id);
  const style = snap(field(await quiet(ask, `${base}Where it is shown: ${setting ?? "unspecified"}.\nQuestion: which style fits best? ${sober ? "For this setting prefer a sober style (corporate, formal, minimal, class, academic). " : ""}The styles: tech (technology, dark and sharp), retro (old, history), class (school, colourful), corporate (business), nature (ecology, animals), playful (children, fun), elegant (luxury), creative (art, design), bold (sport, energy), minimal (plain), formal (law, institutions), academic (research, theses). Answer with one.`, oneOf("style", ids)), "style"), ids);
  const names = COLOURS.map((c) => c.name);
  const colour = snap(field(await quiet(ask, `${base}Question: if this subject were a colour, which one would it be? Be creative: pick the one you find fitting and original, not necessarily the first that comes to mind. Answer with one of the list.`, oneOf("colour", names)), "colour"), names);
  return { setting, style, colour };
}

/** The look those answers make, as the id of a made theme; null when the style or the colour is missing. */
export function themeFromBrief(b: { style: string | null; colour: string | null }): string | null {
  const hue = COLOURS.find((c) => c.name === b.colour)?.hue;
  const st = STYLES.find((s) => s.id === b.style);
  return st && hue !== undefined ? generateTheme(hue, st.mood, st.id).id : null;
}

/** Facts a content slide should rest on, on average: below this many in the text the web is searched. */
export const FACTS_PER_SLIDE = 3;

const STOPS = new Set(["the", "and", "for", "was", "are", "its", "has", "had", "not", "but", "you", "que", "les", "des", "une", "est", "pas", "sur", "par", "that", "this", "with", "from", "have", "were", "which", "their", "dans", "avec", "pour", "sont", "plus", "cette", "etait", "leur"]);
const factWords = (t: string) => plainWord(t.replace(/(\d)[\s.,'’](?=\d{3}\b)/g, "$1")).split(/\s+/).filter((w) => (w.length >= 3 && !STOPS.has(w)) || /\d/.test(w));
const digitsOf = (w: string) => w.replace(/\D/g, "");
/** Is this word of a fact somewhere in the text, however it is written: another ending (export, exports, exported), a slip, "475bn" for "475 billion"? */
function seenIn(w: string, have: string[], set: Set<string>): boolean {
  if (set.has(w)) return true;
  if (/\d/.test(w)) { const d = digitsOf(w); return !!d && have.some((x) => /\d/.test(x) && (digitsOf(x) === d || (Math.min(d.length, digitsOf(x).length) >= 3 && (digitsOf(x).startsWith(d) || d.startsWith(digitsOf(x)))))); }
  const stem = w.slice(0, Math.max(3, w.length - 3));
  return have.some((x) => x.startsWith(stem) || (Math.abs(x.length - w.length) <= 2 && editDistance(x, w) <= slack(w.length)));
}
/** The facts that are in the text: a model asked for precision rewords a little, so a fact counts when about half of its words are found, written any way; one with almost none was made up and is dropped. */
export function groundedFacts(facts: unknown, text: string): string[] {
  if (!Array.isArray(facts)) return [];
  const have = [...new Set(factWords(text))];
  const set = new Set(have);
  const out: string[] = [];
  for (const f of facts) {
    if (typeof f !== "string") continue;
    const w = [...new Set(factWords(f))];
    const nums = w.filter((x) => /\d/.test(x));
    // a figure the text never gives is the clearest sign of an invented fact
    if (w.length >= 2 && w.filter((x) => seenIn(x, have, set)).length / w.length >= 0.5 && (!nums.length || nums.some((x) => seenIn(x, have, set))) && !out.includes(f.trim())) out.push(f.trim());
  }
  return out;
}

/** The facts the person's own text states, one by one: asked as a list rather than as "is there enough?", which a model always answers yes. */
export async function askFacts(ask: Ask, request: string): Promise<string[]> {
  const text = clip(request, 6000);
  const raw = await quiet(ask, `Here is a text.\n\n${text}\n\nList every fact that this text itself states, as short bullet points: a figure, a date, a name, a place, or a concrete claim with its detail. Copy only what the text says and add nothing from what you know. A title, a topic name, an instruction (make slides, use this colour) or a vague phrase is not a fact. If the text states none, send an empty list.`, { type: "object", additionalProperties: false, required: ["facts"], properties: { facts: { type: "array", maxItems: 60, items: { type: "string" } } } });
  return groundedFacts(field(raw, "facts"), text);
}

/** From the number of facts and the slides to fill: enough, some or none, by a quota of facts per content slide. */
export function infoLevel(facts: number, contentSlides: number): Info {
  const need = Math.max(1, contentSlides) * FACTS_PER_SLIDE;
  return facts >= need ? "enough" : facts >= need / 2 ? "some" : "none";
}

/** A JSON answer from the words of a model's reply (a reply may hold thoughts or a fence around it). */
export const answerOf = (reply: string): unknown => firstJson(reply);
