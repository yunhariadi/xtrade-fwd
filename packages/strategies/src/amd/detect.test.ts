import { describe, expect, it } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { classifyAmdPhase } from "./detect";

function c(open: number, high: number, low: number, close: number): Candle {
  return { time: 0, open, high, low, close, volume: 1, isClosed: true };
}

describe("classifyAmdPhase", () => {
  it("returns unknown when there is too little data", () => {
    expect(classifyAmdPhase([c(100, 101, 99, 100)]).phase).toBe("unknown");
  });

  it("detects accumulation in a tight, indecisive range", () => {
    const candles = Array.from({ length: 12 }, (_, i) =>
      c(100, 100.5, 99.5, 100 + (i % 2 === 0 ? 0.1 : -0.1))
    );
    const res = classifyAmdPhase(candles);
    expect(res.phase).toBe("accumulation");
  });

  it("detects sell-side manipulation when range low is swept and reclaimed", () => {
    const range = { high: 110, low: 100 };
    const candles = [
      c(105, 106, 104, 105),
      c(105, 106, 104, 105),
      // sweep below 100 then close back inside
      c(103, 104, 97, 102),
      c(102, 103, 101, 102),
    ];
    const res = classifyAmdPhase(candles, range);
    expect(res.manipulatedSide).toBe("sell_side");
    expect(res.sweptLevel).toBe(100);
    expect(res.reclaim).toBe(true);
    expect(["manipulation", "distribution"]).toContain(res.phase);
  });

  it("calls it distribution when a bullish displacement follows a sell-side sweep", () => {
    const range = { high: 110, low: 100 };
    const candles = [
      c(105, 106, 104, 105),
      c(105, 106, 104, 105),
      c(103, 104, 96, 102), // sweep + reclaim sell-side
      c(102, 112, 101.5, 111), // large bullish displacement
    ];
    const res = classifyAmdPhase(candles, range);
    expect(res.manipulatedSide).toBe("sell_side");
    expect(res.displacement).toBe("bullish");
    expect(res.phase).toBe("distribution");
  });
});
