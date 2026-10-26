/**
 * Diagrams of structure (flows, sequences, organisation charts, mind maps, timelines, Gantt plans, states, classes, tables of a database...)
 * that a model writes as a few lines of Mermaid instead of a page of HTML. The app draws them; this file holds what does not need a window:
 * finding them in a reply, mending the slips a small model makes, and the instructions the model is given.
 */

/** The fenced blocks of a reply that are diagrams, where they are in it. */
export function diagramBlocks(text: string): { start: number; end: number; raw: string }[] {
  return [...text.matchAll(/```(?:mermaid|diagram)[ \t]*\n([\s\S]*?)```/gi)].map((m) => ({ start: (m.index ?? 0) + m[0].indexOf("\n") + 1, end: (m.index ?? 0) + m[0].length - 3, raw: m[1] }));
}

export const DIAGRAM_KINDS = ["flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram", "stateDiagram-v2", "erDiagram", "gantt", "pie", "mindmap", "timeline", "journey", "quadrantChart", "gitGraph", "xychart-beta", "sankey-beta", "requirementDiagram", "C4Context", "block-beta", "packet-beta", "architecture-beta", "kanban"] as const;

/** The kind of diagram a text starts with ("flowchart", "sequenceDiagram"...), or null when it starts with something else. */
export function diagramKind(src: string): string | null {
  const first = src.replace(/%%\{[\s\S]*?\}%%/g, "").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("%%")) ?? "";
  const word = /^[A-Za-z][\w-]*/.exec(first)?.[0] ?? "";
  return DIAGRAM_KINDS.find((k) => k.toLowerCase() === word.toLowerCase()) ?? null;
}

const FLOW_START = /^\s*(?:flowchart|graph)\b/i;

/**
 * The usual slips of a small model in Mermaid, mended without asking it again: a code fence inside the block, curly quotes, an `init`
 * block (the app chooses the colours), a flowchart label with brackets or punctuation that is not in quotes, arrows written as symbols,
 * a flowchart whose first line is missing. The text that comes out is what the app draws.
 */
export function mendDiagram(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").trim().replace(/^```\w*\s*\n?|\n?```\s*$/g, "").trim();
  t = t.replace(/^\s*mermaid\s*\n/i, "");
  t = t.replace(/%%\{[\s\S]*?\}%%\s*/g, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const kind = diagramKind(t);
  if (!kind) {
    // "A --> B" with no first line is a flowchart
    if (/^\s*\w[\w ]*(?:\[|\(|\{)?[^\n]*?(?:-->|---|==>|-\.->)/m.test(t)) t = `flowchart TD\n${t}`;
    return t;
  }
  if (FLOW_START.test(t) || /^\s*(?:flowchart|graph)/i.test(t)) {
    t = t.split("\n").map((line, i) => {
      if (i === 0 || /^\s*(?:subgraph|end|classDef|class|style|linkStyle|click|direction)\b/.test(line)) return line;
      let l = line.replace(/\s*(?:→|⟶|➔|➜)\s*/g, " --> ");
      // A[Texte (détail)] -> A["Texte (détail)"]; shapes such as A[(db)], A[[sub]], A[/x/] keep their form
      l = l.replace(/(\b[\w-]+)\[(?![(\["\\/])([^\]\n"]*[(),:;&%#@|<>'][^\]\n"]*)\]/g, (_m, id: string, label: string) => `${id}["${label.replace(/"/g, "'")}"]`);
      l = l.replace(/(\b[\w-]+)\{(?![{"])([^}\n"]*[(),:;&%#@|<>'\[\]][^}\n"]*)\}/g, (_m, id: string, label: string) => `${id}{"${label.replace(/"/g, "'")}"}`);
      l = l.replace(/(\b[\w-]+)\((?![(\["\/])([^)\n"]*[,:;&%#@|<>'\[\]][^)\n"]*)\)/g, (_m, id: string, label: string) => `${id}("${label.replace(/"/g, "'")}")`);
      return l;
    }).join("\n");
  }
  return t.replace(/\n{3,}/g, "\n\n");
}

export const DIAGRAM_INSTRUCTIONS = [
  "To draw a diagram of structure or steps (a flow, a process, messages between parts, an architecture, an organisation chart, a mind map, a timeline, a Gantt plan, states, classes, the tables of a database, a user journey, a quadrant, a Git history), write a fenced block with the language mermaid; the app draws it. Never write HTML or SVG for it.",
  "Kinds: flowchart TD or LR (steps, decisions, architecture), sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, mindmap, timeline, journey, quadrantChart, gitGraph, xychart-beta.",
  'Rules: in a flowchart put every label in double quotes: A["Step 1 (start)"]; one statement per line; node ids are plain letters and digits; no colours, no style lines, no init block, no HTML; at most 25 nodes.',
  'Example: ```mermaid\nflowchart TD\n  A["Request"] --> B{"Known?"}\n  B -->|yes| C["Answer"]\n  B -->|no| D["Search"] --> C\n```',
  "A chart of numbers (a curve, bars, a pie) is a chart block, not mermaid."
].join("\n");
