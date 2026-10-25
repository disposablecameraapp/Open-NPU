# Open NPU: notes for Claude

Windows on Snapdragon (ARM64) desktop app: Electron main process in `src/main`, React renderer in `src/renderer`, logic shared by both in `src/core`, tests in `tests`. The user writes in French; answer in French.

## Rules that were broken before. Do not break them again.

1. **Hooks go above every early `return` of a component.** A `useState`, `useEffect`, `useMemo`, `useRef`... placed after `if (!x) return ...` makes React throw error #310 ("Rendered more hooks than during the previous render") and the window shows "Open NPU hit a problem drawing the window". It happened in `Chat.tsx`, which returns early when no model is selected, and it happened more than once. `tests/hooks.test.ts` reads every renderer component and fails on a hook after an early return: run it. When adding state to a component, read the whole function first and put the hook with the other hooks, at the top.
2. **Pull requests target `main`, never another `claude/...` branch.** Work merged into an intermediate branch never reached `main` before. When creating a PR, check the base. Before saying something is done, check that it is in `main`.
3. **Before pushing:** `npm ci` (if `node_modules` is missing), `npx tsc --noEmit -p tsconfig.main.json`, `npx tsc --noEmit -p tsconfig.renderer.json`, `npx vitest run`. All must pass. A push to `main` builds the Windows installer in CI (`.github/workflows/release.yml`) and publishes `Open-NPU-Setup.exe` on the `latest` release; that build runs the tests on Windows, where timing-based tests can differ. `git pull --no-rebase` first: other sessions push to `main` too.
4. **No model name or tool name in commit messages or code comments.** Commits end with the attribution lines given by the session.

## What the user wants (decided, do not reopen)

- Models should run **on the NPU**. Badges on every model: NPU (best), Hybrid (part on the CPU), CPU (worst). Hybrid and CPU are never chosen silently: they are a last resort the user allows (`allowHybridLoad`), and the badge says it.
- A model the app does not know (not in the catalog, not in a Dynamic pack) is **checked once after it is installed**: loaded under the best setting this PC accepts, NPU first, then badged. Only loading is checked, never the quality: how good a model is stays the user's call.
- When the app sees the NPU is stuck it **resets it by itself** (scheduled task created once with one Windows permission, then no prompt). Do not make the user press a button or restart the PC.
- The benchmark has a **Launch check** mode (does each model load and answer, no quality tests) and Developer settings has a page that compares GenieX with Microsoft Foundry Local on the same models (`src/core/foundry.ts`, `src/renderer/EngineCompare.tsx`). The Foundry Local side is written from its documentation, not tried against a real install.
- **Building files (`src/core/build.ts`):** a small program (game, tool) is ONE page, written whole by one session, with no planner call for a plain request. A file is never cut into pieces written apart: a file too long for the window is continued by the same session. The contract shared between files is read from the code, not from a model, and checked (a page's own script must parse and find its elements). The user sees which file is being worked on, its code and preview live, and a line saying what happens now. Speak as one assistant ("I", never "we"): the files are the assistant's own work, never "the code you gave me".
- Logs must give the real reason of a failure (server lines, the buffer that was refused, the RAM) and have a "Copy full log" button.

## What is known about the NPU here

Read `docs/npu-load-research.md` before touching model loading. In short: GenieX 0.9.3 starts `geniex serve --compute npu` with the whole model on one NPU session (about 3.5 GB of addresses); a refused buffer is `1024 x vocabulary x 4 bytes + 4096` (the logits for `n_ubatch` 1024); a failed load can leave the NPU unusable until it is reset or Windows restarts; the NPU works in the PC's RAM, so a full RAM makes every load fail. `GGML_HEXAGON_MBUF` and `GGML_HEXAGON_DEVICES` are not read by this GenieX. The NPU load test and the benchmark in Developer settings try settings from the least to the most limiting (`src/core/npuLoad.ts`).
