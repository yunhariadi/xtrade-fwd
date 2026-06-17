import type { Candle } from "@ict-forward-lab/core";
import type { LiquiditySweepResult } from "../ict-model-2022/types";
import { detectSwingPoints } from "../utils/swing-points";

const SWING_LEFT = 5;
const SWING_RIGHT = 5;

/**
 * Detect liquidity sweep on 15m, scanning the last `lookback` candles.
 * Sell-side sweep: wick below swing low + close above.
 * Buy-side sweep: wick above swing high + close below.
 * Returns the most recent qualifying sweep.
 *
 * Pass `beforeTime` (Unix seconds) to restrict candidates to sweeps that closed
 * strictly before that moment. The ICT A-Model pairs a sweep with the MSS it
 * displaced into, so callers anchor on the MSS and ask for the most recent sweep
 * that preceded it — rather than detecting the two independently and hoping they
 * line up.
 */
export function detectLiquiditySweep(candles15m: Candle[], lookback = 20, beforeTime?: number): LiquiditySweepResult | null {
  if (candles15m.length < 12) return null;

  // Precompute all swing points from the full array (excluding the very last bar
  // so it isn't both a pivot candidate and a sweep candidate simultaneously).
  const allSwings = detectSwingPoints(candles15m.slice(0, -1), SWING_LEFT, SWING_RIGHT);
  if (allSwings.length === 0) return null;

  const startIdx = Math.max(1, candles15m.length - lookback);

  // Scan from most-recent candidate backward; return the first (most recent) hit.
  for (let i = candles15m.length - 1; i >= startIdx; i--) {
    const candle = candles15m[i];

    // Restrict to sweeps that precede the anchor (e.g. the MSS break).
    if (beforeTime !== undefined && candle.time >= beforeTime) continue;

    // Only use swing points whose confirmation window ended before this candle.
    const swings = allSwings.filter(s => s.index + SWING_RIGHT < i);

    const swingLows = swings.filter(s => s.type === "low");
    for (let j = swingLows.length - 1; j >= 0; j--) {
      const sl = swingLows[j];
      if (candle.low < sl.price && candle.close > sl.price) {
        return {
          type: "sell-side",
          sweptLevel: sl.price,
          sweepCandle: candle,
          time: candle.time,
        };
      }
    }

    const swingHighs = swings.filter(s => s.type === "high");
    for (let j = swingHighs.length - 1; j >= 0; j--) {
      const sh = swingHighs[j];
      if (candle.high > sh.price && candle.close < sh.price) {
        return {
          type: "buy-side",
          sweptLevel: sh.price,
          sweepCandle: candle,
          time: candle.time,
        };
      }
    }
  }

  return null;
}
