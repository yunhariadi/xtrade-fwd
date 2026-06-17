import { describe, expect, it } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { buildVolumeProfile } from "./detect";

function candle(partial: Partial<Candle> & { high: number; low: number; volume: number }): Candle {
  return {
    time: 0,
    open: partial.low,
    close: partial.high,
    isClosed: true,
    ...partial,
  };
}

describe("buildVolumeProfile", () => {
  it("returns null for an empty window", () => {
    expect(buildVolumeProfile([])).toBeNull();
  });

  it("puts POC where most volume concentrates", () => {
    // Heavy volume traded in the 100-110 band, light volume in the wings.
    const candles: Candle[] = [
      candle({ high: 130, low: 120, volume: 1 }),
      candle({ high: 110, low: 100, volume: 100 }),
      candle({ high: 110, low: 100, volume: 100 }),
      candle({ high: 90, low: 80, volume: 1 }),
    ];
    const vp = buildVolumeProfile(candles, 105, { tickSize: 10 });
    expect(vp).not.toBeNull();
    expect(vp!.poc).toBeGreaterThanOrEqual(100);
    expect(vp!.poc).toBeLessThanOrEqual(110);
    expect(vp!.val).toBeLessThanOrEqual(vp!.poc);
    expect(vp!.vah).toBeGreaterThanOrEqual(vp!.poc);
  });

  it("classifies price above the value area as bullish", () => {
    const candles: Candle[] = [
      candle({ high: 110, low: 100, volume: 100 }),
      candle({ high: 110, low: 100, volume: 100 }),
    ];
    const vp = buildVolumeProfile(candles, 200, { tickSize: 10 })!;
    expect(vp.priceLocation).toBe("above_value");
    expect(vp.bias).toBe("bullish");
  });

  it("conserves total volume across bins", () => {
    const candles: Candle[] = [
      candle({ high: 150, low: 100, volume: 50 }),
      candle({ high: 120, low: 110, volume: 30 }),
    ];
    const vp = buildVolumeProfile(candles, 115, { tickSize: 5 })!;
    expect(vp.totalVolume).toBeCloseTo(80, 6);
  });
});
