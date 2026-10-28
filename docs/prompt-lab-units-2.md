---
title: The writers of the engine, ten ways, five programs
runs: 2
max_tokens: 1200
thinking: off
---

# The writers of the engine, ten ways, five programs

The same unit is asked in ten ways (V01 to V10: how much context, which words, which instructions, with or without the parts of the program, the code or only the signatures of what it uses, a plain sentence, a telegraphic note), and the units come from five programs of very different kinds: a platformer (P1, whose parts are the real answer of a 4B model), a snake game (P2), a ball and paddle game (P3), a to-do tool (P4) and a puzzle (P5). Nothing in any way of asking is about a genre.
The score is on what the code DOES: every unit has checks that run the answer. To read the report, take the mean of each way (V01 to V10) over all the units, then the mean of each unit over the ten ways: the first says which way of asking is best, the second which kinds of unit the model cannot write whatever it is told.

## P1 S · V01 the engine as it is

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
hits, moveThing, landOn, stepPlayer, drawScene

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1680

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- regex: "(input|keys)"
- regex: "w"\s*:
- not: //
- not: function
- not: []

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

## P1 S · V02 the engine, with the parts of the program

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
hits, moveThing, landOn, stepPlayer, drawScene

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1680

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- regex: "(input|keys)"
- regex: "w"\s*:
- not: //
- not: function
- not: []

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

## P1 S · V03 the task alone

kind: state
name: S
does: everything the program remembers: the mode, score, lives, time, camera, the keys, the player, the ground, platforms, enemies, coins and the flag

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- regex: "(input|keys)"
- regex: "w"\s*:
- not: //
- not: function
- not: []

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

## P1 S · V04 task and state

kind: state
name: S
does: everything the program remembers: the mode, score, lives, time, camera, the keys, the player, the ground, platforms, enemies, coins and the flag

Requirements:
R1. The player runs left and right with the arrow keys and jumps with the up arrow
R2. The player falls with gravity and stands on the ground and on platforms; there are holes in the ground
R3. Enemies walk; jumping on one from above kills it, touching it from the side costs a life
R4. Coins can be picked up and raise the score
R5. A countdown runs and the top bar shows score, lives and time
R6. Reaching the flag wins; no lives or no time left is game over

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- regex: "(input|keys)"
- regex: "w"\s*:
- not: //
- not: function
- not: []

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

## P1 S · V05 task, state and the signatures of what it uses

kind: state
name: S
does: everything the program remembers: the mode, score, lives, time, camera, the keys, the player, the ground, platforms, enemies, coins and the flag

Requirements:
R1. The player runs left and right with the arrow keys and jumps with the up arrow
R2. The player falls with gravity and stands on the ground and on platforms; there are holes in the ground
R3. Enemies walk; jumping on one from above kills it, touching it from the side costs a life
R4. Coins can be picked up and raise the score
R5. A countdown runs and the top bar shows score, lives and time
R6. Reaching the flag wins; no lives or no time left is game over

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- regex: "(input|keys)"
- regex: "w"\s*:
- not: //
- not: function
- not: []

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

## P1 S · V06 task, state and the code of what it uses

kind: state
name: S
does: everything the program remembers: the mode, score, lives, time, camera, the keys, the player, the ground, platforms, enemies, coins and the flag

Requirements:
R1. The player runs left and right with the arrow keys and jumps with the up arrow
R2. The player falls with gravity and stands on the ground and on platforms; there are holes in the ground
R3. Enemies walk; jumping on one from above kills it, touching it from the side costs a life
R4. Coins can be picked up and raise the score
R5. A countdown runs and the top bar shows score, lives and time
R6. Reaching the flag wins; no lives or no time left is game over

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- regex: "(input|keys)"
- regex: "w"\s*:
- not: //
- not: function
- not: []

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

## P1 S · V07 a plain request in a sentence

I am building a program called "Mario-like platformer". Please write the state S. everything the program remembers: the mode, score, lives, time, camera, the keys, the player, the ground, platforms, enemies, coins and the flag. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1680

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- regex: "(input|keys)"
- regex: "w"\s*:
- not: //
- not: function
- not: []

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

## P1 S · V08 the engine context and a checklist after

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
hits, moveThing, landOn, stepPlayer, drawScene

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- regex: "(input|keys)"
- regex: "w"\s*:
- not: //
- not: function
- not: []

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

## P1 S · V09 task, the real values of the state and examples

kind: state
name: S
does: everything the program remembers: the mode, score, lives, time, camera, the keys, the player, the ground, platforms, enemies, coins and the flag

Requirements:
R1. The player runs left and right with the arrow keys and jumps with the up arrow
R2. The player falls with gravity and stands on the ground and on platforms; there are holes in the ground
R3. Enemies walk; jumping on one from above kills it, touching it from the side costs a life
R4. Coins can be picked up and raise the score
R5. A countdown runs and the top bar shows score, lives and time
R6. Reaching the flag wins; no lives or no time left is game over

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- regex: "(input|keys)"
- regex: "w"\s*:
- not: //
- not: function
- not: []

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

## P1 S · V10 telegraphic

unit: state S
does: everything the program remembers: the mode, score, lives, time, camera, the keys, the player, the ground, platforms, enemies, coins and the flag
reply: code only

### Options

- thinking: off
- max_tokens: 1680

### Checks

- json
- contains: "mode"
- contains: "player"
- contains: "enemies"
- regex: "(input|keys)"
- regex: "w"\s*:
- not: //
- not: function
- not: []

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

## P1 landOn · V01 the engine as it is

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
- max_tokens: 1200

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

## P1 landOn · V02 the engine, with the parts of the program

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
- max_tokens: 1200

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

## P1 landOn · V03 the task alone

kind: fn
name: landOn
does: puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands
signature: landOn(thing, solids)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 landOn · V04 task and state

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 landOn · V05 task, state and the signatures of what it uses

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

Functions you can call:
hits(a, b): true when two things with x, y, w, h overlap

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 landOn · V06 task, state and the code of what it uses

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

Functions you can call (their code):
hits(a, b): true when two things with x, y, w, h overlap
function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 landOn · V07 a plain request in a sentence

I am building a program called "Mario-like platformer". Please write the function landOn(thing, solids). puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands. The state S looks like this: mode: string ("playing") score: number (0) coinCount: number (0) lives: number (3) time: number (300) camera: number (0) input: {left, right} player: {x, y, w, h, vx, vy, grounded} ground: list of {x, y, w, h} platforms: list of {x, y, w, h} enemies: list of {x, y, w, h, vx, vy, alive} coins: list of {x, y, w, h, taken} flag: {x, y, w, h}. You can call: hits(a, b): true when two things with x, y, w, h overlap. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

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

## P1 landOn · V08 the engine context and a checklist after

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 landOn · V09 task, the real values of the state and examples

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 landOn · V10 telegraphic

unit: fn landOn
signature: landOn(thing, solids)
does: puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands
S: mode: string ("playing") score: number (0) coinCount: number (0) lives: number (3) time: number (300) camera: number (0) input: {left, right} player: {x, y, w, h, vx, vy, grounded} ground: list of {x, y, w, h} platforms: list of {x, y, w, h} enemies: list of {x, y, w, h, vx, vy, alive} coins: list of {x, y, w, h, taken} flag: {x, y, w, h}
uses: hits
reply: code only

### Options

- thinking: off
- max_tokens: 1200

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

## P1 stepPlayer · V01 the engine as it is

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
- max_tokens: 1200

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

## P1 stepPlayer · V02 the engine, with the parts of the program

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
- max_tokens: 1200

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

## P1 stepPlayer · V03 the task alone

kind: fn
name: stepPlayer
does: the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids
signature: stepPlayer(player, input, solids)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 stepPlayer · V04 task and state

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 stepPlayer · V05 task, state and the signatures of what it uses

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

Functions you can call:
moveThing(thing, dt): a copy of a thing moved by its speed for dt

landOn(thing, solids): puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 stepPlayer · V06 task, state and the code of what it uses

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

Functions you can call (their code):
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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 stepPlayer · V07 a plain request in a sentence

I am building a program called "Mario-like platformer". Please write the function stepPlayer(player, input, solids). the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids. The state S looks like this: mode: string ("playing") score: number (0) coinCount: number (0) lives: number (3) time: number (300) camera: number (0) input: {left, right} player: {x, y, w, h, vx, vy, grounded} ground: list of {x, y, w, h} platforms: list of {x, y, w, h} enemies: list of {x, y, w, h, vx, vy, alive} coins: list of {x, y, w, h, taken} flag: {x, y, w, h}. You can call: moveThing(thing, dt): a copy of a thing moved by its speed for dt landOn(thing, solids): puts a thing that falls onto the top of the first solid it was above a moment ago: y on top of it, vy 0, grounded true; otherwise grounded false and nothing else changes; a thing that rises never lands. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

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

## P1 stepPlayer · V08 the engine context and a checklist after

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 stepPlayer · V09 task, the real values of the state and examples

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 stepPlayer · V10 telegraphic

