import { describe, it, expect } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { computePremiumDiscount } from "./detect";

let t = 1_700_000_000;
function c(high: number, low: number, close: number): Candle {
  t += 300;
  return { time: t, open: (high + low) / 2, high, low, close, volume: 1, isClosed: true };
}

/**
 * Build a series with a clear swing high near `hi` and swing low near `lo`
 * (5-bar pivots need padding on each side), ending at `close`.
 */
function series(hi: number, lo: number, close: number): Candle[] {
  return [
    c(100, 98, 99),
    c(101, 99, 100),
    c(lo + 2, lo + 1, lo + 1), // approach low
    c(lo + 1, lo, lo),         // swing low pivot
    c(lo + 2, lo + 1, lo + 2),
    c(102, 100, 101),
    c(103, 101, 102),
    c(hi - 1, hi - 2, hi - 1), // approach high
    c(hi, hi - 1, hi - 1),     // swing high pivot
    c(hi - 1, hi - 2, hi - 1),
    c(102, 100, 101),
    c(101, 99, close),         // last close decides location
  ];
}

describe("computePremiumDiscount", () => {
  it("returns null for no candles", () => {
    expect(computePremiumDiscount([])).toBeNull();
  });

  it("derives the dealing range and equilibrium from swings", () => {
    const r = computePremiumDiscount(series(150, 50, 100))!;
    expect(r.range.high).toBe(150);
    expect(r.range.low).toBe(50);
    expect(r.range.equilibrium).toBe(100);
    expect(r.range.size).toBe(100);
    expect(r.fib["0.5"]).toBe(100);
    expect(r.premiumZone).toEqual({ from: 100, to: 150 });
    expect(r.discountZone).toEqual({ from: 50, to: 100 });
  });

  it("locates a close above equilibrium as premium", () => {
    const r = computePremiumDiscount(series(150, 50, 140))!;
    expect(r.location).toBe("premium");
    expect(r.zone).toBe("upper_premium");
  });

  it("locates a close below equilibrium as discount", () => {
    const r = computePremiumDiscount(series(150, 50, 60))!;
    expect(r.location).toBe("discount");
    expect(r.zone).toBe("lower_discount");
  });

  it("clusters equal highs within tolerance into an EQH pool", () => {
    // 1-bar-pivot zigzag: two peaks at ~200 (within 0.1%) flanked by troughs.
    const candles: Candle[] = [
      c(110, 100, 105),
      c(200, 190, 195),   // swing high #1
      c(120, 110, 115),
      c(200.1, 190, 195), // swing high #2 ≈ #1
      c(120, 60, 90),
      c(70, 50, 60),      // swing low pivot
      c(120, 110, 115),
    ];
    const r = computePremiumDiscount(candles, { swingBars: 1 })!;
    expect(r.equalHighs.length).toBeGreaterThanOrEqual(1);
    expect(r.equalHighs[0].type).toBe("EQH");
    expect(r.equalHighs[0].times.length).toBeGreaterThanOrEqual(2);
  });
});
