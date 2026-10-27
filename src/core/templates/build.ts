import type { ChatEvent, ChatMessage, ChatStats } from "../../shared/types";
import type { BuildRun, BuildStage, BuildStep } from "../../shared/types";
import type { Session } from "../build";
import { withAnswer } from "../chat";
import { firstJson, repairJson } from "../look";
import { Template, TemplateKind, langOf } from "./kit";
import { TEMPLATES, kindOfRequest, matchTemplates, templateById } from "./index";

/**
 * A Word or Excel file made from a template: the app chooses it (the words of the request, then the model with the list when the
 * words are not enough, then the small router when the person's need may be too unusual for a standard one), the model fills in
 * the fields of a closed JSON schema in the language of the request, the app checks the data, asks again once, and renders the
 * text form that becomes the real file. Anything it cannot do falls back to the usual way of writing files.
 */
const MAX = 9000;
const CREATE = /\b(make|create|build|generate|write|prepare|draft|need|want|give me|fais|fait|faire|cr[ée]e[rz]?|g[ée]n[èe]re[rz]?|pr[ée]pare[rz]?|r[ée]dige[rz]?|veux|voudrais|besoin|donne(?:-moi)?|haz|crea|escribe|erstelle|schreibe|faça|crie|escreva|fai|scrivi)\b/i;

/** The kind of file to make from a template, when the request is for a new Word or Excel file. */
export function templateKind(request: string, chatHasOffice: boolean, chatHasHtml = false): TemplateKind | null {
  if (!CREATE.test(request)) return null;
  const kind = kindOfRequest(request);
  // a change to a file that exists is not a new file
  if (!kind || ((kind === "docx" || kind === "xlsx") && chatHasOffice) || ((kind === "site" || kind === "tool") && chatHasHtml)) return null;
  return kind;
}
const WHAT: Record<TemplateKind, string> = { docx: "a Word document", xlsx: "a spreadsheet", site: "a one-page website", tool: "a small calculator page" };

export const FILL_INSTRUCTIONS = [
  "You fill in a template for a Word document or an Excel file, as one JSON object that follows the schema. You write no markup.",
  "Write in the language of the request and set `language` to it. Put real, useful content in every field the request calls for, and leave a field out when the request gives nothing for it: never invent facts, names, figures or dates that the request does not give.",
  "For a website, the first section is the hero; write real, specific copy for the subject of the request; choose a theme (words are fine) and a procedural background; never invent customer names, quotes, prices, phone numbers or addresses that the request does not give: leave them out or write them as [placeholders]. For a calculator page, give the inputs with ids and the results as formulas of those ids.",
  "For a spreadsheet, give the rows the request names (and a few sensible labels, never invented amounts), the settings it states, and in `headers` the header of each column written in the language of the request. Formulas are already in the template.",
  "Reply with the JSON object only."
].join("\n");

export interface TemplateOptions {
  id: string;
  messages: ChatMessage[];
  stream: Session;
  signal?: AbortSignal;
  modelOf?: () => string | undefined;
  /** One yes/no question put to the small router; null when it cannot answer. */
  askRouter?: (ask: string) => Promise<boolean | null>;
  chatHasOffice?: boolean;
  chatHasHtml?: boolean;
  /** Minimum milliseconds between two drawings of the growing document. */
  drawEveryMs?: number;
}
export type TemplateResult = { handled: true; text: string; stats: ChatStats } | { handled: false };

const textOf = (c: ChatMessage["content"]) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (typeof p === "string" ? p : (p as { text?: string }).text ?? "")).join("") : "");
async function collect(stream: Session, sid: string, messages: ChatMessage[], add: (s: ChatStats) => void, signal?: AbortSignal, schema?: object): Promise<string> {
  let out = "";
  for await (const ev of stream(sid, messages, true, "plan", schema)) { out = withAnswer(out, ev); if (ev.type === "done") add(ev.stats); }
  if (signal?.aborted) throw new Error("aborted");
  return out;
}

