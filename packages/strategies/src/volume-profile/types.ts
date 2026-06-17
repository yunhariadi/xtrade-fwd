export type VolumeProfileBias =
  | "bullish"
  | "mild_bullish"
  | "neutral"
  | "mild_bearish"
  | "bearish";

/** Where the current price sits relative to the value area. */
export type PriceLocation =
  | "above_value"
  | "upper_value"
  | "inside_value"
  | "lower_value"
  | "below_value";

export interface VolumeNode {
  /** Price at the center of the bin. */
  price: number;
  /** Total volume accumulated in the bin. */
  volume: number;
}

export interface VolumeProfile {
  /** Number of price bins the volume was distributed across. */
  binCount: number;
  /** Tick size (price width) of each bin. */
  tickSize: number;
  /** Point of Control: price bin with the highest volume. */
  poc: number;
  /** Value Area High: top of the 70% (configurable) value area. */
  vah: number;
  /** Value Area Low: bottom of the value area. */
  val: number;
  /** Total volume across the profile window. */
  totalVolume: number;
  /** High Volume Nodes, sorted by volume descending. */
  hvn: VolumeNode[];
  /** Low Volume Nodes (relative troughs), sorted by price ascending. */
  lvn: VolumeNode[];
  /** Location of `referencePrice` (usually last close) relative to value. */
  priceLocation: PriceLocation;
  /** Coarse directional read derived from priceLocation. */
  bias: VolumeProfileBias;
}

export interface VolumeProfileConfig {
  /** Price width of each bin (quote units). Default 10. */
  tickSize: number;
  /** Fraction of total volume contained in the value area. Default 0.70. */
  valueAreaPercent: number;
  /** Volume multiple of mean for a bin to qualify as an HVN. Default 1.5. */
  hvnThreshold: number;
  /** Volume fraction of POC below which a bin is an LVN. Default 0.2. */
  lvnThreshold: number;
}

export const DEFAULT_VOLUME_PROFILE_CONFIG: VolumeProfileConfig = {
  tickSize: 10,
  valueAreaPercent: 0.7,
  hvnThreshold: 1.5,
  lvnThreshold: 0.2,
};
