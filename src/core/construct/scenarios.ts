/**
 * Scenario tests: what the requirements say should happen, written as a short scene that code can play and judge.
 *
 *   R2 | click #start ; press ArrowRight 8 times | #player moves right
 *
 * The model writes the scenes from the requirements and the ids of the page (it knows what its program is meant to do); the code plays
 * them in the page (keys pressed, buttons clicked, time moved forward) and judges the result by measuring the element (where it is, what
 * it says, whether it shows), never by asking a model whether it looks right. A scene only says what must happen: that something else moves too
 * is never a fault. Nothing here knows a kind of program.
 */

export type ScenarioStep =
  | { do: "press"; key: string; times: number }
  | { do: "hold"; key: string; ms: number }
  | { do: "click"; id: string }
  | { do: "type"; id: string; value: string }
  | { do: "wait"; ms: number };

export type ScenarioExpect =
  | { kind: "moves"; id: string; dir: "left" | "right" | "up" | "down" }
  | { kind: "changes"; id: string }
  | { kind: "shows"; id: string }
  | { kind: "hides"; id: string }
  | { kind: "contains"; id: string; text: string }
  | { kind: "up"; id: string }
  | { kind: "down"; id: string }
  | { kind: "screen" };

export interface Scenario { req: string; steps: ScenarioStep[]; expect: ScenarioExpect; text: string }

/** What the page reports about one element. */
export interface Measure { x: number; y: number; w: number; h: number; text: string; shown: boolean; cls: string }

export interface ScenarioResult { text: string; ok: boolean; detail: string }

export const SCENARIO_INSTRUCTIONS = `You write tests for a finished program, from what it was asked to do. Each test is one line, a short scene that a machine will play in the page and then check:
Rn | what is done, one action after another separated by ; | what must then be true
Actions: press KEY [N times] (KEY: ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Space, Enter, Escape or a letter) · hold KEY N s · click #id · type TEXT into #id · wait N s
What must be true (exactly one, about an element of the page, by its id): #id moves right (or left, up, down) · #id changes · #id shows · #id hides · #id text contains WORDS · #id text goes up (or down) · the screen changes
Rules: say only what MUST happen, never what must not: other things (an enemy, a clock, the background) may move or change at the same time, and that is never a fault. One cause, one effect of the thing the requirement is about. Use only the ids you are given. If the program starts on a screen with a start button, begin with clicking it. Write one test for each requirement that can be seen or done, at most ten, each with a real cause and a real effect. Reply with the lines only.
Example, for a program with a count and a button that adds one:
R2 | click #plus | #count text goes up
R3 | click #plus ; click #plus | #count text contains 2
R4 | press Escape | #menu shows`;

