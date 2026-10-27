import { describe, expect, it } from "vitest";
import { changeDeck, joinDeck, obviousOps, opsFrom, slidesNamed, splitDeck, withoutPicture, withoutWord } from "../src/core/deckEdit";
import type { ChatEvent, ChatMessage } from "../src/shared/types";
import type { Session } from "../src/core/build";

const DECK = "Theme: sunrise | accent=FF9800\n\n---\n\n# Vietnam\nLayout: cover\nSubtitle: A country\n\n---\n\n# Agenda\n- Trade\n- Growth\n\n---\n\n# Trade\n- Exports up\n- FDI\n";
const chat = (request: string): ChatMessage[] => [
  { role: "user", content: "make a deck" },
  { role: "assistant", content: `<artifact type="pptx" title="Vietnam">\n${DECK}</artifact>\n\nDone.` },
  { role: "user", content: request }
];
const say = (...replies: string[]): Session => {
  let i = 0;
  return async function* () { const text = replies[Math.min(i++, replies.length - 1)]; yield { id: "x", type: "answer", text } as ChatEvent; } as unknown as Session;
};
async function play(request: string, stream: Session, extra = {}) {
  const events: ChatEvent[] = [];
  const g = changeDeck({ id: "x", messages: chat(request), stream, ...extra });
  let r = await g.next();
  while (!r.done) { events.push(r.value); r = await g.next(); }
  return { events, result: r.value, text: r.value.handled ? r.value.text : "" };
}
const deckOf = (text: string) => /<artifact[^>]*>\n([\s\S]*?)\n<\/artifact>/.exec(text)![1];

describe("the parts of a deck", () => {
  it("cuts a deck into its Theme line and its slides and puts it back", () => {
    const d = splitDeck(DECK);
    expect(d.head).toMatch(/^Theme: sunrise/);
    expect(d.parts).toHaveLength(3);
    expect(splitDeck(joinDeck(d)).parts).toEqual(d.parts);
  });
  it("finds the slides a request names", () => {
    expect(slidesNamed("on slide 1 it says", 3)).toEqual([1]);
    expect(slidesNamed("slides 2 and 3: shorter", 3)).toEqual([2, 3]);
    expect(slidesNamed("make every slide shorter", 3)).toBe("all");
    expect(slidesNamed("on slide 9", 3)).toEqual([]);
  });
  it("takes a word out with its label, a picture off a slide", () => {
    expect(withoutWord("# Vietnam\nSubtitle: A country\nLayout: cover", "subtitle")).toBe("# Vietnam\nA country\nLayout: cover");
    expect(withoutPicture("# T\n- a\n![c](wikimedia:Cat.jpg)")).toBe("# T\n- a");
  });
  it("reads the operations of a model and drops what does not hold", () => {
    const ops = opsFrom({ ops: [{ op: "edit", slides: [2, 9], what: "shorter" }, { op: "delete", slides: [1, 2, 3] }, { op: "add", after: 1, what: "risks" }, { op: "edit", all: true, what: "" }, { op: "none" }] }, 3);
    expect(ops).toEqual([{ op: "edit", slides: [2], what: "shorter" }, { op: "add", after: 1, what: "risks" }]);
  });
  it("recognises the obvious changes without a model", () => {
    expect(obviousOps('on slide 1 it says "subtitle" in front of the subtitle, remove that word', 3)).toEqual([{ op: "word", slides: [1], what: "subtitle" }]);
    expect(obviousOps("delete slide 2", 3)).toEqual([{ op: "delete", slides: [2] }]);
    expect(obviousOps("add a picture of a lotus to slide 3", 3)).toEqual([{ op: "picture", slides: [3], what: "lotus" }]);
    expect(obviousOps("make it more colourful", 3)).toBeNull();
  });
});

describe("changing a deck", () => {
  it("takes a word out of one slide with no model call and leaves the others as they are", async () => {
    const never = (async function* () { throw new Error("the model must not be called"); }) as unknown as Session;
    const { text } = await play('on slide 1 it says "subtitle" in front of the subtitle, remove that word', never);
    const d = splitDeck(deckOf(text));
    expect(d.parts[0]).toContain("A country");
    expect(d.parts[0]).not.toMatch(/subtitle/i);
    expect(d.parts.slice(1)).toEqual(splitDeck(DECK).parts.slice(1));
    expect(d.head).toBe(splitDeck(DECK).head);
  });
  it("deletes and moves slides", async () => {
    const never = (async function* () { throw new Error("no model"); }) as unknown as Session;
    const gone = await play("delete slide 2", never);
    expect(splitDeck(deckOf(gone.text)).parts.map((t) => t.split("\n")[0])).toEqual(["# Vietnam", "# Trade"]);
    const moved = await play("swap the order of the slides", say(JSON.stringify({ ops: [{ op: "move", slides: [3], after: 1 }] })));
    expect(splitDeck(deckOf(moved.text)).parts.map((t) => t.split("\n")[0])).toEqual(["# Vietnam", "# Trade", "# Agenda"]);
  });
  it("lets the model say which slides, then changes only their text with edit blocks", async () => {
    const plan = JSON.stringify({ ops: [{ op: "edit", slides: [3], what: "say 'Exports doubled'" }] });
    const edit = '<edit file="Vietnam">\n<<<<<<< SEARCH\n- Exports up\n=======\n- Exports doubled\n>>>>>>> REPLACE\n</edit>';
    const { text } = await play("make the trade slide stronger", say(plan, edit));
    const d = splitDeck(deckOf(text));
    expect(d.parts[2]).toContain("Exports doubled");
    expect(d.parts[0]).toBe(splitDeck(DECK).parts[0]);
    expect(d.parts[1]).toBe(splitDeck(DECK).parts[1]);
  });
  it("adds a slide where it is asked and changes the theme", async () => {
    const plan = JSON.stringify({ ops: [{ op: "add", after: 1, what: "risks" }, { op: "theme", what: "ocean blue" }] });
    const { text } = await play("add a slide about risks after the first and make it blue", say(plan, "# Risks\n- Tariffs\n- Dependence"));
    const d = splitDeck(deckOf(text));
    expect(d.parts.map((t) => t.split("\n")[0])).toEqual(["# Vietnam", "# Risks", "# Agenda", "# Trade"]);
    expect(d.head).toMatch(/^Theme: /);
    expect(d.head).not.toContain("accent=FF9800");
  });
  it("leaves a question to the usual answer", async () => {
    const r = await play("what is on the third slide?", say(JSON.stringify({ ops: [{ op: "none" }] })));
    expect(r.result.handled).toBe(false);
  });
  it("reports a picture it cannot look for instead of failing", async () => {
    const never = (async function* () { throw new Error("no model"); }) as unknown as Session;
    const { text } = await play("add a picture of a lotus to slide 3", never);
    expect(text).toMatch(/Pictures tool is off/);
    expect(deckOf(text)).toBe(joinDeck(splitDeck(DECK)).trim());
  });
});

import { deckHtml } from "../src/core/slides";
describe("the numbers of the slides", () => {
  it("are in the margin of the preview, outside the slides, and not in a one-slide screenshot", () => {
    const html = deckHtml(DECK);
    expect([...html.matchAll(/<div class="no"[^>]*><b>(\d+)<\/b><\/div><section class="slide"/g)].map((m) => m[1])).toEqual(["1", "2", "3"]);
    expect(deckHtml(DECK, {}, 1)).not.toContain('class="no"');
  });
});
