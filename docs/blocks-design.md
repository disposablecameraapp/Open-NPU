# Blocs : la logique complète (document de conception, avant tout code)

Statut : proposition à relire. Rien de ce qui est décrit ici comme « à faire » n'est codé. La base déjà poussée (`src/core/gameBlocks.ts`, version 0) est décrite en section 12 : elle sert de brouillon, pas de référence.

## 1. But

Un petit modèle (Qwen3.5-4B sur NPU, 13 à 20 jetons par seconde) doit produire du premier coup un jeu ou une petite application qui marche, en peu de jetons, sans halluciner de format. Il ne peut pas être entraîné sur notre langage. La seule voie est donc de **rapprocher notre langage de ce qu'il a déjà vu des millions de fois**, et de tout vérifier par programme.

## 2. Règle d'or : rien de nouveau à apprendre

Chaque élément de notre langage doit avoir un modèle connu. Si un élément n'en a pas, on le change ou on le tolère sous plusieurs écritures.

| Notre élément | Ce que le modèle connaît déjà | Écart |
|---|---|---|
| Mise en page, couleurs, animations | HTML et CSS entiers (grid, flex, var(), classes) | aucun |
| Un bloc = une balise | éléments personnalisés (`<mon-bloc>`) | seul le nom du bloc est nouveau |
| Réglage d'un bloc | attributs HTML, `data-*` | aucun |
| État du jeu | variables, objet JSON | noms limités à `[a-z][a-z0-9_]*` |
| Effets (`gold += 1`) | affectations composées de JavaScript | seulement `=`, `+=`, `-=`, `++`, `--` |
| Conditions (`hp <= 0`, `gold >= 3 && key`) | comparaisons JavaScript | aucune fonction, aucun appel |
| Carte | cartes en texte des roguelikes | caractères ASCII seulement |
| Listes (inventaire, quêtes) | `<template>` et `{nom}` (modèles de type Handlebars/Mustache) | aucun |
| Réaction à un clic | `onclick` | on écrit `data-click="gold+=1"` : même idée, mais aucun JavaScript exécuté |
| Écrans | sections que l'on montre et cache | `hidden` / `data-scene` |

Conséquences concrètes :

1. **Tolérance à l'écriture.** L'analyseur accepte `gold+=1`, `gold += 1`, `gold+1`, `gold++`, `+1 gold`. Tout est normalisé en interne. Le modèle n'est jamais pénalisé pour une écriture voisine.
2. **Mots anglais connus** pour les rôles (`wall`, `door`, `exit`), les événements (`click`, `keydown`, `pickup`) et les actions (`say`, `go`, `restart`).
3. **Pas de syntaxe à nous** : pas de point-virgule spécial, pas d'accolades à nous, pas de mini-langage de règles. Une règle est une balise avec `when` et `do`, qui ressemble à un `if` en deux attributs.
4. **Balise inconnue ou attribut inconnu** : l'app propose le plus proche (`game-inventroy` → `game-inventory`) et corrige elle-même quand l'écart est de une ou deux lettres. Le message au modèle ne cite que la correction.

## 3. Architecture : sept couches, un seul pont

```
CSS / HTML (apparence, mise en page)         <- le modèle l'écrit comme d'habitude
        ^  état reflété en variables CSS, attributs data-, classes
        |  clics / touches / saisies = effets
ÉTAT (nombres, textes, listes, drapeaux)     <- la seule chose partagée
        ^  effets (+=, -=, =)     v  événements (pickup:key, hit:enemy)
BLOCS (carte, règles, minuterie, liste...)   <- écrits par nous, une fois
```

**Principe : la logique ne touche jamais au DOM et le DOM ne contient jamais de logique.** Le pont est l'état.

### 3.1 L'état (`<x-state>`)
- Attributs = valeurs de départ : `<x-state hp="3" gold="0" name="Ana">`. Un nombre reste un nombre, le reste est du texte.
- Une valeur citée par un effet mais jamais déclarée est créée à 0.
- Une liste est un état dont la valeur est un tableau d'objets : `<x-state items='[{"name":"clé","count":1}]'>` (JSON, que le modèle connaît).
- Les changements notifient une seule fois par image (jamais une notification par écriture), pour que 60 images par seconde restent fluides.

### 3.2 Effets et conditions : un seul évaluateur
- **Effet** : `nom += n`, `nom -= n`, `nom = valeur`, `nom++`, `nom--`, plus quelques actions : `say:"texte"`, `go:scène`, `restart`, `win`, `lose`, `emit:événement`, `add:liste {…}`, `remove:liste index`.
- **Condition** : comparaisons, `&&`, `||`, `!`, parenthèses, noms d'état. Aucune fonction, aucun accès au DOM, jamais `eval`.
- Le même évaluateur sert aux légendes, aux règles, aux attributs `data-when`, `data-click`, aux gabarits. Un seul format à connaître.
- Les nombres sont bornés si un `min`/`max` est donné sur l'état (`<x-state hp="3" hp-max="3">`).