unit: fn stepPlayer
signature: stepPlayer(player, input, solids)
does: the player after one step: it moves 3 left or right by the keys (both keys cancel), vy grows by 0.5, it moves, and it lands on the solids
S: mode: string ("playing") score: number (0) coinCount: number (0) lives: number (3) time: number (300) camera: number (0) input: {left, right} player: {x, y, w, h, vx, vy, grounded} ground: list of {x, y, w, h} platforms: list of {x, y, w, h} enemies: list of {x, y, w, h, vx, vy, alive} coins: list of {x, y, w, h, taken} flag: {x, y, w, h}
uses: moveThing, landOn
reply: code only

### Options

- thinking: off
- max_tokens: 1200

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

## P1 drawScene · V01 the engine as it is

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
hits, moveThing, landOn, stepPlayer

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1200

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

## P1 drawScene · V02 the engine, with the parts of the program

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
hits, moveThing, landOn, stepPlayer

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1200

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

## P1 drawScene · V03 the task alone

kind: view
name: drawScene
does: draws the sky, the ground and platforms, the coins not taken, the living enemies and the player as filled rectangles, each at its x minus S.camera
draws into the element #stage

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 drawScene · V04 task and state

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

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 drawScene · V05 task, state and the signatures of what it uses

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

Elements of the page:
#stage (canvas 640x240)
#hud (div)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 drawScene · V06 task, state and the code of what it uses

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

Elements of the page:
#stage (canvas 640x240)
#hud (div)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 drawScene · V07 a plain request in a sentence

I am building a program called "Mario-like platformer". Please write the view drawScene, drawing into #stage. draws the sky, the ground and platforms, the coins not taken, the living enemies and the player as filled rectangles, each at its x minus S.camera. The state S looks like this: mode: string ("playing") score: number (0) coinCount: number (0) lives: number (3) time: number (300) camera: number (0) input: {left, right} player: {x, y, w, h, vx, vy, grounded} ground: list of {x, y, w, h} platforms: list of {x, y, w, h} enemies: list of {x, y, w, h, vx, vy, alive} coins: list of {x, y, w, h, taken} flag: {x, y, w, h}. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

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

## P1 drawScene · V08 the engine context and a checklist after

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
hits, moveThing, landOn, stepPlayer

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 drawScene · V09 task, the real values of the state and examples

kind: view
name: drawScene
does: draws the sky, the ground and platforms, the coins not taken, the living enemies and the player as filled rectangles, each at its x minus S.camera
draws into the element #stage

S starts as:
{"mode":"playing","score":0,"coinCount":0,"lives":3,"time":300,"camera":0,"input":{"left":false,"right":false},"player":{"x":40,"y":160,"w":16,"h":24,"vx":0,"vy":0,"grounded":false},"ground":[{"x":0,"y":200,"w":400,"h":40},{"x":460,"y":200,"w":340,"h":40}],"platforms":[{"x":200,"y":140,"w":48,"h":12}],"enemies":[{"x":300,"y":176,"w":16,"h":24,"vx":-1,"vy":0,"alive":true}],"coins":[{"x":210,"y":120,"w":10,"h":10,"taken":false}],"flag":{"x":760,"y":120,"w":8,"h":80}}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P1 drawScene · V10 telegraphic

unit: view drawScene
into: #stage
does: draws the sky, the ground and platforms, the coins not taken, the living enemies and the player as filled rectangles, each at its x minus S.camera
S: mode: string ("playing") score: number (0) coinCount: number (0) lives: number (3) time: number (300) camera: number (0) input: {left, right} player: {x, y, w, h, vx, vy, grounded} ground: list of {x, y, w, h} platforms: list of {x, y, w, h} enemies: list of {x, y, w, h, vx, vy, alive} coins: list of {x, y, w, h, taken} flag: {x, y, w, h}
reply: code only

### Options

- thinking: off
- max_tokens: 1200

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

## P2 S · V01 the engine as it is

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
- max_tokens: 1680

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

## P2 S · V02 the engine, with the parts of the program

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
- max_tokens: 1680

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

## P2 S · V03 the task alone

kind: state
name: S
does: everything the program remembers: the mode, the score, the grid size, the direction, the snake as a list of cells and the food

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

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

## P2 S · V04 task and state

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

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

## P2 S · V05 task, state and the signatures of what it uses

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

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

## P2 S · V06 task, state and the code of what it uses

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

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

## P2 S · V07 a plain request in a sentence

I am building a program called "Snake". Please write the state S. everything the program remembers: the mode, the score, the grid size, the direction, the snake as a list of cells and the food. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1680

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

## P2 S · V08 the engine context and a checklist after

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

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

## P2 S · V09 task, the real values of the state and examples

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

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

## P2 S · V10 telegraphic

unit: state S
does: everything the program remembers: the mode, the score, the grid size, the direction, the snake as a list of cells and the food
reply: code only

### Options

- thinking: off
- max_tokens: 1680

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

## P2 nextHead · V01 the engine as it is

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
- max_tokens: 1200

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

## P2 nextHead · V02 the engine, with the parts of the program

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
- max_tokens: 1200

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

## P2 nextHead · V03 the task alone

kind: fn
name: nextHead
does: the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells
signature: nextHead(head, dir, size)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 nextHead · V04 task and state

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 nextHead · V05 task, state and the signatures of what it uses

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 nextHead · V06 task, state and the code of what it uses

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 nextHead · V07 a plain request in a sentence

I am building a program called "Snake". Please write the function nextHead(head, dir, size). the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells. The state S looks like this: mode: string ("playing") score: number (0) size: number (20) dir: string ("right") snake: list of {x, y} food: {x, y}. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

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

## P2 nextHead · V08 the engine context and a checklist after

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 nextHead · V09 task, the real values of the state and examples

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 nextHead · V10 telegraphic

unit: fn nextHead
signature: nextHead(head, dir, size)
does: the cell reached from head by one step in dir ("up", "down", "left" or "right"), wrapping around a grid of size by size cells
S: mode: string ("playing") score: number (0) size: number (20) dir: string ("right") snake: list of {x, y} food: {x, y}
reply: code only

### Options

- thinking: off
- max_tokens: 1200

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

## P2 onUp · V01 the engine as it is

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
- max_tokens: 1200

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

## P2 onUp · V02 the engine, with the parts of the program

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
- max_tokens: 1200

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

## P2 onUp · V03 the task alone

kind: handler
name: onUp
does: while playing, turns the snake up unless it is going down
called by the event: keydown ArrowUp

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 onUp · V04 task and state

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 onUp · V05 task, state and the signatures of what it uses

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 onUp · V06 task, state and the code of what it uses

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 onUp · V07 a plain request in a sentence

I am building a program called "Snake". Please write the handler onUp, called on keydown ArrowUp. while playing, turns the snake up unless it is going down. The state S looks like this: mode: string ("playing") score: number (0) size: number (20) dir: string ("right") snake: list of {x, y} food: {x, y}. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

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

## P2 onUp · V08 the engine context and a checklist after

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 onUp · V09 task, the real values of the state and examples

kind: handler
name: onUp
does: while playing, turns the snake up unless it is going down
called by the event: keydown ArrowUp

