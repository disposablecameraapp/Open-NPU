import { CHAPTER_MARK, PAGE_MARK } from "./pdf";
import type { ChatMessage } from "../shared/types";

export interface PdfSection { title: string; from: number; to: number; text: string }

const MAX_SECTION_CHARS = 9000;
const FALLBACK_CHARS = 6000;

export const isPdfText = (name: string, text: string) => /\.pdf$/i.test(name) && /^\[page \d+\]/.test(text);

interface Page { n: number; chapters: string[]; lines: string[] }

function pagesOf(text: string): Page[] {
  const pages: Page[] = [];
  for (const line of text.split("\n")) {
    const p = PAGE_MARK.exec(line);
    if (p) { pages.push({ n: Number(p[1]), chapters: [], lines: [] }); continue; }
    const cur = pages[pages.length - 1];
    if (!cur) continue;
    const c = CHAPTER_MARK.exec(line);
    if (c && !cur.lines.length) cur.chapters.push(c[1]);
    else cur.lines.push(line);
  }
  return pages;
}

/** The PDF as chapters (from its outline or headings), long ones cut at page boundaries; without any chapter, as blocks of pages. */
export function splitSections(text: string): PdfSection[] {
  const pages = pagesOf(text);
  const out: PdfSection[] = [];
  let cur: { title: string; pages: Page[] } | null = null;
  const close = () => {
    if (!cur) return;
    let part: Page[] = [];
    let size = 0;
    let k = 1;
    const emit = () => {
      if (!part.length) return;
      const title = k === 1 ? cur!.title : `${cur!.title} (part ${k})`;
      out.push({ title, from: part[0].n, to: part[part.length - 1].n, text: part.map((p) => `[page ${p.n}]\n${p.lines.join("\n")}`).join("\n\n") });
      part = []; size = 0; k++;
    };
    for (const p of cur.pages) {
      const len = p.lines.join("\n").length;
      if (part.length && size + len > MAX_SECTION_CHARS) emit();
      part.push(p); size += len;
    }
    emit();
    cur = null;
  };
  const hasChapters = pages.some((p) => p.chapters.length);
  for (const p of pages) {
    if (p.chapters.length) {
      close();
      // several titles on one page: each is a section start, the last one owns the page text
      p.chapters.slice(0, -1).forEach((t) => out.push({ title: t, from: p.n, to: p.n, text: "" }));
      cur = { title: p.chapters[p.chapters.length - 1], pages: [p] };
    } else if (hasChapters) {
      if (!cur) cur = { title: "Beginning", pages: [] };
      cur.pages.push(p);
    } else {
      if (!cur) cur = { title: "", pages: [] };
      const size = cur.pages.reduce((s, q) => s + q.lines.join("\n").length, 0);
      if (cur.pages.length && size >= FALLBACK_CHARS) { fallbackClose(cur, out); cur = { title: "", pages: [] }; }
      cur.pages.push(p);
    }
  }
  if (cur && !hasChapters) fallbackClose(cur, out); else close();
  return out.filter((s) => s.text || s.title);
}

function fallbackClose(c: { pages: Page[] }, out: PdfSection[]) {
  if (!c.pages.length) return;
  const from = c.pages[0].n, to = c.pages[c.pages.length - 1].n;
  out.push({ title: from === to ? `Page ${from}` : `Pages ${from}-${to}`, from, to, text: c.pages.map((p) => `[page ${p.n}]\n${p.lines.join("\n")}`).join("\n\n") });
}

const STOP = new Set(("the a an and or of to in on for with is are was were be what which who how why when where this that these those it its from by as at about can you your me my le la les un une des du de et ou en dans sur pour avec est sont était être que qui quoi quel quelle quels quelles comment pourquoi quand où ce cet cette ces il elle ils elles au aux par mais ne pas plus se sa son ses leur leurs moi mon ma mes dis donne explique peux tu vous nous document pdf fichier chapitre chapter").split(" "));
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const words = (s: string) => fold(s).match(/[\p{L}\p{N}]{3,}/gu)?.filter((w) => !STOP.has(w)) ?? [];

