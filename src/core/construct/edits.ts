/**
 * Corrections by edit blocks: a long unit is corrected by saying which lines change, never by writing the whole unit again.
 * The output of a small model is slow (about 13 tokens a second), so a correction of three lines in a hundred-line handler is
 * a few seconds instead of a minute, and what was not named cannot be broken.
 *
 *   <<<<<<< SEARCH
 *   lines as they are in the code
 *   =======
 *   lines they become
 *   >>>>>>> REPLACE
 *
 * A block is found exactly, else with the indentation and the line ends ignored. Any block that is not found makes the whole
 * reply unusable (the code is left as it was): half an edit is worse than none.
 */

export interface EditBlock { search: string; replace: string }

/** Units shorter than this are corrected by writing them again: an edit saves nothing there. */
export const EDIT_FROM = 900;

const OPEN = /^\s*<{5,9}\s*SEARCH\s*$/i;
const MID = /^\s*={5,9}\s*$/;
const CLOSE = /^\s*>{5,9}\s*REPLACE\s*$/i;

/** The blocks of a reply, in order. A reply with none is not an edit. */
export function editBlocks(reply: string): EditBlock[] {
  const lines = reply.replace(/\r\n/g, "\n").split("\n");
  const out: EditBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!OPEN.test(lines[i])) continue;
    const search: string[] = [], replace: string[] = [];
    let part: "search" | "replace" | null = "search";
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (part === "search" && MID.test(lines[j])) { part = "replace"; continue; }
      if (part === "replace" && CLOSE.test(lines[j])) { part = null; break; }
      (part === "search" ? search : replace).push(lines[j]);
    }
    if (part === null) { out.push({ search: search.join("\n"), replace: replace.join("\n") }); i = j; }
  }
  return out;
}

const trimmed = (s: string) => s.split("\n").map((l) => l.trim());

/** Where `search` is in `code` (start and end offsets): exactly, else line by line with the indentation ignored. */
function find(code: string, search: string): [number, number] | null {
  if (!search.trim()) return null;
  const at = code.indexOf(search);
  if (at >= 0) return code.indexOf(search, at + 1) >= 0 ? null : [at, at + search.length]; // a block that matches twice names nothing
  const want = trimmed(search.replace(/^\n+|\n+$/g, ""));
  const have = code.split("\n");
  const starts: number[] = [];
  for (let i = 0; i + want.length <= have.length; i++) if (want.every((w, k) => have[i + k].trim() === w)) starts.push(i);
  if (starts.length !== 1) return null;
  const from = have.slice(0, starts[0]).reduce((n, l) => n + l.length + 1, 0);
  const len = have.slice(starts[0], starts[0] + want.length).join("\n").length;
  return [from, from + len];
}

/** The code with every block applied, or null when the reply holds no block or one of them cannot be placed. */
export function applyEdits(code: string, reply: string): { code: string; blocks: number } | null {
  const blocks = editBlocks(reply);
  if (!blocks.length) return null;
  let out = code;
  for (const b of blocks) {
    const at = find(out, b.search);
    if (!at) return null;
    out = out.slice(0, at[0]) + b.replace + out.slice(at[1]);
  }
  return out === code ? null : { code: out, blocks: blocks.length };
}

/** What a corrector is told when the unit is long enough for an edit to be worth it. */
export const EDIT_NOTE = `The unit is long, so this time do NOT reply with the whole corrected unit. Reply with one or more edit blocks and nothing else, each in exactly this form:
<<<<<<< SEARCH
the lines to change, copied exactly as they are in your code (a few lines, enough to be found once)
=======
the lines they become
>>>>>>> REPLACE
Everything outside the blocks stays as it is.`;
