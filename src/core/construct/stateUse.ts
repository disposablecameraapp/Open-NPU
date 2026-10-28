/**
 * Reading the code of a unit against the state it was written for, without running it: a field read on a thing of the state that does
 * not hold it (`p.width` on platforms that hold `w`), a key of S that does not exist (`S.tick`), a handler that changes nothing, a view that
 * never reads S, a text compared with a value that nothing ever sets. These are the faults a small model makes most, and each one is a
 * line of the problem list with the names that exist, so a correction can be exact.
 */
import { parse } from "acorn";
import { closestName, type Edit } from "./mend";

type Node = { type: string; start: number; end: number; [key: string]: any };
const skip = new Set(["type", "start", "end", "loc", "range"]);
const UNK = Symbol("unknown");
const RUNNING = new Set(["running", "playing", "play", "active", "started", "ingame", "game", "alive", "live", "go", "on"]);
type Val = unknown;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const PROTO = new Set(["hasOwnProperty", "toString", "valueOf", "constructor", "length", "toFixed", "toLocaleString", "__proto__"]);
const ITERATORS = new Set(["forEach", "map", "filter", "find", "findIndex", "some", "every", "flatMap", "findLast"]);

/** One thing standing for every item of a list: the fields of all of them. */
function itemOf(list: unknown[]): Val {
  const objs = list.filter(isObj);
  if (!objs.length) return UNK;
  const out: Record<string, unknown> = {};
  for (const o of objs) for (const [k, v] of Object.entries(o)) if (!(k in out)) out[k] = v;
  return out;
}

const parseCode = (code: string): Node | null => {
  try { return parse(code, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true }) as unknown as Node; } catch { return null; }
};

const isFn = (n: Node) => n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression";

function patternNames(p: Node | null | undefined, out: string[]) {
  if (!p) return;
  if (p.type === "Identifier") out.push(p.name);
  else if (p.type === "ObjectPattern") for (const q of p.properties as Node[]) patternNames(q.type === "RestElement" ? q.argument : q.value, out);
  else if (p.type === "ArrayPattern") for (const q of p.elements as (Node | null)[]) patternNames(q, out);
  else if (p.type === "RestElement") patternNames(p.argument, out);
  else if (p.type === "AssignmentPattern") patternNames(p.left, out);
}

/**
 * The faults of a unit's reading of the state. `state` is the initial state (parsed), `params` are the parameters of a function that
 * receive a part of it by name (a parameter named like a key of S is that key).
 */
