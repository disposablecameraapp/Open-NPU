import type { ChatEvent, ChatMessage, ChatStats } from "../../shared/types";
import type { BuildRun, BuildStage, BuildStep } from "../../shared/types";
import type { Session } from "../build";
import { withAnswer } from "../chat";
import { firstJson, repairJson } from "../look";
import { Template, TemplateKind, langOf } from "./kit";
import { FILES_OF, SITE_PLAN_SCHEMA, pageSchemaOf, cleanPlan, planProblems, sitePage, wantsSeveralPages, type SitePlan } from "./multipage";
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

/** Words that say the person wants something a standard template cannot hold. A subject (a country, a business, a hobby) never does. */
const CUSTOM = /\b(custom|sur[- ]mesure|from scratch|de z[ée]ro|3d|webgl|shader|parallax|particles?|canvas|physics|physique|dashboard|tableau de bord|animations? (?:personnalis|sp[ée]cifi|uniques?)\w*|unique layout|mise en page (?:unique|particuli[èe]re)|interactive (?:map|carte)|carte interactive|game|jeu|login|connexion|database|base de donn[ée]es|backend|api)\b/i;
export const asksForCustom = (request: string): boolean => CUSTOM.test(request);

/** What each kind of template can do, in the words the router is asked about. */
const CAN: Record<TemplateKind, string> = {
  site: "one page made of sections: hero, features, steps, figures, pricing, testimonials, FAQ, team, timeline, gallery, menu, products, events, logos, call to action, text, contact, with themes, icons and scroll animations",
  tool: "one page with inputs and results computed by formulas (BMI, tip, loan payment, unit conversion, estimates)",
  docx: "a document with headings, paragraphs, lists and tables (letter, report, CV, minutes, proposal, invoice, contract...)",
  xlsx: "a spreadsheet with sheets, headed columns, rows and formulas (budget, tracker, planner, gradebook, loan...)"
};

