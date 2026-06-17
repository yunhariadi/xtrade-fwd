export type SessionPhase =
  | "accumulation"
  | "manipulation"
  | "distribution"
  | "unknown";

export type SessionProfileType =
  | "sweep_reclaim_expand"
  | "judas_swing"
  | "continuation"
  | "reversal"
  | "range"
  | "unknown";

export type RangeExpansion =
  | "above_reference_range"
  | "below_reference_range"
  | "expanded_both_sides"
  | "inside_reference_range";

/** A prior reference range (e.g. the Asia session) with labelled edges. */
export interface ReferenceRange {
  high: number;
  low: number;
  /** Label for the high edge, e.g. "asia_high". */
  highLabel: string;
  /** Label for the low edge, e.g. "asia_low". */
  lowLabel: string;
}

export interface SessionProfileResult {
  sessionName: string;
  sessionPhase: SessionPhase;
  rangeExpansion: RangeExpansion;
  /** Reference edge that was swept then reclaimed, if any. */
  sweptLiquidity: string | null;
  /** Reference edge the session now appears to be drawing toward. */
  activeDraw: string | null;
  profileType: SessionProfileType;
  /** Net direction of the session so far. */
  direction: "bullish" | "bearish" | "neutral";
  label: string;
  confidence: number;
}
