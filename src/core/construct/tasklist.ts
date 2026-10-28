/**
 * The list of tasks, which sets the quality of everything after it. A model proposes units; this file decides what is kept:
 * every unit must have a reason (a requirement it serves), every requirement must have a unit, names are real identifiers and
 * unique, a unit uses only units that exist, nothing depends on itself in a circle, and the order puts what a unit needs before it.
 * Nothing here asks a model anything: it reads, checks, repairs what is safe to repair and reports the rest.
 */
import { firstJson, repairJson } from "../look";
import { UNIT_KINDS, type Example, type Plan, type Requirement, type Unit, type UnitKind } from "./types";

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const IDENT = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set(["document", "window", "console", "Math", "JSON", "Object", "Array", "String", "Number", "Date", "render", "S", "layout", "setInterval", "setTimeout", "alert", "eval", "Function", "Promise", "Map", "Set", "Error", "undefined", "NaN", "Infinity", "if", "for", "while", "function", "return", "var", "let", "const", "new", "delete", "typeof", "this", "class"]);

export function parseRequirements(reply: string | null): { title: string; language: string; requirements: Requirement[] } | null {
  const j = rec(reply ? firstJson(reply) : null);
  const list = Array.isArray(j.requirements) ? j.requirements : [];
  const seen = new Set<string>();
  const requirements: Requirement[] = [];
  for (const r of list) {
    const t = text(typeof r === "string" ? r : rec(r).text, 400);
    const key = t.toLowerCase();
    if (t.length < 3 || seen.has(key)) continue; // one statement written twice is one requirement
    seen.add(key);
    requirements.push({ id: `R${requirements.length + 1}`, text: t });
  }
  if (!requirements.length) return null;
  return { title: text(j.title, 60) || "Program", language: text(j.language, 30) || "English", requirements };
}

/** `click #go`, `key`, `tick 500`, `load`, `input #q`, `change #q`, `submit #f`: the only events a handler can have. */
export function normalizeOn(on: unknown): string | null {
  const t = text(on, 60).toLowerCase().replace(/^on\s+/, "");
  let m = /^(click|input|change|submit)\s+#([\w-]+)$/.exec(t);
  if (m) return `${m[1]} #${m[2]}`;
  m = /^(?:tick|every|interval)\s+(\d+)\s*(ms|s)?$/.exec(t);
  if (m) return `tick ${Math.max(16, Math.min(60000, Math.round(+m[1] * (m[2] === "s" ? 1000 : 1))))}`;
  if (/^(key|keydown|keys?|keyboard)$/.test(t)) return "key";
  if (/^(load|start|init)$/.test(t)) return "load";
  return null;
}

const examplesOf = (v: unknown): Example[] => (Array.isArray(v) ? v : []).map((e) => ({ call: text(rec(e).call, 200), expect: text(rec(e).expect, 200) })).filter((e) => e.call && e.expect).slice(0, 8);

export interface PlanReport {
  /** What was repaired or left out, one line each, for the log. */
  notes: string[];
  /** Requirements no unit serves. */
  uncovered: string[];
}

