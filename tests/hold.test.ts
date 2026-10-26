import { describe, expect, it } from "vitest";
import { awaitsInstructions } from "../src/core/hold";
import { sortRequest } from "../src/core/dynamic";

const essay = "Vietnam joined ASEAN in 1995 and signed 17 trade agreements. Exports rose to $475bn in 2025, the latest figure, from a code of labour reforms.\n\n";

describe("context handed over, instructions to follow", () => {
  it("is recognised at the end of a pasted text", () => {
    expect(awaitsInstructions(`${essay}je te donne ca comme contexte, attends mes instructions`)).toBe(true);
    expect(awaitsInstructions(`${essay}This is for context only, wait for my instructions`)).toBe(true);
    expect(awaitsInstructions("Ne fais rien pour l'instant")).toBe(true);
  });
  it("does not catch a real request", () => {
    expect(awaitsInstructions("Fais un jeu de snake en html")).toBe(false);
    expect(awaitsInstructions(`${essay}Résume ce texte en trois lignes`)).toBe(false);
    expect(awaitsInstructions("Wait, why does this code crash?")).toBe(false);
  });
  it("is sorted as a chat with no doubt", () => {
    const s = sortRequest(`${essay}je te donne ca comme contexte, attends mes instructions`);
    expect(s.category).toBe("chat");
    expect(s.confidence).toBeGreaterThanOrEqual(0.8);
  });
});
