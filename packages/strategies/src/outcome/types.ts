/** A setup whose outcome we want to measure against future price. */
export interface SetupForOutcome {
  direction: "long" | "short";
  /** Limit entry price (a retrace level, or the market close for market entries). */
  entry: number;
  stopLoss: number;
  takeProfit: number;
  /** Setup creation time (Unix seconds), used for time-to-outcome. */
  time?: number;
}

export type OutcomeLabel = "win" | "loss" | "no_fill" | "open";

export interface OutcomeResult {
  /** Whether the limit entry was ever touched within the horizon. */
  filled: boolean;
  entryIndex: number | null;
  entryTime: number | null;
  outcome: OutcomeLabel;
  exitIndex: number | null;
  exitTime: number | null;
  /** Realized R: win = +plannedRR, loss = -1, open = mark-to-last, no_fill = null. */
  rMultiple: number | null;
  /** Planned reward:risk of the setup. */
  plannedRR: number;
  /** Max favorable excursion after entry, in R. */
  mfeR: number;
  /** Max adverse excursion after entry, in R. */
  maeR: number;
  timeToOutcomeSec: number | null;
}

export interface EvaluateOutcomeConfig {
  /** Max future candles to look ahead before declaring "open"/"no_fill". Default 48. */
  horizonCandles: number;
}

export const DEFAULT_EVALUATE_OUTCOME_CONFIG: EvaluateOutcomeConfig = {
  horizonCandles: 48,
};
