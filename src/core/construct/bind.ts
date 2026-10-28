/**
 * The most common slip of a small model writing a view or a handler: it uses a key of the state as if it were a variable (`player.x`,
 * `lives--`, `const { lives } = lives`) instead of `S.player.x`. The meaning is not in doubt, so it is put right by code, not by asking the
 * model again (which returns the same code). Only a name that is not declared anywhere in the unit, and that is a key of S, is rewritten.
 */
import { parse } from "acorn";

type Node = { type: string; start: number; end: number; [key: string]: any };
interface Edit { start: number; end: number; text: string }

const skip = new Set(["type", "start", "end", "loc", "range"]);

function patternNames(p: Node | null | undefined, out: Set<string>) {
  if (!p) return;
  switch (p.type) {
    case "Identifier": out.add(p.name); break;
    case "ObjectPattern": for (const q of p.properties as Node[]) patternNames(q.type === "RestElement" ? q.argument : q.value, out); break;
    case "ArrayPattern": for (const q of p.elements as (Node | null)[]) patternNames(q, out); break;
    case "RestElement": patternNames(p.argument, out); break;
    case "AssignmentPattern": patternNames(p.left, out); break;
  }
}

const isFunction = (n: Node) => n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression";

/** Every name a function declares for itself (parameters, var, let, const, inner functions and classes, catch parameters), nested functions left out. */
export function declaredIn(fn: Node): Set<string> {
  const out = new Set<string>();
  for (const p of fn.params as Node[]) patternNames(p, out);
  if (fn.type === "FunctionExpression" && fn.id) out.add(fn.id.name);
  const visit = (n: Node | null | undefined) => {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "VariableDeclaration") for (const d of n.declarations as Node[]) { patternNames(d.id, out); visit(d.init); }
    else if (n.type === "FunctionDeclaration") { if (n.id) out.add(n.id.name); return; }
    else if (n.type === "ClassDeclaration") { if (n.id) out.add(n.id.name); return; }
    else if (n.type === "CatchClause") { patternNames(n.param, out); visit(n.body); return; }
    else if (isFunction(n)) return;
    for (const k of Object.keys(n)) {
      if (skip.has(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && visit(c as Node));
      else if (v && typeof v === "object" && typeof (v as Node).type === "string") visit(v as Node);
    }
  };
  if (fn.body.type === "BlockStatement") visit(fn.body); else visit(fn.body);
  return out;
}

export function bindStateNames(code: string, keys: string[]): { code: string; bound: string[] } {
  const keySet = new Set(keys.filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== "S"));
  if (!keySet.size) return { code, bound: [] };
  let ast: Node;
  try { ast = parse(code, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true }) as unknown as Node; } catch { return { code, bound: [] }; }
  const edits: Edit[] = [];
  const bound = new Set<string>();
  const top = new Set<string>();
  for (const s of ast.body as Node[]) {
    if (s.type === "FunctionDeclaration" && s.id) top.add(s.id.name);
    if (s.type === "VariableDeclaration") for (const d of s.declarations as Node[]) patternNames(d.id, top);
  }

  const free = (name: string, scopes: Set<string>[]) => keySet.has(name) && !scopes.some((s) => s.has(name));
  const visit = (n: Node, parent: Node | null, scopes: Set<string>[]) => {
    switch (n.type) {
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": {
        const inner = [...scopes, declaredIn(n)];
        for (const p of n.params as Node[]) if (p.type === "AssignmentPattern") visit(p.right, p, inner);
        visit(n.body, n, inner);
        return;
      }
      case "VariableDeclarator": {
        const mine = new Set<string>();
        patternNames(n.id, mine);
        const init = n.init as Node | null;
        if (init && init.type === "Identifier" && free(init.name, scopes.map((s) => (s === scopes[scopes.length - 1] ? new Set([...s].filter((x) => x !== init.name)) : s))) && mine.has(init.name)) {
          // `const level = level;` and `const { lives } = lives;` read the key of the state: one name, bound to it
          const single = n.id.type === "Identifier" || (n.id.type === "ObjectPattern" && n.id.properties.length === 1 && mine.size === 1);
          if (single) { edits.push({ start: n.start, end: n.end, text: `${init.name} = S.${init.name}` }); bound.add(init.name); return; }
        }
        if (init) visit(init, n, scopes);
        if (n.id.type !== "Identifier") for (const q of [n.id] as Node[]) visitPatternDefaults(q, scopes);
        return;
      }
      case "MemberExpression":
        visit(n.object, n, scopes);
        if (n.computed) visit(n.property, n, scopes);
        return;
      case "Property": {
        if (parent && parent.type === "ObjectPattern") return;
        if (n.computed) visit(n.key, n, scopes);
        if (n.shorthand && n.value.type === "Identifier") {
          if (free(n.value.name, scopes)) { edits.push({ start: n.start, end: n.end, text: `${n.value.name}: S.${n.value.name}` }); bound.add(n.value.name); }
          return;
        }
        visit(n.value, n, scopes);
        return;
      }
      case "MethodDefinition": case "PropertyDefinition":
        if (n.computed) visit(n.key, n, scopes);
        if (n.value) visit(n.value, n, scopes);
        return;
      case "CatchClause": visit(n.body, n, [...scopes, new Set(patternSet(n.param))]); return;
      case "LabeledStatement": visit(n.body, n, scopes); return;
      case "BreakStatement": case "ContinueStatement": return;
      case "Identifier":
        if (free(n.name, scopes)) { edits.push({ start: n.start, end: n.end, text: `S.${n.name}` }); bound.add(n.name); }
        return;
      case "ObjectPattern": case "ArrayPattern": return;
    }
    for (const k of Object.keys(n)) {
      if (skip.has(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && typeof (c as Node).type === "string" && visit(c as Node, n, scopes));
      else if (v && typeof v === "object" && typeof (v as Node).type === "string") visit(v as Node, n, scopes);
    }
  };
  const patternSet = (p: Node | null | undefined) => { const s = new Set<string>(); patternNames(p, s); return s; };
  const visitPatternDefaults = (p: Node, scopes: Set<string>[]) => {
    if (p.type === "AssignmentPattern") visit(p.right, p, scopes);
    else if (p.type === "ObjectPattern") for (const q of p.properties as Node[]) visitPatternDefaults(q.type === "RestElement" ? q.argument : q.value, scopes);
    else if (p.type === "ArrayPattern") for (const q of p.elements as (Node | null)[]) q && visitPatternDefaults(q, scopes);
  };

  visit(ast, null, [top]);
  if (!edits.length) return { code, bound: [] };
  // the outermost edit wins when two overlap, and edits are applied from the end so positions stay right
  const kept = edits.sort((a, b) => a.start - b.start || b.end - a.end).filter((e, i, all) => !all.some((o, j) => j !== i && o.start <= e.start && o.end >= e.end && (o.start < e.start || o.end > e.end)));
  let out = code;
  for (const e of [...kept].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { code: out, bound: [...bound] };
}

