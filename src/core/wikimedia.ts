/**
 * Pictures from Wikimedia Commons for an answer. The model asks with <wikiimage>keywords</wikiimage>, the app looks them up and
 * gives it a short list (name, what it shows, author, licence); the model then places the ones it picks in its answer as
 * ![caption](wikimedia:File name.jpg). The window loads each through the app (it has no network of its own), with its author and
 * licence written under it, as Commons asks. Nothing here talks to the network: main does, with the shapes below.
 */

/** Pictures in one answer, at most: past it a picture is shown as a link. The model is told fewer. */
export const MAX_IMAGES_SHOWN = 3;
export const MAX_IMAGE_SEARCHES_PER_ROUND = 2;

export const IMAGE_INSTRUCTIONS = [
  "You can add pictures from Wikimedia Commons, but only when a picture really helps: the user asks to see something, or a real thing (a place, an animal, a plant, a person, an object, an artwork, a map) is explained and seeing it beats words. Never for code, maths, abstract ideas, lists, advice or chat. Most answers have none.",
  "To look for one, write <wikiimage>2 to 5 keywords</wikiimage> (the English name of the thing works best) and stop; at most 2 searches. The candidates come back in the next message.",
  "Then put the best one (two at most, three never) where it belongs in your answer, as ![short caption](wikimedia:File name.jpg) on a line of its own, copying the file name exactly as listed. Never invent a file name, and do not describe a picture you have not been given."
].join("\n");

export interface Candidate { file: string; description: string; author: string; license: string; pageUrl: string; thumb: string; mime: string }

export const stripHtml = (s: unknown): string => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

const OK_MIME = /^image\/(jpeg|png|webp|gif|svg\+xml)$/;

/** The candidates in a Commons API answer (`prop=imageinfo` with a thumbnail width), best first, with what cannot be shown left out. */
export function parseCommons(json: any): Candidate[] {
  const pages = json?.query?.pages;
  if (!pages || typeof pages !== "object") return [];
  const list: (Candidate & { index: number })[] = [];
  for (const p of Object.values<any>(pages)) {
    const info = p?.imageinfo?.[0];
    const title = typeof p?.title === "string" ? p.title.replace(/^File:/i, "") : "";
    if (!info || !title || !OK_MIME.test(info.mime ?? "")) continue;
    const meta = info.extmetadata ?? {};
    list.push({
      index: typeof p.index === "number" ? p.index : 99,
      file: title,
      description: stripHtml(meta.ImageDescription?.value ?? meta.ObjectName?.value ?? title.replace(/\.\w+$/, "").replace(/_/g, " ")).slice(0, 160),
      author: stripHtml(meta.Artist?.value ?? "").slice(0, 60) || "unknown author",
      license: stripHtml(meta.LicenseShortName?.value ?? "").slice(0, 30) || "see the file page",
      pageUrl: String(info.descriptionurl ?? ""),
      thumb: String(info.thumburl ?? info.url ?? ""),
      mime: info.mime
    });
  }
  return list.sort((a, b) => a.index - b.index).map(({ index, ...c }) => c);
}

/** What the model reads back: a numbered list it can choose from, and how to write the one it picks. */
export function formatCandidates(query: string, list: Candidate[]): string {
  const q = query.replace(/"/g, "'");
  if (!list.length) return `<image_results query="${q}">\n[no picture found on Commons for this]\nAnswer without a picture, and do not invent one.\n</image_results>`;
  return `<image_results query="${q}">\n${list.slice(0, 6).map((c, i) => `${i + 1}. ${c.file} — ${c.description} (${c.author}, ${c.license})`).join("\n")}\nTo show one, write ![caption](wikimedia:FILE NAME) with the name exactly as above.\n</image_results>`;
}

export const displayCandidates = (list: Candidate[]) => (list.length ? list.slice(0, 6).map((c, i) => `${i + 1}. ${c.file} (${c.license})`).join("\n") : "No picture found.");

/** The Commons API address that searches pictures (not documents, not audio) for some keywords, with a 640 px thumbnail of each. */
export function searchUrl(query: string, limit = 6): string {
  const p = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: String(limit),
    gsrsearch: `${query.replace(/[^\p{L}\p{N} '-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80)} filetype:bitmap|drawing`,
    prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "640", iiextmetadatafilter: "ImageDescription|ObjectName|Artist|LicenseShortName", origin: "*"
  });
  return `https://commons.wikimedia.org/w/api.php?${p.toString()}`;
}

/** The address of one named file's data (a thumbnail and its credit). */
export function fileUrl(file: string): string {
  const p = new URLSearchParams({
    action: "query", format: "json", titles: `File:${file.replace(/^File:/i, "").replace(/_/g, " ")}`,
    prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "640", iiextmetadatafilter: "ImageDescription|ObjectName|Artist|LicenseShortName", origin: "*"
  });
  return `https://commons.wikimedia.org/w/api.php?${p.toString()}`;
}

/** Whether an address belongs to Wikimedia: the app downloads nothing else for a picture. */
export const isWikimediaHost = (url: string) => { try { const h = new URL(url).hostname; return h === "upload.wikimedia.org" || h.endsWith(".wikimedia.org") || h === "commons.wikimedia.org"; } catch { return false; } };

/** The file name inside a wikimedia: link (spaces may arrive as %20 or _). */
export const fileOfRef = (href: string): string | null => {
  const m = /^wikimedia:(.+)$/i.exec(href.trim());
  if (!m) return null;
  let f = m[1];
  try { f = decodeURIComponent(f); } catch { /* as written */ }
  f = f.replace(/^File:/i, "").replace(/_/g, " ").trim();
  return f && f.length < 200 && !/[<>|\\]/.test(f) ? f : null;
};

export interface WikiPicture { file: string; dataUrl: string; description: string; author: string; license: string; pageUrl: string }
