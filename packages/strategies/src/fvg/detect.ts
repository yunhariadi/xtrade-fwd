import type { Candle, FvgZone } from "@ict-forward-lab/core";
import { checkMitigation, checkTouched } from "./mitigation";

/**
 * Check if a bullish FVG exists at index i.
 * Bullish FVG: candle[i].low > candle[i-2].high (gap above previous high)
 */
export function isBullishFvg(candles: Candle[], i: number): boolean {
  if (i < 2) return false;
  return candles[i].low > candles[i - 2].high;
}

/**
 * Check if a bearish FVG exists at index i.
 * Bearish FVG: candle[i].high < candle[i-2].low (gap below previous low)
 */
export function isBearishFvg(candles: Candle[], i: number): boolean {
  if (i < 2) return false;
  return candles[i].high < candles[i - 2].low;
}

/**
 * Create a bullish FVG zone from candles at index i.
 * Returns null if no bullish FVG exists.
 */
export function createBullishFvgZone(candles: Candle[], i: number): FvgZone | null {
  if (!isBullishFvg(candles, i)) return null;

  return {
    id: `bullish-fvg-${candles[i].time}`,
    direction: "bullish",
    fromTime: candles[i - 2].time,
    toTime: candles[i].time,
    top: candles[i].low,
    bottom: candles[i - 2].high,
    status: "active",
    touched: false,
  };
}


/**
 * Create a bearish FVG zone from candles at index i.
 * Returns null if no bearish FVG exists.
 */
export function createBearishFvgZone(candles: Candle[], i: number): FvgZone | null {
  if (!isBearishFvg(candles, i)) return null;

  return {
    id: `bearish-fvg-${candles[i].time}`,
    direction: "bearish",
    fromTime: candles[i - 2].time,
    toTime: candles[i].time,
    top: candles[i - 2].low,
    bottom: candles[i].high,
    status: "active",
    touched: false,
  };
}


/**
 * Detect all FVGs in a candle array.
 * Returns array of FvgZone objects for all detected gaps.
 */
export function detectAllFvgs(candles: Candle[]): FvgZone[] {
  const zones: FvgZone[] = [];

  for (let i = 2; i < candles.length; i++) {
    const bullish = createBullishFvgZone(candles, i);
    if (bullish) zones.push(bullish);

    const bearish = createBearishFvgZone(candles, i);
    if (bearish) zones.push(bearish);
  }

  return zones;
}

/**
 * Detect all FVG zones in a closed-candle window and resolve each zone's
 * mitigation/touch state against the candles that followed it, in order.
 * Equivalent to feeding the window through the live FvgTracker: the returned
 * zones are what the tracker would hold after the last candle. Pure — use it
 * to reconstruct `fvgZones` at a historical moment (replay/calibration)
 * without look-ahead, as long as `candles` contains only bars closed at or
 * before that moment.
 */
export function buildFvgZones(candles: Candle[]): FvgZone[] {
  const zones = detectAllFvgs(candles);

  for (const zone of zones) {
    const zoneEndIndex = candles.findIndex((c) => c.time > zone.toTime);
    if (zoneEndIndex === -1) continue;

    for (let j = zoneEndIndex; j < candles.length; j++) {
      if (checkMitigation(zone, candles[j])) {
        zone.status = "mitigated";
        zone.mitigatedAt = candles[j].time;
        break;
      }
      if (!zone.touched && checkTouched(zone, candles[j])) {
        zone.touched = true;
        zone.touchedAt = candles[j].time;
      }
    }
  }

  return zones;
}
