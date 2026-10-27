import { describe, expect, it } from "vitest";
import { X_TAGS, xFlaws, xMend } from "../src/core/xcheck";

/* Sound pages: each one must give no flaw. The tests change one thing at a time with edit(). */
const MAP_PAGE = `<x-state hp="3" key="0" gold="0"></x-state>
<x-scene id="hall">
  <p>Or : <x-value of="gold"></x-value></p>
  <x-rule when="hp <= 0" do="lose"></x-rule>
  <x-map id="crypt" tile="32" view="11x9">
    <x-legend>
      # wall
      @ player
      K item key+=1 "Une clé !"
      D door needs:key
      E exit
    </x-legend>
    ##########
    #@.......#
    #...K....#
    #####D####
    #........#
    #.......E#
    ##########
  </x-map>
</x-scene>`;

const PLATFORMER_PAGE = `<x-state lives="3" coins="0"></x-state>
<x-platformer tile="32" view="16" gravity="40" jump="14" speed="7" fall="lives-=1">
  <x-legend>
    # ground
    @ player
    $ coin coins+=1
    F flag
  </x-legend>
    ........F
    ..$.....#
    @.......#
    #########
</x-platformer>`;

const BATTLE_PAGE = `<x-state gold="0"></x-state>
<x-scene id="road">
  <button data-click="emit:battle:b1">Combattre</button>
  <x-battle id="b1" on-win="win" on-lose="lose">
    <x-type name="fire" strong="grass" weak="water"></x-type>
    <x-fighter side="you" name="Pikou" hp="20" attack="5" defense="3" speed="5" type="fire" sprite="🐭">
      <x-move name="Charge" power="5" type="fire" uses="10"></x-move>
    </x-fighter>
    <x-fighter side="enemy" name="Rattus" hp="12" attack="4" defense="2" speed="3">
      <x-move name="Morsure" power="4" uses="8" effect="gold+=1"></x-move>
    </x-fighter>
  </x-battle>
</x-scene>`;

const DIALOG_PAGE = `<x-state gold="0"></x-state>
<x-dialog id="ancien" speed="40">
  <x-line who="Ancien" id="debut" ask="Tu veux de l'or ?">Bonjour, voyageur.
    <x-choice goto="oui">Oui</x-choice>
    <x-choice goto="fin">Non</x-choice>
  </x-line>
  <x-line id="oui" do="gold+=5" next="end">Voilà {gold} pièces.</x-line>
  <x-line id="fin" next="end">Au revoir.</x-line>
</x-dialog>
<button data-click="emit:dialog:ancien">Parler</button>
<x-timer every="1s" do="time+=1" times="3"></x-timer>
<x-clock of="time" format="m:ss"></x-clock>
<x-calc name="double" value="gold * 2 + 1"></x-calc>
<x-value of="double"></x-value>`;

const APP_PAGE = `<x-state tasks='[{"title":"Lait","done":false}]' draft=""></x-state>
<form data-submit="add:tasks {title: draft, done: false} draft=''">
  <input data-bind="draft" placeholder="Nouvelle tâche">
  <button>Ajouter</button>
</form>
<x-list of="tasks"><template>
  <li data-click="toggle:tasks.{index}.done">{title}</li>
</template></x-list>
<p><x-value of="tasks.length"></x-value> tâches</p>
<x-calc name="open" value="count(tasks, done == false)"></x-calc>
<x-value of="open"></x-value>`;

const CORE_PAGE = `<x-state name="Ana" gold="0" door="0" items='[{"name":"clé"}]'></x-state>
<x-rule when="(gold >= 1 || !door) && name == 'Ana'" do="door=1 gold++ name = &quot;Ana&quot; say:&quot;Hi&quot; remove:items 0"></x-rule>
<x-rule when="items.length >= 1 && true" do="toggle:door"></x-rule>
<x-rule when="" do="restart"></x-rule>
<button data-click="gold+=1 gold -= 1 gold++ gold--">Test</button>
<button data-key="Space: gold+=1; ArrowLeft: gold-=1">Touches</button>`;

/** Replaces one piece of a page; the fixture must contain it. */
function edit(page: string, from: string, to: string): string {
  if (!page.includes(from)) throw new Error(`fixture does not contain: ${from}`);
  return page.replace(from, to);
}
const has = (flaws: string[], part: string) => flaws.some((f) => f.includes(part));

describe("xcheck: sound pages", () => {
  it("the example pages give no flaw", () => {
    for (const page of [MAP_PAGE, PLATFORMER_PAGE, BATTLE_PAGE, DIALOG_PAGE, APP_PAGE, CORE_PAGE]) expect(xFlaws(page)).toEqual([]);
  });
  it("X_TAGS lists the blocks of the sheets", () => {
    expect(Object.keys(X_TAGS)).toEqual(expect.arrayContaining(["state", "map", "platformer", "battle", "fighter", "move", "type", "dialog", "line", "choice", "timer", "clock", "calc"]));
  });
});

