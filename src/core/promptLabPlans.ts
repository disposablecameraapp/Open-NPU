/**
 * A ready series for the prompt lab: ways of asking a small model to PLAN a program before any code is written, on a Mario-like game and on
 * a much bigger version of it (to see whether the plan grows by adding parts or by swelling the same ones). Each prompt has the plan a
 * good lead would write as its ideal. Loaded from the page ("Load the planning prompts"), read by the tests.
 */

const MARIO = `I want a 2D game like the first Super Mario Bros. You play a little character who runs and jumps from left to right through a level. The level has ground with a couple of holes you can fall into, floating platforms and brick blocks to jump on, question-mark blocks that give coins or a mushroom when you hit them from below, and a green pipe. Some enemies, like little mushrooms, walk back and forth: if you jump on their head they are defeated, but if you touch them from the side you lose a life. Coins are scattered around and a counter shows how many I have and my score. I start with 3 lives, there is a time limit shown at the top, and the level ends with a flag at the right: touching it shows a "You win" screen. If I run out of lives or time, it says "Game over" and I can try again. Use the arrow keys to move and space to jump. Make it colorful with a blue sky, clouds and green hills.`;

const BIG = `${MARIO} It also has 5 levels with different themes (grass, desert, ice, cave, castle), 6 kinds of enemies, a boss at the end of level 5, power-ups (mushroom, fire flower, star), a shop between levels where coins buy lives, a save system, and a start menu.`;

