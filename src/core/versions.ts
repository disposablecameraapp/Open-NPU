import type { Artifact, ArtifactKind } from "../shared/types";

/**
 * The versions of a file. Nothing is ever deleted here unless the person does it: a change adds a version, going back adds one too
 * (a branch from an older version). A version stores only what differs from its parent (lines), with a full copy now and then so
 * that reading one never walks a long chain.
 */

/** Lines of the parent's text that are replaced: `del` lines from line `at` are swapped for `add`. */
export interface Hunk { at: number; del: number; add: string[] }

export type VersionBy = "assistant" | "auto" | "you" | "restore";

export interface VersionNode {
  id: string;
  /** The number shown (v1, v2...). Counted up for every new version, never reused, even after one is deleted. */
  n: number;
  parent: string | null;
  title: string;
  at: number;
  by: VersionBy;
  /** Complete text (the first version, every few versions, and whenever a delta would not be smaller). */
  full?: string;
  /** Else: the changes from the parent's text. */
  delta?: Hunk[];
  lines: number;
  plus: number;
  minus: number;
  /** Bytes kept for this version (what it costs on disk). */
  stored: number;
}

export interface History {
  /** The file's key (see `lineageKey`). */
  id: string;
  title: string;
  kind: ArtifactKind;
  language: string;
  nodes: VersionNode[];
  /** The version the app uses. A new version replaces it by itself. */
  main: string;
  counter: number;
}

export interface VersionMeta { id: string; n: number; parent: string | null; title: string; at: number; by: VersionBy; plus: number; minus: number; lines: number; stored: number; children: number }

/** A full copy is kept at least every this many versions along a branch. */
export const CHECKPOINT_EVERY = 20;
const DP_LIMIT = 2_500_000;

/** Which file an artifact is a version of: the chat artifacts of one chat with the same title are the same file across turns. */
export function lineageKey(a: Pick<Artifact, "id" | "title" | "source">): string {
  if (a.source.type === "chat" && a.source.conversationId) return `chat:${a.source.conversationId}:${a.title.trim().toLowerCase()}`;
  return `art:${a.id}`;
}

const turnOf = (a: Artifact): number => Number(/^.+:(\d+):\d+$/.exec(a.id)?.[1] ?? -1);

/** One entry per file: the newest turn of a chat file (the others are older states of it, kept as its versions). */
export function currentFiles(list: Artifact[]): Artifact[] {
  const best = new Map<string, Artifact>();
  for (const a of list) {
    const k = lineageKey(a);
    const b = best.get(k);
    if (!b || turnOf(a) > turnOf(b) || (turnOf(a) === turnOf(b) && a.updated >= b.updated)) best.set(k, a);
  }
  return list.filter((a) => best.get(lineageKey(a)) === a);
}

// ---- text diff

type Op = { t: "eq" | "add" | "del"; line: string };

export function diffLines(a: string[], b: string[]): Op[] {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const ops: Op[] = a.slice(0, s).map((line) => ({ t: "eq", line }));
  const x = a.slice(s, ea), y = b.slice(s, eb);
  if (x.length && y.length && x.length * y.length <= DP_LIMIT) {
    const w = y.length + 1;
    const t = new Uint32Array((x.length + 1) * w);
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) t[i * w + j] = x[i] === y[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    let i = 0, j = 0;
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) { ops.push({ t: "eq", line: x[i] }); i++; j++; }
      else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) ops.push({ t: "del", line: x[i++] });
      else ops.push({ t: "add", line: y[j++] });
    }
    while (i < x.length) ops.push({ t: "del", line: x[i++] });
    while (j < y.length) ops.push({ t: "add", line: y[j++] });
  } else {
    for (const line of x) ops.push({ t: "del", line });
    for (const line of y) ops.push({ t: "add", line });
  }
  for (const line of a.slice(ea)) ops.push({ t: "eq", line });
  return ops;
}

export function hunksOf(ops: Op[]): Hunk[] {
  const out: Hunk[] = [];
  let old = 0;
  let cur: Hunk | null = null;
  for (const o of ops) {
    if (o.t === "eq") { cur = null; old++; continue; }
    if (!cur) { cur = { at: old, del: 0, add: [] }; out.push(cur); }
    if (o.t === "del") { cur.del++; old++; } else cur.add.push(o.line);
  }
  return out;
}