describe("xcheck: tags and attributes", () => {
  it("an unknown block gets the nearest known name", () => {
    expect(has(xFlaws(edit(DIALOG_PAGE, "<x-timer every", "<x-timr every")), "Unknown block <x-timr>: did you mean <x-timer>?")).toBe(true);
  });
  it("an unknown attribute gets the nearest known name", () => {
    expect(xFlaws(edit(MAP_PAGE, 'tile="32"', 'tiel="32"')).join()).toMatch(/"tiel".*"tile"/);
  });
  it("a number where a number is due is refused", () => {
    expect(has(xFlaws(edit(MAP_PAGE, 'tile="32"', 'tile="big"')), "must be a number")).toBe(true);
  });
  it("an event attribute with JavaScript is refused", () => {
    expect(has(xFlaws(edit(MAP_PAGE, "<p>Or", '<button onclick="gold+=1">+</button><p>Or')), '"onclick"')).toBe(true);
  });
  it("a script written by the author is refused, the page runtime is not", () => {
    expect(has(xFlaws(edit(MAP_PAGE, "</x-scene>", "<script>alert(1)</script></x-scene>")), "Write no <script>")).toBe(true);
    expect(xFlaws(edit(MAP_PAGE, "</x-scene>", '<script id="blocks">var a = 1;</script></x-scene>'))).toEqual([]);
  });
  it("a block that belongs to another one is refused where it is alone", () => {
    expect(has(xFlaws(edit(MAP_PAGE, "</x-scene>", '<x-move name="x"></x-move></x-scene>')), "must be inside <x-fighter>")).toBe(true);
  });
});

describe("xcheck: references", () => {
  it("a state read but never declared is found", () => {
    expect(has(xFlaws(edit(APP_PAGE, 'of="tasks.length"', 'of="taks.length"')), 'reads "taks.length"')).toBe(true);
  });
  it("go to a missing scene is found", () => {
    expect(has(xFlaws(edit(MAP_PAGE, "</x-scene>", '<button data-click="go:cave">Entrer</button></x-scene>')), 'no scene named "cave"')).toBe(true);
  });
  it("a battle started by its emit must exist", () => {
    const f = xFlaws(edit(BATTLE_PAGE, "emit:battle:b1", "emit:battle:b9"));
    expect(has(f, "emit:battle:b9 starts no battle")).toBe(true);
    expect(has(f, 'battle "b1"') || has(f, 'id="b1"')).toBe(true);
  });
  it("a choice that goes to a missing line is found", () => {
    expect(has(xFlaws(edit(DIALOG_PAGE, 'goto="fin"', 'goto="nowhere"')), '"nowhere"')).toBe(true);
  });
  it("a state that is not valid JSON is found", () => {
    expect(has(xFlaws(edit(APP_PAGE, '[{"title":"Lait","done":false}]', '[{"title": oops}]')), "not valid JSON")).toBe(true);
  });
  it("a state name that is not plain is found", () => {
    expect(has(xFlaws(edit(MAP_PAGE, 'key="0"', 'key.x="0"')), "is not plain")).toBe(true);
  });
});

describe("xcheck: effects, conditions and expressions", () => {
  it("a condition that core cannot read is found", () => {
    expect(has(xFlaws(edit(MAP_PAGE, 'when="hp <= 0"', 'when="hp-1 <= 0"')), "cannot be read")).toBe(true);
    expect(has(xFlaws(edit(MAP_PAGE, 'when="hp <= 0"', 'when="hp = 0"')), "use == to compare")).toBe(true);
  });
  it("text core skips in an effect is found", () => {
    expect(has(xFlaws(edit(DIALOG_PAGE, 'do="gold+=5"', 'do="gold+=5 ??? gold+=1"')), 'cannot read the effect "???"')).toBe(true);
  });
  it("an unknown effect and an operator without value are found", () => {
    expect(has(xFlaws(edit(DIALOG_PAGE, 'do="gold+=5"', 'do="foo:bar"')), 'unknown effect "foo"')).toBe(true);
    expect(has(xFlaws(edit(DIALOG_PAGE, 'do="gold+=5"', 'do="gold+="')), "has an operator but no value")).toBe(true);
  });
  it("a calc with an unknown function or a broken value is found", () => {
    expect(has(xFlaws(edit(DIALOG_PAGE, 'value="gold * 2 + 1"', 'value="min(gold, 2) + foo(3)"')), 'unknown function "foo"')).toBe(true);
    expect(has(xFlaws(edit(DIALOG_PAGE, 'value="gold * 2 + 1"', 'value="gold * +"')), "cannot be read")).toBe(true);
  });
  it("a timer time that is not a time is found", () => {
    expect(has(xFlaws(edit(DIALOG_PAGE, 'every="1s"', 'every="soon"')), "is a time")).toBe(true);
  });
  it("the forms core accepts pass, remove's index included", () => {
    expect(xFlaws(CORE_PAGE)).toEqual([]);
  });
  it("a game with no way to be won or lost is found", () => {
    const f = xFlaws(edit(edit(MAP_PAGE, ' do="lose"', ' say="Fin"'), "E exit", "E floor"));
    expect(has(f, "no way to be won or lost")).toBe(true);
  });
});