S starts as:
{"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P2 onUp · V10 telegraphic

unit: handler onUp
event: keydown ArrowUp
does: while playing, turns the snake up unless it is going down
S: mode: string ("playing") score: number (0) size: number (20) dir: string ("right") snake: list of {x, y} food: {x, y}
reply: code only

### Options

- thinking: off
- max_tokens: 1200

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

## P2 drawBoard · V01 the engine as it is

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
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], canvas = { width: 400, height: 400 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
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

## P2 drawBoard · V02 the engine, with the parts of the program

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
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], canvas = { width: 400, height: 400 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
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

## P2 drawBoard · V03 the task alone

kind: view
name: drawBoard
does: draws the snake and the food as squares of canvas width divided by the grid size, on a dark background
draws into the element #board

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], canvas = { width: 400, height: 400 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
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

## P2 drawBoard · V04 task and state

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

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], canvas = { width: 400, height: 400 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
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

## P2 drawBoard · V05 task, state and the signatures of what it uses

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], canvas = { width: 400, height: 400 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
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

## P2 drawBoard · V06 task, state and the code of what it uses

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], canvas = { width: 400, height: 400 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
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

## P2 drawBoard · V07 a plain request in a sentence

I am building a program called "Snake". Please write the view drawBoard, drawing into #board. draws the snake and the food as squares of canvas width divided by the grid size, on a dark background. The state S looks like this: mode: string ("playing") score: number (0) size: number (20) dir: string ("right") snake: list of {x, y} food: {x, y}. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], canvas = { width: 400, height: 400 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
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

## P2 drawBoard · V08 the engine context and a checklist after

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], canvas = { width: 400, height: 400 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
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

## P2 drawBoard · V09 task, the real values of the state and examples

kind: view
name: drawBoard
does: draws the snake and the food as squares of canvas width divided by the grid size, on a dark background
draws into the element #board

S starts as:
{"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], canvas = { width: 400, height: 400 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
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

## P2 drawBoard · V10 telegraphic

unit: view drawBoard
into: #board
does: draws the snake and the food as squares of canvas width divided by the grid size, on a dark background
S: mode: string ("playing") score: number (0) size: number (20) dir: string ("right") snake: list of {x, y} food: {x, y}
reply: code only

### Options

- thinking: off
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"size":20,"dir":"right","snake":[{"x":5,"y":10},{"x":4,"y":10},{"x":3,"y":10}],"food":{"x":12,"y":10}};
- given: var calls = [], canvas = { width: 400, height: 400 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
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

## P3 S · V01 the engine as it is

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R1. A ball moves and bounces off the walls and the ceiling
R2. The player moves a paddle left and right with the arrow keys and cannot leave the court
R3. The ball breaks bricks it touches and the score goes up
R4. Losing the ball costs a life
R5. The court shows the paddle, the ball and the bricks left

Task:
kind: state
name: S
does: everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks

Names that exist:
bounceWalls, onLeft, drawGame

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1680

### Checks

- json
- contains: "ball"
- contains: "paddle"
- contains: "bricks"
- contains: "lives"
- regex: "r"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "lives": 3,
  "width": 400,
  "height": 300,
  "ball": {
    "x": 200,
    "y": 150,
    "r": 6,
    "vx": 3,
    "vy": -3
  },
  "paddle": {
    "x": 170,
    "y": 280,
    "w": 60,
    "h": 10
  },
  "bricks": [
    {
      "x": 20,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": true
    },
    {
      "x": 80,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": false
    }
  ]
}
```

## P3 S · V02 the engine, with the parts of the program

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R1. A ball moves and bounces off the walls and the ceiling
R2. The player moves a paddle left and right with the arrow keys and cannot leave the court
R3. The ball breaks bricks it touches and the score goes up
R4. Losing the ball costs a life
R5. The court shows the paddle, the ball and the bricks left

Task:
kind: state
name: S
does: everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks

Names that exist:
bounceWalls, onLeft, drawGame

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1680

### Checks

- json
- contains: "ball"
- contains: "paddle"
- contains: "bricks"
- contains: "lives"
- regex: "r"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "lives": 3,
  "width": 400,
  "height": 300,
  "ball": {
    "x": 200,
    "y": 150,
    "r": 6,
    "vx": 3,
    "vy": -3
  },
  "paddle": {
    "x": 170,
    "y": 280,
    "w": 60,
    "h": 10
  },
  "bricks": [
    {
      "x": 20,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": true
    },
    {
      "x": 80,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": false
    }
  ]
}
```

## P3 S · V03 the task alone

kind: state
name: S
does: everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "ball"
- contains: "paddle"
- contains: "bricks"
- contains: "lives"
- regex: "r"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "lives": 3,
  "width": 400,
  "height": 300,
  "ball": {
    "x": 200,
    "y": 150,
    "r": 6,
    "vx": 3,
    "vy": -3
  },
  "paddle": {
    "x": 170,
    "y": 280,
    "w": 60,
    "h": 10
  },
  "bricks": [
    {
      "x": 20,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": true
    },
    {
      "x": 80,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": false
    }
  ]
}
```

## P3 S · V04 task and state

kind: state
name: S
does: everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks

Requirements:
R1. A ball moves and bounces off the walls and the ceiling
R2. The player moves a paddle left and right with the arrow keys and cannot leave the court
R3. The ball breaks bricks it touches and the score goes up
R4. Losing the ball costs a life
R5. The court shows the paddle, the ball and the bricks left

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "ball"
- contains: "paddle"
- contains: "bricks"
- contains: "lives"
- regex: "r"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "lives": 3,
  "width": 400,
  "height": 300,
  "ball": {
    "x": 200,
    "y": 150,
    "r": 6,
    "vx": 3,
    "vy": -3
  },
  "paddle": {
    "x": 170,
    "y": 280,
    "w": 60,
    "h": 10
  },
  "bricks": [
    {
      "x": 20,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": true
    },
    {
      "x": 80,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": false
    }
  ]
}
```

## P3 S · V05 task, state and the signatures of what it uses

kind: state
name: S
does: everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks

Requirements:
R1. A ball moves and bounces off the walls and the ceiling
R2. The player moves a paddle left and right with the arrow keys and cannot leave the court
R3. The ball breaks bricks it touches and the score goes up
R4. Losing the ball costs a life
R5. The court shows the paddle, the ball and the bricks left

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "ball"
- contains: "paddle"
- contains: "bricks"
- contains: "lives"
- regex: "r"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "lives": 3,
  "width": 400,
  "height": 300,
  "ball": {
    "x": 200,
    "y": 150,
    "r": 6,
    "vx": 3,
    "vy": -3
  },
  "paddle": {
    "x": 170,
    "y": 280,
    "w": 60,
    "h": 10
  },
  "bricks": [
    {
      "x": 20,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": true
    },
    {
      "x": 80,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": false
    }
  ]
}
```

## P3 S · V06 task, state and the code of what it uses

kind: state
name: S
does: everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks

Requirements:
R1. A ball moves and bounces off the walls and the ceiling
R2. The player moves a paddle left and right with the arrow keys and cannot leave the court
R3. The ball breaks bricks it touches and the score goes up
R4. Losing the ball costs a life
R5. The court shows the paddle, the ball and the bricks left

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "ball"
- contains: "paddle"
- contains: "bricks"
- contains: "lives"
- regex: "r"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "lives": 3,
  "width": 400,
  "height": 300,
  "ball": {
    "x": 200,
    "y": 150,
    "r": 6,
    "vx": 3,
    "vy": -3
  },
  "paddle": {
    "x": 170,
    "y": 280,
    "w": 60,
    "h": 10
  },
  "bricks": [
    {
      "x": 20,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": true
    },
    {
      "x": 80,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": false
    }
  ]
}
```

## P3 S · V07 a plain request in a sentence

I am building a program called "Ball and paddle". Please write the state S. everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1680

### Checks

- json
- contains: "ball"
- contains: "paddle"
- contains: "bricks"
- contains: "lives"
- regex: "r"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "lives": 3,
  "width": 400,
  "height": 300,
  "ball": {
    "x": 200,
    "y": 150,
    "r": 6,
    "vx": 3,
    "vy": -3
  },
  "paddle": {
    "x": 170,
    "y": 280,
    "w": 60,
    "h": 10
  },
  "bricks": [
    {
      "x": 20,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": true
    },
    {
      "x": 80,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": false
    }
  ]
}
```

## P3 S · V08 the engine context and a checklist after

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R1. A ball moves and bounces off the walls and the ceiling
R2. The player moves a paddle left and right with the arrow keys and cannot leave the court
R3. The ball breaks bricks it touches and the score goes up
R4. Losing the ball costs a life
R5. The court shows the paddle, the ball and the bricks left

Task:
kind: state
name: S
does: everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks

Names that exist:
bounceWalls, onLeft, drawGame

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "ball"
- contains: "paddle"
- contains: "bricks"
- contains: "lives"
- regex: "r"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "lives": 3,
  "width": 400,
  "height": 300,
  "ball": {
    "x": 200,
    "y": 150,
    "r": 6,
    "vx": 3,
    "vy": -3
  },
  "paddle": {
    "x": 170,
    "y": 280,
    "w": 60,
    "h": 10
  },
  "bricks": [
    {
      "x": 20,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": true
    },
    {
      "x": 80,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": false
    }
  ]
}
```

## P3 S · V09 task, the real values of the state and examples

kind: state
name: S
does: everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks

Requirements:
R1. A ball moves and bounces off the walls and the ceiling
R2. The player moves a paddle left and right with the arrow keys and cannot leave the court
R3. The ball breaks bricks it touches and the score goes up
R4. Losing the ball costs a life
R5. The court shows the paddle, the ball and the bricks left

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "ball"
- contains: "paddle"
- contains: "bricks"
- contains: "lives"
- regex: "r"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "lives": 3,
  "width": 400,
  "height": 300,
  "ball": {
    "x": 200,
    "y": 150,
    "r": 6,
    "vx": 3,
    "vy": -3
  },
  "paddle": {
    "x": 170,
    "y": 280,
    "w": 60,
    "h": 10
  },
  "bricks": [
    {
      "x": 20,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": true
    },
    {
      "x": 80,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": false
    }
  ]
}
```

## P3 S · V10 telegraphic

unit: state S
does: everything the program remembers: the mode, the score, the lives, the size of the court, the ball, the paddle and the bricks
reply: code only

### Options

- thinking: off
- max_tokens: 1680

### Checks

- json
- contains: "ball"
- contains: "paddle"
- contains: "bricks"
- contains: "lives"
- regex: "r"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "score": 0,
  "lives": 3,
  "width": 400,
  "height": 300,
  "ball": {
    "x": 200,
    "y": 150,
    "r": 6,
    "vx": 3,
    "vy": -3
  },
  "paddle": {
    "x": 170,
    "y": 280,
    "w": 60,
    "h": 10
  },
  "bricks": [
    {
      "x": 20,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": true
    },
    {
      "x": 80,
      "y": 20,
      "w": 50,
      "h": 14,
      "alive": false
    }
  ]
}
```

