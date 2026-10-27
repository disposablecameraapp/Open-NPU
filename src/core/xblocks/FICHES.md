# Fiches des blocs

Lire d'abord `docs/blocks-design.md` (pourquoi) et `src/core/xblocks/core.js` (l'API `X`, déjà écrite et testée : ne pas la modifier).
Chaque bloc est un fichier `src/core/xblocks/<nom>.js` : un script navigateur simple (pas de module, pas de `import`, pas de dépendance), qui n'utilise que `X` et le DOM, et s'enregistre avec `X.define("<nom>", class extends HTMLElement {...})` (ce qui crée `<x-nom>` et l'alias `<game-nom>`).

## Règles communes (valables pour tous les blocs)

1. **Aucun accès à du code du modèle** : un bloc n'évalue jamais de texte (`eval`, `new Function`, `setTimeout(string)` interdits). Les conditions passent par `X.test("hp<=0")`, les effets par `X.run("gold+=1 say:\"Hi\"", ctx)`.
2. **Tout passe par l'état** : un bloc lit (`X.get`), écrit (`X.set`, `X.add`) et émet des événements (`X.emit("verbe:objet", {el})`). Il ne manipule pas les éléments des autres blocs.
3. **Apparence = CSS de l'auteur** : les éléments produits portent des classes lisibles (`tile`, `wall`, `entity`, `player`, `dialog-box`...). Les styles par défaut sont injectés une seule fois dans un `<style id="x-<nom>-style">` avec `:where(...)` (spécificité nulle) pour que le CSS de l'auteur gagne toujours. Les emojis et couleurs de la légende ne sont que des valeurs par défaut.
4. **Entrées bloquées pendant un dialogue ou un combat** : tout bloc qui lit le clavier ignore les touches quand `X.get("dialog_open")` ou `X.get("battle_open")` est 1 ou plus, et quand `X.isOver()`.
5. **Redémarrage** : écouter `X.on("restart", ...)` et revenir à l'état de départ du bloc.
6. **Boucle** : utiliser `X.loop(fn(dt))` (secondes), jamais son propre `requestAnimationFrame`. Les minuteurs : `setInterval` autorisé s'il s'arrête quand `X.isOver()`.
7. **Un bloc invisible n'agit pas** : si son élément (ou un parent `x-scene`) est caché (`el.offsetParent === null`), il ne répond pas aux touches ni ne tourne.
8. **Erreurs** : un attribut manquant ou invalide ne lève jamais d'exception ; ajouter un message court à `X.problems` et continuer avec une valeur par défaut raisonnable.
9. **Écrire pour être lu** : fonctions courtes, commentaires brefs seulement quand le « pourquoi » n'est pas évident. Pas de nom de modèle ni d'outil dans les commentaires.
10. **Test** : un script `scripts/xblocks-smoke/<nom>.cjs` qui utilise `scripts/xblocks-smoke/harness.cjs` (voir `core.cjs` comme modèle), au moins 8 vérifications du comportement réel dans Chromium, et affiche PASS/FAIL. Il doit passer avant de livrer.
11. **Livraison** : ne modifier aucun autre fichier que ceux de ton bloc. Ne pas faire de commit. Dernier message : une liste courte de ce qui est fait, de ce qui manque, et de toute modification souhaitée dans `core.js` (à demander, ne pas la faire).

## map — monde vu de dessus (RPG, donjon, labyrinthe)

Fichier : `map.js`. Référence de comportement : le moteur de la première version dans `src/core/gameBlocks.ts` (constante `BLOCKS_SOURCE`) : reprendre ses règles de jeu, changer son rendu (DOM au lieu de canvas) et l'API (`X`).

Contenu de `<x-map>` : un `<x-legend>` (texte, une ligne par caractère) puis les lignes de la carte en ASCII imprimable. Attributs : `tile` (px, 32 par défaut), `view="15x11"` (fenêtre de caméra en cases, optionnelle), `name` (défaut : `id`).

Ligne de légende : `<car> <rôle> [apparence] [effets] [needs:condition] ["paroles"] [still] [to:scène] [as:nom]`
- apparence : un emoji ou une couleur CSS (`#c33`, `red`). `as:nom` ajoute la classe `nom` à la case (pour le CSS de l'auteur) et nomme l'objet dans les événements.
- effets : ceux de `X.run`, p. ex. `gold+=1`, `hp-=1` (l'ancienne écriture `gold+1` reste acceptée par `X.run`). Un jeton qui ressemble à un effet (identifiant suivi de `+=`, `-=`, `=`, `+1`, `-1`, `++`, `--`) est un effet ; `needs:` prend le reste du jeton sans espace (p. ex. `needs:key`, `needs:gold>=3`).
- rôles : `wall`, `floor`, `player`, `item`, `enemy`, `door`, `exit`, `npc`, `trap`, `switch`, `warp`. Tout caractère absent de la légende, ainsi que `.` et espace, est du sol.

Rendu : une grille CSS dans l'élément. Chaque case est `<div class="tile ROLE [as]">` ; les entités mobiles (joueur, ennemis) sont `<div class="entity player|enemy ...">` posées par `grid-area` (ou transform) ; l'objet ramassé disparaît (la case devient `floor`). Le joueur a toujours la classe `player`.

Comportement :
- Flèches, WASD, ZQSD : un pas par pression, 90 ms mini entre deux pas, la touche maintenue répète.
- wall bloque. enemy : marcher dessus le bat (effets appliqués, il disparaît), les ennemis errent toutes les 650 ms sauf `still` ; un ennemi qui arrive sur le joueur applique ses effets et disparaît. door : bloquée tant que `needs:` est faux ; si `needs:` est un simple nom d'état, la porte en consomme 1 ; ouverte, elle devient sol. exit : win (`X.finish("win", paroles)`) si `needs:` est vrai, sinon dit les paroles. npc : marcher dessus dit ses paroles, applique les effets, n'avance pas. trap : effets à chaque entrée. switch : effets une fois, puis devient sol. warp : `X.go(to)`. item : effets, paroles dites, disparaît.
- Événements (`detail` = `{el, x, y, name}`) : `pickup:<rôle>` et `pickup:<nom>`, `hit:<rôle>`, `open:door`, `talk:<nom>` (npc), `enter:<rôle>`, `step`. Le nom est `as:` s'il existe, sinon le caractère. Pour un npc, émettre `talk:<nom>` **avant** de dire les paroles ; ne dire les paroles qu'à défaut de dialogue (si aucun `<x-dialog id="<nom>">` n'existe dans la page).
- État écrit : `player_x`, `player_y`.
- Caméra : si `view` est donné, l'élément est une fenêtre (taille view × tile, `overflow:hidden`) et la grille intérieure se décale pour suivre le joueur, bornée aux bords. Sinon tout est visible.
- Carte normalisée : indentation commune retirée, lignes complétées à la largeur max.
- Plusieurs `<x-map>` dans des scènes différentes : seule la carte visible répond aux touches.
- API pour les tests : `el.api = { step(dx, dy), me(), grid(), entities() }`.

## platformer — niveau vu de côté (Mario, Sonic-like, runner)

Fichier : `platformer.js`. Même forme de contenu que `map` (`<x-legend>` + lignes ASCII).

Attributs de `<x-platformer>` : `tile` (px, 32), `view` (largeur visible en cases, 16), `gravity` (cases/s², 40), `jump` (vitesse initiale en cases/s, 14), `speed` (cases/s, 7), `run` (multiplicateur avec Shift, 1.6).

Rôles de légende : `ground` (plein), `brick` (plein ; si le joueur est grand `big>=1`, la frapper par dessous la casse), `block` (plein ; frappé par dessous : applique ses effets, émet `hit:block`, devient `used`, gris), `platform` (traversable par dessous, plein par dessus), `player` (départ), `coin` (effets au contact, disparaît), `walker` (marche, fait demi-tour contre un mur ou au bord ; écrasé par dessus : effets de sa ligne, disparaît, le joueur rebondit ; contact par le côté : blesse), `flyer` (comme walker, ne tombe pas, oscille), `spike` (blesse), `flag` (win si `needs:` est vrai), `spring` (rebond fort). Les effets, apparence (emoji ou couleur), `needs:`, `as:`, paroles ont le même sens que pour `map`.

Physique (fixe, en cases) : accélération horizontale et frottement, saut à hauteur variable (relâcher raccourcit), `coyote time` 0,1 s, saut mémorisé 0,1 s, gravité, vitesse de chute bornée, collisions sur la grille (axe X puis axe Y). Le joueur est grand (2 cases) quand l'état `big` est 1 ou plus ; être blessé avec `big>=1` met `big=0` au lieu d'appliquer les effets de l'ennemi.
Blessure : applique les effets de l'ennemi (p. ex. `lives-=1`), puis le joueur revient au départ (ou au dernier `checkpoint` s'il y en a) avec 1 s d'invulnérabilité clignotante. Tomber sous le niveau blesse de la même façon (effets de l'attribut `fall`, défaut `lives-=1`).
Caméra : suit le joueur en X (et en Y si le niveau est plus haut que la vue), bornée.
Rendu : `<canvas>` dans l'élément ; couleurs et emojis de la légende, couleurs par défaut par rôle ; `image-rendering: pixelated`.
Touches : flèches/AD/QZ pour bouger, haut/W/Z/espace pour sauter, Shift pour courir.
Événements : `jump`, `land`, `stomp:<nom>`, `coin`, `hit:block`, `hurt`, `flag`, `fall`. État écrit : `player_x`, `player_y` (en cases).
API de test : `el.api = { me(), step(dt), press(code), release(code) }` pour faire avancer la simulation sans clavier réel.

## battle — combats au tour par tour (Pokémon-like)

Fichier : `battle.js`. Éléments : `<x-battle id="b1" on-win="..." on-lose="..." on-flee="...">` contenant des `<x-fighter side="you|enemy" name="Pikou" hp="20" attack="5" defense="3" speed="5" type="normal" sprite="🐭">` et pour chacun des `<x-move name="Charge" power="5" type="normal" uses="10" effect="...">`. Types optionnels : `<x-type name="fire" strong="grass,ice" weak="water,fire">`.

Démarrage : l'événement `battle:<id>` (p. ex. `emit:battle:b1` dans un effet) ouvre le combat (panneau `div.battle-ui` dans l'élément, classes `fighter you|enemy`, `hp-bar`, `menu`, `log`). Pendant le combat : état `battle_open=1`.
Déroulé : menu Combattre (liste des attaques) / Changer (si plusieurs `side="you"` vivants) / Fuir (chance selon vitesse). L'ordre des tours suit `speed`. Dégâts : `max(1, round(power * attack / defense * hasard(0.85..1) * efficacité))`, efficacité 2 / 0,5 / 1 par la table de types. L'ennemi choisit une attaque au hasard avec des usages restants. PV de chaque combattant écrits dans l'état : `<id du combattant ou son nom en minuscules>_hp` (p. ex. `pikou_hp`), modifiables par la page (barres de vie en CSS via la variable `--pikou_hp`).
Fin : victoire (tous les ennemis à 0) → état `battle_result="won"`, événement `battle:won:<id>`, effets de `on-win`, `battle_open=0`. Défaite → `lost`, `battle:lost:<id>`, `on-lose`. Fuite → `fled`. Clavier : flèches/chiffres + Entrée/espace, ou clic.
Le nombre de PV d'un combattant ne reste pas à zéro après un `restart` : on remet les valeurs de départ.
API de test : `el.api = { start(), choose(index), state() }`.

## dialog — boîtes de dialogue à choix

Fichier : `dialog.js`. Éléments : `<x-dialog id="ancien" speed="40">` contenant des `<x-line who="Ancien" [when="cond"] [do="effets"] [id="repere"] [next="repere|end"] [ask="Question ?"]>Texte avec {nom_d_etat}</x-line>` et dans une ligne `ask`, des `<x-choice [do="effets"] [goto="repere"]>Oui</x-choice>`.
Démarrage : l'événement `talk:<id>` ou `dialog:<id>`. Pendant : état `dialog_open=1`, panneau `div.dialog-box` (classes `who`, `text`, `choices`) ajouté au `<body>` et mort à la fin. Texte tapé lettre par lettre à `speed` caractères/s (0 = d'un coup) ; Entrée, espace ou clic termine le texte puis passe à la ligne suivante ; chiffres/flèches/Entrée choisissent. Les lignes avec `when` faux sont sautées. `do` est appliqué à l'affichage de la ligne ; `{nom}` est remplacé par `X.fill`.
Fin : `dialog:end:<id>`, `dialog_open=0`, et l'état `talked_<id>` augmente de 1 à chaque conversation terminée (tous deux utilisables par `when`).
API de test : `el.api = { start(), advance(), choose(index), open() }`.

