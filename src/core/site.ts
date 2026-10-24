import { ArtifactKind } from "../shared/types";
import { fileExtension } from "./artifacts";
import { FileLike, pageLinking } from "./bundle";

/** A project written by the chat, put on disk as the real files of a site, so a browser can open it with its links working. */
export interface SiteFile { name: string; content: string }

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "");

/** The file name of an artifact: its title when that already is one ("style.css"), else a name made from the title. */
export function siteFileName(f: FileLike): string {
  const base = f.title.trim().split(/[\\/]/).pop() ?? "";
  if (/\.[A-Za-z0-9]{1,5}$/.test(base) && safe(base)) return safe(base);
  return `${safe(base).toLowerCase() || "page"}.${fileExtension(f.kind as ArtifactKind, f.language)}`;
}

/** Every file of the project with a distinct, safe name (never a path out of the folder). */
export function siteFiles(files: FileLike[]): SiteFile[] {
  const used = new Set<string>();
  return files.filter((f) => f.content.trim()).map((f) => {
    let name = siteFileName(f);
    for (let n = 2; used.has(name.toLowerCase()); n++) name = name.replace(/(\.[^.]*)?$/, `-${n}$1`);
    used.add(name.toLowerCase());
    return { name, content: f.content.endsWith("\n") ? f.content : `${f.content}\n` };
  });
}

/** The page a browser should open for `file`: itself when it is a page, else the page that links it, else the home page. */
export function siteEntry(file: FileLike, files: FileLike[]): string {
  const page = file.kind === "html" ? file : pageLinking(file, files) ?? files.find((f) => f.kind === "html" && /^index\.html?$/i.test(f.title.trim())) ?? files.find((f) => f.kind === "html");
  return page ? siteFiles([page])[0]?.name ?? "index.html" : "index.html";
}
