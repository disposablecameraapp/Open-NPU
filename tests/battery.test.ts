import { describe, expect, it } from "vitest";
import { batteryPercent, mWhPerToken, parseBattery, summarizeBattery } from "../src/core/battery";

const line = (o: object) => JSON.stringify(o);
const at = (t: number, mw: number, rem = 20000) => parseBattery(line({ remaining: rem, full: 45890, rate: mw, voltage: 11246, online: false, discharging: true }), t);

describe("battery", () => {
  it("reads the values Windows gives, with the percentage from the real full capacity", () => {
    const r = parseBattery(line({ remaining: 20760, full: 45890, rate: 16925, voltage: 11246, online: false, discharging: true }), 0);
    expect(r).toMatchObject({ present: true, onMains: false, discharging: true, dischargeMW: 16925 });
    expect(batteryPercent(r)).toBe(45.2);
  });
  it("says there is no battery for an empty or broken answer", () => {
    expect(parseBattery("{}").present).toBe(false);
    expect(parseBattery("not json").present).toBe(false);
  });
  it("never counts the draw while plugged in", () => {
    const r = parseBattery(line({ remaining: 20000, full: 45890, rate: 5000, online: true, discharging: false }));
    expect(r.onMains).toBe(true);
    expect(r.dischargeMW).toBe(0);
    expect(summarizeBattery([r, r])).toBeNull();
  });
  it("integrates the draw over time", () => {
    const run = summarizeBattery([at(0, 10000, 20000), at(1_800_000, 10000, 15000), at(3_600_000, 10000, 10000)])!;
    expect(run.avgWatts).toBe(10);
    expect(run.usedMWh).toBe(10000);
    expect(run.capacityDropMWh).toBe(10000);
    expect(run.problem).toBe("");
  });
  it("needs two readings and none on the mains", () => {
    expect(summarizeBattery([at(0, 1000)])).toBeNull();
    expect(summarizeBattery([at(0, 1000), parseBattery(line({ remaining: 1, online: true }), 1000)])).toBeNull();
  });
  it("refuses a run that cannot be trusted instead of showing a miracle", () => {
    expect(summarizeBattery([at(0, 10000, 20000), at(5000, 10000, 20000)])!.problem).toMatch(/too short/);
    expect(summarizeBattery([at(0, 10000, 20000), at(60_000, 10000, 20100)])!.problem).toMatch(/rose/);
    expect(mWhPerToken(summarizeBattery([at(0, 10000, 20000), at(60_000, 10000, 20100)])!, 5, 100)).toBeNull();
    // 10 W for an hour is 10 000 mWh, but the capacity fell by 100 only
    expect(summarizeBattery([at(0, 10000, 20000), at(3_600_000, 10000, 19900)])!.problem).toMatch(/disagree/);
  });
  it("gives the energy of the generation alone per token", () => {
    const run = summarizeBattery([at(0, 12000, 30000), at(3_600_000, 12000, 18000)])!;
    expect(mWhPerToken(run, 8, 4000)).toBe(1);
    expect(mWhPerToken(run, 8, 0)).toBeNull();
  });
});
