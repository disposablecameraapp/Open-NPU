import { describe, expect, it } from "vitest";
import { askCount, askInfo, askLook, snap, themeFromBrief } from "../src/core/deckBrief";
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
    expect(await askInfo(async () => ({ info: "enogh" }), "text")).toBe("enough");
    expect(await askInfo(async () => { throw new Error("down"); }, "text")).toBeNull();
  });
});

describe("a deck from a request with no facts", () => {
  it("searches once for the plan and once for each content slide, and cites those sources", async () => {
    const queries: string[] = [];
    const stream = (sid: string): AsyncGenerator<ChatEvent> => (async function* () {
      const text = sid.includes(":brief:") ? (sid.endsWith(":0") ? '{"count":0}' : sid.endsWith(":1") ? '{"setting":"work"}' : sid.endsWith(":2") ? '{"style":"corporate"}' : sid.endsWith(":3") ? '{"colour":"green"}' : '{"info":"none"}')
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
