---
title: The writers of the engine, short round
runs: 2
max_tokens: 600
thinking: off
---

# The writers of the engine, short round

Ten units of five kinds of program (a function, a handler, a view on a canvas, a view on a box, a state), each asked in six ways that all keep the engine's own instructions and change only what is shown: W1 the engine as it is, W2 with the parts of the program, W3 the real values of the state with the examples and the code of what it uses, W4 a checklist after the context, W5 the task alone, W6 the task and the state.
The score is on what the code DOES. It is meant to take about half an hour on a 4B model at two runs; set runs to 1 in the front matter to halve it.
To read the report, take the mean of each way (W1 to W6) over the ten units, then the mean of each unit over the six ways.

## P1 landOn · W1 the engine as it is

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
stepPlayer(player, input, solids): the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids

Names that exist:
hits, moveThing, stepPlayer, drawScene

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

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

## P1 landOn · W2 the engine with the parts of the program

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
stepPlayer(player, input, solids): the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids

Names that exist:
hits, moveThing, stepPlayer, drawScene

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

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

## P1 landOn · W3 the engine rules, the real values of the state, the examples and the code of what it uses

kind: fn
name: landOn
does: puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands
signature: landOn(thing, solids)

S starts as:
{"mode":"playing","score":0,"coinCount":0,"lives":3,"time":300,"camera":0,"input":{"left":false,"right":false},"player":{"x":40,"y":160,"w":16,"h":24,"vx":0,"vy":0,"grounded":false},"ground":[{"x":0,"y":200,"w":400,"h":40},{"x":460,"y":200,"w":340,"h":40}],"platforms":[{"x":200,"y":140,"w":48,"h":12}],"enemies":[{"x":300,"y":176,"w":16,"h":24,"vx":-1,"vy":0,"alive":true}],"coins":[{"x":210,"y":120,"w":10,"h":10,"taken":false}],"flag":{"x":760,"y":120,"w":8,"h":80}}

These must hold:
landOn({x:0,y:178,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}]) gives {x:0,y:176,w:16,h:24,vy:0,grounded:true}
landOn({x:0,y:100,w:16,h:24,vy:2},[{x:0,y:200,w:100,h:40}]) gives {x:0,y:100,w:16,h:24,vy:2,grounded:false}

Already written:
hits(a, b): true when two things with x, y, w, h overlap
function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

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

## P1 landOn · W4 the engine context and a checklist after

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
stepPlayer(player, input, solids): the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids

Names that exist:
hits, moveThing, stepPlayer, drawScene

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

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

## P1 landOn · W5 the engine rules and the task alone

kind: fn
name: landOn
does: puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands
signature: landOn(thing, solids)

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

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

## P1 landOn · W6 the engine rules, the task and the state

kind: fn
name: landOn
does: puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands
signature: landOn(thing, solids)

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

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

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

## P1 stepPlayer · W1 the engine as it is

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R1. The player runs left and right with the arrow keys and jumps with the up arrow
R2. The player falls with gravity and stands on the ground and on platforms; there are holes in the ground

Task:
kind: fn
name: stepPlayer
does: the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids
signature: stepPlayer(player, input, solids)
examples that must hold:
  stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x  ->  43

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

Names that exist:
hits, moveThing, landOn, drawScene

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
- given: function moveThing(thing, dt) { return { ...thing, x: thing.x + (thing.vx || 0) * dt, y: thing.y + (thing.vy || 0) * dt }; }
- given: function landOn(thing, solids) { if (thing.vy < 0) return { ...thing, grounded: false }; for (const s of solids) { if (hits(thing, s) && thing.y + thing.h - thing.vy <= s.y + 1) return { ...thing, y: s.y - thing.h, vy: 0, grounded: true }; } return { ...thing, grounded: false }; }
- loads
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x => 43
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:false},[]).x => 37
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:true},[]).x => 40
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:false},[]).vy => 0.5
- run: stepPlayer({x:40,y:176,w:16,h:24,vx:0,vy:1,grounded:false},{left:false,right:false},[{x:0,y:200,w:400,h:40}]) => {x:40,y:176,w:16,h:24,vx:0,vy:0,grounded:true}
- run: stepPlayer(Object.freeze({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false}),Object.freeze({left:false,right:true}),Object.freeze([])).x => 43

### Ideal

```
function stepPlayer(player, input, solids) { var p = { ...player, vx: (input.right ? 3 : 0) - (input.left ? 3 : 0), vy: player.vy + 0.5 }; return landOn(moveThing(p, 1), solids); }
```

## P1 stepPlayer · W2 the engine with the parts of the program

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R1. The player runs left and right with the arrow keys and jumps with the up arrow
R2. The player falls with gravity and stands on the ground and on platforms; there are holes in the ground

Task:
kind: fn
name: stepPlayer
does: the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids
signature: stepPlayer(player, input, solids)
examples that must hold:
  stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x  ->  43

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

Names that exist:
hits, moveThing, landOn, drawScene

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
- given: function moveThing(thing, dt) { return { ...thing, x: thing.x + (thing.vx || 0) * dt, y: thing.y + (thing.vy || 0) * dt }; }
- given: function landOn(thing, solids) { if (thing.vy < 0) return { ...thing, grounded: false }; for (const s of solids) { if (hits(thing, s) && thing.y + thing.h - thing.vy <= s.y + 1) return { ...thing, y: s.y - thing.h, vy: 0, grounded: true }; } return { ...thing, grounded: false }; }
- loads
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x => 43
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:false},[]).x => 37
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:true},[]).x => 40
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:false},[]).vy => 0.5
- run: stepPlayer({x:40,y:176,w:16,h:24,vx:0,vy:1,grounded:false},{left:false,right:false},[{x:0,y:200,w:400,h:40}]) => {x:40,y:176,w:16,h:24,vx:0,vy:0,grounded:true}
- run: stepPlayer(Object.freeze({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false}),Object.freeze({left:false,right:true}),Object.freeze([])).x => 43

### Ideal

```
function stepPlayer(player, input, solids) { var p = { ...player, vx: (input.right ? 3 : 0) - (input.left ? 3 : 0), vy: player.vy + 0.5 }; return landOn(moveThing(p, 1), solids); }
```

## P1 stepPlayer · W3 the engine rules, the real values of the state, the examples and the code of what it uses

kind: fn
name: stepPlayer
does: the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids
signature: stepPlayer(player, input, solids)

S starts as:
{"mode":"playing","score":0,"coinCount":0,"lives":3,"time":300,"camera":0,"input":{"left":false,"right":false},"player":{"x":40,"y":160,"w":16,"h":24,"vx":0,"vy":0,"grounded":false},"ground":[{"x":0,"y":200,"w":400,"h":40},{"x":460,"y":200,"w":340,"h":40}],"platforms":[{"x":200,"y":140,"w":48,"h":12}],"enemies":[{"x":300,"y":176,"w":16,"h":24,"vx":-1,"vy":0,"alive":true}],"coins":[{"x":210,"y":120,"w":10,"h":10,"taken":false}],"flag":{"x":760,"y":120,"w":8,"h":80}}

These must hold:
stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x gives 43

Already written:
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

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
- given: function moveThing(thing, dt) { return { ...thing, x: thing.x + (thing.vx || 0) * dt, y: thing.y + (thing.vy || 0) * dt }; }
- given: function landOn(thing, solids) { if (thing.vy < 0) return { ...thing, grounded: false }; for (const s of solids) { if (hits(thing, s) && thing.y + thing.h - thing.vy <= s.y + 1) return { ...thing, y: s.y - thing.h, vy: 0, grounded: true }; } return { ...thing, grounded: false }; }
- loads
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x => 43
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:false},[]).x => 37
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:true},[]).x => 40
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:false},[]).vy => 0.5
- run: stepPlayer({x:40,y:176,w:16,h:24,vx:0,vy:1,grounded:false},{left:false,right:false},[{x:0,y:200,w:400,h:40}]) => {x:40,y:176,w:16,h:24,vx:0,vy:0,grounded:true}
- run: stepPlayer(Object.freeze({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false}),Object.freeze({left:false,right:true}),Object.freeze([])).x => 43

