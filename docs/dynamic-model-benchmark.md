# Dynamic: choices from the app's own benchmark (2026-10-25)

Source: the benchmark export `model testing.zip` (89 models queued, 30 ran fully, 1 partial, 58 not loaded). 33 tests per model, one to four per kind of work, one run each. The PC had 7.6 GB of NPU memory, so nothing above ~5.5 GB loaded: **the 14B and 24B packs are untouched**, and Qwen2.5-Coder-7B (needs 9.2 GB) is untested.

The 2B, 4B and 9B packs were re-chosen with one rule: a model takes a kind of work only if it is clearly better (about 10+ points) than the pack's all-rounder, because every switch costs a model load. The scores of most kinds of work are saturated (many models at 100), so the differences come from:

- **Not inventing** (the fake-treaty test): Qwen3, Qwen3.5 and Nemotron pass; Gemma-3/4, Ministral and GLM fail.
- **Code that runs** (HTML/CSS/JS/Python/SQL/regex): the generalist Qwen models match or beat the code specialists; at 2B, LFM2-1.2B-Tool beats Qwen2.5-Coder-1.5B (88 vs 79).
- **Strict constraints, translation, rhymes**: small, one-test gaps, low confidence.

| Pack | All-rounder (default) | Others and what they take |
|---|---|---|
| 2B | Qwen3.5-2B (facts, instructions, long text, writing, French) | Qwen3-1.7B native (maths, logic, plans, code fixing/explaining) · LFM2-1.2B-Tool (code, JSON/tools, translation, quick replies) · Gemma-3-1B (creative) |
| 4B | Qwen3.5-4B (95/100, first overall) | Qwen3-4B-Instruct (other languages, quick replies) · Qwen3-4B-Thinking (reasoning, maths, plans; kept because the tests cannot tell thinking from non-thinking, but it hit the 35 min budget) · Gemma-3-4B (images, not benchmarked) |
| 9B | Qwen3-8B (94/100) | Qwen3.5-9B (code explaining, reasoning, images) · Qwen2.5-Coder-7B (code, kept unproven) |

Dropped: Qwen2.5-Coder-1.5B and -3B (beaten by the generalists), Ministral-8B-Instruct (30 on creative writing, invents facts). Ministral-3-8B-Reasoning scored 92 but fails the fake-treaty test and the code-fix test, and always thinks (8.7 tok/s): not added.

Worth re-running: a PC with 16+ GB of NPU memory to cover 14B/24B and Coder-7B; more tests per kind of work (especially reasoning and creative, where one easy test cannot separate models).


## Foundry Local builds in the packs (2026-10-26)

From the app's own express run (13 tests, one run each, Snapdragon X Plus), on the NPU:

- **2B, Qwen3.5-2B** now runs its Foundry Local build when Foundry Local is installed: 34.7 tokens/s on the NPU against 27.9 for the GenieX file. Its quality was lower in that run (70 against 79); the quality of a short test varies, so speed decides between two builds of one model. The GenieX file is used when Foundry Local is missing.
- **4B, Phi-4-mini-instruct** was added, Foundry Local only: 80/100 at 27.8 tokens/s on the NPU, first of 16 models on logic, facts, not inventing, structured output, tools, safety, Python and CSS. It was not run against the 4B models on the same tests, so it is first only for tool use, knowledge and Python, and second for web code, code repair, code explaining and instructions: the pack's other models stay behind it.
- Not moved: Qwen3-1.7B (its Foundry build runs on the GPU, not the NPU), and every other pack model, for which no Foundry NPU build was measured. When one is, the rule is the same: the faster NPU build wins.
