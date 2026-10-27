import { describe, expect, it } from "vitest";
import { SentenceChunker, toSpeechText } from "../src/core/speechText";
import { speechWords } from "../src/core/transcript";

import { SpeechStream } from "../src/core/speechText";

/** Feeds an answer piece by piece like the voice chat does and returns the sentences said. */
function said(answer: string, step = 3): string {
  const st = new SpeechStream();
  const out: string[] = [];
  for (let n = 0; n < answer.length; n += step) out.push(...st.push(answer.slice(n, n + step)));
  out.push(...st.flush());
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
  it("does not lose a word of a long answer with brackets, bold, lists and a code block, at any streaming pace", () => {
    const long = "Doi Moi (which means renewal) started in 1986. It had **three** parts:\n1. Farms were given back to families.\n2. Private business came back (slowly, at first).\n3. Foreign money was welcome.\n\n```js\nconsole.log(1)\n```\nSo here is the end, with e.g. a short list, and 3.5 percent growth.";
    for (const step of [1, 2, 3, 4, 7, 13, 50]) {
      const s = said(long, step).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ");
      for (const w of ["Doi", "Moi", "which means renewal", "1986", "three parts", "Farms were given back", "Private business came back", "slowly", "at first", "Foreign money was welcome", "short list", "percent growth"]) expect(s).toContain(w);
      expect(s).not.toContain("console");
    }
  });
  it("speaks the first part of a long sentence without waiting for its end", () => {
    const st = new SpeechStream();
    const first = st.push("Here is a rather long first sentence that goes on for quite a while now, because it keeps adding clauses, and then it continues with more words");
    expect(first.length).toBeGreaterThan(0);
  });
  it("cuts a very long sentence at a comma, never in the middle of a clause", () => {
    const long = Array.from({ length: 16 }, (_, i) => `item number ${i} is here`).join(", ") + ".";
    const parts = new SentenceChunker(24, 1e9).push(long + " ");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts.slice(0, -1)) expect(p.endsWith(",")).toBe(true);
    expect(parts.join(" ")).toBe(long);
  });
  it("keeps a sentence of ordinary length whole, and does not end one on an abbreviation or an initial", () => {
    const sentence = "The reforms that began in 1986 opened the economy to private business, foreign investment and trade with neighbouring countries, and growth followed within a few years.";
    expect(new SentenceChunker(24, 1e9).push(sentence + " ")).toEqual([sentence]);
    const c = new SentenceChunker(24, 1e9);
    expect([...c.push("Dr. J. Smith of the U.S. office said it was fine. Then he left. "), ...c.flush()]).toEqual(["Dr. J. Smith of the U.S. office said it was fine.", "Then he left."]); // no cut on "Dr.", "J.", "U.S."
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
