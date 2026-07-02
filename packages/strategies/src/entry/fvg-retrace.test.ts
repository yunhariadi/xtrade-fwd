import { describe, it, expect } from "vitest";
import type { Candle, FvgZone } from "@ict-forward-lab/core";
import { buildFvgRetraceSetup } from "./fvg-retrace";

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 1, isClosed: true };
}

function zone(over: Partial<FvgZone> = {}): FvgZone {
  return {
    id: "bullish-fvg-300",
    direction: "bullish",
    fromTime: 100,
    toTime: 300,
    top: 103,
    bottom: 101,
    status: "active",
    touched: false,
    ...over,
  };
}

// Bars 100/200/300 form a bullish gap 101..103; bar 400 stays above it.
const candles = [
  candle(100, 100, 101, 98, 100),
  candle(200, 101, 104, 100, 104),
  candle(300, 104, 106, 103, 105),
  candle(400, 105, 107, 104, 106),
];

describe("buildFvgRetraceSetup", () => {
  it("builds a long limit at the zone top with the stop at the leg origin", () => {
    const s = buildFvgRetraceSetup({
      direction: "long",
      candles5m: candles,
      fvgZones: [zone()],
    });
    expect(s).not.toBeNull();
    expect(s!.entry).toBe(103); // zone top
    expect(s!.stopLoss).toBe(98); // lowest low of the displacement window
    expect(s!.takeProfit).toBe(103 + (103 - 98) * 2); // 2R fallback
    expect(s!.riskReward).toBe(2);
  });

  it("targets the nearest ERL beyond entry when supplied", () => {
    const s = buildFvgRetraceSetup({
      direction: "long",
      candles5m: candles,
      fvgZones: [zone()],
      erlTargets: [110, 120, 99], // 99 is behind entry — ignored
    });
    expect(s!.takeProfit).toBe(110);
    expect(s!.riskReward).toBe((110 - 103) / (103 - 98));
  });

  it("skips touched, mitigated, wrong-direction, and stale zones", () => {
    const base = { direction: "long" as const, candles5m: candles };
    expect(buildFvgRetraceSetup({ ...base, fvgZones: [zone({ touched: true })] })).toBeNull();
    expect(buildFvgRetraceSetup({ ...base, fvgZones: [zone({ status: "mitigated" })] })).toBeNull();
    expect(buildFvgRetraceSetup({ ...base, fvgZones: [zone({ direction: "bearish" })] })).toBeNull();
    expect(
      buildFvgRetraceSetup({ ...base, fvgZones: [zone()], maxZoneAgeCandles: 0 })
    ).toBeNull(); // zone completed 1 bar ago, allowed age 0
  });

  it("prefers the most recent qualifying zone", () => {
    const older = zone({ id: "old", toTime: 200, top: 102.5, bottom: 100.5 });
    const newer = zone({ id: "new", toTime: 300 });
    const s = buildFvgRetraceSetup({
      direction: "long",
      candles5m: candles,
      fvgZones: [older, newer],
    });
    expect(s!.fvgZone.id).toBe("new");
  });

  it("builds a short at the zone bottom with the stop above the leg", () => {
    // Mirror image: bearish gap between bar highs.
    const bearCandles = [
      candle(100, 100, 102, 99, 100),
      candle(200, 99, 100, 96, 96),
      candle(300, 96, 97, 94, 95),
      candle(400, 95, 96, 93, 94),
    ];
    const bearZone = zone({
      id: "bearish-fvg-300",
      direction: "bearish",
      top: 99,
      bottom: 97,
      toTime: 300,
    });
    const s = buildFvgRetraceSetup({
      direction: "short",
      candles5m: bearCandles,
      fvgZones: [bearZone],
    });
    expect(s).not.toBeNull();
    expect(s!.entry).toBe(97); // zone bottom
    expect(s!.stopLoss).toBe(102); // highest high of the displacement window
  });
});
