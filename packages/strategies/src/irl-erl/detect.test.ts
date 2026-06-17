import { describe, expect, it } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { classifyDraw } from "./detect";
import type { LiquidityTarget } from "./types";

function c(close: number, high = close + 1, low = close - 1): Candle {
  return { time: 0, open: close, high, low, close, volume: 1, isClosed: true };
}

const targets: LiquidityTarget[] = [
  { category: "IRL", label: "5m bullish FVG", type: "fvg", price: 100, low: 99, high: 101 },
  { category: "ERL", label: "Asia High", type: "session_high", price: 120 },
  { category: "ERL", label: "PDL", type: "previous_day_low", price: 80 },
];

describe("classifyDraw", () => {
  it("returns unclear with no targets", () => {
    expect(classifyDraw([c(100), c(101)], []).currentDraw).toBe("unclear");
  });

  it("reads IRL→ERL when price leaves the FVG and rises toward Asia High", () => {
    // Price tags the FVG at 100 then expands up.
    const candles = [c(100, 101, 99), c(105), c(110), c(113)];
    const res = classifyDraw(candles, targets);
    expect(res.from?.category).toBe("IRL");
    expect(res.currentDraw).toBe("IRL_to_ERL");
    expect(res.to?.label).toBe("Asia High");
    expect(res.travel).toBe("up");
  });

  it("reads ERL→IRL when price sweeps Asia High then retraces toward the FVG", () => {
    // Touch the ERL at 120, then fall back down.
    const candles = [c(120, 121, 119), c(115), c(108), c(104)];
    const res = classifyDraw(candles, targets);
    expect(res.from?.category).toBe("ERL");
    expect(res.currentDraw).toBe("ERL_to_IRL");
    expect(res.to?.category).toBe("IRL");
    expect(res.travel).toBe("down");
  });
});
