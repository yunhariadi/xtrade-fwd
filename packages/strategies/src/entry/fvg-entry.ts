import type { Candle, FvgZone } from "@ict-forward-lab/core";
import type { FvgEntryResult, LiquiditySweepResult } from "../ict-model-2022/types";
import { isBullishFvg, isBearishFvg, createBullishFvgZone, createBearishFvgZone } from "../fvg/detect";

/**
 * Find FVG entry on 5m after confirmed MSS.
 * Bullish: entry at FVG top edge, SL below swept low, TP at 2:1 RR.
 * Bearish: entry at FVG bottom edge, SL above swept high, TP at 2:1 RR.
 *
 * Sequence ordering (ICT A-Model): the FVG must form AFTER the MSS that
 * confirmed the setup. Pass `mssTime` (Unix seconds of the MSS break candle)
 * to enforce this — FVGs that completed before the MSS are ignored.
 *
 * Mitigation guard: a returned FVG must still be reachable as a limit entry,
 * i.e. price must not have already traded through the entry edge after the gap
 * formed. Already-mitigated zones are skipped so the engine never places a
 * pending order at a level price has already passed.
 */
export function detectFvgEntry(
  candles5m: Candle[],
  direction: "bullish" | "bearish",
  sweepResult: LiquiditySweepResult,
  mssTime?: number
): FvgEntryResult | null {
  if (candles5m.length < 3) return null;

  // Find the most recent FVG matching the direction (scan from end)
  for (let i = candles5m.length - 1; i >= 2; i--) {
    let zone: FvgZone | null = null;

    if (direction === "bullish") {
      zone = createBullishFvgZone(candles5m, i);
    } else {
      zone = createBearishFvgZone(candles5m, i);
    }

    if (!zone) continue;

    // Sequence ordering: the FVG must complete at or after the MSS break.
    if (mssTime !== undefined && zone.toTime < mssTime) continue;

    // Calculate entry, SL, TP
    let entry: number;
    let stopLoss: number;
    let takeProfit: number;

    if (direction === "bullish") {
      entry = zone.top; // Entry at top edge of bullish FVG (price retraces down to it)
      stopLoss = sweepResult.sweptLevel; // SL below the swept swing low
      const risk = entry - stopLoss;
      if (risk <= 0) continue; // Invalid — SL above entry
      takeProfit = entry + risk * 2; // 2:1 RR
    } else {
      entry = zone.bottom; // Entry at bottom edge of bearish FVG (price retraces up to it)
      stopLoss = sweepResult.sweptLevel; // SL above the swept swing high
      const risk = stopLoss - entry;
      if (risk <= 0) continue; // Invalid — SL below entry
      takeProfit = entry - risk * 2; // 2:1 RR
    }

    // Mitigation guard: if any candle AFTER the gap already traded into the
    // entry edge, the level has been consumed — skip it.
    let mitigated = false;
    for (let j = i + 1; j < candles5m.length; j++) {
      if (direction === "bullish" && candles5m[j].low <= entry) {
        mitigated = true;
        break;
      }
      if (direction === "bearish" && candles5m[j].high >= entry) {
        mitigated = true;
        break;
      }
    }
    if (mitigated) continue;

    return {
      direction,
      entry,
      stopLoss,
      takeProfit,
      riskReward: 2.0,
      fvgZone: zone,
      time: candles5m[i].time,
    };
  }

  return null;
}
