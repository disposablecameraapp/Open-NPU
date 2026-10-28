/**
 * The code checks of the prompt lab: the answer is code, it is run in an isolated context (no page, no process, a time limit) and
 * expressions are compared with what they must give. This is how a prompt that asks for a unit of a program is judged on whether the
 * code WORKS, not on how much it looks like the ideal.
 */
import type { Check, Ran } from "./promptLab";

/** The same value written with its keys in order: `{a, b}` and `{b, a}` are the same answer. */
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v);
const same = (a: unknown, b: unknown): boolean => { try { return JSON.stringify(canon(a)) === JSON.stringify(canon(b)) || (Number.isNaN(a) && Number.isNaN(b)); } catch { return false; } };
const show = (v: unknown): string => { try { const s = JSON.stringify(v); return s === undefined ? String(v) : s.length > 60 ? `${s.slice(0, 57)}...` : s; } catch { return String(v); } };

/** The code of an answer: the first fenced block when there is one, else the answer. */
export function codeOf(answer: string): string {
  const m = /```[^\n]*\n([\s\S]*?)(?:\n```|$)/.exec(answer);
  return (m ? m[1] : answer).replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").trim();
}

/** For every `loads` and `run` check: `null` when it holds, else why not. Other checks are not in the map. */
export async function codeChecks(answer: string, checks: Check[]): Promise<Ran> {
  const ran: Ran = new Map();
  const todo = checks.filter((c) => c.kind === "loads" || c.kind === "run");
  if (!todo.length) return ran;
  const { createContext, Script } = await import("node:vm");
  // every check gets a fresh context: a handler that changes the state must not change what the next check sees
  const fresh = () => {
    const ctx = createContext({ Math, JSON, Object, Array, String, Number, Date, Map, Set, Proxy, Reflect, parseInt, parseFloat, isNaN, isFinite }, { codeGeneration: { strings: false, wasm: false } });
    try {
      for (const g of checks) if (g.kind === "given") new Script(g.code).runInContext(ctx, { timeout: 1000 });
      new Script(codeOf(answer)).runInContext(ctx, { timeout: 1000 });
      return { ctx, error: null as string | null };
    } catch (e) { return { ctx, error: `does not load: ${(e as Error).message.split("\n")[0]}` }; }
  };
  for (const c of todo) {
    const { ctx, error } = fresh();
    if (error) { ran.set(c, error); continue; }
    if (c.kind !== "run") { ran.set(c, null); continue; }
    try {
      const got = new Script(`(${c.call})`).runInContext(ctx, { timeout: 1000 });
      const want = new Script(`(${c.expect})`).runInContext(ctx, { timeout: 1000 });
      ran.set(c, same(got, want) ? null : `gave ${show(got)}`);
    } catch (e) { ran.set(c, `failed: ${(e as Error).message.split("\n")[0]}`); }
  }
  return ran;
}
