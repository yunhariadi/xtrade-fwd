import type { Candle } from "@ict-forward-lab/core";
import type { BiasDirection, SwingPoint } from "../ict-model-2022/types";
import { detectSwingPoints } from "../utils/swing-points";

/**
 * Detect 4H directional bias using swing structure.
 * HH/HL = bullish, LH/LL = bearish, else neutral.
 * Analyzes last 20 candles.
 */
export function detect4HBias(candles4h: Candle[]): BiasDirection {
  const lookback = candles4h.slice(-20);
  const swings = detectSwingPoints(lookback, 3, 3); // Use 3-bar pivots on 4H for more sensitivity

  if (swings.length < 4) return "neutral";

  // Get last 2 swing highs and last 2 swing lows
  const highs = swings.filter(s => s.type === "high");
  const lows = swings.filter(s => s.type === "low");

  if (highs.length < 2 || lows.length < 2) return "neutral";

  const lastHighs = highs.slice(-2);
  const lastLows = lows.slice(-2);

  const isHH = lastHighs[1].price > lastHighs[0].price;
  const isHL = lastLows[1].price > lastLows[0].price;
  const isLH = lastHighs[1].price < lastHighs[0].price;
  const isLL = lastLows[1].price < lastLows[0].price;

  if (isHH && isHL) return "bullish";
  if (isLH && isLL) return "bearish";

  return "neutral";
}