describe("xcheck: maps and levels", () => {
  it("rows of different widths are found", () => {
    expect(has(xFlaws(edit(MAP_PAGE, "#.......E#", "#.......E")), "not 10 characters wide")).toBe(true);
  });
  it("two players are found", () => {
    expect(has(xFlaws(edit(MAP_PAGE, "#...K....#", "#@..K....#")), "exactly one player character, it has 2")).toBe(true);
  });
  it("a picture in a map row is found", () => {
    expect(has(xFlaws(edit(MAP_PAGE, "#........#", "#...😀....#")), "printable ASCII")).toBe(true);
  });
  it("a map character missing from the legend is found", () => {
    expect(has(xFlaws(edit(MAP_PAGE, "K item key+=1", "Z item key+=1")), 'not in the legend: "K"')).toBe(true);
  });
  it("an exit behind a door nothing opens is found", () => {
    const f = xFlaws(edit(MAP_PAGE, "K item key+=1", "K floor"));
    expect(has(f, 'the door at row 4, column 6 needs "key"')).toBe(true);
    expect(has(f, "The exit cannot be reached")).toBe(true);
  });
  it("an exit walled in is found", () => {
    expect(has(xFlaws(edit(MAP_PAGE, "#.......E#", "#.......#E")), "walls block every way to it")).toBe(true);
  });
  it("a level with no flag is found", () => {
    expect(has(xFlaws(edit(PLATFORMER_PAGE, "F flag", "F floor")), "The level has no flag")).toBe(true);
  });
});

describe("xcheck: repairs", () => {
  it("repairs a page without a model, then the page is sound", () => {
    const bad = edit(
      edit(
        MAP_PAGE.replace(/x-map\b/g, "x-mapp").replace('tile="32"', 'tiel="32"').replace("#.......E#", "#.......E")
          .replace('hp="3" key="0" gold="0"', 'hp.max="3" key="0" gold="0"').replace('when="hp <= 0"', 'when="hp.max <= 0"'),
        "</x-scene>",
        '<button data-click="gold + 1">Plus</button></x-scene>',
      ),
      "K item key+=1",
      "K item key + 1",
    );
    expect(xFlaws(bad).length).toBeGreaterThan(0);
    const mended = xMend(bad);
    expect(xFlaws(mended.html)).toEqual([]);
    expect(mended.fixed.length).toBeGreaterThan(3);
    expect(mended.html).toContain('<x-map id="crypt" tile="32"');
    expect(mended.html).toContain("hp_max=");
    expect(mended.html).toContain('data-click="gold+=1"');
  });
  it("a sound page is left as it is", () => {
    expect(xMend(MAP_PAGE)).toEqual({ html: MAP_PAGE, fixed: [] });
    expect(xMend(APP_PAGE)).toEqual({ html: APP_PAGE, fixed: [] });
  });
  it("a block name too far from every known one is not guessed", () => {
    expect(has(xFlaws(xMend(edit(DIALOG_PAGE, "<x-timer every", "<x-zzqqq every")).html), "Unknown block <x-zzqqq>")).toBe(true);
  });
});

describe("drawn objects", () => {
  const asset = '<x-asset name="hero" size="28x36" about="a hero"><svg viewBox="0 0 28 36"><rect width="28" height="36"/></svg></x-asset>';
  it("knows the drawing blocks", () => {
    expect(xFlaws(`${asset}<x-art of="hero"></x-art>`)).toEqual([]);
  });
  it("says when an object placed by name is not drawn, and what it was probably meant to be", () => {
    expect(xFlaws(`${asset}<x-art of="hreo"></x-art>`).join()).toMatch(/no drawing named "hreo".*did you mean "hero"/);
    expect(xFlaws(`${asset}<x-platformer tile="32"><x-legend>\n# ground\nP player art:heroo\nF flag\n</x-legend>\n.PF\n###</x-platformer>`).join()).toMatch(/no drawing named "heroo"/);
  });
});