### Ideal

```
function stepPlayer(player, input, solids) { var p = { ...player, vx: (input.right ? 3 : 0) - (input.left ? 3 : 0), vy: player.vy + 0.5 }; return landOn(moveThing(p, 1), solids); }
```

## P1 stepPlayer · W4 the engine context and a checklist after

Program:
Mario-like platformer. Language of the person: English.

Requirements this unit serves:
R1. The player runs left and right with the arrow keys and jumps with the up arrow
R2. The player falls with gravity and stands on the ground and on platforms; there are holes in the ground

Task:
kind: fn
name: stepPlayer
does: the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids
signature: stepPlayer(player, input, solids)
examples that must hold:
  stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x  ->  43

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

Names that exist:
hits, moveThing, landOn, drawScene

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
- given: function moveThing(thing, dt) { return { ...thing, x: thing.x + (thing.vx || 0) * dt, y: thing.y + (thing.vy || 0) * dt }; }
- given: function landOn(thing, solids) { if (thing.vy < 0) return { ...thing, grounded: false }; for (const s of solids) { if (hits(thing, s) && thing.y + thing.h - thing.vy <= s.y + 1) return { ...thing, y: s.y - thing.h, vy: 0, grounded: true }; } return { ...thing, grounded: false }; }
- loads
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x => 43
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:false},[]).x => 37
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:true},[]).x => 40
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:false},[]).vy => 0.5
- run: stepPlayer({x:40,y:176,w:16,h:24,vx:0,vy:1,grounded:false},{left:false,right:false},[{x:0,y:200,w:400,h:40}]) => {x:40,y:176,w:16,h:24,vx:0,vy:0,grounded:true}
- run: stepPlayer(Object.freeze({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false}),Object.freeze({left:false,right:true}),Object.freeze([])).x => 43

### Ideal

```
function stepPlayer(player, input, solids) { var p = { ...player, vx: (input.right ? 3 : 0) - (input.left ? 3 : 0), vy: player.vy + 0.5 }; return landOn(moveThing(p, 1), solids); }
```

## P1 stepPlayer · W5 the engine rules and the task alone

kind: fn
name: stepPlayer
does: the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids
signature: stepPlayer(player, input, solids)

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
- given: function moveThing(thing, dt) { return { ...thing, x: thing.x + (thing.vx || 0) * dt, y: thing.y + (thing.vy || 0) * dt }; }
- given: function landOn(thing, solids) { if (thing.vy < 0) return { ...thing, grounded: false }; for (const s of solids) { if (hits(thing, s) && thing.y + thing.h - thing.vy <= s.y + 1) return { ...thing, y: s.y - thing.h, vy: 0, grounded: true }; } return { ...thing, grounded: false }; }
- loads
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x => 43
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:false},[]).x => 37
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:true},[]).x => 40
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:false},[]).vy => 0.5
- run: stepPlayer({x:40,y:176,w:16,h:24,vx:0,vy:1,grounded:false},{left:false,right:false},[{x:0,y:200,w:400,h:40}]) => {x:40,y:176,w:16,h:24,vx:0,vy:0,grounded:true}
- run: stepPlayer(Object.freeze({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false}),Object.freeze({left:false,right:true}),Object.freeze([])).x => 43

### Ideal

```
function stepPlayer(player, input, solids) { var p = { ...player, vx: (input.right ? 3 : 0) - (input.left ? 3 : 0), vy: player.vy + 0.5 }; return landOn(moveThing(p, 1), solids); }
```

## P1 stepPlayer · W6 the engine rules, the task and the state

kind: fn
name: stepPlayer
does: the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids
signature: stepPlayer(player, input, solids)

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

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
- given: function moveThing(thing, dt) { return { ...thing, x: thing.x + (thing.vx || 0) * dt, y: thing.y + (thing.vy || 0) * dt }; }
- given: function landOn(thing, solids) { if (thing.vy < 0) return { ...thing, grounded: false }; for (const s of solids) { if (hits(thing, s) && thing.y + thing.h - thing.vy <= s.y + 1) return { ...thing, y: s.y - thing.h, vy: 0, grounded: true }; } return { ...thing, grounded: false }; }
- loads
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:true},[]).x => 43
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:false},[]).x => 37
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:true,right:true},[]).x => 40
- run: stepPlayer({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false},{left:false,right:false},[]).vy => 0.5
- run: stepPlayer({x:40,y:176,w:16,h:24,vx:0,vy:1,grounded:false},{left:false,right:false},[{x:0,y:200,w:400,h:40}]) => {x:40,y:176,w:16,h:24,vx:0,vy:0,grounded:true}
- run: stepPlayer(Object.freeze({x:40,y:160,w:16,h:24,vx:0,vy:0,grounded:false}),Object.freeze({left:false,right:true}),Object.freeze([])).x => 43

### Ideal

```
function stepPlayer(player, input, solids) { var p = { ...player, vx: (input.right ? 3 : 0) - (input.left ? 3 : 0), vy: player.vy + 0.5 }; return landOn(moveThing(p, 1), solids); }
```

## P2 S · W1 the engine as it is

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R1. The snake moves by itself one cell at a time on a square grid and wraps around the edges
R2. The arrow keys turn it, never straight back into itself
R3. It eats the food, grows and the score goes up
R4. It dies when it runs into itself
R5. The board shows the snake and the food

Task:
kind: state
name: S
does: everything the program remembers: the mode, the score, the grid size, the direction, the snake as a list of cells and the food

Names that exist:
nextHead, onUp, drawBoard

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 840

### Checks

- json
- contains: "snake"
- contains: "food"
- contains: "dir"
- contains: "mode"
- regex: "x"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "size": 20,
  "dir": "right",
  "snake": [
    {
      "x": 5,
      "y": 10
    },
    {
      "x": 4,
      "y": 10
    },
    {
      "x": 3,
      "y": 10
    }
  ],
  "food": {
    "x": 12,
    "y": 10
  }
}
```

## P2 S · W2 the engine with the parts of the program

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R1. The snake moves by itself one cell at a time on a square grid and wraps around the edges
R2. The arrow keys turn it, never straight back into itself
R3. It eats the food, grows and the score goes up
R4. It dies when it runs into itself
R5. The board shows the snake and the food

Task:
kind: state
name: S
does: everything the program remembers: the mode, the score, the grid size, the direction, the snake as a list of cells and the food

Names that exist:
nextHead, onUp, drawBoard

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 840

### Checks

- json
- contains: "snake"
- contains: "food"
- contains: "dir"
- contains: "mode"
- regex: "x"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "size": 20,
  "dir": "right",
  "snake": [
    {
      "x": 5,
      "y": 10
    },
    {
      "x": 4,
      "y": 10
    },
    {
      "x": 3,
      "y": 10
    }
  ],
  "food": {
    "x": 12,
    "y": 10
  }
}
```

## P2 S · W3 the engine rules, the real values of the state, the examples and the code of what it uses

kind: state
name: S
does: everything the program remembers: the mode, the score, the grid size, the direction, the snake as a list of cells and the food

Requirements:
R1. The snake moves by itself one cell at a time on a square grid and wraps around the edges
R2. The arrow keys turn it, never straight back into itself
R3. It eats the food, grows and the score goes up
R4. It dies when it runs into itself
R5. The board shows the snake and the food

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 840

### Checks

