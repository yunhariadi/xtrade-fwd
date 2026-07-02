import type { Candle, FvgZone } from "@ict-forward-lab/core";

/**
 * A tradeable FVG-retracement setup: a limit order at the edge of a fresh
 * (active, untouched) fair value gap, protected beyond the displacement leg
 * that created it, targeting external liquidity.
 */
export interface FvgRetraceSetup {
  direction: "long" | "short";
  /** Limit entry at the gap edge (bullish: zone top, bearish: zone bottom). */
  entry: number;
  /** Beyond the extreme of the displacement leg that formed the gap. */
  stopLoss: number;
  /** Nearest ERL beyond entry, or a 2R projection when none is supplied. */
  takeProfit: number;
  riskReward: number;
  fvgZone: FvgZone;
  /** Time of the last candle the setup was derived from (Unix seconds). */
  time: number;
}

export interface FvgRetraceParams {
  direction: "long" | "short";
  /** Closed candles of the execution timeframe, oldest → newest. */
  candles5m: Candle[];
  /** Tracked/reconstructed zones for the same window (see buildFvgZones). */
  fvgZones: FvgZone[];
  /** ERL prices to target; the nearest one beyond entry is used. */
  erlTargets?: number[];
  /** Max zone age in candles from gap completion to now. Default 36 (~3h of 5m). */
  maxZoneAgeCandles?: number;
  /** Candles before gap completion scanned for the protective stop. Default 12. */
  stopLookbackCandles?: number;
}

const DEFAULT_MAX_ZONE_AGE = 36;
const DEFAULT_STOP_LOOKBACK = 12;

/**
 * Derive an FVG-retracement setup in a given direction — the "realistic
 * cadence" alternative to the strict ICT A-Model (which demands the full
 * sweep → MSS → FVG sequence and fires only a handful of times per year).
 *
 * The caller decides the direction (e.g. the decision packet's layered bias);
 * this function decides the execution: the most recent gap in that direction
 * that is still active AND untouched (price has not yet entered it — the limit
 * at its edge is genuinely fresh), young enough to matter, with the stop
 * placed beyond the displacement leg's origin rather than at the gap edge.
 *
 * Pure and deterministic. Feed closed candles only. Returns null when no
 * qualifying zone exists — callers should treat that as "no trade", not an
 * error.
 */
export function buildFvgRetraceSetup(params: FvgRetraceParams): FvgRetraceSetup | null {
  const {
    direction,
    candles5m,
    fvgZones,
    erlTargets = [],
    maxZoneAgeCandles = DEFAULT_MAX_ZONE_AGE,
    stopLookbackCandles = DEFAULT_STOP_LOOKBACK,
  } = params;

  const last = candles5m[candles5m.length - 1];
  if (!last) return null;

  const want = direction === "long" ? "bullish" : "bearish";
  const isLong = direction === "long";

  // Freshest qualifying zone first.
  const candidates = fvgZones
    .filter((z) => z.direction === want && z.status === "active" && !z.touched)
    .sort((a, b) => b.toTime - a.toTime);

  for (const zone of candidates) {
    // Age is measured in bars of the supplied series, so it is robust to
    // exchange downtime gaps in wall-clock time.
    const zoneIdx = candles5m.findIndex((c) => c.time === zone.toTime);
    if (zoneIdx === -1) continue;
    if (candles5m.length - 1 - zoneIdx > maxZoneAgeCandles) continue;

    const entry = isLong ? zone.top : zone.bottom;

    // Stop beyond the origin of the displacement leg that created the gap.
    const from = Math.max(0, zoneIdx - stopLookbackCandles);
    const legWindow = candles5m.slice(from, zoneIdx + 1);
    const stopLoss = isLong
      ? Math.min(...legWindow.map((c) => c.low))
      : Math.max(...legWindow.map((c) => c.high));

    const risk = isLong ? entry - stopLoss : stopLoss - entry;
    if (risk <= 0) continue;

    // Nearest external liquidity beyond entry; 2R projection when none given.
    const pool = erlTargets
      .filter((p) => (isLong ? p > entry : p < entry))
      .sort((a, b) => (isLong ? a - b : b - a));
    const takeProfit = pool[0] ?? (isLong ? entry + risk * 2 : entry - risk * 2);

    const riskReward = Math.abs(takeProfit - entry) / risk;

    return {
      direction,
      entry,
      stopLoss,
      takeProfit,
      riskReward,
      fvgZone: zone,
      time: last.time,
    };
  }

  return null;
}
