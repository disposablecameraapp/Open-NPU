/**
 * What of an answer is to be looked at rather than listened to: its finished charts and its Wikimedia pictures. The voice chat shows them
 * on its screen while the voice says what they show; a chart still being written is left out until its block is closed.
 */
export function visualsOf(answer: string): string {
  const out: string[] = [];
  for (const m of answer.matchAll(/```chart[^\n]*\n[\s\S]*?\n```|^[ \t]*!\[[^\]\n]*\]\(wikimedia:[^)\n]+\)[ \t]*$/gm)) out.push(m[0].trim());
  return out.join("\n\n");
}

/** An answer's chart or picture reduced to a note: an old one in a voice conversation need not be carried whole (it costs context, and a model that sees many copies writes more). */
export function compactVisuals(text: string): string {
  return text
    .replace(/```chart[^\n]*\n([\s\S]*?)\n```/g, (_m, body: string) => {
      let what = "chart";
      try { const j = JSON.parse(body); what = `${j.type ?? ""} chart${j.title ? ` "${String(j.title).slice(0, 60)}"` : ""}`.trim(); } catch { /* a note without a title */ }
      return `[A ${what} was shown on screen.]`;
    })
    .replace(/^[ \t]*!\[([^\]\n]*)\]\(wikimedia:[^)\n]+\)[ \t]*$/gm, (_m, cap: string) => `[A picture was shown on screen${cap ? `: ${cap.slice(0, 80)}` : ""}.]`);
}

export interface VisualNeeds { chart: boolean; picture: boolean }

const CHART_WORDS = /\b(graph|graphs|graphe|graphes|graphique|graphiques|chart|charts|plot|courbe|courbes|diagramme|histogramme|camembert|pie chart|bar chart|trace|tracer|dessine|draw|visuali[sz]e|visuali[sz]ation|evolution|évolution|compare|compar)\w*/i;
const PICTURE_WORDS = /\b(image|images|photo|photos|picture|pictures|show me|montre|montre-moi|fais(?:-moi)? voir|illustration|painting|tableau de|à quoi (?:ça )?ressemble|what (?:does|do) .{1,40} look like|looks? like|ressemble)\b/i;

/**
 * Whether a voice request asks for a chart or a picture, so that the instructions for them (a few hundred tokens each, and a small model that
 * reads them is tempted to use them) are given only then. A chart is also allowed on the turn after one, to change it.
 */
export function visualNeeds(request: string, previousAnswer = ""): VisualNeeds {
  return {
    chart: CHART_WORDS.test(request) || /```chart|\[A [^\]]*chart[^\]]* was shown/.test(previousAnswer),
    picture: PICTURE_WORDS.test(request)
  };
}
