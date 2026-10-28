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
import { referencesText } from "./repomap";
import { requirementsText } from "./tasklist";
import type { Accepted, Plan, Unit } from "./types";

/** A section made of parts that can give way one by one when the room is short: first each part shrinks to its short form, then the last parts go. */
export interface Item { full: string; short: string }
export interface Section { title: string; text: string; priority: number; why: string; items?: Item[]; sep?: string }
export interface Trace { unit: string; kind: string; sections: { title: string; chars: number; why: string }[]; chars: number; dropped: string[] }
export interface Built { text: string; trace: Trace }

/** The code of a used function is shown whole up to this length when there is room (the sections give way, last first, when there is not); longer, the signature stands for it. */
const SHOW_CODE_UP_TO = 3000;

/** A section built from its parts. */
const made = (title: string, priority: number, why: string, items: Item[], sep = "\n"): Section => ({ title, priority, why, items, sep, text: items.map((i) => i.full).join(sep) });

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

/** The ids of the elements inside the element with this id, read from the layout's HTML (its own closing tag found by counting the same tag). */
export function innerIds(layout: string, id: string): string[] {
  const open = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*?\\bid\\s*=\\s*["']${id.replace(/[^\w-]/g, "")}["'][^>]*>`).exec(layout);
  if (!open) return [];
  const tag = open[1], from = open.index + open[0].length;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = from;
  let depth = 1, end = layout.length, m: RegExpExecArray | null;
  while ((m = re.exec(layout))) { depth += m[1] ? -1 : 1; if (depth === 0) { end = m.index; break; } }
  return layoutIds(layout.slice(from, end));
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
  contractOf(name: string): Item | null {
    const u = this.unit(name);
    if (!u) return null;
    const a = this.accepted.get(name);
    if (u.kind === "state") { const t = `S (the state): ${stateShape(a?.code ?? "") || "see the task"}`; return { full: t, short: t }; }
    if (u.kind === "layout") { const t = `layout: the page has ${layoutElements(a?.code ?? "").join(", ") || "(not written yet)"}`; return { full: t, short: t }; }
    const sig = (a && signatureOf(a.code, name)) || u.signature || `${name}()`;
    const head = `${sig}: ${u.does}`;
    return { full: a && a.verified && a.code.length <= SHOW_CODE_UP_TO ? `${head}\n${a.code}` : head, short: head };
  }

  /** The sections for one unit, most important first. */
  sections(u: Unit, repair?: { failures: string[]; code: string }): Section[] {
    const out: Section[] = [];
    const serves = this.plan.requirements.filter((r) => u.serves.includes(r.id));
    out.push({ title: "Program", priority: 100, why: "what the program is, so the unit has its place", text: `${this.plan.title}. Language of the person: ${this.plan.language}.` });
    // a unit that serves nearly every requirement is told nothing by the list: its task says what it does
    const broad = serves.length >= Math.max(4, this.plan.requirements.length * 0.8) && u.kind !== "state" && u.kind !== "layout";
    if (serves.length && !broad) out.push({ title: "Requirements this unit serves", priority: 95, why: "the reason the unit exists", text: requirementsText(serves) });
    const task = [`kind: ${u.kind}`, `name: ${u.name}`, `does: ${u.does}`, u.signature ? `signature: ${u.signature}` : "", u.on ? `called by the event: ${u.on}` : "", u.into ? `draws into the element #${u.into}` : "", u.reads?.length ? `reads these keys of S: ${u.reads.join(", ")}` : "", u.writes?.length ? `writes these keys of S, and only these: ${u.writes.join(", ")}` : "", u.kind === "handler" && u.uses.some((n) => this.unit(n)?.kind === "fn") ? `calls these functions to do the work: ${u.uses.filter((n) => this.unit(n)?.kind === "fn").join(", ")}` : ""].filter(Boolean);
    if (u.examples.length) task.push(`examples that must hold:\n${u.examples.map((e) => `  ${e.call}  ->  ${e.expect}`).join("\n")}`);
    out.push({ title: "Task", priority: 100, why: "what to write", text: task.join("\n") });
    if (repair) {
      out.push({ title: "Your code so far", priority: 98, why: "what is being corrected", text: repair.code });
      out.push({ title: "Problems", priority: 99, why: "what to change", text: repair.failures.map((f) => `- ${f}`).join("\n") });
    }
    if (u.uses.length) {
      const contracts = u.uses.map((n) => this.contractOf(n)).filter((c): c is Item => !!c);
      if (contracts.length) out.push(made("What it uses", 90, "the contract of each used unit, read from the code that was accepted", contracts, "\n\n"));
    }
    const touchesState = u.kind === "view" || u.kind === "handler" || u.kind === "layout" || u.kind === "fn";
    const state = this.accepted.get("S");
    // the parts of the program (`plan.structure`) are for the planning questions only: shown to a writer they made units worse in the prompt lab
    if (touchesState && state && !u.uses.includes("S")) out.push({ title: "The state S", priority: 85, why: u.kind === "fn" ? "a function never reads S: it takes parts of it as arguments and returns new values" : "views and handlers read and change S", text: stateShape(state.code) || "(empty)" });
    const layout = this.accepted.get("layout");
    if ((u.kind === "view" || u.kind === "handler") && layout) {
      // a view is shown the element it draws into and nothing else: the other ids belong to other views, and a view that sees them writes into them
      const all = layoutElements(layout.code);
      const own = u.kind === "view" && u.into ? all.filter((e) => e.startsWith(`#${u.into} `)) : [];
      out.push({ title: own.length ? "The element it draws into" : "Elements of the page", priority: 85, why: "a view draws only into its element; a canvas is drawn on (canvas and ctx are given), a box is filled by the view", text: (own.length ? own.map((e) => { if (/\(canvas/.test(e)) return `${e}: canvas and ctx are already declared`; const inner = innerIds(layout.code, u.into ?? ""); return inner.length ? `${e}: it holds ${inner.map((i) => `#${i}`).join(", ")}: set the text of those elements (textContent), never the box itself` : `${e}: fill it yourself (innerHTML or textContent), it is yours`; }) : all).join("\n") });
    }
    if (u.kind === "layout") {
      const state2 = this.plan.units.filter((x) => x.kind === "view" || x.kind === "handler");
      if (state2.length) out.push({ title: "What the page must hold", priority: 80, why: "the layout must have a place for each view and an element for each event", text: state2.map((x) => `${x.name}: ${x.does}${x.on ? ` (${x.on})` : ""}${x.into ? ` (an empty element with the id ${x.into}, exactly this id${state2.filter((y) => y.into === x.into).length > 1 ? "; several views draw on it together: make it ONE <canvas> with width and height" : ""})` : ""}`).join("\n") });
    }
    // what the lead planned for everyone is written first and shown whole to every unit after it: it is called, never written again
    const sharedFns = this.plan.units.filter((x) => x.shared && x.name !== u.name && this.accepted.has(x.name) && u.kind !== "state" && u.kind !== "layout" && (u.kind !== "view" || u.uses.includes(x.name)));
    if (sharedFns.length) out.push({ title: "Shared functions (already written: call them, never write your own version of what they do)", priority: 92, why: "what several things do the same way is written once", text: "", items: sharedFns.map((x) => { const a = this.accepted.get(x.name)!; const head = `${(signatureOf(a.code, x.name)) || x.signature || x.name}: ${x.does}`; return { full: a.code.length <= SHOW_CODE_UP_TO ? `${head}\n${a.code}` : head, short: head }; }), sep: "\n\n" });
    { const sec = out[out.length - 1]; if (sharedFns.length) sec.text = sec.items!.map((i) => i.full).join("\n\n"); }
    // the functions that exist, with what each takes and gives: the data flow of the program, so a unit calls them with the right arguments instead of reading what is not there
    // a view draws from the state: it is told of the functions it was planned to use, never of all of them
    const fns = this.plan.units.filter((x) => x.kind === "fn" && x.name !== u.name && u.kind !== "state" && u.kind !== "layout" && (u.kind !== "view" || u.uses.includes(x.name)) && !(x.shared && this.accepted.has(x.name)));
    // the most likely to be called come first (they serve what this unit serves), and the last give way when the room is short
    const near = (x: Unit) => x.serves.filter((id) => u.serves.includes(id)).length;
    const ranked = [...fns].sort((a, b) => near(b) - near(a));
    if (ranked.length) out.push(made("Functions you can call", 70, "what each function takes and returns", ranked.map((x) => { const a = this.accepted.get(x.name); const t = `${(a && signatureOf(a.code, x.name)) || x.signature || `${x.name}()`}: ${x.does}`; return { full: t, short: t }; })));
    // who else sets and reads the keys of S this unit touches, read from the code that exists (the wiring planned for what is not written yet)
    if (touchesState && state && (u.reads?.length || u.writes?.length)) {
      let keys: string[] = [];
      try { const o = JSON.parse(state.code); keys = o && typeof o === "object" ? Object.keys(o) : []; } catch { /* no keys */ }
      const refs = referencesText(u, this.plan.units.filter((x) => x.name !== u.name).map((x) => ({ name: x.name, kind: x.kind, code: this.accepted.get(x.name)?.code, reads: x.reads, writes: x.writes })), keys);
      if (refs) out.push({ title: "Who else touches the keys of S you touch (set a key only when your task says so; read what others set)", priority: 87, why: "one unit owns each thing, and what is set is read by someone", text: refs });
    }
    const names = this.plan.units.filter((x) => x.name !== u.name && x.kind !== "state" && x.kind !== "layout").map((x) => x.name);
    if (names.length) out.push({ title: "Names that exist", priority: 40, why: "so that no other name is invented", text: names.join(", ") });
    if (this.plan.conventions && u.kind !== "state" && u.kind !== "layout") out.push({ title: "What the numbers mean (every unit follows these rules exactly)", priority: 89, why: "units written apart must agree on coordinates, directions, units and time", text: this.plan.conventions });
    const style = this.plan.style ?? this.style;
    if (style && (u.kind === "layout" || u.kind === "view")) out.push({ title: "The look of the whole program (every unit follows it exactly: these colours, sizes and shapes)", priority: 88, why: "everything drawn belongs together", text: style });
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
      // a section made of parts gives way part by part (code first, then the last parts) before it goes whole
      if (low.items?.length) {
        const i = [...low.items.keys()].reverse().find((k) => low.items![k].full !== low.items![k].short);
        if (i !== undefined) low.items[i] = { full: low.items[i].short, short: low.items[i].short };
        else { const gone = low.items.pop()!; dropped.push(`${low.title}: ${gone.short.split(":")[0]}`); }
        low.text = low.items.map((x) => x.full).join(low.sep ?? "\n");
        if (!low.items.length) kept = kept.filter((s) => s !== low);
        continue;
      }
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
