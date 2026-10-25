# Pourquoi des modèles ne se chargent pas sur le NPU, et prompt de recherche approfondie

Rédigé le 2026-10-25 à partir du premier banc d'essai (`model testing.zip`, 89 modèles) et des journaux du banc d'essai et du test de chargement NPU. **Faits** = lus dans nos journaux ou dans les sources citées. **Hypothèses** = déductions, à vérifier.

## 1. Ce que disent nos journaux

PC: Snapdragon X Plus X1P64100 (10 cœurs), 15,6 Go de RAM, Windows 26300.9711, pilote NPU 10.0.26100.1, GenieX 0.9.3. Le serveur est lancé par l'appli avec `--compute npu`: d'après les notes de GenieX, `npu` épingle **tout le modèle sur une seule session NPU (HTP0)**.

| Modèle (fichier) | Fenêtre | Buffers mis sur HTP0 (poids + cache + calcul) | Buffer refusé |
|---|---|---|---|
| Qwen3-4B-Thinking-2507 (2,3 Go) | 16 384 | ~2,3 Go + cache 2 304 Mio + calcul 780 Mio | 622 333 952 o (594 Mio), erreur 0x200 |
| Ministral-8B-Instruct (4,3 Go) | 2 048 (échelle) | ~4,3 Go + cache 288 Mio + calcul 724 Mio | 536 875 008 o (512 Mio + 8 Kio), 0x200 |
| Gemma-2-9B-it (5,1 Go) | 3 072 | ~5,1 Go + cache 2 x 504 Mio + calcul 1 236 Mio | 1 057 542 144 o (1 009 Mio), 0x200 |

Faits:
- Message: `ggml-hex: HTP0 buffer mapping failed : domain_id 3 size N fd F error 0x00000200`, puis `fastrpc_mmap failed`, puis l'erreur API `-100201 SDKError(Model loading failed)`.
- `n_ubatch = 1024`, `n_batch = 2048`, `flash_attn = enabled` dans nos lancements. GenieX a mis `n_ubatch` à 128 sous Linux pour éviter exactement ce type d'échec (GenieX #1503); sous Windows il n'est pas changé.
- Aucun des 14 réglages essayés (fenêtres 8 192 à 2 048, `GGML_HEXAGON_MBUF`, `GGML_HEXAGON_DEVICES`) n'a fait charger un modèle. La taille du buffer refusé ne dépend pas de la fenêtre.
- Après un échec, le compteur NPU peut rester à 2 ou 3 Go alors que le serveur est arrêté.
- Beaucoup d'échecs sont un **plantage du serveur** (`fetch failed`, trace de panique Go), pas une erreur 500.
- Les compteurs Windows fonctionnent (adaptateur « compute-only », 0,22 Go au repos): les mesures de mémoire sont fiables.

Sources: llama.cpp `docs/backend/snapdragon/README.md` (une session NPU: ~3,5 Go de mappage; au-delà, les poids sont mappés dynamiquement; les gros modèles se répartissent sur plusieurs sessions), llama.cpp #26123 (une fenêtre d'adresses de 4 Go partagée, des échecs sous le budget total qui évoquent la fragmentation), x1e-npu (tenseur de sortie non découpable par `GGML_HEXAGON_MBUF`, il faut un trou aligné de 1 Gio; un échec peut laisser le pilote dans un mauvais état), GenieX #1531 (même erreur sur un buffer de calcul de 1 Gio avec `n_ubatch` 1024), GenieX #1530 (un plafond de 64 Mio retiré sous Windows pour faire tourner Qwen3.5-9B sur X Elite).

**Hypothèse principale**: ce n'est pas la taille du modèle qui compte mais ce qui doit être mappé en même temps sur la session (poids découpés en morceaux de 1 Gio, cache de contexte, buffer de calcul) et la possibilité de trouver un trou **contigu et aligné** pour chaque morceau. Le buffer refusé est chaque fois un morceau de poids (un reste ou le dernier), ce qui colle avec des mappages qui s'accumulent jusqu'à épuisement.

## 2. Ce qui a tourné et ce qui n'a pas tourné (premier banc, même PC)

