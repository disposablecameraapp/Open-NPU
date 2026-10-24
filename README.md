# Open NPU

One-click Windows on Snapdragon app: install any model, see before installing whether it will run on the Hexagon NPU, then chat by text or by voice. It drives Qualcomm's **GenieX** CLI and its OpenAI-compatible server; it does not reimplement inference. Built from the *Open NPU — Build Spec*.

**Native ARM64 only.** The NPU runtime needs it: the installer targets `win32 arm64`, the app refuses to call itself healthy when it detects an emulated x64 build on an ARM64 machine, and GenieX is only ever used through its CLI (never the x64 Python package, never in-process).

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

## Workspace

Sidebar: New chat, Search, Projects, Artifacts, Scheduled tasks, Customize.

- **Projects**: a name, standing instructions and knowledge files (text, markdown, code, CSV, JSON, or pasted notes). Every chat started inside a project sends its instructions and knowledge as the system prompt. Knowledge may use about a third of the model's context window; a meter shows how much, and larger files are cut to a fair share rather than overflowing the NPU context.
- **Artifacts**: the assistant is told how to create them on demand (`<artifact type="html|svg|markdown|code">`). They open in a side panel with Preview / Code, are saved in the Artifacts library, and can be exported to a file. HTML previews run in a sandboxed frame whose own CSP blocks every network request (`src/renderer/public/artifact-frame.html`). Artifact bodies are never read aloud.
- **Scheduled tasks**: a prompt (optionally inside a project, on a chosen model) that runs once, every N minutes/hours, daily or on chosen weekdays. The main process runs them one at a time, waits while you are chatting (the NPU holds one model), keeps the last 20 results, files any artifacts they create and sends a desktop notification. A run missed while the app was closed happens once on the next start. With active tasks, closing the window hides the app in the system tray so they keep firing; Quit from the tray menu.
- **Search** across chats, projects, artifacts and tasks. **Customize**: personal instructions added to every chat and task.

Data lives in the app's user-data folder (`projects.json`, `artifacts.json`, `tasks.json`); chats stay in the renderer's local storage as before.

## Model menu, files, sub-agents, context meter

- **Model menu** (click the model name in the composer): switch between installed models, set the **thinking level** (Off / Low / Medium / High), toggle **sub-agents**, or jump to More models. Digits 1-9 pick a model. The row only shows for models that can think (`src/core/effort.ts` decides from the name): *toggle* models (Qwen3, Nemotron…) get Off to High, *always-thinking* releases (Thinking / Reasoning) get Low to High, others show "Not a thinking model". Off is a hard switch (`chat_template_kwargs.enable_thinking=false`, `reasoning_effort`, Qwen3 `/no_think`); Low and High are a nudge in the system prompt plus `reasoning_effort`. Whether GenieX honors these fields is untested.
- **+ button, drag and drop, paste**: text, code, CSV, JSON and similar files are put in the message (cut to a third of the context, shared fairly). Images are sent in OpenAI `image_url` format but only when the model looks like a vision model (VL, Vision, Gemma 3…); none of the built-in catalog models are, so the app says so instead of pretending. PDFs are refused for now.
- **Sub-agents**: the model (or you: "use 3 sub-agents to…") writes `<subagent name="…">task</subagent>` blocks; each runs as its own completion with a fresh context, **one after another** (the NPU holds one model), at Low thinking, then the results go back to the model for the final answer (max 6 per round, 3 rounds). They show as expandable cards. A small model may not use the format on its own.
- **Context meter** in the composer: live percentage of the context window used by the system prompt, project knowledge, the whole chat, the draft and attached files (estimated at 3.5 characters per token; images count 800). Turns amber at 70 %, red at 90 %.

## Code check and review model

After an answer with artifacts, Open NPU runs what the model wrote before you look at it (Settings → Code check; on by default, chats only, not scheduled tasks):

- **HTML pages** load in a hidden window with the same no-network CSP as the preview. It presses the usual game keys (arrows, WASD, space, Enter) and clicks every button, then collects uncaught errors, unhandled promise rejections, `console.error`, blocked external resources (CDN scripts) and `eval`, or a blank page. Line numbers are those of the artifact. A page that freezes is reported as frozen.
- **JavaScript** is parsed with Node's `vm`; **Python** with `ast.parse` if a `python` is on the PATH (otherwise not checked). Other files are not checked.
- **Review model** (optional, a bigger and slower installed model): it reads the code and the errors and answers `LGTM` or SEARCH/REPLACE edit blocks (or a whole file if it is badly broken). The edits are applied to the artifact, the code runs again, up to 1-3 rounds. The NPU holds one model, so the reviewer is loaded after the answer is written and the writer is brought back for the next message.
- **No review model**: if the run found errors, the writing model gets them back and rewrites the file itself.

- **Screenshot and observations**: the page is captured at the end of the run (small JPEG, shown in the card) and canvases are fingerprinted at load, after the keys and after the clicks, so "nothing ever moves" or "the canvas is empty" reaches the reviewer as text. A review model that can see images (VL / vision) also gets the screenshot.

**Fixing by editing.** The model is told to answer a "fix this" with SEARCH/REPLACE edit blocks naming the file, not with the whole file. Open NPU applies them to the newest version of the file from the chat and puts the corrected file in the answer (the "Code check" card says what was edited). Edits that do not match the file exactly are not guessed at: the model is asked for the whole file instead. Older versions of a file in the chat history are replaced by a short note before each request, so a long session does not fill the context with copies of the same code.

The result shows as a "Code check" card under the answer, and the artifact in the side panel is updated in place. The chat stays busy until the check is over; Stop cancels it.

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

**Not tested, needs your laptop:** the tray behaviour, desktop notifications and the save dialog for artifacts; a real model following the artifact format (small models may ignore it, or forget the closing tag, in which case the artifact stays in "writing" state); the Electron shell on Windows ARM64; real GenieX (the output formats of `geniex list` and `geniex pull` progress are guesses and parsed defensively); the PowerShell hardware and NPU counters; the NPU memory limit source; **any real speech inference** (no models could be downloaded in the sandbox; model archive names and the extracted file layouts follow the sherpa-onnx release pages from memory); Kokoro speed on your CPU; whether `provider: "qnn"` works with the sherpa-onnx build for these models (Whisper and Kokoro have dynamic shapes, which the Hexagon backend often rejects, so expect the CPU fallback); microphone capture, echo cancellation and barge-in with speakers; the installer; and the first-launch GenieX install: the installer URL comes from a web search of Qualcomm's docs and could not be downloaded here, its flags and install folder are unknown, so Open NPU runs it with no flags and then looks for `geniex.exe` in the paths it printed, `%LOCALAPPDATA%\GenieX CLI` and PATH.

## Deviations from the spec

Electron instead of Tauri (no Rust toolchain on ARM64 to verify, simpler native addon); plain CSS instead of Tailwind. Ranking by Artificial Analysis, the built-in benchmark, driver watcher and community results are "later" in the spec and not built.
