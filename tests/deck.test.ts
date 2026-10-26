import { describe, expect, it } from "vitest";
import { makeDeck, parsePlan, slideCountOf, wantsDeck, chartIsUsable, parseSlideReply } from "../src/core/deckBuild";
import { LIMITS, deckHtml, layoutAll, slideProblems, slidesOf, themeOf, trimSlide } from "../src/core/slides";
import type { ChatEvent, ChatStats } from "../src/shared/types";

const stats: ChatStats = { ttftSec: 0.1, tokPerSec: 20, tokens: 10, totalSec: 0.5 };

describe("asking for a deck", () => {
  it("is recognised in English and French, and only for a new deck", () => {
    expect(wantsDeck("Make me a presentation about volcanoes", false)).toBe(true);
    expect(wantsDeck("fais-moi un powerpoint de 8 diapos sur les abeilles", false)).toBe(true);
    expect(wantsDeck("Make me a presentation about volcanoes", true)).toBe(false);
    expect(wantsDeck("summarize this presentation for me", false)).toBe(false);
    expect(wantsDeck("what is a slide deck?", false)).toBe(false);
    expect(slideCountOf("a 10 slides deck")).toBe(10);
    expect(slideCountOf("un diaporama de 8 diapos")).toBe(8);
    expect(slideCountOf("a deck")).toBeNull();
  });
});

describe("the plan", () => {
  const reply = "Title: Volcanoes\nTheme: sunrise\nSlide: cover | Volcanoes | none\nSlide: content | How they form | flow Magma rises -> Pressure builds -> Eruption\nSlide: content | Famous ones | image Mount Fuji volcano\nSlide: content | Deadliest | chart bar deaths\nSlide: closing | Respect them | none";
  it("is read, with the visuals the plan allows", () => {
    const p = parsePlan(reply, "volcanoes", null, true);
    expect(p.theme).toBe("sunrise");
    expect(p.slides.map((s) => s.visual)).toEqual(["none", "flow", "image", "chart", "none"]);
    expect(p.slides[0].role).toBe("cover");
    expect(p.slides[4].role).toBe("closing");
    expect(parsePlan(reply, "volcanoes", null, false).slides[2].visual).toBe("none");
  });
  it("falls back to an outline when the reply is garbage, and respects a requested count", () => {
    const p = parsePlan("blah", "bees", 5, false);
    expect(p.slides).toHaveLength(5);
    expect(p.slides[0].role).toBe("cover");
    expect(parsePlan(reply, "x", 3, true).slides).toHaveLength(3);
  });
});

describe("limits", () => {
  it("are checked and enforced", () => {
    const s = parseSlideReply("```\n# A very long title that goes on and on forever and ever\n- one\n- two\n- three\n- four\n- five\n- six\n- seven\n```")!;
    expect(slideProblems(s).length).toBeGreaterThan(0);
    const t = trimSlide(s);
    expect(slideProblems(t)).toEqual([]);
    expect(t.lines.length).toBeLessThanOrEqual(LIMITS.bullets);
  });
  it("a chart needs numbers", () => {
    const ok = slidesOf("# T\nChart: bar\n| a | b |\n|---|---|\n| x | 1 |\n| y | 2 |")[0];
    const bad = slidesOf("# T\nChart: bar\n| a | b |\n|---|---|\n| x | many |\n| y | few |")[0];
    expect(chartIsUsable(ok)).toBe(true);
    expect(chartIsUsable(bad)).toBe(false);
  });
});