- json
- contains: "snake"
- contains: "food"
- contains: "dir"
- contains: "mode"
- regex: "x"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "size": 20,
  "dir": "right",
  "snake": [
    {
      "x": 5,
      "y": 10
    },
    {
      "x": 4,
      "y": 10
    },
    {
      "x": 3,
      "y": 10
    }
  ],
  "food": {
    "x": 12,
    "y": 10
  }
}
```

## P2 S · W4 the engine context and a checklist after

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R1. The snake moves by itself one cell at a time on a square grid and wraps around the edges
R2. The arrow keys turn it, never straight back into itself
R3. It eats the food, grows and the score goes up
R4. It dies when it runs into itself
R5. The board shows the snake and the food

Task:
kind: state
name: S
does: everything the program remembers: the mode, the score, the grid size, the direction, the snake as a list of cells and the food

Names that exist:
nextHead, onUp, drawBoard

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 840

### Checks

- json
- contains: "snake"
- contains: "food"
- contains: "dir"
- contains: "mode"
- regex: "x"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "size": 20,
  "dir": "right",
  "snake": [
    {
      "x": 5,
      "y": 10
    },
    {
      "x": 4,
      "y": 10
    },
    {
      "x": 3,
      "y": 10
    }
  ],
  "food": {
    "x": 12,
    "y": 10
  }
}
```

## P2 S · W5 the engine rules and the task alone

kind: state
name: S
does: everything the program remembers: the mode, the score, the grid size, the direction, the snake as a list of cells and the food

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 840

### Checks

- json
- contains: "snake"
- contains: "food"
- contains: "dir"
- contains: "mode"
- regex: "x"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "size": 20,
  "dir": "right",
  "snake": [
    {
      "x": 5,
      "y": 10
    },
    {
      "x": 4,
      "y": 10
    },
    {
      "x": 3,
      "y": 10
    }
  ],
  "food": {
    "x": 12,
    "y": 10
  }
}
```

## P2 S · W6 the engine rules, the task and the state

kind: state
name: S
does: everything the program remembers: the mode, the score, the grid size, the direction, the snake as a list of cells and the food

Requirements:
R1. The snake moves by itself one cell at a time on a square grid and wraps around the edges
R2. The arrow keys turn it, never straight back into itself
R3. It eats the food, grows and the score goes up
R4. It dies when it runs into itself
R5. The board shows the snake and the food

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 840

### Checks

- json
- contains: "snake"
- contains: "food"
- contains: "dir"
- contains: "mode"
- regex: "x"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "size": 20,
  "dir": "right",
  "snake": [
    {
      "x": 5,
      "y": 10
    },
    {
      "x": 4,
      "y": 10
    },
    {
      "x": 3,
      "y": 10
    }
  ],
  "food": {
    "x": 12,
    "y": 10
  }
}
```

## P2 nextHead · W1 the engine as it is

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R1. The snake moves by itself one cell at a time on a square grid and wraps around the edges

Task:
kind: fn
name: nextHead
does: the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells
signature: nextHead(head, dir, size)
examples that must hold:
  nextHead({x:5,y:10},"right",20)  ->  {x:6,y:10}
  nextHead({x:19,y:3},"right",20)  ->  {x:0,y:3}

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

Names that exist:
onUp, drawBoard

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: nextHead({x:5,y:10},"right",20) => {x:6,y:10}
- run: nextHead({x:19,y:3},"right",20) => {x:0,y:3}
- run: nextHead({x:0,y:3},"left",20) => {x:19,y:3}
- run: nextHead({x:4,y:0},"up",20) => {x:4,y:19}
- run: nextHead({x:4,y:19},"down",20) => {x:4,y:0}
- run: nextHead({x:4,y:7},"down",10) => {x:4,y:8}
- run: nextHead(Object.freeze({x:1,y:1}),"left",5) => {x:0,y:1}

### Ideal

```
function nextHead(head, dir, size) {
  var dx = dir === "right" ? 1 : dir === "left" ? -1 : 0, dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
  return { x: (head.x + dx + size) % size, y: (head.y + dy + size) % size };
}
```

## P2 nextHead · W2 the engine with the parts of the program

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R1. The snake moves by itself one cell at a time on a square grid and wraps around the edges

Task:
kind: fn
name: nextHead
does: the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells
signature: nextHead(head, dir, size)
examples that must hold:
  nextHead({x:5,y:10},"right",20)  ->  {x:6,y:10}
  nextHead({x:19,y:3},"right",20)  ->  {x:0,y:3}

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

Names that exist:
onUp, drawBoard

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: nextHead({x:5,y:10},"right",20) => {x:6,y:10}
- run: nextHead({x:19,y:3},"right",20) => {x:0,y:3}
- run: nextHead({x:0,y:3},"left",20) => {x:19,y:3}
- run: nextHead({x:4,y:0},"up",20) => {x:4,y:19}
- run: nextHead({x:4,y:19},"down",20) => {x:4,y:0}
- run: nextHead({x:4,y:7},"down",10) => {x:4,y:8}
- run: nextHead(Object.freeze({x:1,y:1}),"left",5) => {x:0,y:1}

### Ideal

```
function nextHead(head, dir, size) {
  var dx = dir === "right" ? 1 : dir === "left" ? -1 : 0, dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
  return { x: (head.x + dx + size) % size, y: (head.y + dy + size) % size };
}
```

## P2 nextHead · W3 the engine rules, the real values of the state, the examples and the code of what it uses

kind: fn
name: nextHead
does: the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells
signature: nextHead(head, dir, size)

