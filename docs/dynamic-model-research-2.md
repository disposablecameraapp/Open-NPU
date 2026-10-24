# Dynamic model: second research pass (read from the user's document)

Source: a French report ("Architecture d'Inférence Locale Dynamic sur NPU Qualcomm Snapdragon X", October 2026) produced by another AI with browsing, supplied by the user. This note records what Open NPU took from it and what it did not. The report's own numbers were not re-checked against the leaderboards from this sandbox (they are unreachable here), so treat them as claims with URLs to verify.

## Taken

- **Vectara hallucination leaderboard** (summarisation fidelity, a real independent measure): Qwen3-4B 5.7%, Qwen3-8B 4.8%, Phi-4 3.7%, Gemma-3-12B 4.4%; the newer Qwen3.5 models are clearly worse (27B 12.1%, 35B-A3B 10.5%). Reasoning-trained models infer beyond the source text, so summaries and fact questions go to a Qwen3 model used without thinking.
- **Code, ≤9B**: Qwen2.5-Coder-7B-Instruct 20.3% on BigCodeBench-Hard, the best instruct model of its size listed. Old (2024), but the only independent code score at this size.
- **Weights on disk** (Q4_0): Qwen3-8B about 4.65 GB, Qwen2.5-Coder-7B 4.43 GB, Llama-3.1-8B 4.66 GB, Phi-4 14B 8.41 GB, Qwen2.5-Coder-14B 8.52 GB, Qwen2.5-Coder-32B 18.6 GB. So no dense 14B fits the 8 GB NPU budget of a 16 GB PC, and a dense 32B does not fit the 16 GB budget of a 32 GB PC.
- **"False Q4_0"**: a file named `*-q4_0.gguf` can keep embedding/output tensors in Q6_K, which the Hexagon and Adreno kernels do not run natively (partial CPU fallback). Files quantized with `llama-quantize --pure` avoid this. Not yet handled by the app; worth checking per repo.
- **Measured NPU speeds**: a June 2026 paper measured a dense 4B at 14.2 tok/s decode and 786.7 tok/s prefill on the Snapdragon X Elite NPU (QAIRT/QNN graph), matching the app's own 14.1 tok/s for Qwen3-4B-Thinking.

## Not taken

- **Proxies used as evidence**: LiveCodeBench for "maths" and "reasoning", BigCodeBench-Hard for "planning", "tool use" and "bug fixing", Vectara for "instruction following" and "French". These measure other things; the table marks such cells low confidence or leaves the class to decide.
- **"16-20 tok/s for an 8B"**: that figure comes from a 2024 llama.cpp discussion on the **CPU**. On the NPU the app measures about 8 tok/s for an 8B (Ministral 3 8B 8.1; the earlier research found Qwen3 8B at 8.0).
- **Five 8B-class models per size (about 22 GB)** as the 9B bundle: too heavy for a one-click install on a 16 GB PC. Dynamic 9B is four models (about 16 GB of files).
- **Many "not found" cells** (French, translation, creative writing, vision, code explanation, planning): no independent data, so no specialist is claimed.

## What the 9B bundle became

| Model | Class | Why |
|---|---|---|
| Qwen3-1.7B (native NPU bundle) | Flash | fastest (43 tok/s measured by the app), fully on the NPU |
| Qwen3-8B | Flux | lowest summary hallucination under 10B (Vectara) |
| Qwen2.5-Coder-7B-Instruct | Forge (code) | best BigCodeBench-Hard score at its size |
| Qwen3.5-9B | Forge (reasoning, maths, plans, long documents, images) | strongest generalist under 10B on the Artificial Analysis index (low confidence, rank flips between index versions) |

All Hugging Face repo names except the app catalog's are unchecked (the sandbox cannot reach Hugging Face). The one-click install reports a model whose repo is not found and carries on with the others.