/**
 * S is a global the page owns. A handler written `function onJump(S)` hides it behind the event it is given (so `S.player` reads
 * from an event and throws), and `S = resetGame()` swaps the whole state for whatever a function returned (a part of it). Both are
 * put right by code: the parameter named S goes, and the assignment becomes `Object.assign(S, ...)`.
 */
export function keepState(code: string, kind: string, keys: string[] = []): string {
  const parseIt = (c: string) => { try { return parse(c, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true }) as unknown as Node; } catch { return null; } };
  let out = code;
  if (kind === "handler" || kind === "view") {
    const ast = parseIt(out);
    if (!ast) return code;
    const cuts: Edit[] = [];
    const named = new Set(keys);
    for (const s of ast.body as Node[]) {
      if (s.type !== "FunctionDeclaration") continue;
      const ps = s.params as Node[];
      if (kind === "view") {
        // a view is called with S alone: a list of parameters (`drawUI(player, keys, score)`) or one named like a key of the state would read S as that value
        const first = ps[0];
        if (ps.length && (ps.length > 1 || (first.type === "Identifier" && named.has(first.name)) || first.type !== "Identifier")) cuts.push({ start: ps[0].start, end: ps[ps.length - 1].end, text: "" });
        continue;
      }
      // a handler is called with its event: S, or a key of the state, as a parameter hides what it means
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        if (p.type !== "Identifier" || (p.name !== "S" && !named.has(p.name))) continue;
        const end = i + 1 < ps.length ? ps[i + 1].start : p.end;
        const start = i + 1 >= ps.length && i > 0 ? ps[i - 1].end : p.start;
        cuts.push({ start, end, text: "" });
      }
    }
    for (const c of cuts.sort((a, b) => b.start - a.start)) out = out.slice(0, c.start) + c.text + out.slice(c.end);
  }
  const ast = parseIt(out);
  if (!ast) return out;
  const edits: Edit[] = [];
  const visit = (n: Node, shadowed: boolean) => {
    if (isFunction(n)) {
      const mine = shadowed || declaredIn(n).has("S");
      visit(n.body, mine);
      return;
    }
    if (n.type === "AssignmentExpression" && n.operator === "=" && n.left.type === "Identifier" && n.left.name === "S" && !shadowed) {
      edits.push({ start: n.start, end: n.end, text: `Object.assign(S, ${out.slice(n.right.start, n.right.end)})` });
      return;
    }
    for (const k of Object.keys(n)) {
      if (skip.has(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && typeof (c as Node).type === "string" && visit(c as Node, shadowed));
      else if (v && typeof v === "object" && typeof (v as Node).type === "string") visit(v as Node, shadowed);
    }
  };
  for (const s of ast.body as Node[]) visit(s, false);
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** The top-level functions and variables of a reply that are other units of the plan are not this unit's: they go (the unit that owns them writes them). */
export function dropDeclared(code: string, names: string[]): string {
  if (!names.length) return code;
  let ast: Node;
  try { ast = parse(code, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true }) as unknown as Node; } catch { return code; }
  const other = new Set(names);
  const cuts: Edit[] = [];
  for (const s of ast.body as Node[]) {
    if (s.type === "FunctionDeclaration" && s.id && other.has(s.id.name)) cuts.push({ start: s.start, end: s.end, text: "" });
    else if (s.type === "VariableDeclaration" && (s.declarations as Node[]).every((d) => d.id.type === "Identifier" && other.has(d.id.name))) cuts.push({ start: s.start, end: s.end, text: "" });
  }
  if (!cuts.length) return code;
  let out = code;
  for (const c of cuts.sort((a, b) => b.start - a.start)) out = out.slice(0, c.start) + out.slice(c.end);
  return out.replace(/\n{2,}/g, "\n").trim();
}