## P3 bounceWalls · V01 the engine as it is

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
- max_tokens: 1200

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

## P3 bounceWalls · V02 the engine, with the parts of the program

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
- max_tokens: 1200

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

## P3 bounceWalls · V03 the task alone

kind: fn
name: bounceWalls
does: a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is
signature: bounceWalls(ball, width)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P3 bounceWalls · V04 task and state

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P3 bounceWalls · V05 task, state and the signatures of what it uses

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P3 bounceWalls · V06 task, state and the code of what it uses

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P3 bounceWalls · V07 a plain request in a sentence

I am building a program called "Ball and paddle". Please write the function bounceWalls(ball, width). a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is. The state S looks like this: mode: string ("playing") score: number (0) lives: number (3) width: number (400) height: number (300) ball: {x, y, r, vx, vy} paddle: {x, y, w, h} bricks: list of {x, y, w, h, alive}. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

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

## P3 bounceWalls · V08 the engine context and a checklist after

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P3 bounceWalls · V09 task, the real values of the state and examples

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P3 bounceWalls · V10 telegraphic

unit: fn bounceWalls
signature: bounceWalls(ball, width)
does: a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is
S: mode: string ("playing") score: number (0) lives: number (3) width: number (400) height: number (300) ball: {x, y, r, vx, vy} paddle: {x, y, w, h} bricks: list of {x, y, w, h, alive}
reply: code only

### Options

- thinking: off
- max_tokens: 1200

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

## P3 onLeft · V01 the engine as it is

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R2. The player moves a paddle left and right with the arrow keys and cannot leave the court

Task:
kind: handler
name: onLeft
does: while playing, moves the paddle 20 to the left, never past the left edge of the court
called by the event: keydown ArrowLeft

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

Elements of the page:
#court (canvas 400x300)

Functions you can call:
bounceWalls(ball, width): a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is

Names that exist:
bounceWalls, drawGame

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- loads
- run: (onLeft(), S.paddle.x) => 150
- run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0
- run: (S.mode = "over", onLeft(), S.paddle.x) => 170

### Ideal

```
function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }
```

## P3 onLeft · V02 the engine, with the parts of the program

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R2. The player moves a paddle left and right with the arrow keys and cannot leave the court

Task:
kind: handler
name: onLeft
does: while playing, moves the paddle 20 to the left, never past the left edge of the court
called by the event: keydown ArrowLeft

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

Elements of the page:
#court (canvas 400x300)

Functions you can call:
bounceWalls(ball, width): a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is

Names that exist:
bounceWalls, drawGame

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function with the given name, called by its event. It reads and changes S by calling the listed functions (S.field = ...), and does nothing else; do not draw. S is a global: the function takes no parameter named S and never assigns S itself, only its fields. The work is done by the listed functions: call them and put what they return into S (S.player = movePlayer(S.player, S.keys, S.level)). A handler of tick 16 runs 60 times a second: a speed is per tick, and a clock counts 0.016 of a second per tick. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` (or `function NAME(e) {` when it needs the event), and no parameter is called S: S is a global. 2. It changes S by assignment (S.keys.left = true; S.score += 10): a handler that changes nothing does nothing. 3. A mode is compared only with the words The state S shows or that you set yourself. 4. It calls only the functions listed, with their arguments in the order of their signature, and puts what they return into S. 5. It draws nothing and touches no element. 6. It runs for each event: a tick handler runs 60 times a second, so a speed is per tick and a clock counts 0.016 per tick. 7. It never resets what another handler sets (the flags of the held keys are set by the key handlers only) and writes only what its own task names. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- loads
- run: (onLeft(), S.paddle.x) => 150
- run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0
- run: (S.mode = "over", onLeft(), S.paddle.x) => 170

### Ideal

```
function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }
```

## P3 onLeft · V03 the task alone

kind: handler
name: onLeft
does: while playing, moves the paddle 20 to the left, never past the left edge of the court
called by the event: keydown ArrowLeft

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- loads
- run: (onLeft(), S.paddle.x) => 150
- run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0
- run: (S.mode = "over", onLeft(), S.paddle.x) => 170

### Ideal

```
function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }
```

## P3 onLeft · V04 task and state

kind: handler
name: onLeft
does: while playing, moves the paddle 20 to the left, never past the left edge of the court
called by the event: keydown ArrowLeft

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- loads
- run: (onLeft(), S.paddle.x) => 150
- run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0
- run: (S.mode = "over", onLeft(), S.paddle.x) => 170

### Ideal

```
function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }
```

## P3 onLeft · V05 task, state and the signatures of what it uses

kind: handler
name: onLeft
does: while playing, moves the paddle 20 to the left, never past the left edge of the court
called by the event: keydown ArrowLeft

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- loads
- run: (onLeft(), S.paddle.x) => 150
- run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0
- run: (S.mode = "over", onLeft(), S.paddle.x) => 170

### Ideal

```
function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }
```

## P3 onLeft · V06 task, state and the code of what it uses

kind: handler
name: onLeft
does: while playing, moves the paddle 20 to the left, never past the left edge of the court
called by the event: keydown ArrowLeft

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- loads
- run: (onLeft(), S.paddle.x) => 150
- run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0
- run: (S.mode = "over", onLeft(), S.paddle.x) => 170

### Ideal

```
function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }
```

## P3 onLeft · V07 a plain request in a sentence

I am building a program called "Ball and paddle". Please write the handler onLeft, called on keydown ArrowLeft. while playing, moves the paddle 20 to the left, never past the left edge of the court. The state S looks like this: mode: string ("playing") score: number (0) lives: number (3) width: number (400) height: number (300) ball: {x, y, r, vx, vy} paddle: {x, y, w, h} bricks: list of {x, y, w, h, alive}. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- loads
- run: (onLeft(), S.paddle.x) => 150
- run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0
- run: (S.mode = "over", onLeft(), S.paddle.x) => 170

### Ideal

```
function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }
```

## P3 onLeft · V08 the engine context and a checklist after

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R2. The player moves a paddle left and right with the arrow keys and cannot leave the court

Task:
kind: handler
name: onLeft
does: while playing, moves the paddle 20 to the left, never past the left edge of the court
called by the event: keydown ArrowLeft

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

Elements of the page:
#court (canvas 400x300)

Functions you can call:
bounceWalls(ball, width): a copy of the ball that turns around when it touches a wall: vx flips at the left or right wall when it is heading into it, vy flips at the ceiling when it is heading into it; a ball moving away from a wall is left as it is

Names that exist:
bounceWalls, drawGame

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- loads
- run: (onLeft(), S.paddle.x) => 150
- run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0
- run: (S.mode = "over", onLeft(), S.paddle.x) => 170

### Ideal

```
function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }
```

## P3 onLeft · V09 task, the real values of the state and examples

kind: handler
name: onLeft
does: while playing, moves the paddle 20 to the left, never past the left edge of the court
called by the event: keydown ArrowLeft

S starts as:
{"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- loads
- run: (onLeft(), S.paddle.x) => 150
- run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0
- run: (S.mode = "over", onLeft(), S.paddle.x) => 170

### Ideal

```
function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }
```

## P3 onLeft · V10 telegraphic

unit: handler onLeft
event: keydown ArrowLeft
does: while playing, moves the paddle 20 to the left, never past the left edge of the court
S: mode: string ("playing") score: number (0) lives: number (3) width: number (400) height: number (300) ball: {x, y, r, vx, vy} paddle: {x, y, w, h} bricks: list of {x, y, w, h, alive}
reply: code only

### Options

- thinking: off
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- loads
- run: (onLeft(), S.paddle.x) => 150
- run: (S.paddle.x = 10, onLeft(), S.paddle.x) => 0
- run: (S.mode = "over", onLeft(), S.paddle.x) => 170

### Ideal

```
function onLeft() { if (S.mode === "playing") S.paddle.x = Math.max(0, S.paddle.x - 20); }
```

## P3 drawGame · V01 the engine as it is

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R5. The court shows the paddle, the ball and the bricks left

Task:
kind: view
name: drawGame
does: draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background
draws into the element #court

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

The element it draws into:
#court (canvas 400x300): canvas and ctx are already declared

Names that exist:
bounceWalls, onLeft

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- given: var calls = [], canvas = { width: 400, height: 300 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawGame(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 80 && c[2] === 20; })) => false
- run: (S.paddle.x = 5, drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 5 && c[2] === 280; })) => true

### Ideal

```
function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}
```

## P3 drawGame · V02 the engine, with the parts of the program

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R5. The court shows the paddle, the ball and the bricks left

Task:
kind: view
name: drawGame
does: draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background
draws into the element #court

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

The element it draws into:
#court (canvas 400x300): canvas and ctx are already declared

Names that exist:
bounceWalls, onLeft

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE JavaScript function name(S) that draws its part of the page from S, using only the ids of the layout. It must be safe to call many times (replace what it drew before). It reads S and calls the listed functions; it decides nothing. A canvas is drawn on with its 2D context and its own width and height: it is cleared before every drawing, so never clear it, and draw only your part. S is a global: the function takes no parameter. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME() {` and takes no parameter. S, canvas (the element it draws into) and ctx (its 2D context) are ALREADY declared for you: never declare them, never call getElementById or getContext, write only the drawing. 2. It reads S only through the names The state S shows, spelled exactly as shown. 3. It never changes S. 4. It never clears a canvas (the page does before every view) and never adds to what an earlier call drew: it sets the text, or draws its whole picture again. 5. It calls no handler and no other view. 6. A list may be empty: a loop over it must work. 7. It draws only what its task names: no loop, no timer, no key listener, no camera, no background, no other view's picture. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- given: var calls = [], canvas = { width: 400, height: 300 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawGame(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 80 && c[2] === 20; })) => false
- run: (S.paddle.x = 5, drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 5 && c[2] === 280; })) => true