describe("making a deck", () => {
  const fake = (replies: (sid: string) => string) => async function* (sid: string): AsyncGenerator<ChatEvent> {
    yield { id: "x", type: "answer", text: replies(sid) };
    yield { id: "x", type: "done", stats };
  };
  it("plans, writes within limits, checks every slide, fixes one, and returns a pptx artifact", async () => {
    const calls: string[] = [];
    let renders = 0;
    const gen = makeDeck({
      id: "x", messages: [{ role: "user", content: "Make a 4 slide presentation about bees" }],
      stream: fake((sid) => {
        calls.push(sid);
        if (sid.endsWith("deckplan")) return "Title: Bees\nTheme: forest\nSlide: cover | Bees | none\nSlide: content | Why they matter | flow Flowers -> Pollen -> Honey\nSlide: content | Facts | none\nSlide: closing | Protect them | none";
        if (sid.endsWith("deckexplain")) return "I made a 4 slide deck.";
        if (/slide0/.test(sid)) return "# Bees\nBuzzing facts";
        if (/slide1:0/.test(sid)) return "# Why they matter\n- one\n- two\n- three\n- four\n- five\n- six\n- seven\n- eight";
        if (/slide1:1/.test(sid)) return "# Why they matter\n- Pollination\n- Honey\nFlow: Flowers -> Pollen -> Honey";
        if (/fix/.test(sid)) return "# Facts\n- Short";
        if (/slide2/.test(sid)) return "# Facts\n- 20000 species\n- Live in colonies";
        return "# Protect them\nPlant flowers";
      }),
      render: async (html) => { renders++; expect(html).toContain("slide"); return { shot: "data:image/jpeg;base64,AAAA", problems: /Facts/.test(html) && renders < 6 && !/Short/.test(html) ? ["text cut off"] : [] }; }
    });
    const events: ChatEvent[] = [];
    let r;
    for (;;) { const n = await gen.next(); if (n.done) { r = n.value; break; } events.push(n.value); }
    expect(r.handled).toBe(true);
    if (!r.handled) return;
    expect(r.text).toContain('<artifact type="pptx" title="Bees">');
    expect(r.text).toContain("Theme: forest");
    expect(r.text).toContain("Flow: Flowers -> Pollen -> Honey");
    expect(r.text).not.toContain("- eight");
    expect(themeOf(r.text).id).toBe("forest");
    expect(layoutAll(r.text.replace(/<\/?artifact[^>]*>/g, "")).slides).toHaveLength(4);
    expect(calls.some((c) => /fix2/.test(c))).toBe(true);
    const builds = events.filter((e) => e.type === "build");
    const last = builds[builds.length - 1];
    expect(last.type === "build" && last.build.status).toBe("done");
    expect(last.type === "build" && last.build.steps).toHaveLength(4);
    expect(last.type === "build" && last.build.steps[2].stages!.map((s) => s.id)).toEqual(["write", "run", "fix"]);
  });
  it("adds a Wikimedia picture, and goes on without when none loads", async () => {
    const gen = makeDeck({
      id: "x", messages: [{ role: "user", content: "make a deck about Fuji" }],
      stream: fake((sid) => sid.endsWith("deckplan") ? "Title: Fuji\nTheme: clean\nSlide: cover | Fuji | none\nSlide: content | The mountain | image Mount Fuji\nSlide: content | The lake | image Lake Kawaguchi\nSlide: closing | End | none" : sid.endsWith("deckexplain") ? "Done." : /slide0/.test(sid) ? "# Fuji\nJapan" : /slide3/.test(sid) ? "# End\nBye" : "# Topic\n- A\n- B"),
      candidates: async (q) => (/Fuji/.test(q) ? [{ file: "Fuji.jpg", description: "Mount Fuji", license: "CC0" }] : [{ file: "Broken.jpg", description: "x", license: "CC0" }]),
      picture: async (f) => (f === "Fuji.jpg" ? { dataUrl: "data:image/png;base64,iVBORw0KGgo=", mime: "image/png", w: 10, h: 10, credit: "Photo: me" } : null)
    });
    let r;
    for (;;) { const n = await gen.next(); if (n.done) { r = n.value; break; } }
    expect(r.handled && r.text).toContain("![Mount Fuji](wikimedia:Fuji.jpg)");
    expect(r.handled && r.text).not.toContain("Broken.jpg");
    expect(deckHtml("# A\n![c](wikimedia:Fuji.jpg)", { "Fuji.jpg": { dataUrl: "data:image/png;base64,iVBORw0KGgo=", mime: "image/png", w: 10, h: 10, credit: "Photo: me" } })).toContain("<img");
  });

  it("draws a diagram through the window and keeps the slide's text when it cannot be drawn", async () => {
    const stream = fake((sid) => sid.endsWith("deckplan") ? "Title: Eruptions\nTheme: midnight\nSlide: cover | Eruptions | none\nSlide: content | History | diagram timeline Big eruptions\nSlide: closing | End | none" : sid.endsWith("deckexplain") ? "Done." : /slide0/.test(sid) ? "# Eruptions\nA history" : /slide2/.test(sid) ? "# End\nBye" : "# History\n- Dates matter\n```mermaid\ntimeline\n  79 : Vesuvius\n  1883 : Krakatoa\n```");
    const run = async (draw: boolean) => {
      const asked: string[] = [];
      const gen = makeDeck({ id: "x", messages: [{ role: "user", content: "make a deck about eruptions" }], stream, figure: async (lang, raw) => { asked.push(`${lang}:${raw.split("\n")[0]}`); return draw ? { dataUrl: "data:image/png;base64,iVBORw0KGgo=", mime: "image/png", w: 800, h: 400, credit: "" } : null; } });
      let r;
      for (;;) { const n = await gen.next(); if (n.done) { r = n.value; break; } }
      return { r, asked };
    };
    const ok = await run(true);
    expect(ok.asked).toEqual(["mermaid:timeline"]);
    expect(ok.r.handled && ok.r.text).toContain("```mermaid\ntimeline");
    const failed = await run(false);
    expect(failed.r.handled && failed.r.text).not.toContain("mermaid");
    expect(failed.r.handled && failed.r.text).toContain("Dates matter");
  });
});

