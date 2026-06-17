import { SCORE_WEIGHTS, type ScoreSignals } from "../scoring";
import type { OutcomeLabel } from "./types";

/** One scored setup paired with how it actually resolved. */
export interface CalibrationSample {
  score: number;
  signals: ScoreSignals;
  outcome: OutcomeLabel;
  rMultiple: number | null;
}

export interface BucketStats {
  label: string;
  min: number;
  max: number;
  /** Total samples whose score fell in the bucket. */
  count: number;
  /** Samples with a decided outcome (win or loss). */
  decided: number;
  winRate: number;
  avgR: number;
}

export interface SignalStats {
  signal: keyof ScoreSignals;
  weight: number;
  withDecided: number;
  withWinRate: number;
  withAvgR: number;
  withoutDecided: number;
  withoutWinRate: number;
  withoutAvgR: number;
  /** withWinRate − withoutWinRate: how much the signal's presence lifts win rate. */
  liftWinRate: number;
}

export interface CalibrationReport {
  total: number;
  filled: number;
  decided: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  /** Win rate / avg R grouped by score bucket — the core score-calibration view. */
  byScoreBucket: BucketStats[];
  /** Per-signal predictive lift, sorted by |liftWinRate| descending. */
  bySignal: SignalStats[];
}

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "ignore (<50)", min: 0, max: 49 },
  { label: "monitor (50-64)", min: 50, max: 64 },
  { label: "internal (65-69)", min: 65, max: 69 },
  { label: "send_to_oc (70-79)", min: 70, max: 79 },
  { label: "send_to_oc_and_ha (80+)", min: 80, max: 100 },
];

/**
 * Aggregate scored setups + their outcomes into a calibration report.
 *
 * "decided" = win or loss; no_fill and open are excluded from win-rate and avg-R
 * so unfilled limits don't pollute the stats. The per-signal lift tells you
 * which confluences actually predict wins — the input you need to re-weight
 * SCORE_WEIGHTS away from the untuned defaults.
 */
export function buildCalibrationReport(samples: CalibrationSample[]): CalibrationReport {
  const decidedSamples = samples.filter((s) => s.outcome === "win" || s.outcome === "loss");
  const wins = decidedSamples.filter((s) => s.outcome === "win").length;
  const losses = decidedSamples.length - wins;
  const filled = samples.filter((s) => s.outcome !== "no_fill").length;

  const byScoreBucket = BUCKETS.map((b) => {
    const inBucket = samples.filter((s) => s.score >= b.min && s.score <= b.max);
    const decided = inBucket.filter((s) => s.outcome === "win" || s.outcome === "loss");
    return {
      label: b.label,
      min: b.min,
      max: b.max,
      count: inBucket.length,
      decided: decided.length,
      winRate: winRateOf(decided),
      avgR: avgROf(decided),
    };
  });

  const bySignal = (Object.keys(SCORE_WEIGHTS) as (keyof ScoreSignals)[])
    .map((signal) => {
      const withS = decidedSamples.filter((s) => Boolean(s.signals[signal]));
      const withoutS = decidedSamples.filter((s) => !s.signals[signal]);
      const withWinRate = winRateOf(withS);
      const withoutWinRate = winRateOf(withoutS);
      return {
        signal,
        weight: SCORE_WEIGHTS[signal],
        withDecided: withS.length,
        withWinRate,
        withAvgR: avgROf(withS),
        withoutDecided: withoutS.length,
        withoutWinRate,
        withoutAvgR: avgROf(withoutS),
        liftWinRate: round(withWinRate - withoutWinRate),
      };
    })
    .sort((a, b) => Math.abs(b.liftWinRate) - Math.abs(a.liftWinRate));

  return {
    total: samples.length,
    filled,
    decided: decidedSamples.length,
    wins,
    losses,
    winRate: winRateOf(decidedSamples),
    avgR: avgROf(decidedSamples),
    byScoreBucket,
    bySignal,
  };
}

function winRateOf(decided: CalibrationSample[]): number {
  if (decided.length === 0) return 0;
  const wins = decided.filter((s) => s.outcome === "win").length;
  return round(wins / decided.length);
}

function avgROf(decided: CalibrationSample[]): number {
  if (decided.length === 0) return 0;
  const sum = decided.reduce((a, s) => a + (s.rMultiple ?? 0), 0);
  return round(sum / decided.length);
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