### Ideal

```
function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}
```

## P3 drawGame · V03 the task alone

kind: view
name: drawGame
does: draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background
draws into the element #court

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- given: var calls = [], canvas = { width: 400, height: 300 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawGame(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 80 && c[2] === 20; })) => false
- run: (S.paddle.x = 5, drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 5 && c[2] === 280; })) => true

### Ideal

```
function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}
```

## P3 drawGame · V04 task and state

kind: view
name: drawGame
does: draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background
draws into the element #court

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- given: var calls = [], canvas = { width: 400, height: 300 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawGame(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 80 && c[2] === 20; })) => false
- run: (S.paddle.x = 5, drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 5 && c[2] === 280; })) => true

### Ideal

```
function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}
```

## P3 drawGame · V05 task, state and the signatures of what it uses

kind: view
name: drawGame
does: draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background
draws into the element #court

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

Elements of the page:
#court (canvas 400x300)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- given: var calls = [], canvas = { width: 400, height: 300 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawGame(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 80 && c[2] === 20; })) => false
- run: (S.paddle.x = 5, drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 5 && c[2] === 280; })) => true

### Ideal

```
function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}
```

## P3 drawGame · V06 task, state and the code of what it uses

kind: view
name: drawGame
does: draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background
draws into the element #court

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

Elements of the page:
#court (canvas 400x300)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- given: var calls = [], canvas = { width: 400, height: 300 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawGame(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 80 && c[2] === 20; })) => false
- run: (S.paddle.x = 5, drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 5 && c[2] === 280; })) => true

### Ideal

```
function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}
```

## P3 drawGame · V07 a plain request in a sentence

I am building a program called "Ball and paddle". Please write the view drawGame, drawing into #court. draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background. The state S looks like this: mode: string ("playing") score: number (0) lives: number (3) width: number (400) height: number (300) ball: {x, y, r, vx, vy} paddle: {x, y, w, h} bricks: list of {x, y, w, h, alive}. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- given: var calls = [], canvas = { width: 400, height: 300 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawGame(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 80 && c[2] === 20; })) => false
- run: (S.paddle.x = 5, drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 5 && c[2] === 280; })) => true

### Ideal

```
function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}
```

## P3 drawGame · V08 the engine context and a checklist after

Program:
Ball and paddle. Language of the person: English.

Requirements this unit serves:
R5. The court shows the paddle, the ball and the bricks left

Task:
kind: view
name: drawGame
does: draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background
draws into the element #court

The state S:
mode: string ("playing")
score: number (0)
lives: number (3)
width: number (400)
height: number (300)
ball: {x, y, r, vx, vy}
paddle: {x, y, w, h}
bricks: list of {x, y, w, h, alive}

The element it draws into:
#court (canvas 400x300): canvas and ctx are already declared

Names that exist:
bounceWalls, onLeft

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- given: var calls = [], canvas = { width: 400, height: 300 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawGame(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 80 && c[2] === 20; })) => false
- run: (S.paddle.x = 5, drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 5 && c[2] === 280; })) => true

### Ideal

```
function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}
```

## P3 drawGame · V09 task, the real values of the state and examples

kind: view
name: drawGame
does: draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background
draws into the element #court

S starts as:
{"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- given: var calls = [], canvas = { width: 400, height: 300 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawGame(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 80 && c[2] === 20; })) => false
- run: (S.paddle.x = 5, drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 5 && c[2] === 280; })) => true

### Ideal

```
function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}
```

## P3 drawGame · V10 telegraphic

unit: view drawGame
into: #court
does: draws the paddle as a rectangle, the ball as a filled circle and every brick that is not broken as a rectangle, on a dark background
S: mode: string ("playing") score: number (0) lives: number (3) width: number (400) height: number (300) ball: {x, y, r, vx, vy} paddle: {x, y, w, h} bricks: list of {x, y, w, h, alive}
reply: code only

### Options

- thinking: off
- max_tokens: 1200

### Checks

- given: var S = {"mode":"playing","score":0,"lives":3,"width":400,"height":300,"ball":{"x":200,"y":150,"r":6,"vx":3,"vy":-3},"paddle":{"x":170,"y":280,"w":60,"h":10},"bricks":[{"x":20,"y":20,"w":50,"h":14,"alive":true},{"x":80,"y":20,"w":50,"h":14,"alive":false}]};
- given: var calls = [], canvas = { width: 400, height: 300 }, ctx = new Proxy({}, { get: function (t, k) { return function () { calls.push([k].concat([].slice.call(arguments))); }; }, set: function () { return true; } }); var document = { getElementById: function () { throw new Error("a view never looks the page up"); } };
- loads
- run: (drawGame(), calls.some(function (c) { return c[0] === 'clearRect'; })) => false
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 170 && c[2] === 280 && c[3] === 60 && c[4] === 10; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'arc' && c[1] === 200 && c[2] === 150 && c[3] === 6; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 20 && c[2] === 20 && c[3] === 50 && c[4] === 14; })) => true
- run: (drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 80 && c[2] === 20; })) => false
- run: (S.paddle.x = 5, drawGame(), calls.some(function (c) { return c[0] === 'fillRect' && c[1] === 5 && c[2] === 280; })) => true

### Ideal

```
function drawGame() {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff"; ctx.fillRect(S.paddle.x, S.paddle.y, S.paddle.w, S.paddle.h);
  ctx.beginPath(); ctx.arc(S.ball.x, S.ball.y, S.ball.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f90";
  S.bricks.forEach(function (b) { if (b.alive) ctx.fillRect(b.x, b.y, b.w, b.h); });
}
```

## P4 S · V01 the engine as it is

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R1. The person types a task and adds it with a button
R2. Tasks are listed and each can be done or not
R3. A filter shows all, only the active or only the done tasks
R4. The number of tasks left is shown

Task:
kind: state
name: S
does: everything the program remembers: the filter, the next id and the list of tasks

Names that exist:
visibleTasks, onAdd, drawList

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1680

### Checks

- json
- contains: "tasks"
- contains: "filter"
- contains: "next"
- regex: "title"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "filter": "all",
  "next": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Buy milk",
      "done": false
    },
    {
      "id": 2,
      "title": "Call Sam",
      "done": true
    }
  ]
}
```

## P4 S · V02 the engine, with the parts of the program

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R1. The person types a task and adds it with a button
R2. Tasks are listed and each can be done or not
R3. A filter shows all, only the active or only the done tasks
R4. The number of tasks left is shown

Task:
kind: state
name: S
does: everything the program remembers: the filter, the next id and the list of tasks

Names that exist:
visibleTasks, onAdd, drawList

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1680

### Checks

- json
- contains: "tasks"
- contains: "filter"
- contains: "next"
- regex: "title"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "filter": "all",
  "next": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Buy milk",
      "done": false
    },
    {
      "id": 2,
      "title": "Call Sam",
      "done": true
    }
  ]
}
```

## P4 S · V03 the task alone

kind: state
name: S
does: everything the program remembers: the filter, the next id and the list of tasks

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "tasks"
- contains: "filter"
- contains: "next"
- regex: "title"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "filter": "all",
  "next": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Buy milk",
      "done": false
    },
    {
      "id": 2,
      "title": "Call Sam",
      "done": true
    }
  ]
}
```

## P4 S · V04 task and state

kind: state
name: S
does: everything the program remembers: the filter, the next id and the list of tasks

Requirements:
R1. The person types a task and adds it with a button
R2. Tasks are listed and each can be done or not
R3. A filter shows all, only the active or only the done tasks
R4. The number of tasks left is shown

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "tasks"
- contains: "filter"
- contains: "next"
- regex: "title"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "filter": "all",
  "next": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Buy milk",
      "done": false
    },
    {
      "id": 2,
      "title": "Call Sam",
      "done": true
    }
  ]
}
```

