import type { ArtifactKind } from "../shared/types";

export interface ArtifactSegment {
  t: "artifact";
  /** Position among the artifacts of the message; stable while streaming. */
  index: number;
  title: string;
  kind: ArtifactKind;
  language: string;
  content: string;
  /** Still being written (no closing tag yet). */
  open: boolean;
}
export type Segment = { t: "text"; v: string } | ArtifactSegment;

export const ARTIFACT_INSTRUCTIONS = [
  "You can create artifacts: self-contained files the user opens in a side panel.",
  "When asked to make something substantial (a web page, small app or game, diagram, document, report, or a script) put the whole thing inside one artifact:",
  '<artifact type="html" title="Short title">…full content…</artifact>',
  "type is one of: html (a complete single-file page, inline CSS and JavaScript, no external resources), svg, markdown (documents, reports, plans), code (add language=\"python\" or similar).",
  "Write one short sentence before the artifact and do not put the content in a code fence. Answer short questions normally, without an artifact.",
  "To change an artifact you already wrote (fix an error, add something), do NOT write it again. Send only the parts that change, with lines copied exactly from the current file:",
  '<edit file="Short title">',
  "<<<<<<< SEARCH",
  "the old lines",
  "=======",
  "the new lines",
  ">>>>>>> REPLACE",
  "</edit>",
  "Use one block per place, keep the old lines short but unique, and only write the whole file again if most of it changes."
].join("\n");

const OPEN = "<artifact";
const CLOSE = "</artifact>";

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? "";
  return out;
}

function kindOf(a: Record<string, string>): { kind: ArtifactKind; language: string } {
  const type = (a.type ?? "").toLowerCase().replace(/^application\/vnd\.\w+\./, "").replace(/^text\//, "");
  if (type === "html" || type === "svg") return { kind: type, language: type };
  if (type === "markdown" || type === "md") return { kind: "markdown", language: "markdown" };
  return { kind: "code", language: (a.language || (type !== "code" ? type : "") || "text").toLowerCase() };
}

/** Models often wrap the body in a code fence despite being told not to. */
export function stripFence(body: string): string {
  const t = body.replace(/^\s*\n/, "");
  const m = t.match(/^```[\w+-]*\n([\s\S]*?)(?:\n```\s*)?$/);
  return (m ? m[1] : t).replace(/\s+$/, "") + (body.endsWith("\n") && !m ? "\n" : "");
}

/** Split a (possibly still streaming) answer into prose and artifacts. */
export function parseSegments(text: string): Segment[] {
  const segs: Segment[] = [];
  let pos = 0;
  let n = 0;
  const pushText = (v: string) => { if (v.trim()) segs.push({ t: "text", v }); };
  for (;;) {
    const i = text.indexOf(OPEN, pos);
    if (i < 0) {
      let rest = text.slice(pos);
      // hold back a partial "<artif" at the end so it does not flash as text
      for (let k = Math.min(OPEN.length - 1, rest.length); k > 0; k--) {
        if (OPEN.startsWith(rest.slice(-k))) { rest = rest.slice(0, rest.length - k); break; }
      }
      pushText(rest);
      break;
    }
    if (!/[\s>]/.test(text[i + OPEN.length] ?? " ")) { // "<artifactory": not ours
      pushText(text.slice(pos, i + OPEN.length));
      pos = i + OPEN.length;
      continue;
    }
    pushText(text.slice(pos, i));
    const gt = text.indexOf(">", i);
    if (gt < 0) { segs.push({ t: "artifact", index: n++, title: "", kind: "code", language: "text", content: "", open: true }); break; }
    const a = attrs(text.slice(i, gt));
    const { kind, language } = kindOf(a);
    const end = text.indexOf(CLOSE, gt + 1);
    const body = text.slice(gt + 1, end < 0 ? undefined : end);
    segs.push({ t: "artifact", index: n++, title: a.title || "Untitled", kind, language, content: stripFence(body), open: end < 0 });
    if (end < 0) break;
    pos = end + CLOSE.length;
  }
  return segs;
}

/** Where each artifact body sits in the text, in the same order and with the same rules as parseSegments. */
export function artifactSpans(text: string): { bodyStart: number; bodyEnd: number; closed: boolean }[] {
  const out: { bodyStart: number; bodyEnd: number; closed: boolean }[] = [];
  let pos = 0;
  for (;;) {
    const i = text.indexOf(OPEN, pos);
    if (i < 0) break;
    if (!/[\s>]/.test(text[i + OPEN.length] ?? " ")) { pos = i + OPEN.length; continue; }
    const gt = text.indexOf(">", i);
    if (gt < 0) break;
    const end = text.indexOf(CLOSE, gt + 1);
    out.push({ bodyStart: gt + 1, bodyEnd: end < 0 ? text.length : end, closed: end >= 0 });
    if (end < 0) break;
    pos = end + CLOSE.length;
  }
  return out;
}

/** The text with artifact number `index` (as numbered by parseSegments) holding `content` instead. */
export function replaceArtifact(text: string, index: number, content: string): string {
  const span = artifactSpans(text)[index];
  if (!span) return text;
  return `${text.slice(0, span.bodyStart)}\n${content.replace(/\s+$/, "")}\n${text.slice(span.bodyEnd)}`;
}

export function artifactsIn(text: string): ArtifactSegment[] {
  return parseSegments(text).filter((s): s is ArtifactSegment => s.t === "artifact" && !s.open);
}

/** Prose only, for notifications and previews. */
export function stripArtifacts(text: string): string {
  return parseSegments(text).map((s) => (s.t === "text" ? s.v : `[${s.title || "artifact"}]`)).join("").trim();
}

export function fileExtension(kind: ArtifactKind, language: string): string {
  if (kind === "html") return "html";
  if (kind === "svg") return "svg";
  if (kind === "markdown") return "md";
  const map: Record<string, string> = { python: "py", javascript: "js", typescript: "ts", bash: "sh", shell: "sh", powershell: "ps1", rust: "rs", csharp: "cs", "c++": "cpp", json: "json", css: "css", sql: "sql", yaml: "yml", text: "txt" };
  return map[language] ?? (/^[a-z0-9]{1,5}$/.test(language) ? language : "txt");
}

/**
 * Full document for the preview iframe. The CSP blocks every network request, so a generated page
 * can run its scripts but cannot phone home.
 */
export function previewDocument(kind: ArtifactKind, content: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:">`;
  if (kind === "svg") return `<!doctype html><html><head>${csp}<style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100%}</style></head><body>${content}</body></html>`;
  if (/<head[\s>]/i.test(content)) return content.replace(/<head([^>]*)>/i, `<head$1>${csp}`);
  if (/<html[\s>]/i.test(content)) return content.replace(/<html([^>]*)>/i, `<html$1><head>${csp}</head>`);
  return `<!doctype html><html><head>${csp}<meta charset="utf-8"></head><body>${content}</body></html>`;
}
