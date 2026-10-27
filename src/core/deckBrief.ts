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
  const colour = snap(field(await quiet(ask, `${base}Question: if this subject were a colour, which one would it be? Think of what people picture (technology is blue, a rainforest is green, a sunset is orange). Answer with one of the list.`, oneOf("colour", names)), "colour"), names);
  return { setting, style, colour };
}

/** The look those answers make, as the id of a made theme; null when the style or the colour is missing. */
export function themeFromBrief(b: { style: string | null; colour: string | null }): string | null {
  const hue = COLOURS.find((c) => c.name === b.colour)?.hue;
  const st = STYLES.find((s) => s.id === b.style);
  return st && hue !== undefined ? generateTheme(hue, st.mood, st.id).id : null;
}

/** Does the person's own text hold the facts the slides need, or only what to do with them? */
export async function askInfo(ask: Ask, request: string): Promise<Info | null> {
  const raw = await quiet(ask, `Here is what a person wrote to have a presentation made.\n\n${clip(request, 4000)}\n\nQuestion: does this text itself contain the facts the slides need (figures, names, dates, explanations of each topic)? Answer enough when it does for most of the topics, some when it covers a part of them or is thin, none when it only names the subject or lists topics and instructions without giving the facts. Length does not matter, only the facts in it.`, oneOf("info", ["enough", "some", "none"]));
  return snap(field(raw, "info"), ["enough", "some", "none"] as const);
}

/** A JSON answer from the words of a model's reply (a reply may hold thoughts or a fence around it). */
export const answerOf = (reply: string): unknown => firstJson(reply);
