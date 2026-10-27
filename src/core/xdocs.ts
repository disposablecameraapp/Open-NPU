/**
 * What the small model is told about the blocks, as little as possible: the core (always), and the page of each block the request
 * needs (never all of them). Each page is a few lines and one example in the exact form the checker keeps, because a small model
 * copies an example far more reliably than it follows a description.
 */

export interface XDoc {
  name: string;
  /** One line, used when the model is asked which blocks a section needs. */
  purpose: string;
  /** The words of a request that call for this block. */
  words: RegExp;
  doc: string;
  example: string;
}

export const X_CORE_DOC = `Layout and looks are plain HTML and CSS (a <style> block: grid, flex, gap, colours, fonts). The game itself is made of tags, called blocks, that are already implemented: write no <script> and no game loop.
<x-state hp="3" gold="0" name="Ana"></x-state>  the numbers and texts the game keeps (lowercase names with underscores). A list is written items='[{"name":"key","count":1}]'.
Effects (in an attribute named do or data-click, separated by spaces): gold+=1  hp-=1  name="Ana"  say:"text"  go:scene_id  emit:event_name  win  lose  restart  add:items {name: "key", count: 1}  remove:items 0  toggle:items.0.done
Tests (in when and data-when): hp<=0   gold>=3 && key>=1   !has_key   (|| and parentheses also work; no functions)
<x-value of="gold"></x-value> shows a number.  data-when="gold>=3" on any element shows it only while the test is true.  data-click="gold-=3 key+=1" on any element runs effects when it is clicked.  data-key="Space: emit:jump; ArrowLeft: x-=1" runs effects on keys.
<x-list of="items"><template><li>{name} x{count}</li></template></x-list> repeats the template for each item of a list.  <input data-bind="draft"> reads and writes a state.
<x-rule when="hp<=0" do="lose"></x-rule> runs once when its test becomes true.  <x-rule on="pickup:key" do="say:'A key!'"></x-rule> runs when the event happens.
<x-scene id="menu"> ... </x-scene> is one screen: only one scene is visible, the first at the start, and go:scene_id changes it.
Every number of the state is also a CSS variable and an attribute of <body>: width: calc(var(--hp) / 3 * 100%);  body[data-hp="0"] .hero { filter: grayscale(1); }
Draw every title, menu, HUD and panel as normal HTML and CSS. A game needs a way to be lost and a way to be won.`;