/** The question put to the small router. It is about what the template can do, never about how long or detailed the request is. */
export const unusualQuestion = (kind: TemplateKind): string =>
  `A template can make: ${CAN[kind]}. Does this request need something that is NOT in that list (for example a game, a login or a database, a 3D or physics effect)? The length of the request, its subject and the detail it gives do not matter: only whether the template can do what is asked. Answer no if it can.`;

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
  let phase = "", live = "";
  const run = (status: BuildRun["status"] = "running"): ChatEvent => ({ id: o.id, type: "build", build: { status, steps: steps.map((s) => ({ ...s, stages: s.stages?.map((g) => ({ ...g })) })), phase, live: status === "running" && live ? live : undefined } });
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
    // a standard template is used unless the person asks for something it cannot hold. The small router is only asked when the words of the
    // request point to that (a topic, a business or a subject never does), and it is told what is and is not unusual
    if (asksForCustom(request)) {
      const unusual = await o.askRouter(unusualQuestion(kind)).catch(() => null);
      if (unusual === true) { end(choosing, "skipped", "the router found a need that no standard template holds; writing it freely"); yield { id: o.id, type: "notice", text: "Template skipped: the request asks for something custom, so the page is written freely." }; yield run(); return { handled: false }; }
    }
  }
  if (!tpl) { end(choosing, "skipped", "no template fits; writing it freely"); yield { id: o.id, type: "notice", text: "Template skipped: none of the templates fits this request." }; yield run(); return { handled: false }; }
  end(choosing, "done", `${tpl.name} (${why})`);
  yield run();

  // 1b ---- a site of several pages: a plan of the site, then one small run per page; when it cannot be done a single page is made
  if (kind === "site" && tpl.id === "site" && wantsSeveralPages(request)) {
    const site = tpl;
    const many = async function* (): AsyncGenerator<ChatEvent, TemplateResult | null> {
      steps[0].job = "plan of the site";
      const planning = begin("plan", "Plan of the site", "the pages, the look and what each page is for", "Planner", o.modelOf?.());
      phase = "Planning the pages…";
      yield run();
      let plan: SitePlan | null = null, bad: string[] = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        const ask = `The request:\n${request.slice(0, MAX)}\n\nLanguage: ${lang}.\n${attempt && bad.length ? `Your last plan had these problems, fix them:\n- ${bad.join("\n- ")}\n` : ""}Plan a website of 2 to 6 pages. The first page is "index". Give the look of the whole site in theme words, then each page: its file name, its menu label and what it is for.`;
        const reply = await collect(o.stream, `${o.id}:siteplan:${attempt}`, [{ role: "system", content: "You plan a small website of several pages as one JSON object that follows the schema. Write in the language of the request. Each page has its own job and does not repeat the others. Never invent facts, names or figures. Reply with the JSON object only." }, { role: "user", content: ask }], add, o.signal, SITE_PLAN_SCHEMA).catch((e) => { if (o.signal?.aborted) throw e; return ""; });
        plan = cleanPlan(firstJson(reply));
        bad = planProblems(plan);
        if (!bad.length) break;
      }
      if (!plan || bad.length) { end(planning, "skipped", `the plan did not hold up (${bad[0] ?? "no answer"}); making one page`); yield { id: o.id, type: "notice", text: `Several pages skipped: the plan of the site was refused twice (${bad[0] ?? "no answer"}), so one page is made.` }; yield run(); return null; }
      end(planning, "done", `${plan.pages.length} pages: ${plan.pages.map((p) => `${p.file}.html`).join(", ")}`);
      yield run();

      const files = FILES_OF(plan);
      const list = plan.pages.map((p) => `${p.file}.html (${p.title}): ${p.purpose}`).join("\n");
      const made: string[] = [];
      let first: Record<string, unknown> | undefined;
      const mk = (name: string, source: string) => `<artifact type="html" title="${name}">\n${source.trim()}\n</artifact>`;
      const pageSteps: BuildStep[] = plan.pages.map((p) => ({ file: `${p.file}.html`, action: "new" as const, job: p.title, status: "waiting" as BuildStep["status"], stages: [] }));
      steps.push(...pageSteps);
      for (let i = 0; i < plan.pages.length; i++) {
        const page = plan.pages[i], step = pageSteps[i];
        step.status = "running";
        const g: BuildStage = { id: `fill:${i}`, label: "Fill in", status: "running", note: `the sections of ${page.file}.html`, agent: "Writer", model: o.modelOf?.(), at: Date.now() };
        step.stages!.push(g);
        phase = `Writing ${page.file}.html (${i + 1} of ${plan.pages.length})…`;
        yield run();
        let data: Record<string, unknown> | null = null, probs: string[] = [], lastDraw = 0, gap = o.drawEveryMs ?? 900, last = "", lastThink = 0;
        let best: Record<string, unknown> | null = null;
        for (let attempt = 0; attempt < 2 && !data; attempt++) {
          const ask = `The request:\n${request.slice(0, MAX)}\n\nYou write ONE page of the website "${plan.title}" (${plan.pages.length} pages):\n${list}\n\nThis page: ${page.file}.html, "${page.title}": ${page.purpose}\nLanguage: ${lang}. Write only the sections of THIS page: a hero first, then 2 to 6 sections that fit what the page is for. Keep it short so it fits: at most 6 sections and 6 items per section, a title of a few words and one sentence per item (a long list in the request is summarised, never written out in full). Do not repeat what the other pages say. To send the reader to another page, give its file name (for example "${files[Math.min(1, files.length - 1)]}"). The menu is added by the app: do not write one. Never invent customer names, quotes, prices or contact details.${attempt && probs.length ? `\nYour last JSON had these problems, fix them:\n- ${probs.join("\n- ")}` : ""}`;
          let reply = "", think = "";
          try {
            for await (const ev of o.stream(`${o.id}:page:${i}:${attempt}`, [{ role: "system", content: site.hint ? `${FILL_INSTRUCTIONS}\n${site.hint}` : FILL_INSTRUCTIONS }, { role: "user", content: ask }], true, "plan", site.schema ? pageSchemaOf(site.schema, i) : undefined)) {
              if (ev.type === "done") add(ev.stats);
              if (ev.type === "thinking") { think += ev.text; if (!reply && Date.now() - lastThink > 400) { lastThink = Date.now(); live = think.slice(-900); yield run(); } continue; }
              if (ev.type !== "answer" && ev.type !== "retract") continue;
              reply = withAnswer(reply, ev);
              live = "";
              const now = Date.now();
              if (now - lastDraw < gap) continue;
              lastDraw = now;
              const part = repairJson(reply);
              const key = part ? JSON.stringify(part) : "";
              if (!part || key === last) continue;
              last = key;
              try {
                const live = site.render(sitePage(plan, { language: lang, ...(part as object) }, i, first), { live: true });
                if (live.source.trim()) yield { id: o.id, type: "replace", text: [...made, mk(`${page.file}.html`, live.source)].join("\n\n") };
              } catch { /* a half-written value that cannot be drawn yet: the next draw will */ }
              // a drawing costs the app (repairing, rendering the page, drawing it in the window): the next one waits ten times as long, so drawing never takes the processor
              if (o.drawEveryMs !== 0) gap = Math.max(o.drawEveryMs ?? 900, Math.min(8000, (Date.now() - now) * 10));
            }
          } catch (e) { if (o.signal?.aborted) throw e; }
          if (o.signal?.aborted) throw new Error("aborted");
          // an answer cut by the limit of the window is still a page: what was written is repaired and kept
          const got = (firstJson(reply) ?? repairJson(reply)) as Record<string, unknown> | null;
          probs = got ? site.problems({ ...got, title: got.title || plan.title }) : ["the answer was not a JSON object"];
          if (got && !probs.length) data = got;
          else if (got && Array.isArray(got.sections) && got.sections.length && (!best || got.sections.length > (best.sections as unknown[]).length)) best = got;
        }
        // refused twice: the fullest page written is used rather than throwing away minutes of work and the whole plan
        if (!data && best) data = best;
        if (!data) {
          g.status = "error"; g.note = `refused twice (${probs[0] ?? "no answer"})`; step.status = "error";
          yield { id: o.id, type: "notice", text: `Several pages skipped: ${page.file}.html was refused twice (${probs[0] ?? "no answer"}), so one page is made.` };
          yield run(); yield { id: o.id, type: "replace", text: "" };
          steps.length = 1; steps[0].job = "from a template";
          return null;
        }
        if (!first) first = data;
        const done = site.render(sitePage(plan, { language: lang, ...data }, i, first));
        made.push(mk(`${page.file}.html`, done.source));
        g.status = "done"; g.sec = Math.round(((Date.now() - (g.at ?? Date.now())) / 1000) * 10) / 10; g.note = `${done.source.split("\n").length} lines`;
        step.status = "done";
        yield { id: o.id, type: "replace", text: made.join("\n\n") };
        yield run();
      }
      steps[0].status = "done";
      phase = "Writing the summary…";
      yield run();
      let explanation = "";
      try {
        explanation = (await collect(o.stream, `${o.id}:templateexplain`, [{ role: "user", content: `[You made a website of ${plan.pages.length} pages yourself: ${files.join(", ")}. The pages share the same look and menu; they are open next to your message and the person can save them, edit their text with the Edit button, or ask you to change them: add a page or a section, change the look or the colours, rename things.]\nTitle: ${plan.title}\n\nReply to the person in 2 to 4 short sentences, in the language of their request: ${request.slice(-300)}\nSay what you made and what they can ask for to customise it. First person singular. Do not write file contents or <artifact> tags.` }], add, o.signal)).trim();
      } catch (e) { if (o.signal?.aborted) throw e; }
      if (!explanation) explanation = `Done: “${plan.title}”, ${plan.pages.length} pages.`;
      phase = "";
      yield run("done");
      const text = `${made.join("\n\n")}\n\n${explanation}`;
      yield { id: o.id, type: "replace", text };
      return { handled: true, text, stats: total };
    };
    const r = yield* many();
    if (r) return r;
  }

  // 2 ---- the data
  const filling = begin("fill", "Fill in", "the model fills in the fields", "Writer", o.modelOf?.());
  phase = `Filling in the ${tpl.name.toLowerCase()}…`;
  yield run();
  let data: unknown = null, problems: string[] = [];
  const safeTitle = (t: string) => t.replace(/"/g, "'").slice(0, 80);
  const artifactOf = (title: string, source: string) => `<artifact type="${tpl!.kind === "site" || tpl!.kind === "tool" ? "html" : tpl!.kind}" title="${tpl!.kind === "site" || tpl!.kind === "tool" ? "index.html" : safeTitle(title)}">\n${source.trim()}\n</artifact>`;
  let shown = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ask = `The request:\n${request.slice(0, MAX)}\n\nTemplate: ${tpl.name} (${tpl.summary}). Language: ${lang}.\n${attempt && problems.length ? `Your last JSON had these problems, fix them:\n- ${problems.join("\n- ")}\n` : ""}${attempt ? "Do not reason at length: write the JSON object right away, with the figures the request gives.\n" : ""}Write the JSON now.`;
    let reply = "", think = "", lastDraw = 0, gap = o.drawEveryMs ?? 250, last = "", lastThink = 0;
    try {
      for await (const ev of o.stream(`${o.id}:fill:${attempt}`, [{ role: "system", content: tpl.hint ? `${FILL_INSTRUCTIONS}\n${tpl.hint}` : FILL_INSTRUCTIONS }, { role: "user", content: ask }], true, "plan", tpl.schema)) {
        if (ev.type === "done") add(ev.stats);
        // a model that thinks first: its last words are shown while the document cannot be drawn yet
        if (ev.type === "thinking") { think += ev.text; if (!reply && Date.now() - lastThink > 400) { lastThink = Date.now(); live = think.slice(-900); yield run(); } continue; }
        if (ev.type !== "answer" && ev.type !== "retract") continue;
        reply = withAnswer(reply, ev);
        live = "";
        // the document grows while the model writes: what it has filled in so far is drawn (never the empty template), a few times a second
        const now = Date.now();
        if (now - lastDraw < gap) continue;
        lastDraw = now;
        const part = repairJson(reply);
        const key = part ? JSON.stringify(part) : "";
        if (!part || key === last) continue;
        last = key;
        try {
          const live = tpl.render({ language: lang, ...(part as object) }, { live: true });
          if (live.source.trim() && live.source !== shown) { shown = live.source; yield { id: o.id, type: "replace", text: artifactOf(live.title, live.source) }; }
        } catch { /* a half-written value that cannot be drawn yet: the next draw will */ }
        if (o.drawEveryMs !== 0) gap = Math.max(o.drawEveryMs ?? 250, Math.min(8000, (Date.now() - now) * 10));
      }
    } catch (e) { if (o.signal?.aborted) throw e; reply = reply || ""; }
    if (o.signal?.aborted) throw new Error("aborted");
    const got = firstJson(reply);
    problems = got ? tpl.problems(got) : ["the answer was not a JSON object"];
    if (got && !problems.length) { data = got; break; }
  }
  live = "";
  if (!data) { end(filling, "skipped", `the data did not hold up (${problems[0] ?? "no answer"}); writing it freely`); yield { id: o.id, type: "notice", text: `Template skipped: the filled-in fields were refused twice (${problems[0] ?? "no answer"}).` }; yield run(); if (shown) yield { id: o.id, type: "replace", text: "" }; return { handled: false }; }
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
