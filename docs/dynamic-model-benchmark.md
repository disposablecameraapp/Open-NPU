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
