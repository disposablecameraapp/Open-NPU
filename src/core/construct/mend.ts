/**
 * A name the model invented that stands for one that exists: `temps` where the state has `heure`, `checkCollision` for `checkCollisions`,
 * `p.width` where the items hold `w`. The closest name is found by code (spelling, the words a name is made of, a short table of words that
 * mean the same in French and English) and the code is rewritten; when no single name is clearly the one, nothing is touched and the
 * model is asked, with the names that exist.
 */
import { parse } from "acorn";
import { editDistance, plainWord, slack } from "../fuzzy";
import { declaredIn } from "./bind";

type Node = { type: string; start: number; end: number; [key: string]: any };
export interface Edit { start: number; end: number; text: string }

/** Words that mean the same thing in a program, French and English; each line is one idea. */
const SAME: string[][] = [
  ["time", "timer", "temps", "heure", "horloge", "clock", "chrono", "countdown", "duree", "duration", "timeleft", "remaining"],
  ["score", "points", "point", "pts", "punkte", "result", "resultat"],
  ["life", "lives", "vie", "vies", "hp", "health", "sante", "pv", "heart", "hearts", "coeur"],
  ["width", "w", "largeur", "larg"],
  ["height", "h", "hauteur", "haut"],
  ["speed", "vitesse", "velocity", "vel", "v", "vit"],
  ["coin", "coins", "piece", "pieces", "money", "argent", "gold", "or"],
  ["enemy", "enemies", "ennemi", "ennemis", "monster", "monstre", "foe", "badguy", "mob", "mobs"],
  ["player", "joueur", "hero", "heros", "avatar", "character", "personnage"],
  ["level", "niveau", "stage", "map", "carte", "world", "monde"],
  ["platform", "platforms", "plateforme", "plateformes", "ledge"],
  ["brick", "bricks", "brique", "briques", "block", "blocks", "bloc", "blocs"],
  ["pipe", "pipes", "tuyau", "tuyaux"],
  ["hole", "holes", "trou", "trous", "pit", "gap", "abyss"],
  ["flag", "drapeau", "goal", "but", "finish", "arrivee", "end"],
  ["jump", "saut", "sauter", "jumping", "hop"],
  ["gravity", "gravite", "g"],
  ["friction", "frottement", "drag"],
  ["key", "keys", "touche", "touches", "input", "inputs", "controls", "controles"],
  ["left", "gauche"], ["right", "droite"], ["up", "haut", "dessus"], ["down", "bas", "dessous"],
  ["mode", "state", "etat", "status", "phase", "screen", "ecran", "scene"],
  ["message", "msg", "texte", "text", "label", "libelle"],
  ["count", "compteur", "counter", "nombre", "number", "total", "qty", "quantite"],
  ["color", "colour", "couleur", "fill", "couleurs"],
  ["size", "taille", "dimension", "dimensions"],
  ["name", "nom", "title", "titre"],
  ["x", "posx", "px", "abscisse"], ["y", "posy", "py", "ordonnee"],
  ["alive", "vivant", "active", "actif", "live"],
  ["board", "grid", "grille", "plateau", "tableau", "field", "terrain"],
  ["piece", "tetromino", "shape", "forme", "bloc"],
  ["camera", "cam", "scroll", "defilement", "offset", "decalage"]
];

/** The words a name is made of: `timeLeft` and `time_left` are `time`, `left`. A trailing s is dropped. */
export function wordsOf(name: string): string[] {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-$]+/g, " ").split(/\s+/).map(plainWord).filter(Boolean).map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

const GENERIC = new Set(["is", "get", "set", "has", "the", "new", "old", "my", "on", "do", "can"]);
const conceptsOf = (words: string[], whole: string): Set<number> => {
  const out = new Set<number>();
  SAME.forEach((g, i) => { if (g.includes(whole) || words.some((w) => g.includes(w) || g.includes(`${w}s`))) out.add(i); });
  return out;
};

/** How well a candidate stands for a word, 0 to 1; 0 when it does not. */
export function resemblance(word: string, cand: string): number {
  const a = plainWord(word), b = plainWord(cand);
  if (!a || !b || a === b) return 0;
  const d = editDistance(a, b);
  if (d <= slack(Math.max(a.length, b.length))) return 0.95 - d * 0.05;
  const wa = wordsOf(word).filter((w) => !GENERIC.has(w)), wb = wordsOf(cand).filter((w) => !GENERIC.has(w));
  const shared = wa.filter((w) => wb.includes(w));
  // `timeLeft` and `time`: the name is the other with a word more or less
  if (shared.length && (shared.length === wa.length || shared.length === wb.length)) return 0.85;
  const ca = conceptsOf(wa, a), cb = conceptsOf(wb, b);
  const common = [...ca].filter((c) => cb.has(c)).length;
  if (common && (wa.length <= 2 || wb.length <= 2)) return wa.length === 1 && wb.length === 1 ? 0.8 : 0.72;
  return 0;
}

