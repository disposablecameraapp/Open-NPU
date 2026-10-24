# Dynamic model routing: independent-evidence research

As of 2026-10-24. Machine-readable twin: `docs/dynamic-model-research.json` (same picks, evidence lists per category).

## 0. Read this first: what this report can and cannot claim

**The research sandbox could not open any leaderboard.** Its egress policy returned 403 or DNS failure for livebench.ai, lmarena.ai / arena.ai, artificialanalysis.ai, huggingface.co, arxiv.org, aider.chat, gorilla.cs.berkeley.edu, eqbench.com, openrouter.ai, aihub.qualcomm.com and docs.qualcomm.com. Only GitHub was reachable (llama.cpp docs, issues, community NPU repos).

So every leaderboard number below was read from a **search-engine summary of the page**, not from the page. Each evidence row says so. These summaries sometimes contradicted themselves (for example Qwen3.5-9B shows 32, 22 and 11 on Artificial Analysis pages, because AA re-scaled its index from v4.0 to v4.1 to v4.3). Before the routing table ships, someone with normal internet access should open the URLs in the JSON and confirm the numbers. Nothing here was estimated or invented; where I found nothing the cell says `not found`.

What this means for you: **most of the (tier, category) cells are `not found` or low-confidence proxies.** The honest finding is that independent data splits models by overall intelligence only, and almost nothing separates specialists below 14B.

## 1. Method

1. Read the repo's `catalog.json`, `fit.ts`, `memory.ts`, `browse.ts` to learn how fit is judged (usable NPU memory = budget x 0.92, weights + 0.9 GB overhead + KV cache).
2. Fetched the GitHub-hosted NPU evidence (llama.cpp Snapdragon docs, issues 26094 and 26123, discussion 21702, community repos x1e-npu, llama-cpp-hexagon-npu, snapbench, GenieX issue 1476).
3. Ran about 45 searches for independent evaluations per model and category.
4. Applied the source rule: model cards used only for parameters, architecture, licence, context and quants. Vendor-only numbers are marked "vendor-only, ignored" (details in section 8).
5. Tier file sizes are my arithmetic (params x 4.5 bits / 8) unless taken from `catalog.json`; they are flagged "estimate" in the JSON.

## 2. What runs on the NPU (Step 1)

| Fact | Evidence |
|---|---|
| Q4_0 is the supported fast path. Also on Hexagon: Q4_1, Q8_0, IQ4_NL, MXFP4, Q2_K-Q6_K. Silent CPU fallback for IQ1-IQ3, IQ4_XS, Q5_0, Q5_1, BF16. | x1e-npu README (X Elite, Linux); llama.cpp doc logs show q4_0, q8_0, mxfp4 tensors |
| Q4_K_M is not accelerated (`ggml_hexagon_supported_mul_mat` rejects Q4_K). | llama.cpp discussion 21702 |
| Memory: about 3.5 GB of address space per NPU session (docs) or about 3 GiB mappable (x1e-npu). Bigger models split across sessions (gpt-oss-20b ran on 4). | llama.cpp doc; x1e-npu |
| Decode is memory-bound at about 37 GB/s effective, so tok/s is about 37 / (weights in GiB). | x1e-npu (measured) |
| Measured, X Elite (Hexagon v73, Linux): Llama 3.2 1B Q4_0 pp 2061 / tg 50; 3B Q4_0 pp 961 / tg 21 (12.6 at 2048 context); Qwen3 8B Q3_K_M tg 8.0 only with `GGML_HEXAGON_MBUF=,256M` and 3 sessions. NPU prompt processing is 3.5-4.5x faster than CPU, decode slightly slower. | x1e-npu |
| Measured, X Elite, Windows: Qwen2.5 1.5B NPU-forced tg 17 (GPU 21). Qwen3.5-0.8B (DeltaNet) NPU-forced tg 2.0 vs 64 on CPU. "NPU advantage is power efficiency, not raw speed for sub-2B." | ara142/llama-cpp-hexagon-npu |
| AI Hub bundles on X Elite: Qwen3-1.7B 27-48 tok/s at 512 context, 14-26 at 4096. | Qualcomm Hugging Face listing (via search) |
| X2 Elite: no measured llama.cpp Hexagon figure found anywhere (only Qualcomm marketing, ignored). | search |
| Known failures: models of 4B+ abort with `dspqueue_read failed 0x2e` or buffer-mapping failure, depending on context length (cap context, smaller micro-batch, restart DSP). Issue still open. Observed on v73/v75/v81 Android and Linux boards. | llama.cpp issue 26123 |
| Qwen3.5 (DeltaNet) quantized `ssm_out` falls back to CPU when batch>1; closed "not planned" 2026-09-19. A Q4_0 output bug was fixed in #24470. | issue 26094, PyPI changelog |
| Vision on NPU via llama.cpp gave silently wrong output (Qwen3-VL); fixed in GenieX v0.9.3, not re-verified; mmproj now runs in its own HTP session. | GenieX issue 1476 |
| Windows: HTP libraries must be test-signed (Secure Boot may need to be off) unless GenieX ships them. | llama.cpp windows.md |
| QAIRT bundles above about 1.7B fail on current drivers ("Failed to map buffer"). | catalog.json; HouWritr issue 27 |
| App's own measurements (`catalog.json`): Qwen3-4B-Thinking 14.1 tok/s, Qwen3.5-4B 13.3 (CPU 68-91%), Ministral 3 8B Reasoning 8.1, LFM2.5-8B-A1B 31, Qwen3-1.7B native 43; Granite-4.2-3B crashed at startup. | repo |

