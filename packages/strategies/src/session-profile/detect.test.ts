import { describe, expect, it } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { buildSessionProfile } from "./detect";
import type { ReferenceRange } from "./types";

function c(open: number, high: number, low: number, close: number): Candle {
  return { time: 0, open, high, low, close, volume: 1, isClosed: true };
}

const asia: ReferenceRange = {
  high: 110,
  low: 100,
  highLabel: "asia_high",
  lowLabel: "asia_low",
};

describe("buildSessionProfile", () => {
  it("returns null with too few candles", () => {
    expect(buildSessionProfile("London", [c(105, 106, 104, 105)], asia)).toBeNull();
  });

  it("identifies a sell-side sweep then bullish expansion", () => {
    const candles = [
      c(105, 106, 104, 105),
      c(105, 106, 104, 105),
      c(103, 104, 96, 102), // sweep asia_low + reclaim
      c(102, 113, 101, 112), // bullish expansion above range
    ];
    const res = buildSessionProfile("London", candles, asia)!;
    expect(res.sweptLiquidity).toBe("asia_low");
    expect(res.activeDraw).toBe("asia_high");
    expect(res.direction).toBe("bullish");
    expect(["sweep_reclaim_expand", "judas_swing"]).toContain(res.profileType);
    expect(res.label).toContain("London");
  });

  it("labels an inside-range session as ranging", () => {
    const candles = [
      c(105, 106, 104, 105),
      c(105, 107, 103, 104),
      c(104, 106, 103, 105),
    ];
    const res = buildSessionProfile("Asia", candles, asia)!;
    expect(res.rangeExpansion).toBe("inside_reference_range");
    expect(res.profileType).toBe("range");
  });
});