## P4 S · V05 task, state and the signatures of what it uses

kind: state
name: S
does: everything the program remembers: the filter, the next id and the list of tasks

Requirements:
R1. The person types a task and adds it with a button
R2. Tasks are listed and each can be done or not
R3. A filter shows all, only the active or only the done tasks
R4. The number of tasks left is shown

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "tasks"
- contains: "filter"
- contains: "next"
- regex: "title"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "filter": "all",
  "next": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Buy milk",
      "done": false
    },
    {
      "id": 2,
      "title": "Call Sam",
      "done": true
    }
  ]
}
```

## P4 S · V06 task, state and the code of what it uses

kind: state
name: S
does: everything the program remembers: the filter, the next id and the list of tasks

Requirements:
R1. The person types a task and adds it with a button
R2. Tasks are listed and each can be done or not
R3. A filter shows all, only the active or only the done tasks
R4. The number of tasks left is shown

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "tasks"
- contains: "filter"
- contains: "next"
- regex: "title"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "filter": "all",
  "next": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Buy milk",
      "done": false
    },
    {
      "id": 2,
      "title": "Call Sam",
      "done": true
    }
  ]
}
```

## P4 S · V07 a plain request in a sentence

I am building a program called "To-do list". Please write the state S. everything the program remembers: the filter, the next id and the list of tasks. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1680

### Checks

- json
- contains: "tasks"
- contains: "filter"
- contains: "next"
- regex: "title"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "filter": "all",
  "next": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Buy milk",
      "done": false
    },
    {
      "id": 2,
      "title": "Call Sam",
      "done": true
    }
  ]
}
```

## P4 S · V08 the engine context and a checklist after

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R1. The person types a task and adds it with a button
R2. Tasks are listed and each can be done or not
R3. A filter shows all, only the active or only the done tasks
R4. The number of tasks left is shown

Task:
kind: state
name: S
does: everything the program remembers: the filter, the next id and the list of tasks

Names that exist:
visibleTasks, onAdd, drawList

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "tasks"
- contains: "filter"
- contains: "next"
- regex: "title"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "filter": "all",
  "next": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Buy milk",
      "done": false
    },
    {
      "id": 2,
      "title": "Call Sam",
      "done": true
    }
  ]
}
```

## P4 S · V09 task, the real values of the state and examples

kind: state
name: S
does: everything the program remembers: the filter, the next id and the list of tasks

Requirements:
R1. The person types a task and adds it with a button
R2. Tasks are listed and each can be done or not
R3. A filter shows all, only the active or only the done tasks
R4. The number of tasks left is shown

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "tasks"
- contains: "filter"
- contains: "next"
- regex: "title"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "filter": "all",
  "next": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Buy milk",
      "done": false
    },
    {
      "id": 2,
      "title": "Call Sam",
      "done": true
    }
  ]
}
```

## P4 S · V10 telegraphic

unit: state S
does: everything the program remembers: the filter, the next id and the list of tasks
reply: code only

### Options

- thinking: off
- max_tokens: 1680

### Checks

- json
- contains: "tasks"
- contains: "filter"
- contains: "next"
- regex: "title"\s*:
- not: //
- not: function
- not: []

### Ideal

```
{
  "filter": "all",
  "next": 3,
  "tasks": [
    {
      "id": 1,
      "title": "Buy milk",
      "done": false
    },
    {
      "id": 2,
      "title": "Call Sam",
      "done": true
    }
  ]
}
```

## P4 visibleTasks · V01 the engine as it is

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R3. A filter shows all, only the active or only the done tasks

Task:
kind: fn
name: visibleTasks
does: the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
signature: visibleTasks(tasks, filter)
examples that must hold:
  visibleTasks([{id:1,done:false},{id:2,done:true}],"done").length  ->  1

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

Names that exist:
onAdd, drawList

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1200

### Checks

- given: var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];
- loads
- run: visibleTasks(T,"all").length => 3
- run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]
- run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]
- run: visibleTasks(T,"whatever").length => 3
- run: visibleTasks([],"done") => []
- run: visibleTasks(Object.freeze(T.slice()),"active").length => 2

### Ideal

```
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}
```

## P4 visibleTasks · V02 the engine, with the parts of the program

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R3. A filter shows all, only the active or only the done tasks

Task:
kind: fn
name: visibleTasks
does: the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
signature: visibleTasks(tasks, filter)
examples that must hold:
  visibleTasks([{id:1,done:false},{id:2,done:true}],"done").length  ->  1

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

Names that exist:
onAdd, drawList

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1200

### Checks

- given: var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];
- loads
- run: visibleTasks(T,"all").length => 3
- run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]
- run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]
- run: visibleTasks(T,"whatever").length => 3
- run: visibleTasks([],"done") => []
- run: visibleTasks(Object.freeze(T.slice()),"active").length => 2

### Ideal

```
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}
```

## P4 visibleTasks · V03 the task alone

kind: fn
name: visibleTasks
does: the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
signature: visibleTasks(tasks, filter)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];
- loads
- run: visibleTasks(T,"all").length => 3
- run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]
- run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]
- run: visibleTasks(T,"whatever").length => 3
- run: visibleTasks([],"done") => []
- run: visibleTasks(Object.freeze(T.slice()),"active").length => 2

### Ideal

```
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}
```

## P4 visibleTasks · V04 task and state

kind: fn
name: visibleTasks
does: the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
signature: visibleTasks(tasks, filter)

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];
- loads
- run: visibleTasks(T,"all").length => 3
- run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]
- run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]
- run: visibleTasks(T,"whatever").length => 3
- run: visibleTasks([],"done") => []
- run: visibleTasks(Object.freeze(T.slice()),"active").length => 2

### Ideal

```
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}
```

## P4 visibleTasks · V05 task, state and the signatures of what it uses

kind: fn
name: visibleTasks
does: the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
signature: visibleTasks(tasks, filter)

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];
- loads
- run: visibleTasks(T,"all").length => 3
- run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]
- run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]
- run: visibleTasks(T,"whatever").length => 3
- run: visibleTasks([],"done") => []
- run: visibleTasks(Object.freeze(T.slice()),"active").length => 2

### Ideal

```
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}
```

## P4 visibleTasks · V06 task, state and the code of what it uses

kind: fn
name: visibleTasks
does: the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
signature: visibleTasks(tasks, filter)

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];
- loads
- run: visibleTasks(T,"all").length => 3
- run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]
- run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]
- run: visibleTasks(T,"whatever").length => 3
- run: visibleTasks([],"done") => []
- run: visibleTasks(Object.freeze(T.slice()),"active").length => 2

### Ideal

```
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}
```

## P4 visibleTasks · V07 a plain request in a sentence

I am building a program called "To-do list". Please write the function visibleTasks(tasks, filter). the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed. The state S looks like this: filter: string ("all") next: number (3) tasks: list of {id, title, done}. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

### Checks

- given: var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];
- loads
- run: visibleTasks(T,"all").length => 3
- run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]
- run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]
- run: visibleTasks(T,"whatever").length => 3
- run: visibleTasks([],"done") => []
- run: visibleTasks(Object.freeze(T.slice()),"active").length => 2

### Ideal

```
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}
```

## P4 visibleTasks · V08 the engine context and a checklist after

Program:
To-do list. Language of the person: English.

Requirements this unit serves:
R3. A filter shows all, only the active or only the done tasks

Task:
kind: fn
name: visibleTasks
does: the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
signature: visibleTasks(tasks, filter)
examples that must hold:
  visibleTasks([{id:1,done:false},{id:2,done:true}],"done").length  ->  1

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

Names that exist:
onAdd, drawList

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];
- loads
- run: visibleTasks(T,"all").length => 3
- run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]
- run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]
- run: visibleTasks(T,"whatever").length => 3
- run: visibleTasks([],"done") => []
- run: visibleTasks(Object.freeze(T.slice()),"active").length => 2

### Ideal

```
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}
```

## P4 visibleTasks · V09 task, the real values of the state and examples

kind: fn
name: visibleTasks
does: the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
signature: visibleTasks(tasks, filter)

S starts as:
{"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]}

These must hold:
visibleTasks([{id:1,done:false},{id:2,done:true}],"done").length gives 1

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- given: var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];
- loads
- run: visibleTasks(T,"all").length => 3
- run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]
- run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]
- run: visibleTasks(T,"whatever").length => 3
- run: visibleTasks([],"done") => []
- run: visibleTasks(Object.freeze(T.slice()),"active").length => 2

### Ideal

```
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}
```

## P4 visibleTasks · V10 telegraphic

unit: fn visibleTasks
signature: visibleTasks(tasks, filter)
does: the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed
S: filter: string ("all") next: number (3) tasks: list of {id, title, done}
reply: code only

### Options

- thinking: off
- max_tokens: 1200

### Checks

- given: var T = [{id:1,title:"a",done:false},{id:2,title:"b",done:true},{id:3,title:"c",done:false}];
- loads
- run: visibleTasks(T,"all").length => 3
- run: visibleTasks(T,"active").map(function (t) { return t.id; }) => [1,3]
- run: visibleTasks(T,"done").map(function (t) { return t.id; }) => [2]
- run: visibleTasks(T,"whatever").length => 3
- run: visibleTasks([],"done") => []
- run: visibleTasks(Object.freeze(T.slice()),"active").length => 2

### Ideal

```
function visibleTasks(tasks, filter) {
  if (filter === "active") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks.slice();
}
```

## P4 onAdd · V01 the engine as it is

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
- max_tokens: 1200

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

## P4 onAdd · V02 the engine, with the parts of the program

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
- max_tokens: 1200

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

## P4 onAdd · V03 the task alone

kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 onAdd · V04 task and state

kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 onAdd · V05 task, state and the signatures of what it uses

kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 onAdd · V06 task, state and the code of what it uses

kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 onAdd · V07 a plain request in a sentence

I am building a program called "To-do list". Please write the handler onAdd, called on click #add. reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing. The state S looks like this: filter: string ("all") next: number (3) tasks: list of {id, title, done}. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

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

## P4 onAdd · V08 the engine context and a checklist after

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 onAdd · V09 task, the real values of the state and examples

kind: handler
name: onAdd
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
called by the event: click #add

S starts as:
{"filter":"all","next":3,"tasks":[{"id":1,"title":"Buy milk","done":false},{"id":2,"title":"Call Sam","done":true}]}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 onAdd · V10 telegraphic

unit: handler onAdd
event: click #add
does: reads the text of the field #title, removes the spaces around it, and when something is left adds a task with the next id, not done, raises the next id by one and empties the field; an empty text adds nothing
S: filter: string ("all") next: number (3) tasks: list of {id, title, done}
reply: code only

### Options

- thinking: off
- max_tokens: 1200

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

## P4 drawList · V01 the engine as it is

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
- max_tokens: 1200

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

## P4 drawList · V02 the engine, with the parts of the program

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
- max_tokens: 1200

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

## P4 drawList · V03 the task alone

kind: view
name: drawList
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
draws into the element #list

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 drawList · V04 task and state

kind: view
name: drawList
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
draws into the element #list

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 drawList · V05 task, state and the signatures of what it uses

kind: view
name: drawList
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
draws into the element #list

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

Functions you can call:
visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed

Elements of the page:
#title (input)
#add (button)
#list (ul)
#count (span)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 drawList · V06 task, state and the code of what it uses

kind: view
name: drawList
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
draws into the element #list

The state S:
filter: string ("all")
next: number (3)
tasks: list of {id, title, done}

Functions you can call (their code):
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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 drawList · V07 a plain request in a sentence

I am building a program called "To-do list". Please write the view drawList, drawing into #list. writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done. The state S looks like this: filter: string ("all") next: number (3) tasks: list of {id, title, done}. You can call: visibleTasks(tasks, filter): the tasks to show for a filter: "all" gives every task, "active" the ones not done, "done" the ones done; any other value gives every task; the order is kept and the input is not changed. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

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

## P4 drawList · V08 the engine context and a checklist after

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 drawList · V09 task, the real values of the state and examples

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

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P4 drawList · V10 telegraphic

unit: view drawList
into: #list
does: writes the visible tasks into the list as one <li> each with the title, and the class done on the ones that are done
S: filter: string ("all") next: number (3) tasks: list of {id, title, done}
uses: visibleTasks
reply: code only

### Options

- thinking: off
- max_tokens: 1200

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

## P5 S · V01 the engine as it is

Program:
Lights Out. Language of the person: English.

Requirements this unit serves:
R1. A grid of lights, each on or off
R2. Pressing a light flips it and the lights just above, below, left and right of it
R3. The puzzle is solved when every light is off
R4. The number of presses is counted

Task:
kind: state
name: S
does: everything the program remembers: the mode, the number of presses and the grid of lights

Names that exist:
toggleCell, isSolved

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1680

### Checks

- json
- contains: "grid"
- contains: "moves"
- contains: "mode"
- regex: (true|false)
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "moves": 0,
  "grid": [
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      true,
      true,
      true,
      false,
      false
    ],
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ]
  ]
}
```

