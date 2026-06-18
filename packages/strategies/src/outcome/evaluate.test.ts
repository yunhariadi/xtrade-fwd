import { describe, expect, it } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { evaluateOutcome } from "./evaluate";

function c(low: number, high: number, close = (low + high) / 2): Candle {
  return { time: 0, open: close, high, low, close, volume: 1, isClosed: true };
}

describe("evaluateOutcome", () => {
  const longSetup = { direction: "long" as const, entry: 100, stopLoss: 95, takeProfit: 110 };

  it("reports no_fill when price never reaches the entry", () => {
    const r = evaluateOutcome(longSetup, [c(105, 108), c(106, 109)]);
    expect(r.filled).toBe(false);
    expect(r.outcome).toBe("no_fill");
    expect(r.rMultiple).toBeNull();
    expect(r.plannedRR).toBe(2); // (110-100)/(100-95)
  });

  it("labels a win at +plannedRR when target is hit after fill", () => {
    const r = evaluateOutcome(longSetup, [
      c(99, 101), // fills at 100
      c(101, 111), // hits 110 target
    ]);
    expect(r.filled).toBe(true);
    expect(r.outcome).toBe("win");
    expect(r.rMultiple).toBe(2);
    expect(r.mfeR).toBeGreaterThanOrEqual(2);
  });

  it("labels a loss at -1R when stop is hit first", () => {
    const r = evaluateOutcome(longSetup, [
      c(99, 101), // fills at 100
      c(94, 101), // hits 95 stop
    ]);
    expect(r.outcome).toBe("loss");
    expect(r.rMultiple).toBe(-1);
  });

  it("resolves a candle spanning both stop and target as a loss (conservative)", () => {
    const r = evaluateOutcome(longSetup, [c(99, 101), c(94, 111)]);
    expect(r.outcome).toBe("loss");
  });

  it("returns open with a mark-to-last R when neither level is hit in the horizon", () => {
    const r = evaluateOutcome(longSetup, [c(99, 101, 100), c(99, 104, 103)]);
    expect(r.outcome).toBe("open");
    expect(r.rMultiple).toBeCloseTo(0.6, 3); // (103-100)/5
  });

  it("handles shorts symmetrically", () => {
    const shortSetup = { direction: "short" as const, entry: 100, stopLoss: 105, takeProfit: 90 };
    const r = evaluateOutcome(shortSetup, [
      c(99, 101), // fills at 100 (high >= 100)
      c(89, 99), // hits 90 target
    ]);
    expect(r.outcome).toBe("win");
    expect(r.rMultiple).toBe(2);
  });
});
