/**
 * Round 2 of the planning prompts for the prompt lab. Round 1 (`promptLabPlans.ts`) showed that "a core plus features" is the form a 4B
 * model follows best, and the only one whose score did not fall when the request grew; its weak points were the wording of the line form
 * (models wrote the words "block name" and "feature name" as if they were part of the line) and features that were invented or missing.
 * Here only that form is varied.
 */
import { BIG, MARIO } from "./promptLabPlans";

const SMALL_FEATURES = `feature level | the tile grid: ground with holes, platforms, bricks, question blocks, the pipe, the flag; builds it and draws the tiles | core
feature player | position and speed, arrows and jump, falling into a hole, drawing the character | core, level
feature enemies | the mushrooms that walk back and forth, being stomped, hurting from the side | core, player
feature items | coins and mushrooms: where they are, picking them up, what a question block gives | core, level, player
feature camera | follows the player and scrolls | core, player
feature background | sky, clouds and green hills | core, camera
feature hud | the top bar with score, coins, lives and time, and the countdown | core
feature screens | the win and game over screens and the restart | core`;
const SMALL_CORE = "core | state S (mode, score, coins, lives, time, camera), overlap(a, b), solidAt(col, row), moveEntity(e) that moves with tile collision, and the list of features each with init, update and draw";
const BIG_FEATURES = `feature levels | the five levels as small data entries (theme, tiles, enemies, coins, flag), buildLevel(n), the tiles and the themed background | core
feature player | movement, jump, damage, and the power-up states mushroom, fire flower and star | core, levels
feature enemies | the six kinds as a table of behaviours, stomp and side hit | core, player
feature boss | the boss of level 5: patterns and health | core, enemies
feature items | coins, question blocks and what they give, power-ups picked up | core, player
feature camera | follows the player | core, player
feature hud | the top bar with score, coins, lives and time | core
feature progress | win, game over, next level and restart | core, levels
feature shop | buying lives with coins between levels | core
feature saves | saving and loading the progress | core
feature menu | the start menu | core`;
const BIG_CORE = "core | state S (mode, score, coins, lives, time, camera, level number), overlap(a, b), solidAt(col, row), moveEntity(e) with tile collision, and the list of features each with init, update and draw";

const FORM = `Reply with lines only. One line for the core, then one line per feature, in exactly this form (the angle brackets are what you replace, never write them):
core | <the shared state and helpers, with their names and arguments>
feature <name> | <what it owns: data, behaviour, look> | <what it uses from the core or from other features>`;
const WORDS = `You are the lead of a small team. Do NOT write code. Plan the program as a CORE plus FEATURES.
CORE: what every feature shares (state shape, helpers like collision or movement), written first, under 60 lines.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines. If a feature is bigger, split it.`;
const RULES = `Rules: every thing the request mentions belongs to exactly one feature. Never invent a behaviour the request does not describe. A family of similar things (kinds of enemies, levels) is ONE feature that holds a small table of them. Nothing that two features need goes in a feature: it goes in the core.`;
const EXAMPLE = `Example of the FORMAT only, for a to-do list app, never to be copied into your plan:
core | state S (tasks, filter), save(), load()
feature list | the tasks, adding, ticking and removing one, drawing them | core
feature filter | all, active, done: which tasks are shown | core, list`;

const checks = (lo: number, hi: number) => `### Checks

- lines: ${lo}-${hi}
- regex: ^core \\|
- regex: ^feature \\w+ \\|
- not: \`\`\`
- not: <`;

export const LAB_PLAN_TESTS_2 = `---
title: Planning a Mario-like game, round 2 (core and features)
runs: 3
max_tokens: 900
thinking: off
---

# Planning a Mario-like game, round 2

Round 1 showed that a core plus features is the form a 4B model follows best and the only one that kept its score when the request grew.
This round changes only the wording, to see what makes the plan complete and correct: the line form with placeholders, an example of the form (about another program), rules against invented behaviour, and the features listed before the core.
Read the answers for: all the things of the request are owned (level, player, enemies, items, camera, background, hud, screens), nothing invented, no "name" written as a word, and the big request grows by adding features, not by splitting one into base and instance.

## B1 placeholders (small request)

${WORDS}
${FORM}

The program: ${MARIO}

${checks(7, 14)}

### Ideal

${SMALL_CORE}
${SMALL_FEATURES}

## B2 placeholders and an example (small request)

${WORDS}
${FORM}
${EXAMPLE}

The program: ${MARIO}

${checks(7, 14)}

### Ideal

${SMALL_CORE}
${SMALL_FEATURES}

## B3 placeholders and rules (small request)

${WORDS}
${RULES}
${FORM}

The program: ${MARIO}

${checks(7, 14)}

### Ideal

${SMALL_CORE}
${SMALL_FEATURES}

## B4 features first, then the core (small request)

You are the lead of a small team. Do NOT write code. Plan the program as FEATURES, then a CORE.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines.
${RULES.replace(" Nothing that two features need goes in a feature: it goes in the core.", "")}
CORE: what TWO OR MORE features need (state shape, helpers like collision or movement), written first, under 60 lines. Write it as the LAST line, after you have listed every feature.
Reply with lines only, in exactly this form (the angle brackets are what you replace, never write them):
feature <name> | <what it owns: data, behaviour, look> | <what it uses from the core or from other features>
core | <the shared state and helpers, with their names and arguments>

The program: ${MARIO}

### Checks

- lines: 7-14
- regex: ^core \\|
- regex: ^feature \\w+ \\|
- not: \`\`\`
- not: <

### Ideal

${SMALL_FEATURES}
${SMALL_CORE}

## B1-big placeholders (much bigger request)

${WORDS}
${FORM}

The program: ${BIG}

${checks(9, 16)}

### Ideal

${BIG_CORE}
${BIG_FEATURES}

## B3-big placeholders and rules (much bigger request)

${WORDS}
${RULES}
${FORM}

The program: ${BIG}

${checks(9, 16)}

### Ideal

${BIG_CORE}
${BIG_FEATURES}

## B4-big features first, then the core (much bigger request)

You are the lead of a small team. Do NOT write code. Plan the program as FEATURES, then a CORE.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines.
${RULES.replace(" Nothing that two features need goes in a feature: it goes in the core.", "")}
CORE: what TWO OR MORE features need (state shape, helpers like collision or movement), written first, under 60 lines. Write it as the LAST line, after you have listed every feature.
Reply with lines only, in exactly this form (the angle brackets are what you replace, never write them):
feature <name> | <what it owns: data, behaviour, look> | <what it uses from the core or from other features>
core | <the shared state and helpers, with their names and arguments>

The program: ${BIG}

### Checks

- lines: 9-16
- regex: ^core \\|
- regex: ^feature \\w+ \\|
- not: \`\`\`
- not: <

### Ideal

${BIG_FEATURES}
${BIG_CORE}
`;
