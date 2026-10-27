import { describe, expect, it } from "vitest";
import { askCount, askFacts, askLook, groundedFacts, infoLevel, snap, themeFromBrief } from "../src/core/deckBrief";
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
  it("ask the questions one after the other and turn the answers into a look", async () => {
    const seen: string[] = [];
    const answers = [{ setting: "work" }, { style: "corporate" }, { colour: "green" }];
    const ask = async (q: string) => { seen.push(q); return answers.shift() ?? null; };
    const l = await askLook(ask, "slides on Vietnam", "");
    expect(seen).toHaveLength(3);
    expect(l).toEqual({ setting: "work", style: "corporate", colour: "green" });
    expect(themeFromBrief(l)).toMatch(/^gen:140-/);
    expect(await askCount(async () => ({ count: 6 }), "six slides on bees", 20)).toBe(6);
    expect(await askCount(async () => ({ count: 0 }), "slides on bees", 20)).toBeNull();
    expect(await askFacts(async () => { throw new Error("down"); }, "text")).toEqual([]);
  });
});

describe("the facts of a text", () => {
  const text = "Vietnam exports reached 475 billion dollars in 2024. The country joined the WTO in 2007.";
  it("are only the ones the text holds", () => {
    expect(groundedFacts(["Vietnam exports reached 475 billion dollars in 2024", "Vietnam has 100 million inhabitants and a famous cuisine", 3], text)).toEqual(["Vietnam exports reached 475 billion dollars in 2024"]);
  });
  it("are accepted when worded a little differently", () => {
    const got = groundedFacts(["Vietnam's exports hit $475bn in 2024", "It became a WTO member in 2007", "Exported goods reach 475,000 million dollars"], text);
    expect(got).toHaveLength(3);
    expect(groundedFacts(["Vietnam has 90 million inhabitants"], text)).toEqual([]);
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
      const text = sid.includes(":brief:") ? (sid.endsWith(":0") ? '{"count":0}' : sid.endsWith(":1") ? '{"setting":"work"}' : sid.endsWith(":2") ? '{"style":"corporate"}' : sid.endsWith(":3") ? '{"colour":"green"}' : '{"facts":[]}')
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
