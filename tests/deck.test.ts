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
