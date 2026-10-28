/**
 * What code can put right in a unit without asking a model: the slips small models make every time, each rewritten where the meaning is not in
 * doubt and left alone otherwise (then the check names it and the model is asked with the exact fault). Nothing here knows a kind of program.
 */
import { parse } from "acorn";
import { closestName } from "./mend";

type Node = { type: string; start: number; end: number; [key: string]: any };
interface Edit { start: number; end: number; text: string }
const skip = new Set(["type", "start", "end", "loc", "range"]);

const parseIt = (code: string): Node | null => {
  try { return parse(code, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true }) as unknown as Node; } catch { return null; }
};
const apply = (code: string, edits: Edit[]) => {
  let out = code;
  const used = new Set<number>();
  for (const e of edits.sort((a, b) => b.start - a.start || b.end - a.end)) { if (used.has(e.start) && e.start !== e.end) continue; used.add(e.start); out = out.slice(0, e.start) + e.text + out.slice(e.end); }
  return out;
};
const isFn = (n: Node) => n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression";
const walk = (n: Node | null | undefined, f: (n: Node, parent: Node | null) => boolean | void, parent: Node | null = null) => {
  if (!n || typeof n.type !== "string") return;
  if (f(n, parent) === false) return;
  for (const k of Object.keys(n)) {
    if (skip.has(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && typeof (c as Node).type === "string" && walk(c as Node, f, n));
    else if (v && typeof v === "object" && typeof (v as Node).type === "string") walk(v as Node, f, n);
  }
};

/** Brackets a cut-off answer left open are closed, in the right order, ignoring strings, comments and templates. */
export function closeBrackets(code: string): string {
  const stack: string[] = [];
  let i = 0;
  while (i < code.length) {
    const c = code[i], d = code[i + 1];
    if (c === "/" && d === "/") { while (i < code.length && code[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const e = code.indexOf("*/", i + 2); i = e < 0 ? code.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === "`") { i++; while (i < code.length && code[i] !== c) { if (code[i] === "\\") i++; i++; } i++; continue; }
    if ("{([".includes(c)) stack.push(c === "{" ? "}" : c === "(" ? ")" : "]");
    else if ("})]".includes(c)) { if (stack[stack.length - 1] === c) stack.pop(); else return code; }
    i++;
  }
  return stack.length && stack.length <= 6 ? `${code.replace(/\s+$/, "")}\n${stack.reverse().join("\n")}` : code;
}

/** Typographic quotes, module syntax and a cut-off ending: what makes a unit fail to load for nothing that is its idea. */
export function cleanSyntax(code: string): string {
  let out = code.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/^\s*(?:import\b[^\n]*|export\s+default\s+[\w$]+\s*;?)\s*$/gm, "").replace(/^(\s*)export\s+(?=(?:async\s+)?function\b|const\b|let\b|var\b)/gm, "$1").replace(/^\s*(?:module\.exports|exports\.[\w$]+)\s*=[^\n]*$/gm, "");
  if (!parseIt(out)) { const closed = closeBrackets(out); if (parseIt(closed)) out = closed; }
  return out;
}

/** Other ways a key is written, by the name the program uses for it (`ArrowLeft` is also written `Left`; the space bar is `Space` in the plan and `" "` in an event). */
const KEY_ALIASES: Record<string, string[]> = {
  ArrowLeft: ["Left", "Arrow Left"], ArrowRight: ["Right", "Arrow Right"], ArrowUp: ["Up", "Arrow Up"], ArrowDown: ["Down", "Arrow Down"],
  Space: ["Spacebar", "Space", "SpaceBar"], Escape: ["Esc"], Enter: ["Return"]
};

/**
 * A key written another way than the program writes it, put in the program's own way: only for the keys the program HAS (its events name
 * them), so a program that listens for `Left` and never for `ArrowLeft` is left as it is. `known` are the key names of the plan's events.
 */
export function fixKeys(code: string, known: string[]): string {
  let out = code;
  for (const name of known) {
    const aliases = (KEY_ALIASES[name] ?? []).filter((a) => !known.includes(a) || a === name);
    for (const alias of aliases) {
      const want = name === "Space" ? " " : name;
      if (alias === want) continue;
      const lit = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // what an event reports (`e.key`) and what a variable holds are compared the same way: only a comparison with the alias as a word is touched
      out = out.replace(new RegExp(`(\\.key\\s*[!=]==?\\s*)(['"])${lit}\\2`, "g"), `$1'${want}'`).replace(new RegExp(`(['"])${lit}\\1(\\s*[!=]==?\\s*[\\w$.]*\\.key\\b)`, "g"), `'${want}'$2`);
    }
  }
  return out;
}

const MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);
const rootOf = (n: Node): string | null => { let x = n; while (x.type === "MemberExpression") x = x.object; return x.type === "Identifier" ? x.name : null; };

/** A function that changes what it was given and returns nothing is made a calculation: it works on a copy and returns it. */
export function pureCopy(code: string, name: string): string {
  const ast = parseIt(code);
  if (!ast) return code;
  const fn = (ast.body as Node[]).find((s) => s.type === "FunctionDeclaration" && s.id?.name === name);
  if (!fn || fn.body.type !== "BlockStatement") return code;
  const params = (fn.params as Node[]).filter((p) => p.type === "Identifier").map((p) => p.name as string);
  const mutated: string[] = [];
  let returnsValue = false;
  walk(fn.body, (n) => {
    if (n.type === "ReturnStatement" && n.argument) returnsValue = true;
    if (n !== fn.body && isFn(n)) { walk(n.body, (m) => {
      if (m.type === "AssignmentExpression" || m.type === "UpdateExpression") { const t = m.type === "AssignmentExpression" ? m.left : m.argument; const r = t.type === "MemberExpression" ? rootOf(t) : null; if (r && params.includes(r) && !mutated.includes(r)) mutated.push(r); }
      if (m.type === "CallExpression" && m.callee.type === "MemberExpression" && m.callee.property.type === "Identifier" && MUTATORS.has(m.callee.property.name)) { const r = rootOf(m.callee.object); if (r && params.includes(r) && !mutated.includes(r)) mutated.push(r); }
    }); return false; }
    if (n.type === "AssignmentExpression" || n.type === "UpdateExpression") { const t = n.type === "AssignmentExpression" ? n.left : n.argument; const r = t.type === "MemberExpression" ? rootOf(t) : null; if (r && params.includes(r) && !mutated.includes(r)) mutated.push(r); }
    if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && n.callee.property.type === "Identifier" && MUTATORS.has(n.callee.property.name)) { const r = rootOf(n.callee.object); if (r && params.includes(r) && !mutated.includes(r)) mutated.push(r); }
    return true;
  });
  if (!mutated.length) return code;
  const edits: Edit[] = [{ start: fn.body.start + 1, end: fn.body.start + 1, text: `\n${mutated.map((p) => `  ${p} = ${p} === undefined ? ${p} : JSON.parse(JSON.stringify(${p}));`).join("\n")}` }];
  if (!returnsValue) edits.push({ start: fn.body.end - 1, end: fn.body.end - 1, text: `  return ${mutated[0]};\n` });
  return apply(code, edits);
}

