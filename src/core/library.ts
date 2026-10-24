import * as fs from "fs";
import * as path from "path";

/** A small JSON-file collection keyed by `id`. Writes go through a temp file so a crash cannot truncate it. */
export class JsonStore<T extends { id: string }> {
  private items: T[] | null = null;
  constructor(private file: string) {}

  private load(): T[] {
    if (!this.items) {
      try { const v = JSON.parse(fs.readFileSync(this.file, "utf8")); this.items = Array.isArray(v) ? v : []; } catch { this.items = []; }
    }
    return this.items;
  }
  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.items, null, 2));
    fs.renameSync(tmp, this.file);
  }
  list(): T[] { return [...this.load()]; }
  get(id: string): T | undefined { return this.load().find((x) => x.id === id); }
  upsert(item: T): T {
    const all = this.load();
    const i = all.findIndex((x) => x.id === item.id);
    if (i >= 0) all[i] = item; else all.push(item);
    this.save();
    return item;
  }
  remove(id: string): void {
    this.items = this.load().filter((x) => x.id !== id);
    this.save();
  }
}