S starts as:
{"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}}

These must hold:
nextHead({x:5,y:10},"right",20) gives {x:6,y:10}
nextHead({x:19,y:3},"right",20) gives {x:0,y:3}

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: nextHead({x:5,y:10},"right",20) => {x:6,y:10}
- run: nextHead({x:19,y:3},"right",20) => {x:0,y:3}
- run: nextHead({x:0,y:3},"left",20) => {x:19,y:3}
- run: nextHead({x:4,y:0},"up",20) => {x:4,y:19}
- run: nextHead({x:4,y:19},"down",20) => {x:4,y:0}
- run: nextHead({x:4,y:7},"down",10) => {x:4,y:8}
- run: nextHead(Object.freeze({x:1,y:1}),"left",5) => {x:0,y:1}

### Ideal

```
function nextHead(head, dir, size) {
  var dx = dir === "right" ? 1 : dir === "left" ? -1 : 0, dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
  return { x: (head.x + dx + size) % size, y: (head.y + dy + size) % size };
}
```

## P2 nextHead · W4 the engine context and a checklist after

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R1. The snake moves by itself one cell at a time on a square grid and wraps around the edges

Task:
kind: fn
name: nextHead
does: the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells
signature: nextHead(head, dir, size)
examples that must hold:
  nextHead({x:5,y:10},"right",20)  ->  {x:6,y:10}
  nextHead({x:19,y:3},"right",20)  ->  {x:0,y:3}

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

Names that exist:
onUp, drawBoard

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: nextHead({x:5,y:10},"right",20) => {x:6,y:10}
- run: nextHead({x:19,y:3},"right",20) => {x:0,y:3}
- run: nextHead({x:0,y:3},"left",20) => {x:19,y:3}
- run: nextHead({x:4,y:0},"up",20) => {x:4,y:19}
- run: nextHead({x:4,y:19},"down",20) => {x:4,y:0}
- run: nextHead({x:4,y:7},"down",10) => {x:4,y:8}
- run: nextHead(Object.freeze({x:1,y:1}),"left",5) => {x:0,y:1}

### Ideal

```
function nextHead(head, dir, size) {
  var dx = dir === "right" ? 1 : dir === "left" ? -1 : 0, dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
  return { x: (head.x + dx + size) % size, y: (head.y + dy + size) % size };
}
```

## P2 nextHead · W5 the engine rules and the task alone

kind: fn
name: nextHead
does: the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells
signature: nextHead(head, dir, size)

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: nextHead({x:5,y:10},"right",20) => {x:6,y:10}
- run: nextHead({x:19,y:3},"right",20) => {x:0,y:3}
- run: nextHead({x:0,y:3},"left",20) => {x:19,y:3}
- run: nextHead({x:4,y:0},"up",20) => {x:4,y:19}
- run: nextHead({x:4,y:19},"down",20) => {x:4,y:0}
- run: nextHead({x:4,y:7},"down",10) => {x:4,y:8}
- run: nextHead(Object.freeze({x:1,y:1}),"left",5) => {x:0,y:1}

### Ideal

```
function nextHead(head, dir, size) {
  var dx = dir === "right" ? 1 : dir === "left" ? -1 : 0, dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
  return { x: (head.x + dx + size) % size, y: (head.y + dy + size) % size };
}
```

## P2 nextHead · W6 the engine rules, the task and the state

kind: fn
name: nextHead
does: the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells
signature: nextHead(head, dir, size)

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: nextHead({x:5,y:10},"right",20) => {x:6,y:10}
- run: nextHead({x:19,y:3},"right",20) => {x:0,y:3}
- run: nextHead({x:0,y:3},"left",20) => {x:19,y:3}
- run: nextHead({x:4,y:0},"up",20) => {x:4,y:19}
- run: nextHead({x:4,y:19},"down",20) => {x:4,y:0}
- run: nextHead({x:4,y:7},"down",10) => {x:4,y:8}
- run: nextHead(Object.freeze({x:1,y:1}),"left",5) => {x:0,y:1}

### Ideal

```
function nextHead(head, dir, size) {
  var dx = dir === "right" ? 1 : dir === "left" ? -1 : 0, dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
  return { x: (head.x + dx + size) % size, y: (head.y + dy + size) % size };
}
```

## P2 onUp · W1 the engine as it is

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R2. The arrow keys turn it, never straight back into itself

Task:
kind: handler
name: onUp
does: while playing, turns the snake up unless it is going down
called by the event: keydown ArrowUp

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

Elements of the page:
#board (canvas 400x400)
#hud (div)

Functions you can call:
nextHead(head, dir, size): the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells

Names that exist:
nextHead, drawBoard

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- loads
- run: (onUp(), S.dir) => "up"
- run: (S.dir = "down", onUp(), S.dir) => "down"
- run: (S.dir = "left", onUp(), S.dir) => "up"
- run: (S.mode = "over", onUp(), S.dir) => "right"

### Ideal

```
function onUp() { if (S.mode === "playing" && S.dir !== "down") S.dir = "up"; }
```

## P2 onUp · W2 the engine with the parts of the program

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R2. The arrow keys turn it, never straight back into itself

Task:
kind: handler
name: onUp
does: while playing, turns the snake up unless it is going down
called by the event: keydown ArrowUp

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

Elements of the page:
#board (canvas 400x400)
#hud (div)

Functions you can call:
nextHead(head, dir, size): the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells

Names that exist:
nextHead, drawBoard

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- loads
- run: (onUp(), S.dir) => "up"
- run: (S.dir = "down", onUp(), S.dir) => "down"
- run: (S.dir = "left", onUp(), S.dir) => "up"
- run: (S.mode = "over", onUp(), S.dir) => "right"

### Ideal

```
function onUp() { if (S.mode === "playing" && S.dir !== "down") S.dir = "up"; }
```

## P2 onUp · W3 the engine rules, the real values of the state, the examples and the code of what it uses

kind: handler
name: onUp
does: while playing, turns the snake up unless it is going down
called by the event: keydown ArrowUp

S starts as:
{"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}}

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- loads
- run: (onUp(), S.dir) => "up"
- run: (S.dir = "down", onUp(), S.dir) => "down"
- run: (S.dir = "left", onUp(), S.dir) => "up"
- run: (S.mode = "over", onUp(), S.dir) => "right"

### Ideal

```
function onUp() { if (S.mode === "playing" && S.dir !== "down") S.dir = "up"; }
```

## P2 onUp · W4 the engine context and a checklist after

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R2. The arrow keys turn it, never straight back into itself

Task:
kind: handler
name: onUp
does: while playing, turns the snake up unless it is going down
called by the event: keydown ArrowUp

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

Elements of the page:
#board (canvas 400x400)
#hud (div)

Functions you can call:
nextHead(head, dir, size): the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells

Names that exist:
nextHead, drawBoard

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- loads
- run: (onUp(), S.dir) => "up"
- run: (S.dir = "down", onUp(), S.dir) => "down"
- run: (S.dir = "left", onUp(), S.dir) => "up"
- run: (S.mode = "over", onUp(), S.dir) => "right"

### Ideal

```
function onUp() { if (S.mode === "playing" && S.dir !== "down") S.dir = "up"; }
```

## P2 onUp · W5 the engine rules and the task alone

kind: handler
name: onUp
does: while playing, turns the snake up unless it is going down
called by the event: keydown ArrowUp

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- loads
- run: (onUp(), S.dir) => "up"
- run: (S.dir = "down", onUp(), S.dir) => "down"
- run: (S.dir = "left", onUp(), S.dir) => "up"
- run: (S.mode = "over", onUp(), S.dir) => "right"

### Ideal

```
function onUp() { if (S.mode === "playing" && S.dir !== "down") S.dir = "up"; }
```

## P2 onUp · W6 the engine rules, the task and the state

kind: handler
name: onUp
does: while playing, turns the snake up unless it is going down
called by the event: keydown ArrowUp

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- loads
- run: (onUp(), S.dir) => "up"
- run: (S.dir = "down", onUp(), S.dir) => "down"
- run: (S.dir = "left", onUp(), S.dir) => "up"
- run: (S.mode = "over", onUp(), S.dir) => "right"

### Ideal

```
function onUp() { if (S.mode === "playing" && S.dir !== "down") S.dir = "up"; }
```

## P2 drawBoard · W1 the engine as it is

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R5. The board shows the snake and the food

Task:
kind: view
name: drawBoard
does: draws the snake and the food as squares of canvas width divided by the grid size, on a dark background
draws into the element #board

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

The element it draws into:
#board (canvas 400x400): canvas and ctx are already declared

Names that exist:
nextHead, onUp

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }), canvas = { width: 400, height: 400, getContext: function () { return ctx; } }; var document = { getElementById: function () { return canvas; } };
- loads
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 100 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 240 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (S.size = 10, drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 200 && c[2] === 400 && c[3] === 40 && c[4] === 40; })) => true
- run: (S.snake.pop(), drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200; })) => false

### Ideal

```
function drawBoard() {
  var k = canvas.width / S.size;
  ctx.fillStyle = "#222"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4caf50";
  S.snake.forEach(function (c) { ctx.fillRect(c.x * k, c.y * k, k, k); });
  ctx.fillStyle = "#e53935";
  ctx.fillRect(S.food.x * k, S.food.y * k, k, k);
}
```

## P2 drawBoard · W2 the engine with the parts of the program

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R5. The board shows the snake and the food

Task:
kind: view
name: drawBoard
does: draws the snake and the food as squares of canvas width divided by the grid size, on a dark background
draws into the element #board

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

The element it draws into:
#board (canvas 400x400): canvas and ctx are already declared

Names that exist:
nextHead, onUp

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }), canvas = { width: 400, height: 400, getContext: function () { return ctx; } }; var document = { getElementById: function () { return canvas; } };
- loads
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 100 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 240 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (S.size = 10, drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 200 && c[2] === 400 && c[3] === 40 && c[4] === 40; })) => true
- run: (S.snake.pop(), drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200; })) => false

### Ideal

```
function drawBoard() {
  var k = canvas.width / S.size;
  ctx.fillStyle = "#222"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4caf50";
  S.snake.forEach(function (c) { ctx.fillRect(c.x * k, c.y * k, k, k); });
  ctx.fillStyle = "#e53935";
  ctx.fillRect(S.food.x * k, S.food.y * k, k, k);
}
```

## P2 drawBoard · W3 the engine rules, the real values of the state, the examples and the code of what it uses

kind: view
name: drawBoard
does: draws the snake and the food as squares of canvas width divided by the grid size, on a dark background
draws into the element #board

S starts as:
{"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}}

Elements of the page:
#board (canvas 400x400)
#hud (div)

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }), canvas = { width: 400, height: 400, getContext: function () { return ctx; } }; var document = { getElementById: function () { return canvas; } };
- loads
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 100 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 240 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (S.size = 10, drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 200 && c[2] === 400 && c[3] === 40 && c[4] === 40; })) => true
- run: (S.snake.pop(), drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200; })) => false

