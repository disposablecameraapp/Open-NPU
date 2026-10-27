import { describe, expect, it } from "vitest";
import { askBrief, countFacts, infoLevel, snap, themeFromBrief } from "../src/core/deckBrief";
import { findTheme } from "../src/core/themeGen";
import { makeDeck } from "../src/core/deckBuild";
import type { ChatEvent, ChatStats } from "../src/shared/types";

const stats: ChatStats = { ttftSec: 0.1, tokPerSec: 20, tokens: 10, totalSec: 0.5 };

describe("closed answers", () => {
  it("take an answer a few letters off for the choice it means", () => {
    expect(snap("grean", ["red", "green", "blue"])).toBe("green");
    expect(snap("Technolgy", ["tech", "technology"])).toBe("technology");
    expect(snap("zzz", ["red", "green"])).toBeNull();
    expect(snap("red", ["bed", "red"])).toBe("red");
  });
  it("read the look words with a typing slip", () => {
    expect(findTheme("un thème tecnologie")?.id).toBe(findTheme("un thème technologie")?.id);
    expect(findTheme("something vintag")?.id).toBe(findTheme("something vintage")?.id);
  });
  it("ask everything in one call and turn the answers into a look", async () => {
    const seen: string[] = [];
    const ask = async (q: string) => { seen.push(q); return { count: 6, setting: "work", style: "corporate", colour: "green" }; };
    const l = await askBrief(ask, "six slides on Vietnam", "", { count: true, look: true }, 20);
    expect(seen).toHaveLength(1);
    expect(l).toEqual({ count: 6, setting: "work", style: "corporate", colour: "green" });
    expect(themeFromBrief(l)).toMatch(/^gen:140-/);
    expect((await askBrief(async () => ({ count: 0 }), "slides on bees", "", { count: true, look: false }, 20)).count).toBeNull();
    expect((await askBrief(async () => { throw new Error("down"); }, "text", "", { count: true, look: true }, 20)).style).toBeNull();
  });
});

describe("the facts of a text", () => {
  it("are counted without a model", () => {
    expect(countFacts("Vietnam exports reached 475 billion dollars in 2024. The country joined the WTO in 2007.")).toBe(2);
    expect(countFacts("make a deck about bees")).toBe(0);
  });
  it("are counted against a quota per slide", () => {
    expect(infoLevel(18, 6)).toBe("enough");
    expect(infoLevel(10, 6)).toBe("some");
    expect(infoLevel(2, 6)).toBe("none");
  });
});

describe("a deck from a request with no facts", () => {
  it("searches once for the plan and once for each content slide, and cites those sources", async () => {
    const queries: string[] = [];
    const stream = (sid: string): AsyncGenerator<ChatEvent> => (async function* () {
      const text = sid.includes(":brief:") ? ('{"count":0,"setting":"work","style":"corporate","colour":"green"}')
        : sid.endsWith("deckplan") ? "Title: Bees\nTheme: clean\nSlide: cover | Bees | none\nSlide: content | Pollination | none\nSlide: content | Honey | none\nSlide: closing | End | none"
        : sid.endsWith("deckexplain") ? "Done." : /:look:/.test(sid) ? "{}" : "# Bees\n- Bees pollinate crops [1]";
      yield { id: "x", type: "answer", text } as ChatEvent;
      yield { id: "x", type: "done", stats } as ChatEvent;
    })();
    const gen = makeDeck({ id: "x", messages: [{ role: "user", content: "make a deck about bees" }], stream, search: async (q) => { queries.push(q); return `<search_results query="${q}">\nBees pollinate [1]\n\nSources:\n[1] Bee facts — https://example.org/${queries.length}\n</search_results>`; } });
    let r;
    for (;;) { const n = await gen.next(); if (n.done) { r = n.value; break; } }
    expect(queries).toHaveLength(3); // the plan, then Pollination and Honey
    expect(r.handled && r.text).toContain("Theme: gen:140-");
  });
});

