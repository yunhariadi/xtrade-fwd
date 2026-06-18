import type { Candle } from "@ict-forward-lab/core";
import {
  DEFAULT_VOLUME_PROFILE_CONFIG,
  type PriceLocation,
  type VolumeNode,
  type VolumeProfile,
  type VolumeProfileBias,
  type VolumeProfileConfig,
} from "./types";

/**
 * Build a candle-approximated volume profile over a window of candles.
 *
 * NOTE: This is an *approximation*. A true volume profile distributes each
 * trade's size at its exact execution price; we only have OHLCV candles, so we
 * spread each candle's volume uniformly across the price bins its high-low range
 * covers. This is the standard fallback when tick/aggTrade data is unavailable.
 * POC/VAH/VAL are therefore directional guides, not exact prices.
 *
 * `referencePrice` defaults to the last candle's close and is used only to
 * classify price location / bias; it does not affect the profile shape.
 */
export function buildVolumeProfile(
  candles: Candle[],
  referencePrice?: number,
  config: Partial<VolumeProfileConfig> = {}
): VolumeProfile | null {
  const cfg: VolumeProfileConfig = { ...DEFAULT_VOLUME_PROFILE_CONFIG, ...config };
  if (candles.length === 0 || cfg.tickSize <= 0) return null;

  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  if (!isFinite(lo) || !isFinite(hi) || hi < lo) return null;

  // Snap the bin grid to a multiple of tickSize so profiles over different
  // windows share aligned price levels (POC of one window lines up with another).
  const gridLo = Math.floor(lo / cfg.tickSize) * cfg.tickSize;
  const binCount = Math.max(1, Math.ceil((hi - gridLo) / cfg.tickSize) + 1);
  const bins = new Array<number>(binCount).fill(0);

  const binIndex = (price: number): number => {
    const idx = Math.floor((price - gridLo) / cfg.tickSize);
    return Math.min(binCount - 1, Math.max(0, idx));
  };

  for (const c of candles) {
    const startBin = binIndex(c.low);
    const endBin = binIndex(c.high);
    const span = endBin - startBin + 1;
    const share = c.volume / span;
    for (let b = startBin; b <= endBin; b++) bins[b] += share;
  }

  const binPrice = (idx: number): number => gridLo + (idx + 0.5) * cfg.tickSize;

  let totalVolume = 0;
  let pocBin = 0;
  for (let b = 0; b < binCount; b++) {
    totalVolume += bins[b];
    if (bins[b] > bins[pocBin]) pocBin = b;
  }
  if (totalVolume <= 0) return null;

  // Value area: grow outward from POC, each step taking the heavier neighbour,
  // until the captured volume reaches valueAreaPercent of the total.
  const target = totalVolume * cfg.valueAreaPercent;
  let lower = pocBin;
  let upper = pocBin;
  let captured = bins[pocBin];
  while (captured < target && (lower > 0 || upper < binCount - 1)) {
    const below = lower > 0 ? bins[lower - 1] : -1;
    const above = upper < binCount - 1 ? bins[upper + 1] : -1;
    if (above >= below) {
      upper += 1;
      captured += bins[upper];
    } else {
      lower -= 1;
      captured += bins[lower];
    }
  }

  const poc = binPrice(pocBin);
  const val = binPrice(lower);
  const vah = binPrice(upper);

  const meanVolume = totalVolume / binCount;
  const pocVolume = bins[pocBin];
  const hvn: VolumeNode[] = [];
  const lvn: VolumeNode[] = [];
  for (let b = 0; b < binCount; b++) {
    const v = bins[b];
    if (v >= meanVolume * cfg.hvnThreshold) {
      hvn.push({ price: binPrice(b), volume: v });
    } else if (
      v > 0 &&
      v <= pocVolume * cfg.lvnThreshold &&
      isLocalTrough(bins, b)
    ) {
      lvn.push({ price: binPrice(b), volume: v });
    }
  }
  hvn.sort((a, b) => b.volume - a.volume);
  lvn.sort((a, b) => a.price - b.price);

  const ref = referencePrice ?? candles[candles.length - 1].close;
  const priceLocation = classifyLocation(ref, poc, vah, val);
  const bias = biasFromLocation(priceLocation);

  return {
    binCount,
    tickSize: cfg.tickSize,
    poc,
    vah,
    val,
    totalVolume,
    hvn,
    lvn,
    priceLocation,
    bias,
  };
}

/** A bin is a trough if it is no larger than both immediate neighbours. */
function isLocalTrough(bins: number[], b: number): boolean {
  const left = b > 0 ? bins[b - 1] : Infinity;
  const right = b < bins.length - 1 ? bins[b + 1] : Infinity;
  return bins[b] <= left && bins[b] <= right;
}

function classifyLocation(
  price: number,
  poc: number,
  vah: number,
  val: number
): PriceLocation {
  if (price > vah) return "above_value";
  if (price < val) return "below_value";
  if (price > poc) return "upper_value";
  if (price < poc) return "lower_value";
  return "inside_value";
}

function biasFromLocation(loc: PriceLocation): VolumeProfileBias {
  switch (loc) {
    case "above_value":
      return "bullish";
    case "upper_value":
      return "mild_bullish";
    case "lower_value":
      return "mild_bearish";
    case "below_value":
      return "bearish";
    default:
      return "neutral";
  }
}