## 3. Tiers and what fits (Step 2)

Usable memory = budget x 0.92; a model needs file + 0.9 GB + KV.

| Tier | Machine | Budget / usable | Largest Q4_0 that fits (est.) | Notes |
|---|---|---|---|---|
| S (<=4.5B) | 16 GB | 8 / 7.36 | anything | all fit with long contexts |
| M (<=9B) | 16 GB | 8 / 7.36 | about 11B dense | a 9B Q4_0 (5.3 GB) leaves about 1.2 GB for KV: 4-8K context |
| L (<=14B) | 24 GB | 12 / 11.04 | about 14B | Gemma 4 12B (6.8 GB) does not fit 16 GB (7.7 > 7.36) but fits here |
| XL (<=32B) | 32 GB | 16 / 14.72 | about 21B | 27B dense (about 15.5 GB) and Gemma 4 26B A4B (about 14.6 GB) do not fit; gpt-oss-20b (about 12 GB) does |
| XXL | 64 GB | 32 / 29.4 | about 50B | 27-35B at Q4_0 fit; Q8_0 27B (about 29 GB) does not leave room |

Consequence for your tier definitions: the XL tier as defined (32 GB RAM) cannot host the 27-32B class on the NPU with the app's own safety math. Those models belong to 64 GB machines.

## 4. Tier S (<=4.5B)

**Verdict: no clear specialist. Qwen3.5-4B is best at everything with data, and the data is thin.**

| Model | Q4_0 repo | NPU | Evidence summary |
|---|---|---|---|
| Qwen3.5-4B | `unsloth/Qwen3.5-4B-GGUF` (quant unverified) | likely, runs partly on CPU | AA index 27 (launch), 20 (v4.1), 13 (newer); beats Gemma 4 E4B in both versions; AA-Omniscience -57 (80% hallucination) |
| Qwen3-4B-Thinking-2507 | `unsloth/Qwen3-4B-Thinking-2507-GGUF` | works (14.1 tok/s) | older generation, Omniscience -61; best fully-on-NPU option |
| Gemma 4 E4B | not verified | unknown | AA 19 (launch) / 9 (newer); top of one same-harness paper that excluded Qwen3.5 |
| MiniCPM5-2B | vendor ships Q4_K_M, Q8_0, F16 only | likely (plain Llama architecture) | AA 23 (v4.1.1), 15 (v4.2), 12 (current); #2 in AA's <=4B bucket |
| K2 Horizon 3.7B | not verified | unknown | AA 16 on current index, #1 in <=4B bucket; new, unverified runtime |
| LFM2.5-2.6B / 1.2B | `LiquidAI/...` unverified | unknown | AA 8 / 5 |
| Granite 4.2 3B | `bartowski/granite-4.2-3b-GGUF` | broken in this app | AA ranks it below G9v3-3B in the <=4B bucket |
| Qwen3-1.7B native | AI Hub bundle | works (43 tok/s) | no independent quality score found |

Per category (see JSON for full evidence):