### 3.3 Les ponts entre l'état et la page
**Logique vers page (automatique, sans rien écrire) :**
- chaque nombre d'état devient `--nom` sur `<body>` et `data-nom="…"` : le CSS peut écrire `width: calc(var(--hp) / 3 * 100%)` ou `body[data-hp="0"] .hero { filter: grayscale(1) }` ;
- une condition vraie nommée (`has-key` pour `key >= 1`) devient une classe sur `<body>` quand elle est déclarée par `<x-flag name="has-key" when="key>=1">` ;
- `data-when="expr"` sur tout élément le montre ou le cache ;
- `<x-value of="gold">` insère le texte de l'état ;
- `<x-list of="items"><template>…{name}…</template></x-list>` répète le gabarit pour chaque élément.

**Page vers logique :**
- `data-click="gold-=3 key+=1"` sur tout élément ;
- `data-key="Space: jump"` / `data-key="ArrowLeft: x-=1"` ;
- `data-bind="name"` sur un `<input>`, `<select>` ou `<textarea>` : lecture et écriture de l'état (pour les applications) ;
- `data-submit="add:items {name: {draft}}"` sur un formulaire.

### 3.4 Événements
- Chaque bloc émet des événements nommés `verbe:objet` (`pickup:key`, `hit:enemy`, `open:door`, `talk:old-man`, `change:gold`).
- Une règle écoute : `<x-rule on="pickup:key" do="say:'Une clé !'">`.
- Le moteur pose brièvement une classe d'animation (`fx-pickup`, `fx-hit`) sur l'élément concerné : le modèle y attache ses animations CSS, sans code.

### 3.5 Scènes
- `<x-scene id="ville">` : un écran. Une seule scène est visible à la fois (les autres ont `hidden`). L'effet `go:ville` change de scène. L'état persiste.
- Une scène peut avoir son propre `<x-map>`, ses propres règles. Les règles hors scène sont globales.

### 3.6 Le monde (`<x-map>`)
- Carte en texte, légende d'une ligne par caractère : `<char> <rôle> [apparence] [effets] [needs:...] ["paroles"] [still]`.
- **Rendu en DOM** (grille CSS de cases `div.tile.wall`, entités mobiles `div.enemy` placées par `grid-area`) jusqu'à environ 1 500 cases ; au-delà, canvas avec les mêmes classes. L'apparence est décidée par le CSS du modèle (`.wall { background: … }`), `look` ne sert qu'aux emojis.
- Caméra : `view="15x11"` montre une fenêtre suivant le joueur.
- Rôles : wall, floor, player, item, enemy, door, exit, npc, trap, switch. Chaque rôle a un comportement fixe, décrit dans la fiche du bloc ; les effets s'appliquent à l'entrée.
- Caractères de carte : ASCII imprimable seulement (les emojis sont sur 2 colonnes et décalent la grille). L'apparence d'emoji se met dans la légende.

### 3.7 Persistance
- `<x-state save="slot1">` sauvegarde l'état dans le stockage local de la page, chargé au démarrage. Utile pour les jeux à progression et pour les applications.

## 4. Les blocs comme contrats

Chaque bloc est décrit par une **fiche** qui sert à quatre choses : l'écrire, le documenter pour le modèle, le vérifier, le tester.

```
nom        : x-inventory
lit        : une liste d'état
écrit      : rien
émet       : rien
écoute     : change:<liste>
attributs  : of (obligatoire), item (gabarit, optionnel)
enfants    : <template> optionnel
exemple    : <x-inventory of="items"></x-inventory>
erreurs    : of absent → « of manque » ; of inconnu → « la liste "x" n'existe pas »
```

Ce que le modèle voit : la ligne `exemple` et les attributs de chaque bloc **utilisé dans cette demande**, jamais l'ensemble. Ce que l'app utilise : tout le reste.

Un bloc que la bibliothèque n'a pas : le modèle écrit une **déclaration** (états lus et écrits, événements émis, effets) et pas du JavaScript. Dernier recours, après essai de tous les blocs existants : un bloc `<x-script>` de code libre, exécuté dans un bac à sable (iframe sans accès extérieur) avec sa fiche et son test.

## 5. Un seul moteur pour les jeux et les applications

