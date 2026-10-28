---
title: Planning, last round (core and features)
runs: 3
max_tokens: 900
thinking: off
---

# Planning, last round

Round 2 showed that the core first, with placeholders and one example of the form, is the wording a 4B model follows most steadily.
This round keeps that wording and varies only two things: a rule that a family of similar things is ONE feature holding a table (round 2 had features per kind of enemy and per level), and a limit on the length of a line.
The last two prompts are not Mario: a kanban board and Tetris, to see that the form holds on other programs.

## D1 the wording of round 2 (much bigger request)

You are the lead of a small team. Do NOT write code. Plan the program as a CORE plus FEATURES.
CORE: what every feature shares (state shape, helpers like collision or movement), written first, under 60 lines.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines. If a feature is bigger, split it.
Reply with lines only. One line for the core, then one line per feature, in exactly this form (the angle brackets are what you replace, never write them):
core | <the shared state and helpers, with their names and arguments>
feature <name> | <what it owns: data, behaviour, look> | <what it uses from the core or from other features>
Example of the FORMAT only, for a to-do list app, never to be copied into your plan:
core | state S (tasks, filter), save(), load()
feature list | the tasks, adding, ticking and removing one, drawing them | core
feature filter | all, active, done: which tasks are shown | core, list

The program: I want a 2D game like the first Super Mario Bros. You play a little character who runs and jumps from left to right through a level. The level has ground with a couple of holes you can fall into, floating platforms and brick blocks to jump on, question-mark blocks that give coins or a mushroom when you hit them from below, and a green pipe. Some enemies, like little mushrooms, walk back and forth: if you jump on their head they are defeated, but if you touch them from the side you lose a life. Coins are scattered around and a counter shows how many I have and my score. I start with 3 lives, there is a time limit shown at the top, and the level ends with a flag at the right: touching it shows a "You win" screen. If I run out of lives or time, it says "Game over" and I can try again. Use the arrow keys to move and space to jump. Make it colorful with a blue sky, clouds and green hills. It also has 5 levels with different themes (grass, desert, ice, cave, castle), 6 kinds of enemies, a boss at the end of level 5, power-ups (mushroom, fire flower, star), a shop between levels where coins buy lives, a save system, and a start menu.

### Checks

- lines: 9-16
- regex: ^core \|
- regex: ^feature \w+ \|
- not: ```
- not: <

### Ideal

core | state S (mode, score, coins, lives, time, camera, level number), overlap(a, b), solidAt(col, row), moveEntity(e) with tile collision, and the list of features each with init, update and draw
feature levels | the five levels as small data entries (theme, tiles, enemies, coins, flag), buildLevel(n), the tiles and the themed background | core
feature player | movement, jump, damage, and the power-up states mushroom, fire flower and star | core, levels
feature enemies | the six kinds as a table of behaviours, stomp and side hit | core, player
feature boss | the boss of level 5: patterns and health | core, enemies
feature items | coins, question blocks and what they give, power-ups picked up | core, player
feature camera | follows the player | core, player
feature hud | the top bar with score, coins, lives and time | core
feature progress | win, game over, next level and restart | core, levels
feature shop | buying lives with coins between levels | core
feature saves | saving and loading the progress | core
feature menu | the start menu | core

## D2 families are one feature (small request)

You are the lead of a small team. Do NOT write code. Plan the program as a CORE plus FEATURES.
CORE: what every feature shares (state shape, helpers like collision or movement), written first, under 60 lines.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines. If a feature is bigger, split it.
Rule: a family of similar things (kinds of enemies, levels, power-ups) is ONE feature that holds a small table of them, never one feature per member. Every thing the request mentions belongs to exactly one feature, and you invent nothing it does not describe.
Reply with lines only. One line for the core, then one line per feature, in exactly this form (the angle brackets are what you replace, never write them):
core | <the shared state and helpers, with their names and arguments>
feature <name> | <what it owns: data, behaviour, look> | <what it uses from the core or from other features>
Example of the FORMAT only, for a to-do list app, never to be copied into your plan:
core | state S (tasks, filter), save(), load()
feature list | the tasks, adding, ticking and removing one, drawing them | core
feature filter | all, active, done: which tasks are shown | core, list

The program: I want a 2D game like the first Super Mario Bros. You play a little character who runs and jumps from left to right through a level. The level has ground with a couple of holes you can fall into, floating platforms and brick blocks to jump on, question-mark blocks that give coins or a mushroom when you hit them from below, and a green pipe. Some enemies, like little mushrooms, walk back and forth: if you jump on their head they are defeated, but if you touch them from the side you lose a life. Coins are scattered around and a counter shows how many I have and my score. I start with 3 lives, there is a time limit shown at the top, and the level ends with a flag at the right: touching it shows a "You win" screen. If I run out of lives or time, it says "Game over" and I can try again. Use the arrow keys to move and space to jump. Make it colorful with a blue sky, clouds and green hills.

### Checks

- lines: 7-14
- regex: ^core \|
- regex: ^feature \w+ \|
- not: ```
- not: <

