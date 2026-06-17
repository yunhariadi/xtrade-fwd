/** Internal Range Liquidity vs External Range Liquidity. */
export type LiquidityCategory = "IRL" | "ERL";

export type DrawDirection = "IRL_to_ERL" | "ERL_to_IRL" | "unclear";

/**
 * A liquidity level or zone the market can draw toward. Use `price` for a single
 * level (PDH, equal highs) or `low`/`high` for a zone (FVG, order block).
 */
export interface LiquidityTarget {
  category: LiquidityCategory;
  /** Short human label, e.g. "Asia High", "5m bullish FVG". */
  label: string;
  /** Sub-type tag, e.g. "fvg", "previous_day_high", "equal_highs". */
  type: string;
  /** Representative price (zone midpoint if a zone is given). */
  price: number;
  low?: number;
  high?: number;
}

export interface IrlErlResult {
  currentDraw: DrawDirection;
  /** The level price most recently interacted with (the anchor). */
  from: LiquidityTarget | null;
  /** The nearest opposite-category target in the travel direction. */
  to: LiquidityTarget | null;
  /** Travel direction inferred from recent candles. */
  travel: "up" | "down" | "flat";
  status: string;
  confidence: number;
}

export interface IrlErlConfig {
  /** Candles used to infer travel direction and recent interaction. Default 12. */
  lookback: number;
}

export const DEFAULT_IRL_ERL_CONFIG: IrlErlConfig = {
  lookback: 12,
};
