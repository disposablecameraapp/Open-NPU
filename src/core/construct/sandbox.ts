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
function stand(): unknown {
  const target = function () { /* a callable stand-in */ };
  const self: unknown = new Proxy(target, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" || k === Symbol.iterator ? undefined : k === "length" ? 0 : self),
    set: () => true,
    apply: () => self,
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
  const page = stand();
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
  else if (input.kind === "handler") call = `${input.name}({ key: "ArrowRight", code: "ArrowRight", keyCode: 39, preventDefault: function () {}, target: document })`;
  else {
    // a function with no argument is called as it is (a global it reaches for does not exist); one whose parameters are not keys of S cannot be tried
    const ps = input.params ?? [];
    if (ps.some((p) => !(p in state))) return [];
    call = `${input.name}(${ps.map((p) => `JSON.parse(JSON.stringify(S[${JSON.stringify(p)}]))`).join(", ")})`;
  }
  try { new Script(call).runInContext(ctx, { timeout: 1000 }); return []; }
  catch (e) {
    const msg = (e as Error).message.split("\n")[0];
    if (/Script execution timed out/i.test(msg)) return ["it did not finish (a loop that never ends)"];
    if (/is not defined/.test(msg)) return [`it failed when run on the real state: ${msg}. A name must come from S (S.something), from a parameter, from a function listed under "Functions you can call", or be declared in the unit`];
    if (/Cannot read propert(?:y|ies) of (?:undefined|null)|Cannot set propert(?:y|ies) of (?:undefined|null)/.test(msg)) return [`it failed when run on the real state: ${msg}. The state S holds exactly the keys listed under "The state S": use those`];
    return [];
  }
}