### Ideal

core | state S (mode, score, coins, lives, time, camera), overlap(a, b), solidAt(col, row), moveEntity(e) that moves with tile collision, and the list of features each with init, update and draw
feature level | the tile grid: ground with holes, platforms, bricks, question blocks, the pipe, the flag; builds it and draws the tiles | core
feature player | position and speed, arrows and jump, falling into a hole, drawing the character | core, level
feature enemies | the mushrooms that walk back and forth, being stomped, hurting from the side | core, player
feature items | coins and mushrooms: where they are, picking them up, what a question block gives | core, level, player
feature camera | follows the player and scrolls | core, player
feature background | sky, clouds and green hills | core, camera
feature hud | the top bar with score, coins, lives and time, and the countdown | core
feature screens | the win and game over screens and the restart | core

## D3 families are one feature (much bigger request)

You are the lead of a small team. Do NOT write code. Plan the program as a CORE plus FEATURES.
CORE: what every feature shares (state shape, helpers like collision or movement), written first, under 60 lines.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines. If a feature is bigger, split it.
Rule: a family of similar things (kinds of enemies, levels, power-ups) is ONE feature that holds a small table of them, never one feature per member. Every thing the request mentions belongs to exactly one feature, and you invent nothing it does not describe.
Reply with lines only. One line for the core, then one line per feature, in exactly this form (the angle brackets are what you replace, never write them):
core | <the shared state and helpers, with their names and arguments>
feature <name> | <what it owns: data, behaviour, look> | <what it uses from the core or from other features>
Example of the FORMAT only, for a to-do list app, never to be copied into your plan:
core | state S (tasks, filter), save(), load()
feature list | the tasks, adding, ticking and removing one, drawing them | core
feature filter | all, active, done: which tasks are shown | core, list

The program: I want a 2D game like the first Super Mario Bros. You play a little character who runs and jumps from left to right through a level. The level has ground with a couple of holes you can fall into, floating platforms and brick blocks to jump on, question-mark blocks that give coins or a mushroom when you hit them from below, and a green pipe. Some enemies, like little mushrooms, walk back and forth: if you jump on their head they are defeated, but if you touch them from the side you lose a life. Coins are scattered around and a counter shows how many I have and my score. I start with 3 lives, there is a time limit shown at the top, and the level ends with a flag at the right: touching it shows a "You win" screen. If I run out of lives or time, it says "Game over" and I can try again. Use the arrow keys to move and space to jump. Make it colorful with a blue sky, clouds and green hills. It also has 5 levels with different themes (grass, desert, ice, cave, castle), 6 kinds of enemies, a boss at the end of level 5, power-ups (mushroom, fire flower, star), a shop between levels where coins buy lives, a save system, and a start menu.

### Checks