export const X_DOCS: XDoc[] = [
  {
    name: "map",
    purpose: "a world seen from above, one character per tile: walls, items, doors, enemies, people, exits",
    words: /\b(rpg|jrpg|pok[eé]mon|zelda|donjon|dungeon|crypt\w*|labyrinth\w*|labyrinthe|maze|roguelike|rogue-?like|top[- ]?down|aventure|adventure|tilemap|tile[- ]?based|inventor(?:y|ies)|inventaire|exploration)\b/i,
    doc: `<x-map tile="32"> holds an <x-legend> then the map rows in plain ASCII (no emoji in the rows).
Legend line: <char> <role> [look] [effects] [needs:test] ["words"] [still] [to:scene_id] [as:name]
roles: wall (blocks), floor, player (start), item (picked up), enemy (walks about, walking into it defeats it), door (blocked until needs:), exit (win), npc (says its words), trap (effects on every entry), switch, warp (goes to the scene in to:).
look is an emoji or a colour; as:name adds the class name to the tile for your CSS. Arrows and WASD move one tile. Characters not in the legend are floor.
Events: pickup:item, pickup:<name>, hit:enemy, open:door, talk:<name>, enter:<role>. Optional: view="15x11" shows a window that follows the player.
Tiles are <div class="tile wall"> and the player is <div class="entity player">: style them in CSS.`,
    example: `<x-map tile="36" view="15x9">
  <x-legend>
    # wall
    @ player
    k item key+=1 🔑 "A key!"
    D door needs:key 🚪 "Locked."
    N npc as:elder 🧓
    e enemy hp-=1 👾
    > warp to:cave
    X exit needs:gold>=3 🏁
  </x-legend>
  ##########
  #@..k.D..X
  #...N..e.#
  ##########
</x-map>`,
  },
  {
    name: "platformer",
    purpose: "a side-view level: running, jumping, bricks, ? blocks, coins, walking enemies that can be stomped, a flag",
    words: /\b(mario|platform(?:er|ing)?|plateforme\w*|plateformer|sonic|metroidvania|celeste|side[- ]?scroll\w*|jump(?:ing)? (?:game|on)|runner)\b/i,
    doc: `<x-platformer tile="32" view="16"> holds an <x-legend> then the level rows in plain ASCII (no emoji in the rows). Characters not in the legend are empty air.
Legend line: <char> <role> [look] [effects] [stomp:effects] [hurt:effects] [needs:test] [as:name]
roles: ground (solid), brick (solid, a big player breaks it from below), block (solid, hit from below it gives its effects once), platform (solid only from above), player (start), coin (effects on touch), walker (walks, turns at walls and edges; stomp:... when it is stomped, hurt:... when it hurts you), flyer, spike (hurts), spring, checkpoint, flag (win).
The player is big while the state big is 1 or more; being hurt then sets big=0. Arrows or WASD move, Up or Space jump, Shift runs.
Attributes: gravity, jump, speed (tiles per second). Events: jump, land, coin, hit:block, stomp:<name>, hurt, flag. Add a rule for the end: <x-rule when="lives<=0" do="lose"></x-rule>`,
    example: `<x-platformer tile="32" view="16">
  <x-legend>
    # ground
    B brick
    ? block score+=10 coins+=1 "Coin!"
    P player
    o coin score+=1
    g walker as:goomba stomp:score+=100 hurt:lives-=1 🍄
    F flag
  </x-legend>
  ...................
  ...................
  ......?B?...........
  ..P...........g..oF
  ###################
</x-platformer>`,
  },
  {
    name: "dialog",
    purpose: "conversations with people: lines of text, questions with choices, effects on the state",
    words: /\b(rpg|jrpg|pok[eé]mon|zelda|npc|pnj|dialog\w*|conversation|story|histoire|visual novel|quest\w*|qu[eê]tes?|aventure|adventure)\b/i,
    doc: `<x-dialog id="elder"> holds <x-line who="Elder">text</x-line> lines; a line may have when="test", do="effects", id="mark", next="mark", ask="Question?" with <x-choice do="effects" goto="mark">Yes</x-choice> inside.
A conversation starts on the event talk:<id> (a map npc with as:elder starts talk:elder) or dialog:<id>. {name} in a text shows a state. When it ends the state talked_<id> goes up by 1.`,
    example: `<x-dialog id="elder">
  <x-line who="Elder" when="talked_elder==0">Welcome, traveller.</x-line>
  <x-line who="Elder" when="talked_elder>0">You again!</x-line>
  <x-line who="Elder" ask="Will you fetch my key?">
    <x-choice do="quest=1" goto="thanks">Yes</x-choice>
    <x-choice>Not now</x-choice>
  </x-line>
  <x-line id="thanks" who="Elder">Thank you, {name}.</x-line>
</x-dialog>`,
  },
  {
    name: "battle",
    purpose: "turn-based fights between creatures or characters, with moves, types, health and a result",
    words: /\b(pok[eé]mon|battle|combat\w*|tour par tour|turn[- ]?based|final fantasy|monsters?|monstres?|creatures?|cr[eé]atures?)\b/i,
    doc: `<x-battle id="b1" on-win="gold+=5" on-lose="lose"> holds <x-fighter side="you|enemy" name="Pikou" hp="20" attack="5" defense="3" speed="5" type="normal" sprite="🐭"> each with <x-move name="Tackle" power="5" type="normal" uses="10"></x-move>. Optional <x-type name="fire" strong="grass" weak="water"></x-type>.
A fight starts on the event battle:<id> (for example the effect emit:battle:b1 on a trap tile of a map). It ends with battle:won:<id>, battle:lost:<id> or battle:fled:<id> and sets the state battle_result. The health of a fighter is the state <name in lowercase>_hp, so a health bar is CSS: width: calc(var(--pikou_hp) / 20 * 100%).`,
    example: `<x-battle id="b1" on-win="gold+=5 say:'You won!'" on-lose="lose">
  <x-fighter side="you" name="Pikou" hp="20" attack="6" defense="3" speed="7" sprite="🐭">
    <x-move name="Tackle" power="5"></x-move>
    <x-move name="Spark" power="8" type="electric" uses="5"></x-move>
  </x-fighter>
  <x-fighter side="enemy" name="Rattak" hp="14" attack="5" defense="2" speed="4" sprite="🐀">
    <x-move name="Bite" power="6"></x-move>
  </x-fighter>
</x-battle>`,
  },
  {
    name: "timer",
    purpose: "something that happens every so often or after a delay, and a clock that shows a time",
    words: /\b(timer|chrono\w*|countdown|compte [àa] rebours|minuterie|time limit|temps limit\w*|clock|horloge|mario|speedrun|every \d+ ?s|toutes les \d+ ?s)\b/i,
    doc: `<x-timer every="1s" do="time+=1" while="time<99"></x-timer> runs its effects every so often (ms, s or m); after="3s" runs once after a delay; times="5" stops after 5 runs; start="test" waits for a test. <x-clock of="time" format="m:ss"></x-clock> shows a state as a time (s, m:ss, mm:ss).`,
    example: `<x-state time="300"></x-state>
<x-timer every="1s" do="time-=1" while="time>0"></x-timer>
<x-clock of="time" format="m:ss"></x-clock>
<x-rule when="time<=0" do="lose"></x-rule>`,
  },
  {
    name: "calc",
    purpose: "a number computed from other numbers or lists (totals, averages, counts), kept up to date by itself",
    words: /\b(calculat\w*|calcul\w*|total|budget|convertisseur|converter|average|moyenne|sum|somme|expenses?|d[eé]penses?|price|prix|tracker|suivi|stats?)\b/i,
    doc: `<x-calc name="total" value="price * qty + 1"></x-calc> keeps the state total equal to an arithmetic expression of the state (+ - * / %, parentheses, min max round floor ceil abs, count(list), count(list, field == value), sum(list, field)).`,
    example: `<x-state items='[{"name":"Tea","price":3,"qty":2}]'></x-state>
<x-calc name="total" value="sum(items, price)"></x-calc>
<p>Total: <x-value of="total"></x-value></p>`,
  },
];

