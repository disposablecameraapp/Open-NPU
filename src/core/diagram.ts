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
      return wrapLabels(l);
    }).join("\n");
  }
  return t.replace(/\n{3,}/g, "\n\n");
}

/** A long node label cut into lines of about 20 characters: a decision with a whole sentence in it would be a huge diamond. Edge labels (between bars) stay as they are. */
function wrapLabels(line: string): string {
  return line.replace(/(^|[^|])"([^"\n]{24,})"/g, (m, before: string, label: string) => {
    if (/<br\s*\/?>/i.test(label)) return m;
    const out: string[] = [];
    let cur = "";
    for (const w of label.split(/\s+/)) {
      if (cur && cur.length + 1 + w.length > 20) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) out.push(cur);
    return `${before}"${out.join("<br/>")}"`;
  });
}

/**
 * The pieces of a flowchart that are not joined to each other (a second chain written beside the first, or left alone by a line that was cut).
 * Each piece is the list of its node ids; a flowchart that holds together has one. Other kinds of diagram have none to check.
 */
export function flowPieces(text: string): string[][] {
  if (!FLOW_START.test(text)) return [];
  const parent = new Map<string, string>();
  const find = (a: string): string => { let r = a; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(a, r); return r; };
  const add = (a: string) => { if (!parent.has(a)) parent.set(a, a); };
  for (const line of text.split("\n").slice(1)) {
    if (/^\s*(?:subgraph|end|classDef|class|style|linkStyle|click|direction|%%)\b/.test(line)) continue;
    const bare = line.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\|[^|]*\|/g, "").replace(/--\s+[^->=.]+?\s+(?=-->|---)/g, "-- ");
    const ids = bare.split(/<?(?:-{2,}|={2,}|-\.+-)>?[xo]?|;/).map((seg) => seg.split("&").map((s) => /^\s*([A-Za-z_][\w-]*)\s*(?::::\w+)?\s*$/.exec(s)?.[1]).filter((s): s is string => !!s));
    ids.forEach((g) => g.forEach(add));
    for (let i = 1; i < ids.length; i++) for (const a of ids[i - 1]) for (const b of ids[i]) parent.set(find(a), find(b));
  }
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) { const r = find(id); groups.set(r, [...(groups.get(r) ?? []), id]); }
  return [...groups.values()];
}

/** What is wrong with a diagram that draws but would look bad, or null. For now: a flowchart in several pieces that have nothing to do with each other on the page. */
export function diagramFlaw(text: string): string | null {
  const pieces = flowPieces(text);
  if (pieces.length < 2) return null;
  return `the flowchart is in ${pieces.length} separate parts (${pieces.map((p) => p.slice(0, 3).join(", ")).join(" | ")}) that are not linked by any arrow: join them with arrows into one flow, or keep only the main one`;
}

export const DIAGRAM_INSTRUCTIONS = [
  "To draw a diagram of structure or steps (a flow, a process, messages between parts, an architecture, an organisation chart, a mind map, a timeline, a Gantt plan, states, classes, the tables of a database, a user journey, a quadrant, a Git history), write a fenced block with the language mermaid; the app draws it. Never write HTML or SVG for it.",
  "Kinds: flowchart TD or LR (steps, decisions, architecture), sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, mindmap, timeline, journey, quadrantChart, gitGraph, xychart-beta.",
  'Rules: in a flowchart put every label in double quotes: A["Step 1 (start)"]; one statement per line; node ids are plain letters and digits; one connected flow (every node linked by arrows to the others, never two separate chains side by side); keep labels short (a few words); no colours, no style lines, no init block, no HTML; at most 25 nodes.',
  'Example: ```mermaid\nflowchart TD\n  A["Request"] --> B{"Known?"}\n  B -->|yes| C["Answer"]\n  B -->|no| D["Search"] --> C\n```',
  "A chart of numbers (a curve, bars, a pie) is a chart block, not mermaid."
].join("\n");

