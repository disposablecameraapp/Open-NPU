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
- **Le côté Foundry Local du comparatif** est maintenant dans le banc (voir plus bas), mais il n'a été écrit que d'après la documentation et des rapports, jamais essayé contre une vraie installation. Si une étape échoue, le journal du banc contient les commandes `foundry` lancées et leurs réponses: les coller.

## La page dédiée

Réglages, Développeur, section **GenieX and Microsoft Foundry Local**: elle dit si Foundry Local est installé (version, nombre de modèles de son catalogue sur ce PC), liste les modèles qu'il partage avec le banc, laisse cocher lesquels comparer (« All », « 3 GB or less »), lance la comparaison, et montre les deux moteurs côte à côte avec le plus rapide. Le bouton d'export écrit le rapport. Elle garde aussi, à part, ce que les commandes `foundry` ont répondu (avec « Copy full log »), pour lire une erreur.

## Le mode « Launch check »

Dans le banc, le mode **Launch check** teste seulement si chaque modèle se charge et répond à un vrai prompt de ~1 500 tokens, sur quoi il tourne, à quelle vitesse, avec quel réglage (même échelle de réglages que le test de chargement). Pas de test de qualité, pas d'échauffement du NPU: c'est le plus rapide. Il écrit `launch.md` et `launch.csv` (quels modèles se lancent, lesquels non et pourquoi, et GenieX contre Foundry Local quand les deux sont testés).

## Comment l'utiliser

1. Installer Foundry Local (documentation Microsoft; la commande `foundry --version` doit répondre dans PowerShell).
2. Réglages, Développeur, Model benchmark: les modèles de Foundry Local apparaissent dans la liste, nommés `... (Foundry Local)`. Ceux que Foundry Local partage avec notre liste sont jumelés (même nom, une fois par GenieX, une fois par Foundry Local); les autres sont ajoutés tels quels. La liste vient de `foundry model list` sur ce PC, donc elle contient ce que Foundry Local propose vraiment ici (chat seulement, 7 Go au plus).
3. Le bouton « Compare GenieX and Foundry Local » coche chaque modèle jumelé et son jumeau.
4. Le rapport exporté contient une section « GenieX and Foundry Local on the same models »: qualité, tokens/s, premier mot, chargement et matériel, côte à côte.

Un seul moteur occupe le NPU à la fois: le serveur GenieX est arrêté avant de charger un modèle dans Foundry Local, et le modèle Foundry est déchargé après le test. Un modèle que Foundry Local avait déjà sur disque n'est jamais supprimé; si la liste du cache n'est pas lisible, rien n'est supprimé.

## Pour compléter la liste

Sur le PC, dans PowerShell:

```
foundry model list
foundry model list --device npu
```

Colle les deux sorties: les noms exacts (et ceux qui ont une variante NPU) permettent d'ajouter ce qui manque.