const byName = new Map(X_DOCS.map((d) => [d.name, d]));

/** The blocks a request calls for, read from its words (no model); a model is only asked when this finds nothing. */
export function blocksFor(request: string): string[] {
  const out = X_DOCS.filter((d) => d.words.test(request)).map((d) => d.name);
  if (out.includes("platformer") && !out.includes("timer")) out.push("timer");
  if (/\b(rpg|jrpg|pok[eé]mon|zelda|aventure|adventure)\b/i.test(request)) for (const n of ["map", "dialog"]) if (!out.includes(n)) out.push(n);
  return out;
}

export const xDoc = (name: string): XDoc | undefined => byName.get(name);

/** The core plus the page of each named block, cut to what the room allows (examples go first when there is little). */
export function docFor(names: string[], room: number): string {
  const docs = names.map((n) => byName.get(n)).filter((d): d is XDoc => !!d);
  let text = X_CORE_DOC + docs.map((d) => `\n\n${d.name.toUpperCase()}\n${d.doc}\nExample:\n${d.example}`).join("");
  if (text.length > room) text = X_CORE_DOC + docs.map((d) => `\n\n${d.name.toUpperCase()}\n${d.doc}`).join("");
  return text.length > room ? text.slice(0, Math.max(0, room)) : text;
}

/** The list of blocks with their purpose, for the step that decides which a section needs. */
export const catalogText = () => X_DOCS.map((d) => `- ${d.name}: ${d.purpose}`).join("\n");
