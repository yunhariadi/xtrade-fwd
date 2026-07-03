import type {
  ScoreGrade,
  ScoreRecommendation,
  ScoreResult,
  ScoreSignals,
} from "./types";

/**
 * Signed weights per confluence signal (from the data-brain design, §13).
 *
 * NOTE: the positive weights sum past 100 — they are a heuristic, not a
 * probability. We compute the raw signed sum then clamp to 0..100; treat the
 * score as a relative ranking.
 *
 * CALIBRATED 2026-07-02: four signals had their signs flipped because both
 * calibration runs 4 and 5 (BTCUSDT Jan–Jul 2026, killzone samples) showed
 * their win-rate lift consistently INVERTED vs. the design's assumption —
 * BTC intraday behaved mean-reverting against these trend-following inputs:
 *   htfBiasAligned        +15 → −15  (lift −9.1pp, n=158 with)
 *   fvgAlignsVolumeProfile +10 → −10 (lift −9.6pp, n=1700 with)
 *   priceWithPocDirection   +5 → −5  (lift −16.7pp, n=1752 with)
 *   volumeProfileOpposes  −10 → +10  (lift +17.0pp, n=145 with)
 * Re-validate these against future calibration runs before trusting further.
 *
 * CLEANUP 2026-07-03 (after OOS run 8, 2025-H2): the htfBiasAligned flip held
 * out-of-sample (the one robust cross-period finding). fvgAlignsVolumeProfile
 * turned out perfectly collinear with priceWithPocDirection — the VP `bias` is
 * derived from price-vs-POC, so both booleans measured the same thing twice.
 * priceWithPocDirection keeps the price-vs-POC weight; fvgAlignsVolumeProfile
 * was redefined in the packet assembler to a real volume-shape measurement
 * (active FVG overlaps an LVN) and sits at WEIGHT 0: measured by calibration
 * runs but not scored until it shows out-of-sample lift.
 *
 * Structurally constant in the fvg-retrace calibration population (NOT bugs —
 * they vary for general packet consumers): validFvg (always true: samples are
 * FVG setups by construction), irlErlUnclear (FVG touch = recent IRL
 * interaction, so the draw is never "unclear"), noCleanInvalidation
 * (invalidation is always derived when an entry exists).
 */
export const SCORE_WEIGHTS: Record<keyof ScoreSignals, number> = {
  // Confluence signals (designed positive; flipped entries per calibration)
  htfBiasAligned: -15,
  weeklyProfileSupports: 10,
  sessionProfileSupports: 10,
  amdPhaseClear: 10,
  manipulationDetected: 15,
  irlToErlClear: 15,
  mssConfirmed: 15,
  displacementPresent: 10,
  validFvg: 10,
  // Candidate under measurement (FVG × LVN overlap) — see CLEANUP note above.
  fvgAlignsVolumeProfile: 0,
  priceWithPocDirection: -5,
  clearErlTarget: 10,
  rrAboveTwo: 10,
  // Caution signals (designed negative; flipped entries per calibration)
  againstWeeklyBias: -20,
  noClearAmd: -10,
  irlErlUnclear: -10,
  trappedInValueArea: -10,
  alreadyReachedErl: -20,
  lateInSession: -10,
  volumeProfileOpposes: 10,
  noCleanInvalidation: -20,
};

/**
 * Score a setup from its confluence signals. Deterministic: the same signals
 * always yield the same total/grade/recommendation.
 */
export function scoreSetup(signals: ScoreSignals): ScoreResult {
  const breakdown: Partial<Record<keyof ScoreSignals, number>> = {};
  let raw = 0;
  for (const key of Object.keys(SCORE_WEIGHTS) as (keyof ScoreSignals)[]) {
    if (signals[key]) {
      const w = SCORE_WEIGHTS[key];
      breakdown[key] = w;
      raw += w;
    }
  }

  const total = clamp(raw, 0, 100);
  return {
    total,
    raw,
    grade: gradeFor(total),
    recommendation: recommendationFor(total),
    breakdown,
  };
}

function gradeFor(total: number): ScoreGrade {
  if (total >= 90) return "A+";
  if (total >= 85) return "A";
  if (total >= 80) return "A-";
  if (total >= 75) return "B+";
  if (total >= 70) return "B";
  if (total >= 65) return "B-";
  if (total >= 60) return "C+";
  if (total >= 50) return "C";
  return "D";
}

/** Threshold gating from the data-brain design (§13). */
function recommendationFor(total: number): ScoreRecommendation {
  if (total >= 80) return "send_to_oc_and_ha";
  if (total >= 70) return "send_to_oc";
  if (total >= 65) return "internal_alert";
  if (total >= 50) return "monitor_only";
  return "ignore";
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