- lines: 9-16
- regex: ^core \|
- regex: ^feature \w+ \|
- not: ```
- not: <

### Ideal

core | state S (mode, score, coins, lives, time, camera, level number), overlap(a, b), solidAt(col, row), moveEntity(e) with tile collision, and the list of features each with init, update and draw
feature levels | the five levels as small data entries (theme, tiles, enemies, coins, flag), buildLevel(n), the tiles and the themed background | core
feature player | movement, jump, damage, and the power-up states mushroom, fire flower and star | core, levels
feature enemies | the six kinds as a table of behaviours, stomp and side hit | core, player
feature boss | the boss of level 5: patterns and health | core, enemies
feature items | coins, question blocks and what they give, power-ups picked up | core, player
feature camera | follows the player | core, player
feature hud | the top bar with score, coins, lives and time | core
feature progress | win, game over, next level and restart | core, levels
feature shop | buying lives with coins between levels | core
feature saves | saving and loading the progress | core
feature menu | the start menu | core

## D4 families and short lines (much bigger request)

You are the lead of a small team. Do NOT write code. Plan the program as a CORE plus FEATURES.
CORE: what every feature shares (state shape, helpers like collision or movement), written first, under 60 lines.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines. If a feature is bigger, split it.
Rule: a family of similar things (kinds of enemies, levels, power-ups) is ONE feature that holds a small table of them, never one feature per member. Every thing the request mentions belongs to exactly one feature, and you invent nothing it does not describe.
Keep every line under 160 characters: names and short phrases, no sentences.
Reply with lines only. One line for the core, then one line per feature, in exactly this form (the angle brackets are what you replace, never write them):
core | <the shared state and helpers, with their names and arguments>
feature <name> | <what it owns: data, behaviour, look> | <what it uses from the core or from other features>
Example of the FORMAT only, for a to-do list app, never to be copied into your plan:
core | state S (tasks, filter), save(), load()
feature list | the tasks, adding, ticking and removing one, drawing them | core
feature filter | all, active, done: which tasks are shown | core, list

The program: I want a 2D game like the first Super Mario Bros. You play a little character who runs and jumps from left to right through a level. The level has ground with a couple of holes you can fall into, floating platforms and brick blocks to jump on, question-mark blocks that give coins or a mushroom when you hit them from below, and a green pipe. Some enemies, like little mushrooms, walk back and forth: if you jump on their head they are defeated, but if you touch them from the side you lose a life. Coins are scattered around and a counter shows how many I have and my score. I start with 3 lives, there is a time limit shown at the top, and the level ends with a flag at the right: touching it shows a "You win" screen. If I run out of lives or time, it says "Game over" and I can try again. Use the arrow keys to move and space to jump. Make it colorful with a blue sky, clouds and green hills. It also has 5 levels with different themes (grass, desert, ice, cave, castle), 6 kinds of enemies, a boss at the end of level 5, power-ups (mushroom, fire flower, star), a shop between levels where coins buy lives, a save system, and a start menu.

### Checks

- lines: 9-16
- regex: ^core \|
- regex: ^feature \w+ \|
- not: ```
- not: <

### Ideal

core | state S (mode, score, coins, lives, time, camera, level number), overlap(a, b), solidAt(col, row), moveEntity(e) with tile collision, and the list of features each with init, update and draw
feature levels | the five levels as small data entries (theme, tiles, enemies, coins, flag), buildLevel(n), the tiles and the themed background | core
feature player | movement, jump, damage, and the power-up states mushroom, fire flower and star | core, levels
feature enemies | the six kinds as a table of behaviours, stomp and side hit | core, player
feature boss | the boss of level 5: patterns and health | core, enemies
feature items | coins, question blocks and what they give, power-ups picked up | core, player
feature camera | follows the player | core, player
feature hud | the top bar with score, coins, lives and time | core
feature progress | win, game over, next level and restart | core, levels
feature shop | buying lives with coins between levels | core
feature saves | saving and loading the progress | core
feature menu | the start menu | core

