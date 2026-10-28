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
import { bindStateNames, dropDeclared, keepState } from "./bind";
import { ContextEngine, layoutIds, signatureOf, stateShape } from "./context";
import { ACTIONS_INSTRUCTIONS, CALC_INSTRUCTIONS, CHANGE_INSTRUCTIONS, GAPS_INSTRUCTIONS, SCREEN_INSTRUCTIONS, REPAIR_INSTRUCTIONS, REQUIREMENTS_INSTRUCTIONS, REQUIREMENTS_SCHEMA, WRITE_INSTRUCTIONS } from "./docs";
import { readMark } from "./marks";
import { SCENARIO_INSTRUCTIONS, parseScenarios, type Scenario } from "./scenarios";
import { firstJson, repairJson } from "../look";
import { cleanSyntax, fixKeys, keepResults, mendIds, orderArgs, pureCopy, renameCollisions, returnsFirstArg, wiringProblems } from "./fixes";
import { mendFree } from "./mend";
import { mendFields, mendModes, modeProblems, stateProblems, stateReads, usesState } from "./stateUse";
import { playPage, runExamples, smokeRun, syntaxProblem } from "./sandbox";
import { completePlan, groupUnits, normalizeUnits, parseLines, parseRequirements, requirementsText } from "./tasklist";
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

/** A function written as a method (`applyGravity(player, level) {`), the way a class body or an object does, is the function it means. */
const asFunctions = (code: string, names: string[]) => names.reduce((c, n) => c.replace(new RegExp(`^([ \\t]*)(?:async\\s+)?(${n.replace(/\$/g, "\\$")})\\s*\\(([^)]*)\\)\\s*\\{`, "gm"), (_m, sp, name, args) => `${sp}function ${name}(${args}) {`), code);