export async function* makeFromTemplate(o: TemplateOptions): AsyncGenerator<ChatEvent, TemplateResult> {
  const lastUser = o.messages.map((m) => m.role).lastIndexOf("user");
  if (lastUser < 0) return { handled: false };
  const request = textOf(o.messages[lastUser].content).trim();
  const kind = templateKind(request, !!o.chatHasOffice, !!o.chatHasHtml);
  if (!kind) return { handled: false };
  const total: ChatStats = { ttftSec: null, tokPerSec: null, tokens: 0, totalSec: 0 };
  const add = (s: ChatStats) => { total.tokens += s.tokens; total.totalSec = Math.round((total.totalSec + s.totalSec) * 100) / 100; if (total.ttftSec === null) total.ttftSec = s.ttftSec; if (total.tokPerSec === null) total.tokPerSec = s.tokPerSec; };

  const stages: BuildStage[] = [];
  const steps: BuildStep[] = [{ file: kind === "xlsx" ? "Spreadsheet" : kind === "docx" ? "Document" : kind === "site" ? "Website" : "Tool", action: "new", job: "from a template", status: "running", stages }];
  let phase = "";
  const run = (status: BuildRun["status"] = "running"): ChatEvent => ({ id: o.id, type: "build", build: { status, steps: steps.map((s) => ({ ...s, stages: s.stages?.map((g) => ({ ...g })) })), phase } });
  const begin = (id: string, label: string, note: string, agent: string, model?: string): BuildStage => { const g: BuildStage = { id, label, status: "running", note, agent, model, at: Date.now() }; stages.push(g); return g; };
  const end = (g: BuildStage, status: BuildStage["status"], note?: string) => { g.status = status; g.sec = Math.round(((Date.now() - (g.at ?? Date.now())) / 1000) * 10) / 10; if (note !== undefined) g.note = note; };
  const lang = langOf(request);

  // 1 ---- the template
  const choosing = begin("template", "Template", "finding the template that fits", "Planner", o.modelOf?.());
  phase = "Finding the template that fits…";
  yield run();
  let tpl: Template | undefined = matchTemplates(request, kind)[0];
  let why = tpl ? "the words of the request" : "";
  if (!tpl) {
    const list = TEMPLATES.filter((t) => t.kind === kind);
    const reply = await collect(o.stream, `${o.id}:template`, [{ role: "system", content: `You choose the template that fits a request for ${WHAT[kind]}. Reply with one JSON object {"template": "<id>"}; use "none" when no template fits.\n${list.map((t) => `- ${t.id}: ${t.summary}`).join("\n")}` }, { role: "user", content: request.slice(0, 1500) }], add, o.signal,
      { type: "object", additionalProperties: false, required: ["template"], properties: { template: { type: "string", enum: [...list.map((t) => t.id), "none"] } } }).catch((e) => { if (o.signal?.aborted) throw e; return ""; });
    const id = (firstJson(reply) as { template?: string } | null)?.template;
    tpl = id && id !== "none" ? templateById(id, kind) : undefined;
    why = "chosen by the model from the list";
  } else if (o.askRouter) {
    // a standard template is only used when the need is a standard one
    const unusual = await o.askRouter(`Does this request need something so unusual or specific that a standard ${kind === "xlsx" ? "spreadsheet template (budget, tracker, planning...)" : kind === "docx" ? "document template (letter, report, CV, minutes...)" : kind === "site" ? "website template (hero, features, pricing, testimonials, menu, contact...)" : "calculator template (inputs and formulas)"} could not hold it, such as a very particular layout, custom animations, an unusual structure or a mix of several documents?`).catch(() => null);
    if (unusual === true) { end(choosing, "skipped", "the router found a need that no standard template holds; writing it freely"); yield run(); return { handled: false }; }
  }
  if (!tpl) { end(choosing, "skipped", "no template fits; writing it freely"); yield run(); return { handled: false }; }
  end(choosing, "done", `${tpl.name} (${why})`);
  yield run();

  // 2 ---- the data
  const filling = begin("fill", "Fill in", "the model fills in the fields", "Writer", o.modelOf?.());
  phase = `Filling in the ${tpl.name.toLowerCase()}…`;
  yield run();
  let data: unknown = null, problems: string[] = [];
  const safeTitle = (t: string) => t.replace(/"/g, "'").slice(0, 80);
  const artifactOf = (title: string, source: string) => `<artifact type="${tpl!.kind === "site" || tpl!.kind === "tool" ? "html" : tpl!.kind}" title="${tpl!.kind === "site" || tpl!.kind === "tool" ? "index.html" : safeTitle(title)}">\n${source.trim()}\n</artifact>`;
  let shown = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ask = `The request:\n${request.slice(0, MAX)}\n\nTemplate: ${tpl.name} (${tpl.summary}). Language: ${lang}.\n${attempt && problems.length ? `Your last JSON had these problems, fix them:\n- ${problems.join("\n- ")}\n` : ""}Write the JSON now.`;
    let reply = "", lastDraw = 0, last = "";
    try {
      for await (const ev of o.stream(`${o.id}:fill:${attempt}`, [{ role: "system", content: FILL_INSTRUCTIONS }, { role: "user", content: ask }], true, "plan", tpl.schema)) {
        if (ev.type === "done") add(ev.stats);
        if (ev.type !== "answer" && ev.type !== "retract") continue;
        reply = withAnswer(reply, ev);
        // the document grows while the model writes: what it has filled in so far is drawn (never the empty template), a few times a second
        const now = Date.now();
        if (now - lastDraw < (o.drawEveryMs ?? 180)) continue;
        lastDraw = now;
        const part = repairJson(reply);
        const key = part ? JSON.stringify(part) : "";
        if (!part || key === last) continue;
        last = key;
        try {
          const live = tpl.render({ language: lang, ...(part as object) }, { live: true });
          if (live.source.trim() && live.source !== shown) { shown = live.source; yield { id: o.id, type: "replace", text: artifactOf(live.title, live.source) }; }
        } catch { /* a half-written value that cannot be drawn yet: the next draw will */ }
      }
    } catch (e) { if (o.signal?.aborted) throw e; reply = reply || ""; }
    if (o.signal?.aborted) throw new Error("aborted");
    const got = firstJson(reply);
    problems = got ? tpl.problems(got) : ["the answer was not a JSON object"];
    if (got && !problems.length) { data = got; break; }
  }
  if (!data) { end(filling, "skipped", `the data did not hold up (${problems[0] ?? "no answer"}); writing it freely`); yield run(); if (shown) yield { id: o.id, type: "replace", text: "" }; return { handled: false }; }
  const d = data as Record<string, unknown>;
  if (!d.language) d.language = lang;
  end(filling, "done", "fields filled");
  yield run();

  // 3 ---- the file
  const building = begin("build", "Build", "turning it into the file", "Builder");
  let source = "", title = tpl.name;
  try { ({ source, title } = tpl.render(d)); } catch (e) { end(building, "error", (e as Error).message.slice(0, 120)); yield run(); return { handled: false }; }
  end(building, "done", `${source.split("\n").length} lines`);
  steps[0].status = "done";
  const artifact = artifactOf(title, source);
  phase = "Writing the summary…";
  yield run();
  let explanation = "";
  try {
    explanation = (await collect(o.stream, `${o.id}:templateexplain`, [{ role: "user", content: `[You made ${WHAT[tpl.kind]} yourself from the "${tpl.name}" template; it is open next to your message and the person can save it, edit its text with the Edit button, or ask you to change it: add a section or a column, change the look or the colours, rename things.]\nTitle: ${title}\n\nReply to the person in 2 to 4 short sentences, in the language of their request: ${request.slice(-300)}\nSay what you made and what they can ask for to customise it. First person singular. Do not write file contents or <artifact> tags.` }], add, o.signal)).trim();
  } catch (e) { if (o.signal?.aborted) throw e; }
  if (!explanation) explanation = `Done: “${title}”.`;
  phase = "";
  yield run("done");
  const text = `${artifact}\n\n${explanation}`;
  yield shown ? { id: o.id, type: "replace", text } : { id: o.id, type: "answer", text };
  return { handled: true, text, stats: total };
}