## D5 families and short lines (kanban board)

You are the lead of a small team. Do NOT write code. Plan the program as a CORE plus FEATURES.
CORE: what every feature shares (state shape, helpers like collision or movement), written first, under 60 lines.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines. If a feature is bigger, split it.
Rule: a family of similar things (kinds of enemies, levels, power-ups) is ONE feature that holds a small table of them, never one feature per member. Every thing the request mentions belongs to exactly one feature, and you invent nothing it does not describe.
Keep every line under 160 characters: names and short phrases, no sentences.
Reply with lines only. One line for the core, then one line per feature, in exactly this form (the angle brackets are what you replace, never write them):
core | <the shared state and helpers, with their names and arguments>
feature <name> | <what it owns: data, behaviour, look> | <what it uses from the core or from other features>
Example of the FORMAT only, for a to-do list app, never to be copied into your plan:
core | state S (tasks, filter), save(), load()
feature list | the tasks, adding, ticking and removing one, drawing them | core
feature filter | all, active, done: which tasks are shown | core, list

The program: A kanban board in one page: three columns (to do, doing, done), cards with a title and a colour, add a card, drag a card to another column, delete a card, a counter per column, everything saved in the browser, a button to clear the done column.

### Checks

- lines: 5-9
- regex: ^core \|
- regex: ^feature \w+ \|
- not: ```
- not: <

### Ideal

core | state S (columns, cards, dragging), save(), load(), moveCard(id, column)
feature columns | the three columns with their title and counter, drawing them | core, cards
feature cards | a card with title and colour, adding and deleting one, drawing it | core
feature drag | picking a card up and dropping it in another column | core, cards, columns
feature storage | saving and loading the board in the browser | core
feature cleanup | the button that clears the done column | core, columns

## D6 families and short lines (Tetris)

You are the lead of a small team. Do NOT write code. Plan the program as a CORE plus FEATURES.
CORE: what every feature shares (state shape, helpers like collision or movement), written first, under 60 lines.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines. If a feature is bigger, split it.
Rule: a family of similar things (kinds of enemies, levels, power-ups) is ONE feature that holds a small table of them, never one feature per member. Every thing the request mentions belongs to exactly one feature, and you invent nothing it does not describe.
Keep every line under 160 characters: names and short phrases, no sentences.
Reply with lines only. One line for the core, then one line per feature, in exactly this form (the angle brackets are what you replace, never write them):
core | <the shared state and helpers, with their names and arguments>
feature <name> | <what it owns: data, behaviour, look> | <what it uses from the core or from other features>
Example of the FORMAT only, for a to-do list app, never to be copied into your plan:
core | state S (tasks, filter), save(), load()
feature list | the tasks, adding, ticking and removing one, drawing them | core
feature filter | all, active, done: which tasks are shown | core, list

The program: Tetris in one page: the seven pieces falling in a ten by twenty grid, arrows to move and rotate, space to drop at once, full lines disappear, the next piece is shown, a ghost piece shows where it lands, a hold slot, score and level that speeds up, high score saved, game over and restart.

### Checks

- lines: 6-12
- regex: ^core \|
- regex: ^feature \w+ \|
- not: ```
- not: <

### Ideal

core | state S (mode, grid, piece, next, hold, score, level, lines, best), fits(piece, dx, dy, rot), lockPiece(), and the list of features each with init, update and draw
feature pieces | the seven shapes with their rotations, the random bag, spawning the next one | core
feature board | the ten by twenty grid, locking a piece, clearing full lines, drawing the grid | core, pieces
feature controls | arrows to move and rotate, space to drop at once, the hold key | core, pieces, board
feature ghost | where the piece will land and its drawing | core, board
feature panel | next piece, hold slot, score, level and best score drawn beside the grid | core, pieces
feature levels | the falling speed that grows with the level and the lines | core
feature screens | game over, restart and saving the best score | core
