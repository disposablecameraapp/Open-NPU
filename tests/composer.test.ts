import { describe, expect, it } from "vitest";
import { STARTERS, draftKey, growTo, lastUserIndex, turnsBefore } from "../src/core/composer";

const turns = [{ role: "user" }, { role: "assistant" }, { role: "user" }, { role: "assistant" }];

describe("composer helpers", () => {
  it("keys drafts per conversation", () => {
    expect(draftKey("a")).not.toBe(draftKey("b"));
  });
  it("finds the last user turn", () => {
    expect(lastUserIndex(turns)).toBe(2);
    expect(lastUserIndex([])).toBe(-1);
    expect(lastUserIndex([{ role: "assistant" }])).toBe(-1);
  });
  it("keeps what comes before an edited or retried turn", () => {
    expect(turnsBefore(turns, 2)).toEqual(turns.slice(0, 2));
    expect(turnsBefore(turns, 0)).toEqual([]);
    expect(turnsBefore(turns, 1)).toBeNull();
    expect(turnsBefore(turns, 9)).toBeNull();
  });
  it("grows the textarea up to 40% of the viewport, then scrolls", () => {
    expect(growTo(60, 1000)).toEqual({ height: 60, scroll: false });
    expect(growTo(900, 1000)).toEqual({ height: 400, scroll: true });
  });
  it("has four starters", () => {
    expect(STARTERS).toHaveLength(4);
  });
});
