# Prompt de recherche approfondie: trouver des modèles meilleurs que ceux d'Open-NPU

Copier-coller tout ce qui suit dans l'outil de recherche approfondie.

---

## Mission

Tu fais une recherche exhaustive, sans limite de temps ni de nombre de sources, pour trouver **les meilleurs petits modèles de langage locaux (jusqu'à environ 14B, puis 24B) capables de battre ceux que nous avons déjà**, catégorie par catégorie. Je refuse de croire que tout se résume à deux ou trois modèles (la famille Qwen) qui font tout. Je veux la vraie compétition: des modèles que nous n'avons pas vus, ou que nous avons mal testés.

Cherche **partout**, dans toutes les langues utiles (anglais d'abord, mais aussi français, chinois, japonais, russe, espagnol):
- Reddit: r/LocalLLaMA, r/LocalLLM, r/ollama, r/SillyTavern, r/MachineLearning, r/ArtificialInteligence, r/Snapdragon et r/WindowsOnARM (Snapdragon X, NPU, Copilot+ PC)
- Hugging Face: pages de modèles, discussions et commentaires, Open LLM Leaderboard, Spaces de classement, collections, modèles tendance, modèles récents (trier par date), datasets d'évaluation
- Classements indépendants: LMArena (par catégorie, par langue), Artificial Analysis, LiveBench, LiveCodeBench, BigCodeBench, EvalPlus, Aider, SWE-bench, MMLU-Pro, GPQA, IFEval, IFBench, MuSR, BFCL (appels de fonctions), Vectara (hallucinations), EQ-Bench (écriture créative), Creative Writing v3, MT-Bench, OpenCompass, C-Eval, Open Ko/FR/DE leaderboards, MTEB si utile, AA-Omniscience, SimpleQA, FACTS
- Forums et communautés: Hacker News, X/Twitter (chercheurs, Unsloth, bartowski, LiquidAI, Qwen team), Discord (LocalLLaMA, Unsloth, llama.cpp), GitHub (issues et discussions de llama.cpp, Qualcomm AI Hub, GenieX, ONNX Runtime GenAI, MLC, Ollama), LessWrong, Lobste.rs, Medium, Substack, YouTube (benchmarks de petits modèles), blogs de Qualcomm, Microsoft (Phi, Foundry Local, Windows AI), Google (Gemma), Meta, Mistral, NVIDIA, IBM (Granite), AllenAI (OLMo), HuggingFace (SmolLM), Liquid AI, Alibaba (Qwen), Tencent (Hunyuan), Baidu (ERNIE), ByteDance (Seed), Xiaomi (MiMo), Zhipu (GLM), DeepSeek, Moonshot (Kimi), StepFun, OpenBMB (MiniCPM), InternLM, 01.AI, LG (EXAONE), Naver, Upstage, Swiss AI (Apertus), EuroLLM, OpenEuroLLM, Mistral, Cohere (Aya), TII (Falcon), Reka, Essential AI, Arcee, Nous (Hermes), Jan, Menlo, Prime Intellect, Nanbeige, Kwaipilot, Moondream, etc.
- Articles scientifiques récents (arXiv, tech reports de modèles sortis depuis janvier 2026) et listes "awesome" sur GitHub
- Tout ce qui est sorti **après** mon dernier point de connaissance: vérifie les sorties des derniers mois, ne te fie pas à ta mémoire.

Cherche aussi les **fine-tunes et merges** de la communauté (distillations, versions "abliterated" non utiles ici, mais surtout versions améliorées pour le code, le français, l'écriture, le raisonnement, les appels d'outils), les **modèles MoE** (peu de paramètres actifs, donc rapides, mais lourds en mémoire), et les **modèles hybrides** (Mamba/SSM, LFM2, Granite-H, Falcon-H1, Nemotron-H) qui sont rapides sur peu de mémoire.

## Contraintes techniques (à respecter pour qu'un modèle soit utilisable)

- Matériel: PC portables Snapdragon X (Elite/Plus) avec NPU Hexagon. Le NPU peut utiliser **environ la moitié de la RAM**: 16 Go de RAM → 8 Go de NPU, 24 Go → 12 Go, 32 Go → 16 Go. Il y a donc trois tailles de "pack": Flash (le plus petit, instantané), Flux (raisonnable), Forge (le plus gros que le NPU tient). Selon la RAM: 16 Go → 2B/4B/9B, 24 Go → 4B/9B/14B, 32 Go → 9B/14B/24B.
- Format: **GGUF en Q4_0** (le runtime NPU/GenieX/llama.cpp utilise le Q4_0; indique si un autre quant fonctionne). Le fichier Q4_0 doit rentrer dans la taille du pack avec de la place pour le contexte.
- Vitesse: mesurée chez nous entre 8 et 53 tokens/s sur des modèles de 0,7 à 5,5 Go. Environ 37 Go/s de bande passante mémoire, donc vitesse ≈ 37 ÷ taille du fichier en Go.
- Une seule instance chargée à la fois sur le NPU: on change de modèle seulement quand le type de tâche change.
- **Important**: 56 des 89 modèles de notre premier banc d'essai ne se sont **pas chargés** (voir liste plus bas), y compris des modèles petits (Phi-4-mini, Llama-3.2-3B, Gemma-4-E4B, SmolLM3). On ne sait donc pas s'ils sont mauvais ou si c'est notre runtime qui ne supporte pas leur architecture. **Cherche quelles architectures le runtime GenieX / llama.cpp avec backend NPU Hexagon / Qualcomm AI Hub supporte vraiment** et lesquelles échouent (Llama, Phi3, Gemma2/3/4, Granite, OLMo, Mamba-hybrides, MoE...), et pourquoi. Un modèle excellent mais non supporté est inutile; un modèle supporté et bon est précieux.

## Les 19 catégories pour lesquelles je veux le meilleur modèle

Pour chaque taille de pack (≈2B, ≈4B, ≈9B, ≈14B, ≈24B), je veux le meilleur modèle et 1-2 challengers pour:
1. Pages web et jeux (HTML/CSS/JS, canvas)
2. Python, scripts, shell, SQL, regex
3. Réparation de code (erreurs, tracebacks)
4. Explication / relecture de code
5. Planification (décomposer une tâche)
6. Sortie structurée et appels d'outils (JSON, schémas, extraction, function calling)
7. Maths
8. Raisonnement et logique
9. Connaissances factuelles **sans inventer** (c'est un point faible de Gemma et Ministral dans nos tests: ils inventent un faux traité)
10. Suivi strict de consignes (formats, longueurs, contraintes)
11. Conversation
12. Écriture créative (poèmes avec rimes, histoires, jeu de rôle)
13. Écriture naturelle (mails, lettres, en français et en anglais)
14. Résumé et réécriture
15. **Français** et traduction vers/depuis le français
16. Autres langues (espagnol, allemand, italien, chinois, japonais, arabe...)
17. Documents longs (retrouver une info dans un long texte; contexte réel utilisable, pas juste annoncé)
18. Vision (images, captures d'écran, OCR, graphiques)
19. Réponses rapides (salutations, titres, une ligne)

## Ce que nous avons déjà trouvé et testé (ne pas me les redonner comme "découverte", mais dis-moi s'ils sont toujours les meilleurs de leur catégorie ou s'il y a mieux)

**Testés avec succès (score global /100 sur notre banc, vitesse en tokens/s sur NPU):**
Qwen3.5-4B (95, 13,7) · Qwen3-4B-Instruct-2507 (94, 15,4) · Qwen3-8B (94, 9,3) · Ministral 3 8B Reasoning (92, 8,7) · Qwen3.5-9B (92, 8,2) · Gemma-4-E2B-it (88, 17) · Qwen3-4B-Thinking-2507 (88, partiel, trop long) · Gemma-3-4B-it (87, 16,1) · Qwen2.5-Coder-3B-Instruct (86, 20,7) · LFM2-2.6B-Transcript (83, 25,8) · LFM2-1.2B-Tool (83, 53) · Ministral-8B-Instruct-2410 (83, 9,4) · GLM-4-9B-0414 (83, 8) · MiMo-V2.6-Distill-Qwen-9B (82, 8,2) · Qwen3-1.7B natif NPU (82, 41,8) · Qwen3.5-2B (82, 28) · Nemotron-3-Nano-4B (78, 10,3, NPU+CPU) · LFM2-1.2B-RAG (77, 53) · Qwen2.5-Coder-1.5B-Instruct (77, 37,7) · Qwen2.5-1.5B-Instruct (76, 37,6) · LFM2.5-1.2B-Instruct (76, 53) · Gemma-3-1B-it (75, 46,8) · Arch-Function-3B (74, 20) · LFM2.5-1.2B-Thinking (66, 53) · xLAM-2-3B-fc-r (55, 20) · LFM2.5-2.6B (54, 25) · LFM2.5-8B-A1B (43, 31,6) · EXAONE-4.0-1.2B (31) · LFM2-1.2B-Extract (29) · DeepScaleR-1.5B-Preview (14) · VibeThinker-3B (3).

**Pas chargés / pas testés (peut-être bons, inconnus):**
Qwen3-4B (custom), Qwen3-1.7B (custom), Dolphin3-Cyber-8B, Qwen2.5-Coder-7B-Instruct (pas assez de mémoire NPU sur le PC de test), Apertus-8B-Instruct, Aya-Expanse-8B, DeepSeek-R1-0528-Qwen3-8B, EuroLLM-9B-Instruct, EXAONE-Deep-7.8B, Falcon-H1R-7B, Falcon3-7B-Instruct, Gemma-2-9B-it, Gemma-2-9B-it-SPPO-Iter3, Gemma-4-E4B-it, Granite-4.0-H-Tiny, Granite-4.2-8B, Hermes-3-Llama-3.1-8B, Hunyuan-4B-Instruct, Hunyuan-7B-Instruct, Hunyuan-MT-7B, II-Medical-8B, InternLM3-8B-Instruct, Jan-code-4B, Jan-nano-128k, Jan-v1-4B, Llama-3-8B-Instruct-Finance-RAG, Llama-3-Groq-8B-Tool-Use, Llama-3.1-8B-Instruct, Llama-3.2-3B-Instruct, Llama-xLAM-2-8B-fc-r, LongWriter-Llama3.1-8B, MedGemma-4B-it, MiniCPM4.1-8B, MiniCPM5-2B, Ministral-3-3B-Instruct, Ministral-3-3B-Reasoning, Ministral-3-8B-Instruct, Nemotron-3.5-Bolt-E4B, Nemotron-Nano-9B-v2, NuExtract-v1.5, NuExtract3, Olmo-3-7B-Instruct, Olmo-3-7B-Think, OpenCoder-8B-Instruct, Osmosis-Apply-1.7B (téléchargement échoué), Phi-4-mini-instruct, Phi-4-mini-reasoning, Qwen2.5-7B-Instruct, Qwen2.5-7B-Instruct-1M, Salamandra-7B-Instruct, Seed-Coder-8B-Instruct, Seed-Coder-8B-Reasoning, Seed-X-PPO-7B, SmolLM3-3B, Tiny-Aya-Global, TranslateGemma-4B-it, TwIL-LM3, Yi-Coder-9B-Chat.

**Choisis actuellement pour les packs 14B et 24B (jamais testés par nous):** Qwen2.5-Coder-14B-Instruct, Qwen3-14B, Phi-4, Gemma-3-12B-it (14B); Devstral-Small-2507, Mistral-Small-3.2-24B-Instruct, GPT-OSS-20B (24B). Ces deux packs sont les plus ouverts: dis-moi s'il existe de bien meilleurs modèles de 12 à 24B (y compris MoE comme Qwen3-30B-A3B ou GPT-OSS si leur Q4_0 tient dans 12-16 Go de NPU).

## Ce que nous avons appris de nos tests (pour éviter de refaire les mêmes erreurs)

- Nos tests sont trop faciles: 1 à 4 tests par catégorie, beaucoup de modèles à 100. Je veux que tu trouves des **évaluations indépendantes plus discriminantes**, et que tu proposes les **tests difficiles** à ajouter par catégorie.
- Les modèles Qwen3/3.5 gagnent presque partout, mais ils peuvent être sur-représentés parce qu'ils sont populaires et bien supportés. Je veux savoir si c'est mérité.
- Gemma-3/4 et Ministral inventent des faits (test "faux traité"), mais sont bons en écriture. Qwen3-1.7B échoue en traduction vers le français. LFM2-1.2B-Tool est excellent en code/JSON/traduction pour sa taille mais nul en maths/logique. Qwen2.5-Coder n'est pas meilleur que les Qwen généralistes. Les modèles qui "pensent toujours" (Thinking, Reasoning) sont trop lents pour la plupart des usages.

## Format de réponse attendu

1. **Un tableau par taille de pack** (2B, 4B, 9B, 14B, 24B): pour chaque catégorie, le modèle gagnant, 1-2 challengers, et la **source** (lien) de chaque affirmation, avec la date. Marque chaque affirmation comme *mesurée par un tiers indépendant*, *rapportée par la communauté* ou *simple impression*.
2. **Une liste de nouveaux candidats** (pas dans nos listes ci-dessus) à ajouter à notre banc d'essai, avec: nom exact, dépôt Hugging Face du GGUF Q4_0 (vérifie qu'il existe et que le fichier Q4_0 est présent), taille du fichier, nombre de paramètres (total et actifs si MoE), architecture, licence, date de sortie, contexte, vision oui/non, pense toujours/optionnel/jamais, et pourquoi il pourrait battre l'actuel.
3. **Un rapport de compatibilité**: quelles architectures tournent sur le NPU Snapdragon X via GenieX / llama.cpp / Qualcomm AI Hub, lesquelles non, et si des correctifs ou des versions plus récentes du runtime corrigent les modèles qui ne se chargent pas.
4. **Les modèles que tu écartes** et pourquoi (trop gros, licence, non supporté, mauvais en vrai malgré le buzz).
5. **Les désaccords**: quand les classements et la communauté se contredisent, montre les deux.
6. **Un niveau de confiance** par recommandation, et ce qu'il faudrait tester chez nous pour trancher.

Ne t'arrête pas aux 10 premiers résultats de chaque recherche. Continue jusqu'à ce que de nouvelles recherches ne trouvent plus rien de nouveau. Vérifie les dates: je veux ce qui est le plus récent et le meilleur **aujourd'hui** (octobre 2026).