describe("slide text from a model", () => {
  it("drops a 'Slide 4:' label the model put in front of the title", () => {
    expect(parseSlideReply("# Slide 4: Expansion of Trade Agreements\n- ASEAN 1995")?.title).toBe("Expansion of Trade Agreements");
    expect(parseSlideReply("# Slide 12 - Conclusion\n- one")?.title).toBe("Conclusion");
  });
  it("reads a long source text whole, in the planner and the writer", async () => {
    const { deckPlannerPrompt, hasSource } = await import("../src/core/deckBuild");
    const text = `${"Fact about trade. ".repeat(150)}FINAL-CONCLUSION`;
    expect(hasSource(text)).toBe(true);
    expect(deckPlannerPrompt(text, null, false)).toContain("FINAL-CONCLUSION");
  });
});

describe("richer slides", () => {
  it("reads and writes stats and columns, and lays them out with a bullet or alone", async () => {
    const { slidesOf, layoutSlide, THEMES } = await import("../src/core/slides");
    const { slideSource } = await import("../src/core/deckBuild");
    const [a, b] = slidesOf("# Key numbers\nStats: $930bn | Trade in 2025 ; 180% | of GDP ; 8% | Growth\n- Open economy\n\n---\n\n# Three pillars\nColumn: Institutions | WTO 2007 ; IMF member\nColumn: Trade | 17 FTAs ; CPTPP\nColumn: Capital | $27.6bn FDI ; Samsung 13%");
    expect(a.stats).toHaveLength(3);
    expect(b.columns).toHaveLength(3);
    expect(slidesOf(slideSource(a))[0].stats).toEqual(a.stats);
    expect(slidesOf(slideSource(b))[0].columns).toEqual(b.columns);
    const t = THEMES[0];
    const la = layoutSlide(a, t, { index: 1, count: 3, pics: {} });
    expect(la.above.filter((p) => p.k === "round")).toHaveLength(3);
    expect(la.body).toBeDefined();
    const lb = layoutSlide(b, t, { index: 2, count: 3, pics: {} });
    expect(lb.overflow).toEqual([]);
    expect(lb.above.filter((p) => p.k === "rect" && p.text).length).toBe(3);
  });
});

describe("slide look and text blocks", () => {
  it("reads Style, Callout and Quote, keeps the text readable on a dark background, and round-trips", async () => {
    const { slidesOf, layoutSlide, styledTheme, THEMES } = await import("../src/core/slides");
    const { slideSource } = await import("../src/core/deckBuild");
    const [a] = slidesOf('# Key message\nStyle: bg=navy accent=orange font=Georgia size=large\nCallout: Vietnam opened up and grew\nQuote: Trade is the engine | A minister\n- one');
    expect(a.style).toEqual({ bg: "1E3A8A", accent: "EA580C", font: "Georgia", size: "large" });
    expect(a.blocks).toHaveLength(2);
    expect(slidesOf(slideSource(a))[0].style).toEqual(a.style);
    const t = styledTheme(THEMES[0], a.style);
    expect(t.dark).toBe(true);
    expect(t.text).toBe("F1F5F9");
    expect(t.bodyFont).toBe("Georgia");
    expect(styledTheme(THEMES[0], { bg: "FFFFFF", accent: "FFFFFF" }).accent).toBe(THEMES[0].accent);
    const l = layoutSlide(a, THEMES[0], { index: 1, count: 3, pics: {} });
    expect(l.bg).toBe("1E3A8A");
    expect(l.overflow).toEqual([]);
  });
});

