// Slides a person points at in the preview (the "+" next to a slide's number) travel with their message, in the order they were chosen, so
// that "on the first change this, on the second add that" is understood. The model reads them as a note in front of the message.
export interface SlidePick { file: string; n: number; title: string }

const ORDINALS: [RegExp, number][] = [
  [/\b(?:first|1st|premi(?:er|[èe]re)|1(?:er|[èe]re))\b/i, 1],
  [/\b(?:second|2nd|deuxi[èe]me|2(?:e|[èe]me))\b/i, 2],
  [/\b(?:third|3rd|troisi[èe]me|3(?:e|[èe]me))\b/i, 3],
  [/\b(?:fourth|4th|quatri[èe]me|4(?:e|[èe]me))\b/i, 4],
  [/\b(?:fifth|5th|cinqui[èe]me|5(?:e|[èe]me))\b/i, 5],
  [/\b(?:sixth|6th|sixi[èe]me|6(?:e|[èe]me))\b/i, 6]
];

/** The note put in front of a message that points at slides. */
export function picksNote(picks: SlidePick[] | undefined): string {
  if (!picks?.length) return "";
  return `[The user pointed at these slides of "${picks[0].file.replace(/"/g, "'")}" in the preview, in this order; "the first", "the second", "this one" mean them:\n${picks.map((p, i) => `${i + 1}. slide ${p.n} "${p.title.replace(/"/g, "'").replace(/\n/g, " ")}"`).join("\n")}]\n\n`;
}

/** The slides a message points at, and the message without the note. */
export function takePicks(text: string): { picks: SlidePick[]; rest: string } {
  const m = /^\s*\[The user pointed at these slides of "([^"]*)"[^\n]*\n((?:\d+\. slide \d+ "[^"\n]*"\n?)+)\]\n\n/.exec(text);
  if (!m) return { picks: [], rest: text };
  const picks = [...m[2].matchAll(/^\d+\. slide (\d+) "([^"\n]*)"/gm)].map((x) => ({ file: m[1], n: Number(x[1]), title: x[2] }));
  return { picks, rest: text.slice(m[0].length) };
}

/** The ranks ("the second" = 2) a request names among the slides pointed at. */
export function ranksIn(request: string): number[] {
  return ORDINALS.filter(([re]) => re.test(request)).map(([, k]) => k);
}

/** The slide numbers a request means among those pointed at: the ones it names by rank, else all of them. */
export function pickedSlides(request: string, picks: SlidePick[]): number[] {
  if (!picks.length) return [];
  const ranks = ranksIn(request).filter((k) => k <= picks.length);
  return (ranks.length ? ranks.map((k) => picks[k - 1]) : picks).map((p) => p.n);
}
