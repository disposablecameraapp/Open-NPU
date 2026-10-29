# Prompt lab

**Settings → Help → turn on developer mode → Prompt lab.**

The prompt lab asks a series of prompts, written in one Markdown file, to the models you tick, and scores every answer against the
*ideal* answer you wrote. It exists because the app's normal chat treats a request for a game as a job to build with the construction
engine; here a prompt goes to the model **exactly as written**, with no planner, no router and no program builder. Use it to compare how
models (or two wordings of one prompt) answer, for example when you design a planning step.

## What it does, step by step

1. You import a `.md` file (or load the example, or the ready series of planning prompts, from the page).
2. You tick the models. Only models installed on this PC with GenieX are listed (Microsoft Foundry Local models are not run here yet).
3. **Test** loads the first model, asks every prompt `runs` times, then loads the next model. One model is on the NPU at a time. The chat and a benchmark must not be running.
4. Each answer is scored from 0 to 100 against the ideal of its prompt. For each prompt and model, the **best** run is shown, with its time and the average of the runs.
5. Click a score to see the answer next to the ideal and every check. **Save the report** writes a Markdown file with the table and the best answer of each cell.

## The file

~~~markdown
---
title: My series            # optional
runs: 2                     # how many times each prompt is asked of each model (1 to 10); the best counts
max_tokens: 700             # longest answer (16 to 8000)
temperature: 0.3            # optional: replaces the model's own
thinking: off               # off (default), on, or default (what the app does for that model)
greedy: on                  # optional: greedy decoding, none of the model's own sampling settings (what the router uses)
system: You are a lead.     # optional message sent before every prompt
---

# A title (optional, if the front matter has none)

Any text before the first "##" is ignored: use it for notes.

## name of the first prompt

The text sent to the model, as it is. It can have several lines, lists and code fences.

### Checks

- lines: 3-8
- regex: ^block \| .* \| .*$
- not: ```

### Options

max_tokens: 400

### Ideal

The perfect answer. It is the LAST part of the section.

## name of the second prompt
...
~~~

Rules:

- A prompt is a `## heading` (a leading `prompt:` in it is dropped). Two prompts with the same name get `(2)`.
- Inside a section, only `### Ideal`, `### Checks` and `### Options` are reserved. Any other `###` stays in the prompt. A heading inside a code fence (` ``` `) is never a heading.
- If the whole ideal is wrapped in one code fence, the fence is removed.
- The front matter keys are the same as the Options of one prompt; the prompt's own win.
- A mistake never stops the run: the page lists what could not be read ("unknown option", "regex not valid", a prompt with no ideal) and goes on with the rest.

### Checks

One rule per line, each worth the same:

| rule | passes when the answer |
| --- | --- |
| `contains: text` | has the text (any case) |
| `not: text` | does not have it |
| `starts: text` | starts with it |
| `regex: pattern` | matches the pattern on at least one line (JavaScript regex, multiline) |
| `lines: 4-10` or `lines: 5` | has that many non-empty lines |
| `max_chars: 900` | is at most that long |
| `json` | is valid JSON (a wrapping code fence is allowed) |
| `given: var S = {...};` | code run first, before the answer's code; not a check itself (several lines allowed, each on one line) |
| `loads` | the answer's code (its first code fence, else the whole answer) runs without error |
| `run: add(1, 2) => 3` | the expression is run after the code and must give the same value as the one after `=>` (compared as JSON, keys in any order); each `run` line is one check, in a fresh context, with a time limit and no page, process or network |

## How the score is made

Everything is computed by code, nothing is judged by a model, so the same answer always gets the same score.

- **Closeness to the ideal** (0–100), when the prompt has an ideal:
  - the words they share (F1 of the two bags of words, words of 3 letters or more, a few common words dropped) — the content;
  - when the ideal has two lines or more that use `|`: the share of the answer's `|` lines that have as many cells as the ideal's — the form. Weights: 50 % words, 30 % form, 20 % length;
  - the length: the number of non-empty lines against the ideal's.
  - without `|` lines in the ideal: 80 % words, 20 % length.
- **Total**: with checks, 60 % closeness and 40 % checks passed; without checks, the closeness; without an ideal, only the checks.
- A run that fails (the model stopped, a timeout of 10 minutes) counts as failed, never as 0.

Limits to keep in mind: a different but good answer scores lower than one that looks like yours; write the ideal in the same words and form
you ask for, and use checks for what must hold whatever the words. Run each prompt at least twice: small models vary a lot.

## Writing your own test

1. Write the prompt as you would send it. Ask for a form you can check (lines with `|`, JSON, one word).
2. Write the answer you would be happy with. Keep its form exactly as the prompt asks.
3. Add the checks that must hold for any good answer (`lines`, `regex`, `not: ```` ` for "no code", `json`).
4. Import the file, pick two or three models, press Test, read the table, then click the cells that surprise you.
5. Change the wording of the prompt, keep the ideal, and run again: the scores tell which wording the model follows better.

The ready series (**Load the planning prompts (Mario)**) is a worked example: seven ways of asking a model to plan a game, small and
much bigger (`src/core/promptLabPlans.ts`). The smallest example is `LAB_EXAMPLE` in `src/core/promptLab.ts`.

## Where the code is

| what | where |
| --- | --- |
| reading the file, scoring, the report | `src/core/promptLab.ts` |
| the order of the work (models, prompts, runs), stop | `src/core/labRunner.ts` |
| loading a model and asking it (`labStart`, `labStop`, `labState`) | `src/main/main.ts`, "The prompt lab" |
| the page | `src/renderer/PromptLab.tsx` |
| tests | `tests/promptLab.test.ts` |
