export type WeeklyBias = "bullish" | "bearish" | "neutral";

export type WeeklyProfileType =
  | "classic_bullish_week"
  | "classic_bearish_week"
  | "consolidation_week"
  | "reversal_week"
  | "expansion_week";

export type RangePosition =
  | "lower_discount"
  | "middle_discount"
  | "equilibrium"
  | "middle_premium"
  | "upper_premium";

export interface TradePermission {
  longAllowed: boolean;
  shortAllowed: boolean;
  reason: string;
}

export interface PreviousWeek {
  high: number;
  low: number;
}

export interface WeeklyProfileResult {
  weekOpen: number;
  currentWeekHigh: number;
  currentWeekLow: number;
  price: number;
  priceVsWeekOpen: "above" | "below" | "at";
  weeklyBias: WeeklyBias;
  rangePosition: RangePosition;
  likelyProfile: WeeklyProfileType;
  /** Liquidity the week is most likely drawing toward. */
  weeklyDraw: string;
  permission: TradePermission;
}

export interface WeeklyProfileConfig {
  /** Range width (as a fraction of price) below which the week is consolidating. Default 0.02. */
  consolidationFraction: number;
  /** Range width (as a fraction of price) above which the week is expanding. Default 0.06. */
  expansionFraction: number;
}

export const DEFAULT_WEEKLY_PROFILE_CONFIG: WeeklyProfileConfig = {
  consolidationFraction: 0.02,
  expansionFraction: 0.06,
};