Le noyau (états, effets, événements, gabarits, scènes, persistance, saisies) ne dit rien sur les jeux. Ce qui est propre aux jeux ou aux applications vit dans des **paquets de blocs** :

| Paquet | Contenu | Usage |
|---|---|---|
| noyau | state, value, list, when, click, key, bind, rule, scene, save | tout |
| monde | map, legend, entités, caméra, collisions de cases | RPG, donjon, puzzle, roguelike |
| arcade | le moteur actuel `Game.run`, vu comme un bloc `<x-arcade>` avec sa description | pong, flappy, shoot'em up |
| appli | calc (valeurs calculées), table, formulaire, onglets, minuterie, tri/filtre | liste de tâches, budget, convertisseur, suivi |
| graphisme | art (ressources importées), thème, animations | tout |

Une application simple se dit avec le même langage :

```html
<x-state save="todo" tasks='[]' draft="">
<form data-submit="add:tasks {title: draft, done: false} draft=''">
  <input data-bind="draft" placeholder="Nouvelle tâche">
  <button>Ajouter</button>
</form>
<x-list of="tasks"><template>
  <li data-click="toggle:tasks.{index}.done">{title}</li>
</template></x-list>
<p data-when="tasks.length == 0">Rien à faire.</p>
<x-calc name="open" value="count(tasks, done == false)"></x-calc>
```
Le préfixe doit être neutre (`x-`, pas `game-`), puisque les mêmes balises servent aux applications. Les balises `game-*` déjà poussées restent acceptées comme alias.

## 6. Généraliser fait-il perdre en qualité de jeu ?

Réponse honnête : **oui, si on n'y prend pas garde, et rien n'est mesuré.** Les risques réels :

1. **Le ressenti** (physique, minutage, « juice ») : un moteur générique le rend moyen. Parade : le paquet *arcade* garde sa boucle dédiée ; le noyau ne fait jamais de physique.
2. **Les mécaniques propres** à un jeu : un système de combat ou de craft peut ne pas entrer dans les rôles de la carte. Parade : paquets spécialisés ajoutés au besoin ; en dernier recours le bloc `x-script`.
3. **Le niveau de langage** : si tout passe par des effets, un jeu très original peut devenir verbeux. Parade : le modèle peut déclarer un nouveau bloc composé d'effets existants.
4. **L'uniformité** : tous les jeux se ressemblent. Parade : l'apparence est du CSS libre et des ressources importées ; seule la mécanique est partagée.
5. **La limite d'un petit modèle** : plus il y a de blocs disponibles, plus il peut se tromper de choix. Parade : on ne lui présente que les blocs pertinents pour sa demande (choisis par mots, puis par le routeur).

Le test pour trancher : pour chaque paquet, un banc de dix demandes types, jouées automatiquement (section 9), avec le taux de réussite du premier coup, avant et après chaque ajout au noyau. Un recul de réussite ou de jouabilité bloque l'ajout.

## 7. Où ça peut casser (et ce qui le rattrape)

