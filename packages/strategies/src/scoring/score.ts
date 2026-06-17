import type {
  ScoreGrade,
  ScoreRecommendation,
  ScoreResult,
  ScoreSignals,
} from "./types";

/**
 * Signed weights per confluence signal (from the data-brain design, §13).
 *
 * NOTE: the positive weights sum to +145, not 100 — they are an *untuned*
 * heuristic. We compute the raw signed sum then clamp to 0..100. These weights
 * should be calibrated against forward-test/backtest outcomes before being
 * trusted; treat the score as a relative ranking, not a probability.
 */
export const SCORE_WEIGHTS: Record<keyof ScoreSignals, number> = {
  // Positive
  htfBiasAligned: 15,
  weeklyProfileSupports: 10,
  sessionProfileSupports: 10,
  amdPhaseClear: 10,
  manipulationDetected: 15,
  irlToErlClear: 15,
  mssConfirmed: 15,
  displacementPresent: 10,
  validFvg: 10,
  fvgAlignsVolumeProfile: 10,
  priceWithPocDirection: 5,
  clearErlTarget: 10,
  rrAboveTwo: 10,
  // Negative
  againstWeeklyBias: -20,
  noClearAmd: -10,
  irlErlUnclear: -10,
  trappedInValueArea: -10,
  alreadyReachedErl: -20,
  lateInSession: -10,
  volumeProfileOpposes: -10,
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
