/**
 * The wiring of a plan: for every unit, which keys of the state it reads and writes and which functions it calls. The units themselves are
 * planned in three small questions that cannot see each other, so nothing says who does a thing twice or who does it not at all. The wiring
 * puts it all in one table, and plain checks (no model) read the table for doubles, gaps and things that cannot be: a key written and read by
 * nobody, a function nobody calls, a view that writes, two handlers on one event.
 */
import type { Unit } from "./types";

export interface Wire { reads: string[]; writes: string[]; calls: string[] }

const clean = (v: string): string[] =>
  /^\s*(none|nothing|-|n\/a|no)?\s*$/i.test(v) ? [] : [...new Set(v.split(/[,;]/).map((x) => x.trim().replace(/^S\./, "").replace(/[`'".()]+$/g, "").split(/[.[\s(]/)[0]).filter(Boolean))];

/** `name | reads: a, b | writes: c | calls: f, g` lines; a line for a name that is not a unit is ignored. */
export function parseWiring(reply: string | null, names: Set<string>): Map<string, Wire> {
  const out = new Map<string, Wire>();
  for (const raw of (reply ?? "").replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").split("\n")) {
    const parts = raw.replace(/^[\s*\-\d.)]+/, "").split("|");
    if (parts.length < 2) continue;
    const name = parts[0].trim().replace(/^(?:fn|view|handler)\s+/i, "").replace(/\(.*$/, "").trim();
    if (!names.has(name)) continue;
    const w: Wire = { reads: [], writes: [], calls: [] };
    let any = false;
    for (const p of parts.slice(1)) {
      const m = /^\s*(reads?|writes?|calls?)\s*:\s*(.*)$/i.exec(p);
      if (!m) continue;
      any = true;
      const k = m[1].toLowerCase();
      (k.startsWith("read") ? w.reads : k.startsWith("write") ? w.writes : w.calls).push(...clean(m[2]));
    }
    if (any) out.set(name, w);
  }
  return out;
}

export const wiringText = (wires: Map<string, Wire>): string =>
  [...wires].map(([n, w]) => `${n} | reads: ${w.reads.join(", ") || "none"} | writes: ${w.writes.join(", ") || "none"} | calls: ${w.calls.join(", ") || "none"}`).join("\n");

/** What cannot be right in a wiring, read by plain checks: one sentence per fault, naming the units. */
export function analyzeWiring(units: Unit[], wires: Map<string, Wire>, keys: string[]): string[] {
  const out: string[] = [];
  const real = units.filter((u) => u.kind === "fn" || u.kind === "view" || u.kind === "handler");
  const kindOf = new Map(real.map((u) => [u.name, u.kind]));
  const k = new Set(keys);
  const written = new Map<string, string[]>(), read = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, key: string, by: string) => m.set(key, [...(m.get(key) ?? []), by]);
  for (const u of real) {
    const w = wires.get(u.name);
    if (!w) { out.push(`${u.name} has no line: say what it reads, writes and calls`); continue; }
    for (const key of [...new Set([...w.reads, ...w.writes])]) if (!k.has(key)) out.push(`${u.name} names the key "${key}", which S does not hold (S holds: ${keys.join(", ")})`);
    w.reads.filter((x) => k.has(x)).forEach((x) => add(read, x, u.name));
    w.writes.filter((x) => k.has(x)).forEach((x) => add(written, x, u.name));
    for (const c of w.calls) {
      if (!kindOf.has(c)) out.push(`${u.name} calls "${c}", which is not a unit`);
      else if (kindOf.get(c) !== "fn") out.push(`${u.name} calls ${c}, which is a ${kindOf.get(c)}: only functions are called, a view draws and a handler reacts`);
    }
    if (u.kind === "view" && w.writes.length) out.push(`${u.name} is a view and writes ${w.writes.join(", ")}: a view only draws, whoever moves things writes them`);
    if (u.kind === "view" && !w.reads.length) out.push(`${u.name} is a view and reads nothing: what does it draw?`);
    if (u.kind === "fn" && (w.reads.length || w.writes.length)) out.push(`${u.name} is a function: it works on its arguments and touches no key of S (${[...w.reads, ...w.writes].join(", ")}): the unit that calls it passes the keys in`);
    if (u.kind === "handler" && !w.writes.length) out.push(`${u.name} is a handler and writes nothing: a handler is there to change S`);
  }
  for (const [key, by] of written) if (!read.has(key)) out.push(`S.${key} is written by ${[...new Set(by)].join(", ")} but read by no unit: whoever needs it (the step that moves things, a view) must list it under reads, or the key is useless`);
  const called = new Set([...wires.values()].flatMap((w) => w.calls));
  for (const u of real) if (u.kind === "fn" && !called.has(u.name) && !units.some((x) => x.uses.includes(u.name))) out.push(`${u.name} is called by no unit: a handler (or a view) must call it, or it is not needed`);
  const byEvent = new Map<string, string[]>();
  for (const u of real) if (u.kind === "handler" && u.on) byEvent.set(u.on, [...(byEvent.get(u.on) ?? []), u.name]);
  for (const [ev, names] of byEvent) if (names.length > 1 && /^tick/.test(ev)) out.push(`${names.join(" and ")} both run on "${ev}": one handler does everything that happens at each tick`);
  const second = [...byEvent].filter(([ev, names]) => names.length > 1 && !/^tick/.test(ev));
  for (const [ev, names] of second) out.push(`${names.join(" and ")} both react to "${ev}": one of them is a double`);
  return out;
}

/** The plan with what the wiring says: the functions a unit calls are what it uses, and the keys it reads and writes are on it. */
export function applyWiring(units: Unit[], wires: Map<string, Wire>): Unit[] {
  const fns = new Set(units.filter((u) => u.kind === "fn").map((u) => u.name));
  return units.map((u) => {
    const w = wires.get(u.name);
    if (!w) return u;
    return { ...u, reads: w.reads, writes: w.writes, uses: [...new Set([...u.uses, ...w.calls.filter((c) => fns.has(c) && c !== u.name)])] };
  });
}
