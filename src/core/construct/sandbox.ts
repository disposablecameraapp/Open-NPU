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
