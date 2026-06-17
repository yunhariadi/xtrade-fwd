import { describe, it, expect } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { detectLiquiditySweep } from "./detect";

const STEP = 900; // 15m in seconds
const t = (i: number) => 1000 + i * STEP;

/**
 * 18 candles forming a single confirmed swing low at index 6 (low 50) and a
 * sell-side sweep at index 13 (low 45 dips below 50, close 65 reclaims it).
 * Highs are flat at 70 so no swing highs (hence no buy-side sweeps) interfere.
 */
function buildCandles(): Candle[] {
  return Array.from({ length: 18 }, (_, i): Candle => {
    let low = 60;
    if (i === 6) low = 50; // the swing low
    if (i === 13) low = 45; // the sweep dips beneath it
    return { time: t(i), open: 64, high: 70, low, close: 65, volume: 1, isClosed: true };
  });
}

describe("detectLiquiditySweep — beforeTime anchor", () => {
  it("finds the sell-side sweep when unrestricted", () => {
    const sweep = detectLiquiditySweep(buildCandles(), 20);
    expect(sweep).not.toBeNull();
    expect(sweep!.type).toBe("sell-side");
    expect(sweep!.sweptLevel).toBe(50);
    expect(sweep!.time).toBe(t(13));
  });

  it("excludes a sweep at or after beforeTime", () => {
    // Anchor exactly at the sweep candle's time → it must be excluded (strict <).
    expect(detectLiquiditySweep(buildCandles(), 20, t(13))).toBeNull();
  });

  it("includes a sweep that precedes beforeTime", () => {
    const sweep = detectLiquiditySweep(buildCandles(), 20, t(13) + 1);
    expect(sweep).not.toBeNull();
    expect(sweep!.time).toBe(t(13));
  });
});
