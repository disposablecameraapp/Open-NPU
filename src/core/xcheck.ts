/* Static checker of a page of blocks (src/core/xblocks). It reads the HTML as text, with a small tag reader:
 * no DOM and no browser. Effects and conditions are read the way xblocks/core.js reads them (the same
 * patterns and the same loops), so a page that core accepts is never refused here for its syntax. */

export interface XTagSpec { attrs: string[]; children?: string[] }

/** The blocks of FICHES.md. "*" means every attribute is a state name. `children` lists the blocks
 * that must sit inside this one (a tag is "inside" when it is the nearest block above it). */
export const X_TAGS: Record<string, XTagSpec> = {
  state: { attrs: ["*", "save"] },
  value: { attrs: ["of"] },
  list: { attrs: ["of"] },
  rule: { attrs: ["on", "when", "do", "say"] },
  flag: { attrs: ["name", "when"] },
  scene: { attrs: ["id"] },
  log: { attrs: [] },
  map: { attrs: ["tile", "view", "name"], children: ["legend"] },
  platformer: { attrs: ["tile", "view", "gravity", "jump", "speed", "run", "fall"], children: ["legend"] },
  legend: { attrs: [] },
  battle: { attrs: ["id", "on-win", "on-lose", "on-flee"], children: ["fighter", "type"] },
  fighter: { attrs: ["side", "name", "hp", "attack", "defense", "speed", "type", "sprite"], children: ["move"] },
  move: { attrs: ["name", "power", "type", "uses", "effect"] },
  type: { attrs: ["name", "strong", "weak"] },
  dialog: { attrs: ["id", "speed"], children: ["line"] },
  line: { attrs: ["who", "when", "do", "id", "next", "ask"], children: ["choice"] },
  choice: { attrs: ["do", "goto"] },
  timer: { attrs: ["every", "do", "while", "times", "after", "start"] },
  clock: { attrs: ["of", "format"] },
  calc: { attrs: ["name", "value"] },
};

