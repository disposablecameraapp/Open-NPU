# The construction engine

Goal: turn a prompt into a finished program, step by step, with a small model (a 4B on the NPU), for ANY kind of program. Games are the test
because everyone knows what they must do; nothing in the engine knows a genre. It must succeed because the model is guided through a
procedure, not because it was shown how a kind of program is built.

## The procedure (`src/core/construct/pipeline.ts`)

1. **Requirements.** One call, a closed JSON form: numbered, atomic, testable statements in the person's words.
2. **Plan.** One call, a closed JSON form: units of five kinds (`types.ts`): `state` (one JSON object `S`), `layout` (HTML + CSS with ids),
   `fn` (pure function with a signature and 2-4 examples), `view` (`name(S)` draws), `handler` (thin, with its event). Each unit names the
   requirements it serves and the units it uses. `completePlan` (`tasklist.ts`) keeps only what can exist and reports gaps; one more call
   fills the gaps.
3. **Skeleton.** `assemblePage` (`assemble.ts`) puts the page together by code. It runs from the first step (stubs), and again after each unit.
4. **Units.** In dependency order. Small functions of one kind share a call (`groupUnits`). Each is checked by code (`checkUnit`): it parses,
   defines its name, respects its kind (a fn does not touch the page or `S`, a view does not change `S`, a handler does not draw), and a fn's
   examples are run for real in an isolated context with a time limit (`sandbox.ts`). A failing unit is corrected once, with the exact failures.
5. **Page.** The final page, with the plan kept in an `x-construct` comment and each unit between `/* unit:name */` marks (resume).

## Why the task list and the context engine decide the quality

A small model repeats what it sees. The log of a real run showed it: a copied outline, its own previous output and the names of its drawings,
all given back to it, became invented tags and a loop of 600 lines.

- **Task list** (`tasklist.ts`): a unit with no requirement is dropped; a requirement with no unit is asked about; names are real and unique;
  uses exist; no circle; the order puts what a unit needs first.
- **Context engine** (`context.ts`): for each unit, only its requirements, its task, the contract of what it uses (read from accepted code),
  the shape of the state, the ids of the page, the names that exist. Never a failed reply, never another unit's code, never the plan. Sections
  have priorities and are dropped whole when the room is short. Every call leaves a trace in the log.

## What is not done yet

- Style (a card for the look of what is drawn) and assets are not part of the engine yet.
- Scenario tests derived from the requirements (press this, expect that) and a polish wave that replaces the plain first version unit by
  unit are the next steps.
- It has not been tried with the real model. First measures to take: time and number of calls per phase, how many units pass their examples
  at the first try, and what each call was shown (`engine.describe()` in the log).

## Shelved

`src/core/shelved/` holds the platformer made from two closed JSON forms. It is not used. It would have made the results look better than the
engine deserves.
