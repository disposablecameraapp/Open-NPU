import { describe, expect, it } from "vitest";
import type { Artifact } from "../src/shared/types";
import { CHECKPOINT_EVERY, contentOf, currentFiles, lineageKey, metas, record, removeVersion, restore, savings, unifiedDiff, useVersion, type History } from "../src/core/versions";
import { VersionBook } from "../src/core/versionBook";

const lines = (n: number, tag = "x") => Array.from({ length: n }, (_, i) => `line ${i} ${tag}`).join("\n");
const base = { key: "k", title: "Game", kind: "html" as const, language: "html" };
const rec = (h: History | undefined, content: string, note?: string, now = 1) => record(h, { ...base, content, note, now });

describe("versions", () => {
  it("v1 is the base, a saved copy of the same text is not a new version", () => {
    const a = rec(undefined, "a\nb");
    expect(a.node?.n).toBe(1);
    const b = rec(a.history, "a\nb");
    expect(b.node).toBeNull();
    expect(b.history.nodes).toHaveLength(1);
    const c = rec(b.history, "a\nB", "fix bug");
    expect(c.node?.n).toBe(2);
    expect(c.node?.title).toBe("fix bug");
    expect(c.history.main).toBe(c.node!.id);
  });

  it("stores only differences and reads every version back exactly", () => {
    const texts = [lines(300), lines(300).replace("line 10 x", "line 10 CHANGED"), lines(300).replace("line 10 x", "line 10 CHANGED\nnew line"), `${lines(300)}\n\ntrailing\r\n`];
    let h: History | undefined;
    const ids: string[] = [];
    for (const t of texts) { const r = rec(h, t); h = r.history; if (r.node) ids.push(r.node.id); }
    expect(ids).toHaveLength(4);
    ids.forEach((id, i) => expect(contentOf(h!, id)).toBe(texts[i]));
    const kept = h!.nodes.filter((n) => n.full === undefined).length;
    expect(kept).toBeGreaterThanOrEqual(2);
    const s = savings(h!);
    expect(s.stored).toBeLessThan(s.whole / 2);
  });

  it("keeps a full copy every few versions so reading stays cheap", () => {
    let h: History | undefined;
    for (let i = 0; i < CHECKPOINT_EVERY * 2 + 3; i++) h = rec(h, lines(200).replace("line 5 x", `line 5 v${i}`)).history;
    expect(h!.nodes.filter((n) => n.full !== undefined).length).toBeGreaterThanOrEqual(3);
    expect(contentOf(h!, h!.nodes[7].id)).toContain("line 5 v7");
  });

  it("going back adds a version branching from the old one and loses nothing", () => {
    let h = rec(undefined, "one").history;
    h = rec(h, "two").history;
    h = rec(h, "three").history;
    const v1 = h.nodes[0].id;
    const r = restore(h, v1, 5)!;
    expect(r.node.n).toBe(4);
    expect(r.node.parent).toBe(v1);
    expect(contentOf(r.history, r.history.main)).toBe("one");
    expect(r.history.nodes.map((n) => contentOf(r.history, n.id))).toEqual(["one", "two", "three", "one"]);
    expect(metas(r.history).find((m) => m.id === v1)?.children).toBe(2);
  });

  it("using a version creates nothing; the next change branches from it and replaces it", () => {
    let h = rec(undefined, "one").history;
    h = rec(h, "two").history;
    const v1 = h.nodes[0].id;
    h = useVersion(h, v1)!;
    expect(h.nodes).toHaveLength(2);
    const next = rec(h, "one and more");
    expect(next.node?.parent).toBe(v1);
    expect(next.node?.n).toBe(3);
    expect(next.history.main).toBe(next.node!.id);
  });

  it("deleting a version keeps its children's text and never reuses its number", () => {
    let h = rec(undefined, lines(50)).history;
    h = rec(h, lines(50).replace("line 3 x", "A")).history;
    h = rec(h, lines(50).replace("line 3 x", "B")).history;
    const [v1, v2, v3] = h.nodes;
    expect("error" in removeVersion(h, v3.id)).toBe(true);
    const r = removeVersion(h, v2.id);
    if ("error" in r) throw new Error(r.error);
    expect(r.history.nodes).toHaveLength(2);
    expect(contentOf(r.history, v3.id)).toBe(lines(50).replace("line 3 x", "B"));
    expect(contentOf(r.history, v1.id)).toBe(lines(50));
    const after = rec(r.history, "z");
    expect(after.node?.n).toBe(4);
    const root = removeVersion({ ...r.history, main: v3.id }, v1.id);
    if ("error" in root) throw new Error(root.error);
    expect(contentOf(root.history, v3.id)).toBe(lines(50).replace("line 3 x", "B"));
  });

  it("shows only the changed lines with context", () => {
    const d = unifiedDiff(lines(40), lines(40).replace("line 20 x", "line 20 y"), 2);
    expect(d.plus).toBe(1);
    expect(d.minus).toBe(1);
    expect(d.rows.filter((r) => r.t === "gap")).toHaveLength(2);
    expect(d.rows.some((r) => r.t === "add" && r.line === "line 20 y")).toBe(true);
  });
});

