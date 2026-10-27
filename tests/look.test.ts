import { describe, expect, it } from "vitest";
import { contrast } from "../src/core/color";
import { BG_KINDS, LOOK_SCHEMA, backgroundPrims, legalize, lookProblems, lookTweak, normalizeLook } from "../src/core/look";
import { generateTheme } from "../src/core/themeGen";
import { themeOf, THEMES } from "../src/core/slides";
import { makeDeck } from "../src/core/deckBuild";
import type { ChatEvent } from "../src/shared/types";

describe("legibility rules", () => {
  it("make every pair of colours readable, whatever was asked", () => {
    const base = THEMES[0];
    const bad = { ...base, bg: "FFFFFF", text: "F5F5F5", title: "FFFF00", muted: "EEEEEE", accent: "FFFFCC", accents: ["FFFFCC", "FAFAFA", "EEEEEE", "DDDDDD"], panel: "FFFFFF" };
    const { theme, fixes } = legalize(bad);
    expect(fixes.length).toBeGreaterThan(3);
    expect(contrast(theme.text, theme.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.title, theme.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.accent, theme.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme.text, theme.panel)).toBeGreaterThanOrEqual(4.5);
  });
  it("hold for the generated themes and for a tweak that asks for an unreadable text", () => {
    for (const hue of [0, 60, 140, 215, 300]) for (const m of ["light", "dark", "pastel", "vivid", "earthy", "mono"] as const) {
      const t = generateTheme(hue, m, "corporate");
      expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.title, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
    }
    const t = themeOf("Theme: clean | bg=FFFFFF text=FFFFFF title=FFFFEE\n\n---\n# a");
    expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("procedural backgrounds", () => {
  it("are the same for a seed and different for another, for every kind", () => {
    const t = THEMES[2];
    for (const k of BG_KINDS.filter((x) => x !== "plain" && x !== "gradient")) {
      const a = JSON.stringify(backgroundPrims(k, 11, t, 1)), b = JSON.stringify(backgroundPrims(k, 11, t, 1)), c = JSON.stringify(backgroundPrims(k, 12, t, 1));
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(20);
      if (k !== "grid") expect(c).not.toBe(a);
    }
    expect(backgroundPrims("plain", 1, t, 1)).toEqual([]);
  });
});

describe("the look as JSON", () => {
  it("says what is wrong, then keeps only what is valid", () => {
    const raw = { colors: { bg: "123", accent: "nope", accent2: "00FF00", accent3: "0000FF", text: "000000", title: "111111" }, fonts: { title: "Comic Sans", body: "georgia" }, background: { kind: "swirls", seed: 3 }, slides: [{ n: 99, bg: "FFFFFF" }, { n: 2, accent: "FF0000", background: "waves" }] };
    const problems = lookProblems(raw, 5);
    expect(problems.join("|")).toMatch(/accent "nope"/);
    expect(problems.join("|")).toMatch(/swirls/);
    expect(problems.join("|")).toMatch(/Comic Sans/);
    expect(problems.join("|")).toMatch(/slides\[0\]\.n/);
    expect(problems.join("|")).toMatch(/5 colours/);
    const look = normalizeLook(raw, 5);
    expect(look.colors).toMatchObject({ bg: "112233", accent2: "00FF00" });
    expect(look.colors?.accent).toBeUndefined();
    expect(look.fonts).toEqual({ title: undefined, body: "Georgia" });
    expect(look.background?.kind).toBeUndefined();
    expect(look.slides).toEqual([{ n: 2, bg: undefined, accent: "FF0000", accent2: undefined, background: "waves", seed: undefined }]);
    expect(lookProblems("text")).toHaveLength(1);
  });
  it("becomes the changes of the Theme line, which a theme reads", () => {
    const tweak = lookTweak(normalizeLook({ colors: { bg: "0B1020", accent: "22D3EE", accent2: "A78BFA" }, fonts: { title: "Bahnschrift", body: "Segoe UI" }, background: { kind: "mesh", seed: 7 }, cover: "split" }));
    expect(tweak).toContain("bgkind=mesh");
    const t = themeOf(`Theme: clean | ${tweak}\n\n---\n# a`);
    expect(t).toMatchObject({ bg: "0B1020", bgkind: "mesh", bgseed: 7, cover: "split", titleFont: "Bahnschrift" });
    expect(t.dark).toBe(true);
    expect(t.accents[1]).toBe("A78BFA");
    expect(LOOK_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("the look step of a deck", () => {
  const stats = { ttftSec: 0.1, tokPerSec: 20, tokens: 10, totalSec: 0.5 };
  const run = async (looks: string[]) => {
    let n = 0; const schemas: unknown[] = [];
    const stream = async function* (sid: string, _m: unknown[], _w: boolean, _r?: string, schema?: unknown): AsyncGenerator<ChatEvent> {
      let text = "Done.";
      if (sid.endsWith(":deckplan")) text = "Title: Volcanoes\nTheme: sunrise\nSlide: cover | Volcanoes | none\nSlide: content | How they form | none\nSlide: closing | End | none";
      else if (/:look:/.test(sid)) { schemas.push(schema); text = looks[Math.min(n++, looks.length - 1)]; }
      else if (/:slide/.test(sid)) text = "# A title\n- one fact about volcanoes\n- another fact about magma";
      yield { id: sid, type: "answer", text } as ChatEvent; yield { id: sid, type: "done", stats } as ChatEvent;
    };
    const g = makeDeck({ id: "d", messages: [{ role: "user", content: "make a presentation about volcanoes, old style" }], stream: stream as never });
    let r = await g.next(); while (!r.done) r = await g.next();
    return { text: (r.value as { text?: string }).text ?? "", schemas, calls: n };
  };
  it("is asked with the schema, corrected once, and written into the deck's Theme line and slide styles", async () => {
    const bad = JSON.stringify({ colors: { bg: "zzz", accent: "B45309" }, background: { kind: "waves" } });
    const good = JSON.stringify({ colors: { bg: "F5EBDC", accent: "B45309" }, background: { kind: "waves", seed: 4 }, slides: [{ n: 2, accent: "0F766E" }] });
    const r = await run([bad, good]);
    expect(r.calls).toBe(2);
    expect(r.schemas[0]).toBe(LOOK_SCHEMA);
    expect(r.text).toMatch(/Theme: [^\n]*\| bg=F5EBDC accent=B45309 bgkind=waves seed=4/);
    expect(r.text).toMatch(/Style: accent=0F766E/);
  });
  it("keeps going with the theme when no look comes back", async () => {
    const r = await run(["not json", "still not json"]);
    expect(r.text).toMatch(/Theme: /);
    expect(r.text).not.toContain("bgkind");
  });
});
