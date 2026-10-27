import { describe, expect, it } from "vitest";
import { forVoice, guessLang, latinize, speakNumbers } from "../src/core/speakNumbers";

describe("what the voice is given", () => {
  it("writes years and numbers out in English", () => {
    expect(speakNumbers("In 1986 Vietnam changed.", "en")).toBe("In nineteen eighty-six Vietnam changed.");
    expect(speakNumbers("In 2007 it joined.", "en")).toBe("In two thousand seven it joined.");
    expect(speakNumbers("In 1900 and 2015.", "en")).toBe("In nineteen hundred and twenty fifteen.");
    expect(speakNumbers("It had 475 members and 12,500 more.", "en")).toBe("It had four hundred seventy-five members and twelve thousand five hundred more.");
    expect(speakNumbers("About 48 billion dollars, or $475 million.", "en")).toBe("About forty-eight billion dollars, or four hundred seventy-five million dollars.");
    expect(speakNumbers("Growth was 3.5% in the 21st year.", "en")).toBe("Growth was three point five percent in the twenty-first year.");
  });
  it("writes numbers out in French", () => {
    expect(speakNumbers("En 1986, 80 villages et 71 écoles.", "fr")).toBe("En mille neuf cent quatre-vingt-six, quatre-vingts villages et soixante et onze écoles.");
    expect(speakNumbers("21 personnes, 200 euros, 2,5 %", "fr")).toBe("vingt et un personnes, deux cents euros, deux virgule cinq pour cent");
  });
  it("reduces Vietnamese letters and keeps French accents", () => {
    expect(latinize("Đổi Mới, Nguyễn Văn Linh, Hồ Chí Minh", false)).toBe("Doi Moi, Nguyen Van Linh, Ho Chi Minh");
    expect(latinize("Đổi Mới, Hồ Chí Minh")).toBe("Doi Moi, Ho Chí Minh");
    expect(latinize("Élève à Noël, garçon, niño")).toBe("Élève à Noël, garçon, niño");
  });
  it("guesses the language of the answer", () => {
    expect(guessLang("The reforms of 1986 opened the economy.")).toBe("en");
    expect(guessLang("Les réformes de 1986 ont ouvert l'économie et le marché.")).toBe("fr");
    expect(forVoice("Đổi Mới started in 1986.")).toBe("Doi Moi started in nineteen eighty-six.");
  });
});
