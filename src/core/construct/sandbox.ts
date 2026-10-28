/**
 * Runs the examples of a function in an isolated context with a time limit: the only way to know that a unit does what its task says,
 * short of asking the model again. Nothing from the app is visible inside (no require, no process, no page).
 */
import type { Example } from "./types";

type VmModule = typeof import("node:vm");
let vmModule: VmModule | null = null;
async function vm(): Promise<VmModule> { return (vmModule ??= await import("node:vm")); }

const show = (v: unknown): string => { try { const s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 120 ? `${s.slice(0, 117)}...` : s; } catch { return String(v); } };
const same = (a: unknown, b: unknown): boolean => { try { return JSON.stringify(a) === JSON.stringify(b) || (Number.isNaN(a) && Number.isNaN(b)); } catch { return false; } };

export async function syntaxProblem(code: string): Promise<string | null> {
  try { const { Script } = await vm(); new Script(code); return null; } catch (e) { return (e as Error).message.split("\n")[0]; }
}

export interface ExampleResult { ok: boolean; failures: string[] }

/** `deps` are the code of the units this one uses; `code` is the unit; each example's `call` must equal its `expect`. */
export async function runExamples(deps: string[], code: string, examples: Example[]): Promise<ExampleResult> {
  const { createContext, Script } = await vm();
  const failures: string[] = [];
  const ctx = createContext({ Math, JSON, Object, Array, String, Number, Date, Map, Set, parseInt, parseFloat, isNaN, isFinite }, { codeGeneration: { strings: false, wasm: false } });
  try { new Script(`"use strict";\n${deps.join("\n")}\n${code}`).runInContext(ctx, { timeout: 1000 }); }
  catch (e) { return { ok: false, failures: [`the code does not load: ${(e as Error).message}`] }; }
  for (const ex of examples) {
    try {
      const got = new Script(`(${ex.call})`).runInContext(ctx, { timeout: 1000 });
      const want = new Script(`(${ex.expect})`).runInContext(ctx, { timeout: 1000 });
      if (!same(got, want)) failures.push(`${ex.call} gave ${show(got)}, expected ${show(want)}`);
    } catch (e) { failures.push(`${ex.call} failed: ${(e as Error).message.split("\n")[0]}`); }
  }
  return { ok: !failures.length, failures };
}

/** A stand-in for anything of the page: every property is another stand-in, every call returns one, every assignment is accepted. */
function stand(count?: { n: number }): unknown {
  const target = function () { /* a callable stand-in */ };
  const self: unknown = new Proxy(target, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" || k === Symbol.iterator ? undefined : k === "length" ? 0 : self),
    set: () => { if (count) count.n++; return true; },
    apply: () => { if (count) count.n++; return self; },
    construct: () => self as object,
    has: () => true
  });
  return self;
}

export interface SmokeInput {
  /** The kind of unit and its name. */
  kind: "fn" | "view" | "handler";
  name: string;
  code: string;
  /** The state S, as JSON text. */
  state: string;
  /** The code of the other units, so that what the unit calls exists. */
  others: string[];
  /** For a handler: the event that calls it (`keydown ArrowRight`, `tick 16`, `click #id`). */
  on?: string;
  /** For a function: its parameter names (they are filled from the keys of S of the same name; a function whose parameters are not keys is not tried). */
  params?: string[];
}

/**
 * Runs a unit once on the REAL state, with the page replaced by stand-ins: a name that does not exist, or a key read where S has none,
 * fails here exactly as it would in the page, before the whole page is run. Only those two kinds of failure are reported (a name that is
 * not defined, a property read on nothing): what a program decides is not judged here.
 */
