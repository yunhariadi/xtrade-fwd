import type { Candle } from "@ict-forward-lab/core";
import {
  DEFAULT_WEEKLY_PROFILE_CONFIG,
  type PreviousWeek,
  type RangePosition,
  type TradePermission,
  type WeeklyBias,
  type WeeklyProfileConfig,
  type WeeklyProfileResult,
  type WeeklyProfileType,
} from "./types";

/**
 * Summarise the current (partial) trading week and produce a directional
 * permission gate for lower-timeframe setups.
 *
 * `weekCandles` are the candles that make up the current week so far (any
 * timeframe — daily or 4H work well). `previousWeek` enables stronger bias /
 * draw calls (e.g. price accepting above last week's high). Feed closed candles.
 */
export function buildWeeklyProfile(
  weekCandles: Candle[],
  previousWeek?: PreviousWeek,
  config: Partial<WeeklyProfileConfig> = {}
): WeeklyProfileResult | null {
  const cfg: WeeklyProfileConfig = { ...DEFAULT_WEEKLY_PROFILE_CONFIG, ...config };
  if (weekCandles.length === 0) return null;

  const weekOpen = weekCandles[0].open;
  const price = weekCandles[weekCandles.length - 1].close;
  const currentWeekHigh = Math.max(...weekCandles.map((c) => c.high));
  const currentWeekLow = Math.min(...weekCandles.map((c) => c.low));
  const range = currentWeekHigh - currentWeekLow;

  const priceVsWeekOpen =
    price > weekOpen ? "above" : price < weekOpen ? "below" : "at";

  const rangePosition = positionInRange(price, currentWeekHigh, currentWeekLow);
  const weeklyBias = deriveBias(price, weekOpen, previousWeek);
  const likelyProfile = deriveProfile(
    weeklyBias,
    range,
    price,
    weekOpen,
    currentWeekHigh,
    currentWeekLow,
    previousWeek,
    cfg
  );
  const weeklyDraw = deriveDraw(weeklyBias, currentWeekHigh, currentWeekLow, price, previousWeek);
  const permission = derivePermission(weeklyBias, priceVsWeekOpen, weeklyDraw);

  return {
    weekOpen,
    currentWeekHigh,
    currentWeekLow,
    price,
    priceVsWeekOpen,
    weeklyBias,
    rangePosition,
    likelyProfile,
    weeklyDraw,
    permission,
  };
}

function positionInRange(price: number, high: number, low: number): RangePosition {
  const span = high - low;
  if (span <= 0) return "equilibrium";
  const f = (price - low) / span;
  if (f < 0.25) return "lower_discount";
  if (f < 0.45) return "middle_discount";
  if (f <= 0.55) return "equilibrium";
  if (f <= 0.75) return "middle_premium";
  return "upper_premium";
}

function deriveBias(
  price: number,
  weekOpen: number,
  prev?: PreviousWeek
): WeeklyBias {
  // Acceptance beyond the prior week's range is the strongest tell.
  if (prev && price > prev.high) return "bullish";
  if (prev && price < prev.low) return "bearish";
  if (price > weekOpen) return "bullish";
  if (price < weekOpen) return "bearish";
  return "neutral";
}

function deriveProfile(
  bias: WeeklyBias,
  range: number,
  price: number,
  weekOpen: number,
  high: number,
  low: number,
  prev: PreviousWeek | undefined,
  cfg: WeeklyProfileConfig
): WeeklyProfileType {
  const rangeFraction = price > 0 ? range / price : 0;
  if (rangeFraction <= cfg.consolidationFraction) return "consolidation_week";
  if (rangeFraction >= cfg.expansionFraction) return "expansion_week";

  // Reversal: swept one extreme of the prior week but closed back the other way.
  if (prev) {
    if (high > prev.high && price < weekOpen) return "reversal_week";
    if (low < prev.low && price > weekOpen) return "reversal_week";
  }

  if (bias === "bullish") return "classic_bullish_week";
  if (bias === "bearish") return "classic_bearish_week";
  return "consolidation_week";
}

function deriveDraw(
  bias: WeeklyBias,
  high: number,
  low: number,
  price: number,
  prev?: PreviousWeek
): string {
  if (bias === "bullish") {
    if (prev && price < prev.high) return "previous_week_high";
    return "current_week_high";
  }
  if (bias === "bearish") {
    if (prev && price > prev.low) return "previous_week_low";
    return "current_week_low";
  }
  return "range_bound";
}

function derivePermission(
  bias: WeeklyBias,
  priceVsWeekOpen: "above" | "below" | "at",
  draw: string
): TradePermission {
  if (bias === "bullish") {
    return {
      longAllowed: true,
      shortAllowed: false,
      reason: `Price is ${priceVsWeekOpen} weekly open and draw is ${draw}.`,
    };
  }
  if (bias === "bearish") {
    return {
      longAllowed: false,
      shortAllowed: true,
      reason: `Price is ${priceVsWeekOpen} weekly open and draw is ${draw}.`,
    };
  }
  return {
    longAllowed: true,
    shortAllowed: true,
    reason: "Weekly bias is neutral; both directions permitted with caution.",
  };
}