describe("version book", () => {
  const art = (turn: number, content: string): Artifact => ({ id: `c1:${turn}:0`, title: "Snake", kind: "html", language: "html", content, projectId: null, source: { type: "chat", conversationId: "c1" }, created: turn, updated: turn });
  const make = () => {
    let list: Artifact[] = [];
    const store = new Map<string, History>();
    const book = new VersionBook(
      { get: (id) => store.get(id), put: (h) => void store.set(h.id, h), drop: (id) => void store.delete(id), list: () => [...store.values()] },
      { list: () => list, upsert: (a) => { list = list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a]; }, remove: (id) => { list = list.filter((x) => x.id !== id); } }
    );
    const save = (a: Artifact) => { list = list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a]; book.save(a); };
    return { book, save, list: () => list, store };
  };

  it("the same file over several turns is one file with several versions", () => {
    const t = make();
    t.save(art(1, "a")); t.save(art(3, "b")); t.save(art(5, "b"));
    expect(currentFiles(t.list()).map((a) => a.id)).toEqual(["c1:5:0"]);
    expect(t.book.versions("c1:5:0")?.versions.map((v) => v.n)).toEqual([2, 1]);
    expect(lineageKey(t.list()[0])).toBe("chat:c1:snake");
  });

  it("going back updates the library entry and deleting the file removes its versions", () => {
    const t = make();
    t.save(art(1, "a")); t.save(art(2, "b"));
    const list = t.book.versions("c1:2:0")!;
    const v1 = list.versions.find((v) => v.n === 1)!;
    const r = t.book.act("c1:2:0", { type: "restore", id: v1.id });
    expect(r.ok).toBe(true);
    expect(r.content).toBe("a");
    expect(t.list().find((a) => a.id === r.artifactId)?.content).toBe("a");
    expect(r.list?.versions).toHaveLength(3);
    t.book.forget("c1:2:0");
    expect(t.list()).toHaveLength(0);
    expect(t.store.size).toBe(0);
  });

  it("files saved before versions existed get theirs from their old states", () => {
    const t = make();
    const a1 = art(1, "a"), a2 = art(4, "b");
    t.list().push(a1, a2);
    const store = t.store;
    // not saved through the book: seed reads the library
    const lib = [a1, a2];
    const book = new VersionBook({ get: (id) => store.get(id), put: (h) => void store.set(h.id, h), drop: (id) => void store.delete(id), list: () => [...store.values()] }, { list: () => lib, upsert: () => undefined, remove: () => undefined });
    book.seed();
    expect(book.versions("c1:4:0")?.versions.map((v) => v.n)).toEqual([2, 1]);
  });
});