## P5 S · V02 the engine, with the parts of the program

Program:
Lights Out. Language of the person: English.

Requirements this unit serves:
R1. A grid of lights, each on or off
R2. Pressing a light flips it and the lights just above, below, left and right of it
R3. The puzzle is solved when every light is off
R4. The number of presses is counted

Task:
kind: state
name: S
does: everything the program remembers: the mode, the number of presses and the grid of lights

Names that exist:
toggleCell, isSolved

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write the initial state as ONE JSON object: every value the program remembers, with its starting value. Things of the same kind have the same field names everywhere (every thing with a position and a size has x, y, w, h, never width in one place and w in another), numbers are numbers, the mode or screen the program is in is one short text ("playing", "over") that other units will compare with, and every list the requirements need holds a few real entries (never an empty list for something the person must see). JSON only, no comments, no code fence needed. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1680

### Checks

- json
- contains: "grid"
- contains: "moves"
- contains: "mode"
- regex: (true|false)
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "moves": 0,
  "grid": [
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      true,
      true,
      true,
      false,
      false
    ],
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ]
  ]
}
```

## P5 S · V03 the task alone

kind: state
name: S
does: everything the program remembers: the mode, the number of presses and the grid of lights

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "grid"
- contains: "moves"
- contains: "mode"
- regex: (true|false)
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "moves": 0,
  "grid": [
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      true,
      true,
      true,
      false,
      false
    ],
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ]
  ]
}
```

## P5 S · V04 task and state

kind: state
name: S
does: everything the program remembers: the mode, the number of presses and the grid of lights

Requirements:
R1. A grid of lights, each on or off
R2. Pressing a light flips it and the lights just above, below, left and right of it
R3. The puzzle is solved when every light is off
R4. The number of presses is counted

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "grid"
- contains: "moves"
- contains: "mode"
- regex: (true|false)
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "moves": 0,
  "grid": [
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      true,
      true,
      true,
      false,
      false
    ],
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ]
  ]
}
```

## P5 S · V05 task, state and the signatures of what it uses

kind: state
name: S
does: everything the program remembers: the mode, the number of presses and the grid of lights

Requirements:
R1. A grid of lights, each on or off
R2. Pressing a light flips it and the lights just above, below, left and right of it
R3. The puzzle is solved when every light is off
R4. The number of presses is counted

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "grid"
- contains: "moves"
- contains: "mode"
- regex: (true|false)
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "moves": 0,
  "grid": [
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      true,
      true,
      true,
      false,
      false
    ],
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ]
  ]
}
```

## P5 S · V06 task, state and the code of what it uses

kind: state
name: S
does: everything the program remembers: the mode, the number of presses and the grid of lights

Requirements:
R1. A grid of lights, each on or off
R2. Pressing a light flips it and the lights just above, below, left and right of it
R3. The puzzle is solved when every light is off
R4. The number of presses is counted

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "grid"
- contains: "moves"
- contains: "mode"
- regex: (true|false)
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "moves": 0,
  "grid": [
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      true,
      true,
      true,
      false,
      false
    ],
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ]
  ]
}
```

## P5 S · V07 a plain request in a sentence

I am building a program called "Lights Out". Please write the state S. everything the program remembers: the mode, the number of presses and the grid of lights. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1680

### Checks

- json
- contains: "grid"
- contains: "moves"
- contains: "mode"
- regex: (true|false)
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "moves": 0,
  "grid": [
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      true,
      true,
      true,
      false,
      false
    ],
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ]
  ]
}
```

## P5 S · V08 the engine context and a checklist after

Program:
Lights Out. Language of the person: English.

Requirements this unit serves:
R1. A grid of lights, each on or off
R2. Pressing a light flips it and the lights just above, below, left and right of it
R3. The puzzle is solved when every light is off
R4. The number of presses is counted

Task:
kind: state
name: S
does: everything the program remembers: the mode, the number of presses and the grid of lights

Names that exist:
toggleCell, isSolved

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "grid"
- contains: "moves"
- contains: "mode"
- regex: (true|false)
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "moves": 0,
  "grid": [
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      true,
      true,
      true,
      false,
      false
    ],
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ]
  ]
}
```

## P5 S · V09 task, the real values of the state and examples

kind: state
name: S
does: everything the program remembers: the mode, the number of presses and the grid of lights

Requirements:
R1. A grid of lights, each on or off
R2. Pressing a light flips it and the lights just above, below, left and right of it
R3. The puzzle is solved when every light is off
R4. The number of presses is counted

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1680

### Checks

- json
- contains: "grid"
- contains: "moves"
- contains: "mode"
- regex: (true|false)
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "moves": 0,
  "grid": [
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      true,
      true,
      true,
      false,
      false
    ],
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ]
  ]
}
```

## P5 S · V10 telegraphic

unit: state S
does: everything the program remembers: the mode, the number of presses and the grid of lights
reply: code only

### Options

- thinking: off
- max_tokens: 1680

### Checks