const STYLE_LINE = /^\s*(?:style|classDef|class|linkStyle|click|accTitle|accDescr)\b.*$/gm;
/** Every flowchart label in double quotes, whatever it holds: a label that has no special character needs none, but one never hurts. */
const quoteAll = (t: string): string => t.split("\n").map((line, i) => {
  if (i === 0 || /^\s*(?:subgraph|end|direction|classDef|class|style|linkStyle|click)\b/.test(line)) return line;
  return line
    .replace(/(\b[\w-]+)\[(?![(\["\\/])([^\]\n"]+)\]/g, (_m, id: string, l: string) => `${id}["${l.replace(/"/g, "'")}"]`)
    .replace(/(\b[\w-]+)\{(?![{"])([^}\n"]+)\}/g, (_m, id: string, l: string) => `${id}{"${l.replace(/"/g, "'")}"}`)
    .replace(/(\b[\w-]+)\((?![(\["\/])([^)\n"]+)\)/g, (_m, id: string, l: string) => `${id}("${l.replace(/"/g, "'")}")`);
}).join("\n");

export type Healed = { text: string; how: "none" | "mended" | "model" | "trimmed" } | { error: string };

/**
 * A diagram that does not draw is mended until it does: the safe changes first (no style lines, every label in quotes), then the model is
 * asked twice with the reason, and as the last resort the line the parser points at is left out (a diagram with a node missing beats none).
 * `check` draws a text and returns the error, or null when it drew. Nothing here needs a window, so it is tested with a pretend drawer.
 */
async function healCore(text: string, check: (t: string) => Promise<string | null>, ask?: (t: string, why: string) => Promise<string | null>): Promise<Healed> {
  let why = await check(text);
  if (why === null) return { text, how: "none" };
  const tried = new Set([text]);
  const attempt = async (t: string | null): Promise<string | null> => {
    if (!t || tried.has(t)) return null;
    tried.add(t);
    const e = await check(t);
    if (e === null) return t;
    why = e;
    return null;
  };
  for (const step of [(t: string) => t.replace(STYLE_LINE, ""), quoteAll, (t: string) => quoteAll(t.replace(STYLE_LINE, ""))]) {
    const ok = await attempt(step(text));
    if (ok) return { text: ok, how: "mended" };
  }
  if (ask) {
    for (let k = 0; k < 2; k++) {
      let reply: string | null = null;
      try { reply = await ask(text, why); } catch { break; }
      if (!reply) break;
      const ok = await attempt(mendDiagram(reply));
      if (ok) return { text: ok, how: "model" };
    }
  }
  let cur = text;
  for (let k = 0; k < 4; k++) {
    const at = Number(/line (\d+)/i.exec(why)?.[1]);
    const lines = cur.split("\n");
    if (!at || at < 2 || at > lines.length) break;
    cur = lines.filter((_l, i) => i !== at - 1).join("\n");
    const ok = await attempt(cur);
    if (ok) return { text: ok, how: "trimmed" };
  }
  return { error: why };
}

/** A diagram that draws is also looked at: one in separate parts is given back to the model once, and its answer is kept only when it draws and holds together better. */
export async function healDiagram(text: string, check: (t: string) => Promise<string | null>, ask?: (t: string, why: string) => Promise<string | null>): Promise<Healed> {
  const done = await healCore(text, check, ask);
  if ("error" in done || !ask) return done;
  const flaw = diagramFlaw(done.text);
  if (!flaw) return done;
  try {
    const reply = await ask(done.text, flaw);
    const better = reply ? mendDiagram(reply) : "";
    if (better && better !== done.text && flowPieces(better).length < flowPieces(done.text).length && await check(better) === null) return { text: better, how: "model" };
  } catch { /* the diagram as it is */ }
  return done;
}

export const diagramFixInstructions = "You correct a Mermaid diagram that could not be drawn or that would look bad. Reply with the corrected Mermaid text only: no explanation, no code fence. Keep the same diagram and the same words. The first line names the kind (flowchart TD, sequenceDiagram...). In a flowchart every label is in double quotes: A[\"Step 1 (start)\"]. No style lines, no HTML.";
