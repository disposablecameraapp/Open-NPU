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

**Not tested, needs your laptop:** the Electron shell on Windows ARM64; real GenieX (the output formats of `geniex list` and `geniex pull` progress are guesses and parsed defensively); the PowerShell hardware and NPU counters; the NPU memory limit source; **any real speech inference** (no models could be downloaded in the sandbox; model archive names and the extracted file layouts follow the sherpa-onnx release pages from memory); Kokoro speed on your CPU; whether `provider: "qnn"` works with the sherpa-onnx build for these models (Whisper and Kokoro have dynamic shapes, which the Hexagon backend often rejects, so expect the CPU fallback); microphone capture, echo cancellation and barge-in with speakers; the installer; and the first-launch GenieX install: the installer URL comes from a web search of Qualcomm's docs and could not be downloaded here, its flags and install folder are unknown, so Open NPU runs it with no flags and then looks for `geniex.exe` in the paths it printed, `%LOCALAPPDATA%\GenieX CLI` and PATH.

## Deviations from the spec

Electron instead of Tauri (no Rust toolchain on ARM64 to verify, simpler native addon); plain CSS instead of Tailwind. Ranking by Artificial Analysis, the built-in benchmark, driver watcher and community results are "later" in the spec and not built.
