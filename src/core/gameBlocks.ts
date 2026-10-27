/**
 * Pages of blocks (`src/core/xblocks/`, the runtime is `X_RUNTIME`): the page carries only its description, the app adds the runtime
 * when the page is shown, tested or saved. This file is the way in; the language is in `xdocs.ts`, its checker in `xcheck.ts` and
 * the way a page is written in steps in `xbuild.ts`.
 */
import { X_RUNTIME } from "./xblocks.generated";

const BLOCK_TAG = /<(?:x|game)-(?:state|map|platformer|scene|battle|dialog|rule|value|list|timer|clock|calc|asset|art|log|legend)\b/i;

/** Whether a page is written with blocks. */
export const usesBlocks = (html: string) => BLOCK_TAG.test(html);

/** The runtime added to a page that uses blocks but does not carry it. */
export function withBlocks(html: string): string {
  if (!usesBlocks(html) || /id=["']xblocks["']|window\.X\s*=/.test(html)) return html;
  const tag = `<script id="xblocks">${X_RUNTIME}</script>\n`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tag}</body>`) : html + tag;
}

export interface LayoutReport { viewport: { w: number; h: number; scrollH?: number }; boxes: { name: string; x: number; y: number; w: number; h: number }[]; alerts: string[] }

/** The layout of a page as a few lines of text for the model: a small plan, the exact boxes, the problems. */
export function layoutText(r: LayoutReport, cols = 48, rows = 14): string {
  const sx = cols / Math.max(1, r.viewport.w), sy = rows / Math.max(1, r.viewport.scrollH ?? r.viewport.h);
  const grid = Array.from({ length: rows }, () => Array(cols).fill("."));
  const named = r.boxes.filter((b) => /^game-|#/.test(b.name) || b.w * b.h > 3000).slice(0, 12);
  named.forEach((b, i) => {
    const ch = String.fromCharCode(65 + i);
    for (let y = Math.floor(b.y * sy); y <= Math.min(rows - 1, Math.floor((b.y + b.h) * sy - 0.01)); y++)
      for (let x = Math.floor(b.x * sx); x <= Math.min(cols - 1, Math.floor((b.x + b.w) * sx - 0.01)); x++)
        if (y >= 0 && x >= 0) grid[y][x] = grid[y][x] === "." ? ch : "*";
  });
  const key = named.map((b, i) => `${String.fromCharCode(65 + i)} ${b.name} ${b.x},${b.y} ${b.w}x${b.h}`).join("\n");
  return `${grid.map((row) => row.join("")).join("\n")}\n${key}\n${r.alerts.length ? r.alerts.join("\n") : "no overlap, nothing off screen"}`;
}