/** Chapters ranked for a question: words of the question found in the chapter (rarer words count more), a title match counts triple. */
export function rankSections(sections: PdfSection[], query: string): number[] {
  const terms = [...new Set(words(query))];
  if (!terms.length) return sections.map(() => 0);
  const bags = sections.map((s) => { const m = new Map<string, number>(); for (const w of words(`${s.title} ${s.text}`)) m.set(w, (m.get(w) ?? 0) + 1); return m; });
  const titles = sections.map((s) => new Set(words(s.title)));
  const stem = (w: string) => (w.length > 5 ? w.slice(0, -1) : w);
  return sections.map((_, i) => terms.reduce((sum, t) => {
    const df = bags.filter((b) => b.has(t)).length;
    const tf = bags[i].get(t) ?? 0;
    const idf = Math.log(1 + sections.length / (1 + df));
    const inTitle = titles[i].has(t) || [...titles[i]].some((w) => stem(w) === stem(t));
    return sum + (tf ? (1 + Math.log(tf)) * idf : 0) + (inTitle ? 3 * idf : 0);
  }, 0));
}

const range = (s: PdfSection) => (s.from === s.to ? `p. ${s.from}` : `p. ${s.from}-${s.to}`);
const pageCountOf = (text: string) => pagesOf(text).at(-1)?.n ?? 0;

/** A PDF too big for the context: the whole text travels as far as the app's main process, which keeps only what the question needs. */
export const wrapPdfDoc = (name: string, text: string, budget: number) => `<pdfdoc name="${name.replace(/"/g, "'")}" budget="${budget}">\n${text}\n</pdfdoc>`;
const DOC_RE = /<pdfdoc name="([^"]*)" budget="(\d+)">\n([\s\S]*?)\n<\/pdfdoc>/g;

export const hasPdfDocs = (messages: ChatMessage[]) => messages.some((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("")).includes("<pdfdoc "));

/** Outline plus the chosen sections only (none: the outline alone, which is all that earlier turns keep). */
export function renderSelected(name: string, text: string, sections: PdfSection[], picked: number[], budgetChars: number): string {
  const keep = new Set<number>();
  let left = budgetChars - sections.slice(0, 120).reduce((n, s) => n + s.title.length + 22, 0) - 400;
  const cut = new Map<number, string>();
  for (const i of picked) {
    const len = sections[i].text.length;
    if (len <= left) { keep.add(i); left -= len; }
    else if (!keep.size && left > 1500) { keep.add(i); cut.set(i, `${sections[i].text.slice(0, left)}\n[…section cut]`); left = 0; }
  }
  const lines = sections.slice(0, 120).map((s, i) => `${i + 1}. ${s.title} (${range(s)})${keep.has(i) ? " [loaded]" : ""}`);
  const note = keep.size
    ? "Only the sections marked [loaded] are included below, chosen for the user's question. If the answer is in another section, say which one the user should ask about."
    : "No section is loaded for this message. Say which section the user should ask about.";
  const body = [...keep].sort((a, b) => a - b).map((i) => `## ${sections[i].title} (${range(sections[i])})\n${cut.get(i) ?? sections[i].text}`).join("\n\n");
  return `<attachment name="${name.replace(/"/g, "'")}">\nOutline of this PDF (${pageCountOf(text)} pages, ${sections.length} sections). ${note}\n${lines.join("\n")}${body ? `\n\n${body}` : ""}\n</attachment>`;
}

/** One PDF for the model by keywords alone: everything if it fits, else the outline plus the best matching chapters. */
export function renderPdf(name: string, text: string, query: string, budgetChars: number): string {
  const sections = splitSections(text);
  if (text.length <= budgetChars || !sections.length) return `<attachment name="${name.replace(/"/g, "'")}">\n${text.slice(0, budgetChars)}${text.length > budgetChars ? "\n[…cut to fit the model's context]" : ""}\n</attachment>`;
  return renderSelected(name, text, sections, rankedPicks(sections, query), budgetChars);
}

/** The few chapters that match the question best (the first one when no word matches): used when the locator cannot answer. */
export function rankedPicks(sections: PdfSection[], query: string, max = 3): number[] {
  const scores = rankSections(sections, query);
  const order = sections.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
  const good = order.filter((i) => scores[i] > 0).slice(0, max);
  return good.length ? good : order.slice(0, 1);
}

