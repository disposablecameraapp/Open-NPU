/**
 * A web page written as several files (index.html, style.css, script.js). The preview and the code check run in a frame
 * with no network, so the files the page links are put into it: `<link rel="stylesheet" href="style.css">` becomes a
 * `<style>` block and `<script src="script.js">` an inline script, from the files written in the same chat.
 */

export interface FileLike { title: string; kind: string; language: string; content: string }

/** Where an inlined file sits in the combined page, to report errors against the file that holds the code. */
export interface BundlePart { file: string; from: number; lines: number }

export interface Bundled {
  html: string;
  /** Local files the page links that no one wrote. */
  missing: string[];
  parts: BundlePart[];
  /** A line of the combined page → the file and line it comes from; null for the page's own lines. */
  locate: (line: number | null) => { file: string; line: number; src: string } | null;
}

const LINK = /<link\b[^>]*>/gi;
const SCRIPT = /<script\b[^>]*\bsrc\s*=\s*(?:"[^"]*"|'[^']*')[^>]*>\s*<\/script\s*>/gi;

/** The name a link points to ("./css/Style.css?v=2" → "style.css"), or null for addresses on the network, data: and the like. */
export function localName(href: string): string | null {
  const h = href.trim();
  if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith("//") || h.startsWith("#")) return null;
  return h.split(/[?#]/)[0].split("/").pop()?.toLowerCase() || null;
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? "") : null;
};

/** The stylesheets and scripts a page links, by file name, in page order. */
export function linkedFiles(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(LINK)) {
    if (!/\bstylesheet\b/i.test(attr(m[0], "rel") ?? "")) continue;
    const n = localName(attr(m[0], "href") ?? "");
    if (n && !out.includes(n)) out.push(n);
  }
  for (const m of html.matchAll(SCRIPT)) {
    const n = localName(attr(m[0], "src") ?? "");
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

const baseName = (title: string) => title.trim().split("/").pop()!.toLowerCase();

export function bundleHtml(html: string, files: FileLike[]): Bundled {
  const byName = new Map(files.map((f) => [baseName(f.title), f]));
  const missing: string[] = [];
  const used: { file: FileLike; body: string; tag: "style" | "script" }[] = [];
  let tail = ""; // deferred scripts, moved to the end of the body

  const take = (name: string | null, tag: "style" | "script"): FileLike | null => {
    if (!name) return null;
    const f = byName.get(name);
    if (!f) { if (!missing.includes(name)) missing.push(name); return null; }
    void tag;
    return f;
  };
  const inlineBody = (f: FileLike, tag: "style" | "script") => f.content.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`).replace(/\s+$/, "");

  let out = html.replace(LINK, (m) => {
    if (!/\bstylesheet\b/i.test(attr(m, "rel") ?? "")) return m;
    const f = take(localName(attr(m, "href") ?? ""), "style");
    if (!f) return m;
    const body = inlineBody(f, "style");
    used.push({ file: f, body, tag: "style" });
    return `<style>\n${body}\n</style>`;
  });
  out = out.replace(SCRIPT, (m) => {
    const f = take(localName(attr(m, "src") ?? ""), "script");
    if (!f) return m;
    const body = inlineBody(f, "script");
    used.push({ file: f, body, tag: "script" });
    const type = attr(m, "type");
    const open = type ? `<script type="${type}">` : "<script>";
    const block = `${open}\n${body}\n</script>`;
    // `defer` and modules wait for the page to be read; an inline script does not, so it moves to the end of the body
    if (/\bdefer\b/i.test(m) || /^module$/i.test(type ?? "")) { tail += `${block}\n`; return ""; }
    return block;
  });
  if (tail) out = /<\/body\s*>/i.test(out) ? out.replace(/<\/body\s*>/i, (b) => `${tail}${b}`) : `${out}\n${tail}`;

  const parts: BundlePart[] = [];
  for (const u of used) {
    const at = out.indexOf(`>\n${u.body}\n</${u.tag}>`);
    if (at < 0) continue;
    parts.push({ file: u.file.title, from: out.slice(0, at + 2).split("\n").length, lines: u.body.split("\n").length });
  }
  const locate = (line: number | null) => {
    if (!line) return null;
    const p = parts.find((x) => line >= x.from && line < x.from + x.lines);
    if (!p) return null;
    const local = line - p.from + 1;
    const src = byName.get(baseName(p.file))?.content.split("\n")[local - 1]?.trim() ?? "";
    return { file: p.file, line: local, src };
  };
  return { html: out, missing, parts, locate };
}

/** The page of a project that links this file (a stylesheet or script), if there is one. */
export function pageLinking(file: FileLike, files: FileLike[]): FileLike | undefined {
  const name = baseName(file.title);
  return files.find((f) => f.kind === "html" && linkedFiles(f.content).includes(name));
}

/** The files with the newest version of each title winning: later entries replace earlier ones. */
export function mergeFiles(...lists: FileLike[][]): FileLike[] {
  const by = new Map<string, FileLike>();
  for (const list of lists) for (const f of list) by.set(f.title.trim().toLowerCase(), f);
  return [...by.values()];
}
