import { describe, expect, it } from "vitest";
import { takeToolCommands } from "../src/core/toolCommands";

describe("takeToolCommands", () => {
  it("reads the leading commands and removes them", () => {
    const r = takeToolCommands("/web /images cherche la tour Eiffel");
    expect([...r.used].sort()).toEqual(["images", "web"]);
    expect(r.text).toBe("cherche la tour Eiffel");
  });
  it("leaves a message without a command as typed", () => {
    expect(takeToolCommands("  bonjour /web").used.size).toBe(0);
    expect(takeToolCommands("/inconnu salut").text).toBe("/inconnu salut");
  });
});
