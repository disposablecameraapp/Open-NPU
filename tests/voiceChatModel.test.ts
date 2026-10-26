import { describe, expect, it } from "vitest";
import { fastVoiceModel, pickVoiceItem } from "../src/core/voicePick";
import { spokenPrefix } from "../src/core/spoken";
import { endSilenceFor } from "../src/core/endpoint";
import type { CatalogItem } from "../src/shared/api";

const item = (name: string, sizeGB: number, extra: Partial<CatalogItem["entry"]> = {}, runsOn?: CatalogItem["runsOn"]): CatalogItem => ({
  entry: { id: name, name, sizeGB, engine: "llama_cpp", ...extra } as CatalogItem["entry"],
  verdict: {} as CatalogItem["verdict"], hidden: false, installed: true, ref: name, custom: false, runsOn
});

describe("the model of a voice conversation", () => {
  const qwen3 = item("Qwen3-1.7B", 1.4, { engine: "qairt" });
  const phi = item("Phi-4-mini (Foundry Local)", 2.4, { id: "foundry:phi-4-mini" });
  const coder = item("Qwen2.5-Coder-0.5B", 0.5);
  const big = item("Qwen3.5-9B", 6);
  const q35 = item("Qwen3.5-2B", 1.9);
  const q35f = item("Qwen3.5-2B (Foundry Local)", 1.9, { id: "foundry:qwen3.5-2b" });
  it("is Qwen3.5-2B when installed, the GenieX build before Foundry's", () => {
    expect(fastVoiceModel([coder, big, phi, qwen3, q35f, q35])).toBe(q35);
    expect(fastVoiceModel([phi, qwen3, q35f])).toBe(q35f);
  });
  it("otherwise the best small model measured wholly on the NPU, never a coder, a big one or the two that repeat themselves", () => {
    expect(fastVoiceModel([coder, big, phi, qwen3])).toBeNull();
    expect(fastVoiceModel([coder, big])).toBeNull();
  });
  it("is the conversation's model when none is installed, or when asked", () => {
    expect(pickVoiceItem([big], "", big)).toBe(big);
    expect(pickVoiceItem([qwen3, big], "chat", big)).toBe(big);
    expect(pickVoiceItem([qwen3, q35, big], "", big)).toBe(q35);
  });
  it("is the one chosen by id, if it is still installed", () => {
    expect(pickVoiceItem([qwen3, big], "Qwen3.5-9B", qwen3)).toBe(big);
    expect(pickVoiceItem([qwen3], "Qwen3.5-9B", qwen3)).toBe(qwen3);
  });
});

describe("what was said before being cut", () => {
  it("keeps the sentences heard, and the words of the one cut", () => {
    const s = [
      { text: "First sentence here.", playedSec: 2, totalSec: 2 },
      { text: "one two three four five six seven eight nine ten", playedSec: 1, totalSec: 2 },
      { text: "Never heard.", playedSec: 0, totalSec: 1 }
    ];
    expect(spokenPrefix(s)).toBe("First sentence here. one two three four five");
  });
  it("guesses the length of a sentence whose audio is still arriving, and says nothing if nothing was heard", () => {
    expect(spokenPrefix([{ text: "a b c d e f g h i j k l m n o p q r s t", playedSec: 0.5, totalSec: null }]).split(" ").length).toBeLessThan(10);
    expect(spokenPrefix([{ text: "Nothing.", playedSec: 0, totalSec: null }])).toBe("");
  });
});

describe("waiting before answering", () => {
  const f = { done: 0.7, open: 1.2 };
  it("waits 2-3 seconds in voice chat, a little less after a finished sentence", () => {
    expect(endSilenceFor("Quelle heure est-il ?", 2500, f)).toBe(1750);
    expect(endSilenceFor("je voudrais savoir si", 2500, f)).toBe(3000);
    expect(endSilenceFor("tell me about dogs", 2500, f)).toBe(2500);
  });
});

import { visualsOf } from "../src/core/visuals";
import { toSpeechText } from "../src/core/speechText";

describe("charts and pictures in a voice chat", () => {
  const answer = 'Here it is.\n```chart\n{"type":"bar"}\n```\nThe bars grow.\n![A cat](wikimedia:Cat.jpg)\nDone.';
  it("are taken out of the answer for the screen, and never read aloud", () => {
    expect(visualsOf(answer)).toBe('```chart\n{"type":"bar"}\n```\n\n![A cat](wikimedia:Cat.jpg)');
    expect(toSpeechText(answer)).toBe("Here it is.\nThe bars grow.\nDone.");
  });
  it("leave out a chart that is still being written", () => {
    expect(visualsOf('Look.\n```chart\n{"type":"li')).toBe("");
  });
});