**Ont tourné jusqu'au bout sur le NPU (30 modèles)**, y compris des gros: Qwen3.5-4B, Qwen3-4B-Instruct-2507, Qwen3-8B (4,8 Go), Qwen3.5-9B (5,4 Go), Ministral-3-8B-Reasoning, Ministral-8B-Instruct-2410 (4,3 Go), GLM-4-9B-0414, MiMo-V2.6-Distill-Qwen-9B, Gemma-4-E2B-it, Gemma-3-4B-it, Gemma-3-1B-it, Qwen2.5-Coder-3B et 1.5B, Qwen2.5-1.5B, LFM2 (1.2B, 2.6B), LFM2.5 (1.2B, 2.6B, 8B-A1B), Nemotron-3-Nano-4B (NPU + CPU), Arch-Function-3B, xLAM-2-3B-fc-r, EXAONE-4.0-1.2B, DeepScaleR-1.5B, VibeThinker-3B, Qwen3-1.7B (bundle natif NPU), Qwen3-4B-Thinking-2507 (partiel).

**Ne se sont pas chargés (56 modèles, avec le seul dépôt essayé)**, par famille:
- **Llama et dérivés**: Llama-3.1-8B, Llama-3.2-3B, Hermes-3-Llama-3.1-8B, Llama-3-Groq-8B-Tool-Use, Llama-xLAM-2-8B, LongWriter-Llama3.1-8B, Llama-3-8B-Finance-RAG, Dolphin3-Cyber-8B, Seed-Coder-8B (2), Yi-Coder-9B, OpenCoder-8B.
- **Gemma 2 et certains Gemma 3/4**: Gemma-2-9B-it, SPPO-Iter3, Gemma-4-E4B-it, **MedGemma-4B-it**, **TranslateGemma-4B-it** (architecture gemma3, comme Gemma-3-4B-it qui a tourné).
- **Phi / Granite / OLMo / Hunyuan / InternLM / MiniCPM / Cohere**: Phi-4-mini (2), Granite-4.0-H-Tiny, Granite-4.2-8B, Olmo-3 (2), Hunyuan (4B, 7B, MT-7B), InternLM3-8B, MiniCPM4.1-8B, MiniCPM5-2B, Aya-Expanse-8B, Tiny-Aya.
- **Autres**: Apertus, EuroLLM, Salamandra, Falcon3 et Falcon-H1R, EXAONE-Deep-7.8B, SmolLM3, Nemotron-Nano-9B-v2, Nemotron-3.5-Bolt, Seed-X, TwIL, NuExtract (2).
- **Même architecture que des modèles qui ont tourné, mais échec**: Qwen2.5-7B-Instruct (et 1M), Jan-v1-4B / Jan-nano / Jan-code-4B (base Qwen3), Qwen3-4B et Qwen3-1.7B « custom » (GGUF de bartowski), Ministral-3-8B-Instruct et 3B (le Reasoning a tourné).
- Qwen2.5-Coder-7B: refusé par l'appli (9,2 Go estimés), pas essayé sur le NPU.

## 3. Ressemblances et différences