### Ideal

```
function drawBoard() {
  var k = canvas.width / S.size;
  ctx.fillStyle = "#222"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4caf50";
  S.snake.forEach(function (c) { ctx.fillRect(c.x * k, c.y * k, k, k); });
  ctx.fillStyle = "#e53935";
  ctx.fillRect(S.food.x * k, S.food.y * k, k, k);
}
```

## P2 drawBoard · W4 the engine context and a checklist after

Program:
Snake. Language of the person: English.

Requirements this unit serves:
R5. The board shows the snake and the food

Task:
kind: view
name: drawBoard
does: draws the snake and the food as squares of canvas width divided by the grid size, on a dark background
draws into the element #board

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

The element it draws into:
#board (canvas 400x400): canvas and ctx are already declared

Names that exist:
nextHead, onUp

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }), canvas = { width: 400, height: 400, getContext: function () { return ctx; } }; var document = { getElementById: function () { return canvas; } };
- loads
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 100 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 240 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (S.size = 10, drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 200 && c[2] === 400 && c[3] === 40 && c[4] === 40; })) => true
- run: (S.snake.pop(), drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200; })) => false

### Ideal

```
function drawBoard() {
  var k = canvas.width / S.size;
  ctx.fillStyle = "#222"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4caf50";
  S.snake.forEach(function (c) { ctx.fillRect(c.x * k, c.y * k, k, k); });
  ctx.fillStyle = "#e53935";
  ctx.fillRect(S.food.x * k, S.food.y * k, k, k);
}
```

## P2 drawBoard · W5 the engine rules and the task alone

kind: view
name: drawBoard
does: draws the snake and the food as squares of canvas width divided by the grid size, on a dark background
draws into the element #board

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }), canvas = { width: 400, height: 400, getContext: function () { return ctx; } }; var document = { getElementById: function () { return canvas; } };
- loads
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 100 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 240 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (S.size = 10, drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 200 && c[2] === 400 && c[3] === 40 && c[4] === 40; })) => true
- run: (S.snake.pop(), drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200; })) => false

### Ideal

```
function drawBoard() {
  var k = canvas.width / S.size;
  ctx.fillStyle = "#222"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4caf50";
  S.snake.forEach(function (c) { ctx.fillRect(c.x * k, c.y * k, k, k); });
  ctx.fillStyle = "#e53935";
  ctx.fillRect(S.food.x * k, S.food.y * k, k, k);
}
```

## P2 drawBoard · W6 the engine rules, the task and the state

kind: view
name: drawBoard
does: draws the snake and the food as squares of canvas width divided by the grid size, on a dark background
draws into the element #board

The state S:
mode: string ("playing")
score: number (0)
size: number (20)
dir: string ("right")
snake: list of {x, y}
food: {x, y}

Elements of the page:
#board (canvas 400x400)
#hud (div)

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }), canvas = { width: 400, height: 400, getContext: function () { return ctx; } }; var document = { getElementById: function () { return canvas; } };
- loads
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 100 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 240 && c[2] === 200 && c[3] === 20 && c[4] === 20; })) => true
- run: (S.size = 10, drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 200 && c[2] === 400 && c[3] === 40 && c[4] === 40; })) => true
- run: (S.snake.pop(), drawBoard(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 60 && c[2] === 200; })) => false

### Ideal

```
function drawBoard() {
  var k = canvas.width / S.size;
  ctx.fillStyle = "#222"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4caf50";
  S.snake.forEach(function (c) { ctx.fillRect(c.x * k, c.y * k, k, k); });
  ctx.fillStyle = "#e53935";
  ctx.fillRect(S.food.x * k, S.food.y * k, k, k);
}
```

## P3 bounceWalls · W1 the engine as it is

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R1. A ball moves and bounces off the walls and the ceiling

Task:
kind: fn
name: bounceWalls
does: a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is
signature: bounceWalls(ball, width)
examples that must hold:
  bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx  ->  3
  bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400)  ->  {x:200,y:100,r:6,vx:3,vy:2}

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

Names that exist:
onLeft, drawGame

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx => 3
- run: bounceWalls({x:397,y:100,r:6,vx:3,vy:2},400).vx => -3
- run: bounceWalls({x:200,y:4,r:6,vx:3,vy:-3},400).vy => 3
- run: bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400) => {x:200,y:100,r:6,vx:3,vy:2}
- run: bounceWalls({x:3,y:100,r:6,vx:3,vy:2},400).vx => 3
- run: (function () { var b = Object.freeze({x:3,y:100,r:6,vx:-3,vy:2}); return bounceWalls(b,400).vx; })() => 3

### Ideal

```
function bounceWalls(ball, width) {
  var b = { ...ball };
  if ((b.x - b.r <= 0 && b.vx < 0) || (b.x + b.r >= width && b.vx > 0)) b.vx = -b.vx;
  if (b.y - b.r <= 0 && b.vy < 0) b.vy = -b.vy;
  return b;
}
```

## P3 bounceWalls · W2 the engine with the parts of the program

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R1. A ball moves and bounces off the walls and the ceiling

Task:
kind: fn
name: bounceWalls
does: a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is
signature: bounceWalls(ball, width)
examples that must hold:
  bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx  ->  3
  bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400)  ->  {x:200,y:100,r:6,vx:3,vy:2}

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

Names that exist:
onLeft, drawGame

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx => 3
- run: bounceWalls({x:397,y:100,r:6,vx:3,vy:2},400).vx => -3
- run: bounceWalls({x:200,y:4,r:6,vx:3,vy:-3},400).vy => 3
- run: bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400) => {x:200,y:100,r:6,vx:3,vy:2}
- run: bounceWalls({x:3,y:100,r:6,vx:3,vy:2},400).vx => 3
- run: (function () { var b = Object.freeze({x:3,y:100,r:6,vx:-3,vy:2}); return bounceWalls(b,400).vx; })() => 3

### Ideal

```
function bounceWalls(ball, width) {
  var b = { ...ball };
  if ((b.x - b.r <= 0 && b.vx < 0) || (b.x + b.r >= width && b.vx > 0)) b.vx = -b.vx;
  if (b.y - b.r <= 0 && b.vy < 0) b.vy = -b.vy;
  return b;
}
```

## P3 bounceWalls · W3 the engine rules, the real values of the state, the examples and the code of what it uses

kind: fn
name: bounceWalls
does: a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is
signature: bounceWalls(ball, width)

S starts as:
{"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]}

These must hold:
bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx gives 3
bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400) gives {x:200,y:100,r:6,vx:3,vy:2}

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx => 3
- run: bounceWalls({x:397,y:100,r:6,vx:3,vy:2},400).vx => -3
- run: bounceWalls({x:200,y:4,r:6,vx:3,vy:-3},400).vy => 3
- run: bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400) => {x:200,y:100,r:6,vx:3,vy:2}
- run: bounceWalls({x:3,y:100,r:6,vx:3,vy:2},400).vx => 3
- run: (function () { var b = Object.freeze({x:3,y:100,r:6,vx:-3,vy:2}); return bounceWalls(b,400).vx; })() => 3

### Ideal

```
function bounceWalls(ball, width) {
  var b = { ...ball };
  if ((b.x - b.r <= 0 && b.vx < 0) || (b.x + b.r >= width && b.vx > 0)) b.vx = -b.vx;
  if (b.y - b.r <= 0 && b.vy < 0) b.vy = -b.vy;
  return b;
}
```

## P3 bounceWalls · W4 the engine context and a checklist after

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R1. A ball moves and bounces off the walls and the ceiling

Task:
kind: fn
name: bounceWalls
does: a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is
signature: bounceWalls(ball, width)
examples that must hold:
  bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx  ->  3
  bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400)  ->  {x:200,y:100,r:6,vx:3,vy:2}

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

