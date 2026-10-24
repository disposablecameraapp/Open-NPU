import { describe, expect, it } from "vitest";
import { highlight } from "../src/core/highlight";
import { isRunnable, runnerFor } from "../src/core/runcode";

const kinds = (code: string, lang: string) => highlight(code, lang).filter((t) => t.c).map((t) => `${t.c}:${t.v}`);

describe("highlight", () => {
  it("colours python: keywords, strings, comments, numbers, calls", () => {
    expect(kinds('def go(x):  # up\n    return "a" + 3', "python")).toEqual(["kw:def", "fn:go", "op::", "com:# up", "kw:return", 'str:"a"', "op:+", "num:3"].filter(Boolean));
  });
  it("never loses or reorders text, whatever it is given", () => {
    const samples: [string, string][] = [
      ["let a = `x${1}` // hi\n/* c */ if (a) { b('s', \"t\") }", "javascript"],
      ['<div class="a">t &amp; <script>let x = 1;</script><style>p{color:#fff}</style></div>', "html"],
      ['{"a": [1, true, null], "b": "c"}', "json"],
      ["x = '''doc", "python"], ['"unterminated', "js"], ["<script>let q = ", "html"], ["a { b: 1px }", "css"]
    ];
    for (const [code, lang] of samples) expect(highlight(code, lang).map((t) => t.v).join("")).toBe(code);
  });
  it("highlights script and style inside a page, and json keys apart from values", () => {
    expect(kinds("<script>const a = 1</script>", "html")).toEqual(expect.arrayContaining(["tag:<script>".replace(">", ""), "kw:const", "num:1"]));
    expect(kinds('{"k": "v"}', "json")).toEqual(["attr:\"k\"", "op::", "str:\"v\""]);
  });
});

describe("runnerFor", () => {
  it("knows Python and JavaScript, and tries the right program names per system", () => {
    expect(runnerFor("python", "win32")!.programs.map((p) => p.cmd)).toEqual(["python", "py", "python3"]);
    expect(runnerFor("py", "linux")!.programs[0].cmd).toBe("python3");
    expect(runnerFor("javascript", "win32")!.programs[0].asNode).toBe(true);
    expect(runnerFor("rust", "linux")).toBeNull();
    expect(isRunnable("python")).toBe(true);
    expect(isRunnable("text")).toBe(false);
  });
});
