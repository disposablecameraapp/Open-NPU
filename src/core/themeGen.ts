import type { Theme } from "./slides";
import { fromHsl } from "./color";
import { legalize } from "./look";

/**
 * Themes made on demand instead of listed: a hue, a mood (light, dark, pastel, vivid, earthy, mono) and a style (fonts,
 * decoration, cover, pattern) give hundreds of looks from a few lines of data. People ask for them in words, in French or
 * English ("un thème un peu vieux", "technologie", "pour une présentation de classe"): `findTheme` reads the words and
 * composes the look. Nothing here is a list of colours to maintain, and no outside palette is shipped.
 */

export const MOODS = ["light", "dark", "pastel", "vivid", "earthy", "mono"] as const;
export type Mood = (typeof MOODS)[number];

interface Style { id: string; titleFont: string; bodyFont: string; deco: Theme["deco"]; cover: Theme["cover"]; pattern: Theme["pattern"]; mood: Mood; hue: number; round?: boolean }
export const STYLES: Style[] = [
  { id: "tech", titleFont: "Bahnschrift", bodyFont: "Segoe UI", deco: "top", cover: "split", pattern: "grid", mood: "dark", hue: 200 },
  { id: "retro", titleFont: "Georgia", bodyFont: "Palatino Linotype", deco: "band", cover: "frame", pattern: "none", mood: "earthy", hue: 30 },
  { id: "class", titleFont: "Trebuchet MS", bodyFont: "Calibri", deco: "bar", cover: "light", pattern: "circles", mood: "vivid", hue: 215 },
  { id: "corporate", titleFont: "Calibri", bodyFont: "Calibri", deco: "top", cover: "deep", pattern: "circles", mood: "light", hue: 215 },
  { id: "nature", titleFont: "Palatino Linotype", bodyFont: "Calibri", deco: "band", cover: "split", pattern: "circles", mood: "earthy", hue: 140 },
  { id: "playful", titleFont: "Trebuchet MS", bodyFont: "Segoe UI", deco: "bar", cover: "light", pattern: "circles", mood: "vivid", hue: 35 },
  { id: "elegant", titleFont: "Garamond", bodyFont: "Georgia", deco: "none", cover: "frame", pattern: "none", mood: "dark", hue: 42 },
  { id: "creative", titleFont: "Georgia", bodyFont: "Trebuchet MS", deco: "bar", cover: "split", pattern: "circles", mood: "pastel", hue: 280 },
  { id: "bold", titleFont: "Bahnschrift", bodyFont: "Segoe UI", deco: "bar", cover: "deep", pattern: "none", mood: "dark", hue: 45 },
  { id: "minimal", titleFont: "Segoe UI", bodyFont: "Segoe UI", deco: "none", cover: "light", pattern: "none", mood: "mono", hue: 215 },
  { id: "formal", titleFont: "Cambria", bodyFont: "Calibri", deco: "band", cover: "frame", pattern: "none", mood: "light", hue: 225 },
  { id: "academic", titleFont: "Garamond", bodyFont: "Georgia", deco: "top", cover: "light", pattern: "none", mood: "light", hue: 350 }
];

// ---------------------------------------------------------------- colour
const hsl = (h: number, sat: number, l: number) => fromHsl(h, sat, l);

/** A theme from a hue (0 to 360), a mood and a style. */
export function generateTheme(hue: number, mood: Mood, styleId: string): Theme {
  const st = STYLES.find((x) => x.id === styleId) ?? STYLES[3];
  const h = ((Math.round(hue) % 360) + 360) % 360;
  const pal = (p: { bg: string; text: string; title: string; muted: string; accent: string; panel: string; dark: boolean; accents?: string[] }) => p;
  const others = (s: number, l: number) => [hsl(h + 180, s, l), hsl(h + 40, s + 5, l + 4), hsl(h - 50, s, l)];
  const p = {
    light: () => pal({ bg: hsl(h, 30, 97), text: hsl(h, 25, 14), title: hsl(h, 62, 26), muted: hsl(h, 12, 48), accent: hsl(h, 72, 45), panel: hsl(h, 40, 93), dark: false }),
    dark: () => pal({ bg: hsl(h, 45, 10), text: hsl(h, 20, 90), title: "FFFFFF", muted: hsl(h, 15, 66), accent: hsl(h, 88, 62), panel: hsl(h, 35, 17), dark: true }),
    pastel: () => pal({ bg: hsl(h, 60, 96), text: hsl(h, 25, 20), title: hsl(h, 45, 34), muted: hsl(h, 18, 50), accent: hsl(h, 62, 58), panel: hsl(h, 55, 90), dark: false }),
    vivid: () => pal({ bg: hsl(h, 100, 98), text: hsl(h, 30, 14), title: hsl(h, 90, 28), muted: hsl(h, 20, 46), accent: hsl(h, 95, 48), panel: hsl(h, 100, 92), dark: false }),
    earthy: () => pal({ bg: hsl(h, 28, 94), text: hsl(h, 30, 16), title: hsl(h, 55, 24), muted: hsl(h, 16, 46), accent: hsl(h, 58, 36), panel: hsl(h, 30, 88), dark: false }),
    mono: () => pal({ bg: "F8F8F8", text: "1A1A1A", title: "000000", muted: "777777", accent: hsl(h, 75, 44), panel: "EBEBEB", dark: false })
  }[mood]();
  const accents = [p.accent, ...others(p.dark ? 80 : 62, p.dark ? 62 : 42)];
  const names: Record<number, string> = { 0: "Red", 30: "Orange", 45: "Gold", 60: "Lime", 140: "Green", 175: "Teal", 200: "Cyan", 215: "Blue", 225: "Navy", 270: "Purple", 300: "Magenta", 330: "Pink" };
  const near = Object.keys(names).map(Number).sort((a, b) => Math.min(Math.abs(a - h), 360 - Math.abs(a - h)) - Math.min(Math.abs(b - h), 360 - Math.abs(b - h)))[0];
  return legalize({ id: `gen:${h}-${mood}-${st.id}`, name: `${names[near]} ${mood} ${st.id}`, hint: `${mood} ${names[near].toLowerCase()}, ${st.id} style`, ...p, accents, titleFont: st.titleFont, bodyFont: st.bodyFont, deco: st.deco, cover: st.cover, pattern: st.pattern }).theme;
}

