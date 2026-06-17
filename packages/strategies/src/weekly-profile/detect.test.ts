import { describe, expect, it } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { buildWeeklyProfile } from "./detect";

function c(open: number, high: number, low: number, close: number): Candle {
  return { time: 0, open, high, low, close, volume: 1, isClosed: true };
}

describe("buildWeeklyProfile", () => {
  it("returns null with no candles", () => {
    expect(buildWeeklyProfile([])).toBeNull();
  });

  it("gates to long-only when price is above weekly open and prior-week high", () => {
    const week = [
      c(67000, 67500, 66800, 67200),
      c(67200, 68500, 67100, 68400),
      c(68400, 69200, 68300, 69000),
    ];
    const res = buildWeeklyProfile(week, { high: 68000, low: 66000 })!;
    expect(res.weeklyBias).toBe("bullish");
    expect(res.permission.longAllowed).toBe(true);
    expect(res.permission.shortAllowed).toBe(false);
    expect(res.priceVsWeekOpen).toBe("above");
  });

  it("gates to short-only when price breaks below the prior-week low", () => {
    const week = [
      c(67000, 67100, 66000, 66200),
      c(66200, 66300, 64500, 64800),
    ];
    const res = buildWeeklyProfile(week, { high: 68000, low: 65000 })!;
    expect(res.weeklyBias).toBe("bearish");
    expect(res.permission.shortAllowed).toBe(true);
    expect(res.permission.longAllowed).toBe(false);
    expect(res.weeklyDraw).toBe("current_week_low");
  });

  it("flags a tight week as consolidation", () => {
    const week = [
      c(68000, 68100, 67950, 68050),
      c(68050, 68120, 67980, 68010),
    ];
    const res = buildWeeklyProfile(week)!;
    expect(res.likelyProfile).toBe("consolidation_week");
  });
});
