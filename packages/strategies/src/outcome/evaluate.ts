import type { Candle } from "@ict-forward-lab/core";
import {
  DEFAULT_EVALUATE_OUTCOME_CONFIG,
  type EvaluateOutcomeConfig,
  type OutcomeResult,
  type SetupForOutcome,
} from "./types";

/**
 * Measure how a setup would have resolved against subsequent price.
 *
 * `futureCandles` MUST be the candles that come strictly AFTER the setup formed
 * (no look-ahead): the bar that produced the setup has already printed. Fill
 * model: a limit entry is touched when price trades to it (long: low ≤ entry,
 * short: high ≥ entry). Once filled, the first candle to reach stop or target
 * decides the outcome; if a single candle spans both, we resolve conservatively
 * as a loss (we can't know intrabar order from OHLC).
 *
 * Pure and deterministic — this is what turns a scored packet into a label the
 * calibration engine can learn from.
 */
export function evaluateOutcome(
  setup: SetupForOutcome,
  futureCandles: Candle[],
  config: Partial<EvaluateOutcomeConfig> = {}
): OutcomeResult {
  const cfg: EvaluateOutcomeConfig = { ...DEFAULT_EVALUATE_OUTCOME_CONFIG, ...config };
  const isLong = setup.direction === "long";
  const risk = Math.abs(setup.entry - setup.stopLoss);
  const plannedRR = risk > 0 ? Math.abs(setup.takeProfit - setup.entry) / risk : 0;

  const base: OutcomeResult = {
    filled: false,
    entryIndex: null,
    entryTime: null,
    outcome: "no_fill",
    exitIndex: null,
    exitTime: null,
    rMultiple: null,
    plannedRR,
    mfeR: 0,
    maeR: 0,
    timeToOutcomeSec: null,
  };

  // A setup with no risk distance is malformed; report no_fill rather than NaN.
  if (risk <= 0) return base;

  const horizon = futureCandles.slice(0, cfg.horizonCandles);

  // 1. Find the fill.
  let entryIndex = -1;
  for (let i = 0; i < horizon.length; i++) {
    const c = horizon[i];
    const touched = isLong ? c.low <= setup.entry : c.high >= setup.entry;
    if (touched) {
      entryIndex = i;
      break;
    }
  }
  if (entryIndex === -1) return base;

  base.filled = true;
  base.entryIndex = entryIndex;
  base.entryTime = horizon[entryIndex].time;

  // 2. Walk forward from the fill, tracking MFE/MAE and the first stop/target hit.
  let mfeR = 0;
  let maeR = 0;
  for (let i = entryIndex; i < horizon.length; i++) {
    const c = horizon[i];

    const favorable = isLong ? c.high - setup.entry : setup.entry - c.low;
    const adverse = isLong ? setup.entry - c.low : c.high - setup.entry;
    mfeR = Math.max(mfeR, favorable / risk);
    maeR = Math.max(maeR, adverse / risk);

    const hitStop = isLong ? c.low <= setup.stopLoss : c.high >= setup.stopLoss;
    const hitTarget = isLong ? c.high >= setup.takeProfit : c.low <= setup.takeProfit;

    if (hitStop || hitTarget) {
      // Conservative: if both printed in one candle, assume the stop came first.
      const win = hitTarget && !hitStop;
      base.outcome = win ? "win" : "loss";
      base.exitIndex = i;
      base.exitTime = c.time;
      base.rMultiple = win ? plannedRR : -1;
      base.timeToOutcomeSec =
        base.entryTime != null ? c.time - base.entryTime : null;
      base.mfeR = round(mfeR);
      base.maeR = round(maeR);
      return base;
    }
  }

  // 3. Filled but neither stop nor target reached within the horizon.
  const last = horizon[horizon.length - 1];
  const markR = last
    ? (isLong ? last.close - setup.entry : setup.entry - last.close) / risk
    : 0;
  base.outcome = "open";
  base.rMultiple = round(markR);
  base.mfeR = round(mfeR);
  base.maeR = round(maeR);
  return base;
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
