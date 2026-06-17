import type { Candle, FvgZone } from "@ict-forward-lab/core";

/**
 * Check if a candle fully mitigates (fills) an FVG zone.
 * Mitigation requires the candle's wick or body to fully traverse the entire gap:
 * - Bullish FVG mitigated when candle.low <= zone.bottom (price filled the entire gap downward)
 * - Bearish FVG mitigated when candle.high >= zone.top (price filled the entire gap upward)
 */
export function checkMitigation(zone: FvgZone, candle: Candle): boolean {
  if (zone.direction === "bullish") {
    // Price must reach all the way down to or below the bottom of the gap
    return candle.low <= zone.bottom;
  }
  // Bearish: price must reach all the way up to or above the top of the gap
  return candle.high >= zone.top;
}

/**
 * Check if a candle partially touches (enters but does not fully fill) an FVG zone.
 * A touch means a wick or body has entered the gap without mitigating it:
 * - Bullish FVG touched when candle.low < zone.top (entered from above) but
 *   candle.low > zone.bottom (did not fully fill the gap).
 * - Bearish FVG touched when candle.high > zone.bottom (entered from below) but
 *   candle.high < zone.top (did not fully fill the gap).
 */
export function checkTouched(zone: FvgZone, candle: Candle): boolean {
  if (zone.direction === "bullish") {
    return candle.low < zone.top && candle.low > zone.bottom;
  }
  return candle.high > zone.bottom && candle.high < zone.top;
}

