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
  // a classic script in the head runs before the body exists, so its first getElementById finds nothing: it waits for the body
  const headEnd = out.search(/<\/head\s*>/i);
  out = out.replace(SCRIPT, (m, ...rest) => {
    const at = rest[rest.length - 2] as number;
    const inHead = headEnd >= 0 && at < headEnd;
    const f = take(localName(attr(m, "src") ?? ""), "script");
    if (!f) return m;
    const body = inlineBody(f, "script");
    used.push({ file: f, body, tag: "script" });
    const type = attr(m, "type");
    const open = type ? `<script type="${type}">` : "<script>";
    const block = `${open}\n${body}\n</script>`;
    // `defer` and modules wait for the page to be read; an inline script does not, so it moves to the end of the body
    if (/\bdefer\b/i.test(m) || /^module$/i.test(type ?? "") || inHead) { tail += `${block}\n`; return ""; }
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

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The page has to load the stylesheet and the script that were written for it. A small model often forgets the tag, or links
 * a name of its own ("styles.css", "main.js") while the files are called "style.css" and "script.js": the page then shows
 * unstyled or does nothing. This links what is missing and renames the links that point nowhere.
 */
export function wireHtml(html: string, planned: { css: string[]; js: string[] }): string {
  let out = html;
  const have = (names: string[], want: string) => names.some((n) => n.toLowerCase() === want.toLowerCase());
  // stylesheets
  if (planned.css.length) {
    const linked: string[] = [];
    out = out.replace(LINK, (m) => {
      if (!/\bstylesheet\b/i.test(attr(m, "rel") ?? "")) return m;
      const raw = attr(m, "href") ?? "";
      const n = localName(raw);
      if (!n) return m;
      if (have(planned.css, n)) { linked.push(n); return m; }
      const target = planned.css.find((c) => !have(linked, c));
      if (!target) return m;
      linked.push(target);
      return m.replace(raw, raw.replace(/[^/\\?#]+(?=[?#]|$)/, target));
    });
    const missing = planned.css.filter((c) => !have(linked, c));
    if (missing.length && !/<style[\s>]/i.test(out)) {
      const tags = missing.map((c) => `<link rel="stylesheet" href="${c}">`).join("\n");
      out = /<\/head\s*>/i.test(out) ? out.replace(/<\/head\s*>/i, (h) => `${tags}\n${h}`) : /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (h) => `${h}\n${tags}`) : `${tags}\n${out}`;
    }
  }
  // scripts
  if (planned.js.length) {
    const linked: string[] = [];
    out = out.replace(SCRIPT, (m) => {
      const raw = attr(m, "src") ?? "";
      const n = localName(raw);
      if (!n) return m;
      if (have(planned.js, n)) { linked.push(n); return m; }
      const target = planned.js.find((c) => !have(linked, c));
      if (!target) return m;
      linked.push(target);
      return m.replace(raw, raw.replace(/[^/\\?#]+(?=[?#]|$)/, target));
    });
    const missing = planned.js.filter((c) => !have(linked, c));
    // a page with a real script of its own inline is left alone
    const inline = [...out.matchAll(/<script\b(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script\s*>/gi)].some((x) => x[1].trim().length > 200);
    if (missing.length && !inline) {
      const tags = missing.map((c) => `<script src="${c}"></script>`).join("\n");
      out = /<\/body\s*>/i.test(out) ? out.replace(/<\/body\s*>/i, (b) => `${tags}\n${b}`) : `${out}\n${tags}\n`;
    }
  }
  return out;
}

/**
 * Elements the script looks for that the page does not have: the usual way a script of one model fails on a page of another
 * (it asks for #game-board, the page has #gameCanvas). Elements the script makes itself are not counted.
 */
export function missingElements(js: string, pages: string[]): string[] {
  const page = pages.join("\n");
  if (!page.trim()) return [];
  const ids = new Set([...page.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
  const classes = new Set([...page.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)].flatMap((m) => m[1].split(/\s+/)));
  const made = (name: string) => new RegExp(`\\.id\\s*=\\s*["'\`]${esc(name)}|["']id["']\\s*,\\s*["'\`]${esc(name)}|\\bid=\\\\?["']${esc(name)}|\\bclassName\\s*=\\s*["'\`][^"'\`]*\\b${esc(name)}\\b|classList\\.add\\([^)]*["']${esc(name)}["']|class=\\\\?["'][^"']*\\b${esc(name)}\\b`).test(js);
  const wantIds = [...js.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]).concat([...js.matchAll(/querySelector(?:All)?\(\s*["']#([\w-]+)["']\s*\)/g)].map((m) => m[1]));
  const wantClasses = [...js.matchAll(/querySelector(?:All)?\(\s*["']\.([\w-]+)["']\s*\)/g)].map((m) => m[1]).concat([...js.matchAll(/getElementsByClassName\(\s*["']([\w-]+)["']\s*\)/g)].map((m) => m[1]));
  const out: string[] = [];
  for (const id of new Set(wantIds)) if (!ids.has(id) && !made(id)) out.push(`The script looks for the element #${id}, but the page has no element with that id (the page has: ${[...ids].slice(0, 12).join(", ") || "no ids"}).`);
  for (const c of new Set(wantClasses)) if (!classes.has(c) && !made(c)) out.push(`The script looks for the class .${c}, but no element of the page has it (the page has: ${[...classes].slice(0, 12).join(", ") || "no classes"}).`);
  return out.slice(0, 4);
}
