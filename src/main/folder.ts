import * as fs from "fs";
import * as path from "path";
import type { FolderCall } from "../core/folderTools";

const SKIP_DIRS = new Set(["node_modules", ".git", ".hg", ".svn", "__pycache__", ".venv", "venv", "dist", "build", "out", ".next", "target", "$RECYCLE.BIN", "System Volume Information"]);
const MAX_ENTRIES = 200;
const MAX_SEARCH_FILES = 3000;
const MAX_SEARCH_BYTES = 1_000_000;
const MAX_HITS = 30;
const MAX_DEPTH = 8;

/** A path the model gave, resolved inside the folder. Anything that leaves it (.., another drive, a link pointing out) is refused. */
export function resolveInside(root: string, rel: string): string {
  const realRoot = fs.realpathSync(root);
  const target = path.resolve(realRoot, rel.trim() === "" || rel.trim() === "." ? "." : rel.trim());
  const inside = (p: string) => { const r = path.relative(realRoot, p); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); };
  if (!inside(target)) throw new Error("That path is outside the project folder.");
  let real: string;
  try { real = fs.realpathSync(target); } catch { throw new Error("No such file or folder."); }
  if (!inside(real)) throw new Error("That path is outside the project folder.");
  return real;
}

const shown = (root: string, p: string) => path.relative(fs.realpathSync(root), p).split(path.sep).join("/") || ".";
const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 102.4) / 10} KB` : `${Math.round(n / 104857.6) / 10} MB`);

function isText(buf: Buffer): boolean {
  return !buf.subarray(0, 4096).includes(0);
}

export function listDir(root: string, rel: string): string {
  const dir = resolveInside(root, rel);
  if (!fs.statSync(dir).isDirectory()) throw new Error("That is a file, not a folder. Use readfile.");
  const all = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !(e.isDirectory() && SKIP_DIRS.has(e.name)));
  all.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  const rows = all.slice(0, MAX_ENTRIES).map((e) => {
    if (e.isDirectory()) return `${e.name}/`;
    let size = "";
    try { size = `  (${kb(fs.statSync(path.join(dir, e.name)).size)})`; } catch { /* unreadable entry */ }
    return `${e.name}${size}`;
  });
  if (!rows.length) return `${shown(root, dir)}: empty.`;
  return `${shown(root, dir)}:\n${rows.join("\n")}${all.length > MAX_ENTRIES ? `\n[… ${all.length - MAX_ENTRIES} more entries not shown]` : ""}`;
}

export function readFile(root: string, rel: string, maxChars: number): string {
  const file = resolveInside(root, rel);
  const st = fs.statSync(file);
  if (st.isDirectory()) throw new Error("That is a folder, not a file. Use listdir.");
  if (st.size > 20_000_000) throw new Error(`The file is ${kb(st.size)}, too big to read.`);
  const buf = fs.readFileSync(file);
  if (!isText(buf)) throw new Error("This is not a text file (binary content), so it cannot be read.");
  const text = buf.toString("utf8");
  if (text.length <= maxChars) return text || "[empty file]";
  return `${text.slice(0, maxChars)}\n[… cut after ${maxChars} of ${text.length} characters to fit the model's context. Search for a word to find the part you need.]`;
}

export function searchFiles(root: string, needle: string): string {
  const top = resolveInside(root, ".");
  const q = needle.toLowerCase();
  const hits: string[] = [];
  let scanned = 0;
  let capped = false;
  const walk = (dir: string, depth: number) => {
    if (capped || depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (capped) return;
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full, depth + 1); continue; }
      if (!e.isFile()) continue;
      if (++scanned > MAX_SEARCH_FILES) { capped = true; return; }
      let buf: Buffer;
      try { if (fs.statSync(full).size > MAX_SEARCH_BYTES) continue; buf = fs.readFileSync(full); } catch { continue; }
      if (!isText(buf)) continue;
      const lines = buf.toString("utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].toLowerCase().includes(q)) continue;
        hits.push(`${shown(root, full)}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
        if (hits.length >= MAX_HITS) { capped = true; return; }
      }
    }
  };
  walk(top, 0);
  if (!hits.length) return `No file contains “${needle}”${scanned > MAX_SEARCH_FILES ? " in the first files scanned" : ""}.`;
  return `${hits.join("\n")}${capped ? `\n[… more matches may exist, search for something more specific]` : ""}`;
}

/** Runs one block of the model against the project folder. Throws a readable message on failure. */
export function runFolderCall(root: string, call: FolderCall, maxChars: number): string {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("The project folder is no longer there. Choose it again in the project.");
  if (call.op === "list") return listDir(root, call.arg);
  if (call.op === "read") return readFile(root, call.arg, maxChars);
  return searchFiles(root, call.arg);
}
