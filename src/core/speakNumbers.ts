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

/** The text of a sentence as the synthesizer is given it. */
export function forVoice(text: string, lang?: SpeechLang): string {
  const l = lang ?? guessLang(text);
  return speakNumbers(latinize(text, l === "fr"), l);
}
