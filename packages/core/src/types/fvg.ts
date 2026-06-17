/**
 * Represents a Fair Value Gap zone detected from candle data.
 * FVGs are price imbalances that may act as support/resistance levels.
 */
export interface FvgZone {
  /** Unique identifier: "{direction}-fvg-{time}" */
  id: string;
  /** Direction of the gap */
  direction: "bullish" | "bearish";
  /** Start time of the gap (candle[i-2].time) in Unix seconds */
  fromTime: number;
  /** End time of the gap (candle[i].time) in Unix seconds */
  toTime: number;
  /** Upper price boundary of the gap */
  top: number;
  /** Lower price boundary of the gap */
  bottom: number;
  /** Lifecycle status */
  status: "active" | "mitigated";
  /** Time when the zone was mitigated (Unix seconds), null if still active */
  mitigatedAt?: number;
  /**
   * True when a later candle's wick/body has entered the gap without fully
   * filling it (partial mitigation). Always false once status is "mitigated".
   */
  touched?: boolean;
  /** Time when the zone was first touched (Unix seconds), if applicable */
  touchedAt?: number;
}

