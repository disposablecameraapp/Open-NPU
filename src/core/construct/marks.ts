/** A comment that keeps what a page was made from, written so that no `--` ends it early. */
export const markOf = (name: string, data: unknown) => `<!-- ${name} ${JSON.stringify(data).replace(/--/g, "-\\u002d")} -->\n`;
export const readMark = (html: string, name: string): unknown => {
  const m = new RegExp(`<!--\\s*${name}\\s+([\\s\\S]*?)-->`).exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};
