import type { Candle } from "@ict-forward-lab/core";
import type { MSSResult, SwingPoint } from "../ict-model-2022/types";
import { detectSwingPoints } from "../utils/swing-points";

/**
 * A single market-structure break event.
 * MSS = first break that CHANGES the prevailing direction.
 * BOS = subsequent break that CONTINUES the prevailing direction.
 */
export interface StructureBreak {
  type: "MSS" | "BOS";
  direction: "bullish" | "bearish";
  breakLevel: number;
  /** Time of the candle that closed through the level. */
  time: number;
  /** Time of the swing point that was broken (line origin). */
  fromTime: number;
}

/**
 * Detect ALL market-structure breaks (MSS and BOS) across a candle series.
 *
 * Walks the series forward, tracking the most recent confirmed swing high/low
 * as breakable reference levels. When price closes through a reference level it
 * records a break: a direction change is an MSS, a continuation is a BOS.
 *
 * This is timeframe-agnostic — it operates purely on the candles passed in, so
 * it produces structure breaks for any timeframe (5m, 15m, 1h, 4h, …).
 */
export function detectStructureBreaks(
  candles: Candle[],
  leftBars = 5,
  rightBars = 5,
): StructureBreak[] {
  const breaks: StructureBreak[] = [];
  if (candles.length < leftBars + rightBars + 1) return breaks;

  const swings = detectSwingPoints(candles, leftBars, rightBars);
  if (swings.length === 0) return breaks;

  let trend: "bullish" | "bearish" | null = null;
  let refHigh: SwingPoint | null = null;
  let refLow: SwingPoint | null = null;
  let swingIdx = 0;

  for (let i = 0; i < candles.length; i++) {
    // Activate swing points only once their right-side confirmation window has
    // fully closed by this candle index (no look-ahead / no repaint).
    while (swingIdx < swings.length && swings[swingIdx].index + rightBars < i) {
      const sp = swings[swingIdx];
      if (sp.type === "high") refHigh = sp;
      else refLow = sp;
      swingIdx++;
    }

    const candle = candles[i];

    if (refHigh && candle.close > refHigh.price) {
      breaks.push({
        type: trend === "bullish" ? "BOS" : "MSS",
        direction: "bullish",
        breakLevel: refHigh.price,
        time: candle.time,
        fromTime: refHigh.time,
      });
      trend = "bullish";
      refHigh = null; // consume — wait for a new swing high to form
    } else if (refLow && candle.close < refLow.price) {
      breaks.push({
        type: trend === "bearish" ? "BOS" : "MSS",
        direction: "bearish",
        breakLevel: refLow.price,
        time: candle.time,
        fromTime: refLow.time,
      });
      trend = "bearish";
      refLow = null; // consume — wait for a new swing low to form
    }
  }

  return breaks;
}


const SWING_LEFT = 5;
const SWING_RIGHT = 5;

/**
 * Detect Market Structure Shift (MSS / ChoCh) on 15m, scanning the last `lookback` candles.
 * Bullish MSS: in downtrend (LH/LL), price breaks above last lower high.
 * Bearish MSS: in uptrend (HH/HL), price breaks below last higher low.
 * Returns the most recent qualifying MSS.
 */
export function detectMSS(candles15m: Candle[], lookback = 20): MSSResult | null {
  if (candles15m.length < 12) return null;

  const allSwings = detectSwingPoints(candles15m.slice(0, -1), SWING_LEFT, SWING_RIGHT);
  if (allSwings.length < 3) return null;

  const startIdx = Math.max(1, candles15m.length - lookback);

  for (let i = candles15m.length - 1; i >= startIdx; i--) {
    const candle = candles15m[i];

    const swings = allSwings.filter(s => s.index + SWING_RIGHT < i);
    const highs = swings.filter(s => s.type === "high");
    const lows = swings.filter(s => s.type === "low");

    if (highs.length < 2 || lows.length < 2) continue;

    // Downtrend (LH pattern) → bullish MSS: break above last lower high
    const lastHighs = highs.slice(-2);
    const isLH = lastHighs[1].price < lastHighs[0].price;
    if (isLH && candle.close > lastHighs[1].price) {
      return {
        direction: "bullish",
        breakLevel: lastHighs[1].price,
        breakCandle: candle,
        time: candle.time,
      };
    }

    // Uptrend (HL pattern) → bearish MSS: break below last higher low
    const lastLows = lows.slice(-2);
    const isHL = lastLows[1].price > lastLows[0].price;
    if (isHL && candle.close < lastLows[1].price) {
      return {
        direction: "bearish",
        breakLevel: lastLows[1].price,
        breakCandle: candle,
        time: candle.time,
      };
    }
  }

  return null;
}

/**
 * Detect Break of Structure (BOS) — continuation breaks in the current trend.
 * BOS occurs when price breaks a swing point in the same direction as the existing trend.
 * MSS = first break that CHANGES direction
 * BOS = subsequent breaks that CONTINUE direction
 */
export function detectBOS(candles15m: Candle[], lookback = 20): MSSResult | null {
  if (candles15m.length < 12) return null;

  const allSwings = detectSwingPoints(candles15m.slice(0, -1), SWING_LEFT, SWING_RIGHT);
  if (allSwings.length < 3) return null;

  const startIdx = Math.max(1, candles15m.length - lookback);

  for (let i = candles15m.length - 1; i >= startIdx; i--) {
    const candle = candles15m[i];

    const swings = allSwings.filter(s => s.index + SWING_RIGHT < i);
    const highs = swings.filter(s => s.type === "high");
    const lows = swings.filter(s => s.type === "low");

    if (highs.length < 2 || lows.length < 2) continue;

    // Uptrend (HH pattern) → bullish BOS: break above last higher high
    const lastHighs = highs.slice(-2);
    const isHH = lastHighs[1].price > lastHighs[0].price;
    if (isHH && candle.close > lastHighs[1].price) {
      return {
        direction: "bullish",
        breakLevel: lastHighs[1].price,
        breakCandle: candle,
        time: candle.time,
      };
    }

    // Downtrend (LL pattern) → bearish BOS: break below last lower low
    const lastLows = lows.slice(-2);
    const isLL = lastLows[1].price < lastLows[0].price;
    if (isLL && candle.close < lastLows[1].price) {
      return {
        direction: "bearish",
        breakLevel: lastLows[1].price,
        breakCandle: candle,
        time: candle.time,
      };
    }
  }

  return null;
}