1. **L'architecture seule ne tranche pas.** Les mêmes architectures apparaissent des deux côtés (qwen3, gemma3, ministral). Donc le support de l'architecture par le runtime n'explique pas tout.
2. **Le fichier GGUF compte.** Qwen3-1.7B en bundle natif NPU a tourné, le GGUF « custom » non. Gemma-3-4B-it a tourné, MedGemma-4B et TranslateGemma-4B (même architecture, même taille) non. Hypothèse: la façon dont le GGUF est fabriqué (type du tenseur de sortie et de l'embedding, `output.weight` séparé ou partagé, quantification mixte Q4_0 + Q6_K/Q8_0, taille du vocabulaire, découpage des poids) change les morceaux à mapper.
3. **Les familles qui tournent sont celles que Qualcomm et la communauté testent le plus**: Qwen2.5/3/3.5 (et dérivés), Gemma 3 (1B, 4B), Gemma-4-E2B, LFM2/2.5, Ministral 3 Reasoning, GLM-4. Les familles qui échouent presque toutes (Llama, Gemma-2, Phi, Granite, OLMo, Hunyuan…) ont des vocabulaires plus gros, des embeddings liés ou des couches inhabituelles (SWA, hybrides): **à vérifier dans les GGUF**.
4. **La taille n'est pas le critère**: Qwen3.5-9B (5,4 Go) a tourné, Qwen3-4B-Thinking (2,3 Go) et MedGemma-4B (2,4 Go) non. Un modèle de 5,4 Go qui tourne contredit l'idée d'une limite de 4 Go; l'explication la plus probable (hypothèse) est que les modèles qui dépassent environ 3,5 Go ont leurs poids mappés dynamiquement, alors que ceux de 2 à 3 Go avec un gros cache de contexte restent mappés d'un bloc.
5. **Ça a changé depuis le premier banc.** Qwen3-4B-Thinking et Qwen3.5-4B avaient tourné; ils échouent aujourd'hui sur le même PC. À vérifier: mise à jour de GenieX (0.9.3 ?), de Windows (build Insider 26300), du pilote NPU, ou fenêtre plus grande (16 384). **Test simple à faire sur le PC**: relancer Qwen3-4B-Instruct-2507 (qui avait tourné) avec le test de chargement NPU. S'il échoue aussi, c'est l'environnement qui a changé, pas les modèles.

## 4. Ce que fait maintenant l'appli

- Le **test de chargement NPU** (Réglages, Développeur) essaie 2 à 4 sessions NPU, des morceaux de poids plus petits et des fenêtres plus petites, **tout en NPU**, du moins limitant au plus limitant.
- Le **mode hybride** (une partie du modèle sur le CPU) n'est jamais utilisé tout seul. Il est essayé en dernier recours seulement si la case « hybride » est cochée, dans le test et dans le banc d'essai. Un modèle qui ne charge qu'ainsi est signalé « part on the CPU ».
- Le réglage qui marche est gardé par modèle, et l'appli démarre ensuite ce modèle avec.

## 5. Prompt de recherche approfondie (à copier dans Gemini Deep Research)

---

## Mission

Je développe une application Windows (Open NPU) qui fait tourner des modèles de langage locaux sur le **NPU Hexagon d'un Snapdragon X** via **GenieX** (runtime Qualcomm, backend llama.cpp « ggml-hexagon », modèles GGUF Q4_0). Je veux deux choses, avec des sources vérifiables (liens, dates, version du logiciel):

**A. Comprendre et résoudre l'échec de chargement.** Beaucoup de GGUF ne se chargent pas sur le NPU. Je veux la cause exacte et la correction la plus simple, **en gardant le modèle entièrement sur le NPU** (le mode hybride NPU + CPU est un dernier recours, pas la solution).

**B. Trouver des modèles qui ont vraiment de bonnes chances de se charger sur le NPU seul**, avec leurs caractéristiques, et les dépôts Hugging Face de GGUF Q4_0 dont le fichier se charge.

## Les faits, tirés de nos journaux

- Matériel: Snapdragon X Plus X1P64100 (10 cœurs), 15,6 Go de RAM, Windows 11 build 26300.9711 (Insider), pilote NPU 10.0.26100.1, GenieX 0.9.3 (CLI v0.9.3), serveur lancé avec `geniex serve --compute npu --nctx N` (donc tout épinglé sur la session `HTP0`), `n_ubatch=1024`, `n_batch=2048`, `flash_attn` activé.
- Erreur exacte, toujours la même: `ggml-hex: HTP0 buffer mapping failed : domain_id 3 size <N> fd <F> error 0x00000200`, puis `creating llm error: ggml-hex: fastrpc_mmap failed (see log for details)`, puis l'API répond 500 `{"code":-100201,"error":"SDKError(Model loading failed)"}`. Parfois, à la place, le serveur plante (panique Go dans gin) et le client voit `fetch failed`.
- Tailles de buffers refusés: 622 333 952 o (Qwen3-4B-Thinking, fichier 2,3 Go, fenêtre 16 384, cache KV 2 304 Mio, buffer de calcul 780 Mio), 536 875 008 o (Ministral-8B, 4,3 Go, fenêtre 2 048, KV 288 Mio, calcul 724 Mio), 1 057 542 144 o (Gemma-2-9B, 5,1 Go, fenêtre 3 072, KV 2 x 504 Mio, calcul 1 236 Mio). Réduire la fenêtre à 2 048, régler `GGML_HEXAGON_MBUF=128M,128M` ou `GGML_HEXAGON_DEVICES=2/3` n'a rien changé.
- Ce qui a tourné sur le même PC (premier banc): Qwen3.5-4B, Qwen3-4B-Instruct-2507, Qwen3-8B (4,8 Go), Qwen3.5-9B (5,4 Go), Ministral-3-8B-Reasoning, Ministral-8B-Instruct-2410, GLM-4-9B-0414, MiMo-V2.6-Distill-Qwen-9B, Gemma-4-E2B-it, Gemma-3-4B-it, Gemma-3-1B-it, Qwen2.5-Coder-1.5B/3B, Qwen2.5-1.5B, LFM2 et LFM2.5 (1.2B à 8B-A1B), Nemotron-3-Nano-4B, Arch-Function-3B, xLAM-2-3B-fc-r, EXAONE-4.0-1.2B, DeepScaleR-1.5B, VibeThinker-3B, Qwen3-1.7B en bundle natif NPU.
- Ce qui ne s'est pas chargé: Llama-3.x et dérivés (Llama-3.1-8B, Llama-3.2-3B, Hermes-3, Dolphin3, Groq-Tool-Use, xLAM-8B), Gemma-2-9B (et SPPO), Gemma-4-E4B, MedGemma-4B et TranslateGemma-4B (architecture gemma3 comme Gemma-3-4B qui a tourné), Phi-4-mini, Granite-4.x, OLMo-3, Hunyuan 4B/7B/MT-7B, InternLM3-8B, MiniCPM4.1-8B et 5-2B, Aya-Expanse-8B, Apertus, EuroLLM, Salamandra, Falcon3/H1R, EXAONE-Deep-7.8B, SmolLM3, Nemotron-Nano-9B-v2, Nemotron-3.5-Bolt, Seed-Coder, Yi-Coder, OpenCoder, Qwen2.5-7B-Instruct, Jan-v1-4B/Jan-nano/Jan-code-4B (base Qwen3), Qwen3-4B et Qwen3-1.7B en GGUF « custom » (bartowski), Ministral-3-8B-Instruct et 3B.
- Qwen3-4B-Thinking-2507 et Qwen3.5-4B **avaient tourné** sur ce même PC il y a quelques jours et échouent maintenant.

## Questions A (cause et correction)

1. Que signifie exactement l'erreur `0x00000200` de `fastrpc_mmap` sur le NPU Hexagon v73 d'un Snapdragon X1 sous Windows, et à quel endroit du code (ggml-hexagon, pilote FastRPC, QNN/HTP) est-elle produite? Quelle est la **limite réelle** d'espace d'adresses d'une session HTP sur X1 (3 Go? 3,5 Go? 4 Go?), et que compte-t-elle (poids, cache KV, buffer de calcul, alignements de 1 Gio)?
2. Comment un modèle de 5,4 Go (Qwen3.5-9B) peut-il se charger sur une seule session pendant qu'un modèle de 2,3 Go échoue? Les poids sont-ils mappés dynamiquement au-delà d'un seuil? Existe-t-il un seuil de taille, de fenêtre, de `n_ubatch` ou de nombre de morceaux qui fait basculer le comportement?
3. Quels paramètres de GenieX 0.9.x (flags de `geniex serve` / `geniex infer`, variables d'environnement `GGML_HEXAGON_*` et `GENIEX_*`, fichier de configuration, API `device_map`) contrôlent: `n_ubatch`, `n_batch`, la taille des buffers (`MBUF`), le nombre de sessions (`DEVICES`), le placement du tenseur d'embedding/sortie (`-ot token_embd.weight=CPU` ou équivalent), le type du cache KV (`-ctk q8_0`)? Lesquels sont réellement lus par la version 0.9.3 sous Windows? Donne les commandes exactes.
4. Cherche **tous** les rapports de cette erreur (GitHub qualcomm/GenieX, ggml-org/llama.cpp, qualcomm-ai-hub, Qualcomm Developer Forums, Reddit r/LocalLLaMA, r/WindowsOnARM, r/Snapdragon, Hacker News, X) et dis ce qui a **réellement** fonctionné pour chacun. Cherche en particulier GenieX #1494, #1507, #1531, #1530, #1503, #1713 et les versions de GenieX après la 0.9.3 qui corrigent le mappage FastRPC.
5. Un modèle peut-il avoir tourné puis échouer sans changer de fichier? Quels changements (version de GenieX, build Windows Insider, pilote NPU, fragmentation après un échec, état du pilote FastRPC) l'expliquent, et comment remettre le NPU à zéro sous Windows sans redémarrer?
6. Le mode hybride (`--compute hybrid`) place une partie des tenseurs sur le CPU. Quelle part exactement du modèle reste sur le NPU, et pour quels modèles est-ce encore utile? Je le garde comme **option** pour l'utilisateur, pas comme solution par défaut.

## Questions B (candidats qui ont des chances de tourner sur le NPU seul)

7. Que partagent les modèles qui se chargent (liste ci-dessus) que les autres n'ont pas? Examine concrètement leurs GGUF (`gguf-dump`, métadonnées Hugging Face): taille du vocabulaire, `output.weight` séparé ou lié à `token_embd.weight`, type de quantification de chaque tenseur (Q4_0 pur ou mixte avec Q6_K/Q8_0/F16), nombre et taille des plus gros tenseurs, nombre de couches, têtes KV, attention à fenêtre glissante (SWA), couches hybrides/SSM, MoE, type de tokenizer. Donne un **tableau** modèle par modèle et dis quelle propriété prédit le mieux le succès.
8. Pourquoi Gemma-3-4B-it se charge et pas MedGemma-4B / TranslateGemma-4B (même architecture, même taille)? Pourquoi Qwen3-4B-Instruct-2507 se charge et pas les Qwen3-4B/Jan de même base? Compare les fichiers GGUF des différents fournisseurs (Qwen officiel, unsloth, bartowski, ggml-org, QuantFactory, mradermacher, lmstudio-community, second-state, Mungert…) pour un même modèle.
9. Quelles architectures sont **officiellement** supportées sur le backend Hexagon de llama.cpp / GenieX (et lesquelles n'ont que des opérations repliées sur le CPU)? Cite les sources (README, notes de version, issues).
10. **Propose des modèles candidats** (jusqu'à environ 9B, fichier Q4_0 de 5,5 Go maximum, puis 14B si une répartition sur plusieurs sessions fonctionne) qui ont de **vraies chances** de se charger sur le NPU seul: pour chacun, nom exact, dépôt Hugging Face du GGUF Q4_0 (vérifie que le fichier existe), fournisseur le plus fiable, taille, paramètres (total et actifs si MoE), architecture, taille du vocabulaire, type du tenseur de sortie, **raison précise** pour laquelle il ressemble aux modèles qui se chargent, et ce qu'il apporte (code, français, raisonnement, appels d'outils, vision, écriture). Privilégie les modèles sortis récemment (jusqu'à octobre 2026), les variantes qui ne changent pas l'architecture d'un modèle connu comme fonctionnel (Qwen3/3.5, Gemma-3, LFM2), et les bundles NPU natifs de Qualcomm AI Hub quand ils existent.
11. Indique aussi les modèles à **éviter** (architecture non supportée, vocabulaire énorme, tenseurs géants non découpables) et pourquoi, pour que je ne les télécharge pas pour rien.

## Format de réponse

1. Un résumé de 10 lignes: la cause la plus probable et la correction la plus simple, avec le niveau de confiance.
2. La réponse à chaque question, avec liens et dates, en distinguant: *mesuré/documenté par Qualcomm ou llama.cpp*, *rapporté par la communauté*, *déduction*.
3. Le tableau des GGUF (question 7) et la liste des candidats (question 10).
4. Une **liste d'expériences à faire chez moi**, classées de la plus simple à la plus longue, avec les commandes exactes (par exemple `geniex infer <modèle> --log debug`, variables d'environnement, flags), et ce que chaque résultat voudrait dire.
5. Les désaccords entre sources, et ce que tu n'as pas pu vérifier.

Ne t'arrête pas aux premiers résultats: continue jusqu'à ce que de nouvelles recherches ne trouvent plus rien de nouveau.
