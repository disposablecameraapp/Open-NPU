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
import { ContextEngine, layoutIds, stateShape } from "./context";
import { CHANGE_INSTRUCTIONS, CHANGE_SCHEMA, GAPS_INSTRUCTIONS, PLAN_INSTRUCTIONS, PLAN_SCHEMA, REPAIR_INSTRUCTIONS, REQUIREMENTS_INSTRUCTIONS, REQUIREMENTS_SCHEMA, WRITE_INSTRUCTIONS } from "./docs";
import { readMark } from "./marks";
import { firstJson, repairJson } from "../look";
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

  const redo = new Map<string, string[]>();
  let head: { title: string; language: string; requirements: Requirement[] } | null = plan ? { title: plan.title, language: plan.language, requirements: plan.requirements } : null;
  const lacksLogic = (units: Unit[]) => !units.some((u) => u.kind === "view" || u.kind === "handler");

  /** Plans what no unit serves yet: one batched question (when asked), then one short question per requirement left, which a small model can answer. */
  const planMore = async function* (from: Plan, h: { title: string; language: string; requirements: Requirement[] }, batch: boolean): AsyncGenerator<XEvent, Plan> {
    let done = completePlan(h, from.units);
    const known = () => done.plan.units.map((u) => `${u.kind} ${u.name} (${u.does})`).join("; ");
    if (batch && done.report.uncovered.length) {
      const gapUser = `The requirements with no unit yet:\n${requirementsText(h.requirements.filter((r) => done.report.uncovered.includes(r.id)))}\n\nThe units that exist: ${known()}`;
      const gapReply = yield* call("Plan (gaps)", GAPS_INSTRUCTIONS, gapUser, PLAN_SCHEMA);
      const more = normalizeUnits(gapReply, h.requirements, done.plan.units);
      done = completePlan(h, [...done.plan.units, ...more.units]);
      for (const n of more.notes) yield warn(n);
    }
    for (const id of [...done.report.uncovered].slice(0, 14)) {
      if (host.aborted?.()) throw new Error("aborted");
      const r = h.requirements.find((x) => x.id === id)!;
      const user = `The requirement with no unit yet:\n${requirementsText([r])}\n\nThe units that exist: ${known() || "none yet"}`;
      const reply = yield* call(`Plan (${id})`, GAPS_INSTRUCTIONS, user, PLAN_SCHEMA);
      yield { type: "log", text: `plan ${id} reply (${reply?.length ?? 0} characters): ${clip((reply ?? "").replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").replace(/\s+/g, " ").trim(), 300) || "(nothing outside the thinking)"}` };
      const more = normalizeUnits(reply, h.requirements, done.plan.units);
      done = completePlan(h, [...done.plan.units, ...more.units.map((u) => (u.serves.length || u.kind === "state" || u.kind === "layout" ? u : { ...u, serves: [id] }))]);
      for (const n of more.notes) yield warn(n);
    }
    if (done.report.uncovered.length) yield warn(`no unit serves ${done.report.uncovered.join(", ")}: ${done.report.uncovered.map((id) => h.requirements.find((r) => r.id === id)?.text).join(" | ")}`);
    if (lacksLogic(done.plan.units)) yield warn("the plan has no view and no handler: the program will show nothing and react to nothing");
    return done.plan;
  };

  if (!plan) {
    // 1. requirements
    const reqReply = yield* call("Requirements", REQUIREMENTS_INSTRUCTIONS, `The request:\n${clip(request.trim(), 4000)}`, REQUIREMENTS_SCHEMA, `The request:\n${clip(request.trim(), 4000)}\n\nReply with the JSON object only.`);
    head = parseRequirements(reqReply);
    if (!head) { yield warn("the requirements did not come back: the request's own sentences are used"); head = { title: "Program", language: "English", requirements: fallbackRequirements(request) }; }
    // 2. plan, then the gaps
    const planUser = `The requirements:\n${requirementsText(head.requirements)}`;
    const planReply = yield* call("Plan", PLAN_INSTRUCTIONS, planUser, PLAN_SCHEMA, `${planUser}\n\nReply with the JSON object only.`);
    yield { type: "log", text: `plan reply (${planReply?.length ?? 0} characters): ${clip((planReply ?? "").replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").replace(/\s+/g, " ").trim(), 700) || "(nothing outside the thinking)"}` };
    const first = normalizeUnits(planReply, head.requirements);
    if (!first.units.length) yield warn(`the plan came back with no usable unit (${planReply ? `${planReply.length} characters, starting "${clip(planReply.replace(/\s+/g, " "), 80)}"` : "nothing came back"}): the requirements are planned one at a time`);
    const done = completePlan(head, first.units);
    for (const n of [...first.notes, ...done.report.notes]) yield warn(n);
    plan = done.plan;
    plan = yield* planMore(plan, head, first.units.length > 0);
    yield { type: "log", text: `plan: ${plan.units.length} units: ${plan.units.map((u) => `${u.kind}:${u.name}`).join(", ")}` };
  } else if (head && host.change) {
    // a change asked of a finished program: which units differ, which are new, what the program must now do
    const stateU = plan.units.find((u) => u.kind === "state"), layoutU = plan.units.find((u) => u.kind === "layout");
    const listing = plan.units.map((u) => `${u.kind} ${u.name}${u.signature ? ` (${u.signature})` : ""}: ${u.does}${u.on ? ` [${u.on}]` : ""}${u.into ? ` [draws into #${u.into}]` : ""}`).join("\n");
    const user = `The program: ${plan.title}\n\nWhat it must do:\n${requirementsText(plan.requirements)}\n\nIts units:\n${listing}\n\nWhat S holds: ${stateShape(accepted.get(stateU?.name ?? "S")?.code ?? "") || "(unknown)"}\nThe ids of the page: ${layoutIds(accepted.get(layoutU?.name ?? "layout")?.code ?? "").map((i) => `#${i}`).join(" ")}\n\nThe request:\n${clip(host.change.trim(), 1500)}`;
    const reply = yield* call("Change", CHANGE_INSTRUCTIONS, user, CHANGE_SCHEMA, `${user}\n\nReply with the JSON object only.`);
    yield { type: "log", text: `change reply (${reply?.length ?? 0} characters): ${clip((reply ?? "").replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").replace(/\s+/g, " ").trim(), 700) || "(nothing)"}` };
    const j = (reply ? (firstJson(reply) ?? repairJson(reply)) : null) as { requirements?: { text?: string }[]; rewrite?: { name?: string; what?: string }[] } | null;
    const fresh = (Array.isArray(j?.requirements) ? j!.requirements! : []).map((r) => String(r?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300)).filter((t) => t.length > 3);
    const newReqs = fresh.map((text, k) => ({ id: `R${plan!.requirements.length + k + 1}`, text }));
    const reqs = [...plan.requirements, ...newReqs];
    const added = normalizeUnits(reply, reqs, plan.units).units.map((u) => (u.serves.length ? u : { ...u, serves: newReqs.length ? newReqs.map((r) => r.id) : [reqs[0].id] }));
    const wanted = (Array.isArray(j?.rewrite) ? j!.rewrite! : []).filter((r) => r?.name && plan!.units.some((u) => u.name === r.name));
    for (const r of wanted) redo.set(r.name!, [`The person asked: "${clip(host.change.trim(), 300)}". In this unit: ${String(r.what ?? "").slice(0, 200)}`]);
    plan = completePlan({ title: plan.title, language: plan.language, requirements: reqs }, [...plan.units, ...added]).plan;
    head = { title: plan.title, language: plan.language, requirements: plan.requirements };
    yield { type: "log", text: `change: rewrite ${[...redo.keys()].join(", ") || "nothing"}; new units ${added.map((u) => u.name).join(", ") || "none"}; new requirements ${newReqs.length}` };
    plan = yield* planMore(plan, head, false);
  } else if (head && (completePlan(head, plan.units).report.uncovered.length || lacksLogic(plan.units))) {
    // a stopped or poor build is taken up again: what no unit serves is planned now
    plan = yield* planMore(plan, head, false);
    yield { type: "log", text: `plan completed: ${plan.units.length} units: ${plan.units.map((u) => `${u.kind}:${u.name}`).join(", ")}` };
  }

  // 3. skeleton: runs already, with stubs
  const engine = new ContextEngine(plan, Math.floor(room * 0.6));
  for (const [k, v] of accepted) engine.accept(k, v);
  // a page taken up again: a layout that lacks what the (now complete) plan needs is written again, and the units the problems name are corrected
  const layoutUnit = plan.units.find((u) => u.kind === "layout");
  const kept = layoutUnit && engine.accepted.get(layoutUnit.name);
  const oldLayout = marker && layoutUnit && kept && (await checkUnit(layoutUnit, kept.code, engine)).length ? kept : null;
  if (oldLayout) engine.accepted.delete(layoutUnit!.name);
  if (marker) yield { type: "log", text: `taken up: ${[...engine.accepted.keys()].join(", ") || "no unit"} found in the page${oldLayout ? "; the layout is written again" : ""}` };
  yield* show(assemblePage(plan, engine.accepted));
  // units the problems of a test name are corrected too, each with the problems that name it
  for (const u of plan.units) {
    const mine = (host.problems ?? []).filter((x) => new RegExp(`\\b${u.name.replace(/\$/g, "\\$")}\\b`).test(x)).slice(0, 4);
    if (mine.length && u.kind !== "state" && u.kind !== "layout") redo.set(u.name, [...(redo.get(u.name) ?? []), ...mine]);
  }
  for (const u of plan.units) {
    const a = engine.accepted.get(u.name), failures = redo.get(u.name);
    if (!a || !failures?.length) continue;
    yield { type: "note", text: `Unit: ${u.name}` };
    const fix = yield* call(`Unit: ${u.name} (again)`, REPAIR_INSTRUCTIONS(u.kind), engine.build(u, { failures, code: a.code }).text);
    const code2 = fix ? extractUnit(fix, u) : null;
    if (code2) {
      const left = await checkUnit(u, code2, engine);
      if (u.kind === "state" ? !left.length : left.length <= a.problems.length + (host.change ? 1 : failures.length)) { engine.accept(u.name, { code: code2, verified: left.length === 0, problems: left }); yield* show(assemblePage(plan, engine.accepted)); }
    }
  }

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

  // a layout that could not be written again does not leave the page bare: the one it had stays
  if (oldLayout && layoutUnit && !engine.accepted.has(layoutUnit.name)) { engine.accept(layoutUnit.name, { ...oldLayout, verified: false }); yield warn("the layout could not be written again: the earlier one is kept"); }

  // 5. the page, whole
  const final = assemblePage(plan, engine.accepted, true);
  yield* show(final);
  const verified = plan.units.filter((u) => engine.accepted.get(u.name)?.verified).length;
  yield { type: "log", text: `units: ${verified} of ${plan.units.length} written and checked\n${engine.describe()}` };
  return { html: final, warnings, calls: counter.n };
}