/** The code of one unit out of a reply: for a group, the part from its own declaration to the next unit's. */
export function extractUnit(reply: string, u: Unit, siblings: Unit[] = [], others: string[] = []): string | null {
  const t = strip(reply);
  const blocks = fences(t);
  const raw = blocks.length ? blocks.join("\n") : t.replace(/```[\w-]*/g, "");
  const body = u.kind === "state" || u.kind === "layout" ? raw : asFunctions(raw, [u.name, ...siblings.map((s) => s.name)]);
  if (u.kind === "state") {
    const a = body.indexOf("{"), b = body.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { const o = JSON.parse(body.slice(a, b + 1)); return o && typeof o === "object" && !Array.isArray(o) ? JSON.stringify(o, null, 1) : null; } catch { return null; }
  }
  if (u.kind === "layout") return body.includes("<") ? body.trim() : null;
  const alone = (c: string) => dropDeclared(c, others.filter((n) => n !== u.name));
  if (!siblings.length) return declares(body, u.name) ? alone(body.trim()) : null;
  const at = (n: string) => { const m = new RegExp(`(?:^|\\n)[ \\t]*(?:async\\s+)?function\\s+${n.replace(/\$/g, "\\$")}\\b|(?:^|\\n)[ \\t]*(?:const|let|var)\\s+${n.replace(/\$/g, "\\$")}\\s*=`).exec(body); return m ? m.index : -1; };
  const start = at(u.name);
  if (start < 0) return null;
  const next = siblings.filter((s) => s.name !== u.name).map((s) => at(s.name)).filter((i) => i > start).sort((x, y) => x - y)[0];
  return alone(body.slice(start, next ?? body.length).trim());
}

const flat = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The ids the plan names (the element a view draws into, the button an event is on) and the ids the layout was written with are the same
 * things said twice (`restartBtn`, `restart-btn`, `canvas`, `gameCanvas`). Where one element of the layout can only be the one the plan
 * means, the plan takes the layout's id: a model asked to write the layout again would only take a minute to say it differently.
 */
/**
 * An element a view draws into or an event listens on that the layout does not have is added by code (a box for a view, a button for a
 * click, a field for an input): asking the model again for the layout returns the same layout.
 */
export function provideIds(units: Unit[], layoutCode: string): { code: string; notes: string[] } {
  const have = new Set(layoutIds(layoutCode)), notes: string[] = [], add: string[] = [];
  const need = (id: string, tag: string) => { if (id && !have.has(id)) { have.add(id); add.push(tag); notes.push(`#${id} was added to the layout (a unit needs it)`); } };
  for (const u of units) {
    if (u.kind === "view" && u.into) need(u.into, units.filter((x) => x.kind === "view" && x.into === u.into).length > 1 ? `<canvas id="${u.into}" width="800" height="450"></canvas>` : `<div id="${u.into}" style="width:800px;height:450px"></div>`);
    const m = u.kind === "handler" && u.on ? /^(click|input|change|submit) #([\w-]+)$/.exec(u.on) : null;
    if (m) need(m[2], m[1] === "click" ? `<button id="${m[2]}">${m[2]}</button>` : m[1] === "submit" ? `<form id="${m[2]}"></form>` : `<input id="${m[2]}">`);
  }
  if (!add.length) return { code: layoutCode, notes };
  const at = layoutCode.search(/<style\b/i);
  const html = add.join("\n");
  return { code: at < 0 ? `${layoutCode.trim()}\n${html}` : `${layoutCode.slice(0, at).trim()}\n${html}\n${layoutCode.slice(at)}`, notes };
}

export function reconcileIds(units: Unit[], layoutCode: string): string[] {
  const ids = layoutIds(layoutCode), have = new Set(ids), notes: string[] = [];
  const find = (want: string): string | null => {
    if (have.has(want)) return want;
    const w = flat(want);
    const hits = ids.filter((i) => flat(i) === w);
    const near = hits.length ? hits : ids.filter((i) => w.length >= 3 && (flat(i).endsWith(w) || flat(i).startsWith(w) || w.endsWith(flat(i)) && flat(i).length >= 4));
    return near.length === 1 ? near[0] : null;
  };
  for (const u of units) {
    if (u.kind === "view" && u.into && !have.has(u.into)) { const f = find(u.into); if (f) { notes.push(`${u.name} draws into #${f} (the plan said #${u.into})`); u.into = f; } }
    const m = u.kind === "handler" && u.on ? /^(click|input|change|submit) #([\w-]+)$/.exec(u.on) : null;
    if (m && !have.has(m[2])) { const f = find(m[2]); if (f) { notes.push(`${u.name} listens on #${f} (the plan said #${m[2]})`); u.on = `${m[1]} #${f}`; } }
  }
  return notes;
}

/** What code can put right without asking again: a key of the state used as a variable (`player.x`) gets its `S.` (a model given the same problem returns the same code). */
export function tidy(u: Unit, code: string | null, engine: ContextEngine): string | null {
  if (!code || u.kind === "state" || u.kind === "layout") return code;
  const isFn = u.kind === "fn";
  code = fixKeys(cleanSyntax(code));
  const state = engine.codeOf("S");
  let keys: string[] = [];
  try { keys = state ? Object.keys(JSON.parse(state)) : []; } catch { /* no keys known */ }
  if (!isFn) code = keepState(code, u.kind, keys);
  const names = new Set(engine.plan.units.map((x) => x.name));
  if (keys.length && !isFn) code = bindStateNames(code, keys.filter((k) => !names.has(k))).code;
  // a name that is not one that exists but plainly stands for one (temps for heure, checkCollision for checkCollisions, p.width for p.w) becomes it
  code = mendFree(code, { fns: engine.plan.units.filter((x) => x.kind === "fn" && x.name !== u.name).map((x) => x.name), keys: isFn ? [] : keys.filter((k) => !names.has(k)), names: [...names], into: u.into }).code;
  if (state) { try { code = mendFields(code, JSON.parse(state)).code; } catch { /* no state */ } }
  if (isFn) code = pureCopy(code, u.name);
  // calls to the functions of the program: a result that is thrown away is kept, arguments in the wrong order are put in order
  const sigs = new Map<string, string[]>(), handBack = new Set<string>();
  for (const x of engine.plan.units) {
    if (x.kind !== "fn" || x.name === u.name) continue;
    const src = engine.codeOf(x.name);
    const sig = (src && signatureOf(src, x.name)) || x.signature || "";
    const ps = (/\(([^)]*)\)/.exec(sig)?.[1] ?? "").split(",").map((p) => p.trim().replace(/=.*$/, "").trim()).filter(Boolean);
    if (ps.length) sigs.set(x.name, ps);
    if (src && returnsFirstArg(src, x.name)) handBack.add(x.name);
  }
  if (u.kind === "handler") code = keepResults(code, handBack);
  code = orderArgs(code, sigs);
  const layout = engine.codeOf("layout");
  if (layout && !isFn) code = mendIds(code, layoutIds(layout));
  const taken = new Set<string>();
  for (const x of engine.plan.units) if (x.name !== u.name) { const src = engine.codeOf(x.name); if (src) for (const n of topLevelNames(src)) taken.add(n); }
  for (const x of engine.plan.units) taken.add(x.name);
  taken.delete(u.name);
  return renameCollisions(code, taken, u.name);
}