export const LAB_PLAN_TESTS = `---
title: Planning a Mario-like game
runs: 2
max_tokens: 900
thinking: off
---

# Planning a Mario-like game

Ways of asking a small model for the PLAN of a program, never the code. Each ideal is the plan a good lead would write.
Read the answers for: one owner per thing, shared things written once, a sensible number of parts, and a plan that grows by adding parts when the request grows.

## A roles (small request)

You are the lead of a small team. Do NOT write code. Plan how this program will be built by splitting it into 3 to 6 BLOCKS of code, each written later by one person who sees only this plan.
Roles: WORLD (state and data creation), UPDATE (what changes over time and by input), DRAW (everything shown). Split a role into several blocks only if one block would exceed 100 lines.
Reply with lines only, in this form:
block name | role | what it contains | what it needs from other blocks
Never put the same thing in two blocks.

The program: ${MARIO}

### Checks

- lines: 3-8
- regex: ^[a-z]\\w* \\| .* \\| .* \\| .*$
- not: \`\`\`

### Ideal

world | WORLD | the state (mode, score, coins, lives, time, camera) and buildLevel(): ground with holes, platforms, bricks, question blocks, the pipe, the flag, enemies and coins | nothing
update | UPDATE | update() each tick: arrows and jump, gravity, one shared moveEntity with tile collision for the player, the enemies and the mushrooms, stomping, bumping blocks, coins, lives, timer, win and game over, restart | world
draw | DRAW | render(): sky, clouds, hills, tiles, pipe, flag, coins, enemies, mushrooms, the player, the top bar with score, coins, lives and time, the win and game over screens, scrolling with the camera | world

## B core and features (small request)

You are the lead of a small team. Do NOT write code. Plan the program as a CORE plus FEATURES.
CORE: what every feature shares (state shape, helpers like collision or movement), written first, under 60 lines.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines. If a feature is bigger, split it.
Reply with lines only:
core | the helpers and state it provides, with their names and arguments
feature name | what it owns: data, behaviour, look | what it uses from the core
Nothing that two features need goes in a feature: it goes in the core.

The program: ${MARIO}

### Checks

- lines: 5-12
- regex: ^core \\|
- regex: ^feature \\w+ \\|
- not: \`\`\`

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

## C1 list what exists

List everything that EXISTS in this program (things, screens, rules, numbers). One per line: name | kind (thing, screen, rule, number) | what it holds or does. No code. Lines only.

The program: ${MARIO}

### Checks

- lines: 10-30
- regex: ^[a-z][\\w ]* \\| (thing|screen|rule|number) \\| .*$
- not: \`\`\`

### Ideal

player | thing | position, speed, size, on the ground or not
enemy mushroom | thing | walks back and forth, can be stomped
coin | thing | a collectible worth points
question block | thing | gives a coin or a mushroom when hit from below
brick block | thing | solid, can be stood on
platform | thing | a solid floating surface
ground | thing | solid floor with holes
hole | thing | a gap in the ground that makes the player fall
pipe | thing | a solid green pipe
flag | thing | touching it wins the level
mushroom power-up | thing | gives something when picked up
camera | thing | follows the player to the right
sky, clouds, hills | thing | the colourful background
score | number | points from coins and enemies
coins | number | how many are collected
lives | number | starts at 3
time | number | counts down
playing | rule | arrows move, space jumps, gravity pulls down
stomp | rule | landing on an enemy's head defeats it
side hit | rule | touching an enemy from the side costs a life
game over | screen | shown when lives or time run out, with a way to try again
you win | screen | shown when the flag is touched

## C2 group into blocks

Group these items into 4 to 8 BLOCKS of code. Things that share data or the same behaviour go in the SAME block (for example everything that moves and collides). Each block must be writable in under 100 lines. Reply with lines only:
block name | the items it contains | the names it exposes to other blocks
Last line: order | the blocks in the order they must be written.

Items:
player, enemy mushroom, mushroom power-up (things that move and collide); coin, question block, brick block, platform, ground, hole, pipe, flag (the level's tiles and objects); camera; sky, clouds, hills; score, coins, lives, time (numbers); playing, stomp, side hit (rules); game over, you win (screens).

### Checks

- lines: 4-9
- regex: ^order \\|
- not: \`\`\`

### Ideal

level | ground, hole, platform, brick block, question block, pipe, flag, and the placing of coins | buildLevel(), solidAt(col, row)
movers | player, enemy mushroom, mushroom power-up: movement, gravity and collision with the tiles, stomp and side hit | moveEntity(e), update()
items | coin, question block contents, mushroom power-up pickup, score and coins | collect(), bump(col, row)
camera | the camera that follows the player | cameraX, updateCamera()
look | sky, clouds, hills, tiles and sprites, the top bar | render()
rules | lives, time, game over, you win, restart | checkEnd(), restart()
order | level, movers, items, camera, rules, look

## D questions one at a time

Answer each question with short lines, nothing else.
Q1. Which KINDS of objects move or change (player, enemies, items...)? One word each, one per line.
Q2. For each kind, what is the SAME for all of them (position, size, speed, collision)? One line each: kind | shared fields.
Q3. Which behaviours are the same for several kinds? One line each: behaviour | kinds that use it.
Q4. Which behaviours belong to one kind only? One line each: kind | behaviour.
Q5. What does the program remember (score, lives, time...)? One line each.
Start each answer with its question number, like "Q1:".

The program: ${MARIO}

### Checks

- regex: ^Q1
- regex: ^Q5
- not: \`\`\`

### Ideal

Q1:
player
enemy
mushroom power-up
coin
Q2:
player | x, y, width, height, speed, on the ground
enemy | x, y, width, height, speed, direction
mushroom power-up | x, y, width, height, speed
Q3:
move with gravity | player, enemy, mushroom power-up
collide with the tiles | player, enemy, mushroom power-up
overlap test | player with enemy, coin, mushroom power-up, flag
Q4:
player | reads the arrows, jumps
enemy | turns around at walls, is stomped
coin | is picked up for points
Q5:
score
coins collected
lives, starting at 3
time left
whether the game is playing, won or over
how far the camera has scrolled

## A-big roles (much bigger request)

You are the lead of a small team. Do NOT write code. Plan how this program will be built by splitting it into BLOCKS of code, each written later by one person who sees only this plan.
Roles: WORLD (state and data creation), UPDATE (what changes over time and by input), DRAW (everything shown). A block must stay under 100 lines: when a role holds more, split it into several blocks, one per kind of thing.
Reply with lines only, in this form:
block name | role | what it contains | what it needs from other blocks
Never put the same thing in two blocks.

The program: ${BIG}

### Checks

- lines: 8-20
- regex: ^[a-z]\\w* \\| .* \\| .* \\| .*$
- not: \`\`\`

### Ideal

state | WORLD | the shared state: mode, score, coins, lives, time, camera, current level, saved progress | nothing
levels | WORLD | one small level description per theme (grass, desert, ice, cave, castle) read by buildLevel(n), each with its tiles, enemies, coins and flag | state
movement | UPDATE | one moveEntity with tile collision, gravity and jump, used by the player and all enemies | state
player | UPDATE | arrows and jump, damage, power-up states (mushroom, fire flower, star), fireballs | movement
enemies | UPDATE | the six kinds of enemy as small data entries with their behaviours, stomp and side hit | movement
boss | UPDATE | the boss of level 5: its patterns and health | movement, enemies
blocks | UPDATE | question blocks and bricks, what they give, coins and power-ups picked up | state
progress | UPDATE | win, game over, next level, lives and time rules | state, levels
shop | UPDATE | the shop between levels: buying lives with coins | state
saves | UPDATE | save and load of the progress | state
menu | UPDATE | the start menu and the screens between levels | state
draw-world | DRAW | sky, clouds and hills for each theme, tiles, pipes, flag, camera scroll | state, levels
draw-things | DRAW | player, enemies, boss, items and fireballs | state
draw-ui | DRAW | the top bar, the shop, the menu, win and game over screens | state

## B-big core and features (much bigger request)

You are the lead of a small team. Do NOT write code. Plan the program as a CORE plus FEATURES.
CORE: what every feature shares (state shape, helpers like collision or movement), written first, under 60 lines.
FEATURE: one thing the program has (a kind of object, a screen, a rule), which OWNS its data, its behaviour and its drawing, under 100 lines. If a feature is bigger, split it. Several things of the same family (kinds of enemies, levels) are ONE feature that holds a small table of them, not one feature each.
Reply with lines only:
core | the helpers and state it provides, with their names and arguments
feature name | what it owns: data, behaviour, look | what it uses from the core
Nothing that two features need goes in a feature: it goes in the core.

The program: ${BIG}

### Checks

- lines: 8-20
- regex: ^core \\|
- regex: ^feature \\w+ \\|
- not: \`\`\`

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
`;
