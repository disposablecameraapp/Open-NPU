/**
 * Builds any program, one checked step at a time:
 *
 *   1. Requirements   what the request says, as numbered, testable statements
 *   2. Plan           units (state, layout, functions with examples, views, handlers), each serving requirements; gaps asked about once
 *   3. Skeleton       the page, assembled by code, already running with stubs
 *   4. Units          in dependency order, each written by a session that sees only what the context engine gives it, then checked
 *                     (it parses, it meets its contract, a function passes its examples) and corrected once with the exact failures
 *   5. Page           assembled again after every unit, so the preview fills in step by step
 *
 * No step knows a kind of program. What makes it work is that every call is small, has one job, is given a clean context, and
 * is verified by running code, not by trusting the answer.
 */
import { xcall, type XEvent, type XHost, type XResult } from "../xbuild";
import { assemblePage, unitsFromPage } from "./assemble";
import { ContextEngine, layoutIds } from "./context";
import { GAPS_INSTRUCTIONS, PLAN_INSTRUCTIONS, PLAN_SCHEMA, REPAIR_INSTRUCTIONS, REQUIREMENTS_INSTRUCTIONS, REQUIREMENTS_SCHEMA, WRITE_INSTRUCTIONS } from "./docs";
import { readMark } from "./marks";
import { runExamples, syntaxProblem } from "./sandbox";
import { completePlan, groupUnits, normalizeUnits, parseRequirements, requirementsText } from "./tasklist";
import type { Accepted, Plan, Requirement, Unit } from "./types";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const strip = (reply: string) => reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, " ").trim();

/** When the model gives no usable requirements, the request's own sentences are the requirements. */
export function fallbackRequirements(request: string): Requirement[] {
  const parts = request.replace(/\s+/g, " ").split(/(?<=[.!?;])\s+/).map((s) => s.trim()).filter((s) => s.split(" ").length >= 3);
  return (parts.length ? parts : [request.trim()]).map((text, i) => ({ id: `R${i + 1}`, text: clip(text, 400) }));
}

const fences = (t: string) => [...t.matchAll(/```[\w-]*\n([\s\S]*?)```/g)].map((m) => m[1]);
const declares = (code: string, name: string) => new RegExp(`(?:^|[\\n;])\\s*(?:async\\s+)?function\\s+${name.replace(/\$/g, "\\$")}\\b|(?:^|[\\n;])\\s*(?:const|let|var)\\s+${name.replace(/\$/g, "\\$")}\\s*=`).test(code);
const topLevelNames = (code: string): string[] => [...code.matchAll(/(?:^|\n)(?:async\s+)?function\s+([\w$]+)|(?:^|\n)(?:const|let|var)\s+([\w$]+)\s*=/g)].map((m) => m[1] ?? m[2]);

