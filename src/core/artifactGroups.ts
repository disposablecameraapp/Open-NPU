import type { Artifact } from "../shared/types";

/** The files of one site or app written in the same chat: shown as one entry that opens onto its files. */
export interface ArtifactGroup {
  id: string;
  title: string;
  /** The page the group is named after (index.html when there is one). */
  main: Artifact;
  files: Artifact[];
  updated: number;
}

export type ArtifactEntry = { t: "single"; artifact: Artifact } | ({ t: "group" } & ArtifactGroup);

const WEB_LANGUAGES = new Set(["css", "javascript", "js", "typescript", "ts", "json"]);
const isWebPart = (a: Artifact) => a.kind === "html" || (a.kind === "code" && WEB_LANGUAGES.has(a.language.toLowerCase()));

/**
 * Artifacts of one chat that belong together (a page with its stylesheet and script, or several pages of a site) become one
 * group; everything else stays on its own. A chat's files are grouped only when at least one is a page and there are two or more.
 */
export function groupArtifacts(list: Artifact[]): ArtifactEntry[] {
  const byChat = new Map<string, Artifact[]>();
  for (const a of list) {
    if (a.source.type !== "chat" || !a.source.conversationId || !isWebPart(a)) continue;
    const k = a.source.conversationId;
    byChat.set(k, [...(byChat.get(k) ?? []), a]);
  }
  const grouped = new Map<string, ArtifactGroup>();
  for (const [chat, files] of byChat) {
    if (files.length < 2 || !files.some((f) => f.kind === "html")) continue;
    const pages = files.filter((f) => f.kind === "html");
    const main = pages.find((f) => /^index\.html?$/i.test(f.title.trim().split("/").pop() ?? "")) ?? pages[0];
    const sorted = [...files].sort((a, b) => Number(b === main) - Number(a === main) || Number(b.kind === "html") - Number(a.kind === "html") || a.title.localeCompare(b.title));
    grouped.set(chat, { id: `group:${chat}`, title: main.title, main, files: sorted, updated: Math.max(...files.map((f) => f.updated)) });
  }
  const out: ArtifactEntry[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    const chat = a.source.conversationId ?? "";
    const g = a.source.type === "chat" && isWebPart(a) ? grouped.get(chat) : undefined;
    if (!g) { out.push({ t: "single", artifact: a }); continue; }
    if (seen.has(chat)) continue;
    seen.add(chat);
    out.push({ t: "group", ...g });
  }
  return out;
}