/** The one candidate that clearly stands for the word, else null. */
export function closestName(word: string, candidates: readonly string[]): string | null {
  const scored = [...new Set(candidates)].map((c) => ({ c, s: resemblance(word, c) })).filter((x) => x.s >= 0.7).sort((x, y) => y.s - x.s);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[1].s > scored[0].s - 0.08) return null; // two as likely: left to the model, who sees the names
  return scored[0].c;
}

const GLOBALS = new Set(["undefined", "NaN", "Infinity", "arguments", "this", "Math", "JSON", "Object", "Array", "String", "Number", "Boolean", "Date", "Map", "Set", "WeakMap", "WeakSet", "RegExp", "Error", "TypeError", "Promise", "Symbol", "parseInt", "parseFloat", "isNaN", "isFinite", "document", "window", "console", "localStorage", "sessionStorage", "navigator", "performance", "location", "history", "Audio", "Image", "alert", "confirm", "prompt", "fetch", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "AudioContext", "Float32Array", "Uint8Array", "Int32Array", "globalThis", "self", "S", "e", "event", "ev"]);

/**
 * The free names of a unit (used and declared nowhere) that stand for a function of the program or a key of the state, rewritten:
 * a call becomes the function it means, a variable becomes `S.key` (or the local name it means).
 */
export function mendFree(code: string, o: { fns: string[]; keys: string[]; names: string[] }): { code: string; renamed: string[] } {
  let ast: Node;
  try { ast = parse(code, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true }) as unknown as Node; } catch { return { code, renamed: [] }; }
  const known = new Set([...GLOBALS, ...o.names]);
  const refs: { n: Node; call: boolean; short: boolean; scopes: Set<string>[] }[] = [];
  const visit = (n: Node | null | undefined, parent: Node | null, scopes: Set<string>[]): void => {
    if (!n || typeof n.type !== "string") return;
    switch (n.type) {
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": visit(n.body, n, [...scopes, declaredIn(n)]); return;
      case "VariableDeclarator": visit(n.init, n, scopes); return;
      case "MemberExpression": visit(n.object, n, scopes); if (n.computed) visit(n.property, n, scopes); return;
      case "Property": if (parent?.type === "ObjectPattern") return; if (n.computed) visit(n.key, n, scopes); if (n.shorthand && n.value.type === "Identifier") { refs.push({ n: n.value, call: false, short: true, scopes }); return; } visit(n.value, n, scopes); return;
      case "MethodDefinition": case "PropertyDefinition": if (n.computed) visit(n.key, n, scopes); visit(n.value, n, scopes); return;
      case "CatchClause": { const s = new Set<string>(); if (n.param?.type === "Identifier") s.add(n.param.name); visit(n.body, n, [...scopes, s]); return; }
      case "LabeledStatement": visit(n.body, n, scopes); return;
      case "BreakStatement": case "ContinueStatement": case "ObjectPattern": case "ArrayPattern": return;
      case "Identifier": refs.push({ n, call: parent?.type === "CallExpression" && parent.callee === n, short: false, scopes }); return;
    }
    for (const k of Object.keys(n)) {
      if (k === "type" || k === "start" || k === "end") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && typeof (c as Node).type === "string" && visit(c as Node, n, scopes));
      else if (v && typeof v === "object" && typeof (v as Node).type === "string") visit(v as Node, n, scopes);
    }
  };
  visit(ast, null, [declaredIn({ type: "Program", params: [], body: ast, start: 0, end: code.length } as Node)]);
  const edits: Edit[] = [], renamed: string[] = [];
  const answer = new Map<string, string | null>();
  for (const r of refs) {
    const name = r.n.name as string;
    if (known.has(name) || r.scopes.some((s) => s.has(name))) continue;
    const local = [...new Set(r.scopes.flatMap((s) => [...s]))];
    const key = `${r.call ? "c" : "v"}:${name}:${local.length}`;
    if (!answer.has(key)) {
      if (r.call) answer.set(key, closestName(name, o.fns));
      else { const pick = closestName(name, [...local, ...o.keys]); answer.set(key, pick ? (local.includes(pick) ? pick : `S.${pick}`) : null); }
    }
    const to = answer.get(key);
    if (!to) continue;
    edits.push({ start: r.n.start, end: r.n.end, text: r.short ? `${name}: ${to}` : to });
    if (!renamed.includes(`${name} → ${to}`)) renamed.push(`${name} → ${to}`);
  }
  let out = code;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { code: out, renamed };
}