/** Lines of the form `kind name | does | R1,R2 | uses: a | on: key | into: id`, with `e: call => result` lines under a fn, `rewrite name | what` and `requirement | text`. */
export function parseLines(reply: string | null, defaultKind?: UnitKind): { units: Record<string, unknown>[]; rewrite: { name: string; what: string }[]; requirements: { text: string }[] } {
  const units: Record<string, unknown>[] = [], rewrite: { name: string; what: string }[] = [], requirements: { text: string }[] = [];
  const body = (reply ?? "").replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "");
  for (const raw of body.split("\n")) {
    const line = raw.replace(/`/g, "").replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (!line) continue;
    let m = /^e(?:xamples?)?\s*:\s*(.+?)\s*(?:=>|->|→)\s*(.+)$/i.exec(line);
    if (m) { const last = units[units.length - 1]; if (last && last.kind === "fn") (last.examples as { call: string; expect: string }[]).push({ call: m[1], expect: m[2] }); continue; }
    m = /^rewrite\s+([\w$]+)\s*\|\s*(.+)$/i.exec(line);
    if (m) { rewrite.push({ name: m[1], what: m[2] }); continue; }
    m = /^requirement\s*\|\s*(.+)$/i.exec(line);
    if (m) { requirements.push({ text: m[1] }); continue; }
    m = /^(state|layout|fn|view|handler)\b\s*([^|]*)\|(.*)$/i.exec(line);
    // when the question was about one kind of unit the word is optional: `drawScore | shows the score | R3 | into: score`
    if (!m && defaultKind) { const bare = /^([\w$]+(?:\([^)]*\))?)\s*\|(.*)$/.exec(line); if (bare) m = [line, defaultKind, bare[1], bare[2]] as unknown as RegExpExecArray; }
    if (!m) continue;
    const head = m[2].trim(), parts = m[3].split("|").map((p) => p.trim());
    const u: Record<string, unknown> = { kind: m[1].toLowerCase(), name: /^[\w$]+/.exec(head)?.[0] ?? "", does: parts[0] ?? "", serves: [], uses: [], examples: [] };
    if (head.includes("(")) u.signature = head;
    for (const p of parts.slice(1)) {
      const r = /^(?:serves:?\s*)?(R\d+(?:[\s,]+R\d+)*)$/i.exec(p);
      if (r) { u.serves = r[1].split(/[\s,]+/).filter(Boolean); continue; }
      const f = /^(uses|on|into)\s*:\s*(.*)$/i.exec(p);
      if (!f) continue;
      if (f[1].toLowerCase() === "uses") u.uses = f[2].split(/[,\s]+/).filter(Boolean);
      else u[f[1].toLowerCase()] = f[2].trim();
    }
    units.push(u);
  }
  return { units, rewrite, requirements };
}

/** Units as a model proposed them, made sound: see the head of the file. `existing` are the units already kept (a second round adds to them). */
export function normalizeUnits(reply: string | null, requirements: Requirement[], existing: Unit[] = [], forceKind?: UnitKind): { units: Unit[]; notes: string[] } {
  // a plan cut off by the length limit still holds its finished units: they are kept
  const j = rec(reply ? firstJson(reply) ?? repairJson(reply) : null);
  const raw = (Array.isArray(j.units) && j.units.length ? j.units : parseLines(reply, forceKind).units).map((r) => (forceKind ? { ...rec(r), kind: forceKind } : r));
  const notes: string[] = [];
  const units: Unit[] = [];
  const names = new Set(existing.map((u) => u.name));
  const reqIds = new Set(requirements.map((r) => r.id));
  for (const r of raw) {
    const o = rec(r);
    const kind = UNIT_KINDS.find((k) => k === o.kind) as UnitKind | undefined;
    let name = text(o.name, 40).replace(/[^\w$]/g, "");
    if (!kind) { notes.push(`a unit with kind "${text(o.kind, 20)}" was left out`); continue; }
    if (kind === "state") name = "S";
    if (kind === "layout") name = "layout";
    if (!IDENT.test(name) || (kind !== "state" && kind !== "layout" && RESERVED.has(name))) { notes.push(`"${text(o.name, 30)}" is not a usable name: the unit was left out`); continue; }
    if (names.has(name)) { notes.push(`"${name}" was planned twice: the first one is kept`); continue; }
    const serves = [...new Set((Array.isArray(o.serves) ? o.serves : []).map((s) => text(s, 8).toUpperCase()).filter((s) => reqIds.has(s)))];
    const does = text(o.does, 240);
    if (!does) { notes.push(`"${name}" says nothing about what it does: left out`); continue; }
    names.add(name);
    const on = kind === "handler" ? normalizeOn(o.on) : null;
    if (kind === "handler" && !on) notes.push(`handler "${name}" has no event it can be wired to (${text(o.on, 30) || "none"}): it will not be called`);
    units.push({
      id: `u${existing.length + units.length + 1}`, kind, name, does, serves,
      uses: [...new Set((Array.isArray(o.uses) ? o.uses : []).map((s) => text(s, 40).replace(/[^\w$]/g, "")).filter(Boolean))],
      signature: kind === "fn" ? text(o.signature, 160) || `${name}()` : undefined,
      examples: kind === "fn" ? examplesOf(o.examples) : [],
      on: on ?? undefined,
      into: kind === "view" ? text(o.into, 40).replace(/^#/, "").replace(/[^\w-]/g, "") || undefined : undefined
    });
  }
  return { units, notes };
}

/**
 * The plan as a whole: units without a reason dropped, a state and a layout always present, uses resolved against what exists,
 * circles broken, and what no unit serves reported.
 */
export function completePlan(head: { title: string; language: string; requirements: Requirement[] }, units: Unit[]): { plan: Plan; report: PlanReport } {
  const notes: string[] = [];
  let kept = units.filter((u) => {
    if (u.kind === "state" || u.kind === "layout") return true;
    if (u.serves.length) return true;
    notes.push(`"${u.name}" serves no requirement: left out`);
    return false;
  });
  // the state and the layout always exist: a program remembers something and shows something
  if (!kept.some((u) => u.kind === "state")) { kept.unshift({ id: "u0s", kind: "state", name: "S", does: "everything the program remembers, with its starting values", serves: head.requirements.map((r) => r.id), uses: [], examples: [] }); notes.push("no state was planned: one was added"); }
  if (!kept.some((u) => u.kind === "layout")) { kept.unshift({ id: "u0l", kind: "layout", name: "layout", does: "the page: the elements and the look", serves: head.requirements.map((r) => r.id), uses: [], examples: [] }); notes.push("no layout was planned: one was added"); }
  const names = new Set(kept.map((u) => u.name));
  kept = kept.map((u) => {
    const uses = u.uses.filter((n) => { const ok = names.has(n) && n !== u.name; if (!ok && n !== u.name) notes.push(`"${u.name}" uses "${n}", which is not planned: dropped from its uses`); return ok; });
    return { ...u, uses };
  });
  // a view and a handler may use any fn; a fn uses only fns (it is pure); the state and the layout use nothing
  const kindOf = new Map(kept.map((u) => [u.name, u.kind]));
  kept = kept.map((u) => ({ ...u, uses: u.kind === "state" || u.kind === "layout" ? [] : u.kind === "fn" ? u.uses.filter((n) => kindOf.get(n) === "fn") : u.uses.filter((n) => kindOf.get(n) === "fn" || kindOf.get(n) === "state" || kindOf.get(n) === "layout") }));
  const ordered = orderUnits(kept, notes);
  // the state and the layout added here to serve everything do not count as covering anything
  const real = new Set(ordered.filter((u) => !u.id.startsWith("u0")).flatMap((u) => u.serves));
  const uncovered = head.requirements.filter((r) => !real.has(r.id)).map((r) => r.id);
  return { plan: { ...head, units: ordered }, report: { notes, uncovered } };
}

const RANK: Record<UnitKind, number> = { state: 0, layout: 1, fn: 2, view: 3, handler: 4 };

/** The state, then the layout, then the functions (what each needs first), then the views, then the handlers; a circle of uses is broken. */
export function orderUnits(units: Unit[], notes: string[] = []): Unit[] {
  const byName = new Map(units.map((u) => [u.name, u]));
  const out: Unit[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (u: Unit) => {
    if (done.has(u.name)) return;
    visiting.add(u.name);
    for (const n of u.uses) {
      const d = byName.get(n);
      if (!d || done.has(n)) continue;
      if (visiting.has(n)) { notes.push(`"${u.name}" and "${n}" use each other: "${u.name}" no longer uses "${n}"`); u.uses = u.uses.filter((x) => x !== n); continue; }
      visit(d);
    }
    visiting.delete(u.name);
    done.add(u.name);
    out.push(u);
  };
  for (const u of [...units].sort((a, b) => RANK[a.kind] - RANK[b.kind])) visit(u);
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind] || out.indexOf(a) - out.indexOf(b));
}

/** The requirements as a short list, for a prompt. */
export const requirementsText = (rs: Requirement[]) => rs.map((r) => `${r.id}. ${r.text}`).join("\n");

/** Units in groups that each fit what a session can take: small units written together share one call and its cost. */
export function groupUnits(units: Unit[], room: number, size: (u: Unit) => number = (u) => 500 + u.examples.length * 120 + (u.kind === "layout" ? 2500 : u.kind === "state" ? 800 : 0)): Unit[][] {
  const groups: Unit[][] = [];
  let cur: Unit[] = [], used = 0;
  const cap = Math.max(1200, Math.floor(room * 0.3));
  for (const u of units) {
    const s = size(u);
    // a state or a layout is written alone (it sets the names everything else follows)
    const alone = u.kind === "state" || u.kind === "layout";
    if (cur.length && (alone || used + s > cap || cur.length >= 3 || cur[0].kind !== u.kind)) { groups.push(cur); cur = []; used = 0; }
    cur.push(u); used += s;
    if (alone) { groups.push(cur); cur = []; used = 0; }
  }
  if (cur.length) groups.push(cur);
  return groups;
}