Names that exist:
onLeft, drawGame

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx => 3
- run: bounceWalls({x:397,y:100,r:6,vx:3,vy:2},400).vx => -3
- run: bounceWalls({x:200,y:4,r:6,vx:3,vy:-3},400).vy => 3
- run: bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400) => {x:200,y:100,r:6,vx:3,vy:2}
- run: bounceWalls({x:3,y:100,r:6,vx:3,vy:2},400).vx => 3
- run: (function () { var b = Object.freeze({x:3,y:100,r:6,vx:-3,vy:2}); return bounceWalls(b,400).vx; })() => 3

### Ideal

```
function bounceWalls(ball, width) {
  var b = { ...ball };
  if ((b.x - b.r <= 0 && b.vx < 0) || (b.x + b.r >= width && b.vx > 0)) b.vx = -b.vx;
  if (b.y - b.r <= 0 && b.vy < 0) b.vy = -b.vy;
  return b;
}
```

## P3 bounceWalls · W5 the engine rules and the task alone

kind: fn
name: bounceWalls
does: a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is
signature: bounceWalls(ball, width)

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx => 3
- run: bounceWalls({x:397,y:100,r:6,vx:3,vy:2},400).vx => -3
- run: bounceWalls({x:200,y:4,r:6,vx:3,vy:-3},400).vy => 3
- run: bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400) => {x:200,y:100,r:6,vx:3,vy:2}
- run: bounceWalls({x:3,y:100,r:6,vx:3,vy:2},400).vx => 3
- run: (function () { var b = Object.freeze({x:3,y:100,r:6,vx:-3,vy:2}); return bounceWalls(b,400).vx; })() => 3

### Ideal

```
function bounceWalls(ball, width) {
  var b = { ...ball };
  if ((b.x - b.r <= 0 && b.vx < 0) || (b.x + b.r >= width && b.vx > 0)) b.vx = -b.vx;
  if (b.y - b.r <= 0 && b.vy < 0) b.vy = -b.vy;
  return b;
}
```

## P3 bounceWalls · W6 the engine rules, the task and the state

kind: fn
name: bounceWalls
does: a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is
signature: bounceWalls(ball, width)

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- loads
- run: bounceWalls({x:3,y:100,r:6,vx:-3,vy:2},400).vx => 3
- run: bounceWalls({x:397,y:100,r:6,vx:3,vy:2},400).vx => -3
- run: bounceWalls({x:200,y:4,r:6,vx:3,vy:-3},400).vy => 3
- run: bounceWalls({x:200,y:100,r:6,vx:3,vy:2},400) => {x:200,y:100,r:6,vx:3,vy:2}
- run: bounceWalls({x:3,y:100,r:6,vx:3,vy:2},400).vx => 3
- run: (function () { var b = Object.freeze({x:3,y:100,r:6,vx:-3,vy:2}); return bounceWalls(b,400).vx; })() => 3

### Ideal

```
function bounceWalls(ball, width) {
  var b = { ...ball };
  if ((b.x - b.r <= 0 && b.vx < 0) || (b.x + b.r >= width && b.vx > 0)) b.vx = -b.vx;
  if (b.y - b.r <= 0 && b.vy < 0) b.vy = -b.vy;
  return b;
}
```

## P4 onAdd · W1 the engine as it is

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R1. The person types a task and adds it with a button

Task:
kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

Elements of the page:
#title (input)
#add (button)
#list (ul)
#count (span)

Functions you can call:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed

Names that exist:
visibleTasks, drawList

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = { title: { value: "  Walk dog " } }, document = { getElementById: function (id) { return els[id]; } };
- loads
- run: (onAdd(), S.tasks.length) => 3
- run: (onAdd(), S.tasks[2].title) => "Walk dog"
- run: (onAdd(), [S.tasks[2].id, S.tasks[2].done, S.next]) => [3, false, 4]
- run: (onAdd(), els.title.value) => ""
- run: (els.title.value = "   ", onAdd(), [S.tasks.length, S.next]) => [2, 3]

### Ideal

```
function onAdd() {
  var el = document.getElementById("title");
  var t = el.value.trim();
  if (!t) return;
  S.tasks.push({ id: S.next, title: t, done: false });
  S.next += 1;
  el.value = "";
}
```

## P4 onAdd · W2 the engine with the parts of the program

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R1. The person types a task and adds it with a button

Task:
kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

Elements of the page:
#title (input)
#add (button)
#list (ul)
#count (span)

Functions you can call:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed

Names that exist:
visibleTasks, drawList

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = { title: { value: "  Walk dog " } }, document = { getElementById: function (id) { return els[id]; } };
- loads
- run: (onAdd(), S.tasks.length) => 3
- run: (onAdd(), S.tasks[2].title) => "Walk dog"
- run: (onAdd(), [S.tasks[2].id, S.tasks[2].done, S.next]) => [3, false, 4]
- run: (onAdd(), els.title.value) => ""
- run: (els.title.value = "   ", onAdd(), [S.tasks.length, S.next]) => [2, 3]

### Ideal

```
function onAdd() {
  var el = document.getElementById("title");
  var t = el.value.trim();
  if (!t) return;
  S.tasks.push({ id: S.next, title: t, done: false });
  S.next += 1;
  el.value = "";
}
```

## P4 onAdd · W3 the engine rules, the real values of the state, the examples and the code of what it uses

kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

