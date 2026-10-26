import { describe, expect, it } from "vitest";
import { fastVoiceModel, voiceMenuItems, pickVoiceItem } from "../src/core/voicePick";
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
  it("stays the 2B by default even when the 4B is installed; the menu lists both", () => {
    const q4 = item("Qwen3.5-4B", 2.8);
    expect(fastVoiceModel([coder, q4, q35])).toBe(q35);
    expect(voiceMenuItems([q4, q35f, q35, phi])).toEqual([q35, q4]);
  });
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
    expect(visualsOf('Look.\n```chart\n{"type":"li')).toBe('```chart\n{"type":"li');
    expect(visualsOf('Voici.\n```mermaid\nflowchart TD\n  A --> B\n```\nVoilà.')).toBe("```mermaid\nflowchart TD\n  A --> B\n```");
    expect(visualsOf("Voici.\n```mermaid\nflowchart TD\n  A -->")).toBe("```mermaid\nflowchart TD\n  A -->");
  });
});

import { compactVisuals, visualNeeds } from "../src/core/visuals";

describe("keeping the voice context small", () => {
  it("an old chart or picture becomes a one-line note, and is never read aloud if copied", () => {
    const c = compactVisuals('Voici.\n```chart\n{"type":"bar","title":"Sales","series":[]}\n```\n![A cat](wikimedia:Cat.jpg)');
    expect(c).toBe('Voici.\n[A bar chart "Sales" was shown on screen.]\n[A picture was shown on screen: A cat.]');
    expect(toSpeechText(c)).toBe("Voici.");
  });
  it("the instructions for charts and pictures are given only when asked for, or to change the chart just shown", () => {
    expect(visualNeeds("Quel temps fait-il à Paris ?")).toEqual({ chart: false, diagram: false, picture: false });
    expect(visualNeeds("Fais-moi un graphique des intérêts composés").chart).toBe(true);
    expect(visualNeeds("Fais-moi un diagramme du processus de commande").diagram).toBe(true);
    expect(visualNeeds("show me a plot of sin(x)").chart).toBe(true);
    expect(visualNeeds("Montre-moi une photo d'un chat").picture).toBe(true);
    expect(visualNeeds("what does a red panda look like").picture).toBe(true);
    expect(visualNeeds("et avec 5 % ?", '```chart\n{"type":"line"}\n```').chart).toBe(true);
    expect(visualNeeds("et avec 5 % ?", "Réponse sans graphique.").chart).toBe(false);
  });
});

import { wantsCloseVisual } from "../src/core/visuals";

describe("closing a chart or picture by voice", () => {
  it("understands the request in French and English, and leaves other requests alone", () => {
    for (const t of ["Vire le graphique", "ferme ça", "Tu peux enlever l'image ?", "close the chart", "hide that", "get rid of it", "cache le cadre"]) expect(wantsCloseVisual(t), t).toBe(true);
    for (const t of ["Raconte-moi une histoire", "Quel temps fait-il ?", "remove the salt from the recipe", "montre-moi un graphique"]) expect(wantsCloseVisual(t), t).toBe(false);
  });
});
