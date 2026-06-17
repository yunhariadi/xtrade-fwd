import type { Candle } from "@ict-forward-lab/core";
import {
  DEFAULT_AMD_CONFIG,
  type AmdConfig,
  type AmdResult,
  type Displacement,
  type ManipulatedSide,
  type PriceRange,
} from "./types";

/**
 * Classify the current AMD phase (Accumulation / Manipulation / Distribution).
 *
 * AMD is inherently relative to an accumulation range. Pass `range` (e.g. the
 * Asia session high/low) to anchor manipulation detection; if omitted, the
 * earlier half of the window is treated as the forming range and the later half
 * is scanned for a sweep of it.
 *
 * Pure and deterministic. Only feed closed candles — a sweep/reclaim is not
 * real until the candle that reclaims has closed (no-repaint rule).
 */
export function classifyAmdPhase(
  candles: Candle[],
  range?: PriceRange,
  config: Partial<AmdConfig> = {}
): AmdResult {
  const cfg: AmdConfig = { ...DEFAULT_AMD_CONFIG, ...config };
  const unknown: AmdResult = {
    phase: "unknown",
    manipulatedSide: null,
    sweptLevel: null,
    reclaim: false,
    displacement: "none",
    confidence: 0,
  };
  if (candles.length < 4) return unknown;

  const window = candles.slice(-cfg.lookback);
  const meanRange = mean(window.map((c) => c.high - c.low));
  if (meanRange <= 0) return unknown;

  // Split into a "range-forming" anchor and a "scan" segment unless an explicit
  // range was supplied.
  let anchorRange: PriceRange;
  let scan: Candle[];
  if (range) {
    anchorRange = range;
    scan = window;
  } else {
    const split = Math.max(1, Math.floor(window.length / 2));
    const forming = window.slice(0, split);
    anchorRange = {
      high: Math.max(...forming.map((c) => c.high)),
      low: Math.min(...forming.map((c) => c.low)),
    };
    scan = window.slice(split);
  }

  // --- Manipulation: sweep of a range edge that closes back inside. ---
  let manipulatedSide: ManipulatedSide = null;
  let sweptLevel: number | null = null;
  let reclaim = false;
  let sweepIndex = -1;
  for (let i = scan.length - 1; i >= 0; i--) {
    const c = scan[i];
    if (c.low < anchorRange.low && c.close >= anchorRange.low) {
      manipulatedSide = "sell_side";
      sweptLevel = anchorRange.low;
      reclaim = true;
      sweepIndex = i;
      break;
    }
    if (c.high > anchorRange.high && c.close <= anchorRange.high) {
      manipulatedSide = "buy_side";
      sweptLevel = anchorRange.high;
      reclaim = true;
      sweepIndex = i;
      break;
    }
  }

  // --- Displacement: largest-bodied candle relative to mean range. ---
  const displacement = detectDisplacement(window, meanRange, cfg.displacementAtrMultiple);

  // --- Accumulation: small bodies relative to range (indecision). ---
  const bodyRatio = mean(window.map((c) => Math.abs(c.close - c.open))) / meanRange;
  const isTight = bodyRatio <= cfg.accumulationBodyRatio;

  // After a sweep, an opposite-direction displacement = distribution leg.
  const distributionAfterSweep =
    manipulatedSide === "sell_side"
      ? displacement === "bullish"
      : manipulatedSide === "buy_side"
        ? displacement === "bearish"
        : false;

  if (manipulatedSide && distributionAfterSweep) {
    return {
      phase: "distribution",
      manipulatedSide,
      sweptLevel,
      reclaim,
      displacement,
      confidence: clamp(0.7 + 0.15 * (sweepIndex >= 0 ? 1 : 0), 0, 1),
    };
  }
  if (manipulatedSide) {
    return {
      phase: "manipulation",
      manipulatedSide,
      sweptLevel,
      reclaim,
      displacement,
      confidence: 0.6,
    };
  }
  if (isTight && displacement === "none") {
    return {
      phase: "accumulation",
      manipulatedSide: null,
      sweptLevel: null,
      reclaim: false,
      displacement: "none",
      confidence: clamp(0.5 + (cfg.accumulationBodyRatio - bodyRatio), 0, 1),
    };
  }
  if (displacement !== "none") {
    return {
      phase: "distribution",
      manipulatedSide: null,
      sweptLevel: null,
      reclaim: false,
      displacement,
      confidence: 0.5,
    };
  }
  return unknown;
}

function detectDisplacement(
  window: Candle[],
  meanRange: number,
  multiple: number
): Displacement {
  let best: Candle | null = null;
  let bestBody = 0;
  for (const c of window) {
    const body = Math.abs(c.close - c.open);
    if (body > bestBody) {
      bestBody = body;
      best = c;
    }
  }
  if (!best || bestBody < meanRange * multiple) return "none";
  return best.close >= best.open ? "bullish" : "bearish";
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