## timer et calc — minuteries et valeurs calculées

Fichiers : `timer.js` et `calc.js` (deux blocs, deux fichiers).
`<x-timer every="1s" do="time+=1" [while="cond"] [times="n"] [after="3s"] [start="cond"]>` : exécute `do` toutes les `every` (unités `ms`, `s`, `m` ; nombre seul = secondes), ou une fois après `after`. Ne tourne que tant que `while` est vrai (défaut vrai) et, si `start` existe, après qu'il est devenu vrai. S'arrête à la fin du jeu. `restart` le remet à zéro. Un `<x-clock of="time" format="m:ss">` (même fichier) affiche un état en minutes:secondes (`m:ss`, `s`, `mm:ss`).
`<x-calc name="total" value="prix * qte + 1">` : écrit dans l'état `name` le résultat d'une expression arithmétique de l'état (`+ - * / %`, parenthèses, nombres, noms d'état, chemins `liste.length`, fonctions `min max round floor ceil abs`, `count(liste)`, `count(liste, champ == valeur)`, `sum(liste, champ)`). Recalculé à chaque changement des états qu'il lit, sans boucle infinie (n'écrit que si la valeur change). Analyseur écrit à la main, sans `eval`. Une division par zéro donne 0 avec un message dans `X.problems`.

