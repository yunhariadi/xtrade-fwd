import type { Candle } from "@ict-forward-lab/core";
import { detectSwingPoints } from "../utils/swing-points";

export interface OrderBlock {
  id: string;
  direction: "bullish" | "bearish";
  top: number;          // upper boundary
  bottom: number;       // lower boundary
  time: number;         // candle time of the OB
  fromTime: number;     // for rendering
  status: "active" | "breaker" | "broken";
  breakTime?: number;   // when it became a breaker
  /** True once price has traded back into the OB zone (mitigation tap). */
  mitigated: boolean;
  /** Candle time (Unix seconds) of the first tap into the zone, if any. */
  mitigatedAt?: number;
  useBody: boolean;     // whether boundaries use body or wick
}

/**
 * Detect Order Blocks from candle data.
 *
 * Bullish OB: The last bearish candle before price breaks above a swing high.
 * Bearish OB: The last bullish candle before price breaks below a swing low.
 *
 * Breaker: When price closes through the OB in the opposite direction.
 */
export function detectOrderBlocks(
  candles: Candle[],
  swingLookback: number = 10,
  useBody: boolean = true
): OrderBlock[] {
  if (candles.length < swingLookback + 2) return [];

  const obs: OrderBlock[] = [];
  const swings = detectSwingPoints(candles, Math.floor(swingLookback / 2), Math.floor(swingLookback / 2));

  const swingHighs = swings.filter(s => s.type === "high");
  const swingLows = swings.filter(s => s.type === "low");

  // Detect bullish OBs: look for breaks above swing highs
  for (const sh of swingHighs) {
    // Find the first candle that closes above this swing high
    for (let i = sh.index + 1; i < candles.length; i++) {
      if (candles[i].close > sh.price) {
        // Found break — look back for the last bearish candle before the break
        for (let j = i - 1; j >= Math.max(0, sh.index - 1); j--) {
          if (candles[j].close < candles[j].open) {
            // This is the bullish OB (last bearish candle before the bullish move)
            const top = useBody ? candles[j].open : candles[j].high;
            const bottom = useBody ? candles[j].close : candles[j].low;
            obs.push({
              id: `bullish-ob-${candles[j].time}`,
              direction: "bullish",
              top,
              bottom,
              time: candles[j].time,
              fromTime: candles[j].time,
              status: "active",
              mitigated: false,
              useBody,
            });
            break;
          }
        }
        break;
      }
    }
  }

  // Detect bearish OBs: look for breaks below swing lows
  for (const sl of swingLows) {
    for (let i = sl.index + 1; i < candles.length; i++) {
      if (candles[i].close < sl.price) {
        // Found break — look back for the last bullish candle before the bearish move
        for (let j = i - 1; j >= Math.max(0, sl.index - 1); j--) {
          if (candles[j].close > candles[j].open) {
            const top = useBody ? candles[j].close : candles[j].high;
            const bottom = useBody ? candles[j].open : candles[j].low;
            obs.push({
              id: `bearish-ob-${candles[j].time}`,
              direction: "bearish",
              top,
              bottom,
              time: candles[j].time,
              fromTime: candles[j].time,
              status: "active",
              mitigated: false,
              useBody,
            });
            break;
          }
        }
        break;
      }
    }
  }

  // Check for breakers: OB that price closes through
  for (const ob of obs) {
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].time <= ob.time) continue;
      if (ob.direction === "bullish" && candles[i].close < ob.bottom) {
        ob.status = "breaker";
        ob.breakTime = candles[i].time;
        break;
      }
      if (ob.direction === "bearish" && candles[i].close > ob.top) {
        ob.status = "breaker";
        ob.breakTime = candles[i].time;
        break;
      }
    }
  }

  // Mitigation: the first candle after creation whose range taps into the zone
  // (price returned to the OB) — distinct from a breaker, which closes through.
  for (const ob of obs) {
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].time <= ob.time) continue;
      if (candles[i].high >= ob.bottom && candles[i].low <= ob.top) {
        ob.mitigated = true;
        ob.mitigatedAt = candles[i].time;
        break;
      }
    }
  }

  return obs;
}
