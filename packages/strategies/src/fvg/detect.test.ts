import { describe, it, expect } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { buildFvgZones } from "./detect";

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 1, isClosed: true };
}

describe("buildFvgZones", () => {
  it("detects a bullish FVG and leaves it active when price never returns", () => {
    const candles = [
      candle(100, 100, 101, 99, 100),
      candle(200, 101, 104, 100, 104), // displacement
      candle(300, 104, 106, 103, 105), // low 103 > high[0] 101 → bullish gap 101..103
      candle(400, 105, 107, 104, 106),
    ];
    const zones = buildFvgZones(candles);
    expect(zones.length).toBe(1);
    expect(zones[0].direction).toBe("bullish");
    expect(zones[0].top).toBe(103);
    expect(zones[0].bottom).toBe(101);
    expect(zones[0].status).toBe("active");
    expect(zones[0].touched).toBe(false);
  });

  it("marks a zone touched when price enters the gap without filling it", () => {
    const candles = [
      candle(100, 100, 101, 99, 100),
      candle(200, 101, 104, 100, 104),
      candle(300, 104, 106, 103, 105), // gap 101..103
      candle(400, 105, 106, 102, 105), // low 102 enters gap, stays above 101
    ];
    const zones = buildFvgZones(candles);
    expect(zones[0].status).toBe("active");
    expect(zones[0].touched).toBe(true);
    expect(zones[0].touchedAt).toBe(400);
  });

  it("marks a zone mitigated when price traverses the full gap", () => {
    const candles = [
      candle(100, 100, 101, 99, 100),
      candle(200, 101, 104, 100, 104),
      candle(300, 104, 106, 103, 105), // gap 101..103
      candle(400, 105, 106, 100, 102), // low 100 <= bottom 101 → mitigated
    ];
    const zones = buildFvgZones(candles);
    expect(zones[0].status).toBe("mitigated");
    expect(zones[0].mitigatedAt).toBe(400);
  });

  it("only resolves state from candles AFTER the zone completes (no look-back)", () => {
    // The gap-forming bar itself spans prices inside the gap; it must not count.
    const candles = [
      candle(100, 100, 101, 99, 100),
      candle(200, 101, 104, 100, 104), // low 100 is below the eventual gap — ignored
      candle(300, 104, 106, 103, 105),
    ];
    const zones = buildFvgZones(candles);
    expect(zones[0].status).toBe("active");
    expect(zones[0].touched).toBe(false);
  });
});