describe("sources and exact quotes", () => {
  const src = "Vietnam joined the WTO in January 2007 as its 150th member, after eleven years of negotiations. Foreign-invested firms produce 77% of exports.";
  it("keeps a quote that is in the text, repairs a reworded one with the real sentence, drops an invented one", async () => {
    const { exactQuote } = await import("../src/core/deckBuild");
    expect(exactQuote("Foreign-invested firms produce 77% of exports", src)).toBe("Foreign-invested firms produce 77% of exports.");
    expect(exactQuote("Foreign invested companies produce 77% of the exports", src)).toBe("Foreign-invested firms produce 77% of exports.");
    expect(exactQuote("Vietnam is the best economy in the world today", src)).toBeNull();
  });
  it("lists the sources of the web research, the cited ones first", async () => {
    const { webSources, sourcesSlide, userRequest } = await import("../src/core/deckBuild");
    const req = `make a deck about Vietnam\n\n<search_results query="v">\nSources:\n[1] Trade report — https://www.example.org/a\n[2] IMF note — https://imf.org/b\n</search_results>`;
    expect(userRequest(req)).toBe("make a deck about Vietnam");
    const found = webSources(req);
    expect(found.map((f) => f.n)).toEqual([1, 2]);
    const s = sourcesSlide([{ title: "x", lines: [{ text: "Exports rose [2]", level: 0, bullet: true }], table: null, notes: "" }], found)!;
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].text).toContain("imf.org");
  });
});

describe("changing a finished deck", () => {
  it("an edit block changes one line of the text form, and the new elements still build a real .pptx", async () => {
    const { applyEdits } = await import("../src/core/review");
    const { buildPptx, slidesOf } = await import("../src/core/slides");
    const src = "Theme: clean\n\n---\n\n# Cover\nA subtitle\n\n---\n\n# Numbers\nStyle: bg=navy accent=orange font=Georgia\nStats: $930bn | Trade ; 180% | of GDP\nCallout: Opened up and grew\nQuote: Trade is the engine | A minister\n\n---\n\n# Pillars\nColumn: A | one ; two\nColumn: B | three ; four\n";
    const r = applyEdits(src, [{ search: "Stats: $930bn | Trade ; 180% | of GDP", replace: "Stats: $930bn | Trade ; 180% | of GDP ; 8% | Growth" }, { search: "bg=navy", replace: "bg=teal" }]);
    expect(r.applied).toBe(2);
    const [, b] = slidesOf(r.content);
    expect(b.stats).toHaveLength(3);
    expect(b.style?.bg).toBe("0D9488");
    const bytes = await buildPptx(r.content);
    expect(bytes.length).toBeGreaterThan(2000);
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe("PK");
  });
});

describe("a small model misusing the format", () => {
  it("does not take Stats / Columns for a slide topic, and reads a directive whose text is on the next line", async () => {
    const { parsePlan, statsFromLines } = await import("../src/core/deckBuild");
    const { slidesOf } = await import("../src/core/slides");
    const plan = parsePlan("Title: Vietnam\nTheme: sunrise\nSlide: cover | Vietnam | none\nSlide: content | Institutions | none\nSlide: content | Stats | stats exports; FDI\nSlide: content | Columns: Pillars | none\nSlide: content | Columns | columns a; b\nSlide: closing | Conclusion | none", "x", null, false);
    expect(plan.slides.map((s) => s.topic)).toEqual(["Vietnam", "Institutions", "exports", "Pillars", "a", "Conclusion"]);
    expect(plan.slides[3].visual).toBe("columns");
    const [a] = slidesOf("# Columns: Pillars\nCallout:\n Opened up and grew\n- one");
    expect(a.title).toBe("Pillars");
    expect(a.blocks?.[0].text).toBe("Opened up and grew");
    const d = statsFromLines([{ text: "Exports reached $475bn [2]" }, { text: "FDI reached $27.6bn in 2025" }, { text: "GDP grew by 8%" }, { text: "Open since 1986" }]);
    expect(d?.stats.map((x) => x.value)).toEqual(["$475bn", "$27.6bn", "8%"]);
  });
});
