// Figures the app draws in its window (a Mermaid diagram, a chart block) that a Word or PowerPoint file needs as pictures.
// A text names one by a fenced block; the picture of it is made by the window (only the window can draw them) and is found again by its key.

export type FigureLang = "mermaid" | "chart";
export interface Figure { key: string; lang: FigureLang; raw: string }

export const FIGURE_FENCE = /```(mermaid|diagram|chart)[ \t]*\r?\n([\s\S]*?)```/gi;

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
const langOf = (word: string): FigureLang => (word.toLowerCase() === "chart" ? "chart" : "mermaid");

/** The key a picture is stored under: the same text always gives the same key. */
export const figureKey = (lang: FigureLang, raw: string) => `fig:${lang}:${hash(raw.trim())}`;

/** Every figure of a text, once each, in order. */
export function figuresIn(text: string): Figure[] {
  const out = new Map<string, Figure>();
  for (const m of text.matchAll(FIGURE_FENCE)) {
    const lang = langOf(m[1]);
    const key = figureKey(lang, m[2]);
    if (!out.has(key)) out.set(key, { key, lang, raw: m[2].trim() });
  }
  return [...out.values()];
}
