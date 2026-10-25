import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import ts from "typescript";

/**
 * React runs a component's hooks in the same order on every render. A hook placed after an early `return` is skipped on the renders that
 * return early, and React throws error #310 ("Rendered more hooks than during the previous render") when the component later renders in full.
 * This reads every component of the renderer and fails when it finds one.
 */
const DIR = path.join(__dirname, "..", "src", "renderer");

function problemsIn(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const own = (n: ts.Node, found: (x: ts.Node) => boolean): boolean => {
    let yes = false;
    const walk = (x: ts.Node) => {
      if (yes) return;
      if (found(x)) { yes = true; return; }
      if (x !== n && (ts.isFunctionLike(x))) return; // what happens inside a callback is not this component's order
      ts.forEachChild(x, walk);
    };
    walk(n);
    return yes;
  };
  const hasReturn = (n: ts.Node) => own(n, (x) => ts.isReturnStatement(x));
  const hasHook = (n: ts.Node) => own(n, (x) => ts.isCallExpression(x) && /^use[A-Z]/.test(x.expression.getText(src)));
  const check = (name: string, body: ts.Node | undefined) => {
    if (!body || !ts.isBlock(body)) return;
    let returned = false;
    for (const st of body.statements) {
      if (returned && hasHook(st)) {
        const { line } = src.getLineAndCharacterOfPosition(st.getStart(src));
        out.push(`${path.basename(file)}:${line + 1} ${name}: a hook after an early return`);
      }
      if (ts.isReturnStatement(st) || (ts.isIfStatement(st) && hasReturn(st))) returned = true;
    }
  };
  const visit = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text)) check(n.name.text, n.body);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^[A-Z]/.test(n.name.text) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) check(n.name.text, n.initializer.body);
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

describe("React hooks", () => {
  it("are never called after an early return (React error #310)", () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".tsx")).map((f) => path.join(DIR, f));
    expect(files.length).toBeGreaterThan(10);
    expect(files.flatMap(problemsIn)).toEqual([]);
  });

  it("notices one when there is one", () => {
    const tmp = path.join(require("os").tmpdir(), "bad-hook.tsx");
    fs.writeFileSync(tmp, 'import { useState } from "react";\nexport function Bad({ a }: { a: boolean }) {\n  if (!a) return null;\n  const [x] = useState(1);\n  return <div>{x}</div>;\n}\n');
    expect(problemsIn(tmp).length).toBe(1);
  });
});