- json
- contains: "grid"
- contains: "moves"
- contains: "mode"
- regex: (true|false)
- not: //
- not: function
- not: []

### Ideal

```
{
  "mode": "playing",
  "moves": 0,
  "grid": [
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      true,
      true,
      true,
      false,
      false
    ],
    [
      false,
      true,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ],
    [
      false,
      false,
      false,
      false,
      false
    ]
  ]
}
```

## P5 toggleCell · V01 the engine as it is

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
- max_tokens: 1200

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

## P5 toggleCell · V02 the engine, with the parts of the program

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
- max_tokens: 1200

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

## P5 toggleCell · V03 the task alone

kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P5 toggleCell · V04 task and state

kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P5 toggleCell · V05 task, state and the signatures of what it uses

kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P5 toggleCell · V06 task, state and the code of what it uses

kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P5 toggleCell · V07 a plain request in a sentence

I am building a program called "Lights Out". Please write the function toggleCell(grid, r, c). a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed. The state S looks like this: mode: string ("playing") moves: number (0) grid: list of lists. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

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

## P5 toggleCell · V08 the engine context and a checklist after

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

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P5 toggleCell · V09 task, the real values of the state and examples

kind: fn
name: toggleCell
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
signature: toggleCell(grid, r, c)

S starts as:
{"mode":"playing","moves":0,"grid":[[false,true,false,false,false],[true,true,true,false,false],[false,true,false,false,false],[false,false,false,false,false],[false,false,false,false,false]]}

These must hold:
toggleCell([[false,false],[false,false]],0,0) gives [[true,true],[true,false]]

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

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

## P5 toggleCell · V10 telegraphic

unit: fn toggleCell
signature: toggleCell(grid, r, c)
does: a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed
S: mode: string ("playing") moves: number (0) grid: list of lists
reply: code only

### Options

- thinking: off
- max_tokens: 1200

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

## P5 isSolved · V01 the engine as it is

Program:
Lights Out. Language of the person: English.

Requirements this unit serves:
R3. The puzzle is solved when every light is off

Task:
kind: fn
name: isSolved
does: true when every light of the grid is off
signature: isSolved(grid)
examples that must hold:
  isSolved([[false,false],[false,true]])  ->  false

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

Functions you can call:
toggleCell(grid, r, c): a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed

Names that exist:
toggleCell

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1200

### Checks

- loads
- run: isSolved([[false,false],[false,false]]) => true
- run: isSolved([[false,false],[false,true]]) => false
- run: isSolved([]) => true
- run: isSolved([[true]]) => false

### Ideal

```
function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }
```

## P5 isSolved · V02 the engine, with the parts of the program

Program:
Lights Out. Language of the person: English.

Requirements this unit serves:
R3. The puzzle is solved when every light is off

Task:
kind: fn
name: isSolved
does: true when every light of the grid is off
signature: isSolved(grid)
examples that must hold:
  isSolved([[false,false],[false,true]])  ->  false

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

Functions you can call:
toggleCell(grid, r, c): a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed

Names that exist:
toggleCell

### Options

- system: You write one unit of a program. The page already does, once, for every unit: it runs the loop (tick handlers every 16 ms), clears the canvases, draws every view after each change, listens to the keys and the clicks and calls the handlers, and declares S. Never write any of that: write only what is specific to this unit. Write ONE pure JavaScript function with exactly the given name and signature. It takes values and returns a new value (it ALWAYS ends with return); it never touches the page, S or a global and never changes its arguments (copy what it changes). It may call only the functions listed as used. Reply with the function only. STRICT RULES (check your code against each before answering): 1. It starts with `function NAME(parameters) {` exactly as given. 2. Every path ends with `return` of a value (never nothing). 3. It never changes an argument: copy first ({ ...obj }, [ ...list ]) and return the copy. 4. It uses only its parameters, the functions listed and Math: no S, no document, no other function, no random or clock unless it is a parameter. 5. It reads only the fields The state S shows, spelled exactly as shown (w and h are not width and height unless shown so). 6. A list may be empty: a loop over it must work. 7. It returns the kind of value its task says. Use only the names given in the context; invent no other name. Do what the requirements ask in the richest, most original way you can: the rules above are only about how the code is wired, never about how ambitious or inventive the program is. No explanation.
- max_tokens: 1200

### Checks

- loads
- run: isSolved([[false,false],[false,false]]) => true
- run: isSolved([[false,false],[false,true]]) => false
- run: isSolved([]) => true
- run: isSolved([[true]]) => false

### Ideal

```
function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }
```

## P5 isSolved · V03 the task alone

kind: fn
name: isSolved
does: true when every light of the grid is off
signature: isSolved(grid)

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- loads
- run: isSolved([[false,false],[false,false]]) => true
- run: isSolved([[false,false],[false,true]]) => false
- run: isSolved([]) => true
- run: isSolved([[true]]) => false

### Ideal

```
function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }
```

## P5 isSolved · V04 task and state

kind: fn
name: isSolved
does: true when every light of the grid is off
signature: isSolved(grid)

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- loads
- run: isSolved([[false,false],[false,false]]) => true
- run: isSolved([[false,false],[false,true]]) => false
- run: isSolved([]) => true
- run: isSolved([[true]]) => false

### Ideal

```
function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }
```

## P5 isSolved · V05 task, state and the signatures of what it uses

kind: fn
name: isSolved
does: true when every light of the grid is off
signature: isSolved(grid)

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- loads
- run: isSolved([[false,false],[false,false]]) => true
- run: isSolved([[false,false],[false,true]]) => false
- run: isSolved([]) => true
- run: isSolved([[true]]) => false

### Ideal

```
function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }
```

## P5 isSolved · V06 task, state and the code of what it uses

kind: fn
name: isSolved
does: true when every light of the grid is off
signature: isSolved(grid)

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- loads
- run: isSolved([[false,false],[false,false]]) => true
- run: isSolved([[false,false],[false,true]]) => false
- run: isSolved([]) => true
- run: isSolved([[true]]) => false

### Ideal

```
function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }
```

## P5 isSolved · V07 a plain request in a sentence

I am building a program called "Lights Out". Please write the function isSolved(grid). true when every light of the grid is off. The state S looks like this: mode: string ("playing") moves: number (0) grid: list of lists. Reply with the code only.

### Options

- thinking: off
- max_tokens: 1200

### Checks

- loads
- run: isSolved([[false,false],[false,false]]) => true
- run: isSolved([[false,false],[false,true]]) => false
- run: isSolved([]) => true
- run: isSolved([[true]]) => false

### Ideal

```
function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }
```

## P5 isSolved · V08 the engine context and a checklist after

Program:
Lights Out. Language of the person: English.

Requirements this unit serves:
R3. The puzzle is solved when every light is off

Task:
kind: fn
name: isSolved
does: true when every light of the grid is off
signature: isSolved(grid)
examples that must hold:
  isSolved([[false,false],[false,true]])  ->  false

The state S:
mode: string ("playing")
moves: number (0)
grid: list of lists

Functions you can call:
toggleCell(grid, r, c): a new grid where the light at row r, column c and the lights just above, below, left and right of it (the ones that exist) are flipped, true to false and false to true; the grid given is not changed

Names that exist:
toggleCell

Before you answer, check: the name and the arguments are exactly the ones asked; you use only names that appear above; the unit does only its own job (nothing the page already does); a function returns a new value and never changes what it was given; nothing that the task says is left out.

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- loads
- run: isSolved([[false,false],[false,false]]) => true
- run: isSolved([[false,false],[false,true]]) => false
- run: isSolved([]) => true
- run: isSolved([[true]]) => false

### Ideal

```
function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }
```

## P5 isSolved · V09 task, the real values of the state and examples

kind: fn
name: isSolved
does: true when every light of the grid is off
signature: isSolved(grid)

S starts as:
{"mode":"playing","moves":0,"grid":[[false,true,false,false,false],[true,true,true,false,false],[false,true,false,false,false],[false,false,false,false,false],[false,false,false,false,false]]}

These must hold:
isSolved([[false,false],[false,true]]) gives false

### Options

- system: Write one unit of a program in JavaScript. Reply with the code only, no explanation.
- max_tokens: 1200

### Checks

- loads
- run: isSolved([[false,false],[false,false]]) => true
- run: isSolved([[false,false],[false,true]]) => false
- run: isSolved([]) => true
- run: isSolved([[true]]) => false

### Ideal

```
function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }
```

## P5 isSolved · V10 telegraphic

unit: fn isSolved
signature: isSolved(grid)
does: true when every light of the grid is off
S: mode: string ("playing") moves: number (0) grid: list of lists
reply: code only

### Options

- thinking: off
- max_tokens: 1200

### Checks

- loads
- run: isSolved([[false,false],[false,false]]) => true
- run: isSolved([[false,false],[false,true]]) => false
- run: isSolved([]) => true
- run: isSolved([[true]]) => false

### Ideal

```
function isSolved(grid) { return grid.every(function (row) { return row.every(function (v) { return !v; }); }); }
```
