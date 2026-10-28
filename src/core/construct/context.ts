/**
 * The context engine: for each task, exactly what the writer is shown, and nothing else.
 *
 * A small model repeats what it sees, so what it sees is decided here, never by what happened to be nearby:
 *   - the requirements the unit serves (not the whole request, not the other units' reasons)
 *   - the unit's own task: kind, name, what it does, signature, examples, event
 *   - the CONTRACT of what it uses: signature and one line for a function, the keys of the state, the ids of the layout;
 *     read from the code that was accepted (never from a model), and the code itself only when it is short enough to be useful
 *   - the names that exist (so none is invented), the style card for what is drawn
 *   - for a repair: the unit's own code and the exact failures
 * Never shown: a reply that failed, a previous attempt's reasoning, another unit's code that this one does not use, the plan.
 * Every section has a priority and a reason; when the room is short the lowest priorities go first, whole, and every call
 * leaves a trace (what it saw, how much, what was dropped) that goes in the log.
 */
import { requirementsText } from "./tasklist";
import type { Accepted, Plan, Unit } from "./types";

export interface Section { title: string; text: string; priority: number; why: string }
export interface Trace { unit: string; kind: string; sections: { title: string; chars: number; why: string }[]; chars: number; dropped: string[] }
export interface Built { text: string; trace: Trace }

/** The code of a used function is shown only up to this length; longer, the signature stands for it. */
const SHOW_CODE_UP_TO = 500;

/** The first line of a function as written: `function name(a, b)` read back into `name(a, b)`. */
export function signatureOf(code: string, name: string): string | null {
  const m = new RegExp(`(?:function\\s+${name}\\s*\\(([^)]*)\\)|(?:const|let|var)\\s+${name}\\s*=\\s*(?:function\\s*)?\\(([^)]*)\\)\\s*(?:=>|\\{))`).exec(code);
  return m ? `${name}(${(m[1] ?? m[2] ?? "").trim()})` : null;
}

/** The keys of the state, two levels deep, with what each starts as: `player: {x, y, vx}`, `enemies: list of {x, y, dir}`. A writer that cannot see the keys invents them. */
export function stateShape(code: string): string {
  try {
    const o = JSON.parse(code);
    if (!o || typeof o !== "object") return "";
    const kind = (v: unknown): string => (Array.isArray(v) ? "list" : v === null ? "null" : typeof v);
    const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
    // the shape of a value: the fields of an object and of the items of a list, down to three levels, so a writer never has to guess what a platform or an enemy holds
    const shape = (v: unknown, depth: number): string => {
      if (Array.isArray(v)) {
        const first = v[0];
        if (Array.isArray(first)) return "list of lists";
        return isObj(first) ? `list of ${shape(first, depth)}` : "list";
      }
      if (!isObj(v)) return kind(v);
      const ks = Object.keys(v);
      const inner = ks.slice(0, 14).map((k) => (depth < 3 && (isObj(v[k]) || Array.isArray(v[k]) && isObj((v[k] as unknown[])[0])) ? `${k}: ${shape(v[k], depth + 1)}` : k)).join(", ");
      return `{${inner}${ks.length > 14 ? ", ..." : ""}}`;
    };
    // a value that says which mode or screen the program is in (a short text) is shown: units compare with it, and a made-up word never matches
    const value = (v: unknown) => (typeof v === "string" && v.length <= 24 ? ` ("${v}")` : typeof v === "number" || typeof v === "boolean" ? ` (${v})` : "");
    return Object.entries(o).map(([k, v]) => (Array.isArray(v) || isObj(v) ? `${k}: ${shape(v, 1)}` : `${k}: ${kind(v)}${value(v)}`)).join("\n");
  } catch { return ""; }
}

