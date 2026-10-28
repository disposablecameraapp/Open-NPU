/**
 * Round 3 (last) of the planning prompts for the prompt lab. Round 2 (`promptLabPlans2.ts`) showed that the core first, with placeholders
 * and one example of the form (B2), is the wording a 4B model follows most steadily; what was left open is the big request (features split
 * per instance: one per kind of enemy, one per level) and whether the form holds on programs that are not a Mario game.
 * Here B2 is kept and only the rule about families and the length of a line are varied.
 */
import { BIG, MARIO } from "./promptLabPlans";
import { BIG_CORE, BIG_FEATURES, EXAMPLE, FORM, SMALL_CORE, SMALL_FEATURES, WORDS, checks } from "./promptLabPlans2";

const FAMILY = `Rule: a family of similar things (kinds of enemies, levels, power-ups) is ONE feature that holds a small table of them, never one feature per member. Every thing the request mentions belongs to exactly one feature, and you invent nothing it does not describe.`;
const SHORT = `Keep every line under 160 characters: names and short phrases, no sentences.`;

const KANBAN = "A kanban board in one page: three columns (to do, doing, done), cards with a title and a colour, add a card, drag a card to another column, delete a card, a counter per column, everything saved in the browser, a button to clear the done column.";
const KANBAN_CORE = "core | state S (columns, cards, dragging), save(), load(), moveCard(id, column)";
const KANBAN_FEATURES = `feature columns | the three columns with their title and counter, drawing them | core, cards
feature cards | a card with title and colour, adding and deleting one, drawing it | core
feature drag | picking a card up and dropping it in another column | core, cards, columns
feature storage | saving and loading the board in the browser | core
feature cleanup | the button that clears the done column | core, columns`;

const TETRIS = "Tetris in one page: the seven pieces falling in a ten by twenty grid, arrows to move and rotate, space to drop at once, full lines disappear, the next piece is shown, a ghost piece shows where it lands, a hold slot, score and level that speeds up, high score saved, game over and restart.";
const TETRIS_CORE = "core | state S (mode, grid, piece, next, hold, score, level, lines, best), fits(piece, dx, dy, rot), lockPiece(), and the list of features each with init, update and draw";
const TETRIS_FEATURES = `feature pieces | the seven shapes with their rotations, the random bag, spawning the next one | core
feature board | the ten by twenty grid, locking a piece, clearing full lines, drawing the grid | core, pieces
feature controls | arrows to move and rotate, space to drop at once, the hold key | core, pieces, board
feature ghost | where the piece will land and its drawing | core, board
feature panel | next piece, hold slot, score, level and best score drawn beside the grid | core, pieces
feature levels | the falling speed that grows with the level and the lines | core
feature screens | game over, restart and saving the best score | core`;

const block = (name: string, rule: string, request: string, lo: number, hi: number, core: string, features: string) => `## ${name}

${WORDS}
${rule ? rule + "\n" : ""}${FORM}
${EXAMPLE}

The program: ${request}

${checks(lo, hi)}

### Ideal

${core}
${features}
`;

export const LAB_PLAN_TESTS_3 = `---
title: Planning, last round (core and features)
runs: 3
max_tokens: 900
thinking: off
---

# Planning, last round

Round 2 showed that the core first, with placeholders and one example of the form, is the wording a 4B model follows most steadily.
This round keeps that wording and varies only two things: a rule that a family of similar things is ONE feature holding a table (round 2 had features per kind of enemy and per level), and a limit on the length of a line.
The last two prompts are not Mario: a kanban board and Tetris, to see that the form holds on other programs.

${block("D1 the wording of round 2 (much bigger request)", "", BIG, 9, 16, BIG_CORE, BIG_FEATURES)}
${block("D2 families are one feature (small request)", FAMILY, MARIO, 7, 14, SMALL_CORE, SMALL_FEATURES)}
${block("D3 families are one feature (much bigger request)", FAMILY, BIG, 9, 16, BIG_CORE, BIG_FEATURES)}
${block("D4 families and short lines (much bigger request)", FAMILY + "\n" + SHORT, BIG, 9, 16, BIG_CORE, BIG_FEATURES)}
${block("D5 families and short lines (kanban board)", FAMILY + "\n" + SHORT, KANBAN, 5, 9, KANBAN_CORE, KANBAN_FEATURES)}
${block("D6 families and short lines (Tetris)", FAMILY + "\n" + SHORT, TETRIS, 6, 12, TETRIS_CORE, TETRIS_FEATURES)}`;
