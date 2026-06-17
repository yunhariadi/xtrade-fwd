import { describe, it, expect } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { detectFvgEntry } from "./fvg-entry";
import type { LiquiditySweepResult } from "../ict-model-2022/types";

/** Build a candle with sensible defaults; override only what a test needs. */
function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 1, isClosed: true };
}

const sellSideSweep: LiquiditySweepResult = {
  type: "sell-side",
  sweptLevel: 90, // SL sits below the bullish FVG entry
  sweepCandle: candle(0, 100, 100, 100, 100),
  time: 0,
};

describe("detectFvgEntry — bullish", () => {
  it("returns an entry for a fresh, unmitigated bullish FVG", () => {
    // Bullish FVG at index 2: candles[2].low (110) > candles[0].high (105).
    const candles: Candle[] = [
      candle(100, 100, 105, 99, 104),
      candle(160, 104, 108, 103, 107),
      candle(220, 108, 115, 110, 113), // gap: low 110 > prior high 105
    ];

    const result = detectFvgEntry(candles, "bullish", sellSideSweep);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe("bullish");
    expect(result!.entry).toBe(110); // top edge of the gap
    expect(result!.stopLoss).toBe(90);
    expect(result!.takeProfit).toBe(110 + (110 - 90) * 2); // 2:1 RR
  });

  it("skips a bullish FVG already mitigated by a later candle", () => {
    const candles: Candle[] = [
      candle(100, 100, 105, 99, 104),
      candle(160, 104, 108, 103, 107),
      candle(220, 108, 115, 110, 113), // gap, entry = 110
      candle(280, 113, 116, 108, 109), // low 108 <= 110 → mitigates the level
    ];

    const result = detectFvgEntry(candles, "bullish", sellSideSweep);
    expect(result).toBeNull();
  });

  it("ignores a bullish FVG that formed before the MSS (sequence ordering)", () => {
    const candles: Candle[] = [
      candle(100, 100, 105, 99, 104),
      candle(160, 104, 108, 103, 107),
      candle(220, 108, 115, 110, 113), // gap completes at t=220
    ];

    // MSS happened at t=300, after the gap → must be rejected.
    const result = detectFvgEntry(candles, "bullish", sellSideSweep, 300);
    expect(result).toBeNull();
  });

  it("accepts a bullish FVG that completes at or after the MSS", () => {
    const candles: Candle[] = [
      candle(100, 100, 105, 99, 104),
      candle(160, 104, 108, 103, 107),
      candle(220, 108, 115, 110, 113), // gap completes at t=220
    ];

    const result = detectFvgEntry(candles, "bullish", sellSideSweep, 220);
    expect(result).not.toBeNull();
    expect(result!.time).toBe(220);
  });
});

describe("detectFvgEntry — guards", () => {
  it("returns null when fewer than 3 candles", () => {
    const candles: Candle[] = [candle(100, 100, 105, 99, 104), candle(160, 104, 108, 103, 107)];
    expect(detectFvgEntry(candles, "bullish", sellSideSweep)).toBeNull();
  });

  it("skips a bullish FVG whose SL is not below entry (non-positive risk)", () => {
    // sweptLevel above the entry makes risk <= 0 → invalid.
    const badSweep: LiquiditySweepResult = { ...sellSideSweep, sweptLevel: 120 };
    const candles: Candle[] = [
      candle(100, 100, 105, 99, 104),
      candle(160, 104, 108, 103, 107),
      candle(220, 108, 115, 110, 113),
    ];
    expect(detectFvgEntry(candles, "bullish", badSweep)).toBeNull();
  });
});