const KEYS: Record<string, string> = { space: " ", spacebar: " ", enter: "Enter", return: "Enter", esc: "Escape", escape: "Escape", left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight", arrowup: "ArrowUp", arrowdown: "ArrowDown" };
const keyOf = (s: string) => KEYS[s.toLowerCase()] ?? (s.length === 1 ? s : null);
const idOf = (s: string) => /#?([\w-]+)/.exec(s.trim())?.[1] ?? "";
const seconds = (n: string, unit?: string) => Math.max(0, Math.min(10000, Math.round(+n * (unit && /^m/i.test(unit) ? 1 : 1000))));

function parseStep(raw: string): ScenarioStep | null {
  const t = raw.trim().replace(/^then\s+/i, "");
  let m = /^(?:press|hit|tap)\s+(?:the\s+)?([\w]+)(?:\s+key)?(?:\s+(\d+)\s*(?:x|times?|fois))?$/i.exec(t);
  if (m) { const key = keyOf(m[1]); return key ? { do: "press", key, times: Math.max(1, Math.min(30, +(m[2] ?? 1))) } : null; }
  m = /^hold\s+(?:the\s+)?([\w]+)(?:\s+key)?(?:\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(ms|s|sec\w*|seconds?)?)?$/i.exec(t);
  if (m) { const key = keyOf(m[1]); return key ? { do: "hold", key, ms: m[2] ? seconds(m[2], m[3]) : 1000 } : null; }
  m = /^click\s+(?:on\s+)?(#[\w-]+)$/i.exec(t);
  if (m) return { do: "click", id: idOf(m[1]) };
  m = /^type\s+(.+?)\s+into\s+(#[\w-]+)$/i.exec(t);
  if (m) return { do: "type", id: idOf(m[2]), value: m[1].replace(/^["']|["']$/g, "") };
  m = /^wait\s+(\d+(?:\.\d+)?)\s*(ms|s|sec\w*|seconds?)?$/i.exec(t);
  if (m) return { do: "wait", ms: seconds(m[1], m[2]) };
  return null;
}

function parseExpect(raw: string): ScenarioExpect | null {
  const t = raw.trim().replace(/\.$/, "");
  if (/^the screen (?:changes|moves|updates)$/i.test(t)) return { kind: "screen" };
  let m = /^(#[\w-]+)\s+moves?\s+(left|right|up|down)(?:ward)?s?$/i.exec(t);
  if (m) return { kind: "moves", id: idOf(m[1]), dir: m[2].toLowerCase() as "left" };
  m = /^(#[\w-]+)\s+changes?$/i.exec(t);
  if (m) return { kind: "changes", id: idOf(m[1]) };
  m = /^(#[\w-]+)\s+(?:shows?|appears?|is shown|is visible)$/i.exec(t);
  if (m) return { kind: "shows", id: idOf(m[1]) };
  m = /^(#[\w-]+)\s+(?:hides?|disappears?|is hidden|is not shown)$/i.exec(t);
  if (m) return { kind: "hides", id: idOf(m[1]) };
  m = /^(#[\w-]+)\s+text\s+(?:contains?|says?|shows?)\s+(.+)$/i.exec(t);
  if (m) return { kind: "contains", id: idOf(m[1]), text: m[2].replace(/^["']|["']$/g, "").trim() };
  m = /^(#[\w-]+)\s+text\s+goes\s+(up|down)$/i.exec(t);
  if (m) return { kind: m[2].toLowerCase() as "up", id: idOf(m[1]) };
  return null;
}

/** The scenes in a reply: the lines it can read, with only the ids the page has. What was left out is reported, one line each. */
export function parseScenarios(reply: string | null, ids: string[]): { scenarios: Scenario[]; notes: string[] } {
  const known = new Set(ids);
  const scenarios: Scenario[] = [], notes: string[] = [];
  const body = (reply ?? "").replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "");
  for (const raw of body.split("\n")) {
    const line = raw.replace(/`/g, "").replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    const m = /^(R\d+(?:\s*,\s*R\d+)*)\s*\|(.+)\|(.+)$/i.exec(line);
    if (!m) continue;
    const steps = m[2].split(/\s*;\s*|\s+then\s+/i).map(parseStep);
    const expect = parseExpect(m[3]);
    if (!expect || steps.some((s) => !s)) { notes.push(`a test was left out, it cannot be played: ${line.slice(0, 100)}`); continue; }
    const used = [...(expect.kind === "screen" ? [] : [expect.id]), ...(steps as ScenarioStep[]).flatMap((s) => (s.do === "click" || s.do === "type" ? [s.id] : []))];
    const missing = used.filter((id) => !known.has(id));
    if (missing.length) { notes.push(`a test was left out, the page has no #${missing[0]}: ${line.slice(0, 100)}`); continue; }
    scenarios.push({ req: m[1].replace(/\s+/g, ""), steps: steps as ScenarioStep[], expect, text: `${m[2].trim()} → ${m[3].trim()}` });
    if (scenarios.length >= 10) break;
  }
  return { scenarios, notes };
}

/** The id the verdict is about. */
export const targetOf = (e: ScenarioExpect): string | null => (e.kind === "screen" ? null : e.id);

const number = (s: string) => { const m = /-?\d+(?:[.,]\d+)?/.exec(s); return m ? parseFloat(m[0].replace(",", ".")) : null; };

/** The verdict on one scene, from what the element was before and after (and whether the screen changed): code decides, with the numbers in the answer. */
export function judge(e: ScenarioExpect, before: Measure | null, after: Measure | null, screenChanged: boolean): { ok: boolean; detail: string } {
  if (e.kind === "screen") return screenChanged ? { ok: true, detail: "the screen changed" } : { ok: false, detail: "the screen did not change at all" };
  if (e.kind === "hides") return !after || !after.shown ? { ok: true, detail: `#${e.id} is hidden` } : { ok: false, detail: `#${e.id} is still shown` };
  if (!after) return { ok: false, detail: `the page has no element #${e.id} after the scene` };
  const pos = (m: Measure) => `(${Math.round(m.x)}, ${Math.round(m.y)})`;
  if (e.kind === "shows") return after.shown ? { ok: true, detail: `#${e.id} is shown` } : { ok: false, detail: `#${e.id} is not shown` };
  if (e.kind === "contains") return after.text.toLowerCase().includes(e.text.toLowerCase()) ? { ok: true, detail: `#${e.id} says "${after.text.slice(0, 40)}"` } : { ok: false, detail: `#${e.id} says "${after.text.slice(0, 60)}", not "${e.text}"` };
  if (!before) return { ok: false, detail: `the page had no element #${e.id} before the scene` };
  const dx = after.x - before.x, dy = after.y - before.y;
  switch (e.kind) {
    case "moves": {
      const d = { right: dx, left: -dx, down: dy, up: -dy }[e.dir];
      return d > 2 ? { ok: true, detail: `#${e.id} moved ${e.dir}: ${pos(before)} → ${pos(after)}` } : { ok: false, detail: `#${e.id} should move ${e.dir} but went ${pos(before)} → ${pos(after)}` };
    }
    case "changes": {
      const same = Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(after.w - before.w) < 1 && Math.abs(after.h - before.h) < 1 && after.text === before.text && after.cls === before.cls && after.shown === before.shown;
      return same ? { ok: false, detail: `#${e.id} did not change at all (${pos(after)}, "${after.text.slice(0, 30)}")` } : { ok: true, detail: `#${e.id} changed` };
    }
    case "up": case "down": {
      const a = number(before.text), b = number(after.text);
      if (a === null || b === null) return { ok: false, detail: `#${e.id} holds no number ("${before.text.slice(0, 30)}" → "${after.text.slice(0, 30)}")` };
      const ok = e.kind === "up" ? b > a : b < a;
      return { ok, detail: `#${e.id} went ${a} → ${b}${ok ? "" : `, it should go ${e.kind}`}` };
    }
    default: return { ok: false, detail: "unknown expectation" };
  }
}
