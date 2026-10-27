import { describe, expect, it } from "vitest";
import { makeDeck } from "../src/core/deckBuild";
import { clipPhrase } from "../src/core/slides";
import { enrichPlan, figuresIn, partFor, trendTable } from "../src/core/deckFacts";
import type { ChatEvent, ChatStats } from "../src/shared/types";

const stats: ChatStats = { ttftSec: 0.1, tokPerSec: 20, tokens: 10, totalSec: 0.5 };
const TEXT = `Vietnam: a country deeply integrated into the international economy

Introduction
Forty years ago, Vietnam was a closed economy. Since the Doi Moi reforms of 1986, in 2025 its trade reached about $930bn, roughly 180% of its $514bn GDP, and growth was 8%.

2 · Trade agreements
Vietnam joined ASEAN in 1995 and APEC in 1998, and has signed 17 free trade agreements, including the CPTPP (2018), the EU-Vietnam agreement (2020) and RCEP (2022). As a result, exports rose from $48bn in 2007 to $475bn in 2025. The United States is its first market (a $134bn surplus).

3 · Foreign capital
Vietnam received $27.6bn of disbursed FDI in 2025, mainly in manufacturing. Samsung alone makes about 13% of its exports. Foreign-invested firms produce 77% of exports and it holds $83bn of reserves.`;

describe("facts read from a text", () => {
  it("finds figures, the part of a topic and a rise", () => {
    expect(figuresIn("trade reached $930bn, roughly 180% of its $514bn GDP")).toEqual(["$930bn", "180%", "$514bn"]);
    expect(partFor(TEXT, "Trade agreements and exports")).toContain("ASEAN");
    expect(trendTable(partFor(TEXT, "Trade agreements"))).toEqual([["Year", "Exports (bn)"], ["2007", "48"], ["2025", "475"]]);
    expect(trendTable("nothing rose here")).toBeNull();
  });
  it("shortens at a natural place, never with an ellipsis or a hanging word", () => {
    const x = clipPhrase("Trade reached $930bn in 2025, roughly 180% of its GDP, marking a massive shift in the economy", 9);
    expect(x).not.toMatch(/…|\bof$|\bits$/);
    expect(x.split(" ").length).toBeLessThanOrEqual(9);
    expect(clipPhrase("one of the most open economies in the", 6)).not.toMatch(/\bthe$/);
  });
  it("gives a part full of figures the figures layout and a rise its chart, when the planner chose bullets", () => {
    const plan = { title: "V", theme: "sunrise", slides: [
      { role: "cover" as const, topic: "Vietnam", visual: "none" as const, hint: "" },
      { role: "content" as const, topic: "Introduction", visual: "none" as const, hint: "" },
      { role: "content" as const, topic: "Trade agreements", visual: "none" as const, hint: "" },
      { role: "content" as const, topic: "Foreign capital", visual: "none" as const, hint: "" },
      { role: "closing" as const, topic: "Conclusion", visual: "none" as const, hint: "" }] };
    expect(enrichPlan(plan, TEXT).slides.map((s) => s.visual)).toEqual(["none", "stats", "timeline", "stats", "none"]);
  });
});

describe("a deck from a rich text, with a weak model", () => {
  it("still shows the figures, the dates on a timeline and cuts nothing with an ellipsis", async () => {
    const stream = async function* (sid: string, msgs: { role: string; content: unknown }[]): AsyncGenerator<ChatEvent> {
      const user = String(msgs[msgs.length - 1].content);
      let text = "";
      if (sid.endsWith(":deckplan")) text = "Title: Vietnam\nTheme: sunrise\nSlide: cover | Vietnam | none\nSlide: content | Introduction | none\nSlide: content | Trade agreements | none\nSlide: content | Foreign capital | none\nSlide: closing | Conclusion | none";
      else if (/:slide/.test(sid)) { const n = /slide (\d)/.exec(user)?.[1]; text = n === "1" ? "# Vietnam\n- From closed economy to global hub" : `# Topic ${n}\n- One very long line that goes on and on about nothing in particular for far too many words to fit\n- Short`; }
      else text = "Done.";
      yield { id: sid, type: "answer", text } as ChatEvent;
      yield { id: sid, type: "done", stats } as ChatEvent;
    };
    const g = makeDeck({ id: "d", messages: [{ role: "user", content: `${TEXT}\n\n${"filler sentence about the topic. ".repeat(25)}\n\ncreate a powerpoint presentation based on this text` }], stream: stream as never });
    let r = await g.next(); const events: ChatEvent[] = []; while (!r.done) { events.push(r.value); r = await g.next(); }
    const res = r.value as { handled: boolean; text?: string };
    expect(res.handled).toBe(true);
    const text = res.text ?? "";
    expect(text).not.toContain("…");
    expect(text).toMatch(/Timeline: 1995 \| Joined ASEAN ; 1998 \| Joined APEC/);
    expect(text).toMatch(/Callout: Exports ×9\.9 in 18 years/);
  });
});
