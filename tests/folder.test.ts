import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseFolderCalls, folderInstructions } from "../src/core/folderTools";
import { stripSubagents } from "../src/core/agents";
import { orchestrate } from "../src/core/orchestrate";
import { listDir, readFile, resolveInside, runFolderCall, searchFiles } from "../src/main/folder";
import type { ChatEvent } from "../src/shared/types";

let root: string;
let outside: string;
beforeAll(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "npu-folder-"));
  root = path.join(base, "proj");
  outside = path.join(base, "secret.txt");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.writeFileSync(path.join(root, "README.md"), "# Hello\nThe answer is 42\n");
  fs.writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n// needle here\n");
  fs.writeFileSync(path.join(root, "bin.dat"), Buffer.from([1, 2, 0, 3]));
  fs.writeFileSync(outside, "top secret");
  try { fs.symlinkSync(outside, path.join(root, "link.txt")); } catch { /* no symlinks here */ }
});
afterAll(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));

describe("folder blocks", () => {
  it("parses the three blocks in order and ignores a cut-off one", () => {
    const t = "Let me look. <listdir>.</listdir> then <readfile>src/a.ts</readfile> <searchfiles>needle</searchfiles> <readfile>cut";
    expect(parseFolderCalls(t)).toEqual([{ op: "list", arg: "." }, { op: "read", arg: "src/a.ts" }, { op: "search", arg: "needle" }]);
    expect(parseFolderCalls("<listdir></listdir>")).toEqual([{ op: "list", arg: "" }]);
    expect(parseFolderCalls("<readfile></readfile> <readfileX>a</readfileX>")).toEqual([]);
  });
  it("hides the blocks from the visible answer, also while they stream", () => {
    expect(stripSubagents("Looking <readfile>a.ts</readfile> now")).toBe("Looking  now");
    expect(stripSubagents("Looking <listdir>sr")).toBe("Looking");
    expect(stripSubagents("Looking <readf")).toBe("Looking");
  });
  it("tells the model the folder", () => expect(folderInstructions("C:\\docs")).toContain("C:\\docs"));
});

describe("folder access", () => {
  it("lists, skipping noise folders", () => {
    const out = listDir(root, ".");
    expect(out).toContain("src/");
    expect(out).toContain("README.md");
    expect(out).not.toContain("node_modules");
  });
  it("reads a file and cuts a long one", () => {
    expect(readFile(root, "README.md", 1000)).toContain("42");
    expect(readFile(root, "README.md", 5)).toContain("cut after 5");
  });
  it("refuses binary files, folders, missing files", () => {
    expect(() => readFile(root, "bin.dat", 100)).toThrow(/not a text file/);
    expect(() => readFile(root, "src", 100)).toThrow(/folder/);
    expect(() => readFile(root, "nope.txt", 100)).toThrow(/No such/);
  });
  it("never leaves the folder", () => {
    expect(() => resolveInside(root, "../secret.txt")).toThrow(/outside/);
    expect(() => resolveInside(root, outside)).toThrow(/outside/);
    expect(() => runFolderCall(root, { op: "read", arg: "../../etc/passwd" }, 100)).toThrow();
    if (fs.existsSync(path.join(root, "link.txt"))) expect(() => readFile(root, "link.txt", 100)).toThrow(/outside/);
  });
  it("searches text with file and line", () => {
    expect(searchFiles(root, "NEEDLE")).toContain("src/a.ts:2:");
    expect(searchFiles(root, "zzzz")).toContain("No file contains");
  });
});

describe("orchestrate with a folder", () => {
  it("runs the blocks and sends the results back", async () => {
    const seen: string[] = [];
    let round = 0;
    const stream = async function* (id: string, msgs: { role: string; content: unknown }[]): AsyncGenerator<ChatEvent> {
      seen.push(String(msgs.at(-1)?.content));
      const text = round++ === 0 ? "<readfile>README.md</readfile>" : "It says 42.";
      yield { id, type: "answer", text };
      yield { id, type: "done", stats: { ttftSec: 0, tokPerSec: 1, tokens: 1, totalSec: 0 } };
    };
    const events: ChatEvent[] = [];
    for await (const ev of orchestrate({ id: "x", messages: [{ role: "user", content: "what?" }], subagents: false, stream: stream as never, folder: (c) => runFolderCall(root, c, 1000) })) events.push(ev);
    expect(seen[1]).toContain('<folder_result readfile="README.md">');
    expect(seen[1]).toContain("The answer is 42");
    expect(events.some((e) => e.type === "agent" && e.agent.status === "done")).toBe(true);
  });
});
