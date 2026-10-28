---
title: The writers of the engine, unit by unit
runs: 3
max_tokens: 1200
thinking: off
---

# The writers of the engine, unit by unit

Each prompt is what a writer of the construction engine really receives for one unit of a small platformer: its instructions as the system message, and the context the engine builds for it (requirements, task, state, elements of the page, the functions it may call). The score does not look at how much the code resembles the ideal: it RUNS the answer. "the code loads" and every "gives" line are checks run on the code, in isolation, with the state and the functions the unit would find in the page; a green line means the unit does that.
Read the answers for: the name and signature asked, no code outside the unit, no new names, nothing that the page already does (loop, clearing, listeners).

## U1 the state

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R1. The player runs left and right with the arrow keys and jumps with the up arrow
R2. The player falls with gravity and stands on the ground and on platforms; there are holes in the ground
R3. Enemies walk; jumping on one from above kills it, touching it from the side costs a life
R4. Coins can be picked up and raise the score
R5. A countdown runs and the top bar shows score, lives and time
R6. Reaching the flag wins; no lives or no time left is game over

Task:
kind: state
name: S
does: everything the program remembers: the mode, score, lives, time, camera, the keys, the player, the ground, platforms, enemies, coins and the flag

Names that exist:
hits, moveThing, stomps, landOn, collectCoins, onTick, onJump, drawScene, drawHud

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- contains: "input"
- regex: "w"\s*:
- not: //
- not: function

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "coinCount": 0,
  "lives": 3,
  "time": 300,
  "camera": 0,
  "input": {
    "left": false,
    "right": false
  },
  "player": {
    "x": 40,
    "y": 160,
    "w": 16,
    "h": 24,
    "vx": 0,
    "vy": 0,
    "grounded": false
  },
  "ground": [
    {
      "x": 0,
      "y": 200,
      "w": 400,
      "h": 40
    },
    {
      "x": 460,
      "y": 200,
      "w": 340,
      "h": 40
    }
  ],
  "platforms": [
    {
      "x": 200,
      "y": 140,
      "w": 48,
      "h": 12
    }
  ],
  "enemies": [
    {
      "x": 300,
      "y": 176,
      "w": 16,
      "h": 24,
      "vx": -1,
      "vy": 0,
      "alive": true
    }
  ],
  "coins": [
    {
      "x": 210,
      "y": 120,
      "w": 10,
      "h": 10,
      "taken": false
    }
  ],
  "flag": {
    "x": 760,
    "y": 120,
    "w": 8,
    "h": 80
  }
}
```

## U2 the layout

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R5. A countdown runs and the top bar shows score, lives and time

Task:
kind: layout
name: layout
does: the page: a canvas for the scene and a box for the top bar

The state S:
mode: string ("playing")
score: number (0)
coinCount: number (0)
lives: number (3)
time: number (300)
camera: number (0)
input: {left, right}
player: {x, y, w, h, vx, vy, grounded}
ground: list of {x, y, w, h}
platforms: list of {x, y, w, h}
enemies: list of {x, y, w, h, vx, vy, alive}
coins: list of {x, y, w, h, taken}
flag: {x, y, w, h}

What the page must hold:
onTick: one step of the game every 16 ms, only while playing: the player moves 3 left or right by the keys and falls (vy grows by 0.5) and lands on the ground and platforms; the enemies move; a stomp kills an enemy (+100, a small bounce), a side touch or a fall below y 260 costs a life and puts the player back at x 40, y 160; coins picked up give +10 and count in coinCount; the time goes down by 1/60; reaching the flag sets the mode to "won"; no lives or no time sets it to "over" (tick 16)
onJump: while playing and standing on something, the player jumps: vy becomes -9 and grounded false (keydown ArrowUp)
drawScene: draws the sky, the ground and platforms, the coins not taken, the living enemies and the player as filled rectangles, each at its x minus S.camera (an empty element with the id stage, exactly this id)
drawHud: writes the score, the lives and the time left (rounded up) into the top bar (an empty element with the id hud, exactly this id)

Names that exist:
hits, moveThing, stomps, landOn, collectCoins, onTick, onJump, drawScene, drawHud

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the HTML of the body: the elements the program needs, each with an id (and a class when it is styled), then one <style> block with the CSS for the page. No <html>, <head>, <body> or <script> tags. The elements are containers and places for values, EMPTY: views fill them later, so write no content in them and no number, label or text a view shows (a view that fills an element shows the score, the lives, the time, the messages: write that element and nothing inside it); make one element per place the program draws into or shows a value in (never one per requirement), give a container that holds drawn things a fixed size, use a <canvas> (with width and height) for the element a view draws pictures into with a 2D context and a plain element for text, and make it look like the finished program, not like a skeleton. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.

### Checks

- contains: <canvas id="stage"
- contains: id="hud"
- regex: <style
- not: <script
- not: <body
- not: <html

### Ideal

```
<canvas id="stage" width="640" height="240"></canvas>
<div id="hud"></div>
<style>
body { margin: 0; background: #5c94fc; font-family: monospace; }
#stage { display: block; margin: 0 auto; background: #87ceeb; }
#hud { position: fixed; top: 6px; left: 12px; color: #fff; font-size: 16px; text-shadow: 1px 1px #000; }
</style>
```

## U3 stomps (a function with examples)

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R3. Enemies walk; jumping on one from above kills it, touching it from the side costs a life

Task:
kind: fn
name: stomps
does: true when the player lands on an enemy from above: they overlap, the player is falling and its feet are in the upper half of the enemy
signature: stomps(player, enemy)
examples that must hold:
  stomps({x:0,y:10,w:16,h:24,vx:0,vy:3},{x:4,y:30,w:16,h:24})  ->  true
  stomps({x:0,y:30,w:16,h:24,vx:0,vy:0},{x:10,y:30,w:16,h:24})  ->  false

What it uses:
hits(a, b): true when two things with x, y, w, h overlap
function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

The state S:
mode: string ("playing")
score: number (0)
coinCount: number (0)
lives: number (3)
time: number (300)
camera: number (0)
input: {left, right}
player: {x, y, w, h, vx, vy, grounded}
ground: list of {x, y, w, h}
platforms: list of {x, y, w, h}
enemies: list of {x, y, w, h, vx, vy, alive}
coins: list of {x, y, w, h, taken}
flag: {x, y, w, h}

Functions you can call:
hits(a, b): true when two things with x, y, w, h overlap
moveThing(thing, dt): a copy of a thing moved by its speed for dt
landOn(thing, solids): puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands
collectCoins(player, coins): marks the coins the player touches as taken and says how many were picked up now

Names that exist:
hits, moveThing, landOn, collectCoins, onTick, onJump, drawScene, drawHud

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.

### Checks

- given: function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
- loads
- run: stomps({x:0,y:10,w:16,h:24,vx:0,vy:3},{x:4,y:30,w:16,h:24}) => true
- run: stomps({x:0,y:30,w:16,h:24,vx:0,vy:0},{x:10,y:30,w:16,h:24}) => false
- run: stomps({x:0,y:10,w:16,h:24,vx:0,vy:-2},{x:4,y:30,w:16,h:24}) => false
- run: stomps({x:0,y:0,w:16,h:24,vx:0,vy:3},{x:100,y:30,w:16,h:24}) => false
- run: stomps({x:0,y:20,w:16,h:24,vx:0,vy:3},{x:4,y:30,w:16,h:24}) => false
- run: stomps(Object.freeze({x:0,y:10,w:16,h:24,vx:0,vy:3}), Object.freeze({x:4,y:30,w:16,h:24})) => true

### Ideal

```
function stomps(player, enemy) { return hits(player, enemy) && player.vy > 0 && player.y + player.h - enemy.y <= enemy.h / 2; }
```

## U4 landOn (a function that returns a changed copy)

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R2. The player falls with gravity and stands on the ground and on platforms; there are holes in the ground

Task:
kind: fn
name: landOn
does: puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands
signature: landOn(thing, solids)
examples that must hold:
  landOn({x:0,y:178,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}])  ->  {x:0,y:176,w:16,h:24,vy:0,grounded:true}
  landOn({x:0,y:100,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}])  ->  {x:0,y:100,w:16,h:24,vy:2,grounded:false}

What it uses:
hits(a, b): true when two things with x, y, w, h overlap
function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

The state S:
mode: string ("playing")
score: number (0)
coinCount: number (0)
lives: number (3)
time: number (300)
camera: number (0)
input: {left, right}
player: {x, y, w, h, vx, vy, grounded}
ground: list of {x, y, w, h}
platforms: list of {x, y, w, h}
enemies: list of {x, y, w, h, vx, vy, alive}
coins: list of {x, y, w, h, taken}
flag: {x, y, w, h}

Functions you can call:
hits(a, b): true when two things with x, y, w, h overlap
moveThing(thing, dt): a copy of a thing moved by its speed for dt
stomps(player, enemy): true when the player lands on an enemy from above: they overlap, the player is falling and its feet are in the upper half of the enemy
collectCoins(player, coins): marks the coins the player touches as taken and says how many were picked up now

Names that exist:
hits, moveThing, stomps, collectCoins, onTick, onJump, drawScene, drawHud

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.

### Checks

- given: function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
- loads
- run: landOn({x:0,y:178,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}]) => {x:0,y:176,w:16,h:24,vy:0,grounded:true}
- run: landOn({x:0,y:100,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}]) => {x:0,y:100,w:16,h:24,vy:2,grounded:false}
- run: landOn({x:0,y:178,w:16,h:24,vy:-2},[{x:0,y:200,w:100,h:40}]) => {x:0,y:178,w:16,h:24,vy:-2,grounded:false}
- run: landOn({x:90,y:210,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}]).grounded => false
- run: landOn({x:0,y:178,w:16,h:24,vy:2},[{x:300,y:200,w:10,h:10},{x:0,y:200,w:100,h:40}]).y => 176
- run: landOn(Object.freeze({x:0,y:178,w:16,h:24,vy:2}),Object.freeze([{x:0,y:200,w:100,h:40}])).grounded => true

### Ideal

```
function landOn(thing, solids) {
  if (thing.vy < 0) return { ...thing, grounded: false };
  for (const s of solids) {
    if (hits(thing, s) && thing.y + thing.h - thing.vy <= s.y + 1) return { ...thing, y: s.y - thing.h, vy: 0, grounded: true };
  }
  return { ...thing, grounded: false };
}
```

## U5 collectCoins (a function that returns two things)

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R4. Coins can be picked up and raise the score

Task:
kind: fn
name: collectCoins
does: marks the coins the player touches as taken and says how many were picked up now
signature: collectCoins(player, coins)
examples that must hold:
  collectCoins({x:0,y:0,w:10,h:10},[{x:5,y:5,w:4,h:4,taken:false}])  ->  {coins:[{x:5,y:5,w:4,h:4,taken:true}],gained:1}
  collectCoins({x:0,y:0,w:10,h:10},[{x:50,y:5,w:4,h:4,taken:false}])  ->  {coins:[{x:50,y:5,w:4,h:4,taken:false}],gained:0}

What it uses:
hits(a, b): true when two things with x, y, w, h overlap
function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

The state S:
mode: string ("playing")
score: number (0)
coinCount: number (0)
lives: number (3)
time: number (300)
camera: number (0)
input: {left, right}
player: {x, y, w, h, vx, vy, grounded}
ground: list of {x, y, w, h}
platforms: list of {x, y, w, h}
enemies: list of {x, y, w, h, vx, vy, alive}
coins: list of {x, y, w, h, taken}
flag: {x, y, w, h}

Functions you can call:
hits(a, b): true when two things with x, y, w, h overlap
moveThing(thing, dt): a copy of a thing moved by its speed for dt
stomps(player, enemy): true when the player lands on an enemy from above: they overlap, the player is falling and its feet are in the upper half of the enemy
landOn(thing, solids): puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands

Names that exist:
hits, moveThing, stomps, landOn, onTick, onJump, drawScene, drawHud

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.

### Checks

- given: function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
- loads
- run: collectCoins({x:0,y:0,w:10,h:10},[{x:5,y:5,w:4,h:4,taken:false}]) => {coins:[{x:5,y:5,w:4,h:4,taken:true}],gained:1}
- run: collectCoins({x:0,y:0,w:10,h:10},[{x:50,y:5,w:4,h:4,taken:false}]) => {coins:[{x:50,y:5,w:4,h:4,taken:false}],gained:0}
- run: collectCoins({x:0,y:0,w:10,h:10},[{x:5,y:5,w:4,h:4,taken:true}]).gained => 0
- run: collectCoins({x:0,y:0,w:10,h:10},[{x:1,y:1,w:2,h:2,taken:false},{x:6,y:6,w:2,h:2,taken:false},{x:90,y:6,w:2,h:2,taken:false}]).gained => 2
- run: collectCoins({x:0,y:0,w:10,h:10},[]) => {coins:[],gained:0}

### Ideal

```
function collectCoins(player, coins) {
  let gained = 0;
  const list = coins.map((c) => { if (!c.taken && hits(player, c)) { gained++; return { ...c, taken: true }; } return c; });
  return { coins: list, gained };
}
```

## U6 onTick (the handler that does the most)

Program:
Mario-like platformer. Language of the person: English.

Task:
kind: handler
name: onTick
does: one step of the game every 16 ms, only while playing: the player moves 3 left or right by the keys and falls (vy grows by 0.5) and lands on the ground and platforms; the enemies move; a stomp kills an enemy (+100, a small bounce), a side touch or a fall below y 260 costs a life and puts the player back at x 40, y 160; coins picked up give +10 and count in coinCount; the time goes down by 1/60; reaching the flag sets the mode to "won"; no lives or no time sets it to "over"
called by the event: tick 16

What it uses:
moveThing(thing, dt): a copy of a thing moved by its speed for dt
function moveThing(thing, dt) { return { ...thing, x: thing.x + (thing.vx || 0) * dt, y: thing.y + (thing.vy || 0) * dt }; }

landOn(thing, solids): puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands
function landOn(thing, solids) {
  if (thing.vy < 0) return { ...thing, grounded: false };
  for (const s of solids) {
    if (hits(thing, s) && thing.y + thing.h - thing.vy <= s.y + 1) return { ...thing, y: s.y - thing.h, vy: 0, grounded: true };
  }
  return { ...thing, grounded: false };
}

hits(a, b): true when two things with x, y, w, h overlap
function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

stomps(player, enemy): true when the player lands on an enemy from above: they overlap, the player is falling and its feet are in the upper half of the enemy
function stomps(player, enemy) { return hits(player, enemy) && player.vy > 0 && player.y + player.h - enemy.y <= enemy.h / 2; }

collectCoins(player, coins): marks the coins the player touches as taken and says how many were picked up now
function collectCoins(player, coins) {
  let gained = 0;
  const list = coins.map((c) => { if (!c.taken && hits(player, c)) { gained++; return { ...c, taken: true }; } return c; });
  return { coins: list, gained };
}

The state S:
mode: string ("playing")
score: number (0)
coinCount: number (0)
lives: number (3)
time: number (300)
camera: number (0)
input: {left, right}
player: {x, y, w, h, vx, vy, grounded}
ground: list of {x, y, w, h}
platforms: list of {x, y, w, h}
enemies: list of {x, y, w, h, vx, vy, alive}
coins: list of {x, y, w, h, taken}
flag: {x, y, w, h}

Elements of the page:
#stage (canvas 640x240)
#hud (div)

Functions you can call:
hits(a, b): true when two things with x, y, w, h overlap
moveThing(thing, dt): a copy of a thing moved by its speed for dt
stomps(player, enemy): true when the player lands on an enemy from above: they overlap, the player is falling and its feet are in the upper half of the enemy
landOn(thing, solids): puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands
collectCoins(player, coins): marks the coins the player touches as taken and says how many were picked up now

Names that exist:
hits, moveThing, stomps, landOn, collectCoins, onJump, drawScene, drawHud

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.

### Checks

- given: var S = {"mode":"playing","score":0,"coinCount":0,"lives":3,"time":300,"camera":0,"input":{"left":false,"right":false},"player":{"x":40,"y":160,"w":16,"h":24,"vx":0,"vy":0,"grounded":false},"ground":[{"x":0,"y":200,"w":400,"h":40},{"x":460,"y":200,"w":340,"h":40}],"platforms":[{"x":200,"y":140,"w":48,"h":12}],"enemies":[{"x":300,"y":176,"w":16,"h":24,"vx":-1,"vy":0,"alive":true}],"coins":[{"x":210,"y":120,"w":10,"h":10,"taken":false}],"flag":{"x":760,"y":120,"w":8,"h":80}};
- given: function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
- given: function moveThing(thing, dt) { return { ...thing, x: thing.x + (thing.vx || 0) * dt, y: thing.y + (thing.vy || 0) * dt }; }
- given: function landOn(thing, solids) { if (thing.vy < 0) return { ...thing, grounded: false }; for (const s of solids) { if (hits(thing, s) && thing.y + thing.h - thing.vy <= s.y + 1) return { ...thing, y: s.y - thing.h, vy: 0, grounded: true }; } return { ...thing, grounded: false }; }
- given: function stomps(player, enemy) { return hits(player, enemy) && player.vy > 0 && player.y + player.h - enemy.y <= enemy.h / 2; }
- given: function collectCoins(player, coins) { let gained = 0; const list = coins.map((c) => { if (!c.taken && hits(player, c)) { gained++; return { ...c, taken: true }; } return c; }); return { coins: list, gained }; }
- loads
- run: (S.input.right = true, onTick(), S.player.x) => 43
- run: (S.input.left = true, onTick(), S.player.x) => 37
- run: (onTick(), S.player.vy) => 0.5
- run: (S.player.y = 176, S.player.vy = 1, onTick(), S.player.grounded) => true
- run: (onTick(), Math.round(S.time * 60)) => 17999
- run: (S.player = {x:300,y:160,w:16,h:24,vx:0,vy:3,grounded:false}, onTick(), [S.enemies[0].alive, S.score]) => [false, 100]
- run: (S.player = {x:300,y:176,w:16,h:24,vx:0,vy:0,grounded:true}, onTick(), S.lives) => 2
- run: (S.lives = 1, S.player = {x:300,y:176,w:16,h:24,vx:0,vy:0,grounded:true}, onTick(), S.mode) => "over"
- run: (S.player = {x:205,y:100,w:16,h:24,vx:0,vy:0,grounded:false}, onTick(), [S.coinCount, S.score]) => [1, 10]
- run: (S.player = {x:420,y:260,w:16,h:24,vx:0,vy:0,grounded:false}, onTick(), [S.lives, S.player.x, S.player.y]) => [2, 40, 160]
- run: (S.player = {x:755,y:150,w:16,h:24,vx:0,vy:0,grounded:false}, onTick(), S.mode) => "won"
- run: (S.mode = "over", S.input.right = true, onTick(), S.player.x) => 40

### Ideal

```
function onTick() {
  if (S.mode !== "playing") return;
  var p = { ...S.player, vx: (S.input.right ? 3 : 0) - (S.input.left ? 3 : 0), vy: S.player.vy + 0.5 };
  p = landOn(moveThing(p, 1), S.ground.concat(S.platforms));
  S.enemies = S.enemies.map(function (e) { return e.alive ? moveThing(e, 1) : e; });
  S.enemies.forEach(function (e, i) {
    if (!e.alive || !hits(p, e)) return;
    if (stomps(p, e)) { S.enemies[i] = { ...e, alive: false }; S.score += 100; p = { ...p, vy: -6 }; }
    else { S.lives -= 1; p = { ...p, x: 40, y: 160, vx: 0, vy: 0 }; }
  });
  if (p.y > 260) { S.lives -= 1; p = { ...p, x: 40, y: 160, vx: 0, vy: 0 }; }
  var got = collectCoins(p, S.coins);
  S.coins = got.coins; S.coinCount += got.gained; S.score += got.gained * 10;
  S.player = p;
  S.time -= 1 / 60;
  if (hits(p, S.flag)) S.mode = "won";
  else if (S.lives <= 0 || S.time <= 0) S.mode = "over";
}
```

## U7 onJump (a key handler)

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R1. The player runs left and right with the arrow keys and jumps with the up arrow

Task:
kind: handler
name: onJump
does: while playing and standing on something, the player jumps: vy becomes -9 and grounded false
called by the event: keydown ArrowUp

The state S:
mode: string ("playing")
score: number (0)
coinCount: number (0)
lives: number (3)
time: number (300)
camera: number (0)
input: {left, right}
player: {x, y, w, h, vx, vy, grounded}
ground: list of {x, y, w, h}
platforms: list of {x, y, w, h}
enemies: list of {x, y, w, h, vx, vy, alive}
coins: list of {x, y, w, h, taken}
flag: {x, y, w, h}

Elements of the page:
#stage (canvas 640x240)
#hud (div)

Functions you can call:
hits(a, b): true when two things with x, y, w, h overlap
moveThing(thing, dt): a copy of a thing moved by its speed for dt
stomps(player, enemy): true when the player lands on an enemy from above: they overlap, the player is falling and its feet are in the upper half of the enemy
landOn(thing, solids): puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands
collectCoins(player, coins): marks the coins the player touches as taken and says how many were picked up now

Names that exist:
hits, moveThing, stomps, landOn, collectCoins, onTick, drawScene, drawHud

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.

### Checks

- given: var S = {"mode":"playing","score":0,"coinCount":0,"lives":3,"time":300,"camera":0,"input":{"left":false,"right":false},"player":{"x":40,"y":160,"w":16,"h":24,"vx":0,"vy":0,"grounded":false},"ground":[{"x":0,"y":200,"w":400,"h":40},{"x":460,"y":200,"w":340,"h":40}],"platforms":[{"x":200,"y":140,"w":48,"h":12}],"enemies":[{"x":300,"y":176,"w":16,"h":24,"vx":-1,"vy":0,"alive":true}],"coins":[{"x":210,"y":120,"w":10,"h":10,"taken":false}],"flag":{"x":760,"y":120,"w":8,"h":80}};
- loads
- run: (S.player.grounded = true, onJump(), [S.player.vy, S.player.grounded]) => [-9, false]
- run: (onJump(), S.player.vy) => 0
- run: (S.player.grounded = true, S.mode = "over", onJump(), S.player.vy) => 0

### Ideal

```
function onJump() { if (S.mode === "playing" && S.player.grounded) { S.player = { ...S.player, vy: -9, grounded: false }; } }
```

## U8 drawScene (a view on a canvas)

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R1. The player runs left and right with the arrow keys and jumps with the up arrow
R2. The player falls with gravity and stands on the ground and on platforms; there are holes in the ground
R3. Enemies walk; jumping on one from above kills it, touching it from the side costs a life
R4. Coins can be picked up and raise the score

Task:
kind: view
name: drawScene
does: draws the sky, the ground and platforms, the coins not taken, the living enemies and the player as filled rectangles, each at its x minus S.camera
draws into the element #stage

The state S:
mode: string ("playing")
score: number (0)
coinCount: number (0)
lives: number (3)
time: number (300)
camera: number (0)
input: {left, right}
player: {x, y, w, h, vx, vy, grounded}
ground: list of {x, y, w, h}
platforms: list of {x, y, w, h}
enemies: list of {x, y, w, h, vx, vy, alive}
coins: list of {x, y, w, h, taken}
flag: {x, y, w, h}

The element it draws into:
#stage (canvas 640x240): canvas and ctx are already declared

Names that exist:
hits, moveThing, stomps, landOn, collectCoins, onTick, onJump, drawHud

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.

### Checks

- given: var S = {"mode":"playing","score":0,"coinCount":0,"lives":3,"time":300,"camera":0,"input":{"left":false,"right":false},"player":{"x":40,"y":160,"w":16,"h":24,"vx":0,"vy":0,"grounded":false},"ground":[{"x":0,"y":200,"w":400,"h":40},{"x":460,"y":200,"w":340,"h":40}],"platforms":[{"x":200,"y":140,"w":48,"h":12}],"enemies":[{"x":300,"y":176,"w":16,"h":24,"vx":-1,"vy":0,"alive":true}],"coins":[{"x":210,"y":120,"w":10,"h":10,"taken":false}],"flag":{"x":760,"y":120,"w":8,"h":80}};
- given: var calls = [], canvas = { width: 640, height: 240 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawScene(), calls.filter(function (c) { return c[0] === 'fillRect'; }).length >= 6) => true
- run: (drawScene(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawScene(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 40 && c[2] === 160 && c[3] === 16 && c[4] === 24; })) => true
- run: (S.camera = 100, drawScene(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === -60 && c[2] === 160; })) => true
- run: (S.coins[0].taken = true, drawScene(), calls.filter(function (c) { return c[0] === 'fillRect' && c[1] === 210 && c[2] === 120; }).length) => 0
- run: (S.enemies[0].alive = false, drawScene(), calls.filter(function (c) { return c[0] === 'fillRect' && c[1] === 300 && c[2] === 176; }).length) => 0
- run: (drawScene(), calls.some(function (c) { return (c[0] === 'fillRect' && c[1] === 210 && c[2] === 120) || c[0] === 'arc'; })) => true

### Ideal

```
function drawScene() {
  ctx.fillStyle = "#87ceeb"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#8b5a2b";
  S.ground.concat(S.platforms).forEach(function (s) { ctx.fillRect(s.x - S.camera, s.y, s.w, s.h); });
  ctx.fillStyle = "#ffd700";
  S.coins.forEach(function (c) { if (!c.taken) ctx.fillRect(c.x - S.camera, c.y, c.w, c.h); });
  ctx.fillStyle = "#a0522d";
  S.enemies.forEach(function (e) { if (e.alive) ctx.fillRect(e.x - S.camera, e.y, e.w, e.h); });
  ctx.fillStyle = "#e52521";
  ctx.fillRect(S.player.x - S.camera, S.player.y, S.player.w, S.player.h);
}
```

## U9 drawHud (a view on a box)

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R5. A countdown runs and the top bar shows score, lives and time

Task:
kind: view
name: drawHud
does: writes the score, the lives and the time left (rounded up) into the top bar
draws into the element #hud

The state S:
mode: string ("playing")
score: number (0)
coinCount: number (0)
lives: number (3)
time: number (300)
camera: number (0)
input: {left, right}
player: {x, y, w, h, vx, vy, grounded}
ground: list of {x, y, w, h}
platforms: list of {x, y, w, h}
enemies: list of {x, y, w, h, vx, vy, alive}
coins: list of {x, y, w, h, taken}
flag: {x, y, w, h}

The element it draws into:
#hud (div): fill it yourself (innerHTML or textContent), it is yours

Names that exist:
hits, moveThing, stomps, landOn, collectCoins, onTick, onJump, drawScene

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.

### Checks

- given: var S = {"mode":"playing","score":0,"coinCount":0,"lives":3,"time":300,"camera":0,"input":{"left":false,"right":false},"player":{"x":40,"y":160,"w":16,"h":24,"vx":0,"vy":0,"grounded":false},"ground":[{"x":0,"y":200,"w":400,"h":40},{"x":460,"y":200,"w":340,"h":40}],"platforms":[{"x":200,"y":140,"w":48,"h":12}],"enemies":[{"x":300,"y":176,"w":16,"h":24,"vx":-1,"vy":0,"alive":true}],"coins":[{"x":210,"y":120,"w":10,"h":10,"taken":false}],"flag":{"x":760,"y":120,"w":8,"h":80}};
- given: var els = {}, document = { getElementById: function (id) { return els[id] || (els[id] = { textContent: "", innerHTML: "" }); } };
- loads
- run: (S.score = 120, drawHud(), /120/.test(els.hud.textContent + els.hud.innerHTML)) => true
- run: (S.lives = 7, drawHud(), /7/.test(els.hud.textContent + els.hud.innerHTML)) => true
- run: (S.time = 241.2, drawHud(), /242/.test(els.hud.textContent + els.hud.innerHTML)) => true
- run: (drawHud(), Object.keys(els).join()) => "hud"

### Ideal

```
function drawHud() { var el = document.getElementById("hud"); el.textContent = "Score " + S.score + "   Lives " + S.lives + "   Time " + Math.ceil(S.time); }
```