/** What is wrong with a unit as written, found by code: parsing, its contract, and for a function its examples run for real. */
const MAX_FIXES = 3;

export async function checkUnit(u: Unit, code: string, engine: ContextEngine, lenient = false): Promise<string[]> {
  const problems: string[] = [];
  if (u.kind === "state") { try { const o = JSON.parse(code); if (!o || typeof o !== "object") problems.push("the state must be a JSON object"); else problems.push(...stateProblems(o as Record<string, unknown>, engine.plan.requirements.map((r) => r.text).join(" "))); } catch (e) { problems.push(`the state is not valid JSON: ${(e as Error).message}`); } return problems; }
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
    const calls = engine.plan.units.filter((x) => (x.kind === "view" || x.kind === "handler") && new RegExp(`\\b${x.name.replace(/\$/g, "\\$")}\\s*\\(`).test(code)).map((x) => x.name);
    if (calls.length) problems.push(`a fn must not call ${calls.join(", ")}: views draw and handlers react, a function only calculates and returns a value`);
    if (!problems.length && u.examples.length) {
      // after a correction a function that runs, and gives a value of the same kind as the example's, is kept: an example from a small model is as often wrong as the code
      const res = await runExamples(depsCode(u, engine), code, u.examples);
      problems.push(...(lenient ? res.failures.filter((f) => /failed:/.test(f)) : res.failures));
    }
  }
  if (u.kind === "view" && /\bS\.\w+\s*=[^=]/.test(code)) problems.push("a view must not change S: it only draws");
  problems.push(...wiringProblems(code, u.kind, u.on));
  const stateText = engine.codeOf("S");
  let stateObj: Record<string, unknown> | null = null;
  try { const o = stateText ? JSON.parse(stateText) : null; stateObj = o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch { /* no state to read against */ }
  if (stateObj && !problems.length) problems.push(...stateReads(code, stateObj));
  // a handler that changes nothing in S and touches nothing else (the page, a sound, storage) can have no effect at all
  if (!problems.length && u.kind === "handler" && !usesState(code).writes && !/\b(document|window|localStorage|sessionStorage|Audio|fetch|navigator|console)\b/.test(code)) problems.push("this handler has no effect: it changes nothing in S (S.something = ...) and touches nothing else; a function it calls returns a new value, and it must put it in S");
  if (!problems.length && u.kind === "view" && u.into && !code.includes(u.into)) problems.push(`a view draws into the element #${u.into} (document.getElementById("${u.into}")): it never names it`);
  if (u.kind === "handler" && /\b(innerHTML|createElement|appendChild)\b/.test(code)) problems.push("a handler must not draw: change S, the page is drawn afterwards");
  // run once on the real state, the page replaced by stand-ins: a name that does not exist or a key that S does not hold fails here
  if (!problems.length) {
    const state = engine.codeOf("S");
    if (state) {
      const others = engine.plan.units.filter((x) => x.name !== u.name && x.kind !== "state" && x.kind !== "layout").map((x) => engine.codeOf(x.name) ?? `function ${x.name}() { return undefined; }`);
      const params = u.kind === "fn" ? (/\(([^)]*)\)/.exec(signatureOf(code, u.name) ?? u.signature ?? "")?.[1] ?? "").split(",").map((p) => p.trim().replace(/=.*$/, "").trim()).filter(Boolean) : undefined;
      problems.push(...(await smokeRun({ kind: u.kind as "fn" | "view" | "handler", name: u.name, code, state, others, params, on: u.on })));
    }
  }
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
  let scenarios: Scenario[] = [];
  let accepted = new Map<string, Accepted>();
  const marker = host.resume ? (readMark(host.resume, "x-construct") as { title?: string; language?: string; requirements?: Requirement[]; units?: Unit[]; scenarios?: Scenario[] } | null) : null;
  if (marker?.units?.length && marker.requirements?.length) {
    plan = { title: marker.title ?? "Program", language: marker.language ?? "English", requirements: marker.requirements, units: marker.units };
    accepted = unitsFromPage(host.resume!, plan);
    scenarios = marker.scenarios ?? [];
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
      const gapReply = yield* call("Plan (gaps)", GAPS_INSTRUCTIONS, gapUser);
      const more = normalizeUnits(gapReply, h.requirements, done.plan.units);
      done = completePlan(h, [...done.plan.units, ...more.units]);
      for (const n of more.notes) yield warn(n);
    }
    for (const id of [...done.report.uncovered].slice(0, 14)) {
      if (host.aborted?.()) throw new Error("aborted");
      const r = h.requirements.find((x) => x.id === id)!;
      const user = `The requirement with no unit yet:\n${requirementsText([r])}\n\nThe units that exist: ${known() || "none yet"}`;
      const reply = yield* call(`Plan (${id})`, GAPS_INSTRUCTIONS, user);
      yield { type: "log", text: `plan ${id} reply (${reply?.length ?? 0} characters): ${clip((reply ?? "").replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").replace(/\s+/g, " ").trim(), 300) || "(nothing outside the thinking)"}` };
      const more = normalizeUnits(reply, h.requirements, done.plan.units);
      done = completePlan(h, [...done.plan.units, ...more.units.map((u) => (u.serves.length || u.kind === "state" || u.kind === "layout" ? u : { ...u, serves: [id] }))]);
      for (const n of more.notes) yield warn(n);
    }
    if (done.report.uncovered.length) yield warn(`no unit serves ${done.report.uncovered.join(", ")}: ${done.report.uncovered.map((id) => h.requirements.find((r) => r.id === id)?.text).join(" | ")}`);
    if (lacksLogic(done.plan.units)) yield warn("the plan has no view and no handler: the program will show nothing and react to nothing");
    return done.plan;
  };

  let engine: ContextEngine | null = null;
  const E = () => engine!;
  const P = () => plan!;
  const paint = () => assemblePage(P(), E().accepted, false, scenarios);

  /** Units written in groups of at most three small ones that share a call, each checked and corrected once with the exact failures. */
  const writeUnits = async function* (list: Unit[]): AsyncGenerator<XEvent, void> {
    const groups = groupUnits(list.filter((u) => !E().accepted.has(u.name)), room);
    for (let gi = 0; gi < groups.length; gi++) {
      if (host.aborted?.()) throw new Error("aborted");
      const group = groups[gi];
      const label = group.length > 1 ? `Units: ${group.map((u) => u.name).join(", ")}` : `Unit: ${group[0].name}`;
      const text = group.map((u) => `${group.length > 1 ? `=== ${u.name} ===\n` : ""}${E().build(u).text}`).join("\n\n");
      const reply = yield* call(label, `${WRITE_INSTRUCTIONS(group[0].kind)}${group.length > 1 ? " Write every listed unit, one after the other, each as its own function." : ""}`, text);
      const act = counter.act;
      counter.act = undefined;
      if (act === "back" && gi > 0) {
        // the person sends the step back: the previous group is thrown away and written again
        for (const u of groups[gi - 1]) E().accepted.delete(u.name);
        yield* show(paint());
        gi -= 2;
        continue;
      }
      if (reply === null) { yield warn(`${label}: ${act === "skip" ? "left out at your request" : "nothing came back"}; ${group.map((u) => u.name).join(", ")} stay stubs`); continue; }
      for (const u of group) {
        const others = E().plan.units.map((x) => x.name);
        let code = tidy(u, extractUnit(reply, u, group.length > 1 ? group : [], others), E());
        if (u.kind === "layout" && code) {
          for (const n of reconcileIds(E().plan.units, code)) yield { type: "log", text: `ids: ${n}` };
          const given = provideIds(E().plan.units, code);
          code = given.code;
          for (const n of given.notes) yield { type: "log", text: `ids: ${n}` };
        }
        let problems = code ? await checkUnit(u, code, E()) : [`it does not contain ${u.kind === "state" ? "a JSON object" : u.kind === "layout" ? "HTML" : `the function ${u.name}`}`];
        // as soon as a unit is written it is checked, and while something is wrong it goes back to the model with the exact fault to be written again (up to three times, while each answer is not worse)
        for (let round = 0; round < MAX_FIXES && problems.length; round++) {
          yield { type: "note", text: `${u.name}: correcting ${clip(problems[0], 60)}` };
          const label = `Unit: ${u.name} (again${round ? ` ${round + 1}` : ""})`;
          // nothing usable came back: the same question is asked again as it was, not a correction of nothing (a model asked to correct nothing answers with a name)
          const fix = code
            ? yield* call(label, REPAIR_INSTRUCTIONS(u.kind), E().build(u, { failures: problems, code }).text)
            : yield* call(label, WRITE_INSTRUCTIONS(u.kind), E().build(u).text);
          let code2 = fix ? tidy(u, extractUnit(fix, u, [], others), E()) : null;
          if (code2 && u.kind === "layout") { reconcileIds(E().plan.units, code2); code2 = provideIds(E().plan.units, code2).code; }
          if (!code2) { if (code) break; continue; }
          let problems2 = await checkUnit(u, code2, E());
          if (problems2.length && u.kind === "fn" && !(await checkUnit(u, code2, E(), true)).length) { yield { type: "log", text: `${u.name}: it runs and its answers have the kind of the examples' (${clip(problems2[0], 80)}): kept` }; problems2 = []; }
          if (code && problems2.length > problems.length) break;
          code = code2; problems = problems2;
        }
        const parses = code && !(await syntaxProblem(u.kind === "state" || u.kind === "layout" ? "0" : code));
        if (!code || !parses || (u.kind === "state" && problems.length) || (u.kind === "layout" && !/id\s*=/.test(code))) { yield warn(`${u.name} could not be written: ${problems[0] ?? "nothing usable"}`); continue; }
        E().accept(u.name, { code, verified: problems.length === 0, problems });
        if (problems.length) yield warn(`${u.name} was kept with a problem: ${problems[0]}`);
        yield* show(paint());
      }
    }
  };

  if (!plan) {
    // 1. requirements
    const reqReply = yield* call("Requirements", REQUIREMENTS_INSTRUCTIONS, `The request:\n${clip(request.trim(), 4000)}`, REQUIREMENTS_SCHEMA, `The request:\n${clip(request.trim(), 4000)}\n\nReply with the JSON object only.`);
    head = parseRequirements(reqReply);
    if (!head) { yield warn("the requirements did not come back: the request's own sentences are used"); head = { title: "Program", language: "English", requirements: fallbackRequirements(request) }; }
    // 2. the state first: everything after it is planned and written knowing its keys
    plan = completePlan(head, []).plan;
    engine = new ContextEngine(plan, Math.floor(room * 0.6));
    yield* show(paint());
    yield* writeUnits(plan.units.filter((u) => u.kind === "state"));
    const base = `The requirements:\n${requirementsText(head.requirements)}\n\nThe state S holds:\n${stateShape(E().codeOf("S") ?? "") || "(nothing yet)"}`;
    const reqs = head.requirements;
    // 3. the plan, in three small questions of one kind of unit each: what is shown, what happens, what is calculated
    const lineLog = (what: string, reply: string | null): XEvent => ({ type: "log", text: `${what} reply (${reply?.length ?? 0} characters): ${clip((reply ?? "").replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").replace(/\s+/g, " ").trim(), 600) || "(nothing outside the thinking)"}` });
    const all = (list: Unit[]) => list.map((u) => (u.serves.length ? u : { ...u, serves: reqs.map((r) => r.id) }));
    const screenReply = yield* call("Screen", SCREEN_INSTRUCTIONS, base);
    yield lineLog("screen", screenReply);
    const screen = normalizeUnits(screenReply, reqs, plan.units, "view");
    const actionsReply = yield* call("Actions", ACTIONS_INSTRUCTIONS, `${base}\n\nWhat is shown:\n${screen.units.map((u) => `${u.name}: ${u.does}`).join("\n") || "(nothing)"}`);
    yield lineLog("actions", actionsReply);
    const actions = normalizeUnits(actionsReply, reqs, [...plan.units, ...screen.units], "handler");
    const calcReply = yield* call("Calculations", CALC_INSTRUCTIONS, `${base}\n\nWhat is shown:\n${screen.units.map((u) => `${u.name}: ${u.does}`).join("\n") || "(nothing)"}\n\nWhat happens:\n${actions.units.map((u) => `${u.name} (${u.on ?? "no event"}): ${u.does}`).join("\n") || "(nothing)"}`);
    yield lineLog("calculations", calcReply);
    const calcs = normalizeUnits(calcReply, reqs, [...plan.units, ...screen.units, ...actions.units], "fn");
    for (const n of [...screen.notes, ...actions.notes, ...calcs.notes]) yield warn(n);
    if (!screen.units.length && !actions.units.length) yield warn(`the plan has no view and no handler (screen: ${screen.units.length}, actions: ${actions.units.length}, calculations: ${calcs.units.length})`);
    const done = completePlan(head, [...plan.units, ...all(screen.units), ...all(actions.units), ...all(calcs.units)]);
    for (const n of done.report.notes) yield warn(n);
    plan = yield* planMore(done.plan, head, false);
    engine.plan = plan;
    yield { type: "log", text: `plan: ${plan.units.length} units: ${plan.units.map((u) => `${u.kind}:${u.name}${u.signature ? ` ${u.signature}` : ""}`).join(", ")}` };
  } else if (head && host.change) {
    // a change asked of a finished program: which units differ, which are new, what the program must now do
    const stateU = plan.units.find((u) => u.kind === "state"), layoutU = plan.units.find((u) => u.kind === "layout");
    const listing = plan.units.map((u) => `${u.kind} ${u.name}${u.signature ? ` (${u.signature})` : ""}: ${u.does}${u.on ? ` [${u.on}]` : ""}${u.into ? ` [draws into #${u.into}]` : ""}`).join("\n");
    const user = `The program: ${plan.title}\n\nWhat it must do:\n${requirementsText(plan.requirements)}\n\nIts units:\n${listing}\n\nWhat S holds: ${stateShape(accepted.get(stateU?.name ?? "S")?.code ?? "") || "(unknown)"}\nThe ids of the page: ${layoutIds(accepted.get(layoutU?.name ?? "layout")?.code ?? "").map((i) => `#${i}`).join(" ")}\n\nThe request:\n${clip(host.change.trim(), 1500)}`;
    const reply = yield* call("Change", CHANGE_INSTRUCTIONS, user, undefined, `${user}\n\nReply with the lines only.`);
    yield { type: "log", text: `change reply (${reply?.length ?? 0} characters): ${clip((reply ?? "").replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").replace(/\s+/g, " ").trim(), 700) || "(nothing)"}` };
    const j = (reply ? (firstJson(reply) ?? repairJson(reply)) : null) as { requirements?: { text?: string }[]; rewrite?: { name?: string; what?: string }[] } | null;
    const lines = parseLines(reply);
    const fresh = (Array.isArray(j?.requirements) && j!.requirements!.length ? j!.requirements! : lines.requirements).map((r) => String(r?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300)).filter((t) => t.length > 3);
    const newReqs = fresh.map((text, k) => ({ id: `R${plan!.requirements.length + k + 1}`, text }));
    const reqs = [...plan.requirements, ...newReqs];
    const added = normalizeUnits(reply, reqs, plan.units).units.map((u) => (u.serves.length ? u : { ...u, serves: newReqs.length ? newReqs.map((r) => r.id) : [reqs[0].id] }));
    const wanted = (Array.isArray(j?.rewrite) && j!.rewrite!.length ? j!.rewrite! : lines.rewrite).filter((r) => r?.name && plan!.units.some((u) => u.name === r.name));
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
  if (!engine) engine = new ContextEngine(plan, Math.floor(room * 0.6));
  else engine.plan = plan;
  for (const [k, v] of accepted) engine.accept(k, v);
  // a page taken up again: a layout that lacks what the (now complete) plan needs is written again, and the units the problems name are corrected
  const layoutUnit = plan.units.find((u) => u.kind === "layout");
  const kept = layoutUnit && engine.accepted.get(layoutUnit.name);
  const oldLayout = marker && layoutUnit && kept && (await checkUnit(layoutUnit, kept.code, engine)).length ? kept : null;
  if (oldLayout) engine.accepted.delete(layoutUnit!.name);
  if (marker) yield { type: "log", text: `taken up: ${[...engine.accepted.keys()].join(", ") || "no unit"} found in the page${oldLayout ? "; the layout is written again" : ""}` };
  yield* show(assemblePage(plan, engine.accepted, false, scenarios));
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
    const code2 = fix ? tidy(u, extractUnit(fix, u), engine) : null;
    if (code2) {
      const left = await checkUnit(u, code2, engine);
      if (u.kind === "state" ? !left.length : left.length <= a.problems.length + (host.change ? 1 : failures.length)) { engine.accept(u.name, { code: code2, verified: left.length === 0, problems: left }); yield* show(assemblePage(plan, engine.accepted, false, scenarios)); }
    }
  }

  // 4. the rest of the units, in order
  yield* writeUnits(plan.units);

  // a layout that could not be written again does not leave the page bare: the one it had stays
  if (oldLayout && layoutUnit && !engine.accepted.has(layoutUnit.name)) { engine.accept(layoutUnit.name, { ...oldLayout, verified: false }); yield warn("the layout could not be written again: the earlier one is kept"); }

  // the program is played in an isolated context (loaded, drawn, keys pressed, the clock ticking) before anything else: what fails is attributed
  // to the function it failed in and that unit is written again with the exact error; twice at most, the second time to see that it holds
  for (let round = 0; round < 2; round++) {
    const html = assemblePage(plan, engine.accepted, true, scenarios);
    const script = /<script>\n([\s\S]*)\n<\/script>/.exec(html)?.[1].replace(/<\\\/script/gi, "</script");
    if (!script) break;
    const hs = plan.units.filter((h) => h.kind === "handler" && h.on && engine.accepted.has(h.name));
    const keyOf = (on: string, ev: string) => new RegExp(`^${ev} (\\S+)$`).exec(on)?.[1];
    const errs = await playPage({
      script,
      ticks: hs.filter((h) => /^tick \d+$/.test(h.on!)).map((h) => h.name),
      down: hs.flatMap((h) => { const k = keyOf(h.on!, "keydown"); return k ? [{ name: h.name, key: k }] : []; }),
      up: hs.flatMap((h) => { const k = keyOf(h.on!, "keyup"); return k ? [{ name: h.name, key: k }] : []; }),
      clicks: hs.filter((h) => /^(click|input|change|submit) #/.test(h.on!)).map((h) => h.name)
    }, plan.units.map((u) => u.name));
    yield { type: "log", text: `played (round ${round + 1}): ${errs.length ? errs.map((e) => `${e.unit ?? "?"}: ${e.message}`).join(" | ") : "no error"}` };
    const by = new Map<string, string[]>();
    let stateObj: Record<string, unknown> | null = null;
    try { const o = JSON.parse(engine.codeOf("S") ?? "null"); stateObj = o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch { /* no state */ }
    if (stateObj && round === 0) {
      // two words for the mode a program starts in ("running" for "playing") are put right by code; any other word nothing sets goes to the model
      const live = () => plan.units.filter((x) => x.kind !== "state" && x.kind !== "layout" && engine.accepted.has(x.name)).map((x) => ({ name: x.name, code: engine.codeOf(x.name) ?? "" }));
      for (const [name, code] of mendModes(live(), stateObj)) { const a = engine.accepted.get(name)!; engine.accept(name, { ...a, code }); yield { type: "log", text: `${name}: a mode word was put right by code` }; }
      for (const [name, list] of modeProblems(live(), stateObj)) { by.set(name, list); yield { type: "log", text: `${name}: ${list[0]}` }; }
    }
    for (const e of errs) {
      if (e.unit) { by.set(e.unit, [...(by.get(e.unit) ?? []), `when the program ran: ${e.message}. S holds exactly the keys listed under "The state S" (their lists hold what is shown there): use those, and check a value exists before reading into it`]); continue; }
      if (!e.nan) continue;
      // a number that is no number any more: the clock handlers that write that part of S are asked to look at their calculation
      const part = e.nan.split(".")[1] ?? "";
      const writers = hs.filter((h) => /^tick /.test(h.on!) && new RegExp(`\\bS\\.${part}\\b|\\b${part}\\b`).test(engine.codeOf(h.name) ?? ""));
      for (const w of (writers.length ? writers : hs.filter((h) => /^tick /.test(h.on!))).slice(0, 2)) by.set(w.name, [...(by.get(w.name) ?? []), `after the program ran, ${e.nan} is not a number any more (NaN or infinite): a calculation used a value that is missing or is not a number; check what it reads, and divide only by values that cannot be 0`]);
    }
    if (!by.size) break;
    for (const [name, failures] of [...by].slice(0, 6)) {
      const u = plan.units.find((x) => x.name === name), a = engine.accepted.get(name);
      if (!u || !a || u.kind === "state" || u.kind === "layout") continue;
      yield { type: "note", text: `Unit: ${u.name}` };
      const fix = yield* call(`Unit: ${u.name} (played)`, REPAIR_INSTRUCTIONS(u.kind), engine.build(u, { failures, code: a.code }).text);
      const code2 = fix ? tidy(u, extractUnit(fix, u, [], plan.units.map((x) => x.name)), engine) : null;
      if (!code2) continue;
      const left = await checkUnit(u, code2, engine);
      if (left.length <= a.problems.length) { engine.accept(u.name, { code: code2, verified: left.length === 0, problems: left }); yield* show(paint()); }
    }
  }

  // the tests of the program: what the requirements say must happen, as scenes the page is made to play (written once the page has its ids)
  const layoutCode = layoutUnit && engine.codeOf(layoutUnit.name);
  if (layoutCode && (!scenarios.length || host.change)) {
    const ids = layoutIds(layoutCode);
    const controls = plan.units.filter((h) => h.kind === "handler" && h.on).map((h) => `${h.name} (${h.on}): ${h.does}`).join("; ");
    const user = `The program: ${plan.title}\n\nWhat it must do:\n${requirementsText(plan.requirements)}\n\nThe ids of the page: ${ids.map((i) => `#${i}`).join(" ")}\n\nHow it is controlled: ${controls || "(see the requirements)"}`;
    const reply = yield* call("Scenarios", SCENARIO_INSTRUCTIONS, user);
    const made = parseScenarios(reply, ids);
    yield { type: "log", text: `scenarios (${made.scenarios.length}): ${made.scenarios.map((s) => `${s.req} ${s.text}`).join(" || ") || "none"}` };
    for (const n of made.notes) yield warn(n);
    if (made.scenarios.length) scenarios = made.scenarios;
  }

  // 5. the page, whole
  const final = assemblePage(plan, engine.accepted, true, scenarios);
  yield* show(final);
  const verified = plan.units.filter((u) => engine.accepted.get(u.name)?.verified).length;
  yield { type: "log", text: `units: ${verified} of ${plan.units.length} written and checked\n${engine.describe()}` };
  return { html: final, warnings, calls: counter.n };
}
