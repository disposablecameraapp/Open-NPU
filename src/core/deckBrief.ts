// What a presentation request means, asked one simple question at a time instead of read from a list of words. A word list only knows how
// its author talks: another way of saying it, a typing slip or another language falls through. Here a model answers short questions, each
// with one closed answer (a number, one choice of a list), so any wording works; what it says is checked against the list, and an answer
// a few letters away from a choice ("tecnology", "grean") is taken for that choice. The words stay as the first, instant way for the
// plain cases, and a question that fails or gets no usable answer leaves the default: nothing here can stop the deck from being made.
import { STYLES, generateTheme } from "./themeGen";
import { firstJson } from "./look";
import { snap } from "./fuzzy";

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

/** What the words could not tell, asked in ONE call (each call on the NPU re-reads the request, so several in a row cost minutes): the number of slides, where it is shown, which style fits, which colour the subject calls to mind. Each field is a closed answer; one that is missing or off the list stays null and the default is used. */
export async function askBrief(ask: Ask, request: string, said: string, o: { count: boolean; look: boolean }, max: number): Promise<{ count: number | null; setting: Setting | null; style: string | null; colour: string | null }> {
  const ids = STYLES.map((s) => s.id);
  const names = COLOURS.map((c) => c.name);
  const props: Record<string, object> = {};
  const lines: string[] = [];
  if (o.count) { props.count = { type: "integer", minimum: 0, maximum: 40 }; lines.push("count: the precise number of slides (or pages) the request states, or 0 when it states none (the number of items in a list, of paragraphs or of years is not a number of slides)."); }
  if (o.look) {
    props.setting = { type: "string", enum: [...SETTINGS] }; props.style = { type: "string", enum: ids }; props.colour = { type: "string", enum: names };
    lines.push("setting: where it will be shown: work (a company, a meeting, a pitch), school (a class, an exam, a student), science (research, a conference), fun (children, a party, a game), creative (art, music, design), luxury (elegant, premium) or unspecified.");
    lines.push("style: which style fits best. For work, school or science prefer a sober one (corporate, formal, minimal, class, academic). The styles: tech (technology, dark and sharp), retro (old, history), class (school, colourful), corporate (business), nature (ecology, animals), playful (children, fun), elegant (luxury), creative (art, design), bold (sport, energy), minimal (plain), formal (law, institutions), academic (research, theses).");
    lines.push("colour: if this subject were a colour, which one would it be? Pick the one you find fitting and original, not necessarily the first that comes to mind.");
  }
  if (!lines.length) return { count: null, setting: null, style: null, colour: null };
  // the start and the end of a long text hold the subject and the instruction; the middle holds neither
  const text = request.length > 1400 ? `${request.slice(0, 900)}\n[…]\n${request.slice(-450)}` : request;
  const raw = await quiet(ask, `A presentation is to be made. Here is what a person asked for:\n\n${text}\n\n${said.trim() ? `What the person said about the look: ${clip(said.trim(), 300)}\n\n` : ""}Answer these in one JSON object:\n${lines.join("\n")}`, { type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
  const n = Number(field(raw, "count"));
  return {
    count: o.count && Number.isInteger(n) && n >= 3 ? Math.min(max, n) : null,
    setting: o.look ? snap(field(raw, "setting"), SETTINGS) : null,
    style: o.look ? snap(field(raw, "style"), ids) : null,
    colour: o.look ? snap(field(raw, "colour"), names) : null
  };
}

/** The look those answers make, as the id of a made theme; null when the style or the colour is missing. */
export function themeFromBrief(b: { style: string | null; colour: string | null }): string | null {
  const hue = COLOURS.find((c) => c.name === b.colour)?.hue;
  const st = STYLES.find((s) => s.id === b.style);
  return st && hue !== undefined ? generateTheme(hue, st.mood, st.id).id : null;
}

/** Facts a content slide should rest on, on average: below this many in the text the web is searched. */
export const FACTS_PER_SLIDE = 3;

/** The facts a text states, counted without a model (a model asked for them re-reads the whole text and writes a long list, which took over a minute): a sentence with a figure or a name inside it is one. */
export function countFacts(text: string): number {
  return text.split(/(?<=[.!?;:])\s+|\n+/).filter((x) => x.trim().split(/\s+/).length >= 4 && (/\d/.test(x) || /\p{Lu}[\p{L}'’-]+/u.test(x.replace(/^\W*\p{L}+/u, "")))).length;
}

/** From the number of facts and the slides to fill: enough, some or none, by a quota of facts per content slide. */
export function infoLevel(facts: number, contentSlides: number): Info {
  const need = Math.max(1, contentSlides) * FACTS_PER_SLIDE;
  return facts >= need ? "enough" : facts >= need / 2 ? "some" : "none";
}

/** A JSON answer from the words of a model's reply (a reply may hold thoughts or a fence around it). */
export const answerOf = (reply: string): unknown => firstJson(reply);