export function applyHunks(base: string[], hunks: Hunk[]): string[] {
  const out: string[] = [];
  let at = 0;
  for (const h of hunks) {
    out.push(...base.slice(at, h.at), ...h.add);
    at = h.at + h.del;
  }
  out.push(...base.slice(at));
  return out;
}

export const linesOf = (text: string): string[] => text.split("\n");

/** What differs between two texts, with `context` unchanged lines around each change; a gap is a row with `skipped`. */
export interface DiffRow { t: "eq" | "add" | "del" | "gap"; line: string; skipped?: number; a?: number; b?: number }
export function unifiedDiff(from: string, to: string, context = 3): { rows: DiffRow[]; plus: number; minus: number } {
  const ops = diffLines(linesOf(from), linesOf(to));
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((o, i) => { if (o.t !== "eq") for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) keep[k] = true; });
  const rows: DiffRow[] = [];
  let a = 0, b = 0, plus = 0, minus = 0, skipped = 0;
  ops.forEach((o, i) => {
    const row: DiffRow = { t: o.t, line: o.line, a: o.t === "add" ? undefined : a + 1, b: o.t === "del" ? undefined : b + 1 };
    if (o.t !== "add") a++;
    if (o.t !== "del") b++;
    if (o.t === "add") plus++;
    if (o.t === "del") minus++;
    if (keep[i]) {
      if (skipped) { rows.push({ t: "gap", line: "", skipped }); skipped = 0; }
      rows.push(row);
    } else skipped++;
  });
  if (skipped && rows.length) rows.push({ t: "gap", line: "", skipped });
  return { rows, plus, minus };
}

// ---- history

const byId = (h: History, id: string) => h.nodes.find((n) => n.id === id);
const childrenOf = (h: History, id: string) => h.nodes.filter((n) => n.parent === id);
const size = (n: Pick<VersionNode, "full" | "delta">) => (n.full !== undefined ? n.full.length : (n.delta ?? []).reduce((s, d) => s + 12 + d.add.reduce((t, l) => t + l.length + 1, 0), 0));

/** The complete text of a version, or null when there is none by that id. */
export function contentOf(h: History, id: string): string | null {
  const chain: VersionNode[] = [];
  for (let n = byId(h, id); n; n = n.full !== undefined || !n.parent ? undefined : byId(h, n.parent)) {
    chain.push(n);
    if (n.full !== undefined) break;
  }
  const root = chain[chain.length - 1];
  if (!root || root.full === undefined) return null;
  let lines = linesOf(root.full);
  for (let i = chain.length - 2; i >= 0; i--) lines = applyHunks(lines, chain[i].delta ?? []);
  return lines.join("\n");
}

/** How many versions back the nearest complete copy sits. */
function depth(h: History, parent: string | null): number {
  let d = 0;
  for (let n = parent ? byId(h, parent) : undefined; n && n.full === undefined; n = n.parent ? byId(h, n.parent) : undefined) d++;
  return d;
}

function encode(h: History, parent: string | null, text: string): Pick<VersionNode, "full" | "delta" | "lines" | "plus" | "minus" | "stored"> {
  const lines = linesOf(text);
  const base = parent ? contentOf(h, parent) : null;
  if (base === null) return { full: text, lines: lines.length, plus: lines.length, minus: 0, stored: text.length };
  const hunks = hunksOf(diffLines(linesOf(base), lines));
  const plus = hunks.reduce((s, x) => s + x.add.length, 0), minus = hunks.reduce((s, x) => s + x.del, 0);
  const delta = { delta: hunks };
  if (depth(h, parent) + 1 >= CHECKPOINT_EVERY || size(delta) >= text.length * 0.7) return { full: text, lines: lines.length, plus, minus, stored: text.length };
  return { ...delta, lines: lines.length, plus, minus, stored: size(delta) };
}

