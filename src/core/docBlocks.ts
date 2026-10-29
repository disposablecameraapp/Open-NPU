// A text document (Markdown, Word text) cut into the blocks a person edits one at a time in the preview: paragraphs, headings, lists, tables and
// fenced blocks, separated by blank lines. A blank line inside a fence does not cut it. Putting the blocks back joins them with one blank line.

const FENCE = /^\s*(```|~~~)/;

export function splitBlocks(src: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  let fence = "";
  const flush = () => { if (cur.length) blocks.push(cur.join("\n")); cur = []; };
  for (const line of src.replace(/\r\n/g, "\n").split("\n")) {
    const f = FENCE.exec(line)?.[1];
    if (f) fence = fence === "" ? f : fence === f ? "" : fence;
    if (!fence && !f && line.trim() === "") flush();
    else cur.push(line);
  }
  flush();
  return blocks;
}

export const joinBlocks = (blocks: string[]): string => blocks.join("\n\n");

/** The document with one block written again; an empty text removes the block. */
export function replaceBlock(src: string, index: number, text: string): string {
  const blocks = splitBlocks(src);
  const t = text.replace(/\s+$/, "");
  if (index < 0 || index >= blocks.length) return t.trim() ? joinBlocks([...blocks, t]) : src;
  if (!t.trim()) blocks.splice(index, 1); else blocks[index] = t;
  return joinBlocks(blocks);
}

/** A block that holds more than text (a chart, a quiz, a diagram): a click on it must reach it, so it is opened with its own button. */
export const isFenced = (block: string): boolean => FENCE.test(block);
