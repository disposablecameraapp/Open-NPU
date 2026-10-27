/**
 * Changing a page of blocks, so that a change can never break it.
 *
 * A page is made of units (a scene, a panel, a drawn object, a block such as the level, a style block or one CSS rule, a rule of the
 * game). A request is cut into separate changes, and each change goes:
 *   1. Find      the unit it is about, by its words (names, what a drawing looks like, CSS selectors), no model; a model is asked only
 *                when the words do not decide, and only with the NAMES of the units
 *   2. Read      only that unit goes to the model, with the change and the names defined in the page
 *   3. Write     the model writes back that unit alone (or, for something to add, a new part of a section)
 *   4. Splice    the new text goes in place of the old at the exact place; nothing outside the unit can move
 *   5. Check     the whole page is checked again: a problem the change brought, or a name (scene, state, drawing, block) that was
 *                there before and is gone, sends the unit back to the model once with exactly that; if it is still wrong the change
 *                is REFUSED and the page stays as it was, with the reason said. Every change stands or falls alone.
 * An object a change uses that is not drawn yet is drawn apart, as when the page was made.
 */
import { docFor } from "./xdocs";
import { ARTIST_INSTRUCTIONS, REPAIR_INSTRUCTIONS, WRITE_INSTRUCTIONS, XEvent, XHost, assetTag, cleanSvg, plainArt, xcall } from "./xbuild";
import { bibleOf, mendFragment, parseTasks, statesUsed } from "./xplan";
import { xFlaws, xMend } from "./xcheck";
import type { PickInfo } from "./pick";
import { ranksIn } from "./slidePicks";

export type XUnitKind = "scene" | "overlay" | "asset" | "block" | "style" | "rule" | "state" | "logic";
export interface XUnit { kind: XUnitKind; id: string; label: string; start: number; end: number; text: string; about?: string; parent?: string }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ------------------------------------------------------------------ the units of a page

/** The end (exclusive) of the element that opens at `from`, counting nested elements of the same name; -1 when it never closes. */
export function elementEnd(html: string, from: number): number {
  const m = /^<([a-z][\w-]*)\b/i.exec(html.slice(from, from + 64));
  if (!m) return -1;
  const tag = m[1].toLowerCase();
  const open = new RegExp(`<${tag}\\b[^>]*?(/?)>`, "gi");
  const close = new RegExp(`</${tag}\\s*>`, "gi");
  const first = open.exec(html.slice(from));
  if (!first) return -1;
  if (first[1] === "/") return from + first[0].length;
  let depth = 1, at = from + first[0].length;
  for (;;) {
    open.lastIndex = at; close.lastIndex = at;
    const o = open.exec(html), c = close.exec(html);
    if (!c) return -1;
    if (o && o.index < c.index && o[1] !== "/") { depth++; at = o.index + o[0].length; continue; }
    depth--; at = c.index + c[0].length;
    if (!depth) return at;
  }
}

const attrOf = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag)?.[2] ?? new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i").exec(tag)?.[1];
const BLOCK_TAGS = /^(?:x|game)-(platformer|map|dialog|battle|list)$/i;

