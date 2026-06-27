import type { Candle } from "@ict-forward-lab/core";
import { detectSwingPoints } from "../utils/swing-points";

/** A cluster of equal swing highs (EQH) or lows (EQL) — a resting-liquidity pool. */
export interface EqualLevel {
  type: "EQH" | "EQL";
  /** Representative (mean) price of the cluster. */
  price: number;
  /** Candle times (Unix seconds) of the swings forming the cluster. */
  times: number[];
}

export type PremiumDiscountZone =
  | "lower_discount"
  | "middle_discount"
  | "equilibrium"
  | "middle_premium"
  | "upper_premium";

export interface PremiumDiscountResult {
  /** The dealing range price is navigating, with its 50% equilibrium. */
  range: {
    high: number;
    low: number;
    /** Unix seconds of the swing forming each extreme (0 if from raw candles). */
    highTime: number;
    lowTime: number;
    equilibrium: number;
    size: number;
  };
  /** Standard ICT fib array across the dealing range. */
  fib: { "0": number; "0.25": number; "0.5": number; "0.75": number; "1": number };
  /** [equilibrium → high] — sell-side / premium array. */
  premiumZone: { from: number; to: number };
  /** [low → equilibrium] — buy-side / discount array. */
  discountZone: { from: number; to: number };
  /** Latest close used to locate price. */
  price: number;
  /** Coarse side of the range. */
  location: "premium" | "discount" | "equilibrium";
  /** Fine band, matching the weekly-profile convention. */
  zone: PremiumDiscountZone;
  /** Equal highs (buy-side liquidity above). */
  equalHighs: EqualLevel[];
  /** Equal lows (sell-side liquidity below). */
  equalLows: EqualLevel[];
}

export interface PremiumDiscountConfig {
  /** Pivot strength for swing detection. Default 5. */
  swingBars: number;
  /** Equal-level tolerance as a fraction of price. Default 0.001 (0.1%). */
  eqTolerance: number;
}

const DEFAULT_CONFIG: PremiumDiscountConfig = { swingBars: 5, eqTolerance: 0.001 };

/**
 * Compute the premium/discount array for a dealing range. The range is the
 * highest swing high to the lowest swing low over the supplied candles (falling
 * back to raw candle extremes if no swings form); equilibrium is its 50%.
 * Premium is above equilibrium, discount below. Also clusters equal highs/lows
 * into EQH/EQL liquidity pools. Pure and deterministic given closed candles.
 */
export function computePremiumDiscount(
  candles: Candle[],
  config: Partial<PremiumDiscountConfig> = {}
): PremiumDiscountResult | null {
  if (candles.length === 0) return null;
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const swings = detectSwingPoints(candles, cfg.swingBars, cfg.swingBars);
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");

  // Dealing range: extreme swing high to extreme swing low; fall back to candles.
  let high = -Infinity;
  let low = Infinity;
  let highTime = 0;
  let lowTime = 0;
  for (const s of highs) if (s.price > high) (high = s.price), (highTime = s.time);
  for (const s of lows) if (s.price < low) (low = s.price), (lowTime = s.time);
  if (!Number.isFinite(high)) {
    for (const c of candles) if (c.high > high) (high = c.high), (highTime = c.time);
  }
  if (!Number.isFinite(low)) {
    for (const c of candles) if (c.low < low) (low = c.low), (lowTime = c.time);
  }

  const size = high - low;
  const equilibrium = (high + low) / 2;
  const price = candles[candles.length - 1].close;

  const f = size > 0 ? (price - low) / size : 0.5;
  const zone = bandOf(f);
  const location: PremiumDiscountResult["location"] =
    zone === "equilibrium" ? "equilibrium" : f > 0.5 ? "premium" : "discount";

  return {
    range: { high, low, highTime, lowTime, equilibrium, size },
    fib: {
      "0": low,
      "0.25": low + size * 0.25,
      "0.5": equilibrium,
      "0.75": low + size * 0.75,
      "1": high,
    },
    premiumZone: { from: equilibrium, to: high },
    discountZone: { from: low, to: equilibrium },
    price,
    location,
    zone,
    equalHighs: clusterEqual(highs, "EQH", cfg.eqTolerance),
    equalLows: clusterEqual(lows, "EQL", cfg.eqTolerance),
  };
}

/** Fraction-of-range → band. Mirrors weekly-profile's positionInRange bands. */
function bandOf(f: number): PremiumDiscountZone {
  if (f < 0.25) return "lower_discount";
  if (f < 0.45) return "middle_discount";
  if (f <= 0.55) return "equilibrium";
  if (f <= 0.75) return "middle_premium";
  return "upper_premium";
}

/** Group swings whose prices sit within `tolerance` of each other into EQH/EQL. */
function clusterEqual(
  swings: { price: number; time: number }[],
  type: "EQH" | "EQL",
  tolerance: number
): EqualLevel[] {
  const sorted = [...swings].sort((a, b) => a.price - b.price);
  const clusters: EqualLevel[] = [];
  let bucket: { price: number; time: number }[] = [];

  const flush = () => {
    if (bucket.length >= 2) {
      const price = bucket.reduce((s, p) => s + p.price, 0) / bucket.length;
      clusters.push({ type, price, times: bucket.map((p) => p.time) });
    }
    bucket = [];
  };

  for (const s of sorted) {
    if (bucket.length === 0) {
      bucket.push(s);
      continue;
    }
    const ref = bucket[0].price;
    if (Math.abs(s.price - ref) <= ref * tolerance) bucket.push(s);
    else {
      flush();
      bucket.push(s);
    }
  }
  flush();
  return clusters;
}