/** Whether the function hands back its first argument (changed): `return player`, `return { ...player, x }`. */
export function returnsFirstArg(code: string, name: string): boolean {
  const ast = parseIt(code);
  const fn = ast && (ast.body as Node[]).find((s) => s.type === "FunctionDeclaration" && s.id?.name === name);
  if (!fn) return false;
  const p0 = fn.params[0]?.type === "Identifier" ? fn.params[0].name : null;
  if (!p0) return false;
  let yes = false;
  walk(fn.body, (n) => {
    if (n !== fn.body && isFn(n)) return false;
    if (n.type === "ReturnStatement" && n.argument) {
      const a = n.argument as Node;
      if (a.type === "Identifier" && a.name === p0) yes = true;
      if (a.type === "ObjectExpression" && (a.properties as Node[]).some((q) => q.type === "SpreadElement" && q.argument.type === "Identifier" && q.argument.name === p0)) yes = true;
    }
    return true;
  });
  return yes;
}

/** `applyInput(S.player, S.keys);` where the function hands back the new player: the result is kept, `S.player = applyInput(S.player, S.keys);`. */
export function keepResults(code: string, handBack: Set<string>): string {
  if (!handBack.size) return code;
  const ast = parseIt(code);
  if (!ast) return code;
  const edits: Edit[] = [];
  walk(ast, (n) => {
    if (n.type === "ExpressionStatement" && n.expression.type === "CallExpression" && n.expression.callee.type === "Identifier" && handBack.has(n.expression.callee.name)) {
      const a = n.expression.arguments[0] as Node | undefined;
      if (a && a.type === "MemberExpression" && rootOf(a) === "S") edits.push({ start: n.start, end: n.start, text: `${code.slice(a.start, a.end)} = ` });
    }
    return true;
  });
  return apply(code, edits);
}

