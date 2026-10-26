import { describe, expect, it } from "vitest";
import { SentenceChunker, settledSpeech, speechAfter, toSpeechText } from "../src/core/speechText";
import { speechWords } from "../src/core/transcript";

/** Feeds an answer piece by piece like the voice chat does and returns the sentences said. */
function said(answer: string, step = 3): string {
  const ch = new SentenceChunker();
  let fed = "";
  const out: string[] = [];
  for (let n = step; ; n += step) {
    const final = n >= answer.length;
    const clean = settledSpeech(toSpeechText(answer.slice(0, n)), final);
    out.push(...ch.push(speechAfter(clean, fed)));
    fed = clean.length >= fed.length ? clean : fed;
    if (final) break;
  }
  out.push(...ch.flush());
  return out.join(" ");
}

describe("the answer read aloud", () => {
  const md = "The international institutions named in the text are:\n\n1. **IMF** (International Monetary Fund)\n2. **World Bank**\n3. **ILO** (International Labour Organization)\n4. **WTO** (World Trade Organization)\n\nI listed these four names.";
  it("never skips a word of a list while it streams", () => {
    for (const step of [1, 2, 3, 5, 7, 11]) {
      const s = said(md, step);
      for (const w of ["international", "Monetary", "Fund", "World", "Bank", "Labour", "Organization", "Trade", "listed"]) expect(s.toLowerCase()).toContain(w.toLowerCase());
    }
  });
  it("holds back a list marker still being written", () => {
    expect(settledSpeech("Hello there\n1", false)).toBe("Hello there\n");
    expect(settledSpeech("Hello wor", false)).toBe("Hello ");
    expect(settledSpeech("Hello wor", true)).toBe("Hello wor");
  });
  it("cuts a very long sentence instead of handing it whole to the voice", () => {
    const long = Array.from({ length: 12 }, (_, i) => `item number ${i} is here`).join(", ") + ".";
    const parts = new SentenceChunker().push(long + " ");
    expect(parts.length).toBeGreaterThan(1);
  });
});

describe("what counts as words said to the assistant", () => {
  it("ignores coughs, laughs, hesitations and annotations", () => {
    expect(speechWords("(coughs)")).toEqual([]);
    expect(speechWords("haha euh hmm")).toEqual([]);
    expect(speechWords("*laughs* [Music]")).toEqual([]);
  });
  it("keeps real words", () => {
    expect(speechWords("non attends, je voulais dire autre chose")).toContain("attends");
  });
});
