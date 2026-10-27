/**
 * Libraries that travel with a skill: public ones (downloaded once, when the skill is installed) or custom ones (code written in the skill
 * file). The model asks for one with a placeholder (<script src="lib:name"></script>); the app puts the real code inside the page, so the
 * file works alone: removing the skill later breaks nothing, the page only becomes longer to edit.
 */
export interface SkillLibrary {
  /** Lower case letters, digits and dashes: what follows "lib:" in the page. */
  name: string;
  kind: "js" | "css";
  /** The code itself. Empty while a public library has not been downloaded yet. */
  source: string;
  /** Where a public library comes from (https). Downloaded when the skill is installed, never at run time. */
  url?: string;
  license?: string;
  /** One or two lines for the model: what the library does and how to call it. */
  use?: string;
}

export const MAX_LIBS = 8;
export const MAX_LIB_CHARS = 600_000;
export const MAX_SKILL_LIB_CHARS = 2_000_000;

export const libSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function libraryProblems(libs: SkillLibrary[] | undefined): string[] {
  const out: string[] = [];
  const list = libs ?? [];
  if (list.length > MAX_LIBS) out.push(`it has more than ${MAX_LIBS} libraries`);
  const seen = new Set<string>();
  for (const l of list) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(l.name)) out.push(`library "${l.name}" needs a name of lower case letters, digits and dashes`);
    else if (seen.has(l.name)) out.push(`library "${l.name}" appears twice`);
    seen.add(l.name);
    if (!l.source.trim() && !l.url) out.push(`library "${l.name}" has no code and no address`);
    if (l.url && !/^https:\/\//i.test(l.url)) out.push(`library "${l.name}" must come from an https address`);
    if (l.source.length > MAX_LIB_CHARS) out.push(`library "${l.name}" is too big (over ${MAX_LIB_CHARS / 1000} KB)`);
  }
  if (list.reduce((n, l) => n + l.source.length, 0) > MAX_SKILL_LIB_CHARS) out.push("its libraries are too big together");
  return out;
}

/** The libraries that can be used now (their code is there). */
export const usable = (libs: SkillLibrary[] | undefined): SkillLibrary[] => (libs ?? []).filter((l) => l.source.trim());

/** What the model is told about the libraries of a skill. The code itself is never sent to the model. */
export function libraryPrompt(libs: SkillLibrary[] | undefined): string {
  const list = usable(libs);
  if (!list.length) return "";
  return [
    "Libraries installed for this skill (no network is needed):",
    ...list.map((l) => `- ${l.name} (${l.kind === "css" ? "stylesheet" : "script"})${l.use ? `: ${l.use.replace(/\s+/g, " ").trim()}` : ""}`),
    "Load one in the page with <script src=\"lib:NAME\"></script> (a stylesheet: <link rel=\"stylesheet\" href=\"lib:NAME\">). Never link a CDN or another address: the app puts the code inside the file."
  ].join("\n");
}

let registry = new Map<string, SkillLibrary>();
/** The libraries of every installed skill; the first skill that has a name keeps it. */
export function registerLibraries(skills: { libraries?: SkillLibrary[] }[]): void {
  const m = new Map<string, SkillLibrary>();
  for (const s of skills) for (const l of usable(s.libraries)) if (!m.has(l.name)) m.set(l.name, l);
  registry = m;
}

const SCRIPT_REF = /<script\b[^>]*\bsrc=["']lib:([a-z0-9-]+)["'][^>]*>\s*<\/script>/gi;
const LINK_REF = /<link\b[^>]*\bhref=["']lib:([a-z0-9-]+)["'][^>]*>/gi;
const block = (l: SkillLibrary) => l.kind === "css"
  ? `<!-- lib:${l.name} -->\n<style>${l.source.replace(/<\/style/gi, "<\\/style")}</style>\n<!-- /lib:${l.name} -->`
  : `<!-- lib:${l.name} -->\n<script>${l.source.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--")}</script>\n<!-- /lib:${l.name} -->`;

/** Replaces each placeholder by the code of the library, once per page. A name nobody has is left as it is. */
export function inlineLibraries(text: string, libs: Map<string, SkillLibrary> = registry): string {
  if (!text.includes("lib:") || !libs.size) return text;
  const done = new Set<string>();
  const put = (whole: string, name: string) => {
    const l = libs.get(name);
    if (!l) return whole;
    if (done.has(name)) return "";
    done.add(name);
    return block(l);
  };
  return text.replace(SCRIPT_REF, put).replace(LINK_REF, put);
}

/** The reverse, for the model: a library already in a page is shown as its short placeholder (only for libraries still installed), so the page stays small to read. */
export function collapseLibraries(text: string, libs: Map<string, SkillLibrary> = registry): string {
  if (!text.includes("<!-- lib:") || !libs.size) return text;
  return text.replace(/<!-- lib:([a-z0-9-]+) -->[\s\S]*?<!-- \/lib:\1 -->/g, (whole, name: string) => {
    const l = libs.get(name);
    return !l ? whole : l.kind === "css" ? `<link rel="stylesheet" href="lib:${name}">` : `<script src="lib:${name}"></script>`;
  });
}

export const installedLibraries = (): Map<string, SkillLibrary> => registry;

/** Text form of a library: "## Library: name", a few "key: value" lines, then the code in a fence. */
export function libraryToMarkdown(l: SkillLibrary): string {
  const head = [`## Library: ${l.name}`, `kind: ${l.kind}`, ...(l.url ? [`url: ${l.url}`] : []), ...(l.license ? [`license: ${l.license}`] : []), ...(l.use ? [`use: ${l.use.replace(/\n/g, " ")}`] : [])];
  if (!l.source.trim()) return head.join("\n");
  const fence = "`".repeat(Math.max(3, ...(l.source.match(/`+/g) ?? []).map((x) => x.length + 1)));
  return `${head.join("\n")}\n\n${fence}${l.kind}\n${l.source.replace(/\n$/, "")}\n${fence}`;
}

/** Reads what follows "## Library:" back. */
export function libraryFromMarkdown(chunk: string): SkillLibrary {
  const lines = chunk.replace(/^\s*Library:\s*/, "").split("\n");
  const name = libSlug(lines.shift() ?? "");
  const meta: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    if (/^`{3,}/.test(lines[i])) break;
    const k = lines[i].match(/^([A-Za-z_]+):\s*(.*)$/);
    if (k) meta[k[1].toLowerCase()] = k[2].trim();
  }
  let source = "";
  const open = lines[i]?.match(/^(`{3,})/);
  if (open) {
    const end = lines.findIndex((x, k) => k > i && x.trim() === open[1]);
    source = lines.slice(i + 1, end < 0 ? undefined : end).join("\n");
  }
  const kind = meta.kind === "css" || /^\s*`{3,}css/i.test(lines[i] ?? "") ? "css" : "js";
  return { name, kind, source, ...(meta.url ? { url: meta.url } : {}), ...(meta.license ? { license: meta.license } : {}), ...(meta.use ? { use: meta.use } : {}) };
}