export async function smokeRun(input: SmokeInput): Promise<string[]> {
  const { createContext, Script } = await vm();
  let state: Record<string, unknown>;
  try { state = JSON.parse(input.state); } catch { return []; }
  const touched = { n: 0 };
  const page = stand(touched);
  const noop = () => 0;
  const ctx = createContext({
    Math, JSON, Object, Array, String, Number, Boolean, Date, Map, Set, RegExp, Error, parseInt, parseFloat, isNaN, isFinite,
    document: page, window: page, localStorage: page, sessionStorage: page, navigator: page, performance: { now: () => 0 }, Image: function () { return page; }, Audio: function () { return page; },
    console: { log: noop, warn: noop, error: noop, info: noop }, alert: noop, setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop, requestAnimationFrame: noop, cancelAnimationFrame: noop,
    S: state
  }, { codeGeneration: { strings: false, wasm: false } });
  for (const code of input.others) { try { new Script(code).runInContext(ctx, { timeout: 500 }); } catch { /* an unwritten or broken unit is not this one's fault */ } }
  try { new Script(`"use strict";\n${input.code}`).runInContext(ctx, { timeout: 500 }); } catch (e) { return [`it does not load: ${(e as Error).message.split("\n")[0]}`]; }
  let call: string;
  if (input.kind === "view") call = `${input.name}(S)`;
  else if (input.kind === "handler") {
    const k = /^key(?:down|up) (\S+)$/.exec(input.on ?? "")?.[1] ?? "ArrowRight";
    call = `${input.name}({ key: ${JSON.stringify(k === "Space" ? " " : k)}, code: ${JSON.stringify(k === "Space" ? "Space" : k)}, preventDefault: function () {}, target: document })`;
  }
  else {
    // a function with no argument is called as it is (a global it reaches for does not exist); one whose parameters are not keys of S cannot be tried
    const ps = input.params ?? [];
    if (ps.some((p) => !(p in state))) return [];
    // the arguments are frozen: a function that changes what it was given fails here, and one that returns nothing is not a calculation
    call = `(function () { var f = function d(o) { if (o && typeof o === "object") { Object.freeze(o); for (var k in o) d(o[k]); } return o; }; return ${input.name}(${ps.map((p) => `f(JSON.parse(JSON.stringify(S[${JSON.stringify(p)}])))`).join(", ")}) === undefined ? "__nothing__" : "ok"; })()`;
  }
  try {
    const before = input.kind === "handler" ? JSON.stringify(state) : "";
    const got = new Script(input.kind === "handler" && input.on && /^tick /.test(input.on) ? `for (var i = 0; i < 30; i++) { ${call}; }` : call).runInContext(ctx, { timeout: 1000 });
    // what the unit is for, seen on the real state: a view that touches nothing of the page drew nothing; a clock that leaves S as it was never moves anything; a key that changes nothing does nothing
    if (input.kind === "view" && touched.n < 2) return ["it ran and drew nothing: it must put something into its element (draw on the canvas, or set the text of the element)"];
    if (input.kind === "handler" && input.on && /^(tick \d+|keydown \S+)$/.test(input.on) && JSON.stringify(state) === before) return [`it ran for ${input.on.startsWith("tick") ? "30 ticks" : "the key being pressed"} and S did not change at all: it must change S (S.something = ...); check that the condition it tests can be true with the values S starts with`];
    if (got === "__nothing__") return ["it returns nothing: a function ends with `return` of a NEW value (it never changes its arguments)"];
    return [];
  }
  catch (e) {
    const msg = (e as Error).message.split("\n")[0];
    if (/Script execution timed out/i.test(msg)) return ["it did not finish (a loop that never ends)"];
    if (/read.only property|object is not extensible|Cannot add property|Cannot assign to read only/i.test(msg)) return [`it changes an argument it was given (${msg}): copy what it changes (with {...x} or [...x]) and return the new value`];
    if (/is not defined/.test(msg)) return [`it failed when run on the real state: ${msg}. A name must come from S (S.something), from a parameter, from a function listed under "Functions you can call", or be declared in the unit`];
    if (/Cannot read propert(?:y|ies) of (?:undefined|null)|Cannot set propert(?:y|ies) of (?:undefined|null)/.test(msg)) return [`it failed when run on the real state: ${msg}. The state S holds exactly the keys listed under "The state S": use those`];
    return [];
  }
}


export interface PlayInput {
  /** The script of the page. */
  script: string;
  /** The state S, to start from is whatever the script holds. */
  ticks: string[];
  down: { name: string; key: string }[];
  up: { name: string; key: string }[];
  clicks: string[];
}

export interface PlayError { unit: string | null; message: string }

/**
 * The page's own script, run in an isolated context with the page replaced by stand-ins: it is loaded and drawn, the keys are pressed,
 * the clock ticks a couple of hundred times (what moves by itself), the keys are released and it is drawn again. What fails is the
 * program failing as it would in a window, found before a window is opened, and the function it failed in is read from the error.
 */
export async function playPage(input: PlayInput, units: string[]): Promise<PlayError[]> {
  const { createContext, Script } = await vm();
  const page = stand();
  const noop = () => 0;
  const errors: PlayError[] = [];
  const seen = new Set<string>();
  const note = (e: unknown) => {
    const err = e as { message?: string; stack?: string } | string;
    const message = String(typeof err === "string" ? err : err?.message ?? err).split("\n")[0];
    const stack = typeof err === "string" ? "" : String(err?.stack ?? "");
    const frame = [...stack.matchAll(/at (?:Object\.)?([\w$]+) \(/g)].map((m) => m[1]).find((n) => units.includes(n));
    const key = `${frame ?? ""}|${message}`;
    if (seen.has(key) || errors.length >= 8) return;
    seen.add(key);
    errors.push({ unit: frame ?? null, message });
  };
  const ctx = createContext({
    Math, JSON, Object, Array, String, Number, Boolean, Date, Map, Set, RegExp, Error, parseInt, parseFloat, isNaN, isFinite,
    document: page, window: page, localStorage: page, sessionStorage: page, navigator: page, performance: { now: () => 0 }, Image: function () { return page; }, Audio: function () { return page; },
    console: { log: noop, warn: noop, info: noop, error: note }, alert: noop, setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop, requestAnimationFrame: noop, cancelAnimationFrame: noop
  }, { codeGeneration: { strings: false, wasm: false } });
  try { new Script(input.script).runInContext(ctx, { timeout: 1500 }); } catch (e) { note(e); return errors; }
  const ev = (key: string) => ({ key: key === "Space" ? " " : key, code: key === "Space" ? "Space" : key, preventDefault() { /* nothing */ }, target: page });
  (ctx as Record<string, unknown>).__play = { ticks: input.ticks, down: input.down.map((d) => [d.name, ev(d.key)]), up: input.up.map((d) => [d.name, ev(d.key)]), clicks: input.clicks };
  try {
    new Script(`(function () {
      var p = globalThis.__play, g = globalThis;
      function run(n, e) { if (typeof g[n] === "function") g.__run(g[n], e); }
      g.render();
      p.clicks.forEach(function (n) { run(n, { preventDefault: function () {} }); });
      p.down.forEach(function (d) { run(d[0], d[1]); });
      for (var i = 0; i < 200; i++) { p.ticks.forEach(function (n) { run(n); }); if (i % 20 === 0) g.render(); }
      p.up.forEach(function (d) { run(d[0], d[1]); });
      g.render();
    })()`).runInContext(ctx, { timeout: 3000 });
  } catch (e) { note(e); }
  return errors;
}