const argName = (a: Node): string | null => (a.type === "Identifier" ? a.name : a.type === "MemberExpression" && !a.computed && a.property.type === "Identifier" ? a.property.name : null);

/** A call whose arguments are the right ones in another order (`f(keys, player)` for `f(player, keys)`): put in the order of the signature. */
export function orderArgs(code: string, sigs: Map<string, string[]>): string {
  const ast = parseIt(code);
  if (!ast) return code;
  const edits: Edit[] = [];
  walk(ast, (n) => {
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && sigs.has(n.callee.name)) {
      const want = sigs.get(n.callee.name)!, args = n.arguments as Node[];
      if (args.length !== want.length || args.length < 2) return true;
      const names = args.map(argName);
      if (names.some((x) => !x) || new Set(names).size !== names.length || new Set(want).size !== want.length) return true;
      if (!want.every((w) => names.includes(w)) || names.every((x, i) => x === want[i])) return true;
      want.forEach((w, i) => { const src = args[names.indexOf(w)]; edits.push({ start: args[i].start, end: args[i].end, text: code.slice(src.start, src.end) }); });
    }
    return true;
  });
  return apply(code, edits);
}

/** An id the code asks the page for that the page does not have, when one id of the page clearly stands for it. */
export function mendIds(code: string, ids: string[]): string {
  if (!ids.length) return code;
  const have = new Set(ids);
  return code.replace(/(getElementById\(\s*|querySelector(?:All)?\(\s*['"]#?)(['"]?)([\w-]+)\2/g, (m, pre: string, q: string, id: string) => {
    if (have.has(id)) return m;
    const near = closestName(id, ids);
    return near ? `${pre}${q}${near}${q}` : m;
  });
}

/** A top-level name another unit already declares (two `const TILE`): this unit's own is renamed, so the page still loads. */
export function renameCollisions(code: string, taken: Set<string>, unit: string): string {
  const ast = parseIt(code);
  if (!ast) return code;
  const own = new Set<string>();
  for (const s of ast.body as Node[]) if (s.type === "VariableDeclaration") for (const d of s.declarations as Node[]) if (d.id.type === "Identifier") own.add(d.id.name);
  let out = code;
  for (const name of own) {
    if (!taken.has(name)) continue;
    const to = `${name}_${unit.replace(/[^\w$]/g, "")}`;
    out = out.replace(new RegExp(`(?<![.\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])(?!\\s*:)`, "g"), to);
  }
  return out;
}

/** The faults that are better named than rewritten: a timer started inside a unit (the page already calls it), S declared again. */
export function wiringProblems(code: string, kind: string, on?: string): string[] {
  const out: string[] = [];
  // a timer started where the page already calls the unit again and again piles up; a one-off handler may start one (that is the program's own idea)
  if ((kind === "view" || kind === "fn" || (kind === "handler" && /^tick /.test(on ?? ""))) && /\b(?:setInterval|requestAnimationFrame)\s*\(/.test(code)) out.push("it starts its own timer or animation loop: the page already calls handlers on their event (tick 16 runs 60 times a second) and draws the views after each, so write only what happens once per call");
  if (/(?:^|[\n;])\s*(?:const|let|var)\s+S\b/.test(code)) out.push("it declares its own S: S is the program's state and already exists, use it");
  if (/\baddEventListener\s*\(\s*['"]key(?:down|up)['"]/.test(code)) out.push("it adds its own key listener: the page already connects each key handler to its key");
  return out;
}