/** The CSS rules of a style block, each with its place in the page. */
function cssRules(css: string, base: number): { sel: string; start: number; end: number }[] {
  const out: { sel: string; start: number; end: number }[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") { depth--; if (depth === 0) { const raw = css.slice(start, i + 1); const lead = raw.length - raw.replace(/^\s+/, "").length; out.push({ sel: raw.slice(lead, raw.indexOf("{")).trim().replace(/\s+/g, " "), start: base + start + lead, end: base + i + 1 }); start = i + 1; } }
  }
  return out;
}

export function unitsOf(html: string): XUnit[] {
  const out: XUnit[] = [];
  const push = (u: Omit<XUnit, "text">) => out.push({ ...u, text: html.slice(u.start, u.end) });
  for (const m of html.matchAll(/<(?:x|game)-scene\b[^>]*>/gi)) {
    const end = elementEnd(html, m.index!);
    if (end < 0) continue;
    const id = attrOf(m[0], "id") ?? `scene_${out.length}`;
    push({ kind: "scene", id, label: `scene ${id}`, start: m.index!, end });
    const inner = html.slice(m.index! + m[0].length, end);
    for (const b of inner.matchAll(/<((?:x|game)-(?:platformer|map|dialog|battle|list))\b[^>]*>/gi)) {
      const s = m.index! + m[0].length + b.index!;
      const e = elementEnd(html, s);
      if (e < 0 || !BLOCK_TAGS.test(b[1])) continue;
      const bid = attrOf(b[0], "id");
      push({ kind: "block", id: `${id}/${b[1].toLowerCase().replace(/^game-/, "x-")}${bid ? `#${bid}` : ""}`, label: `${b[1].toLowerCase().replace(/^game-/, "x-")}${bid ? ` ${bid}` : ""} in ${id}`, start: s, end: e, parent: id });
    }
  }
  for (const m of html.matchAll(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\boverlay\b[^"']*["'][^>]*>/gi)) {
    const end = elementEnd(html, m.index!);
    if (end < 0) continue;
    const id = attrOf(m[0], "id") ?? "overlay";
    push({ kind: "overlay", id, label: `panel ${id}`, start: m.index!, end });
  }
  for (const m of html.matchAll(/<(?:x|game)-asset\b[^>]*>/gi)) {
    const end = elementEnd(html, m.index!);
    if (end < 0) continue;
    const name = attrOf(m[0], "name") ?? "object";
    push({ kind: "asset", id: name, label: `drawing ${name}`, start: m.index!, end, about: attrOf(m[0], "about") });
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const bodyAt = m.index! + m[0].indexOf(">") + 1;
    for (const r of cssRules(m[1], bodyAt)) push({ kind: "style", id: r.sel, label: `css ${r.sel}`, start: r.start, end: r.end });
  }
  for (const m of html.matchAll(/<(?:x|game)-state\b[^>]*>(?:\s*<\/(?:x|game)-state\s*>)?/gi)) push({ kind: "state", id: "state", label: "the numbers of the game", start: m.index!, end: m.index! + m[0].length });
  for (const m of html.matchAll(/<(?:x|game)-rule\b[^>]*>(?:\s*<\/(?:x|game)-rule\s*>)?/gi)) push({ kind: "rule", id: `${attrOf(m[0], "when") ?? attrOf(m[0], "on") ?? "rule"}`, label: `rule ${attrOf(m[0], "when") ?? attrOf(m[0], "on") ?? ""} -> ${attrOf(m[0], "do") ?? ""}`, start: m.index!, end: m.index! + m[0].length });
  return out;
}

/** The names a page is made of: if one of them is gone after a change, something was lost. */
export function namesOf(html: string): string[] {
  const out = new Set<string>();
  for (const u of unitsOf(html)) if (u.kind === "scene" || u.kind === "asset" || u.kind === "overlay") out.add(`${u.kind}:${u.id}`);
  for (const m of html.matchAll(/<(?:x|game)-(?:dialog|battle)\b[^>]*\bid\s*=\s*["']([\w-]+)/gi)) out.add(`id:${m[1]}`);
  for (const m of html.matchAll(/<(?:x|game)-(platformer|map)\b/gi)) out.add(`block:${m[1].toLowerCase()}:${[...out].filter((n) => n.startsWith(`block:${m[1].toLowerCase()}:`)).length}`);
  for (const n of statesUsed(html)) out.add(`state:${n}`);
  return [...out];
}

// ------------------------------------------------------------------ finding the unit

const STOP = new Set("the a an to of and or in on it its is are be make makes made change changes set put add please with for that this my your les la le un une des de du et ou en dans sur est sont fais fait mets mettre change changer ajoute ajouter avec pour que ce cette mon ma mes plus moins more less bit".split(" "));
/** Words that mean the same thing in a request and in a page, in both languages. */
const ALIAS: Record<string, string[]> = {
  pipe: ["pipe", "tuyau", "tuyaux", "pipes"], enemy: ["enemy", "enemies", "ennemi", "ennemis", "goomba", "walker", "monster", "monstre"], hero: ["hero", "player", "joueur", "heros", "personnage", "character"],
  background: ["background", "fond", "sky", "ciel", "body", "bg"], title: ["title", "titre", "menu", "h1"], button: ["button", "bouton"], score: ["score", "points", "hud", "vies", "lives", "life"],
  coin: ["coin", "coins", "piece", "pieces", "pièce", "pièces"], level: ["level", "niveau", "map", "carte", "platformer", "world", "monde"], color: ["color", "colour", "couleur", "red", "rouge", "blue", "bleu", "green", "vert", "yellow", "jaune"],
  flag: ["flag", "drapeau", "exit", "sortie"], block: ["block", "bloc", "brick", "brique", "question"], dialog: ["dialog", "dialogue", "talk", "parle", "conversation", "pnj", "npc"], battle: ["battle", "combat", "fight"], font: ["font", "police", "typo"]
};
const canon = (w: string): string => { for (const [k, v] of Object.entries(ALIAS)) if (v.includes(w)) return k; return w; };
const words = (s: string) => [...new Set(s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map(canon))];

export interface XCandidate { unit: XUnit; score: number }
/** The units a request is about, best first (no model). */
export function locate(request: string, units: XUnit[]): XCandidate[] {
  const wanted = words(request);
  const colour = wanted.includes("color");
  const scored = units.map((u) => {
    const name = new Set(words(`${u.id} ${u.label} ${u.about ?? ""}`));
    const body = new Set(words(u.kind === "asset" ? "" : u.text.slice(0, 1500)));
    let score = 0;
    for (const w of wanted) { if (name.has(w)) score += w === "color" ? 1 : 5; else if (body.has(w)) score += 1; }
    if (colour && (u.kind === "asset" || u.kind === "style")) score += 1;
    if (u.kind === "state" || u.kind === "rule") score -= 1;
    return { unit: u, score };
  });
  return scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score || a.unit.text.length - b.unit.text.length);
}

// ------------------------------------------------------------------ the changes

const ADD_WORDS = /\b(add|ajoute\w*|insert\w*|create|cr[ée]e\w*|new|nouvel\w*|nouveau\w*|include|rajoute\w*|put in|mets? (?:un|une|des)|there should be|il faut)\b/i;
const REMOVE_WORDS = /\b(remove|delete|supprim\w*|enl[eè]ve\w*|retire\w*|get rid|drop|efface\w*|sans)\b/i;

export const SPLIT_INSTRUCTIONS = "You split a request to change a game page into its separate changes, one per line, each line starting with '- ' and saying one thing to change or to add, in the words of the request. No explanation. If the request is one change, give one line.";
const EDIT_INSTRUCTIONS = (kind: string) => `You change one ${kind} of a game page and nothing else. Reply with the whole new ${kind} only, written the same way as the old one, with the change made and everything else exactly as it was: no explanation, no code fence.`;

export interface XEditResult { html: string; changes: string[]; refused: string[]; warnings: string[]; calls: number }

const KIND_WORD: Record<XUnitKind, string> = { scene: "screen", overlay: "panel", asset: "drawing (SVG)", block: "block", style: "CSS rule", rule: "rule", state: "list of numbers", logic: "part" };

/** What is left in a unit after a model reply, ready to splice: a reply of the wrong kind is null. */
function readUnit(u: XUnit, reply: string, w: number, h: number, ctx: { scenes: string[]; states: string[]; assets?: string[] }): { text: string; css: string } | null {
  if (u.kind === "asset") {
    const svg = cleanSvg(reply, w, h);
    if (!svg) return null;
    return { text: assetTag({ name: u.id, w, h, about: u.about ?? u.id }, svg), css: "" };
  }
  if (u.kind === "style") {
    const css = reply.replace(/<think>[\s\S]*?<\/think>/g, " ").replace(/```[a-z]*\n?|```/gi, "").replace(/<\/?style\b[^>]*>/gi, "").trim();
    const open = (css.match(/\{/g) ?? []).length, close = (css.match(/\}/g) ?? []).length;
    return css && open === close && open > 0 ? { text: css, css: "" } : null;
  }
  const m = mendFragment(reply, ctx);
  if (!m.body) return null;
  if (u.kind === "scene") {
    const open = /^<(?:x|game)-scene\b[^>]*>/i.exec(u.text)![0];
    return { text: `${open}\n${m.body}\n</${/^<game-/i.test(open) ? "game" : "x"}-scene>`, css: m.css };
  }
  if (u.kind === "overlay") {
    const open = /^<div\b[^>]*>/i.exec(u.text)![0];
    return { text: `${open}\n${m.body}\n</div>`, css: m.css };
  }
  return { text: m.body, css: m.css };
}

export interface XPart { n: number; label: string; info: PickInfo }

/** The unit(s) a part pointed at in the preview stands for, read from what the frame said it is (no model, no search). */
export function unitsForPart(info: PickInfo, units: XUnit[]): XUnit[] {
  const inScene = (u: XUnit) => !info.scene || u.parent === info.scene;
  const block = (tag: RegExp) => units.find((u) => u.kind === "block" && tag.test(u.id) && inScene(u)) ?? units.find((u) => u.kind === "block" && tag.test(u.id));
  const asset = info.name ? units.find((u) => u.kind === "asset" && u.id === info.name) : undefined;
  switch (info.part) {
    case "drawing": return asset ? [asset] : [];
    case "thing in the level": case "tile of the level": case "level": { const b = block(/x-platformer/); return [b, info.part === "thing in the level" ? asset : undefined].filter((u): u is XUnit => !!u); }
    case "thing on the map": case "tile of the map": { const b = block(/x-map/); return [b, asset].filter((u): u is XUnit => !!u); }
    case "x-platformer": case "x-map": case "x-dialog": case "x-battle": case "x-list": { const b = block(new RegExp(info.part)); return b ? [b] : []; }
    default: {
      const overlay = units.find((u) => u.kind === "overlay" && info.selector.includes(u.id));
      if (overlay) return [overlay];
      const scene = info.scene ? units.find((u) => u.kind === "scene" && u.id === info.scene) : undefined;
      return scene ? [scene] : [];
    }
  }
}

export const SPLIT_PARTS_INSTRUCTIONS = "You split a request to change a game page into its separate changes. The user pointed at numbered parts of the page (listed). Reply with one line per change, each '- <number>: <the change>', where the number is the part the change is about (0 when it is about no part in particular), in the words of the request. A request like \"for 1 ..., for 2 ...\" or \"the first ..., the second ...\" has one line for each. No explanation.";

/** The changes of a request that names the parts by number or rank, cut without a model: a clause that names a part starts a change, a clause that names none goes with the one before. */
export function splitByRanks(request: string, count: number): { part: number; change: string }[] {
  const clauses = request.split(/[;\n]+|,\s+(?=(?:and|et|puis|then|for|pour|sur|on|the|le|la|les)\b)|\s+(?:and then|puis|et ensuite|et puis)\s+/i).map((c) => c.trim()).filter(Boolean);
  const out: { part: number; change: string }[] = [];
  for (const c of clauses) {
    const digit = /(?:^|\b(?:for|pour|on|sur|part|partie|n[°o]?|#)\s*(?:le|la|the|l'|n[°o]?|#)?\s*)([1-9])\b/i.exec(c);
    const rank = ranksIn(c).find((k) => k <= count) ?? (digit && +digit[1] <= count ? +digit[1] : 0);
    if (rank || !out.length) out.push({ part: rank, change: c });
    else out[out.length - 1].change += `, ${c}`;
  }
  return out.length ? out : [{ part: 0, change: request }];
}

/** The units a change is about: by its words when they decide (no model), else a first pass with the model that is given only the NAMES of the parts. */
async function* findUnits(change: string, units: XUnit[], adding: boolean, call: (label: string, system: string, user: string, again?: string) => AsyncGenerator<XEvent, string | null>, only?: XUnit[]): AsyncGenerator<XEvent, XUnit[]> {
  if (only && only.length === 1) return only;
  const cands = only ? only.map((unit) => ({ unit, score: 1 })) : locate(change, units);
  const top = cands[0], second = cands[1];
  const inside = (a: XUnit, b: XUnit) => (a.start <= b.start && b.end <= a.end) || (b.start <= a.start && a.end <= b.end);
  // sure: a clear lead, or the two best are one inside the other (the smaller one is the precise one)
  if (top && top.score >= 5 && (!second || top.score >= second.score + 3 || (inside(top.unit, second.unit) && top.score - second.score <= 1))) {
    const precise = second && inside(top.unit, second.unit) && second.unit.text.length < top.unit.text.length && top.score - second.score <= 1 ? second.unit : top.unit;
    return [precise];
  }
  // not sure: the model picks from the names (the best few, or all of them when the words found nothing)
  const list = (cands.length ? cands.slice(0, 12).map((c) => c.unit) : units.filter((u) => u.kind !== "state" && u.kind !== "rule").slice(0, 40));
  const names = list.map((u, i) => `${i + 1}. ${u.label}${u.about ? ` (${clip(u.about, 50)})` : ""}`).join("\n");
  const r = yield* call("Which parts?", "A game page is made of named parts. Say which parts the change is about (the fewest that do it, up to three): reply with their numbers only, like: 2, 5", `The change: ${clip(change, 300)}\nThe parts:\n${names}`);
  const picked = [...new Set((r ?? "").match(/\d+/g)?.map(Number) ?? [])].map((n) => list[n - 1]).filter((u): u is XUnit => !!u).slice(0, 3);
  if (picked.length) return picked;
  return top ? [top.unit] : adding ? [] : [];
}

export async function* editXPage(request: string, html: string, host: XHost, opts: { parts?: XPart[] } = {}): AsyncGenerator<XEvent, XEditResult> {
  const counter = { n: 0 };
  const warnings: string[] = [], changes: string[] = [], refused: string[] = [];
  const warn = (t: string) => { warnings.push(t); return { type: "warn", text: t } as XEvent; };
  const call = (label: string, system: string, user: string, again?: string) => xcall(host, counter, label, system, user, again);
  const docRoom = Math.max(1500, Math.floor(host.room * 0.35));
  const localRoom = Math.max(700, Math.floor(host.room * 0.3));
  let page = html;

  // the separate changes of the request, each with the part it is about when the person pointed at parts
  const parts = opts.parts ?? [];
  let list: { change: string; part?: XPart }[] = [{ change: request.trim(), part: parts.length === 1 ? parts[0] : undefined }];
  const several = request.length > 140 || /[;\n]|\b\d[.)]\s|(?:,|\band\b|\bet\b)\s+(?:also|then|puis|aussi|ajoute|add|change|make)\b/i.test(request) || (parts.length > 1);
  if (several && parts.length > 1) {
    const r = yield* call("Separate changes", SPLIT_PARTS_INSTRUCTIONS, `The parts:\n${parts.map((p) => `${p.n}. ${p.label}`).join("\n")}\n\nThe request:\n${clip(request, 1500)}`);
    let got = (r ?? "").split("\n").map((l) => /^\s*[-*•]?\s*(\d+)\s*[:.)-]\s*(.+)$/.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => ({ part: +m[1], change: m[2].trim() }));
    if (!got.length || got.every((g) => !parts.some((p) => p.n === g.part))) got = splitByRanks(request, parts.length).map((g) => ({ part: g.part ? parts[g.part - 1]?.n ?? 0 : 0, change: g.change }));
    list = got.map((g) => ({ change: g.change, part: parts.find((p) => p.n === g.part) }));
  } else if (several) {
    const r = yield* call("Separate changes", SPLIT_INSTRUCTIONS, `The request:\n${clip(request, 1500)}`);
    const got = r ? parseTasks(r) : [];
    if (got.length) list = got.map((change) => ({ change, part: parts[0] }));
  }

  for (const [idx, item] of list.entries()) {
    if (host.aborted?.()) throw new Error("aborted");
    const change = item.change;
    yield { type: "step", n: idx + 1, total: list.length, text: clip(change, 60) };
    yield { type: "note", text: `Change: ${clip(change, 60)}` };
    const adding = ADD_WORDS.test(change) && !REMOVE_WORDS.test(change);
    const start = page;
    const flawsBefore = new Set(xFlaws(start));
    const namesBefore = namesOf(start);

    // 1. first pass: which parts
    const all = unitsOf(start);
    // a part pointed at is known exactly; otherwise the words find it, and the model is asked with the names
    const pointed = item.part ? unitsForPart(item.part.info, all) : [];
    let picks = pointed.length ? (pointed.length > 1 && !adding ? yield* findUnits(`${item.part!.label}: ${change}`, all, adding, call, pointed) : pointed.slice(0, 1)) : yield* findUnits(item.part ? `${item.part.label}: ${change}` : change, all, adding, call);
    if (adding) {
      const scene = picks.find((u) => u.kind === "scene") ?? picks.map((u) => (u.parent ? all.find((x) => x.kind === "scene" && x.id === u.parent) : undefined)).find(Boolean)
        ?? all.find((u) => u.kind === "scene" && words(change).includes(canon(u.id))) ?? all.find((u) => u.kind === "scene" && /level|game|map|world/.test(u.id)) ?? all.find((u) => u.kind === "scene" && !/title|over|win/.test(u.id));
      picks = scene ? [scene] : [];
    }
    if (!picks.length) { refused.push(`${clip(change, 60)}: no part of the page matches`); yield warn(`"${clip(change, 60)}": no part of the page matches, nothing was changed`); continue; }

    // 2. second pass, for each part: it alone goes to the model with the rules of its blocks and the change
    let working = start;
    let failed: string | null = null;
    for (const first of picks) {
      const now = unitsOf(working).find((u) => u.kind === first.kind && u.id === first.id) ?? null;
      if (!now) { failed = `${first.label} is no longer there`; break; }
      const pick: XUnit = now;
      yield { type: "note", text: `${adding ? "Adding to" : "Changing"} ${pick.label}` };
      const states = statesUsed(working);
      const scenes = unitsOf(working).filter((u) => u.kind === "scene").map((u) => u.id);
      const assets = unitsOf(working).filter((u) => u.kind === "asset").map((u) => u.id);
      const known = [...new Set([...states, ...scenes])];
      const bible = bibleOf({ state: Object.fromEntries(states.map((k) => [k, 0])), scenes, body: working, css: unitsOf(working).filter((u) => u.kind === "style").map((u) => u.text).join("\n") }, 700);
      const blockName = /^<(?:x|game)-([a-z]+)/i.exec(pick.text)?.[1];
      const blocksHere = [...new Set([...pick.text.matchAll(/<(?:x|game)-(platformer|map|dialog|battle|timer|calc)\b/gi)].map((m) => m[1].toLowerCase()))];
      const docs = docFor(pick.kind === "block" && blockName ? [blockName] : blocksHere, docRoom);
      const size = /size="(\d+)x(\d+)"/.exec(pick.text);
      const w = size ? +size[1] : 32, h = size ? +size[2] : 32;

      const attempt = async function* (note: string): AsyncGenerator<XEvent, { text: string; css: string } | null> {
        const system = adding ? WRITE_INSTRUCTIONS(docs) : pick.kind === "style" ? "You change one CSS rule of a game page. Reply with the whole new rule only (selector and braces, or several rules if the change needs them): no explanation, no code fence." : pick.kind === "asset" ? `${ARTIST_INSTRUCTIONS}\nYou are changing an existing drawing: keep it recognisable and change only what is asked.` : `${EDIT_INSTRUCTIONS(KIND_WORD[pick.kind])}\n${docs}`;
        const current = pick.text.length > localRoom * 2 ? `${pick.text.slice(0, localRoom * 2)}\n…` : pick.text;
        const user = adding
          ? `The page so far, in short:\n${bible}\n\nThis part is ${pick.label}; its end:\n${clip(current.slice(-localRoom), localRoom)}\n\nAdd this to it, in the form of the reference: ${change}${note}`
          : `The page, in short:\n${bible}\n\nThe ${KIND_WORD[pick.kind]} to change (${pick.label}):\n${current}\n\nThe change: ${change}${note}`;
        const reply = yield* call(`${adding ? "Adding" : "Changing"}: ${clip(change, 40)}`, system, user, `The ${KIND_WORD[pick.kind]}:\n${clip(current, localRoom)}\nChange it like this: ${change}`);
        if (reply === null) return null;
        if (adding) { const m = mendFragment(reply, { scenes, states: known, assets }); return m.body ? { text: m.body, css: m.css } : null; }
        return readUnit(pick, reply, w, h, { scenes, states: known, assets });
      };
      /** The page with a unit's new text in place of the old, and its CSS just before it. Nothing outside the unit moves. */
      const splice = (p: { text: string; css: string }): string => {
        const css = p.css ? `<style>\n${p.css}\n</style>\n` : "";
        if (adding) {
          const closeAt = pick.end - (/<\/(?:x|game)-scene\s*>$|<\/div>$/i.exec(pick.text)?.[0].length ?? 0);
          return `${working.slice(0, closeAt)}${css}${p.text}\n${working.slice(closeAt)}`;
        }
        return `${working.slice(0, pick.start)}${css}${p.text}${working.slice(pick.end)}`;
      };
      /** What is wrong with the page after a change that was not wrong before it. */
      const wrongWith = (after: string): string[] => {
        const out = xFlaws(after).filter((f) => !flawsBefore.has(f) && !/^There is no drawing named/.test(f)); // a drawing that is missing is made after, apart
        if (!REMOVE_WORDS.test(change)) {
          const kept = new Set(namesOf(after));
          const gone = namesBefore.filter((n) => !kept.has(n) && !/^state:/.test(n));
          if (gone.length) out.push(`the change removed ${gone.slice(0, 4).map((g) => g.replace(/^[a-z]+:/, "")).join(", ")}, which must stay`);
        }
        return out;
      };

      let produced = yield* attempt("");
      if (!produced) { failed = "no usable answer came back"; break; }
      let after = splice(produced);
      let problems = wrongWith(after);
      if (problems.length) {
        // once more, with exactly what was wrong
        const again = yield* attempt(`\n\nYour last answer made these problems in the page, correct them:\n${problems.map((p) => `- ${p}`).join("\n")}`);
        if (again) { const a2 = splice(again); const p2 = wrongWith(a2); if (p2.length <= problems.length) { after = a2; problems = p2; produced = again; } }
      }
      if (problems.length) { failed = problems[0]; break; }
      working = after;
    }
    if (failed) { refused.push(`${clip(change, 60)}: ${failed}`); yield warn(`"${clip(change, 60)}" was not applied, the page is unchanged: ${failed}`); continue; }
    if (working === start) { yield warn(`"${clip(change, 60)}": it already is so, nothing changed`); continue; }

    // an object the change uses that is not drawn yet is drawn apart
    let after = working;
    const drawn = new Set(unitsOf(after).filter((u) => u.kind === "asset").map((u) => u.id));
    const need = [...new Set([...after.matchAll(/<(?:x|game)-art\b[^>]*?\bof\s*=\s*["']([a-z][\w-]*)["']|\bart:([a-z][\w-]*)/gi)].map((m) => m[1] ?? m[2]))].filter((n) => !drawn.has(n));
    for (const name of need.slice(0, 4)) {
      const a = { name, w: 32, h: 32, about: name.replace(/_/g, " ") };
      const r = yield* call(`Drawing ${name}`, ARTIST_INSTRUCTIONS, `Object: ${name}\nSize: 32x32\nLooks like: ${a.about} (as the change says: ${clip(change, 200)})\nPalette: ${cssVars(after)}`);
      const svg = r ? cleanSvg(r, a.w, a.h) : null;
      const tag = `${assetTag(a, svg ?? plainArt(a))}\n`;
      const first = unitsOf(after).find((u) => u.kind === "scene");
      if (first) after = `${after.slice(0, first.start)}${tag}${after.slice(first.start)}`;
      if (!svg) yield warn(`${name} could not be drawn: a plain shape stands in for it`);
    }
    // a number the change uses and nobody declared is declared
    const undeclared = statesUsed(after).filter((n) => !statesUsed(start).includes(n));
    if (undeclared.length) {
      const tag = `<x-state ${undeclared.map((n) => `${n}="0"`).join(" ")}></x-state>\n`;
      const first = unitsOf(after).find((u) => u.kind === "scene");
      if (first) after = `${after.slice(0, first.start)}${tag}${after.slice(first.start)}`;
    }
    page = after;
    changes.push(`${adding ? "added to" : "changed"} ${picks.map((p) => p.label).join(", ")}: ${clip(change, 60)}`);
    yield { type: "note", text: `${adding ? "Added to" : "Changed"} ${picks.map((p) => p.label).join(", ")}` };
  }
  return { html: page, changes, refused, warnings, calls: counter.n };
}

const cssVars = (html: string) => [...new Set([...html.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))].slice(0, 20).join(", ") || "none";