| Category | Best | Runner-up | Confidence | Basis |
|---|---|---|---|---|
| reasoning | Qwen3.5-4B | Gemma 4 E4B | medium | AA, two index versions agree on order |
| web_code, python_code, algorithms, math | Qwen3.5-4B | Gemma 4 E4B / Qwen3-4B-Thinking | low | general-index proxy; no coding leaderboard row exists for these sizes |
| knowledge, factuality | Qwen3.5-4B | none | low | AA-Omniscience; every small model hallucinates about 80% |
| long_context | Qwen3.5-4B | LFM2.5-8B-A1B | low | AA-LCR 56% (origin unclear); NPU context realistically 8-16K |
| vision | Qwen3.5-4B | Gemma 4 E4B | low | one personal test, 75.5 vs 58.8; NPU vision output was silently wrong |
| fast | Qwen3-1.7B native | MiniCPM5-2B | low | app-measured speed only |
| everything else | not found | | | no independent number |

Important caveat: on the **current** AA index, K2 Horizon 3.7B (16) and possibly MiniCPM5-2B (12 vs 13) sit at or above Qwen3.5-4B, and MiniCPM5-2B is a plain Llama architecture that is the safest fit for the Hexagon backend. Both deserve an in-app test before the table is final.

## 5. Tier M (<=9B), the first "Dynamic" tier

**Verdict: one generalist (Qwen3.5-9B) plus, at most, one speed/long-document model (LFM2.5-8B-A1B). Specialists add little.**

| Model | NPU | Evidence summary |
|---|---|---|
| Qwen3.5-9B | likely, partly CPU | AA 32 / 22 / 11 across index versions; "most intelligent under 10B" at launch; coding index 28.7 (aggregator); AA-LCR 70%; IFBench 66.7 (aggregator); Omniscience -56 |
| Granite 4.2 8B | unknown | AA 20 on the main page, 11 on others; vendor IFBench/BFCL ignored; 3B sibling crashed in the app |
| Ministral 3 8B Reasoning | works, 8.1 tok/s | AA lists only a non-reasoning 8B at 5; no independent score for the Reasoning model; too slow |
| LFM2.5-8B-A1B | works, 31 tok/s | AA 8; SciCode 7.8%, AA-LCR 0.0%; fast and 64K verified in the app |
| Gemma 4 12B | unknown | does not fit a 16 GB laptop |

| Category | Best | Runner-up | Confidence |
|---|---|---|---|
| reasoning, math, python/web code, algorithms | Qwen3.5-9B | Granite 4.2 8B or Gemma 4 12B | low (order flips by AA index version) |
| knowledge, factuality | Qwen3.5-9B | Qwen3.5-4B | low (82% hallucination) |
| instruction | Qwen3.5-9B | Gemma 4 E4B | low |
| long_context | Qwen3.5-9B | LFM2.5-8B-A1B (only one verified at 64K) | low |
| vision | Qwen3.5-9B | none | low (extrapolated from the 4B test) |
| fast | LFM2.5-8B-A1B | Qwen3.5-4B | medium (speed is measured) |
| summarize, chat, creative, planning, tool_use, agentic, code_repair, code_explain, translation | not found | | |

## 6. Tiers L, XL, XXL (best effort)

- **L (24 GB)**: Gemma 4 12B is the only 10-14B model with a current independent entry (AA 22 on v4.1, 14 on newer). Ministral 14B shows 30.5 on an unversioned mirror, so the two cannot be ranked. Phi-4 14B: AA says "forthcoming". All picks low.
- **XL (32 GB)**: by the app's math only **gpt-oss-20b** fits and is documented to run on Hexagon (18.4 tok/s). AA gives Gemma 4 26B A4B 26 vs gpt-oss-20b 15, so Gemma is better but does not fit (est. 14.6 + 0.9 > 14.72). Gemma 4 26B A4B has the LMArena text (1439-1441, medium) and Vectara summarisation (94.8%, medium) evidence.
- **XXL (64 GB)**: the best-evidenced tier. **Web front-end: Qwen3.8-27B** (arena.ai snapshot about 1587 and a mirror 1591.2, against Gemma 4 26B A4B at 1361.9; medium). **Reasoning: Qwen3.8-27B** (AA v4.3.2: 34 xhigh; older versions have Qwen above Gemma 4 31B; medium). **Chat: Gemma 4 31B** (LMArena text about 1451, 3rd on the board; medium). **Summarisation: Gemma 4 26B A4B / 31B** (94.8% / 92.6% vs Qwen3.5-27B 87.9%; medium). **Creative: Gemma 4 31B** (EQ-Bench Elo 1407.6 via a tracker; low). This is the only tier where two models genuinely specialise.

## 7. Contradictions, contamination, variant mismatches

