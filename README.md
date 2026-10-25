<div align="center">

<img src="build/icon.png" width="96" alt="Open NPU logo">

# Open NPU

**Run AI models on your Snapdragon laptop's NPU. Private, offline, one click.**

[![Download for Windows on Snapdragon](https://img.shields.io/badge/%E2%AC%87%20Download%20Open--NPU--Setup.exe-Windows%20on%20Snapdragon%20(ARM64)-2563eb?style=for-the-badge&logo=windows11&logoColor=white)](https://github.com/disposablecameraapp/Open-NPU/releases/latest/download/Open-NPU-Setup.exe)

[![Latest release](https://img.shields.io/github/v/release/disposablecameraapp/Open-NPU?include_prereleases&label=latest&style=flat-square)](https://github.com/disposablecameraapp/Open-NPU/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/disposablecameraapp/Open-NPU/total?style=flat-square)](https://github.com/disposablecameraapp/Open-NPU/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

Open NPU is a free, open-source desktop app for **Windows on Snapdragon** (Snapdragon X Elite / X Plus Copilot+ PCs). It lets you download a local LLM, tells you **before you install it** whether it will run on the **Qualcomm Hexagon NPU**, and then lets you chat with it by text or by voice. Everything runs on your machine: no account, no cloud, no data leaving your laptop.

It is a friendly front end for Qualcomm's **GenieX** runtime. It drives the GenieX CLI and its OpenAI-compatible server; it does not reimplement inference.

## Download

1. **[Download Open-NPU-Setup.exe](https://github.com/disposablecameraapp/Open-NPU/releases/latest/download/Open-NPU-Setup.exe)** (always the newest build; [all releases](https://github.com/disposablecameraapp/Open-NPU/releases)).
2. Run it. If Windows SmartScreen says "Windows protected your PC", click **More info**, then **Run anyway** (the installer is not code-signed yet).
3. Open Open NPU. On first launch it installs what is missing (GenieX, a dictation model and a read-aloud voice) with a progress bar. Then pick a model and chat.

> **Automatic updates.** Once installed, Open NPU checks the latest release on GitHub at launch and every few hours, downloads new versions in the background and installs them the next time you close the app (or right away with **Settings → Restart to update**).

> **Newest version.** The installer above is rebuilt from `main` on every merge (see the [latest release](https://github.com/disposablecameraapp/Open-NPU/releases/latest) for the build date and commit), so it always matches the newest merged code. To try an unmerged branch, build it yourself: `npm ci && npm run dist`.

**Requirements:** a Windows 11 PC with a Snapdragon (ARM64) chip, ideally 16 GB RAM or more. Intel, AMD and x64-emulated setups are not supported: the NPU runtime needs a native ARM64 app.

## Why Open NPU

- **Know before you download.** Every model gets a green / amber / red badge for the NPU, with reasons (memory, quantization, architecture). Nothing is ever blocked.
- **Any model.** Search a built-in catalog, Hugging Face, Docker Hub and ModelScope, or paste a link or command (`hf.co/org/repo`, `ollama run …`, `docker model pull …`).
- **Chat or talk.** Markdown, code blocks, thinking you can collapse, dictation, read-aloud and hands-free voice chat.
- **Dynamic models.** Pick the memory of your PC (16, 24 or 32 GB) and you get three sizes: **Flash** (smallest, instant), **Flux** (the reasonable one) and **Forge** (the biggest your NPU holds), for example 2B, 4B and 9B on a 16 GB PC. Each size is a pack of models of that size, each the best at one job (code, a mail that sounds natural, facts and summaries, reasoning). Install a pack and every request goes to the right model of it.
- **Builds things.** Websites, games and scripts are written file by file and appear word by word, open as live previews you can click through page to page (or open in your browser with all their files), are checked for errors as they are written and can be improved automatically.
- **Projects, scheduled tasks, web search and sub-agents** for real work, still on-device.
- **Private by design.** Your chats and files stay on your PC.

## Keywords

Local LLM on Snapdragon, Snapdragon X Elite AI, Copilot+ PC NPU, Qualcomm Hexagon NPU, Windows on ARM, run Llama / Qwen / Gemma / Phi / gpt-oss locally, offline AI chatbot, GenieX, Qualcomm AI Hub, GGUF, on-device AI, Ollama and LM Studio alternative for Snapdragon.

## FAQ

**Does it work on Intel or AMD laptops?** No. It targets Windows on Snapdragon (ARM64) and the Hexagon NPU.

**Is it free?** Yes, MIT licensed. Models have their own licenses.

**Does it need internet?** Only to download models and the first-launch components. Chatting is offline.

**Is the installer safe?** It is built from this repository by the public [Build installer](.github/workflows/release.yml) workflow on every push to `main`. It is unsigned, hence the SmartScreen prompt.

**Something is broken or a model is wrongly badged.** [Open an issue](https://github.com/disposablecameraapp/Open-NPU/issues).

---

# Technical details

**Native ARM64 only.** The NPU runtime needs it: the installer targets `win32 arm64`, the app refuses to call itself healthy when it detects an emulated x64 build on an ARM64 machine, and GenieX is only ever used through its CLI (never the x64 Python package, never in-process). Built from the *Open NPU — Build Spec*.

## Dynamic models

A PC's memory fixes how much the NPU can hold (about half of it). `src/core/dynamic-data.json` turns that into three **profiles** (16, 24, 32 GB), each with a Flash, a Flux and a Forge **pack** (16 GB: 2B, 4B, 9B; 24 GB: 4B, 9B, 14B; 32 GB: 9B, 14B, 24B). A pack is any number of models of about that size, each with a job and a Hugging Face Q4_0 file that was checked to exist. `src/core/dynamic.ts` sorts each request into one of 19 kinds of work by its words (no model involved, instant; the loaded model is asked only when unsure), then picks, among the **installed** models of the chosen pack, the one its table names for that work. Rules that keep it quick: a model that always thinks is used only for reasoning, maths and plans; small talk stays on the loaded model; models that can think are told not to except for those same kinds of work; and a whole build (plan, files, mending) stays on one model, because every switch is a load.

Where an independent public score exists the table says so (summaries and facts: the Vectara hallucination leaderboard, checked on its page; code: BigCodeBench-Hard, from a report); elsewhere the line says it is a judgement. Settings, Developer settings edits each pack's table and tries a request. The speeds shown are the average of a pack's models and are replaced by what the app measures on your PC as you chat; until then they are measurements by the app or estimates marked "est.".

How the choices were made, with sources and what was rejected: [`docs/dynamic-model-research.md`](docs/dynamic-model-research.md) and [`docs/dynamic-model-research-2.md`](docs/dynamic-model-research-2.md).

## Model benchmark (Developer settings)

Settings, Developer settings, **Model benchmark** installs candidate models one after the other, tests each on the NPU, records the results and removes the model again so the disk never fills.

**Which models.** About 85: the Dynamic packs up to 9B, your catalog and custom models, and **71 specialists** (`src/core/bench-candidates.json`) picked for being acclaimed at one kind of work: translation (TranslateGemma, Hunyuan-MT, Seed-X, Aya, EuroLLM, Apertus...), tool calling (xLAM-2, Arch-Function, Granite 4.2, LFM2-Tool, Groq tool-use), extraction and RAG (LFM2-Extract, LFM2-RAG, NuExtract), maths and reasoning (DeepSeek-R1-0528-Qwen3-8B, Phi-4-mini-reasoning, Olmo-3-Think, Falcon-H1R, EXAONE-Deep, VibeThinker, DeepScaleR), code (Seed-Coder, OpenCoder, Yi-Coder, Jan-code), web search agents (Jan-v1, Jan-nano), medicine and finance, French and European languages (Ministral 3, EuroLLM), long context (Qwen2.5-1M, MiniCPM5, Granite-H-Tiny), fast edge models (LFM2.5, Gemma 4 E2B, Qwen3.5-2B). Each repo and its Q4_0 file (Q8_0 for the small ones that have no Q4_0) was checked on Hugging Face, and each was resolved by the app's own Hugging Face code, none over 7 GB. Several of the newest were found by listing what Hugging Face shows as popular rather than from prior knowledge, so a "specialist" is what its model card claims, which the benchmark then confirms or not. Community fine-tunes with only K-quant files were left out (they would run partly on the CPU).

**Three test sets.** **Express** (13 short tests, one or two per big area, answers cut at 160 tokens) is for screening: run it on everything, then tick **Best 12 of the results** and run **Quick** (33 tests) or **Full** (87 tests, in 29 sections) on those. The app shows an estimate for the models ticked: for all 85 about 5 h in Express (3.6 h of testing, the rest downloads), 14 h in Quick and 32 h in Full; the 3 GB or less models take a few minutes each. These are guesses from file sizes (NPU speed is about 37 GB/s of memory bandwidth divided by the file size); measured speeds replace them as models are run. Express under-measures models that must think: their thinking is cut at 700 tokens.

The 87 tests cover:

- **Writing and languages**: a mail, a friendly message and a formal letter in French; mail and post in English; summaries, rewriting in a formal tone, proofreading; poems and stories; translation to and from French, Spanish, German.
- **Thinking and knowledge**: arithmetic, word problems, algebra, fractions; ordering puzzles, trick questions, calendar logic; planning; facts in English and French; not inventing a treaty, the future or a phone number; finding a fact in a long text.
- **Orders and data**: exact constraints, a persona that keeps its rule, JSON and CSV, reading a table, calling tools with the right arguments, web search (searches when it should, writes a good query, answers from results and ignores an injected instruction).
- **Assistant**: kind advice, quick replies, refusing a dangerous request without refusing a harmless one.
- **Code, one section each**: Python (run), JavaScript (run), HTML, CSS, whole pages and games, SQL, shell and regular expressions (the regex is run), fixing code, explaining and reviewing code.

Answers are scored by checks that need no judge: exact values, formats, the code that is run against test cases (Python and JavaScript, with a time limit; code that touches the system is not run), markup that is parsed. A model's quality is the mean of its sections, so a section with many tests does not outweigh the others. Speed is measured per test: time to the first token, tokens per second, and the load time of the first request.

**A warm NPU first.** A chip that is cold when the first model runs and tired when the last one does makes the comparison unfair. Before the first test the app keeps the biggest model you ticked writing without a pause for 10 minutes (5 to 30 as you choose; it can be switched off), then tests that model first, on the same install. Windows gives no temperature for the NPU (Task Manager shows N/D), so heat is read in the speed: the warm-up samples it, a short fixed request measures it right after the warm-up and again at the end of the run, and the report says whether the NPU slowed down (within 5% the speeds of early and late models compare fairly; beyond that it says by how much). Each model also records how many minutes into the run it started.

**The dashboard.** While a run goes on, the window shows the percentage done, the time it has been running and the time left (an estimate from the sizes at first, then from the real pace), the model being tested, the words it is writing as it writes them with its speed and first-token time, graphs of the last minutes (NPU load and memory, CPU, RAM, writing speed), one coloured cell per test of the current model, and, from the first finished model on, the share of models on the NPU and the CPU, a leaderboard, quality against speed and size, a model-by-section heat map, how hard each section was, and whether each specialist delivers. **Full screen** gives it the whole window.

**A model that will not run does not hold the run.** A model that does not fit the NPU memory, fails to download or to start, does not answer within 4 minutes of loading, crashes (three failed tests in a row), writes below about 1 token per second, or exceeds its time budget (10 minutes in Express, 35 in Quick, 80 in Full, plus the warm-up for the first) is noted with a reason (too big for the NPU memory, download failed, did not load, kept failing, too slow to test, took too long), removed from the disk and skipped; a model cut short keeps the tests it finished and is marked as tested in part. They are listed with the reason in the window, in `summary.md` and in the exported report. If the model chosen for the warm-up cannot answer, the next one warms the NPU up.

**The step in progress.** The window always shows the steps of the model being tested (look up, download, load, warm up, NPU or CPU, tests, remove) with the current one marked, how long it has lasted, what it is doing in plain words (a download percentage, the warm-up countdown, the test number), a "last sign of life" counter that ignores the once-a-second readings of the machine, and the last lines of what just happened.

**Exporting.** **Export the report** (also done automatically at the end of a run) writes `publish/` next to the results: `report.md` (tables and text bars, to paste on GitHub or Reddit), `report.html` (one page with the charts inside), `charts/*.svg`, `results.csv`, `stats.json`, and a copy of every model's and section's file with the raw answers. It states what was measured, on what machine, how, and what to be careful about.

**Runs on NPU or CPU.** For each model a short generation is watched while it runs: the NPU's own counters (utilization, memory taken since before the model was loaded), how busy the CPU is, and what the server log says. The verdict is NPU, CPU, mixed or unknown, with the evidence written next to it. The counters are found by the word NPU in the name of the Windows counter sets and read in any language (the first version looked for English names only, which is why the meters read n/a on a French Windows); **Check the NPU counters** shows what Windows exposes on this PC. Which counters a Snapdragon NPU really exposes was not tested here: that is for your laptop to say.

**Results** go to `benchmarks/<date>/` in the app's data folder, with a click to show them in the file manager: `<model>.md` and `.json` (every raw answer and thinking, the checks, the speeds), `sections/<section>.md` (every model's answer to each test of a section, side by side), `summary.md` and `summary.json` (the models, the best for each section, what it suggests for the Dynamic packs, and which sections rank the models alike and could be dropped from a later run). A run can be stopped and continued.

## What it does

- **Hardware check** at first launch: chip, RAM, NPU driver, NPU shared-memory limit. The limit has no known Windows API yet, so it is *estimated* (about half of RAM) unless you type the number from Task Manager in Settings. The UI says which one it is.
- **Catalog + any Hugging Face model.** Search or paste a repo. The app lists files, picks the quant (Q4_0, then Q8_0 for <4B, then MXFP4 for MoE, K-quants last and hidden by default), reads only the GGUF header with range requests, and shows a green / amber / red badge with reasons. Install is never blocked.
- **Memory math** from the spec: KV per token from attention layers only (hybrids are cheap), 0.9 GB overhead, safety margin, context shrunk to fit and capped at what was tested.
- **Server manager**: hidden `geniex serve`, health check, restart with backoff, halves the context after an NPU overflow, one model at a time.
- **Sampling per model family** sent explicitly on every request. Thinking shown collapsed, tok/s and time to first token.
- **Friendly errors** for every row of the spec's errors table.
- **Claude-style interface**: conversations list, serif answers, markdown with copyable code blocks, light and dark.
- **Dictation, read-aloud and live voice chat** (below).
- **Projects, artifacts, scheduled tasks, search and customization** (below).

## Explore all

Models → **Explore all** browses several sources at once, and the search box above it understands whatever you paste.

**The search box.** A model link, a command or an id opens that model and judges it; anything else (a name, a link to something that is not a model) searches every source. These all work: `unsloth/Qwen3-4B-GGUF`, `huggingface.co/…/blob/main/x-Q8_0.gguf`, `hf.co/org/repo:Q4_0`, `ollama run hf.co/org/repo`, `geniex pull …`, `docker.io/ai/gemma3`, `docker model pull ai/qwen3:8B-Q4_0`, `hub.docker.com/r/ai/qwen3`, `modelscope.cn/models/org/name`, `ai-hub-models/Qwen3-4B`. An Ollama link cannot be pulled by GenieX, so it becomes a search for the same name.

**Sources** (boxes you tick):
- *Native NPU bundles*: Qualcomm AI Hub bundles from `geniex model list`, always first, NPU only. The output format of that command is not documented, so only `ai-hub-models/<name>` identifiers are read.
- *Hugging Face*: GGUF repos, one list request per page (architecture, parameter count and file names come with it, nothing is downloaded to judge a repo). "Look further" scans 100 more each time, 1000 at most.
- *Docker Hub*: the `ai/` namespace. The size and quant are in the version (tag, e.g. `8B-Q4_0`), so a row opens its versions with their real sizes.
- *ModelScope*: paste a link; there is no listing (no list API verified), and the size is estimated from the name.

**Boxes instead of a hidden filter.** *Quant*: Q4_0 (default, best on Hexagon), other 4-bit (may use the CPU), 8-bit and up. *Show*: should run (green), caution (amber), unlikely or unknown (red). Tick "unlikely or unknown" and everything appears; any model can be installed whatever its badge says. Order: most downloaded, trending, most liked, recently updated (popularity only; benchmark scores on model cards are not used).

**What counts as "known to run"** is broader than the models tested: besides the measured families, the other llama.cpp transformer families (Gemma, Phi, OLMo, GLM-4, SmolLM3, EXAONE, StarCoder2…) are expected to work (green, "not measured here"), and hybrid or unusual layers (Nemotron-H, Gemma 3n, RWKV, DeepSeek MLA) are amber.

Estimates are made at a short context; **Check and install** gives the exact verdict (for Hugging Face it reads the real GGUF header). The Hugging Face, Docker Hub and ModelScope response shapes were written from their documentation and are covered by fixture tests, but were not run against the live services. How GenieX takes a precision for Docker Hub and ModelScope pulls is also unverified (Hugging Face is pinned as `repo:Q4_0`; Docker uses the tag; ModelScope is asked for `:Q4_0`).

## Workspace

Sidebar: New chat, Search, Projects, Artifacts, Scheduled tasks, Customize.

- **Projects**: a name, standing instructions and knowledge files (text, markdown, code, CSV, JSON, or pasted notes). Every chat started inside a project sends its instructions and knowledge as the system prompt. Knowledge may use about a third of the model's context window; a meter shows how much, and larger files are cut to a fair share rather than overflowing the NPU context.
- **Artifacts**: the assistant is told how to create them on demand (`<artifact type="html|svg|markdown|code">`). They open in a side panel with Preview / Code, are saved in the Artifacts library, and can be exported to a file. HTML previews run in a sandboxed frame whose own CSP blocks every network request (`src/renderer/public/artifact-frame.html`). Artifact bodies are never read aloud.
- **Scheduled tasks**: a prompt (optionally inside a project, on a chosen model) that runs once, every N minutes/hours, daily or on chosen weekdays. The main process runs them one at a time, waits while you are chatting (the NPU holds one model), keeps the last 20 results, files any artifacts they create and sends a desktop notification. A run missed while the app was closed happens once on the next start. With active tasks, closing the window hides the app in the system tray so they keep firing; Quit from the tray menu.
- **Search** across chats, projects, artifacts and tasks. **Customize**: personal instructions added to every chat and task.

Data lives in the app's user-data folder (`projects.json`, `artifacts.json`, `tasks.json`); chats stay in the renderer's local storage as before.

## Model menu, files, sub-agents, context meter

- **Capability badges**: small icons on every model card and in the model menu: Thinking, Vision, Code, MoE, long context (32K+), Native NPU. They come from the name, architecture and catalog entry (`src/core/capabilities.ts`), so they are a guide, not a probe.
- **Model menu** (click the model name in the composer): switch between installed models, set the **thinking level** (Off / Low / Medium / High), toggle **sub-agents**, or jump to More models. Digits 1-9 pick a model. The row only shows for models that can think (`src/core/effort.ts` decides from the name): *toggle* models (Qwen3, Nemotron…) get Off to High, *always-thinking* releases (Thinking / Reasoning) get Low to High, others show "Not a thinking model". Off is a hard switch (`chat_template_kwargs.enable_thinking=false`, `reasoning_effort`, Qwen3 `/no_think`); Low and High are a nudge in the system prompt plus `reasoning_effort`. Whether GenieX honors these fields is untested.
- **+ button, drag and drop, paste**: text, code, CSV, JSON and similar files are put in the message (cut to a third of the context, shared fairly). Images are sent in OpenAI `image_url` format but only when the model looks like a vision model (VL, Vision, Gemma 3…); none of the built-in catalog models are, so the app says so instead of pretending. PDFs are refused for now.
- **Sub-agents**: the model (or you: "use 3 sub-agents to…") writes `<subagent name="…">task</subagent>` blocks; each runs as its own completion with a fresh context, **one after another** (the NPU holds one model), at Low thinking, then the results go back to the model for the final answer (max 6 per round, 3 rounds). They show as expandable cards. A small model may not use the format on its own.
- **Context meter** in the composer: live percentage of the context window used by the system prompt, project knowledge, the whole chat, the draft and attached files (estimated at 3.5 characters per token; images count 800). Turns amber at 70 %, red at 90 %.

## Building by steps (automatic, no setting)

A request that needs files does not run in the chat session. The conversation stays light; the code is written by short sessions of their own, one after another (the NPU holds one model). Nothing to switch on: a greeting or a question goes the usual way, a job on files goes through this (`src/core/build.ts`).

1. **Plan** (a clean session that never sees code): reads the request, a few lines of recent talk with the files reduced to stubs, and a map of the files that exist (names, sizes, ids/classes/functions). It answers with the files to write (`new`) or change (`edit`), a one-line job each, and a **design brief** (palette, mood, fonts, motion) that every later session receives so a site looks like one site. A question gets `Mode: answer` plus the files or landmarks to show the chat model.
2. **New files, in parts.** A web site is `index.html`, `style.css`, `script.js` (more pages if asked), written in that order. A file that is too big for one session is cut by an outline session into parts (head and hero, one per section, footer; CSS variables then one block per section, animations, responsive; JS by feature). Each part is a session of its own and sees only: its job, the design brief, the **names that exist** (ids, classes, CSS variables, functions, never the markup) and the last lines already written. Its size is bounded by the model's context (`partBudget`: at most 9000 characters, 60 % of half the window), so a session never grows with the site. A page whose last part forgot to close it is closed. Files are put together as they stream, so the preview builds up live.
3. **Changes, targeted first.** An existing file is never rewritten first: a small file is shown whole, a long one by its map and the lines a locator session picks; the editor answers with SEARCH/REPLACE blocks. If the old lines were copied wrong it is told once. Only then is the whole file rewritten by a session that has just that file. An answer then holds only the files that changed (with the changed lines under "Show the code").
4. **The chat session explains.** It gets a report (files written/changed, failures) and the conversation with files as one-line stubs, and answers in the user's language in a few sentences. If the plan, a step or the planner fails, the usual answer path takes over; a file that fails is reported, the others are kept.

The check, the review model and Auto-improve still run afterwards on the files of the answer.

**Several files, one page.** `<link rel="stylesheet" href="style.css">` and `<script src="script.js">` are resolved from the files written in the same chat (`src/core/bundle.ts`): the preview and the code check run the page with them inlined (a `defer` or module script moves to the end of the body), errors are reported against `script.js:12`, not against the combined page, a link to a file nobody wrote is an error, and checking a stylesheet or script runs the page that links it. Opening a CSS or JS file shows the page preview too.

**Not tested here:** a real model following the plan format (small models may ignore it; a web request then still gets the default three files), the quality of parts written by small models, and the added time of the extra sessions on a real NPU. The sessions are covered by tests with a scripted model, including that no session's prompt exceeds a 4k-token window however large the project is.

## Code check and review model

After an answer with artifacts, Open NPU runs what the model wrote before you look at it (Settings → Code check; on by default, chats only, not scheduled tasks):

- **HTML pages** load in a hidden window with the same no-network CSP as the preview. It presses the usual game keys (arrows, WASD, space, Enter) and clicks every button, then collects uncaught errors, unhandled promise rejections, `console.error`, blocked external resources (CDN scripts) and `eval`, or a blank page. Line numbers are those of the artifact. A page that freezes is reported as frozen.
- **JavaScript** is parsed with Node's `vm`; **Python** with `ast.parse` if a `python` is on the PATH (otherwise not checked). Other files are not checked.
- **Review model** (optional, a bigger and slower installed model): it reads the code and the errors and answers `LGTM` or SEARCH/REPLACE edit blocks (or a whole file if it is badly broken). The edits are applied to the artifact, the code runs again, up to 1-3 rounds. The NPU holds one model, so the reviewer is loaded after the answer is written and the writer is brought back for the next message.
- **No review model**: if the run found errors, the writing model gets them back and rewrites the file itself.

- **Screenshot and observations**: the page is captured at the end of the run (small JPEG, shown in the card) and canvases are fingerprinted at load, after the keys and after the clicks, so "nothing ever moves" or "the canvas is empty" reaches the reviewer as text. A review model that can see images (VL / vision) also gets the screenshot.

**Fixing by editing.** The model is told to answer a "fix this" with SEARCH/REPLACE edit blocks naming the file, not with the whole file. Open NPU applies them to the newest version of the file from the chat and puts the corrected file in the answer (the "Code check" card says what was edited). Edits that do not match the file exactly are not guessed at: the model is asked for the whole file instead. Older versions of a file in the chat history are replaced by a short note before each request, so a long session does not fill the context with copies of the same code.

The result shows as a "Code check" card under the answer, and the artifact in the side panel is updated in place. The chat stays busy until the check is over; Stop cancels it.

## Smart functions, web search and auto-improve

The **sliders button** next to the model name opens all of the model's smart functions, one switch each: thinking level, sub-agents, code check, web search, auto-improve. The ones that are on show as small icons on the button.

- **Web search.** The model writes `<websearch>keywords</websearch>` (up to 3 per round), Open NPU searches, reads the opening text of the two best pages and hands numbered results back; the answer cites the numbers. Results come back inside `<search_results>` marked as untrusted web text, and only public http(s) pages are fetched (no localhost, private ranges or `file:`). Engines (Settings → Web search): DuckDuckGo (no key, scraped HTML page, may be limited or change), Brave Search (API key) or your own SearXNG (json format on). Small models rarely ask for a search, so **Search for every message** searches the question before answering. An optional **search model** reads the pages and keeps only the facts (it is loaded for each search, the writer comes back after).
- **Auto-improve.** After the first answer with files, rounds repeat: a clean context with the request, the direction you typed, the list of improvements already made and the newest code; the model makes ONE new improvement as edit blocks; the result is run (same check as the code check) and kept only if it runs without errors (two tries to fix, otherwise the round is thrown away, so the file never gets worse). It stops at the round limit, the time limit (until a clock time shown on the card), when the file outgrows the context, after three failed rounds in a row, or on Stop. Each kept round is saved to the Artifacts library as it happens, the PC is kept from sleeping while it runs, and a notification says when it is done. The code check and review model then run once on the final result.

**Context safety.** The context meter counts code denser than prose (about 2.8 characters per token instead of 3.5). Before every request the conversation is fitted to the model's window: old versions of a file are replaced by a note, then the files move to the end of the request in their newest version only, then the oldest turns are left out, and a notice says what was done. The answer limit is cut to the room that is left, and an answer cut off by the limit (finish "length") is continued from where it stopped, up to three times, as one stream, the repeated tail removed. If it still ends cut, the message says so.

## Voice

Speech runs in a separate worker process through `sherpa-onnx-node` (native `win-arm64` package exists), so a speech crash cannot take the chat server down.

| Role | Default | Alternatives |
|---|---|---|
| Dictation | Whisper base (multilingual, incl. French) | Whisper tiny/small, Moonshine tiny/base (English), Parakeet TDT 0.6B v3 |
| Read-aloud | Kokoro int8 multilingual | Kokoro en v0.19, Piper (FR, EN) |

Each of chat, dictation and read-aloud has its own **CPU / NPU switch** in Settings. A bar shows the total NPU memory of everything switched to the NPU against the safe limit, with advice when it does not fit, and the chat model's budget shrinks by what the voice models take. A voice model that cannot start on the NPU falls back to the CPU and says so.

Voice chat: energy VAD on the mic, utterance → transcription → chat → answer spoken sentence by sentence while it streams; speaking over it interrupts (toggle in Settings).

## Run

```
npm install            # on the Windows ARM64 machine
npm start
npm test
npm run dist           # NSIS installer, arm64 only
```
Cross-installing from another OS: `npm run install:arm64` so the `sherpa-onnx-win-arm64` native package is fetched.
`npm run dev:renderer` opens the UI in a browser with a mock bridge (no GenieX, no models).

**First launch installs what is missing.** Double-click the app: a setup screen downloads Qualcomm's GenieX installer (`geniex-cli.exe`, from the AI Hub docs) and runs it, then downloads the default dictation (Whisper base) and read-aloud (Kokoro) models, with progress, Retry and Skip. GenieX itself is not bundled (Qualcomm libraries under their own terms). The speech runtime (`sherpa-onnx` 1.13.8, native win-arm64) is bundled.

## Tested here, and what was not

Tested on Linux x64 in a sandbox: 66+ unit and integration tests (memory math against the spec's measured numbers, GGUF parsing, quant choice, verdicts, errors, sampling, server manager against a fake `geniex`, streaming and `<think>` splitting, HF inspection with a fake network, VAD, sentence chunking, speech configs, NPU budget, the voice worker over real IPC with a fake speech backend) and the UI rendered in a browser with a mock bridge.

**Not tested, needs your laptop:** installing the Dynamic bundles and switching models on the NPU (the repos and Q4_0 files were checked on Hugging Face, the speeds of the 8B and 14B models are estimates), opening a site in the browser, the preview following `location.href` between pages; the tray behaviour, desktop notifications and the save dialog for artifacts; a real model following the artifact format (small models may ignore it, or forget the closing tag, in which case the artifact stays in "writing" state); the Electron shell on Windows ARM64; real GenieX (the output formats of `geniex list` and `geniex pull` progress are guesses and parsed defensively); the PowerShell hardware and NPU counters; the NPU memory limit source; **any real speech inference** (no models could be downloaded in the sandbox; model archive names and the extracted file layouts follow the sherpa-onnx release pages from memory); Kokoro speed on your CPU; whether `provider: "qnn"` works with the sherpa-onnx build for these models (Whisper and Kokoro have dynamic shapes, which the Hexagon backend often rejects, so expect the CPU fallback); microphone capture, echo cancellation and barge-in with speakers; the installer; and the first-launch GenieX install: the installer URL comes from a web search of Qualcomm's docs and could not be downloaded here, its flags and install folder are unknown, so Open NPU runs it with no flags and then looks for `geniex.exe` in the paths it printed, `%LOCALAPPDATA%\GenieX CLI` and PATH.

## Deviations from the spec

Electron instead of Tauri (no Rust toolchain on ARM64 to verify, simpler native addon); plain CSS instead of Tailwind. Ranking by Artificial Analysis, the built-in benchmark, driver watcher and community results are "later" in the spec and not built.
