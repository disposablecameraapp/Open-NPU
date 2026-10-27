import type { Artifact } from "../shared/types";
import { contentOf, currentFiles, lineageKey, metas, record, removeVersion, rename, restore, savings, seedFrom, useVersion, type History, type VersionMeta } from "./versions";

/** Where the histories are kept (a JSON file in the app, a map in the browser preview). */
export interface HistoryStorage { get(id: string): History | undefined; put(h: History): void; drop(id: string): void; list(): History[] }
/** The artifacts as the app keeps them. */
export interface ArtifactSource { list(): Artifact[]; upsert(a: Artifact): unknown; remove(id: string): void }

export interface VersionList { key: string; title: string; main: string; versions: VersionMeta[]; stored: number; whole: number }
export type VersionAction = { type: "use" | "restore" | "delete"; id: string } | { type: "rename"; id: string; title: string };
export interface VersionResult { ok: boolean; error?: string; list: VersionList | null; /** The text now in use, when the action changed it. */ content?: string; /** The artifact (as the library lists it) that holds it. */ artifactId?: string }

/** The versions of every file: saving, listing, going back, choosing the one the app uses, deleting what the person asks to delete. */
export class VersionBook {
  constructor(private histories: HistoryStorage, private artifacts: ArtifactSource) {}

  /** A saved artifact: a new version when its text differs from the one in use. */
  save(a: Artifact, now = Date.now()): void {
    const key = lineageKey(a);
    const { history } = record(this.histories.get(key), { key, title: a.title, kind: a.kind, language: a.language, content: a.content, note: a.note, by: a.by, now });
    this.histories.put(history);
  }

  /** Files saved before versions existed get theirs: the states they went through, oldest first. */
  seed(): void {
    const groups = new Map<string, Artifact[]>();
    for (const a of this.artifacts.list()) groups.set(lineageKey(a), [...(groups.get(lineageKey(a)) ?? []), a]);
    for (const [key, entries] of groups) {
      if (this.histories.get(key)) continue;
      const h = seedFrom(entries);
      if (h) this.histories.put(h);
    }
  }

  private keyOf(artifactId: string): string | null {
    const a = this.artifacts.list().find((x) => x.id === artifactId);
    return a ? lineageKey(a) : null;
  }

  private listOf(key: string): VersionList | null {
    const h = this.histories.get(key);
    return h ? { key, title: h.title, main: h.main, versions: metas(h), ...savings(h) } : null;
  }

  versions(artifactId: string): VersionList | null {
    const key = this.keyOf(artifactId);
    return key ? this.listOf(key) : null;
  }

  text(artifactId: string, versionId: string): string | null {
    const key = this.keyOf(artifactId);
    const h = key ? this.histories.get(key) : undefined;
    return h ? contentOf(h, versionId) : null;
  }

  /** The library's entry for a file takes the text of the version in use. */
  private sync(key: string, text: string, now: number): Artifact | undefined {
    const entry = currentFiles(this.artifacts.list()).find((a) => lineageKey(a) === key);
    if (!entry) return undefined;
    const next = { ...entry, content: text, updated: now };
    this.artifacts.upsert(next);
    return next;
  }

  act(artifactId: string, action: VersionAction, now = Date.now()): VersionResult {
    const key = this.keyOf(artifactId);
    const h = key ? this.histories.get(key) : undefined;
    if (!key || !h) return { ok: false, error: "This file has no versions yet.", list: null };
    const fail = (error: string): VersionResult => ({ ok: false, error, list: this.listOf(key) });
    let next: History | null = null;
    if (action.type === "use") next = useVersion(h, action.id);
    else if (action.type === "restore") next = restore(h, action.id, now)?.history ?? null;
    else if (action.type === "rename") next = rename(h, action.id, action.title);
    else {
      const r = removeVersion(h, action.id);
      if ("error" in r) return fail(r.error);
      next = r.history;
    }
    if (!next) return fail("That version does not exist any more.");
    this.histories.put(next);
    if (action.type === "rename" || action.type === "delete") return { ok: true, list: this.listOf(key) };
    const text = contentOf(next, next.main);
    const entry = text === null ? undefined : this.sync(key, text, now);
    return { ok: true, list: this.listOf(key), content: text ?? undefined, artifactId: entry?.id };
  }

  /** The person deleted a file: all its states in the library and all its versions go with it. */
  forget(artifactId: string): void {
    const key = this.keyOf(artifactId);
    if (!key) { this.artifacts.remove(artifactId); return; }
    for (const a of this.artifacts.list()) if (lineageKey(a) === key) this.artifacts.remove(a.id);
    this.histories.drop(key);
  }
}
