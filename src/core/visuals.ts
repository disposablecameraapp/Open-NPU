/**
 * What of an answer is to be looked at rather than listened to: its finished charts and its Wikimedia pictures. The voice chat shows them
 * on its screen while the voice says what they show, drawn live while their block is still being written.
 */
export function visualsOf(answer: string): string {
  const out: string[] = [];
  for (const m of answer.matchAll(/```(?:chart|mermaid|diagram)[^\n]*\n[\s\S]*?\n```|^[ \t]*!\[[^\]\n]*\]\(wikimedia:[^)\n]+\)[ \t]*$/gm)) out.push(m[0].trim());
  // a chart or diagram still being written is shown as it grows (the window draws what it can of it)
  const open = answer.match(/```(?:chart|mermaid|diagram)[^\n]*\n(?:(?!```)[\s\S])*$/);
  if (open) out.push(open[0]);
  return out.join("\n\n");
}

/** An answer's chart or picture reduced to a note: an old one in a voice conversation need not be carried whole (it costs context, and a model that sees many copies writes more). */
export function compactVisuals(text: string): string {
  return text
    .replace(/```(?:mermaid|diagram)[^\n]*\n([\s\S]*?)\n```/g, (_m, body: string) => `[A ${String(body).trim().split(/\s/)[0] || "diagram"} diagram was shown on screen.]`)
    .replace(/```chart[^\n]*\n([\s\S]*?)\n```/g, (_m, body: string) => {
      let what = "chart";
      try { const j = JSON.parse(body); what = `${j.type ?? ""} chart${j.title ? ` "${String(j.title).slice(0, 60)}"` : ""}`.trim(); } catch { /* a note without a title */ }
      return `[A ${what} was shown on screen.]`;
    })
    .replace(/^[ \t]*!\[([^\]\n]*)\]\(wikimedia:[^)\n]+\)[ \t]*$/gm, (_m, cap: string) => `[A picture was shown on screen${cap ? `: ${cap.slice(0, 80)}` : ""}.]`);
}

export interface VisualNeeds { chart: boolean; diagram?: boolean; picture: boolean; /** The request is to take the shown chart or picture away. */ closing?: boolean }

const CLOSE_WORDS = /(?<![\p{L}\p{N}])(ferme|fermer|enl[eè]ve|enlever|retire|retirer|vire|virer|cache|cacher|masque|masquer|supprime|supprimer|efface|effacer|close|hide|remove|dismiss|get rid of|take (?:it|that|this) (?:away|off))(?![\p{L}\p{N}])/iu;
const CLOSE_TARGETS = /(?<![\p{L}\p{N}])(graph\w*|courbe|diagramme|sch[ée]ma|organigramme|image|photo|visuel|cadre|figure|chart|plot|picture|visual|frame|[cç]a|cela|it|that|this|ce|cette)(?![\p{L}\p{N}])/iu;

/** A spoken request to take the shown chart or picture away ("vire le graphique", "close that", "hide the picture"). Only asked while one is shown. */
export const wantsCloseVisual = (request: string): boolean => CLOSE_WORDS.test(request) && CLOSE_TARGETS.test(request);

const CHART_WORDS = /\b(graph|graphs|graphe|graphes|graphique|graphiques|chart|charts|plot|courbe|courbes|diagramme|histogramme|camembert|pie chart|bar chart|trace|tracer|dessine|draw|visuali[sz]e|visuali[sz]ation|evolution|évolution|compare|compar)\w*/i;
const DIAGRAM_WORDS = /\b(diagram|diagramme|diagrammes|sch[ée]ma|sch[ée]mas|organigramme|flowchart|flow ?chart|workflow|process|processus|mind ?map|carte mentale|timeline|frise|gantt|sequence|s[ée]quence|architecture|flux|[ée]tapes|steps)\w*/i;
const PICTURE_WORDS = /\b(image|images|photo|photos|picture|pictures|show me|montre|montre-moi|fais(?:-moi)? voir|illustration|painting|tableau de|à quoi (?:ça )?ressemble|what (?:does|do) .{1,40} look like|looks? like|ressemble)\b/i;

/**
 * Whether a voice request asks for a chart or a picture, so that the instructions for them (a few hundred tokens each, and a small model that
 * reads them is tempted to use them) are given only then. A chart is also allowed on the turn after one, to change it.
 */
export function visualNeeds(request: string, previousAnswer = ""): VisualNeeds {
  return {
    chart: CHART_WORDS.test(request) || /```chart|\[A [^\]]*chart[^\]]* was shown/.test(previousAnswer),
    diagram: DIAGRAM_WORDS.test(request) || /```(?:mermaid|diagram)|\[A [^\]]*diagram[^\]]* was shown/.test(previousAnswer),
    picture: PICTURE_WORDS.test(request)
  };
}