/** The ids the layout defines, read from its HTML. */
export function layoutIds(code: string): string[] {
  return [...new Set([...code.matchAll(/\bid\s*=\s*["']([\w-]+)["']/g)].map((m) => m[1]))];
}

/** The ids with the kind of element each is (`#board (canvas)`, `#score (span)`): a view that draws must know whether it has a canvas or only boxes. */
export function layoutElements(code: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of code.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*?\bid\s*=\s*["']([\w-]+)["'][^>]*>/g)) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    const size = m[1].toLowerCase() === "canvas" ? /\bwidth\s*=\s*["']?(\d+)/.exec(m[0]) && /\bheight\s*=\s*["']?(\d+)/.exec(m[0]) ? ` ${/\bwidth\s*=\s*["']?(\d+)/.exec(m[0])![1]}x${/\bheight\s*=\s*["']?(\d+)/.exec(m[0])![1]}` : "" : "";
    out.push(`#${m[2]} (${m[1].toLowerCase()}${size})`);
  }
  return out;
}

export class ContextEngine {
  readonly accepted = new Map<string, Accepted>();
  readonly traces: Trace[] = [];
  style = "";

  constructor(public plan: Plan, readonly room: number) {}

  unit(name: string): Unit | undefined { return this.plan.units.find((u) => u.name === name); }
  accept(name: string, a: Accepted) { this.accepted.set(name, a); }
  codeOf(name: string): string | undefined { return this.accepted.get(name)?.code; }

  /** What a unit that uses `name` is told about it: the contract, and the code when it is short and was verified. */
  contractOf(name: string): string {
    const u = this.unit(name);
    if (!u) return "";
    const a = this.accepted.get(name);
    if (u.kind === "state") return `S (the state): ${stateShape(a?.code ?? "") || "see the task"}`;
    if (u.kind === "layout") return `layout: the page has ${layoutElements(a?.code ?? "").join(", ") || "(not written yet)"}`;
    const sig = (a && signatureOf(a.code, name)) || u.signature || `${name}()`;
    const head = `${sig}: ${u.does}`;
    return a && a.verified && a.code.length <= SHOW_CODE_UP_TO ? `${head}\n${a.code}` : head;
  }

  /** The sections for one unit, most important first. */
  sections(u: Unit, repair?: { failures: string[]; code: string }): Section[] {
    const out: Section[] = [];
    const serves = this.plan.requirements.filter((r) => u.serves.includes(r.id));
    out.push({ title: "Program", priority: 100, why: "what the program is, so the unit has its place", text: `${this.plan.title}. Language of the person: ${this.plan.language}.` });
    if (serves.length) out.push({ title: "Requirements this unit serves", priority: 95, why: "the reason the unit exists", text: requirementsText(serves) });
    const task = [`kind: ${u.kind}`, `name: ${u.name}`, `does: ${u.does}`, u.signature ? `signature: ${u.signature}` : "", u.on ? `called by the event: ${u.on}` : "", u.into ? `draws into the element #${u.into}` : ""].filter(Boolean);
    if (u.examples.length) task.push(`examples that must hold:\n${u.examples.map((e) => `  ${e.call}  ->  ${e.expect}`).join("\n")}`);
    out.push({ title: "Task", priority: 100, why: "what to write", text: task.join("\n") });
    if (repair) {
      out.push({ title: "Your code so far", priority: 98, why: "what is being corrected", text: repair.code });
      out.push({ title: "Problems", priority: 99, why: "what to change", text: repair.failures.map((f) => `- ${f}`).join("\n") });
    }
    if (u.uses.length) {
      const contracts = u.uses.map((n) => this.contractOf(n)).filter(Boolean);
      if (contracts.length) out.push({ title: "What it uses", priority: 90, why: "the contract of each used unit, read from the code that was accepted", text: contracts.join("\n\n") });
    }
    const touchesState = u.kind === "view" || u.kind === "handler" || u.kind === "layout" || u.kind === "fn";
    const state = this.accepted.get("S");
    if (touchesState && state && !u.uses.includes("S")) out.push({ title: "The state S", priority: 85, why: u.kind === "fn" ? "a function never reads S: it takes parts of it as arguments and returns new values" : "views and handlers read and change S", text: stateShape(state.code) || "(empty)" });
    const layout = this.accepted.get("layout");
    if ((u.kind === "view" || u.kind === "handler") && layout) out.push({ title: "Elements of the page", priority: 85, why: "a view draws only into these; a canvas is drawn on, a box is filled with elements", text: layoutElements(layout.code).join("\n") });
    if (u.kind === "layout") {
      const state2 = this.plan.units.filter((x) => x.kind === "view" || x.kind === "handler");
      if (state2.length) out.push({ title: "What the page must hold", priority: 80, why: "the layout must have a place for each view and an element for each event", text: state2.map((x) => `${x.name}: ${x.does}${x.on ? ` (${x.on})` : ""}${x.into ? ` (an empty element with the id ${x.into}, exactly this id${state2.filter((y) => y.into === x.into).length > 1 ? "; several views draw on it together: make it ONE <canvas> with width and height" : ""})` : ""}`).join("\n") });
    }
    // the functions that exist, with what each takes and gives: the data flow of the program, so a unit calls them with the right arguments instead of reading what is not there
    const fns = this.plan.units.filter((x) => x.kind === "fn" && x.name !== u.name && u.kind !== "state" && u.kind !== "layout");
    if (fns.length) out.push({ title: "Functions you can call", priority: 70, why: "what each function takes and returns", text: fns.map((x) => { const a = this.accepted.get(x.name); return `${(a && signatureOf(a.code, x.name)) || x.signature || `${x.name}()`}: ${x.does}`; }).join("\n") });
    const names = this.plan.units.filter((x) => x.name !== u.name && x.kind !== "state" && x.kind !== "layout").map((x) => x.name);
    if (names.length) out.push({ title: "Names that exist", priority: 40, why: "so that no other name is invented", text: names.join(", ") });
    if (this.style && (u.kind === "layout" || u.kind === "view")) out.push({ title: "Style rules", priority: 60, why: "everything drawn follows the same rules", text: this.style });
    return out;
  }

  /** The text the writer is given, within `room` characters: the lowest priorities are dropped whole, never cut in the middle. */
  build(u: Unit, repair?: { failures: string[]; code: string }): Built {
    const all = this.sections(u, repair);
    const dropped: string[] = [];
    const render = (list: Section[]) => list.map((s) => `${s.title}:\n${s.text}`).join("\n\n");
    let kept = [...all];
    const budget = Math.max(400, this.room);
    while (render(kept).length > budget && kept.length > 2) {
      const low = [...kept].sort((a, b) => a.priority - b.priority)[0];
      if (low.priority >= 95) break; // the task, its reason and its problems are never dropped
      dropped.push(low.title);
      kept = kept.filter((s) => s !== low);
    }
    const text = render(kept.sort((a, b) => all.indexOf(a) - all.indexOf(b)));
    const trace: Trace = { unit: u.name, kind: u.kind, sections: kept.map((s) => ({ title: s.title, chars: s.text.length, why: s.why })), chars: text.length, dropped };
    this.traces.push(trace);
    return { text, trace };
  }

  /** A line per call for the log: what each writer saw. */
  describe(): string {
    return this.traces.map((t) => `${t.unit} (${t.kind}): ${t.chars} chars · ${t.sections.map((s) => `${s.title} ${s.chars}`).join(" · ")}${t.dropped.length ? ` · dropped: ${t.dropped.join(", ")}` : ""}`).join("\n");
  }
}
