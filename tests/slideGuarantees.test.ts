import { describe, expect, it } from "vitest";
import type { ChatEvent, ChatStats } from "../src/shared/types";
import { applyRules, deckRules, RULES } from "../src/core/slideRules";
import { auditDeck, bulletFrom, figuresOf, groundSlide, namesOf, retrieve, sourceOf, ungrounded } from "../src/core/ground";
import { THEMES, type Slide } from "../src/core/slides";
import { factsFrom, makeDeck } from "../src/core/deckBuild";

const SOURCE = "Vietnam joined the WTO in January 2007 as its 150th member, after eleven years of negotiations. In 2025 trade reached about $930bn, roughly 180% of its $514bn GDP. Foreign-invested firms produce 77% of exports. Samsung alone makes about 13% of its exports. Conclusion: integration creates dependence on foreign firms and on the US market.";
const stats: ChatStats = { ttftSec: 0, tokPerSec: 10, tokens: 5, totalSec: 1 };

// a small seeded generator, so a failure can be replayed
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe("figures and names are held to the source", () => {
  const src = sourceOf(SOURCE);
  it("reads figures in their usual spellings", () => {
    expect(figuresOf("$27.6bn, 46% and 1 986, in 2025 [2]")).toEqual(["27.6", "46", "1986", "2025"]);
    expect(namesOf("Vietnam joined the WTO with Samsung")).toContain("wto");
  });
  it("finds an invented figure or name, and not a true one", () => {
    expect(ungrounded("Trade reached $930bn in 2025", src)).toEqual([]);
    expect(ungrounded("Trade reached $950bn", src)).toEqual(["950"]);
    expect(ungrounded("Exports by Huawei reach 13%", src)).toEqual(["huawei"]);
  });
  it("takes an unsupported line out and keeps the rest", () => {
    const s: Slide = { title: "Foreign capital", lines: ["Samsung makes 13% of exports", "Apple makes 40% of exports", "Foreign firms produce 77% of exports"].map((text) => ({ text, level: 0, bullet: true })), table: null, notes: "", stats: [{ value: "13%", label: "Samsung" }, { value: "99%", label: "Samsung" }] };
    const g = groundSlide(s, src);
    expect(g.slide.lines.map((l) => l.text)).toEqual(["Samsung makes 13% of exports", "Foreign firms produce 77% of exports"]);
    expect(g.removed).toHaveLength(2);
    expect(g.slide.stats).toBeUndefined();
  });
  it("finds the passages of a slide, and sets a reworded one right", () => {
    expect(retrieve(SOURCE, "Foreign capital and exports", 2).join(" ")).toContain("Foreign-invested firms");
    const f = factsFrom("Foreign invested companies produce 77% of the exports\nNONE\nMade up sentence about nothing at all", SOURCE, "Foreign firms", "content");
    expect(f[0]).toBe("Foreign-invested firms produce 77% of exports.");
    expect(f.every((x) => SOURCE.includes(x))).toBe(true);
    expect(bulletFrom("Samsung alone makes about 13% of its exports; the rest is small.")).toBe("Samsung alone makes about 13% of its exports");
  });
});

describe("the rules hold whatever a model writes", () => {
  const words = "trade growth firms reform market export capital tariff supply chain labour reserves currency institution agreement membership".split(" ");
  const line = (r: () => number) => ({ text: Array.from({ length: 1 + Math.floor(r() * 24) }, () => words[Math.floor(r() * words.length)]).join(" ") + (r() < 0.4 ? "." : ""), level: 0, bullet: r() < 0.8 });
  it("after applyRules no repairable rule still fails, for a hundred random slides", () => {
    const r = rng(7);
    for (let k = 0; k < 100; k++) {
      const s: Slide = { title: words[Math.floor(r() * words.length)] + (r() < 0.5 ? " shapes the whole economy" : ""), lines: Array.from({ length: Math.floor(r() * 12) }, () => line(r)), table: null, notes: "" };
      const ctx = { theme: THEMES[k % THEMES.length], role: "content" as const };
      const out = applyRules(s, ctx).slide;
      for (const rule of RULES.filter((x) => x.repair)) expect(rule.check(out, ctx), `${rule.id} on slide ${k}`).toBeNull();
      // and applying them again changes nothing
      expect(applyRules(out, ctx).fixed).toEqual([]);
    }
  });
  it("keeps what it moved: the words taken off a slide are in its notes", () => {
    const lines = Array.from({ length: 8 }, (_, k) => ({ text: `point number ${k} about trade and growth in the economy today`, level: 0, bullet: true }));
    const out = applyRules({ title: "A slide with far too many points", lines, table: null, notes: "" }, { theme: THEMES[0], role: "content" }).slide;
    for (const l of lines) expect(out.lines.some((x) => x.text === l.text) || out.notes.includes(l.text.replace(/\.$/, ""))).toBe(true);
  });
  it("a deck keeps one look and distinct titles", () => {
    const s = (title: string, font?: string) => ({ title, lines: [{ text: "x y z w", level: 0, bullet: true }], table: null, notes: "", style: font ? { font } : undefined }) as Slide;
    const d = deckRules([s("Same", "Georgia"), s("Same", "Cambria"), s("C", "Verdana"), s("D", "Arial"), s("E"), s("F")], ["a", "Other", "c", "d", "e", "f"]);
    expect(new Set(d.slides.map((x) => x.title)).size).toBe(6);
    expect(d.slides.filter((x) => x.style).length).toBeLessThanOrEqual(2);
  });
});

