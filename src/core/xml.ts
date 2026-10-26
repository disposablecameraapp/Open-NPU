// A tiny XML reader for Office parts: elements, attributes and text, namespaces kept in the names ("w:p").
// Not a validating parser: it reads what Word, Excel and PowerPoint write.

export interface XNode { name: string; attrs: Record<string, string>; kids: (XNode | string)[] }

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const unesc = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
  if (e[0] !== "#") return ENT[e.toLowerCase()];
  const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  try { return String.fromCodePoint(n); } catch { return ""; }
});
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Text of a cell or run, safe in XML (control characters Word refuses are dropped). */
export const escText = (s: string) => esc(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export function parseXml(src: string): XNode {
  const root: XNode = { name: "#root", attrs: {}, kids: [] };
  const stack: XNode[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(src)); ) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.kids.push(m[1]);
    else if (m[3]) {
      if (m[2]) { if (stack.length > 1) stack.pop(); continue; }
      const attrs: Record<string, string> = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unesc(a[2] ?? a[3] ?? "");
      const node: XNode = { name: m[3], attrs, kids: [] };
      top.kids.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) top.kids.push(unesc(m[6]));
  }
  return (root.kids.find((k): k is XNode => typeof k !== "string") ?? root);
}

export const elems = (n: XNode, name?: string): XNode[] => n.kids.filter((k): k is XNode => typeof k !== "string" && (!name || k.name === name));
export const first = (n: XNode, name: string): XNode | undefined => elems(n, name)[0];
/** Every descendant with this name, in document order. */
export function all(n: XNode, name: string, out: XNode[] = []): XNode[] {
  for (const k of n.kids) if (typeof k !== "string") { if (k.name === name) out.push(k); all(k, name, out); }
  return out;
}
export const textOf = (n: XNode): string => n.kids.map((k) => (typeof k === "string" ? k : textOf(k))).join("");
