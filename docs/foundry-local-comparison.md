# Comparer Open NPU avec Microsoft Foundry Local

Une personne sur Reddit demande des chiffres de comparaison avec Foundry Local (le runtime local de Microsoft, qui utilise ONNX Runtime et choisit lui-même CPU, GPU ou NPU) sur des modèles comme Qwen Coder, Llama et Gemma. Ce document dit ce qui est prêt et ce qui manque.

## Ce qui est fait

Les modèles que les sources nomment pour Foundry Local, en version GGUF Q4_0 (dépôt et fichier vérifiés sur Hugging Face), sont dans la liste du banc d'essai (`src/core/bench-candidates.json`), pour comparer le même modèle des deux côtés:

| Foundry Local (nom vu dans les sources) | Dans notre banc |
|---|---|
| qwen2.5-0.5b | Qwen2.5-0.5B-Instruct (Qwen/Qwen2.5-0.5B-Instruct-GGUF, 0,43 Go) |
| Qwen2.5 chat 3B | Qwen2.5-3B-Instruct (Qwen/Qwen2.5-3B-Instruct-GGUF, 2,0 Go) |
| qwen2.5-coder-0.5b | Qwen2.5-Coder-0.5B-Instruct (Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF, 0,43 Go) |
| deepseek-r1-7b (NPU) | DeepSeek-R1-Distill-Qwen-7B (QuantFactory/DeepSeek-R1-Distill-Qwen-7B-GGUF, 4,43 Go) |
| mistral-7b-v0.2 | Mistral-7B-Instruct-v0.2 (QuantFactory/Mistral-7B-Instruct-v0.2-GGUF, 4,11 Go) |
| Phi (famille) | Phi-3.5-mini-instruct (bartowski/Phi-3.5-mini-instruct-GGUF, 2,18 Go) |

Déjà dans le banc avant: Phi-4-mini (instruct et reasoning), Qwen2.5-Coder-1.5B et 3B, Qwen2.5-7B-Instruct, Gemma 3 et 4, Llama 3.1 et 3.2. Les dépôts de secours (`altRepos`) de ces six nouveaux modèles n'ont pas été ouverts un par un: seul le dépôt principal l'a été.

## Ce qui n'est pas fait

- **« Tous » les modèles de Foundry Local:** je n'ai pas pu lire son catalogue complet. Il change selon la machine et la version, et la documentation renvoie à `foundry model list`. La liste ci-dessus vient des guides et des tickets que j'ai trouvés, pas du catalogue.
- **Trop gros pour le banc (limite 7 Go de fichier):** Phi-4 (14B), DeepSeek-R1-Distill 14B, gpt-oss.
- **Pas des modèles de langage:** Whisper (transcription).
- **Le côté Foundry Local du comparatif:** rien ne le lance encore. Le banc parle à un serveur compatible OpenAI; Foundry Local en expose un (le port n'est pas dans sa page principale, la commande `foundry service status` le donne), donc l'ajouter comme moteur de test est faisable, mais il faut l'installer d'abord.

## Pour compléter la liste

Sur le PC, dans PowerShell:

```
foundry model list
foundry model list --device npu
```

Colle les deux sorties: les noms exacts (et ceux qui ont une variante NPU) permettent d'ajouter ce qui manque.
