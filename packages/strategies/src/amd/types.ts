export type AmdPhase =
  | "accumulation"
  | "manipulation"
  | "distribution"
  | "unknown";

export type ManipulatedSide = "buy_side" | "sell_side" | null;

export type Displacement = "bullish" | "bearish" | "none";

export interface PriceRange {
  high: number;
  low: number;
}

export interface AmdResult {
  phase: AmdPhase;
  /** Which side of the range was swept during manipulation, if any. */
  manipulatedSide: ManipulatedSide;
  /** The price level that was swept (range high/low), if any. */
  sweptLevel: number | null;
  /** Whether price reclaimed the range after sweeping it. */
  reclaim: boolean;
  /** Direction of the dominant displacement candle in the window. */
  displacement: Displacement;
  /** 0..1 — how strongly the signs support the chosen phase. */
  confidence: number;
}

export interface AmdConfig {
  /** Candles inspected from the end of the array. Default 12. */
  lookback: number;
  /** Body/range ratio below which the window reads as accumulation. Default 0.4. */
  accumulationBodyRatio: number;
  /** Body size as a multiple of mean range to count as displacement. Default 1.5. */
  displacementAtrMultiple: number;
}

export const DEFAULT_AMD_CONFIG: AmdConfig = {
  lookback: 12,
  accumulationBodyRatio: 0.4,
  displacementAtrMultiple: 1.5,
};