export function stateReads(code: string, state: Record<string, unknown>, edits?: Edit[]): string[] {
  const ast = parseCode(code);
  if (!ast) return [];
  const out: string[] = [];
  // a read under a test (`if (p.boss)`, `p.boss && ...`, `p.boss ? ..`) is how a program handles a field that may not be there: it is the program's own idea, not a fault
  let guarded = 0;
  const say = (m: string) => { if (!guarded && !out.includes(m) && out.length < 3) out.push(m); };
  const text = (n: Node) => code.slice(n.start, n.end);

  const resolve = (n: Node, env: Map<string, Val>): Val => {
    if (n.type === "Identifier") {
      if (env.has(n.name)) return env.get(n.name);
      return n.name === "S" ? state : UNK;
    }
    if (n.type === "MemberExpression") {
      const base = resolve(n.object, env);
      if (n.computed) return Array.isArray(base) ? itemOf(base) : UNK;
      if (isObj(base) && n.property.type === "Identifier" && n.property.name in base) return base[n.property.name];
      return UNK;
    }
    return UNK;
  };
  const itemsOf = (v: Val): Val => (Array.isArray(v) ? itemOf(v) : UNK);

  const bindPattern = (p: Node, value: Val, env: Map<string, Val>) => {
    const names: string[] = [];
    patternNames(p, names);
    if (p.type === "Identifier") { env.set(p.name, value); return; }
    if (p.type === "ObjectPattern" && isObj(value)) {
      for (const q of p.properties as Node[]) {
        if (q.type !== "Property" || q.computed || q.key.type !== "Identifier") continue;
        if (!(q.key.name in value) && !PROTO.has(q.key.name)) {
          const near = closestName(q.key.name, Object.keys(value));
          // a field taken out under another name is taken out under the one that exists, and keeps the name the code uses
          if (near && edits && !guarded) { edits.push(q.shorthand ? { start: q.start, end: q.end, text: `${near}: ${q.key.name}` } : { start: q.key.start, end: q.key.end, text: near }); continue; }
        }
        if (!(q.key.name in value) && !PROTO.has(q.key.name)) say(`it takes "${q.key.name}" out of ${"an object"} that holds {${Object.keys(value).slice(0, 14).join(", ")}}`);
      }
    }
    for (const nm of names) env.set(nm, UNK);
  };

  const visit = (n: Node | null | undefined, env: Map<string, Val>, target = false): void => {
    if (!n || typeof n.type !== "string") return;
    if (isFn(n)) {
      const inner = new Map(env);
      const ps = n.params as Node[];
      for (const p of ps) {
        const names: string[] = [];
        patternNames(p, names);
        for (const nm of names) inner.set(nm, UNK);
        // a parameter named like a key of the state is that part of the state
        if (p.type === "Identifier" && n.type === "FunctionDeclaration" && env.size === 0 && p.name in state && p.name !== "S") inner.set(p.name, state[p.name]);
      }
      visit(n.body, inner);
      return;
    }
    switch (n.type) {
      case "VariableDeclarator": {
        if (n.init) { visit(n.init, env); bindPattern(n.id, n.init ? resolve(n.init, env) : UNK, env); }
        else bindPattern(n.id, UNK, env);
        return;
      }
      case "ForOfStatement": {
        const items = itemsOf(resolve(n.right, env));
        visit(n.right, env);
        const inner = new Map(env);
        const left = n.left.type === "VariableDeclaration" ? n.left.declarations[0].id : n.left;
        bindPattern(left, items, inner);
        visit(n.body, inner);
        return;
      }
      case "CallExpression": {
        const c = n.callee as Node;
        if (c.type === "MemberExpression" && !c.computed && c.property.type === "Identifier" && ITERATORS.has(c.property.name)) {
          const items = itemsOf(resolve(c.object, env));
          visit(c.object, env);
          for (const a of n.arguments as Node[]) {
            if (isFn(a)) {
              const inner = new Map(env);
              (a.params as Node[]).forEach((p, i) => bindPattern(p, i === 0 ? items : UNK, inner));
              visit(a.body, inner);
            } else visit(a, env);
          }
          return;
        }
        break;
      }
      case "AssignmentExpression": {
        visit(n.left, env, true);
        visit(n.right, env);
        return;
      }
      case "UpdateExpression": visit(n.argument, env, true); return;
      case "IfStatement": case "ConditionalExpression": {
        guarded++; visit(n.test, env); guarded--;
        visit(n.consequent, env); visit(n.alternate, env);
        return;
      }
      case "LogicalExpression": guarded++; visit(n.left, env); guarded--; visit(n.right, env); return;
      case "UnaryExpression": if (n.operator === "typeof") { guarded++; visit(n.argument, env); guarded--; return; } break;
      case "BinaryExpression": if (n.operator === "in") { guarded++; visit(n.right, env); guarded--; visit(n.left, env); return; } break;
      case "MemberExpression": {
        const base = resolve(n.object, env);
        if (!n.computed && !n.optional && n.property.type === "Identifier" && isObj(base) && !(n.property.name in base) && !PROTO.has(n.property.name)) {
          const top = n.object.type === "Identifier" && n.object.name === "S" && !env.has("S");
          // a field set on a thing is how it grows; a key of S that does not exist is a key the state never declared
          const near = closestName(n.property.name, Object.keys(base));
          if (near && edits && !guarded && (!target || top)) { edits.push({ start: n.property.start, end: n.property.end, text: near }); visit(n.object, env); return; }
          if (!target || top) say(`it ${target ? "sets" : "reads"} "${n.property.name}" on ${text(n.object)}, which holds {${Object.keys(base).slice(0, 14).join(", ")}}${top ? ": the state S has no such key" : ""}`);
        }
        visit(n.object, env);
        if (n.computed) visit(n.property, env);
        return;
      }
      case "Property": if (n.computed) visit(n.key, env); visit(n.value, env); return;
    }
    for (const k of Object.keys(n)) {
      if (skip.has(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && visit(c as Node, env));
      else if (v && typeof v === "object" && typeof (v as Node).type === "string") visit(v as Node, env);
    }
  };
  // the unit's own functions are visited with an empty scope (their parameters are the only names they start with)
  for (const s of ast.body as Node[]) visit(s, new Map());
  return out;
}

/** What a unit does with S, read from its code: does it change it, does it read it. */
export function usesState(code: string): { writes: boolean; reads: boolean } {
  return {
    writes: /\bS\b[\w$.[\]'"]*\s*(?:[-+*/%]?=(?!=)|\+\+|--)|\bS\b[\w$.[\]'"]*\.(?:push|splice|pop|shift|unshift|sort|reverse|fill)\(|Object\.assign\(\s*S\b|\bS\s*=(?!=)/.test(code),
    reads: /\bS\b/.test(code)
  };
}

/**
 * The words the program compares its modes with must be words something sets: `if (S.gameState === "running")` when the state starts as
 * "playing" and nothing ever writes "running" makes a handler that never runs. Returns, by unit name, what to correct.
 */
export function modeProblems(units: { name: string; code: string }[], state: Record<string, unknown>, fixes?: Map<string, { start: number; end: number; text: string }[]>): Map<string, string[]> {
  const allowed = new Map<string, Set<string>>();
  const allow = (key: string, lit: string) => { if (!allowed.has(key)) allowed.set(key, new Set()); allowed.get(key)!.add(lit); };
  const keys = Object.keys(state).filter((k) => typeof state[k] === "string");
  for (const k of keys) allow(k, String(state[k]));
  const compares: { unit: string; key: string; lit: string; start: number; end: number }[] = [];
  // a mode that is also set from a value worked out (`S.mode = next(...)`), or the whole of S at once, can hold any word: it is not judged
  const dynamic = new Set<string>();
  const everything = units.some((u) => /Object\.assign\(\s*S\b|\bS\s*=(?!=)/.test(u.code));
  const keyOf = (n: Node): string | null => (n.type === "MemberExpression" && !n.computed && n.object.type === "Identifier" && n.object.name === "S" && n.property.type === "Identifier" && keys.includes(n.property.name) ? n.property.name : null);
  for (const u of units) {
    const ast = parseCode(u.code);
    if (!ast) continue;
    const walk = (n: Node | null | undefined) => {
      if (!n || typeof n.type !== "string") return;
      if (n.type === "AssignmentExpression") { const k = keyOf(n.left); if (k) { if (n.right.type === "Literal" && typeof n.right.value === "string") allow(k, n.right.value); else dynamic.add(k); } }
      if (n.type === "Property" && !n.computed && n.value.type === "Literal" && typeof n.value.value === "string") { const k = n.key.type === "Identifier" ? n.key.name : String(n.key.value); if (keys.includes(k)) allow(k, n.value.value); }
      if (n.type === "BinaryExpression" && /^[!=]==?$/.test(n.operator)) {
        for (const [a, b] of [[n.left, n.right], [n.right, n.left]] as [Node, Node][]) {
          const k = keyOf(a);
          if (k && b.type === "Literal" && typeof b.value === "string") compares.push({ unit: u.name, key: k, lit: b.value, start: b.start, end: b.end });
        }
      }
      for (const k of Object.keys(n)) {
        if (skip.has(k)) continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && walk(c as Node));
        else if (v && typeof v === "object" && typeof (v as Node).type === "string") walk(v as Node);
      }
    };
    walk(ast);
  }
  const out = new Map<string, string[]>();
  for (const c of compares) {
    if (everything || dynamic.has(c.key) || allowed.get(c.key)?.has(c.lit)) continue;
    // "running" for "playing": two words for the one state a program starts in are the same word
    if (fixes && RUNNING.has(c.lit.toLowerCase()) && RUNNING.has(String(state[c.key]).toLowerCase())) { const q = units.find((u) => u.name === c.unit)!.code[c.start]; fixes.set(c.unit, [...(fixes.get(c.unit) ?? []), { start: c.start, end: c.end, text: `${q}${String(state[c.key])}${q}` }]); continue; }
    const msg = `it compares S.${c.key} with "${c.lit}", which nothing ever sets: S.${c.key} starts as "${String(state[c.key])}"${allowed.get(c.key)!.size > 1 ? ` and is set to ${[...allowed.get(c.key)!].filter((x) => x !== String(state[c.key])).map((x) => `"${x}"`).join(", ")}` : ""}; use one of those words`;
    const list = out.get(c.unit) ?? [];
    if (!list.includes(msg)) { list.push(msg); out.set(c.unit, list); }
  }
  return out;
}

/** What is wrong with the state itself, read against the requirements: the same thing spelled two ways, a list the program needs left empty. */
export function stateProblems(state: Record<string, unknown>, requirements: string): string[] {
  const out: string[] = [];
  const names = new Set<string>();
  const empty: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) { if (!v.length) empty.push(path); else v.slice(0, 3).forEach((x) => walk(x, `${path}[]`)); }
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) { names.add(k); walk(x, path ? `${path}.${k}` : k); }
  };
  walk(state, "");
  for (const [a, b] of [["w", "width"], ["h", "height"], ["vx", "velocityX"], ["dx", "vx"]] as const) {
    if (names.has(a) && names.has(b)) out.push(`the same idea is spelled two ways, "${a}" and "${b}": pick one and use it everywhere`);
  }
  const text = requirements.toLowerCase();
  for (const p of empty) {
    const leaf = p.split(".").pop()!.replace(/\[\]/g, "").toLowerCase();
    const stem = leaf.replace(/(?:ies|es|s)$/, (m) => (m === "ies" ? "y" : ""));
    if (leaf.length > 2 && (text.includes(leaf) || (stem.length > 2 && text.includes(stem)))) out.push(`the list "${p}" is empty, but the requirements need it: give it a few real entries`);
  }
  return out.slice(0, 3);
}

/** Fields read or set under a name the object does not hold, put right where one name clearly stands for it (`p.width` on items that hold `w`). */
export function mendFields(code: string, state: Record<string, unknown>): { code: string; renamed: number } {
  const edits: Edit[] = [];
  stateReads(code, state, edits);
  if (!edits.length) return { code, renamed: 0 };
  let out = code;
  const done = new Set<number>();
  for (const e of edits.sort((a, b) => b.start - a.start)) { if (done.has(e.start)) continue; done.add(e.start); out = out.slice(0, e.start) + e.text + out.slice(e.end); }
  return { code: out, renamed: done.size };
}

/** The units rewritten for the words they compare modes with (see `modeProblems`): only where the word and the state's own are two names for running. */
export function mendModes(units: { name: string; code: string }[], state: Record<string, unknown>): Map<string, string> {
  const fixes = new Map<string, { start: number; end: number; text: string }[]>();
  modeProblems(units, state, fixes);
  const out = new Map<string, string>();
  for (const [name, edits] of fixes) {
    let code = units.find((u) => u.name === name)!.code;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) code = code.slice(0, e.start) + e.text + code.slice(e.end);
    out.set(name, code);
  }
  return out;
}
