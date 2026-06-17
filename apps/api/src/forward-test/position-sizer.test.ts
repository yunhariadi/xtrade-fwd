import { describe, it, expect } from "vitest";
import { calculatePositionSize } from "./position-sizer";

describe("calculatePositionSize", () => {
  it("sizes by risk when leverage is not the binding constraint", () => {
    // 1% of 10_000 = 100 risk; SL distance 10 → size 10. Notional = 10 * 100 =
    // 1_000, which is 0.1x balance — well under any leverage cap.
    const r = calculatePositionSize({
      accountBalance: 10_000,
      riskPercent: 1,
      entry: 100,
      stopLoss: 90,
      maxLeverage: 10,
    });
    expect(r.positionSize).toBe(10);
    expect(r.riskAmount).toBe(100);
  });

  it("returns zero for a zero SL distance", () => {
    const r = calculatePositionSize({
      accountBalance: 10_000,
      riskPercent: 1,
      entry: 100,
      stopLoss: 100,
    });
    expect(r).toEqual({ positionSize: 0, riskAmount: 0 });
  });

  it("clamps size to the leverage cap when the stop is very tight", () => {
    // Tight stop (distance 1) → risk-based size = 100/1 = 100 units, notional
    // 100 * 100 = 10_000 = 1x... still fine. Make it tighter: distance 0.1 →
    // size 1_000, notional 100_000 = 10x balance. With maxLeverage 5 the cap is
    // balance*5/entry = 50_000/100 = 500 units.
    const r = calculatePositionSize({
      accountBalance: 10_000,
      riskPercent: 1,
      entry: 100,
      stopLoss: 99.9,
      maxLeverage: 5,
    });
    expect(r.positionSize).toBe(500); // clamped to 5x notional
    // Realized risk reflects the clamped size: 500 * 0.1 = 50, below the 100 target.
    expect(r.riskAmount).toBeCloseTo(50, 6);
  });

  it("does not clamp when maxLeverage is omitted (unbounded)", () => {
    const r = calculatePositionSize({
      accountBalance: 10_000,
      riskPercent: 1,
      entry: 100,
      stopLoss: 99.9,
    });
    expect(r.positionSize).toBeCloseTo(1_000, 6); // 100 / 0.1, no cap
  });
});
