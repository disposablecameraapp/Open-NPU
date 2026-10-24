import { spawnSync } from "child_process";
import * as os from "os";
import * as vm from "vm";

/** The result of checking one answer: 0 to 1, why, and `skip` when the check could not be run on this PC. */
export interface Check { score: number; note: string; skip?: string }

export const words = (s: string): string[] => s.trim().split(/\s+/).filter(Boolean);
export const norm = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const clamp = (n: number) => Math.max(0, Math.min(1, n));

const FR_WORDS = new Set("le la les de des du un une et est pour que qui vous je nous il elle ce cette dans sur avec pas mais ou au aux en mon ma mes votre vos merci bonjour cordialement suis sont etre avoir tres plus comme bien tout tous a y ai ete fait c'est j'ai d'un l'on".split(" "));
const EN_WORDS = new Set("the and is are of to a an in on for with that this you we it be have has not but or as at by from your our thank dear regards best i my was were will would can".split(" "));
/** Share of French among the French and English function words found: 1 = French, 0 = English. */
export function frenchShare(s: string): number {
  let fr = 0, en = 0;
  for (const w of norm(s).split(/[^a-z']+/)) {
    if (FR_WORDS.has(w)) fr++;
    if (EN_WORDS.has(w)) en++;
  }
  return fr + en === 0 ? 0.5 : fr / (fr + en);
}

/** The code of an answer: the first fenced block, or the whole text. */
export function codeOf(answer: string): string {
  const m = /```[\w+-]*\n([\s\S]*?)```/.exec(answer);
  if (m) return m[1];
  const open = /```[\w+-]*\n([\s\S]*)$/.exec(answer);
  return (open ? open[1] : answer).trim();
}

/** A JSON value in an answer: the whole text, a fenced block, or the first {...} / [...] found. */
export function jsonOf(answer: string): { value: unknown; clean: boolean } | null {
  const text = answer.trim();
  const tries: { s: string; clean: boolean }[] = [{ s: text, clean: true }];
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(text);
  if (fence) tries.push({ s: fence[1].trim(), clean: text.replace(fence[0], "").trim().length < 20 });
  const a = text.search(/[{[]/);
  const b = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (a >= 0 && b > a) tries.push({ s: text.slice(a, b + 1), clean: false });
  for (const t of tries) { try { return { value: JSON.parse(t.s), clean: t.clean }; } catch { /* next */ } }
  return null;
}

/** The last number in a text ("The answer is 8." gives 8). */
export function lastNumber(s: string): number | null {
  const m = s.replace(/(\d),(\d{3})/g, "$1$2").match(/-?\d+(?:\.\d+)?/g);
  return m ? parseFloat(m[m.length - 1]) : null;
}

/** Weighted yes/no checks: the score is the weight of those that hold. */
export function points(list: [boolean, number, string][]): Check {
  const total = list.reduce((a, [, w]) => a + w, 0);
  const got = list.reduce((a, [ok, w]) => a + (ok ? w : 0), 0);
  const missed = list.filter(([ok]) => !ok).map(([, , n]) => n);
  return { score: clamp(got / total), note: missed.length ? `missing: ${missed.join(", ")}` : "all good" };
}

export const exact = (ok: boolean, good: string, bad: string): Check => (ok ? { score: 1, note: good } : { score: 0, note: bad });

// ------------------------------------------------------------------ running what the model wrote

/** JavaScript the model wrote, made runnable in a bare context: no export / module syntax. */
const plainJs = (code: string) => code.replace(/^\s*export\s+default\s+/gm, "").replace(/^\s*export\s+/gm, "").replace(/^\s*module\.exports[^\n]*$/gm, "");

/** Runs a JavaScript function the model wrote against cases, in a bare context with a time limit. Each case is [expression, expected]. */
export function runCases(code: string, cases: [string, unknown][]): { passed: number; total: number; error?: string } {
  let passed = 0;
  let error: string | undefined;
  const src = plainJs(code);
  for (const [expr, want] of cases) {
    try {
      const ctx = vm.createContext({});
      vm.runInContext(src, ctx, { timeout: 1000 });
      const got = vm.runInContext(`JSON.stringify(${expr})`, ctx, { timeout: 1000 });
      if (got === JSON.stringify(want)) passed++;
    } catch (e) {
      error = (e as Error).message.slice(0, 120);
      if (/timed out/i.test(error)) break; // a loop that never ends: the other cases would only wait as long
    }
  }
  return { passed, total: cases.length, error };
}

export function jsCheck(answer: string, cases: [string, unknown][]): Check {
  const r = runCases(codeOf(answer), cases);
  return { score: r.total ? r.passed / r.total : 0, note: `${r.passed}/${r.total} cases pass${r.error ? ` (${r.error})` : ""}` };
}

let pythonCache: string | null | undefined;
/** The Python program of this PC, found once. */
export function findPython(): string | null {
  if (pythonCache !== undefined) return pythonCache;
  for (const cmd of process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"]) {
    try { if (spawnSync(cmd, ["--version"], { timeout: 5000, windowsHide: true }).status === 0) return (pythonCache = cmd); } catch { /* next */ }
  }
  return (pythonCache = null);
}

/** Code that touches the system is not run: a benchmark must not let a model's code loose on the PC. */
const SYSTEM_ACCESS = /\b(import\s+(os|subprocess|shutil|socket|requests|urllib|pathlib|ctypes|http|ftplib|smtplib)\b|from\s+(os|subprocess|shutil|socket|pathlib|ctypes|urllib|http)\b)|__import__|\bopen\s*\(|\b(eval|exec|compile)\s*\(|\binput\s*\(/;

/** Runs Python the model wrote against cases (one process for all of them). Each case is [expression, expected], compared as JSON. */
export function pythonCheck(answer: string, cases: [string, unknown][]): Check {
  const code = codeOf(answer);
  if (SYSTEM_ACCESS.test(code)) return { score: 0, note: "uses system access or input(), not run" };
  const py = findPython();
  if (!py) return { score: 0, note: "", skip: "Python is not installed on this PC" };
  const script = [
    code, "", "import json as __j",
    ...cases.map(([expr]) => `try:\n    print(__j.dumps(${expr}))\nexcept Exception as __e:\n    print("ERR " + type(__e).__name__)`)
  ].join("\n");
  const r = spawnSync(py, py === "py" ? ["-3", "-I", "-c", script] : ["-I", "-c", script], { timeout: 8000, cwd: os.tmpdir(), encoding: "utf8", windowsHide: true, maxBuffer: 1 << 20 });
  if (r.error) return { score: 0, note: `could not run: ${r.error.message.slice(0, 80)}` };
  const lines = (r.stdout ?? "").split(/\r?\n/);
  let passed = 0;
  cases.forEach(([, want], i) => { try { if (JSON.stringify(JSON.parse(lines[i] ?? "")) === JSON.stringify(want)) passed++; } catch { /* wrong or error */ } });
  const err = (r.stderr ?? "").trim().split("\n").pop()?.slice(0, 100);
  return { score: passed / cases.length, note: `${passed}/${cases.length} cases pass${passed < cases.length && err ? ` (${err})` : ""}` };
}

/** The regular expression an answer proposes: /.../flags, or the text of the first code span / block. */
export function regexOf(answer: string): RegExp | null {
  const lit = /\/((?:\\.|[^/\n\\])+)\/([gimsuy]*)/.exec(answer.replace(/```[\w]*\n?/g, ""));
  const raw = lit ? { src: lit[1], flags: lit[2] } : (() => { const c = /`([^`\n]+)`/.exec(answer); return c ? { src: c[1], flags: "" } : null; })();
  if (!raw) return null;
  try { return new RegExp(raw.src, raw.flags.replace(/g/g, "")); } catch { return null; }
}

// ------------------------------------------------------------------ static checks for markup

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr", "!doctype"]);
/** Every opened tag is closed in the right order (void tags excepted). */
export function htmlBalanced(html: string): boolean {
  const stack: string[] = [];
  const clean = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "<$1></$1>");
  for (const m of clean.matchAll(/<(\/?)([a-zA-Z][\w-]*|!doctype)[^>]*?(\/?)>/g)) {
    const [, close, tag0, self] = m;
    const tag = tag0.toLowerCase();
    if (VOID.has(tag) || self) continue;
    if (!close) stack.push(tag);
    else if (stack.pop() !== tag) return false;
  }
  return stack.length === 0;
}

/** Braces match and every declaration inside a rule ends with a semicolon or the closing brace. */
export function cssWellFormed(css: string): boolean {
  const c = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  for (const ch of c) { if (ch === "{") depth++; else if (ch === "}") depth--; if (depth < 0) return false; }
  return depth === 0 && /[^{}]+\{[^{}]*:[^{}]*\}/.test(c);
}

/** Does the script in an HTML page parse? */
export function pageScriptParses(html: string): boolean | null {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  if (!scripts.trim()) return null;
  try { new vm.Script(scripts); return true; } catch { return false; }
}