| # | Cassure | Rattrapage |
|---|---|---|
| 1 | Balise ou attribut inventé | liste fermée, correction à une ou deux lettres, sinon message court |
| 2 | Effet mal écrit (`gold + 1`, `gold++`) | analyseur tolérant, normalisation |
| 3 | `<` ou `>` dans un attribut (`hp<=0`) | accepté par HTML ; le validateur lit le texte brut et non seulement le DOM |
| 4 | Référence vers rien (état, scène, liste, événement) | validateur croisé avant affichage, avec « voulais-tu… ? » |
| 5 | Carte irrégulière, tabulations, caractères larges | normalisation de l'indentation ; refus des emojis en carte avec la correction |
| 6 | Carte impossible à gagner (porte fermée sans clé, clé derrière un mur) | **vérifiée sur le texte** par un parcours (BFS) sans navigateur : sortie atteignable, clés avant portes |
| 7 | Noms d'état invalides pour CSS (`Gold Count`, `hp-max`) | noms limités et corrigés (`gold_count`), alias CSS |
| 8 | Éléments superposés ou hors de l'écran | rapport de mise en page en texte (plan ASCII, boîtes, alertes) renvoyé au modèle |
| 9 | Écriture simultanée de plusieurs états par plusieurs blocs | un seul écrivain par image, ordre fixe (règles dans l'ordre du document) |
| 10 | Page très grande, ralentie | carte DOM limitée, canvas au-delà, mises à jour par lot |
| 11 | Le modèle écrit un `<script>` | refusé, avec la forme attendue ; le bac à sable seulement si demandé |
| 12 | Réponse coupée ou page incomplète en cours d'écriture | la page ne se lance qu'une fois complète ; la reprise existante continue |
| 13 | Plusieurs fichiers : un bloc cité dans un fichier, défini dans un autre | contrat lu du code (comme les ids et classes aujourd'hui), vérifié |
| 14 | Contexte trop grand | fiches par bloc utilisé, étapes courtes (section 8) |
| 15 | Exécution non fiable | pas d'`eval`, évaluateur à nous, bac à sable pour le code libre |

## 8. Étapes d'écriture pour un petit modèle

Une session courte par étape, qui ne voit que **l'interface** (les noms) des étapes précédentes :

1. **Plan** (sans appel si la demande est simple) : paquets utiles, liste des états, événements, conditions de fin.
2. **État et règles** : `<x-state>`, `<x-rule>`, drapeaux.
3. **Monde** (si un paquet monde est utilisé) : légende et carte, avec les noms de l'étape 2.
4. **Mise en page et apparence** : HTML et CSS avec la liste des noms (états, rôles, événements) et la feuille de style décidée à l'étape 1.
5. **Blocs manquants** : déclarations, une par bloc.
6. **Vérification et réparation** : validateur, parcours de la carte, rapport de mise en page ; chaque problème renvoyé en une phrase.

Budget visé par étape : environ 2 000 jetons lus et moins de 1 000 écrits. Un jeu de donjon complet en une page : environ 900 jetons écrits, soit 45 à 70 secondes à 13-20 jetons par seconde (estimation, 3,3 caractères par jeton).

## 9. Vérifications sans modèle

1. **Lecture du texte** (`blocksFlaw`) : forme de la carte, légende, références.
2. **Parcours de carte** (BFS) : joueur, sortie, clés, portes, objets requis.
3. **Exécution scriptée** dans Chromium : le trajet trouvé est rejoué, l'état final est comparé (victoire atteinte).
4. **Rapport de mise en page** : plan ASCII, boîtes, chevauchements, débordements.
5. **Banc** : dix demandes types par paquet, avec taux de premier coup, durée, jetons. C'est la mesure à regarder avant d'élargir le noyau.

## 10. Écrire les blocs eux-mêmes : de petits agents

Distinction à garder : **à l'exécution**, c'est le modèle de 4 milliards de paramètres qui écrit les jeux. **À la fabrication de la bibliothèque**, de petits agents de rédaction rapides peuvent écrire les blocs en parallèle, ce qui évite d'envoyer tout le moteur à chacun.

Chaque agent reçoit seulement : l'API du noyau (une page : lire/écrire l'état, émettre, écouter), la fiche de **son** bloc, un exemple, et la consigne de livrer l'implémentation plus son test. Il ne voit aucun autre bloc.

Garde-fous : chaque livraison passe un test automatique dans Chromium avant d'être acceptée ; un seul style d'API (le noyau) ; la fiche reste la source de vérité. Je relis l'assemblage final. Ce n'est utile qu'une fois les fiches validées : écrire des blocs avant de figer le noyau les ferait réécrire.

## 11. Plan de construction (après relecture)

1. Noyau : état, évaluateur d'effets et de conditions (tolérant), pont vers le CSS, `data-when`, `data-click`, `data-key`, validateur croisé. Chromium pour vérifier le moteur.
2. Monde en DOM : carte, rôles, classes, caméra, parcours BFS.
3. Événements, gabarits de listes, scènes, persistance.
4. Paquet appli minimal (bind, form, calc) pour valider l'hypothèse « mêmes moteur pour une appli ».
5. Étapes par session, branchement du rapport de mise en page au test d'exécution.
6. Ressources importées et feuille de style.
7. Banc de dix demandes ; seul résultat qui décide la suite.

## 12. État actuel du code (version 0)

Déjà poussé : un moteur en canvas avec carte, légende, état, `when`, `game-value`, `game-bar`, `game-inventory`, `game-log`, règles `win/lose/restart`, vérification du texte, rapport de mise en page (non branché), choix automatique pour les demandes de monde. À reprendre selon ce document : syntaxe d'effets (`gold+=1`), rendu en DOM, préfixe neutre, ponts CSS, validateur croisé, BFS.

## 13. Questions ouvertes

1. Préfixe `x-` ou autre ? (recommandation : `x-`, les `game-*` restent des alias.)
2. `data-click` / `data-when` (standard HTML) ou `click` / `when` nus (plus courts) ? (recommandation : accepter les deux, documenter `data-*`.)
3. Carte DOM jusqu'à 1 500 cases : suffisant ?
4. `x-script` en dernier recours : l'autoriser dès le départ, ou seulement quand un bloc déclaratif a échoué deux fois ?
5. Éditeur visuel de blocs : hors périmètre pour l'instant.
