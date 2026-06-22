import type { Candle } from "@ict-forward-lab/core";
import { detectSwingPoints } from "../utils/swing-points";

/**
 * A resting liquidity level — an un-mitigated swing extreme where stops pool.
 * Buy-side liquidity rests above swing highs; sell-side rests below swing lows.
 */
export interface LiquidityLevel {
  /** Stable id: `liquidity-{type}-{time}`. */
  id: string;
  type: "buy-side" | "sell-side";
  /** The swing extreme price where liquidity rests. */
  price: number;
  /** Time of the swing candle (Unix seconds). */
  time: number;
  /** True once a later candle traded through the level. */
  swept: boolean;
  /** Time of the candle that swept the level (Unix seconds), null if un-swept. */
  sweptAt: number | null;
}

/**
 * Detect resting liquidity levels from swing highs/lows.
 *
 * Buy-side = swing highs (liquidity above), sell-side = swing lows (below).
 * A level is `swept` when a subsequent candle's wick traded through it. Pure and
 * deterministic — feed closed candles only. This is the data source for both the
 * chart's liquidity overlay and snapshot resolution of indicator alerts.
 */
export function detectLiquidityLevels(
  candles: Candle[],
  leftBars = 5,
  rightBars = 5,
): LiquidityLevel[] {
  const swings = detectSwingPoints(candles, leftBars, rightBars);
  const levels: LiquidityLevel[] = [];

  for (const sp of swings) {
    const type = sp.type === "high" ? "buy-side" : "sell-side";
    // Swept if any candle after the swing's confirmation window traded through.
    let sweptAt: number | null = null;
    for (let i = sp.index + rightBars + 1; i < candles.length; i++) {
      if (type === "buy-side" ? candles[i].high > sp.price : candles[i].low < sp.price) {
        sweptAt = candles[i].time;
        break;
      }
    }
    levels.push({
      id: `liquidity-${type}-${sp.time}`,
      type,
      price: sp.price,
      time: sp.time,
      swept: sweptAt !== null,
      sweptAt,
    });
  }

  return levels;
}
