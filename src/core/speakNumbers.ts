/**
 * What the synthesizer is given is not what the screen shows. A voice made for English drops what it cannot say, without a word: digits
 * ("1986") and letters it has never seen ("Đổi Mới", "Nguyễn"). The screen keeps the text as it was written; the voice gets numbers written out
 * in the language of the answer and foreign letters reduced to the ones its alphabet has.
 */
export type SpeechLang = "en" | "fr";

const FR_WORDS = new Set(["le", "la", "les", "des", "une", "est", "et", "pour", "dans", "que", "qui", "sur", "avec", "pas", "vous", "nous", "je", "tu", "il", "elle", "ce", "cette", "ces", "au", "aux", "du", "mais", "ou", "où", "donc", "son", "sa", "ses", "mon", "ma", "mes", "en", "un", "ont", "sont", "été", "être", "comme", "plus", "très", "fait", "ça", "c'est", "d'un", "d'une", "l'", "qu'"]);
const EN_WORDS = new Set(["the", "and", "of", "to", "in", "is", "that", "it", "for", "with", "was", "as", "are", "this", "on", "by", "from", "at", "an", "be", "which", "or", "were", "has", "have", "not", "but", "their", "its", "into", "also", "than", "then"]);

/** The language of a text, from its most common small words (English when it cannot tell). */
export function guessLang(text: string): SpeechLang {
  let fr = 0, en = 0;
  for (const w of text.toLowerCase().split(/[^\p{L}']+/u)) { if (FR_WORDS.has(w)) fr++; if (EN_WORDS.has(w)) en++; }
  return fr > en ? "fr" : "en";
}

const EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES = ["", " thousand", " million", " billion", " trillion"];

function enBelow1000(n: number): string {
  const out: string[] = [];
  if (n >= 100) { out.push(`${EN_UNITS[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) { out.push(EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_UNITS[n % 10]}` : "")); }
  else if (n > 0 || !out.length) out.push(EN_UNITS[n]);
  return out.join(" ");
}

export function enNumber(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (let i = 0; n > 0 && i < EN_SCALES.length; i++, n = Math.floor(n / 1000)) if (n % 1000) parts.unshift(enBelow1000(n % 1000) + EN_SCALES[i]);
  return parts.join(" ");
}

/** A year as it is said: 1986 "nineteen eighty-six", 2007 "two thousand seven", 2015 "twenty fifteen", 1900 "nineteen hundred". */
export function enYear(n: number): string {
  if (n >= 2000 && n < 2010) return n === 2000 ? "two thousand" : `two thousand ${EN_UNITS[n - 2000]}`;
  const a = Math.floor(n / 100), b = n % 100;
  if (b === 0) return `${enNumber(a)} hundred`;
  return `${enNumber(a)} ${b < 10 ? `oh ${EN_UNITS[b]}` : enNumber(b)}`;
}

const FR_UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const FR_TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

function frBelow100(n: number): string {
  if (n < 20) return FR_UNITS[n];
  if (n < 70) { const t = Math.floor(n / 10), u = n % 10; return FR_TENS[t] + (u === 1 ? " et un" : u ? `-${FR_UNITS[u]}` : ""); }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${FR_UNITS[n - 60]}`;
  if (n === 80) return "quatre-vingts";
  return `quatre-vingt-${FR_UNITS[n - 80]}`;
}

function frBelow1000(n: number, plural = true): string {
  const h = Math.floor(n / 100), r = n % 100;
  const out: string[] = [];
  if (h) out.push(h === 1 ? "cent" : `${FR_UNITS[h]} cent${r === 0 && plural ? "s" : ""}`);
  if (r) out.push(h === 0 || r < 100 ? (r === 80 && !plural ? "quatre-vingt" : frBelow100(r)) : "");
  return out.join(" ") || "zéro";
}

export function frNumber(n: number): string {
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const bil = Math.floor(n / 1e9), mil = Math.floor((n % 1e9) / 1e6), th = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  if (bil) parts.push(`${frNumber(bil)} milliard${bil > 1 ? "s" : ""}`);
  if (mil) parts.push(`${frNumber(mil)} million${mil > 1 ? "s" : ""}`);
  if (th) parts.push(th === 1 ? "mille" : `${frBelow1000(th, false)} mille`);
  if (rest) parts.push(frBelow1000(rest));
  return parts.join(" ");
}

const ENORD: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
function enOrdinal(n: number): string {
  const w = enNumber(n);
  const m = /^(.*?)([a-z]+)$/.exec(w.replace(/-/g, "- "))!;
  const last = m[2];
  const o = ENORD[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return (m[1] + o).replace(/- /g, "-");
}

/** Numbers, percentages, money and ordinals of a text written out in words, in the given language. */
export function speakNumbers(text: string, lang: SpeechLang = "en"): string {
  const say = (n: number) => (lang === "fr" ? frNumber(n) : enNumber(n));
  const digits = (s: string) => s.split("").map((d) => (lang === "fr" ? FR_UNITS : EN_UNITS)[+d]).join(" ");
  const whole = (s: string, year: boolean) => {
    if (/^0\d/.test(s) || s.length > 12) return digits(s);
    const n = parseInt(s, 10);
    return year && lang === "en" && n >= 1000 && n <= 2099 ? enYear(n) : say(n);
  };
  const num = (s: string, year = false) => {
    const m = /^(\d+)[.,](\d+)$/.exec(s);
    if (m) return `${whole(m[1], false)} ${lang === "fr" ? "virgule" : "point"} ${digits(m[2])}`;
    return whole(s, year);
  };
  let t = text;
  t = t.replace(/(\d{1,3})(?:,(\d{3}))+(?!\d)/g, (m) => m.replace(/,/g, "")); // 475,000
  t = t.replace(/(\d{1,3})(?:[   ](\d{3}))+(?!\d)/g, (m) => m.replace(/[   ]/g, "")); // 475 000
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_, n) => ` ${num(n)} ${lang === "fr" ? "pour cent" : "percent"} `);
  t = t.replace(/[$€£]\s?(\d+(?:[.,]\d+)?)(\s*(?:billion|million|thousand|trillion|milliards?|millions?|mille))?/gi, (m, n, s = "") => {
    const cur = m[0] === "$" ? (lang === "fr" ? "dollars" : "dollars") : m[0] === "€" ? "euros" : lang === "fr" ? "livres" : "pounds";
    return ` ${num(n)}${s} ${cur} `;
  });
  t = t.replace(/(\d+(?:[.,]\d+)?)\s?([$€£])/g, (_, n, c) => ` ${num(n)} ${c === "$" ? "dollars" : c === "€" ? "euros" : lang === "fr" ? "livres" : "pounds"} `);
  t = t.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, n) => (lang === "en" ? ` ${enOrdinal(parseInt(n, 10))} ` : ` ${say(parseInt(n, 10))} `));
  t = t.replace(/\b(\d+)(er|ère|e|ème|eme)\b/gi, (_, n) => (lang === "fr" ? (n === "1" ? " premier " : ` ${say(parseInt(n, 10))}ième `) : ` ${say(parseInt(n, 10))} `));
  t = t.replace(/\d+(?:[.,]\d+)?/g, (m, off: number, all: string) => {
    const year = /^\d{4}$/.test(m) && !/[.,]\d/.test(all.slice(off + m.length, off + m.length + 2));
    return ` ${num(m, year)} `;
  });
  return t.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

/** Letters the voice's alphabet does not have reduced to the ones it has ("Đổi Mới" → "Doi Moi", "Nguyễn" → "Nguyen"). */
export function latinize(text: string, keepAccents = true): string {
  const t = text.replace(/đ/g, "d").replace(/Đ/g, "D").replace(/ø/g, "o").replace(/Ø/g, "O").replace(/ł/g, "l").replace(/Ł/g, "L");
  // the accents of é, è, ç, ñ, í belong to French, Spanish...: kept for a French answer, taken off for an English voice
  const letters = keepAccents ? /[Ā-ɏḀ-ỿ]+/g : /[^\u0000-\u007F]+/g;
  return t.replace(letters, (run) => run.normalize("NFD").replace(/\p{M}/gu, ""));
}

/** Signs and units the voice would skip or mispronounce, written as the words they stand for. */
export function speakSymbols(text: string, lang: SpeechLang = "en"): string {
  const fr = lang === "fr";
  let t = text;
  t = t.replace(/\bkm\/h\b|\bkph\b/gi, fr ? " kilomètres par heure " : " kilometers per hour ").replace(/\bm\/s\b/gi, fr ? " mètres par seconde " : " meters per second ").replace(/\bmph\b/gi, " miles per hour ");
  t = t.replace(/°\s?C\b/g, fr ? " degrés Celsius " : " degrees Celsius ").replace(/°\s?F\b/g, " degrees Fahrenheit ").replace(/°/g, fr ? " degrés " : " degrees ");
  t = t.replace(/(\w)\+\+/g, "$1 plus plus ").replace(/\+/g, fr ? " plus " : " plus ");
  t = t.replace(/\s*[≈≃]\s*/g, fr ? " environ " : " approximately ").replace(/≠/g, fr ? " différent de " : " is not equal to ").replace(/≥/g, fr ? " supérieur ou égal à " : " greater than or equal to ").replace(/≤/g, fr ? " inférieur ou égal à " : " less than or equal to ");
  t = t.replace(/±/g, fr ? " plus ou moins " : " plus or minus ").replace(/×/g, fr ? " fois " : " times ").replace(/÷/g, fr ? " divisé par " : " divided by ");
  t = t.replace(/(\d)\s*\*\s*(\d)|(\s)\*(\s)/g, (m, a, b) => (a ? `${a} ${fr ? "fois" : "times"} ${b}` : ` ${fr ? "fois" : "times"} `));
  t = t.replace(/\^/g, fr ? " puissance " : " to the power of ");
  t = t.replace(/\s*(->|→|=>|⇒)\s*/g, ", ").replace(/>/g, fr ? " supérieur à " : " greater than ").replace(/</g, fr ? " inférieur à " : " less than ");
  t = t.replace(/=/g, fr ? " égale " : " equals ");
  t = t.replace(/&/g, fr ? " et " : " and ").replace(/@/g, fr ? " arobase " : " at ");
  // a dash between numbers is a minus in a sum, a range elsewhere
  const sum = /[=]|equals|égale/.test(t);
  t = t.replace(/(\d)\s+-\s+(\d)/g, (_, a, b) => `${a} ${sum ? (fr ? "moins" : "minus") : fr ? "à" : "to"} ${b}`).replace(/(\d)\s?–\s?(\d)/g, (_, a, b) => `${a} ${fr ? "à" : "to"} ${b}`);
  t = t.replace(/\b(\d+)\/(\d+)\b/g, (_, a, b) => `${a} ${fr ? "sur" : "over"} ${b}`);
  t = t.replace(/\s*\/\s*/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** Acronyms that are said as words, and units, with the spelling that makes the voice say them right. The others are spelled out letter by letter. */
const ACRONYM_WORDS: Record<string, string> = {
  ASEAN: "Ah-see-ahn", NASA: "Nasa", NATO: "Nato", UNESCO: "Unesco", UNICEF: "Unicef", OPEC: "Oh-pek", APEC: "Ay-pek", FIFA: "Feefa", UEFA: "Wayfa", NAFTA: "Nafta",
  COVID: "Covid", RAM: "ram", ROM: "rom", SIM: "sim", PIN: "pin", LASER: "laser", RADAR: "radar", SCUBA: "scuba", JSON: "Jason", GUI: "gooey", TOPS: "tops",
  JPEG: "jay-peg", GIF: "gif", OK: "okay", WIFI: "wifi", LIDAR: "lidar", SQL: "sequel", NPM: "N P M",
  GB: "gigabytes", MB: "megabytes", TB: "terabytes", KB: "kilobytes", GHZ: "gigahertz", MHZ: "megahertz", FPS: "frames per second", GBPS: "gigabits per second", MBPS: "megabits per second"
};
const ROMAN_ONLY = /^[IVX]+$/;

/** True when most of the words of a sentence are in capitals: a headline or a shout, not a list of acronyms. */
function shouting(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => /\p{L}{2}/u.test(w));
  return words.length >= 3 && words.filter((w) => w === w.toUpperCase() && /\p{Lu}/u.test(w)).length > words.length / 2;
}

/** Common acronyms the voice says best as the words they stand for. */
const EXPANSIONS: Record<string, string> = {
  IMF: "International Monetary Fund", WTO: "World Trade Organization", ILO: "International Labour Organization", WHO: "World Health Organization",
  UN: "United Nations", EU: "European Union", UK: "United Kingdom", USA: "United States of America", GDP: "gross domestic product",
  FDI: "foreign direct investment", OECD: "Organisation for Economic Co-operation and Development", NGO: "non-governmental organization",
  CEO: "chief executive officer", NPU: "neural processing unit", GPU: "graphics processing unit", CPU: "central processing unit",
  AI: "artificial intelligence", LLM: "large language model", API: "application programming interface", USB: "U S B", PDF: "P D F", URL: "U R L",
  FMI: "Fonds monétaire international", OMC: "Organisation mondiale du commerce", OIT: "Organisation internationale du travail", OMS: "Organisation mondiale de la santé",
  ONU: "Organisation des Nations unies", UE: "Union européenne", PIB: "produit intérieur brut", ONG: "organisation non gouvernementale"
};
const SMALL = new Set(["of", "the", "and", "for", "in", "on", "to", "a", "an", "de", "du", "des", "la", "le", "les", "et", "pour", "au", "aux", "en", "d", "l"]);

/** Whether the capitals of `acr` are the starting letters of the words of `name` ("ASEAN" in "Association of Southeast Asian Nations"). */
function stands(acr: string, name: string): boolean {
  const words = name.split(/[\s-]+/).filter((w) => w && !SMALL.has(w.toLowerCase()));
  if (words.length < 2) return false;
  const go = (wi: number, ai: number): boolean => {
    if (wi === words.length) return ai === acr.length;
    const w = words[wi].toUpperCase().replace(/[^\p{L}]/gu, "");
    if (!w || w[0] !== acr[ai]) return false;
    for (let k = Math.min(w.length, acr.length - ai); k >= 1; k--) {
      let at = 0, ok = true;
      for (let c = 0; c < k && ok; c++) { const f = w.indexOf(acr[ai + c], c === 0 ? 0 : at + 1); if (f < 0 || (c === 0 && f !== 0)) ok = false; else at = f; }
      if (ok && go(wi + 1, ai + k)) return true;
    }
    return false;
  };
  return go(0, 0);
}

const NAME = String.raw`\p{Lu}[\p{L}'’.-]*(?:\s+(?:(?:of|the|and|for|de|du|des|la|le|les|et|pour|d'|l')\s+)*\p{Lu}[\p{L}'’.-]*){1,7}`;

/** The acronyms a text defines itself: "International Monetary Fund (IMF)" and "IMF (International Monetary Fund)". */
export function learnAcronyms(text: string): Record<string, string> {
  const known: Record<string, string> = {};
  for (const m of text.matchAll(new RegExp(String.raw`(${NAME})\s*\((\p{Lu}{2,7})s?\)`, "gu"))) {
    // the name may have caught words before it ("The International Monetary Fund"): the shortest tail that fits is the name
    const words = m[1].split(/\s+/);
    for (let i = words.length - 2; i >= 0; i--) { const name = words.slice(i).join(" "); if (stands(m[2], name)) { known[m[2]] = name; break; } } // the shortest tail that fits
  }
  for (const m of text.matchAll(/\b(\p{Lu}{2,7})s?\s*\(([^()\n]{5,90})\)/gu)) if (stands(m[1], m[2].trim())) known[m[1]] = m[2].trim();
  return known;
}

/**
 * Acronyms for the voice. The words they stand for when they are known (the common ones, and the ones the text defines itself, where the
 * definition's own repeat is dropped); a few said as words ("ASEAN" "Ah-see-ahn"); the others spelled letter by letter ("IMF" "I M F").
 */
export function speakAcronyms(text: string, known: Record<string, string> = {}): string {
  if (shouting(text)) return text;
  let t = text;
  // "International Monetary Fund (IMF)" and "IMF (International Monetary Fund)" say the name once
  for (const [acr, name] of Object.entries(known)) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`${esc}\\s*\\(${acr}s?\\)`, "g"), name).replace(new RegExp(`\\b${acr}s?\\s*\\(${esc}\\)`, "g"), name);
  }
  return t.replace(/\b([A-Z]{2,7})(s?)\b(?![-\w]*[a-z])/g, (m, a: string, plural: string) => {
    const full = known[a] ?? EXPANSIONS[a];
    if (full) return full + (plural && /[a-z]$/.test(full) && !/s$/.test(full) ? "s" : "");
    const word = ACRONYM_WORDS[a];
    if (word) return word + (plural && !/[a-z]$/.test(word) ? "" : plural);
    if (ROMAN_ONLY.test(a)) return m;
    return a.split("").join(" ") + plural;
  });
}

/** The text of a sentence as the synthesizer is given it. */
export function forVoice(text: string, lang?: SpeechLang, known: Record<string, string> = {}): string {
  const l = lang ?? guessLang(text);
  return speakNumbers(speakAcronyms(speakSymbols(latinize(text, l === "fr"), l), known), l);
}