/** The code of one unit out of a reply: for a group, the part from its own declaration to the next unit's. */
export function extractUnit(reply: string, u: Unit, siblings: Unit[] = []): string | null {
  const t = strip(reply);
  const blocks = fences(t);
  const body = blocks.length ? blocks.join("\n") : t.replace(/```[\w-]*/g, "");
  if (u.kind === "state") {
    const a = body.indexOf("{"), b = body.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { const o = JSON.parse(body.slice(a, b + 1)); return o && typeof o === "object" && !Array.isArray(o) ? JSON.stringify(o, null, 1) : null; } catch { return null; }
  }
  if (u.kind === "layout") return body.includes("<") ? body.trim() : null;
  if (!siblings.length) return declares(body, u.name) ? body.trim() : null;
  const at = (n: string) => { const m = new RegExp(`(?:^|\\n)[ \\t]*(?:async\\s+)?function\\s+${n.replace(/\$/g, "\\$")}\\b|(?:^|\\n)[ \\t]*(?:const|let|var)\\s+${n.replace(/\$/g, "\\$")}\\s*=`).exec(body); return m ? m.index : -1; };
  const start = at(u.name);
  if (start < 0) return null;
  const next = siblings.filter((s) => s.name !== u.name).map((s) => at(s.name)).filter((i) => i > start).sort((x, y) => x - y)[0];
  return body.slice(start, next ?? body.length).trim();
}

/** What is wrong with a unit as written, found by code: parsing, its contract, and for a function its examples run for real. */
export async function checkUnit(u: Unit, code: string, engine: ContextEngine): Promise<string[]> {
  const problems: string[] = [];
  if (u.kind === "state") { try { const o = JSON.parse(code); if (!o || typeof o !== "object") problems.push("the state must be a JSON object"); } catch (e) { problems.push(`the state is not valid JSON: ${(e as Error).message}`); } return problems; }
  if (u.kind === "layout") {
    if (!/id\s*=/.test(code)) problems.push("the layout has no element with an id");
    const ids = new Set(layoutIds(code));
    const missing = engine.plan.units.map((h) => h.kind === "handler" && h.on ? /#([\w-]+)$/.exec(h.on)?.[1] : h.kind === "view" ? h.into : undefined).filter((id): id is string => !!id && !ids.has(id));
    if (missing.length) problems.push(`the layout has no element with the id ${[...new Set(missing)].map((i) => `"${i}"`).join(", ")}, which an event or a view needs`);
    return problems;
  }
  const syntax = await syntaxProblem(code);
  if (syntax) return [`it does not parse: ${syntax}`];
  if (!declares(code, u.name)) problems.push(`it does not define ${u.name}`);
  const others = new Set(engine.plan.units.filter((x) => x.name !== u.name).map((x) => x.name));
  const redefined = topLevelNames(code).filter((n) => others.has(n));
  if (redefined.length) problems.push(`it defines ${redefined.join(", ")}, which other units define: use them, do not write them again`);
  if (u.kind === "fn") {
    if (/\b(document|window|localStorage)\b/.test(code)) problems.push("a fn must not touch the page");
    if (/\bS\s*[.[]/.test(code)) problems.push("a fn must not read or change S: pass what it needs as arguments");
    if (!problems.length && u.examples.length) {
      const res = await runExamples(depsCode(u, engine), code, u.examples);
      problems.push(...res.failures);
    }
  }
  if (u.kind === "view" && /\bS\.\w+\s*=[^=]/.test(code)) problems.push("a view must not change S: it only draws");
  if (u.kind === "handler" && /\b(innerHTML|createElement|appendChild)\b/.test(code)) problems.push("a handler must not draw: change S, the page is drawn afterwards");
  return problems;
}

/** The code of the functions a unit uses, all the way down, with a stub where one is not written. */
function depsCode(u: Unit, engine: ContextEngine): string[] {
  const out: string[] = [], seen = new Set<string>();
  const visit = (n: string) => {
    if (seen.has(n)) return; seen.add(n);
    const d = engine.unit(n);
    if (!d || d.kind !== "fn") return;
    d.uses.forEach(visit);
    out.push(engine.codeOf(n) ?? `function ${n}() { return undefined; }`);
  };
  u.uses.forEach(visit);
  return out;
}

export async function* buildProgram(request: string, host: XHost): AsyncGenerator<XEvent, XResult> {
  const warnings: string[] = [];
  const warn = (text: string): XEvent => { warnings.push(text); return { type: "warn", text }; };
  const counter: { n: number; act?: "skip" | "back" } = { n: 0 };
  const call = (label: string, system: string, user: string, schema?: object, again?: string) => xcall(host, counter, label, system, user, again, schema);
  const room = Math.max(3000, host.room);
  let shown = "";
  const show = function* (page: string): Generator<XEvent> {
    if (shown) yield { type: "retract", chars: shown.length };
    shown = page;
    yield { type: "chunk", text: page };
  };

  let plan: Plan | null = null;
  let accepted = new Map<string, Accepted>();
  const marker = host.resume ? (readMark(host.resume, "x-construct") as { title?: string; language?: string; requirements?: Requirement[]; units?: Unit[] } | null) : null;
  if (marker?.units?.length && marker.requirements?.length) {
    plan = { title: marker.title ?? "Program", language: marker.language ?? "English", requirements: marker.requirements, units: marker.units };
    accepted = unitsFromPage(host.resume!, plan);
    yield { type: "note", text: "Taking up where it stopped" };
  }

  if (!plan) {
    // 1. requirements
    const reqReply = yield* call("Requirements", REQUIREMENTS_INSTRUCTIONS, `The request:\n${clip(request.trim(), 4000)}`, REQUIREMENTS_SCHEMA, `The request:\n${clip(request.trim(), 4000)}\n\nReply with the JSON object only.`);
    let head = parseRequirements(reqReply);
    if (!head) { yield warn("the requirements did not come back: the request's own sentences are used"); head = { title: "Program", language: "English", requirements: fallbackRequirements(request) }; }
    // 2. plan, then the gaps once
    const planUser = `The requirements:\n${requirementsText(head.requirements)}`;
    const planReply = yield* call("Plan", PLAN_INSTRUCTIONS, planUser, PLAN_SCHEMA, `${planUser}\n\nReply with the JSON object only.`);
    const first = normalizeUnits(planReply, head.requirements);
    if (!first.units.length) yield warn(`the plan came back with no usable unit (${planReply ? `${planReply.length} characters, starting "${clip(planReply.replace(/\s+/g, " "), 80)}"` : "nothing came back"}): the requirements are planned one at a time`);
    let done = completePlan(head, first.units);
    for (const n of [...first.notes, ...done.report.notes]) yield warn(n);
    const known = () => done.plan.units.map((u) => `${u.kind} ${u.name} (${u.does})`).join("; ");
    if (done.report.uncovered.length && first.units.length) {
      const gapUser = `The requirements with no unit yet:\n${requirementsText(head.requirements.filter((r) => done.report.uncovered.includes(r.id)))}\n\nThe units that exist: ${known()}`;
      const gapReply = yield* call("Plan (gaps)", GAPS_INSTRUCTIONS, gapUser, PLAN_SCHEMA);
      const more = normalizeUnits(gapReply, head.requirements, done.plan.units);
      done = completePlan(head, [...done.plan.units, ...more.units]);
      for (const n of more.notes) yield warn(n);
    }
    // a small model that cannot plan everything at once plans one requirement at a time: a short question it can answer
    for (const id of [...done.report.uncovered].slice(0, 14)) {
      if (host.aborted?.()) throw new Error("aborted");
      const r = head.requirements.find((x) => x.id === id)!;
      const user = `The requirement with no unit yet:\n${requirementsText([r])}\n\nThe units that exist: ${known() || "none yet"}`;
      const reply = yield* call(`Plan (${id})`, GAPS_INSTRUCTIONS, user, PLAN_SCHEMA);
      const more = normalizeUnits(reply, head.requirements, done.plan.units);
      done = completePlan(head, [...done.plan.units, ...more.units.map((u) => (u.serves.length || u.kind === "state" || u.kind === "layout" ? u : { ...u, serves: [id] }))]);
      for (const n of more.notes) yield warn(n);
    }
    if (done.report.uncovered.length) yield warn(`no unit serves ${done.report.uncovered.join(", ")}: ${done.report.uncovered.map((id) => head!.requirements.find((r) => r.id === id)?.text).join(" | ")}`);
    if (!done.plan.units.some((u) => u.kind === "view" || u.kind === "handler")) yield warn("the plan has no view and no handler: the program will show nothing and react to nothing");
    plan = done.plan;
    yield { type: "log", text: `plan: ${plan.units.length} units: ${plan.units.map((u) => `${u.kind}:${u.name}`).join(", ")}` };
  }

  // 3. skeleton: runs already, with stubs
  const engine = new ContextEngine(plan, Math.floor(room * 0.6));
  for (const [k, v] of accepted) engine.accept(k, v);
  yield* show(assemblePage(plan, engine.accepted));

  // 4. units, in order, in groups of small functions that share a call
  const groups = groupUnits(plan.units.filter((u) => !engine.accepted.has(u.name)), room);
  for (let gi = 0; gi < groups.length; gi++) {
    if (host.aborted?.()) throw new Error("aborted");
    const group = groups[gi];
    const label = group.length > 1 ? `Units: ${group.map((u) => u.name).join(", ")}` : `Unit: ${group[0].name}`;
    const text = group.map((u) => `${group.length > 1 ? `=== ${u.name} ===\n` : ""}${engine.build(u).text}`).join("\n\n");
    const reply = yield* call(label, `${WRITE_INSTRUCTIONS(group[0].kind)}${group.length > 1 ? " Write every listed unit, one after the other, each as its own function." : ""}`, text);
    const act = counter.act;
    counter.act = undefined;
    if (act === "back" && gi > 0) {
      // the person sends the step back: the previous group is thrown away and written again
      for (const u of groups[gi - 1]) engine.accepted.delete(u.name);
      yield* show(assemblePage(plan, engine.accepted));
      gi -= 2;
      continue;
    }
    if (reply === null) { yield warn(`${label}: ${act === "skip" ? "left out at your request" : "nothing came back"}; ${group.map((u) => u.name).join(", ")} stay stubs`); continue; }
    for (const u of group) {
      let code = extractUnit(reply, u, group.length > 1 ? group : []);
      let problems = code ? await checkUnit(u, code, engine) : [`it does not contain ${u.kind === "state" ? "a JSON object" : u.kind === "layout" ? "HTML" : `the function ${u.name}`}`];
      if (problems.length) {
        yield { type: "note", text: `${u.name}: correcting ${clip(problems[0], 60)}` };
        const fix = yield* call(`Unit: ${u.name} (again)`, REPAIR_INSTRUCTIONS(u.kind), engine.build(u, { failures: problems, code: code ?? "(nothing usable came back)" }).text);
        const code2 = fix ? extractUnit(fix, u) : null;
        if (code2) {
          const problems2 = await checkUnit(u, code2, engine);
          if (!code || problems2.length <= problems.length) { code = code2; problems = problems2; }
        }
      }
      const parses = code && !(await syntaxProblem(u.kind === "state" || u.kind === "layout" ? "0" : code));
      if (!code || !parses || (u.kind === "state" && problems.length) || (u.kind === "layout" && !/id\s*=/.test(code))) { yield warn(`${u.name} could not be written: ${problems[0] ?? "nothing usable"}`); continue; }
      engine.accept(u.name, { code, verified: problems.length === 0, problems });
      if (problems.length) yield warn(`${u.name} was kept with a problem: ${problems[0]}`);
      yield* show(assemblePage(plan, engine.accepted));
    }
  }

  // 5. the page, whole
  const final = assemblePage(plan, engine.accepted, true);
  yield* show(final);
  const verified = plan.units.filter((u) => engine.accepted.get(u.name)?.verified).length;
  yield { type: "log", text: `units: ${verified} of ${plan.units.length} written and checked\n${engine.describe()}` };
  return { html: final, warnings, calls: counter.n };
}