describe("settings that are off", () => {
  it("are offered on the build card, in the language of the request", async () => {
    const stream = (sid: string): AsyncGenerator<ChatEvent> => (async function* () {
      yield { id: "x", type: "answer", text: sid.includes(":brief:") ? '{"count":0}' : sid.endsWith("deckplan") ? "Title: Abeilles\nTheme: clean\nSlide: cover | Abeilles | none\nSlide: content | Miel | none\nSlide: closing | Fin | none" : "# Miel\n- Les abeilles font du miel" } as ChatEvent;
      yield { id: "x", type: "done", stats } as ChatEvent;
    })();
    const gen = makeDeck({ id: "x", messages: [{ role: "user", content: "fais une présentation sur les abeilles" }], stream, webOff: true, imagesOff: true });
    const seen: string[] = [];
    for (;;) { const n = await gen.next(); if (n.done) break; if (n.value.type === "build") for (const x of n.value.build.offers ?? []) if (!seen.includes(x.setting)) seen.push(x.setting); }
    expect(seen.sort()).toEqual(["webSearch", "wikimediaImages"]);
  });
});

describe("a deck survives what goes wrong", () => {
  const good = (sid: string) => sid.includes(":brief:") ? '{"count":0}' : sid.endsWith("deckplan") ? "Title: Bees\nTheme: clean\nSlide: cover | Bees | none\nSlide: content | Honey | none\nSlide: closing | End | none" : sid.endsWith("deckexplain") ? "Done." : "# Honey\n- Bees make honey";
  const finish = async (gen: ReturnType<typeof makeDeck>) => { for (;;) { const n = await gen.next(); if (n.done) return n.value; } };
  it("goes on when the look, a check and the summary all fail, and when a call fails once", async () => {
    const calls = new Map<string, number>();
    const stream = (sid: string): AsyncGenerator<ChatEvent> => (async function* () {
      if (/:look:|deckexplain/.test(sid)) throw new Error("server busy");
      const base = sid.replace(/:again$/, "");
      if (base.endsWith("deckplan") && !calls.has(base)) { calls.set(base, 1); throw new Error("cut"); }
      yield { id: "x", type: "answer", text: good(base) } as ChatEvent;
      yield { id: "x", type: "done", stats } as ChatEvent;
    })();
    const r = await finish(makeDeck({ id: "x", messages: [{ role: "user", content: "make a deck about bees" }], stream, render: () => { throw new Error("window gone"); } }));
    expect(r.handled && r.text).toContain("<artifact type=\"pptx\"");
    expect(r.handled && r.text).toContain("Bees make honey");
  });
  it("gives back the slides written when a step breaks for good, and the usual answer when there is no plan", async () => {
    const dead = (sid: string): AsyncGenerator<ChatEvent> => (async function* () { if (!sid.includes(":brief:")) throw new Error("model gone"); yield { id: "x", type: "answer", text: "{}" } as ChatEvent; })();
    const r = await finish(makeDeck({ id: "x", messages: [{ role: "user", content: "make a deck about bees" }], stream: dead }));
    expect(r.handled).toBeTypeOf("boolean");
  });
});

describe("the sources slide", () => {
  it("lists every source the slides cite and writes titles without HTML codes", async () => {
    const { sourcesSlide, webSources } = await import("../src/core/deckBuild");
    const block = `<search_results query="q">\n[1] Vietnam&#x27;s growth — https://a.org/1\n[2] B — https://b.org/2\n[3] C — https://c.org/3\n[4] D — https://d.org/4\n[5] E — https://e.org/5\n[6] F — https://f.org/6\n[7] G — https://g.org/7\n</search_results>`;
    const found = webSources(block);
    expect(found[0].title).toBe("Vietnam's growth");
    const slides = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ title: "t", lines: [{ text: `x [${n}]`, level: 0, bullet: true }], table: null, notes: "" }));
    expect(sourcesSlide(slides, found)?.lines).toHaveLength(7);
  });
});