S starts as:
{"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]}

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = { title: { value: "  Walk dog " } }, document = { getElementById: function (id) { return els[id]; } };
- loads
- run: (onAdd(), S.tasks.length) => 3
- run: (onAdd(), S.tasks[2].title) => "Walk dog"
- run: (onAdd(), [S.tasks[2].id, S.tasks[2].done, S.next]) => [3, false, 4]
- run: (onAdd(), els.title.value) => ""
- run: (els.title.value = "   ", onAdd(), [S.tasks.length, S.next]) => [2, 3]

### Ideal

```
function onAdd() {
  var el = document.getElementById("title");
  var t = el.value.trim();
  if (!t) return;
  S.tasks.push({ id: S.next, title: t, done: false });
  S.next += 1;
  el.value = "";
}
```

## P4 onAdd · W4 the engine context and a checklist after

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R1. The person types a task and adds it with a button

Task:
kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

Elements of the page:
#title (input)
#add (button)
#list (ul)
#count (span)

Functions you can call:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed

Names that exist:
visibleTasks, drawList

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = { title: { value: "  Walk dog " } }, document = { getElementById: function (id) { return els[id]; } };
- loads
- run: (onAdd(), S.tasks.length) => 3
- run: (onAdd(), S.tasks[2].title) => "Walk dog"
- run: (onAdd(), [S.tasks[2].id, S.tasks[2].done, S.next]) => [3, false, 4]
- run: (onAdd(), els.title.value) => ""
- run: (els.title.value = "   ", onAdd(), [S.tasks.length, S.next]) => [2, 3]

### Ideal

```
function onAdd() {
  var el = document.getElementById("title");
  var t = el.value.trim();
  if (!t) return;
  S.tasks.push({ id: S.next, title: t, done: false });
  S.next += 1;
  el.value = "";
}
```

## P4 onAdd · W5 the engine rules and the task alone

kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = { title: { value: "  Walk dog " } }, document = { getElementById: function (id) { return els[id]; } };
- loads
- run: (onAdd(), S.tasks.length) => 3
- run: (onAdd(), S.tasks[2].title) => "Walk dog"
- run: (onAdd(), [S.tasks[2].id, S.tasks[2].done, S.next]) => [3, false, 4]
- run: (onAdd(), els.title.value) => ""
- run: (els.title.value = "   ", onAdd(), [S.tasks.length, S.next]) => [2, 3]

### Ideal

```
function onAdd() {
  var el = document.getElementById("title");
  var t = el.value.trim();
  if (!t) return;
  S.tasks.push({ id: S.next, title: t, done: false });
  S.next += 1;
  el.value = "";
}
```

## P4 onAdd · W6 the engine rules, the task and the state

kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = { title: { value: "  Walk dog " } }, document = { getElementById: function (id) { return els[id]; } };
- loads
- run: (onAdd(), S.tasks.length) => 3
- run: (onAdd(), S.tasks[2].title) => "Walk dog"
- run: (onAdd(), [S.tasks[2].id, S.tasks[2].done, S.next]) => [3, false, 4]
- run: (onAdd(), els.title.value) => ""
- run: (els.title.value = "   ", onAdd(), [S.tasks.length, S.next]) => [2, 3]

### Ideal

```
function onAdd() {
  var el = document.getElementById("title");
  var t = el.value.trim();
  if (!t) return;
  S.tasks.push({ id: S.next, title: t, done: false });
  S.next += 1;
  el.value = "";
}
```

## P4 drawList · W1 the engine as it is

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R2. Tasks are listed and each can be done or not

Task:
kind: view
name: drawList
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
draws into the element #list

What it uses:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

The element it draws into:
#list (ul): fill it yourself (innerHTML or textContent), it is yours

Functions you can call:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed

Names that exist:
visibleTasks, onAdd

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = {}, document = { getElementById: function (id) { return els[id] || (els[id] = { textContent: "", innerHTML: "", value: "" }); } };
- given: function visibleTasks(tasks, filter) { if (filter === "active") return tasks.filter(function (t) { return !t.done; }); if (filter === "done") return tasks.filter(function (t) { return t.done; }); return tasks.slice(); }
- loads
- run: (drawList(), /Buy milk/.test(els.list.innerHTML)) => true
- run: (drawList(), (els.list.innerHTML.match(/<li/g) || []).length) => 2
- run: (drawList(), /done/.test(els.list.innerHTML)) => true
- run: (S.filter = "active", drawList(), /Call Sam/.test(els.list.innerHTML)) => false
- run: (S.filter = "done", drawList(), /Buy milk/.test(els.list.innerHTML)) => false
- run: (drawList(), Object.keys(els).join()) => "list"

### Ideal

```
function drawList() {
  var el = document.getElementById("list");
  el.innerHTML = visibleTasks(S.tasks, S.filter).map(function (t) { return "<li class=\"" + (t.done ? "done" : "") + "\">" + t.title + "</li>"; }).join("");
}
```

## P4 drawList · W2 the engine with the parts of the program

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R2. Tasks are listed and each can be done or not

Task:
kind: view
name: drawList
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
draws into the element #list

What it uses:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

The element it draws into:
#list (ul): fill it yourself (innerHTML or textContent), it is yours

Functions you can call:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed

Names that exist:
visibleTasks, onAdd

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = {}, document = { getElementById: function (id) { return els[id] || (els[id] = { textContent: "", innerHTML: "", value: "" }); } };
- given: function visibleTasks(tasks, filter) { if (filter === "active") return tasks.filter(function (t) { return !t.done; }); if (filter === "done") return tasks.filter(function (t) { return t.done; }); return tasks.slice(); }
- loads
- run: (drawList(), /Buy milk/.test(els.list.innerHTML)) => true
- run: (drawList(), (els.list.innerHTML.match(/<li/g) || []).length) => 2
- run: (drawList(), /done/.test(els.list.innerHTML)) => true
- run: (S.filter = "active", drawList(), /Call Sam/.test(els.list.innerHTML)) => false
- run: (S.filter = "done", drawList(), /Buy milk/.test(els.list.innerHTML)) => false
- run: (drawList(), Object.keys(els).join()) => "list"

### Ideal

```
function drawList() {
  var el = document.getElementById("list");
  el.innerHTML = visibleTasks(S.tasks, S.filter).map(function (t) { return "<li class=\"" + (t.done ? "done" : "") + "\">" + t.title + "</li>"; }).join("");
}
```

## P4 drawList · W3 the engine rules, the real values of the state, the examples and the code of what it uses

kind: view
name: drawList
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
draws into the element #list

S starts as:
{"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]}

Already written:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}

Elements of the page:
#title (input)
#add (button)
#list (ul)
#count (span)

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = {}, document = { getElementById: function (id) { return els[id] || (els[id] = { textContent: "", innerHTML: "", value: "" }); } };
- given: function visibleTasks(tasks, filter) { if (filter === "active") return tasks.filter(function (t) { return !t.done; }); if (filter === "done") return tasks.filter(function (t) { return t.done; }); return tasks.slice(); }
- loads
- run: (drawList(), /Buy milk/.test(els.list.innerHTML)) => true
- run: (drawList(), (els.list.innerHTML.match(/<li/g) || []).length) => 2
- run: (drawList(), /done/.test(els.list.innerHTML)) => true
- run: (S.filter = "active", drawList(), /Call Sam/.test(els.list.innerHTML)) => false
- run: (S.filter = "done", drawList(), /Buy milk/.test(els.list.innerHTML)) => false
- run: (drawList(), Object.keys(els).join()) => "list"

### Ideal

```
function drawList() {
  var el = document.getElementById("list");
  el.innerHTML = visibleTasks(S.tasks, S.filter).map(function (t) { return "<li class=\"" + (t.done ? "done" : "") + "\">" + t.title + "</li>"; }).join("");
}
```

## P4 drawList · W4 the engine context and a checklist after

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R2. Tasks are listed and each can be done or not

Task:
kind: view
name: drawList
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
draws into the element #list

What it uses:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

The element it draws into:
#list (ul): fill it yourself (innerHTML or textContent), it is yours

Functions you can call:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed

Names that exist:
visibleTasks, onAdd

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = {}, document = { getElementById: function (id) { return els[id] || (els[id] = { textContent: "", innerHTML: "", value: "" }); } };
- given: function visibleTasks(tasks, filter) { if (filter === "active") return tasks.filter(function (t) { return !t.done; }); if (filter === "done") return tasks.filter(function (t) { return t.done; }); return tasks.slice(); }
- loads
- run: (drawList(), /Buy milk/.test(els.list.innerHTML)) => true
- run: (drawList(), (els.list.innerHTML.match(/<li/g) || []).length) => 2
- run: (drawList(), /done/.test(els.list.innerHTML)) => true
- run: (S.filter = "active", drawList(), /Call Sam/.test(els.list.innerHTML)) => false
- run: (S.filter = "done", drawList(), /Buy milk/.test(els.list.innerHTML)) => false
- run: (drawList(), Object.keys(els).join()) => "list"

### Ideal

```
function drawList() {
  var el = document.getElementById("list");
  el.innerHTML = visibleTasks(S.tasks, S.filter).map(function (t) { return "<li class=\"" + (t.done ? "done" : "") + "\">" + t.title + "</li>"; }).join("");
}
```

## P4 drawList · W5 the engine rules and the task alone

kind: view
name: drawList
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
draws into the element #list

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = {}, document = { getElementById: function (id) { return els[id] || (els[id] = { textContent: "", innerHTML: "", value: "" }); } };
- given: function visibleTasks(tasks, filter) { if (filter === "active") return tasks.filter(function (t) { return !t.done; }); if (filter === "done") return tasks.filter(function (t) { return t.done; }); return tasks.slice(); }
- loads
- run: (drawList(), /Buy milk/.test(els.list.innerHTML)) => true
- run: (drawList(), (els.list.innerHTML.match(/<li/g) || []).length) => 2
- run: (drawList(), /done/.test(els.list.innerHTML)) => true
- run: (S.filter = "active", drawList(), /Call Sam/.test(els.list.innerHTML)) => false
- run: (S.filter = "done", drawList(), /Buy milk/.test(els.list.innerHTML)) => false
- run: (drawList(), Object.keys(els).join()) => "list"

### Ideal

```
function drawList() {
  var el = document.getElementById("list");
  el.innerHTML = visibleTasks(S.tasks, S.filter).map(function (t) { return "<li class=\"" + (t.done ? "done" : "") + "\">" + t.title + "</li>"; }).join("");
}
```

## P4 drawList · W6 the engine rules, the task and the state

kind: view
name: drawList
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
draws into the element #list

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

Elements of the page:
#title (input)
#add (button)
#list (ul)
#count (span)

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var S = {"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]};
- given: var els = {}, document = { getElementById: function (id) { return els[id] || (els[id] = { textContent: "", innerHTML: "", value: "" }); } };
- given: function visibleTasks(tasks, filter) { if (filter === "active") return tasks.filter(function (t) { return !t.done; }); if (filter === "done") return tasks.filter(function (t) { return t.done; }); return tasks.slice(); }
- loads
- run: (drawList(), /Buy milk/.test(els.list.innerHTML)) => true
- run: (drawList(), (els.list.innerHTML.match(/<li/g) || []).length) => 2
- run: (drawList(), /done/.test(els.list.innerHTML)) => true
- run: (S.filter = "active", drawList(), /Call Sam/.test(els.list.innerHTML)) => false
- run: (S.filter = "done", drawList(), /Buy milk/.test(els.list.innerHTML)) => false
- run: (drawList(), Object.keys(els).join()) => "list"

### Ideal

```
function drawList() {
  var el = document.getElementById("list");
  el.innerHTML = visibleTasks(S.tasks, S.filter).map(function (t) { return "<li class=\"" + (t.done ? "done" : "") + "\">" + t.title + "</li>"; }).join("");
}
```

## P5 toggleCell · W1 the engine as it is

Program:
Lights Out. Language of the person: English.

Requirements this unit serves:
R2. Pressing a light flips it and the lights just above, below, left and right of it

Task:
kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)
examples that must hold:
  toggleCell([[false,false],[false,false]],0,0)  ->  [[true,true],[true,false]]

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

Functions you can call:
isSolved(grid): true when every light of the grid is off

Names that exist:
isSolved

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var G = [[false,false,false],[false,false,false],[false,false,false]];
- loads
- run: toggleCell(G,1,1) => [[false,true,false],[true,true,true],[false,true,false]]
- run: toggleCell(G,0,0) => [[true,true,false],[true,false,false],[false,false,false]]
- run: toggleCell(G,2,2) => [[false,false,false],[false,false,true],[false,true,true]]
- run: toggleCell(toggleCell(G,2,1),2,1) => G
- run: (toggleCell(G,0,0), JSON.stringify(G)) => "[[false,false,false],[false,false,false],[false,false,false]]"

### Ideal

```
function toggleCell(grid, r, c) {
  return grid.map(function (row, i) {
    return row.map(function (v, j) { return (Math.abs(i - r) + Math.abs(j - c) <= 1) ? !v : v; });
  });
}
```

## P5 toggleCell · W2 the engine with the parts of the program

Program:
Lights Out. Language of the person: English.

Requirements this unit serves:
R2. Pressing a light flips it and the lights just above, below, left and right of it

Task:
kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)
examples that must hold:
  toggleCell([[false,false],[false,false]],0,0)  ->  [[true,true],[true,false]]

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