const label = (s: string | undefined, fallback: string) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || fallback;
let seq = 0;
const newId = (now: number) => `v${now.toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface Revision { key: string; title: string; kind: ArtifactKind; language: string; content: string; note?: string; by?: VersionBy; now: number }

/** A saved text becomes a version when it differs from the main one; saving the same text again changes nothing. */
export function record(h: History | undefined, r: Revision): { history: History; node: VersionNode | null } {
  if (!h) {
    const history: History = { id: r.key, title: r.title, kind: r.kind, language: r.language, nodes: [], main: "", counter: 0 };
    const node = add(history, null, r.content, label(r.note, "Created"), r.by ?? "assistant", r.now);
    return { history, node };
  }
  const head = h.main ? contentOf(h, h.main) : null;
  const next: History = { ...h, title: r.title, kind: r.kind, language: r.language, nodes: [...h.nodes] };
  if (head === r.content) return { history: next, node: null };
  const node = add(next, h.main || null, r.content, label(r.note, "Modified"), r.by ?? "assistant", r.now);
  return { history: next, node };
}

function add(h: History, parent: string | null, content: string, title: string, by: VersionBy, now: number): VersionNode {
  const node: VersionNode = { id: newId(now), n: ++h.counter, parent, title, at: now, by, ...encode(h, parent, content) };
  h.nodes.push(node);
  h.main = node.id;
  return node;
}

/** The version becomes the one the app uses. Nothing is created: the next change will branch from it. */
export function useVersion(h: History, id: string): History | null {
  return byId(h, id) ? { ...h, main: id } : null;
}

/** Going back: a new version with the text of an older one, as a branch from it. Nothing is lost. */
export function restore(h: History, id: string, now: number): { history: History; node: VersionNode } | null {
  const from = byId(h, id);
  const text = from ? contentOf(h, id) : null;
  if (!from || text === null) return null;
  const history: History = { ...h, nodes: [...h.nodes] };
  const node = add(history, id, text, `Back to v${from.n}`, "restore", now);
  return { history, node };
}

export function rename(h: History, id: string, title: string): History | null {
  if (!byId(h, id)) return null;
  return { ...h, nodes: h.nodes.map((n) => (n.id === id ? { ...n, title: label(title, n.title) } : n)) };
}

/** Deletes one version (the person asked). The one in use cannot go. Its children are kept, handed to its parent, with their text intact. */
export function removeVersion(h: History, id: string): { history: History } | { error: string } {
  const gone = byId(h, id);
  if (!gone) return { error: "That version does not exist any more." };
  if (h.main === id) return { error: "This is the version in use. Choose another one first." };
  const texts = new Map(childrenOf(h, id).map((c) => [c.id, contentOf(h, c.id)] as const));
  const nodes = h.nodes.filter((n) => n.id !== id);
  const rest: History = { ...h, nodes };
  for (const c of childrenOf(h, id)) {
    const text = texts.get(c.id);
    if (text === null || text === undefined) return { error: "Could not read a later version, nothing was deleted." };
    const i = nodes.findIndex((n) => n.id === c.id);
    nodes[i] = { ...c, parent: gone.parent, full: undefined, delta: undefined, ...encode(rest, gone.parent, text) };
  }
  return { history: rest };
}

export function metas(h: History): VersionMeta[] {
  return h.nodes.map((n) => ({ id: n.id, n: n.n, parent: n.parent, title: n.title, at: n.at, by: n.by, plus: n.plus, minus: n.minus, lines: n.lines, stored: n.stored, children: childrenOf(h, n.id).length })).sort((a, b) => b.n - a.n);
}

/** Bytes the versions take against what complete copies of each would. */
export function savings(h: History): { stored: number; whole: number } {
  return { stored: h.nodes.reduce((s, n) => s + n.stored, 0), whole: h.nodes.reduce((s, n) => s + (contentOf(h, n.id)?.length ?? 0), 0) };
}

/** Histories for files saved before versions existed: their entries, oldest turn first, become v1, v2... */
export function seedFrom(entries: Artifact[]): History | undefined {
  const sorted = [...entries].sort((a, b) => turnOf(a) - turnOf(b) || a.created - b.created || a.updated - b.updated);
  let h: History | undefined;
  for (const a of sorted) h = record(h, { key: lineageKey(a), title: a.title, kind: a.kind, language: a.language, content: a.content, note: a.note, now: a.updated || a.created }).history;
  return h;
}