// ---------------------------------------------------------------- words
/** A word-boundary regex that understands accented letters (JavaScript's \\b does not: it fails before "é"). */
const wb = (re: RegExp): RegExp => new RegExp(re.source.replace(/^\\b\(/, "(?<![\\p{L}\\d])(").replace(/\)\\b$/, ")(?![\\p{L}\\d])").replace(/\\w/g, "\\p{L}"), "u");
const HUES: [RegExp, number][] = [
  [/\b(rouge|red|bordeaux|burgundy|cramoisi)\b/, 355], [/\b(orange|corail|coral)\b/, 25], [/\b(jaune|yellow|dor[ée]e?|gold|golden|ambre|amber)\b/, 45],
  [/\b(vert|green|[ée]meraude|emerald|olive|sauge|sage)\b/, 140], [/\b(turquoise|teal|sarcelle)\b/, 175], [/\b(cyan|aqua)\b/, 195], [/\b(bleu|blue|azur)\b/, 215],
  [/\b(marine|navy|indigo)\b/, 228], [/\b(violet|purple|mauve|lavande|lavender)\b/, 270], [/\b(rose|pink|fuchsia|magenta)\b/, 330], [/\b(marron|brown|brun|chocolat|caf[ée]|terracotta)\b/, 22]
];
const MOOD_WORDS: [RegExp, Mood][] = [
  [/\b(sombre|dark|nuit|night|noir|black|fonc[ée]e?)\b/, "dark"], [/\b(clair|light|blanc|white|lumineux|bright)\b/, "light"], [/\b(pastel|doux|douce|soft|tendre|d[ée]licat)\b/, "pastel"],
  [/\b(color[ée]e?s?|vif|vive|vivid|colou?rful|[ée]clatant|flashy|punchy|saturated)\b/, "vivid"], [/\b(terre|earthy|naturel|sobre muted|sourd|chaud|warm)\b/, "earthy"], [/\b(gris|grey|gray|monochrome|neutre|neutral)\b/, "mono"]
];
const STYLE_WORDS: [RegExp, string][] = [
  [/\b(tech\w*|techno\w*|ia|ai|intelligence artificielle|code|coding|informatique|num[ée]rique|digital|cyber\w*|futur\w*|startup|software|logiciel|robot\w*|data|donn[ée]es|science fiction|sci-fi)\b/, "tech"],
  [/\b(vieux|vieille|ancien\w*|old|vintage|r[ée]tro|retro|antique|histoire|history|historique|historical|m[ée]di[ée]val\w*|parchemin|classique d'autrefois|ann[ée]es? \d0|seventies|eighties|nineties)\b/, "retro"],
  [/\b(classe|class|[ée]cole|school|coll[èe]ge|lyc[ée]e|cours|expos[ée]|presentation de classe|pr[ée]sentation de classe|[ée]tudiant\w*|student\w*|prof\w*|teacher|note|notes|grade|points?|devoir|homework|oral|soutenance|universit\w*|[ée]ducati\w*|lesson|le[çc]on)\b/, "class"],
  [/\b(business|entreprise|company|corporate|finance\w*|banque|bank|pitch|investisseur\w*|investor\w*|r[ée]union|meeting|rapport|report|marketing|vente\w*|sales|b2b|strat[ée]gie|strategy|consulting)\b/, "corporate"],
  [/\b(nature|[ée]colog\w*|environnement\w*|environment\w*|eco\w*|durable|sustainab\w*|climat\w*|climate|biodiversit\w*|animaux|animals|plantes?|plants?|jardin\w*|garden\w*|bio|organique|organic|agricultur\w*|for[êe]t|forest|oc[ée]an|mer|sea)\b/, "nature"],
  [/\b(enfant\w*|kids?|children|fun|ludique|playful|dr[ôo]le|amusant|joyeux|joyful|f[êe]te|party|anniversaire|birthday|jeu|jeux|game|games|gaming|cartoon|mignon|cute)\b/, "playful"],
  [/\b([ée]l[ée]gan\w*|luxe|luxury|luxueux|chic|raffin[ée]\w*|premium|mariage|wedding|mode|fashion|joaill\w*|jewel\w*|haute couture|gala|prestige)\b/, "elegant"],
  [/\b(cr[ée]atif\w*|creative|art|artist\w*|design\w*|musique|music|photo\w*|portfolio|cin[ée]ma|film|th[ée][âa]tre|culture|culturel\w*|festival|po[ée]sie|poetry)\b/, "creative"],
  [/\b(sport\w*|[ée]nergi\w*|energy|lancement|launch|[ée]v[ée]nement|event|impact|fort|strong|audacieux|bold|puissant|powerful|dynamique|dynamic|motivation|fitness|course|racing)\b/, "bold"],
  [/\b(minimal\w*|simple|[ée]pur[ée]\w*|clean|sobre|basique|basic|neutre|neutral|l[ée]ger|plain)\b/, "minimal"],
  [/\b(formel\w*|formal|s[ée]rieux|serious|juridique|legal|law|droit|avocat\w*|institution\w*|gouvernement\w*|government|officiel\w*|official|administrati\w*|solennel\w*)\b/, "formal"],
  [/\b(acad[ée]mi\w*|academic|recherche|research|th[èe]se|thesis|conf[ée]rence|conference|science\w*|scientifique\w*|scientific|litt[ée]ratur\w*|literature|philosoph\w*|biblioth[èe]que|journal)\b/, "academic"]
];
/** The hue a subject suggests when the person named no colour. */
const HUES_W = HUES.map(([r, v]) => [wb(r), v] as [RegExp, number]), MOODS_W = MOOD_WORDS.map(([r, v]) => [wb(r), v] as [RegExp, Mood]), STYLES_W = STYLE_WORDS.map(([r, v]) => [wb(r), v] as [RegExp, string]);
const SUBJECT_HUE: Record<string, number> = { tech: 200, retro: 30, class: 215, corporate: 215, nature: 140, playful: 35, elegant: 42, creative: 280, bold: 45, minimal: 215, formal: 225, academic: 350 };

export interface Cues { hue?: number; mood?: Mood; style?: string; score: number }
/** What the words of a request say about the look wanted: a colour, a mood, a kind of subject. */
export function cuesOf(query: string): Cues {
  // what the person does not want ("green instead of orange", "vert au lieu de orange") says nothing about the look
  const q = query.toLowerCase().replace(/\b(?:instead of|rather than|and not|but not|not|except|au lieu d[eu]?|plut[ôo]t que|et pas|mais pas|sauf)\b[\s\S]*$/u, " ");
  const c: Cues = { score: 0 };
  for (const [re, hue] of HUES_W) if (re.test(q)) { c.hue = hue; c.score++; break; }
  for (const [re, mood] of MOODS_W) if (re.test(q)) { c.mood = mood; c.score++; break; }
  let best = { id: "", n: 0 };
  for (const [re, id] of STYLES_W) { const n = (q.match(new RegExp(re.source, "gu")) ?? []).length; if (n > best.n) best = { id, n }; }
  if (best.n) { c.style = best.id; c.score += best.n; }
  return c;
}

/** The theme the words ask for, or null when they say nothing about a look. */
export function findTheme(query: string): Theme | null {
  const c = cuesOf(query);
  if (!c.score) return null;
  const st = STYLES.find((x) => x.id === c.style);
  const mood = c.mood ?? st?.mood ?? "light";
  const hue = c.hue ?? (c.style ? SUBJECT_HUE[c.style] : undefined) ?? 215;
  // "vieux" with no colour is brown and warm; "tech" is cyan and dark; a colour word alone keeps the default style
  return generateTheme(hue, mood, st?.id ?? "corporate");
}

/** A theme from its id ("gen:200-dark-tech"). */
export function themeFromId(id: string): Theme | null {
  const m = /^gen:(\d{1,3})-(light|dark|pastel|vivid|earthy|mono)-([a-z]+)$/.exec(id.trim().toLowerCase());
  return m ? generateTheme(Number(m[1]), m[2] as Mood, m[3]) : null;
}

/** How many looks can be made: every hue step, mood and style. */
export const THEME_COUNT = 12 * MOODS.length * STYLES.length;