Functions you can call:
isSolved(grid): true when every light of the grid is off

Names that exist:
isSolved

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var G = [[false,false,false],[false,false,false],[false,false,false]];
- loads
- run: toggleCell(G,1,1) => [[false,true,false],[true,true,true],[false,true,false]]
- run: toggleCell(G,0,0) => [[true,true,false],[true,false,false],[false,false,false]]
- run: toggleCell(G,2,2) => [[false,false,false],[false,false,true],[false,true,true]]
- run: toggleCell(toggleCell(G,2,1),2,1) => G
- run: (toggleCell(G,0,0), JSON.stringify(G)) => "[[false,false,false],[false,false,false],[false,false,false]]"

### Ideal

```
function toggleCell(grid, r, c) {
  return grid.map(function (row, i) {
    return row.map(function (v, j) { return (Math.abs(i - r) + Math.abs(j - c) <= 1) ? !v : v; });
  });
}
```

## P5 toggleCell · W3 the engine rules, the real values of the state, the examples and the code of what it uses

kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)

S starts as:
{"mode":"playing","moves":0,"grid":[[false,true,false,false,false],[true,true,true,false,false],[false,true,false,false,false],[false,false,false,false,false],[false,false,false,false,false]]}

These must hold:
toggleCell([[false,false],[false,false]],0,0) gives [[true,true],[true,false]]

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var G = [[false,false,false],[false,false,false],[false,false,false]];
- loads
- run: toggleCell(G,1,1) => [[false,true,false],[true,true,true],[false,true,false]]
- run: toggleCell(G,0,0) => [[true,true,false],[true,false,false],[false,false,false]]
- run: toggleCell(G,2,2) => [[false,false,false],[false,false,true],[false,true,true]]
- run: toggleCell(toggleCell(G,2,1),2,1) => G
- run: (toggleCell(G,0,0), JSON.stringify(G)) => "[[false,false,false],[false,false,false],[false,false,false]]"

### Ideal

```
function toggleCell(grid, r, c) {
  return grid.map(function (row, i) {
    return row.map(function (v, j) { return (Math.abs(i - r) + Math.abs(j - c) <= 1) ? !v : v; });
  });
}
```

## P5 toggleCell · W4 the engine context and a checklist after

Program:
Lights Out. Language of the person: English.

Requirements this unit serves:
R2. Pressing a light flips it and the lights just above, below, left and right of it

Task:
kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)
examples that must hold:
  toggleCell([[false,false],[false,false]],0,0)  ->  [[true,true],[true,false]]

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

Functions you can call:
isSolved(grid): true when every light of the grid is off

Names that exist:
isSolved

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var G = [[false,false,false],[false,false,false],[false,false,false]];
- loads
- run: toggleCell(G,1,1) => [[false,true,false],[true,true,true],[false,true,false]]
- run: toggleCell(G,0,0) => [[true,true,false],[true,false,false],[false,false,false]]
- run: toggleCell(G,2,2) => [[false,false,false],[false,false,true],[false,true,true]]
- run: toggleCell(toggleCell(G,2,1),2,1) => G
- run: (toggleCell(G,0,0), JSON.stringify(G)) => "[[false,false,false],[false,false,false],[false,false,false]]"

### Ideal

```
function toggleCell(grid, r, c) {
  return grid.map(function (row, i) {
    return row.map(function (v, j) { return (Math.abs(i - r) + Math.abs(j - c) <= 1) ? !v : v; });
  });
}
```

## P5 toggleCell · W5 the engine rules and the task alone

kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var G = [[false,false,false],[false,false,false],[false,false,false]];
- loads
- run: toggleCell(G,1,1) => [[false,true,false],[true,true,true],[false,true,false]]
- run: toggleCell(G,0,0) => [[true,true,false],[true,false,false],[false,false,false]]
- run: toggleCell(G,2,2) => [[false,false,false],[false,false,true],[false,true,true]]
- run: toggleCell(toggleCell(G,2,1),2,1) => G
- run: (toggleCell(G,0,0), JSON.stringify(G)) => "[[false,false,false],[false,false,false],[false,false,false]]"

### Ideal

```
function toggleCell(grid, r, c) {
  return grid.map(function (row, i) {
    return row.map(function (v, j) { return (Math.abs(i - r) + Math.abs(j - c) <= 1) ? !v : v; });
  });
}
```

## P5 toggleCell · W6 the engine rules, the task and the state

kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 600

### Checks

- given: var G = [[false,false,false],[false,false,false],[false,false,false]];
- loads
- run: toggleCell(G,1,1) => [[false,true,false],[true,true,true],[false,true,false]]
- run: toggleCell(G,0,0) => [[true,true,false],[true,false,false],[false,false,false]]
- run: toggleCell(G,2,2) => [[false,false,false],[false,false,true],[false,true,true]]
- run: toggleCell(toggleCell(G,2,1),2,1) => G
- run: (toggleCell(G,0,0), JSON.stringify(G)) => "[[false,false,false],[false,false,false],[false,false,false]]"

### Ideal

```
function toggleCell(grid, r, c) {
  return grid.map(function (row, i) {
    return row.map(function (v, j) { return (Math.abs(i - r) + Math.abs(j - c) <= 1) ? !v : v; });
  });
}
```