/** What the locator model sees: one line per section with the first words, never the text. */
export function locatorMessages(sections: PdfSection[], question: string, before: string): { role: "system" | "user"; content: string }[] {
  const outline = sections.slice(0, 200).map((s, i) => `${i + 1}. ${s.title} (${range(s)}) — ${s.text.replace(/\[page \d+\]\n?/g, "").replace(/\s+/g, " ").trim().slice(0, 90)}`).join("\n");
  return [
    { role: "system", content: "You locate information in a long document. You are given its outline and a question. Reply with only the numbers of the sections that contain the answer, most relevant first, at most 4, separated by commas (example: 3, 7). Reply `all` if the question is about the whole document (summary, overview). Reply `none` if no section can contain the answer. No explanation." },
    { role: "user", content: `Outline:\n${outline}\n\n${before ? `Earlier question: ${before}\n` : ""}Question: ${question}\n\nSection numbers:` }
  ];
}

/** Section indexes (0-based) from the locator's reply; null when it is not an answer, "all" is the sections in order. */
export function parseLocatorReply(reply: string, count: number): number[] | null {
  const t = reply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim().toLowerCase();
  if (/^none\b/.test(t)) return [];
  if (/^(all|tout|toutes)\b/.test(t)) return Array.from({ length: count }, (_, i) => i);
  const nums = (t.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= count).map((n) => n - 1);
  const uniq = [...new Set(nums)].slice(0, 4);
  return uniq.length ? uniq : null;
}

const textOfMsg = (m: ChatMessage) => (typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join(""));
export const questionOf = (m: ChatMessage | undefined) => (m ? textOfMsg(m).replace(DOC_RE, "").replace(/<attachment name="[^"]*">[\s\S]*?<\/attachment>/g, "").replace(/<search_results[\s\S]*$/, "").trim().slice(0, 600) : "");

export interface PdfDoc { name: string; text: string; sections: PdfSection[]; budget: number }

/**
 * Replaces each `<pdfdoc>` by its outline and, in the newest message that carries it, the sections `pick` chose for the question
 * (earlier turns keep the outline only, so the context stays empty of old chapters). `pick` null: the best matching chapters.
 */
export async function resolvePdfDocs(messages: ChatMessage[], pick: (d: PdfDoc, question: string, before: string) => Promise<number[] | null>): Promise<ChatMessage[]> {
  const users = messages.map((m, i) => ({ m, i })).filter((x) => x.m.role === "user");
  const question = questionOf(users.at(-1)?.m);
  const before = questionOf(users.at(-2)?.m);
  const lastAt = new Map<string, number>();
  messages.forEach((m, i) => { for (const x of textOfMsg(m).matchAll(DOC_RE)) lastAt.set(x[1], i); });
  const picks = new Map<string, number[]>();
  const out: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const text = textOfMsg(m);
    if (!text.includes("<pdfdoc ")) { out.push(m); continue; }
    const parts: string[] = [];
    let last = 0;
    for (const x of text.matchAll(DOC_RE)) {
      parts.push(text.slice(last, x.index));
      last = x.index! + x[0].length;
      const doc: PdfDoc = { name: x[1], text: x[3], sections: splitSections(x[3]), budget: Number(x[2]) };
      if (!doc.sections.length) { parts.push(`<attachment name="${doc.name}">\n${doc.text.slice(0, doc.budget)}\n[…cut to fit the model's context]\n</attachment>`); continue; }
      let chosen: number[] = [];
      if (lastAt.get(doc.name) === i) {
        if (!picks.has(doc.name)) picks.set(doc.name, (await pick(doc, question, before)) ?? rankedPicks(doc.sections, `${before} ${question}`));
        chosen = picks.get(doc.name)!;
      }
      parts.push(renderSelected(doc.name, doc.text, doc.sections, chosen, doc.budget));
    }
    parts.push(text.slice(last));
    out.push(typeof m.content === "string" ? { ...m, content: parts.join("") } : { ...m, content: [...m.content.filter((p) => p.type !== "text"), { type: "text", text: parts.join("") }] });
  }
  return out;
}