describe("a deck is tested before it is shown", () => {
  const fake = (replies: (sid: string) => string) => async function* (sid: string): AsyncGenerator<ChatEvent> {
    yield { id: "x", type: "answer", text: replies(sid) };
    yield { id: "x", type: "done", stats };
  };
  const long = `${SOURCE}\n${"Vietnam is an open economy and trade matters to its growth. ".repeat(12)}\n\ncreate a powerpoint presentation based on this text`;
  it("never keeps a figure or a name that the text does not hold, even when the model invents them", async () => {
    const gen = makeDeck({
      id: "x", messages: [{ role: "user", content: long }],
      stream: fake((sid) => {
        if (sid.endsWith("deckplan")) return "Title: Vietnam and the world\nTheme: clean\nSlide: cover | Vietnam | none\nSlide: content | Foreign capital | none\nSlide: content | Institutions | none\nSlide: closing | Conclusion | none";
        if (sid.endsWith("deckexplain")) return "I made a deck.";
        if (/:facts/.test(sid)) return "Foreign-invested firms produce 77% of exports.\nSamsung alone makes about 13% of its exports.";
        if (/slide1/.test(sid)) return "# Foreign firms drive exports\n- Foreign-invested firms produce 77% of exports\n- Apple invested $4bn in 2022\n- Samsung makes about 13% of exports";
        if (/slide2/.test(sid)) return "# Vietnam joined the WTO\n- Joined in 2007 as the 150th member\n- Hanoi hosted 40 summits";
        if (/slide3/.test(sid)) return "# Dependence is the risk\n- Dependence on foreign firms";
        return "# Vietnam\nAn open economy";
      })
    });
    let r; for (;;) { const n = await gen.next(); if (n.done) { r = n.value; break; } }
    expect(r.handled).toBe(true);
    if (!r.handled) return;
    for (const bad of ["Apple", "$4bn", "Hanoi", "40 summits"]) expect(r.text).not.toContain(bad);
    for (const good of ["77%", "150th", "13%"]) expect(r.text).toContain(good);
    const body = r.text.replace(/<\/?artifact[^>]*>/g, "");
    expect(auditDeck((await import("../src/core/slides")).slidesOf(body), long).checks.find((c) => c.id === "grounded")?.ok).toBe(true);
  });
});

describe("what the user asks for wins over the rules", () => {
  const fake = (replies: (sid: string) => string) => async function* (sid: string): AsyncGenerator<ChatEvent> {
    yield { id: "x", type: "answer", text: replies(sid) };
    yield { id: "x", type: "done", stats };
  };
  const eight = Array.from({ length: 7 }, (_, k) => `- Point ${k} about bees and the many things they do for the whole year`).join("\n");
  const deck = async (ask: string, brief = "NONE") => {
    const gen = makeDeck({
      id: "x", messages: [{ role: "user", content: ask }],
      stream: fake((sid) => {
        if (sid.endsWith("deckplan")) return "Title: Bees\nTheme: forest\nSlide: cover | Bees | none\nSlide: content | Why bees matter for farms | none\nSlide: closing | Protect bees | none";
        if (sid.endsWith("deckexplain")) return "Done.";
        if (sid.endsWith(":brief")) return brief;
        if (/slide0/.test(sid)) return "# Bees\nA short subtitle";
        if (/slide1/.test(sid)) return `# Why bees matter for farms\n${eight}`;
        return "# Protect bees\nPlant flowers";
      })
    });
    let r; for (;;) { const n = await gen.next(); if (n.done) { r = n.value; break; } }
    return r.handled ? r.text : "";
  };
  it("reads the words of the request, in English and French", async () => {
    const { switchesFromWords, parseBrief } = await import("../src/core/slideRules");
    expect([...switchesFromWords("make a dense deck with lots of text").keys()]).toContain("word-budget");
    expect([...switchesFromWords("fais une présentation avec beaucoup de texte").keys()]).toContain("word-budget");
    expect([...switchesFromWords("use a small font please").keys()]).toContain("readable-size");
    expect([...switchesFromWords("make a deck about bees").keys()]).toEqual([]);
    // a model cannot switch a rule off with words the user never wrote
    expect([...parseBrief("word-budget | lots of text\none-look | different fonts everywhere", "I want lots of text on each slide").keys()]).toEqual(["word-budget"]);
  });
  it("keeps the rules for an ordinary request, and lets go of them when the request goes against them", async () => {
    const ordinary = await deck("make a presentation about bees");
    expect(ordinary.split("\n").filter((l) => l.startsWith("- Point")).length).toBeLessThanOrEqual(4);
    const dense = await deck("make a dense presentation about bees with lots of text on each slide");
    expect(dense.split("\n").filter((l) => l.startsWith("- Point")).length).toBe(6);
  });
});