- **AA index versions** (v4.0, 4.1, 4.1.1, 4.2, 4.3, 4.3.2) rescale scores heavily: MiniCPM5-2B 23, 15 and 12; Qwen3.5-9B 32, 22 and 11; Nemotron Nano 9B V2 15, 9 and 7. Only compare numbers from the same page version. Qwen3.5-9B scoring below Qwen3.5-4B (11 vs 13) on the newest version contradicts every other source and is unexplained.
- Qwen3.5-9B vs Gemma 4 12B vs Granite 4.2 8B ranks differently depending on version. I could not resolve it.
- LMArena: Qwen3.5-27B 1404 (one source) vs about 1450 "estimated" (another).
- Static benchmarks (MMLU-Pro, GPQA, AIME, HumanEval, vendor LiveCodeBench) are saturated or vendor-reported and were not used. Contamination-resistant sources I wanted (LiveBench, LiveCodeBench live, Aider, SWE-bench) produced no small-model rows at all.
- Thinking vs non-thinking: Qwen3.5 uses 230-390M tokens to run the AA index versus 16M typical, so at 13 tok/s on the NPU it will feel very slow in thinking mode. Gemma 4 E4B, Qwen3.5 and Ministral 3 Reasoning are thinking by default. Prefer non-thinking for routine requests (AA's non-reasoning Qwen3.5-4B has the lowest time-to-answer, 0.90 s).
- Variant mismatch: AA hosted-API entries use full-precision weights; the GGUF Q4_0 will score somewhat lower (a Q4_K_M study found Qwen3 0.6B lost 45 points on BFCL while 1.7B lost 2). AA lists Ministral 3 8B only as non-reasoning, not the Reasoning model the app ships. The Qwen3.5-4B catalog entry has no recorded quant.
- Hosted speed (AA tok/s) is irrelevant for the NPU; use the app's measured numbers.

## 8. Sources

Used: Artificial Analysis (via search summaries), Vectara HHEM (via mirror), LMArena/WebDev Arena (via mirrors and Wikipedia), EQ-Bench via a tracker, arXiv 2604.07035, prismix.dev vision test, llama.cpp docs and issues, x1e-npu, ara142 repo, GenieX issues, Qualcomm AI Hub listings.

Rejected or ignored: vendor cards and blogs; IBM's Granite tables reposted on benchlm and ai-tldr; aggregators that blend self-reports (benchlm, llm-stats, llmreference, aiwiki, wizwand); blog roundups; Qwen3.5-4B "BFCL 50.3" (model card); Ministral vs Qwen MMMU-Pro (unclear origin).

Unreachable (not rejected): LiveBench, LMArena/arena.ai, Hugging Face, EvalPlus, Aider, BFCL official, OpenCompass, EQ-Bench, UGI, RULER, Scale SEAL.

## 9. Gaps

No independent number was found for: tool use or BFCL on any current small model (all figures were IBM's), Aider/SWE-bench/code repair, French or any translation (AA has a French page; its rows were not visible), creative writing under 31B, summarisation under 26B, Spiral-Bench, UGI, RULER, planning, switching time, X2 Elite speeds, and any NPU report for Gemma 4, Granite 4.2 8B, Qwen3.5-9B or any 27B+ model. Also unevaluated: SmolLM3, OLMo 3, Phi-4-mini, GLM small models, DeepSeek distills (searches returned nothing independent).

## 10. Recommendation

1. **Do not ship a many-specialist table below tier XXL.** The independent evidence supports one generalist per tier and a "fast" model; claims of per-category specialists would be invented.
2. **Switching cost**: no source measured model load time. The NPU holds one model at a time within the 8 GB budget, a failed run needs a DSP restart (x1e-npu), and a 5 GB load is several seconds plus graph mapping (my estimate, unmeasured). Use a **sticky router**: stay on the loaded model unless the task is clearly in another model's lane.
3. **Models per tier**: S 1-2 (Qwen3.5-4B, optionally Qwen3-1.7B native for instant replies; NPU-only users keep Qwen3-4B-Thinking). M 2 (Qwen3.5-9B; LFM2.5-8B-A1B for long documents and speed). L 1 (Gemma 4 12B after an NPU test). XL 1 (gpt-oss-20b). XXL 2 (Qwen3.8-27B for code/reasoning, Gemma 4 31B for chat/summaries/creative).
4. **Before shipping**: (a) confirm every URL in the JSON by hand; (b) run a quick NPU test of MiniCPM5-2B, K2 Horizon 3.7B, Granite 4.2 8B, Gemma 4 E4B and Qwen3.5-9B Q4_0; (c) record Q4_0 repo names (only the catalog repos are verified; the JSON uses `null` for the rest).