const GLOBAL_ATTRS = ["id", "class", "style", "hidden", "title", "when"];
const STATE_SKIP = ["save", "id", "class", "style"];
const REQUIRED: Record<string, string[]> = {
  value: ["of"], list: ["of"], clock: ["of"], flag: ["name"], scene: ["id"], battle: ["id"], dialog: ["id"],
  fighter: ["side", "name"], move: ["name"], type: ["name"], timer: ["do"], calc: ["name", "value"],
};
const NUMERIC: Record<string, string[]> = {
  map: ["tile"], platformer: ["tile", "gravity", "jump", "speed", "run"], fighter: ["hp", "attack", "defense", "speed"],
  move: ["power", "uses"], dialog: ["speed"], timer: ["times"],
};
const MAP_ROLES = ["wall", "floor", "player", "item", "enemy", "door", "exit", "npc", "trap", "switch", "warp"];
const PLATFORMER_ROLES = ["ground", "brick", "block", "platform", "player", "coin", "walker", "flyer", "spike", "flag", "spring"];
const ACTIONS = new Set(["say", "go", "emit", "toggle", "add", "remove"]);
const BARE = new Set(["restart", "win", "lose"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const ENT: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " " };
const DURATION = /^\d+(\.\d+)?\s*(ms|s|m)?$/;

const TAG = /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>=`]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+)))?/g;
/* core.js: the effect search (a name is required, so unreadable text is skipped and reported here) */
const EFFECT = /\s*(?:([A-Za-z_][\w.]*)\s*(?::\s*([^\s;{]+\s*\{[^}]*\}|\{[^}]*\}|"[^"]*"|'[^']*'|[^\s;]+)|(\+\+|--)|(\+=|-=|=|\+|-)\s*("[^"]*"|'[^']*'|-?[^\s;]+))?)\s*;?/g;
/* core.js: the condition tokens */
const COND = /\s*(&&|\|\||==|!=|>=|<=|>|<|!|\(|\)|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*'|[A-Za-z_][\w.]*)/g;
const COND_CMP = /^(==|!=|>=|<=|>|<)$/;
/* calc.js (planned block): arithmetic, functions of lists */
const CALC = /\s*(\d+(?:\.\d+)?|"[^"]*"|'[^']*'|[A-Za-z_][\w.]*|==|!=|>=|<=|>|<|[-+*\/%(),])/g;
const CALC_FN: Record<string, [number, number]> = { min: [1, 99], max: [1, 99], round: [1, 1], floor: [1, 1], ceil: [1, 1], abs: [1, 1], count: [1, 2], sum: [2, 2] };

interface El { tag: string; attrs: Map<string, string>; kids: Array<El | string>; parent: El | null }
interface Eff { kind: "op" | "action" | "bare"; name: string; op?: string; arg?: string }
interface Scan { effs: Eff[]; problems: string[] }
interface Legend { char: string; role: string; effs: Eff[]; needs?: string; to?: string; as?: string; still: boolean }

const decode = (s: string): string => s.replace(/&(lt|gt|amp|quot|apos|nbsp|#39);/g, (e) => ENT[e] ?? e);
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isBlockTag = (tag: string): boolean => /^(?:x|game)-/.test(tag);
const prefixOf = (tag: string): string => /^(?:x|game)-/.exec(tag)?.[0] ?? "x-";
const baseOf = (tag: string): string | null => {
  const m = /^(?:x|game)-(.+)$/.exec(tag);
  return m && Object.prototype.hasOwnProperty.call(X_TAGS, m[1]) ? m[1] : null;
};
const val = (el: El, name: string): string => el.attrs.get(name) ?? "";
const kidsEls = (el: El): El[] => el.kids.filter((k): k is El => typeof k !== "string");
function descendants(el: El): El[] {
  const out: El[] = [];
  for (const k of kidsEls(el)) out.push(k, ...descendants(k));
  return out;
}
function textOf(el: El): string {
  return el.kids.map((k) => (typeof k === "string" ? decode(k) : k.tag === "br" ? "\n" : textOf(k))).join("");
}
function nearestBlock(el: El): { el: El; base: string } | null {
  for (let p = el.parent; p && p.tag !== "#root"; p = p.parent) {
    const base = baseOf(p.tag);
    if (base) return { el: p, base };
  }
  return null;
}
function effectAttrOf(base: string | null, name: string): boolean {
  if (name === "data-click" || name === "data-submit" || name === "data-key") return true;
  if (base === "rule" || base === "line" || base === "choice" || base === "timer") return name === "do";
  if (base === "move") return name === "effect";
  if (base === "battle") return /^on-(win|lose|flee)$/.test(name);
  if (base === "platformer") return name === "fall";
  return false;
}

function attrsOf(s: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = new RegExp(ATTR.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const k = m[1].toLowerCase();
    if (!out.has(k)) out.set(k, decode(m[2] ?? m[3] ?? m[4] ?? ""));
  }
  return out;
}

/** Reads the tags of a page into a tree. Comments are dropped; script and style keep their text raw. */
function parse(html: string): El {
  const root: El = { tag: "#root", attrs: new Map(), kids: [], parent: null };
  const src = html.replace(/<!--[\s\S]*?-->/g, "");
  const lower = src.toLowerCase();
  const re = new RegExp(TAG.source, "g");
  let cur = root, last = 0, m: RegExpExecArray | null;
  const text = (end: number) => {
    const t = src.slice(last, end);
    if (t) cur.kids.push(t);
  };
  while ((m = re.exec(src))) {
    text(m.index);
    last = re.lastIndex;
    const tag = m[2].toLowerCase();
    if (m[1] === "/") {
      let k: El | null = cur;
      while (k && k !== root && k.tag !== tag) k = k.parent;
      if (k && k !== root) cur = k.parent ?? root;
      continue;
    }
    const el: El = { tag, attrs: attrsOf(m[3]), kids: [], parent: cur };
    cur.kids.push(el);
    if (tag === "script" || tag === "style") {
      const close = lower.indexOf("</" + tag, last);
      const end = close < 0 ? src.length : close;
      if (end > last) el.kids.push(src.slice(last, end));
      last = close < 0 ? src.length : src.indexOf(">", close) + 1 || src.length;
      re.lastIndex = last;
      continue;
    }
    if (m[4] !== "/" && !VOID.has(tag)) cur = el;
  }
  text(src.length);
  return root;
}

function lev(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** The one name at distance 1 or 2 from `word` (no tie), or null. */
function nearest(word: string, names: string[]): string | null {
  let best: string | null = null, bestD = 3, tie = false;
  for (const n of names) {
    const d = lev(word, n);
    if (d < bestD) { best = n; bestD = d; tie = false; } else if (d === bestD && n !== best) tie = true;
  }
  return best && !tie && bestD <= 2 ? best : null;
}

/** Effects, read as core.js X.run reads them: the search skips text it cannot read, and the skipped text is reported. */
function scanEffects(raw: string): Scan {
  const s = raw.replace(/\{([A-Za-z_][\w.]*)\}/g, "0"); // X.fill: a placeholder reads as one value
  const effs: Eff[] = [], problems: string[] = [];
  const re = new RegExp(EFFECT.source, "g");
  let end = 0, guard = 0, m: RegExpExecArray | null;
  const gap = (t: string) => { if (t.replace(/[\s;]/g, "")) problems.push(`cannot read the effect "${t.trim()}"`); };
  while (re.lastIndex < s.length && guard++ < 100 && (m = re.exec(s)) && m[0].length) {
    gap(s.slice(end, m.index));
    end = re.lastIndex;
    const name = m[1];
    if (m[2] != null && ACTIONS.has(name)) {
      effs.push({ kind: "action", name, arg: m[2] });
      if (name === "remove") {
        // the index of remove is written after the list name; core does not read it, the checker accepts it
        const idx = /^\s*-?\d+\s*;?/.exec(s.slice(end));
        if (idx) { end += idx[0].length; re.lastIndex = end; }
      }
    } else if (m[3]) effs.push({ kind: "op", name, op: m[3] });
    else if (m[4]) effs.push({ kind: "op", name, op: m[4], arg: m[5] });
    else if (BARE.has(name)) effs.push({ kind: "bare", name });
    else if (/^\s*(\+=|-=|=|\+|-)/.test(m[0].trimStart().slice(name.length))) problems.push(`effect "${name}" has an operator but no value`);
    else problems.push(`unknown effect "${name}" (write ${name}+=1, ${name}=value, ${name}++, or an action such as say:"text")`);
  }
  gap(s.slice(end));
  return { effs, problems };
}

/** Why core.js X.test could not read a condition, or null. Empty means "always true", as in core. */
function condProblem(src: string): string | null {
  if (!src.trim()) return null;
  const t: string[] = [];
  const re = new RegExp(COND.source, "g");
  let m: RegExpExecArray | null, last = 0;
  while ((m = re.exec(src)) && m.index === last) { t.push(m[1]); last = re.lastIndex; }
  if (!(last === src.replace(/\s+$/, "").length || /^\s*$/.test(src.slice(last)))) {
    return /(^|[^=!<>])=([^=]|$)/.test(src) ? "use == to compare" : "unreadable characters";
  }
  let i = 0, err = "";
  const fail = (why: string) => { if (!err) err = why; };
  const operand = (): boolean => {
    const k = t[i];
    if (k === undefined) { fail("the condition ends early"); return false; }
    if (k === "&&" || k === "||" || k === ")" || k === "(" || k === "!" || COND_CMP.test(k)) { fail(`a value is missing before "${k}"`); return false; }
    i++;
    return true;
  };
  const atom = (): void => {
    const k = t[i];
    if (k === "!") { i++; atom(); return; }
    if (k === "(") { i++; orE(); if (t[i] === ")") i++; else fail("a ( has no )"); return; }
    if (!operand()) return;
    if (t[i] !== undefined && COND_CMP.test(t[i])) { i++; operand(); }
  };
  const andE = (): void => { atom(); while (t[i] === "&&") { i++; atom(); } };
  const orE = (): void => { andE(); while (t[i] === "||") { i++; andE(); } };
  orE();
  if (!err && i < t.length) fail(`cannot read after "${t[i]}"`);
  return err || null;
}

/** Why a calc value cannot be read, or null. */
function calcProblem(src: string): string | null {
  const t: string[] = [];
  const re = new RegExp(CALC.source, "g");
  let m: RegExpExecArray | null, last = 0;
  while ((m = re.exec(src)) && m.index === last) { t.push(m[1]); last = re.lastIndex; }
  if (!/^\s*$/.test(src.slice(last))) return "unreadable characters";
  if (!t.length) return "the value is empty";
  let i = 0, err = "";
  const fail = (why: string) => { if (!err) err = why; };
  const expr = (): void => { term(); while (t[i] === "+" || t[i] === "-") { i++; term(); } };
  const term = (): void => { unary(); while (t[i] === "*" || t[i] === "/" || t[i] === "%") { i++; unary(); } };
  const unary = (): void => { if (t[i] === "-" || t[i] === "+") { i++; unary(); } else primary(); };
  const arg = (): void => {
    const k = t[i], c = t[i + 1];
    if (k !== undefined && /^[A-Za-z_]/.test(k) && c !== undefined && COND_CMP.test(c)) {
      i += 2;
      if (t[i] === "-") i++;
      const v = t[i];
      if (v !== undefined && /^(\d|"|'|[A-Za-z_])/.test(v)) i++;
      else fail(`a value is missing after "${c}"`);
      return;
    }
    expr();
  };
  const primary = (): void => {
    const k = t[i];
    if (k === undefined) { fail("the value ends early"); return; }
    if (k === "(") { i++; expr(); if (t[i] === ")") i++; else fail("a ( has no )"); return; }
    if (/^\d/.test(k)) { i++; return; }
    if (/^[A-Za-z_]/.test(k)) {
      i++;
      if (t[i] !== "(") return;
      const spec = CALC_FN[k];
      if (!spec) fail(`unknown function "${k}" (min, max, round, floor, ceil, abs, count, sum)`);
      i++;
      let n = 0;
      if (t[i] !== ")") for (;;) { arg(); n++; if (t[i] === ",") { i++; continue; } break; }
      if (t[i] === ")") i++; else fail(`a ${k}( has no )`);
      if (spec && (n < spec[0] || n > spec[1])) fail(`${k} takes ${spec[0] === spec[1] ? spec[0] : `${spec[0]} to ${spec[1]}`} argument(s), not ${n}`);
      return;
    }
    fail(`"${k}" is not a value`);
  };
  expr();
  if (!err && i < t.length) fail(`cannot read after "${t[i]}"`);
  return err || null;
}

/** "gold + 1" becomes "gold+=1" outside quotes: the form core reads without doubt. */
function spacedEffects(s: string): string {
  return s.split(/("[^"]*"|'[^']*')/).map((part, i) => (i % 2 ? part : part.replace(/([A-Za-z_][\w.]*)(\s+[+-]\s*|\s*[+-]\s+)(\d+(?:\.\d+)?)(?![\w.])/g, (_all, name: string, op: string, num: string) => `${name}${op.trim()}=${num}`))).join("");
}

const isEffectToken = (tok: string): boolean =>
  /^[A-Za-z_][\w.]*(\+=|-=|=|\+\+|--|[+-]\d)/.test(tok) || /^(say|go|emit|toggle|add|remove):/.test(tok) || BARE.has(tok);

/** The legend of a map or a level: one line "<character> <role> [look] [effects] [needs:..] [to:..] [as:..] [still] ["words"]". */
function legendOf(text: string, roles: string[], problems: string[]): Legend[] {
  const out: Legend[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = /^(\S)\s+(\S+)\s*(.*)$/.exec(line);
    if (!head) { problems.push(`legend line "${line}" is not "<character> <role>" (for example "# wall")`); continue; }
    const [, char, role, rest] = head;
    const code = char.charCodeAt(0);
    if (code < 33 || code > 126) problems.push(`legend character "${char}" is not printable ASCII: a map character is one ASCII character`);
    if (!roles.includes(role)) {
      const near = nearest(role, roles);
      problems.push(`"${role}" is not a role here for "${char}"${near ? `: did you mean "${near}"?` : ` (roles: ${roles.join(", ")})`}`);
    }
    const item: Legend = { char, role, effs: [], still: false };
    const toks = spacedEffects(rest).match(/(?:[^\s"']|"[^"]*"|'[^']*')+/g) ?? [];
    for (const tok of toks) {
      if (tok.startsWith("needs:")) item.needs = tok.slice(6);
      else if (tok.startsWith("to:")) item.to = tok.slice(3);
      else if (tok.startsWith("as:")) item.as = tok.slice(3);
      else if (tok === "still") item.still = true;
      else if (/^["']/.test(tok) || !isEffectToken(tok)) continue; // words, a colour, a picture
      else {
        const sc = scanEffects(tok);
        item.effs.push(...sc.effs);
        problems.push(...sc.problems.map((p) => `legend "${char}": ${p}`));
      }
    }
    out.push(item);
  }
  return out;
}

/** The rows of a map: the lines that are not blank, without the common indentation nor the trailing spaces. */
function cellsOf(text: string): string[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\t/g, "    ")).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const cut = Math.min(...lines.map((l) => l.length - l.trimStart().length));
  return lines.map((l) => l.slice(cut).replace(/\s+$/, ""));
}

/** The text of a map, without its legend. */
function mapText(e: El): string {
  return e.kids
    .filter((k) => typeof k === "string" || baseOf(k.tag) !== "legend")
    .map((k) => (typeof k === "string" ? decode(k) : k.tag === "br" ? "\n" : textOf(k)))
    .join("");
}

function gridFlaws(tag: string, cells: string[], items: Legend[], isMap: boolean, add: (s: string) => void): void {
  if (!cells.length) { add(`<${tag}> has no map rows: write the map as text under the legend`); return; }
  const width = Math.max(...cells.map((r) => r.length));
  const short = cells.map((r, i) => [i, r.length] as const).filter(([, n]) => n !== width);
  if (short.length) add(`${short.length} row(s) of the map in <${tag}> are not ${width} characters wide (row ${short[0][0] + 1} is ${short[0][1]}): pad them with spaces`);
  cells.forEach((r, y) => {
    const odd = /[^\x20-\x7e]/.exec(r);
    if (odd) add(`Row ${y + 1} of the map has the character "${odd[0]}": map rows take printable ASCII only, show the picture in the legend`);
  });
  const by = new Map(items.map((i) => [i.char, i] as const));
  const all = Array.from(cells.join(""));
  const unknown = [...new Set(all.filter((c) => c !== " " && c !== "." && !by.has(c) && /^[\x20-\x7e]$/.test(c)))];
  if (unknown.length) add(`These map characters are not in the legend: ${unknown.map((c) => `"${c}"`).join(" ")}. Add a line for each, or use "." for floor.`);
  const count = (role: string) => all.filter((c) => by.get(c)?.role === role).length;
  if (count("player") !== 1) add(`The ${isMap ? "map" : "level"} needs exactly one player character, it has ${count("player")}.`);
  if (isMap) {
    if (!count("wall") && cells.length > 3) add("The map has no wall: the player would walk through everything.");
  } else {
    if (!count("flag")) add("The level has no flag: nothing can be reached.");
    if (!count("ground") && !count("brick") && !count("platform")) add("The level has no ground: the player would fall forever.");
  }
}

/** Can the exit be reached? Walls and npcs block, a door opens for a simple state that a reachable object gives. */
function exitFlaws(cells: string[], items: Legend[], startHave: Set<string>): string[] {
  const by = new Map(items.map((i) => [i.char, i] as const));
  const H = cells.length, W = Math.max(0, ...cells.map((r) => r.length));
  const charAt = (x: number, y: number): string => cells[y]?.[x] ?? " ";
  const roleAt = (x: number, y: number): string => {
    const c = charAt(x, y);
    return c === " " || c === "." ? "floor" : by.get(c)?.role ?? "floor";
  };
  const simple = (s?: string): s is string => !!s && /^[A-Za-z_]\w*$/.test(s);
  const key = (x: number, y: number) => `${x},${y}`;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const blocked = (x: number, y: number, have: Set<string>, open: boolean): boolean => {
    const role = roleAt(x, y);
    if (role === "wall" || role === "npc") return true;
    if (role === "door" && !open) {
      const need = by.get(charAt(x, y))?.needs;
      if (simple(need)) return !have.has(need);
    }
    return false;
  };
  const reach = (start: [number, number], have: Set<string>, open: boolean): Set<string> => {
    const seen = new Set<string>([key(start[0], start[1])]);
    const queue: [number, number][] = [start];
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny) || seen.has(key(nx, ny)) || blocked(nx, ny, have, open)) continue;
        seen.add(key(nx, ny));
        queue.push([nx, ny]);
      }
    }
    return seen;
  };
  let player: [number, number] | null = null;
  const exits: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!player && roleAt(x, y) === "player") player = [x, y];
    if (roleAt(x, y) === "exit") exits.push([x, y]);
  }
  if (!player || !exits.length) return [];
  const start = player;
  if (!exits.some(([x, y]) => reach(start, new Set(), true).has(key(x, y)))) return ["The exit cannot be reached: walls block every way to it."];
  const giveOf = (c: string): string[] =>
    (by.get(c)?.effs ?? []).filter((e) => e.kind === "op" && e.op !== undefined && !e.op.startsWith("-")).map((e) => e.name.split(".")[0]);
  let have = new Set(startHave);
  let seen = reach(start, have, false);
  for (let round = 0; round < 20; round++) {
    const next = new Set(have);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = charAt(x, y), role = roleAt(x, y);
      if (role === "door" || role === "wall" || !by.has(c)) continue;
      const touched = role === "npc"
        ? [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([nx, ny]) => seen.has(key(nx, ny)))
        : seen.has(key(x, y));
      if (touched) giveOf(c).forEach((g) => next.add(g));
    }
    if (next.size === have.size) break;
    have = next;
    seen = reach(start, have, false);
  }
  const reached = exits.filter(([x, y]) => seen.has(key(x, y)));
  if (!reached.length) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const need = by.get(charAt(x, y))?.needs;
      const beside = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([nx, ny]) => seen.has(key(nx, ny)));
      if (roleAt(x, y) === "door" && simple(need) && !have.has(need) && beside) {
        return [`The exit cannot be reached: the door at row ${y + 1}, column ${x + 1} needs "${need}", and nothing reachable gives "${need}".`];
      }
    }
    return ["The exit cannot be reached from the player."];
  }
  const need = by.get(charAt(reached[0][0], reached[0][1]))?.needs;
  if (simple(need) && !have.has(need) && reached.every(([x, y]) => by.get(charAt(x, y))?.needs === need)) {
    return [`The exit needs "${need}", and nothing reachable gives "${need}".`];
  }
  return [];
}

/** Every flaw of a page, as short English sentences, one per problem (empty when the page is sound). */
export function xFlaws(html: string): string[] {
  const flaws: string[] = [];
  const add = (s: string) => { if (!flaws.includes(s)) flaws.push(s); };
  const all = descendants(parse(html));
  const baseEls = (...names: string[]): El[] => all.filter((e) => isBlockTag(e.tag) && names.includes(baseOf(e.tag) ?? ""));
  const dup = (ids: string[], what: string) => ids.filter((x, i) => x && ids.indexOf(x) !== i).forEach((x) => add(`two ${what}s are named "${x}"`));

  // 1. Structure: tags, attributes, required values, numbers, placement
  const types = new Set(baseEls("type").map((e) => val(e, "name")));
  for (const e of all) {
    if (e.tag === "script" && !["blocks", "xblocks"].includes(val(e, "id"))) add('Write no <script>: the blocks do the work (only the page runtime, with id="blocks", is allowed).');
    for (const name of e.attrs.keys()) if (/^on[a-z]+$/.test(name)) add(`"${name}" is not used: write data-click="effects" instead (no JavaScript runs from an attribute).`);
    if (!isBlockTag(e.tag)) continue;
    const base = baseOf(e.tag);
    if (!base) {
      const near = nearest(e.tag.replace(/^(?:x|game)-/, ""), Object.keys(X_TAGS));
      add(near ? `Unknown block <${e.tag}>: did you mean <${prefixOf(e.tag)}${near}>?` : `Unknown block <${e.tag}>: there is no such block.`);
      continue;
    }
    const spec = X_TAGS[base];
    for (const name of e.attrs.keys()) {
      if (spec.attrs.includes("*") || spec.attrs.includes(name) || GLOBAL_ATTRS.includes(name) || name.startsWith("data-")) continue;
      const near = nearest(name, [...spec.attrs, ...GLOBAL_ATTRS]);
      add(`<${e.tag}> has no attribute "${name}"${near ? `: did you mean "${near}"?` : "."}`);
    }
    for (const r of REQUIRED[base] ?? []) if (!val(e, r).trim()) add(`<${e.tag}> needs ${r}="..."`);
    for (const r of NUMERIC[base] ?? []) {
      const v = e.attrs.get(r);
      if (v !== undefined && !/^\s*-?\d+(\.\d+)?\s*$/.test(v)) add(`<${e.tag} ${r}="${v}"> must be a number`);
    }
    const view = e.attrs.get("view");
    if (view !== undefined && base === "map" && !/^\d+x\d+$/.test(view)) add(`<${e.tag} view="${view}"> is written columns x rows, for example view="15x11"`);
    if (view !== undefined && base === "platformer" && !/^\d+$/.test(view)) add(`<${e.tag} view="${view}"> is the visible width in cells, a number`);
    if (base === "fighter" && e.attrs.has("side") && !["you", "enemy"].includes(val(e, "side"))) add(`<x-fighter side="${val(e, "side")}"> must be "you" or "enemy"`);
    if (base === "clock" && e.attrs.has("format") && !["m:ss", "s", "mm:ss"].includes(val(e, "format"))) add(`<x-clock format="${val(e, "format")}"> must be "m:ss", "s" or "mm:ss"`);
    for (const k of ["every", "after"]) {
      const v = e.attrs.get(k);
      if (base === "timer" && v !== undefined && !DURATION.test(v.trim())) add(`<x-timer ${k}="${v}"> is a time: 500ms, 2s, 1m, or a plain number of seconds`);
    }
    if (base === "timer" && !e.attrs.has("every") && !e.attrs.has("after")) add('<x-timer> needs every="1s" (repeated) or after="3s" (once)');
    if (base === "fighter" && types.size && e.attrs.has("type") && !types.has(val(e, "type"))) add(`<x-fighter type="${val(e, "type")}"> is not declared with <x-type name="${val(e, "type")}">`);
    if (base === "move" && types.size && e.attrs.has("type") && !types.has(val(e, "type"))) add(`<x-move type="${val(e, "type")}"> is not declared with <x-type name="${val(e, "type")}">`);
    const parents = Object.keys(X_TAGS).filter((p) => X_TAGS[p].children?.includes(base));
    if (parents.length) {
      const nb = nearestBlock(e);
      if (!nb || !parents.includes(nb.base)) add(`<${e.tag}> must be inside ${parents.map((p) => `<x-${p}>`).join(" or ")}`);
    }
  }

  // 2. Effects, conditions and the states they declare
  const allEffs: Eff[] = [];
  const conds: Array<{ where: string; src: string }> = [];
  const declared = new Set<string>();
  const startHave = new Set<string>();
  const goRefs: Array<{ where: string; name: string }> = [];
  const effect = (where: string, src: string) => {
    const sc = scanEffects(src);
    sc.problems.forEach((p) => add(`${where}: ${p}`));
    allEffs.push(...sc.effs);
  };
  for (const e of all) {
    const where = `<${e.tag}>`;
    const base = isBlockTag(e.tag) ? baseOf(e.tag) : null;
    for (const [name, v] of e.attrs) {
      if (name === "data-key") {
        for (const part of v.split(";")) {
          if (!part.trim()) continue;
          const k = /^\s*([^:]+?)\s*:\s*(.+)$/.exec(part);
          if (k) effect(where, spacedEffects(k[2]));
          else add(`${where} data-key "${part.trim()}" needs the form "Key: effects"`);
        }
      } else if (effectAttrOf(base, name)) {
        effect(where, spacedEffects(v));
      }
      if (name === "when" || name === "data-when" || (base === "timer" && (name === "while" || name === "start"))) conds.push({ where, src: v });
      if (name === "data-bind") declared.add(v.split(".")[0]);
    }
    if (base === "state") {
      for (const k of e.attrs.keys()) {
        if (STATE_SKIP.includes(k)) continue;
        const n = k.replace(/-/g, "_");
        declared.add(n);
        if (!/^[a-z][a-z0-9_]*$/.test(n)) add(`state name "${k}" is not plain: use letters, digits and _ (a dash becomes _)`);
        const v = val(e, k);
        if (/^\s*[\[{]/.test(v)) {
          try { JSON.parse(v.replace(/'/g, '"')); } catch { add(`state "${k}" is not valid JSON: write an array such as items='[{"name":"key"}]' with no apostrophe inside`); }
        }
        if (v !== "" && v !== "0" && v !== "false") startHave.add(n);
      }
    }
    if (base === "flag" || base === "calc") declared.add(val(e, "name"));
    if (base === "battle") { declared.add("battle_open"); declared.add("battle_result"); }
    if (base === "dialog") { declared.add("dialog_open"); declared.add(`talked_${val(e, "id").replace(/-/g, "_")}`); }
    if (base === "fighter") declared.add(`${val(e, "name").toLowerCase()}_hp`);
    if (base === "map" || base === "platformer") { declared.add("player_x"); declared.add("player_y"); }
    if (base === "rule" && !e.attrs.has("do") && !e.attrs.has("say")) add('<x-rule> does nothing: give it do="effects" or say="text"');
  }

  // legends of the maps and levels
  const legends = new Map<El, Legend[]>();
  for (const e of baseEls("map", "platformer")) {
    const le = kidsEls(e).find((k) => baseOf(k.tag) === "legend");
    if (!le) { add(`<${e.tag}> needs a <x-legend> inside it: one line per character ("# wall", "@ player")`); continue; }
    const probs: string[] = [];
    const items = legendOf(textOf(le), baseOf(e.tag) === "map" ? MAP_ROLES : PLATFORMER_ROLES, probs);
    probs.forEach(add);
    legends.set(e, items);
    for (const it of items) {
      allEffs.push(...it.effs);
      if (it.needs) conds.push({ where: `legend "${it.char}" needs:`, src: it.needs });
      if (it.to) goRefs.push({ where: `legend "${it.char}" to:`, name: it.to });
      if (it.role === "warp" && !it.to) add(`legend "${it.char}" is a warp with no to:scene`);
      if (it.as !== undefined && !/^[A-Za-z_]\w*$/.test(it.as)) add(`legend "${it.char}" as:${it.as} needs a plain name`);
    }
  }

  for (const c of conds) {
    const p = condProblem(c.src);
    if (p) add(`${c.where} condition "${c.src.trim()}" cannot be read (${p})`);
  }
  for (const e of baseEls("calc")) {
    const n = val(e, "name"), v = val(e, "value");
    if (n && !/^[A-Za-z_]\w*$/.test(n)) add(`<x-calc name="${n}"> needs a plain name (letters, digits and _)`);
    const p = v.trim() ? calcProblem(v) : null;
    if (p) add(`<x-calc name="${n}"> value "${v}" cannot be read (${p})`);
  }
  for (const e of baseEls("value", "list", "clock")) {
    const n = val(e, "of");
    if (n && !declared.has(n.split(".")[0])) add(`<${e.tag} of="${n}"> reads "${n}", which is never declared: add it to <x-state> or set it in an effect`);
  }

  // 3. Scenes, battles and dialogs: the references between them
  const sceneIds = baseEls("scene").map((e) => val(e, "id"));
  dup(sceneIds, "scene");
  const battleIds = baseEls("battle").map((e) => val(e, "id"));
  dup(battleIds, "battle");
  const dialogIds = baseEls("dialog").map((e) => val(e, "id"));
  dup(dialogIds, "dialog");
  const battleStarts: string[] = [], dialogStarts: string[] = [];
  for (const eff of allEffs) {
    if (eff.kind !== "action" || !eff.arg) continue;
    const arg = eff.arg.replace(/^["']|["']$/g, "");
    if (eff.name === "go") goRefs.push({ where: `go:${arg}`, name: arg });
    if (eff.name === "emit") {
      const b = /^battle:([^:\s]+)$/.exec(arg), d = /^dialog:([^:\s]+)$/.exec(arg);
      if (b) battleStarts.push(b[1]);
      if (d) dialogStarts.push(d[1]);
    }
  }
  for (const r of goRefs) if (!sceneIds.includes(r.name)) add(`${r.where} points to no scene: add <x-scene id="${r.name}">`);
  for (const id of battleStarts) if (!battleIds.includes(id)) add(`emit:battle:${id} starts no battle: add <x-battle id="${id}">`);
  for (const id of battleIds) if (id && !battleStarts.includes(id)) add(`<x-battle id="${id}"> never starts: nothing emits battle:${id}`);
  for (const id of dialogStarts) if (!dialogIds.includes(id)) add(`emit:dialog:${id} starts no dialog: add <x-dialog id="${id}">`);
  for (const e of baseEls("battle")) {
    const fighters = descendants(e).filter((f) => baseOf(f.tag) === "fighter");
    if (!fighters.some((f) => val(f, "side") === "you") || !fighters.some((f) => val(f, "side") === "enemy")) {
      add(`<x-battle id="${val(e, "id")}"> needs a fighter with side="you" and one with side="enemy"`);
    }
    const names: string[] = [];
    for (const f of fighters) {
      const name = val(f, "name");
      if (name) {
        const key = name.toLowerCase();
        if (!/^[a-z][a-z0-9_]*$/.test(key)) add(`fighter "${name}" gives the state "${key}_hp": use letters, digits and _ only in its name`);
        if (names.includes(key)) add(`two fighters are named "${name}" in the same battle: their hp would share one state`);
        names.push(key);
      }
      if (!descendants(f).some((m) => baseOf(m.tag) === "move")) add(`fighter "${name}" has no <x-move>: it cannot attack`);
      for (const m of descendants(f).filter((x) => baseOf(x.tag) === "move")) {
        if (types.size && m.attrs.has("type") && !types.has(val(m, "type"))) add(`<x-move type="${val(m, "type")}"> is not declared with <x-type>`);
      }
    }
  }
  for (const e of baseEls("dialog")) {
    const lines = descendants(e).filter((l) => baseOf(l.tag) === "line");
    if (!lines.length) add(`<x-dialog id="${val(e, "id")}"> has no <x-line>`);
    const ids = lines.map((l) => val(l, "id")).filter(Boolean);
    for (const l of lines) {
      const next = val(l, "next");
      if (next && next !== "end" && !ids.includes(next)) add(`<x-line next="${next}"> points to no line: use the id of a line of this dialog, or "end"`);
      const choices = descendants(l).filter((c) => baseOf(c.tag) === "choice");
      if (l.attrs.has("ask") && !choices.length) add(`<x-line ask="${val(l, "ask")}"> asks a question but has no <x-choice>`);
      for (const c of choices) {
        const g = val(c, "goto");
        if (g && !ids.includes(g)) add(`<x-choice goto="${g}"> points to no line of this dialog`);
      }
    }
  }

  // 4. Maps and levels
  const games = baseEls("map", "platformer", "battle");
  if (games.length) {
    const ended = allEffs.some((e) => e.kind === "bare" && (e.name === "win" || e.name === "lose"));
    const roles = [...legends.values()].flat().map((i) => i.role);
    if (!ended && !roles.includes("exit") && !roles.includes("flag")) {
      add('The game has no way to be won or lost: add an exit to the map, a flag to the level, or a <x-rule> with do="win".');
    }
  }
  for (const e of baseEls("map", "platformer")) {
    const items = legends.get(e);
    if (!items) continue;
    const isMap = baseOf(e.tag) === "map";
    const cells = cellsOf(mapText(e));
    gridFlaws(e.tag, cells, items, isMap, add);
    if (isMap && cells.length) exitFlaws(cells, items, startHave).forEach(add);
  }
  return flaws;
}

/** Repairs what is safe to repair without a model. Returns the page and a line per repair. */
export function xMend(html: string): { html: string; fixed: string[] } {
  const fixed: string[] = [];
  const note = (s: string) => { if (!fixed.includes(s)) fixed.push(s); };
  const known = Object.keys(X_TAGS);
  let out = html.replace(new RegExp(TAG.source, "g"), (all: string, slash: string, name: string, attrs: string, selfClose: string) => {
    let tag = name.toLowerCase();
    if (isBlockTag(tag) && !baseOf(tag)) {
      const near = nearest(tag.replace(/^(?:x|game)-/, ""), known);
      if (!near) return all;
      const next = prefixOf(tag) + near;
      note(`<${tag}> renamed <${next}>`);
      tag = next;
    }
    const base = baseOf(tag);
    let attrsOut = attrs;
    if (base && base !== "state") {
      const allowed = [...X_TAGS[base].attrs, ...GLOBAL_ATTRS];
      attrsOut = attrs.replace(new RegExp(ATTR.source, "g"), (a: string, an: string) => {
        const n = an.toLowerCase();
        let s = a;
        if (!allowed.includes(n) && !n.startsWith("data-")) {
          const near = nearest(n, allowed);
          if (near) { note(`attribute "${n}" of <${tag}> renamed "${near}"`); s = s.replace(an, near); }
        }
        if (effectAttrOf(base, n)) {
          s = s.replace(/(=\s*)(["'])([\s\S]*?)\2/, (_m: string, eq: string, q: string, v: string) => {
            const nv = spacedEffects(v);
            if (nv !== v) note(`effect of <${tag}> written "${nv.trim()}" (was "${v.trim()}")`);
            return `${eq}${q}${nv}${q}`;
          });
        }
        return s;
      });
    }
    return `<${slash}${tag}${attrsOut}${selfClose ? "/" : ""}>`;
  });

  // state names that are not plain: renamed everywhere in the page
  const root = parse(out);
  const states = descendants(root).filter((e) => baseOf(e.tag) === "state");
  const taken = new Set<string>();
  for (const e of states) for (const k of e.attrs.keys()) if (!STATE_SKIP.includes(k)) taken.add(k.replace(/-/g, "_"));
  const renames: Array<[string, string]> = [];
  for (const e of states) {
    for (const k of e.attrs.keys()) {
      if (STATE_SKIP.includes(k) || /^[a-z][a-z0-9_]*$/.test(k.replace(/-/g, "_"))) continue;
      const s = k.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const next = /^[a-z]/.test(s) ? s : s ? `s_${s}` : "";
      if (!next || taken.has(next) || renames.some(([o]) => o === k)) continue;
      renames.push([k, next]);
      taken.add(next);
    }
  }
  for (const [o, n] of renames) {
    note(`state name "${o}" renamed "${n}"`);
    out = out.replace(new RegExp(`(?<![\\w.])${escapeRe(o)}(?!\\w)`, "g"), n);
  }

  // effects written with spaces inside legends
  out = out.replace(/(<(?:x|game)-legend\b[^>]*>)([\s\S]*?)(<\/(?:x|game)-legend\s*>)/gi, (_all: string, open: string, body: string, close: string) => {
    const nb = spacedEffects(body);
    if (nb !== body) note("effects of a legend written without spaces around the operator");
    return open + nb + close;
  });

  // map rows padded to the same width
  out = out.replace(/(<(?:x|game)-(?:map|platformer)\b[^>]*>)([\s\S]*?)(<\/(?:x|game)-(?:map|platformer)\s*>)/gi, (all: string, open: string, body: string, close: string) => {
    const lm = /<(?:x|game)-legend\b[^>]*>[\s\S]*?<\/(?:x|game)-legend\s*>/i.exec(body);
    const rest = lm ? body.replace(lm[0], "") : body;
    if (rest.includes("<")) return all;
    const lines = rest.replace(/\r/g, "").split("\n").map((l) => l.replace(/\t/g, "    ")).filter((l) => l.trim() !== "");
    if (!lines.length) return all;
    const cut = Math.min(...lines.map((l) => l.length - l.trimStart().length));
    const cells = lines.map((l) => l.slice(cut).replace(/\s+$/, ""));
    const width = Math.max(...cells.map((c) => decode(c).length));
    if (cells.every((c) => decode(c).length === width)) return all;
    note(`map rows padded with spaces to ${width} characters`);
    const padded = cells.map((c) => c + " ".repeat(width - decode(c).length));
    return open + (lm ? `${lm[0]}\n` : "") + padded.join("\n") + "\n" + close;
  });
  return { html: out, fixed };
}
