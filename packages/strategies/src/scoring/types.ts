/**
 * Boolean confluence signals fed to the scoring engine. Each maps to a signed
 * weight in SCORE_WEIGHTS. All default to false (absent = no contribution).
 */
export interface ScoreSignals {
  // Positive confluences
  htfBiasAligned?: boolean;
  weeklyProfileSupports?: boolean;
  sessionProfileSupports?: boolean;
  amdPhaseClear?: boolean;
  manipulationDetected?: boolean;
  irlToErlClear?: boolean;
  mssConfirmed?: boolean;
  displacementPresent?: boolean;
  validFvg?: boolean;
  fvgAlignsVolumeProfile?: boolean;
  priceWithPocDirection?: boolean;
  clearErlTarget?: boolean;
  rrAboveTwo?: boolean;

  // Negative confluences (penalties)
  againstWeeklyBias?: boolean;
  noClearAmd?: boolean;
  irlErlUnclear?: boolean;
  trappedInValueArea?: boolean;
  alreadyReachedErl?: boolean;
  lateInSession?: boolean;
  volumeProfileOpposes?: boolean;
  noCleanInvalidation?: boolean;
}

export type ScoreGrade =
  | "A+"
  | "A"
  | "A-"
  | "B+"
  | "B"
  | "B-"
  | "C+"
  | "C"
  | "D";

export type ScoreRecommendation =
  | "ignore"
  | "monitor_only"
  | "internal_alert"
  | "send_to_oc"
  | "send_to_oc_and_ha";

export interface ScoreResult {
  /** Clamped 0..100. */
  total: number;
  /** Raw signed sum before clamping (useful for debugging/calibration). */
  raw: number;
  grade: ScoreGrade;
  recommendation: ScoreRecommendation;
  /** Per-signal contributions that fired (signed). */
  breakdown: Partial<Record<keyof ScoreSignals, number>>;
}