## xcheck — vérification statique d'une page de blocs (TypeScript, sans navigateur)

Fichiers : `src/core/xcheck.ts` et `tests/xcheck.test.ts` (vitest). Aucun accès au DOM réel : lire le texte de la page (regex ou petit analyseur ; `jsdom` n'est pas disponible).
Exporter :
- `X_TAGS` : table `{ tag: { attrs: string[], children?: string[] } }` des balises connues (sans préfixe ; les préfixes `x-` et `game-` sont acceptés), à partir de ce fichier de fiches ;
- `xFlaws(html: string): string[]` : phrases courtes en anglais, une par problème, avec la correction quand elle est connue ;
- `xMend(html: string): { html: string; fixed: string[] }` : corrige sans modèle ce qui est sûr (balise ou attribut à une ou deux lettres près d'un connu, `gold + 1` → `gold+=1` dans les attributs `do` et la légende, lignes de carte complétées, noms d'état invalides mis en `[a-z][a-z0-9_]*`).
Vérifications : balise `x-` inconnue (avec « did you mean »), attribut inconnu ; références (un `of=` vers un état jamais déclaré, créé par un effet ou calculé ; `go:` vers une scène absente ; `emit:battle:<id>` vers un combat absent ; un `<x-dialog>` sans `talk` qui l'appelle n'est pas une erreur) ; expressions de `when`/`data-when` qui ne se lisent pas ; effets illisibles ; cartes (lignes de même largeur, un seul joueur, légende complète, aucun emoji dans les lignes de carte, au moins un mur pour `map`) ; plateformer (un joueur, un drapeau, du sol) ; atteignabilité sur la carte `map` : parcours en largeur depuis le joueur où mur bloque, une porte `needs:` simple ne s'ouvre que si un objet atteignable donne cet état, la sortie doit être atteignable (message : « the exit cannot be reached: <raison> ») ; `<script>` écrit par l'auteur (interdit, sauf celui dont l'id est `blocks`/`xblocks`).
Tests : au moins 15 cas (une page saine passe sans problème, chaque défaut est trouvé, chaque réparation fait ce qu'elle dit).

## art — objets dessinés (SVG), appelés par leur nom

Fichier : `art.js`. Le modèle principal ne dessine pas : il place un objet par son nom, et un dessinateur (un autre appel, ailleurs) écrit le SVG de chaque objet séparément.
- `<x-asset name="oiseau" size="34x24" about="un oiseau jaune de profil"> <svg viewBox="0 0 34 24">…</svg> </x-asset>` : définition (masquée par le bloc, `display:none`). Enregistrée dans `X.assets[name] = { svg, w, h, about }` au démarrage et quand l'élément change (MutationObserver).
- `<x-art of="oiseau" [size="40x28"]></x-art>` : affiche le SVG de l'objet en ligne (taille de l'asset ou `size`), classes `art art-<nom>`. Un nom inconnu affiche un petit rectangle gris pointillé et ajoute un message à `X.problems`.
- Nettoyage obligatoire du SVG (`X.cleanSvg(texte)` : renvoie le SVG sûr ou `""`) : retirer `<script>`, `<foreignObject>`, `<iframe>`, `<style>` externes, tout attribut `on*`, tout `href`/`xlink:href` qui n'est pas `#ancre`, `javascript:` et `data:` ; refuser un texte qui ne contient pas de `<svg`. Aucune ressource réseau.
- Les couleurs partagées s'écrivent `var(--arbre_vert, #3a3)` dans le SVG ; en ligne, le CSS de la page les résout seul.
- API : `X.art(name)` → `{svg, w, h, about}` ou null ; `X.artHtml(name, size?)` → chaîne SVG en ligne prête à insérer ; `X.artImage(name, cb)` → rappelle `cb(HTMLImageElement|null)` avec une image faite d'un blob, après avoir remplacé chaque `var(--x, repli)` par la valeur calculée de `--x` sur `<body>` (sinon le repli), pour dessiner sur un canvas ; l'image est mise en cache et refaite quand l'asset ou les variables changent (`X.artVersion` augmente).
- Dans les légendes de `map` et `platformer` : l'apparence `art:oiseau` (à la place d'un emoji ou d'une couleur) affiche l'objet. Pour `map` (DOM) : `X.artHtml` dans la case ou l'entité. Pour `platformer` (canvas) : `X.artImage`, dessiné dans la case (ou à la taille w×h de l'asset en cases si l'asset est plus grand qu'une case), puis redessiné quand l'image arrive. Tant que l'image n'est pas prête, utiliser la couleur du rôle.
- Tests : `scripts/xblocks-smoke/art.cjs` (au moins 10 vérifications : asset enregistré, `x-art` affiche, nettoyage de `<script>`/`onload`/`href` externe, `var()` résolu pour l'image, nom inconnu, changement d'asset reflété, `art:` dans une légende de `map` et de `platformer`). Relancer aussi `map.cjs`, `platformer.cjs` et `core.cjs` : ils doivent toujours passer.

## platformer — deuxième passe : un niveau qui ressemble à un vrai jeu de plateformes (à faire)

Constat : le rendu est un petit canvas collé dans un coin (dimensions fixes en pixels), avec un ciel clair qui lui est propre, donc deux fonds différents à l'écran ; les rôles sont plats (aplats de couleur) ; il n'y a ni tuyaux, ni décor, ni champignon.
À faire dans `platformer.js` (et son test), sans casser les 15 vérifications existantes ni l'API :
1. **Remplir la place disponible** : le canvas prend toute la largeur de son conteneur (`width:100%; height:auto; display:block`), sa résolution interne suit `devicePixelRatio`, la vue montre `view` cases de large (le niveau est mis à l'échelle de façon à remplir la largeur ; s'il est plus étroit que `view`, il est centré et la vue se réduit à sa largeur). La hauteur suit le niveau (une ligne de plus que celles du niveau pour le ciel n'est pas nécessaire). Si le niveau est plus haut que 80 % de la fenêtre, limiter par `max-height:80vh` en gardant le rapport.
2. **Pas de fond propre** : le canvas est transparent ; le fond vient de la page (le CSS de l'auteur sur `x-platformer` ou le `body`). Un attribut optionnel `sky="#7ec8ff"` remplit un fond uni derrière les cases, sinon rien.
3. **Rôles nouveaux** : `pipe` (plein ; défaut : tube vert avec un bord plus large en haut, dessiné en haut quand la case du dessus n'est pas un `pipe`, reflet clair sur le côté ; deux caractères côte à côte font un tuyau large), `scenery` (sans collision, derrière tout ; `as:cloud`, `as:bush`, `as:hill` ont un dessin par défaut ; sinon emoji, couleur ou `art:`), `water` (traversable, ralentit, ne blesse pas ; optionnel, peut être laissé de côté si trop long).
4. **Rendu par défaut soigné** (quand la légende n'a ni emoji, ni couleur, ni `art:`) : `ground` (terre avec brins d'herbe et ombre en haut), `brick` (briques en appareil, joints), `block` (jaune avec un ? et un biseau ; gris uni une fois frappé), `coin` (ovale doré qui tourne en changeant de largeur), `walker` (champignon : chapeau brun, pieds qui alternent, yeux), `flyer`, `spike`, `flag` (mât, drapeau qui flotte), `spring`, `player` (petit personnage : casquette, visage, corps, jambes qui alternent à la marche, tourné dans le sens du déplacement, plus grand si `big>=1`). Les contours sont nets, des ombres légères ; aucune ressource externe.
5. **Champignon** : un `block` dont la ligne a le jeton `gives:big` fait sortir, quand on le frappe par dessous, un champignon qui avance puis tombe ; le toucher met l'état `big` à 1 (et applique les effets de la ligne du bloc au moment de la frappe). Émet `hit:block` puis `powerup:big` au ramassage.
6. **Animation** : les ennemis et le joueur ont 2 images alternées pendant la marche ; rien ne clignote plus de 3 fois par seconde (le clignotement d'invulnérabilité doit rester au plus à 3 Hz).
7. Mettre à jour la fiche `platformer` ci-dessus (liste des rôles, jetons) et le haut de `platformer.js`. Ajouter au test : le canvas remplit son conteneur, n'a pas de fond propre, un `pipe` est plein, le champignon fait passer `big` à 1, `scenery` ne bloque pas.
