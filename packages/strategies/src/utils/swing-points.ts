import type { Candle } from "@ict-forward-lab/core";
import type { SwingPoint } from "../ict-model-2022/types";

/**
 * Detect swing highs and swing lows using N-bar pivot logic.
 * A swing high: candle high > high of all N candles on each side.
 * A swing low: candle low < low of all N candles on each side.
 */
export function detectSwingPoints(
  candles: Candle[],
  leftBars: number = 5,
  rightBars: number = 5
): SwingPoint[] {
  const points: SwingPoint[] = [];
  const minRequired = leftBars + rightBars + 1;

  if (candles.length < minRequired) return points;

  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const current = candles[i];

    // Check swing high
    let isSwingHigh = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].high >= current.high) {
        isSwingHigh = false;
        break;
      }
    }

    if (isSwingHigh) {
      points.push({
        type: "high",
        price: current.high,
        time: current.time,
        index: i,
      });
    }

    // Check swing low
    let isSwingLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (candles[j].low <= current.low) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingLow) {
      points.push({
        type: "low",
        price: current.low,
        time: current.time,
        index: i,
      });
    }
  }

  return points;
}
