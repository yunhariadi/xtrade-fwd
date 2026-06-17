import type { StrategyContext, StrategySignal, ChartDrawing } from "./types";
import { detect4HBias } from "../bias/detect";
import { detectLiquiditySweep } from "../liquidity/detect";
import { detectMSS } from "../mss-choch/detect";
import { detectFvgEntry } from "../entry/fvg-entry";

/**
 * ICT A-Model 2022 strategy.
 * Combines: 4H bias → 15m liquidity sweep → 15m MSS → 5m FVG entry.
 * Returns a StrategySignal. Pure function — no side effects.
 *
 * Sequence ordering is enforced: the sweep must precede the MSS, and the 5m
 * FVG entry must form at or after the MSS break. This keeps the signal faithful
 * to the ICT A-Model rather than firing on independently-detected events.
 */
export function ictModel2022Strategy(ctx: StrategyContext): StrategySignal {
  const noneSignal: StrategySignal = {
    side: "none",
    symbol: ctx.symbol,
    timeframe: "5m",
    signalTime: ctx.candles5m.length > 0 ? ctx.candles5m[ctx.candles5m.length - 1].time : 0,
    reasons: [],
    drawings: [],
  };

  // Step 1: Check 4H bias
  const bias = detect4HBias(ctx.candles4h);
  if (bias === "neutral") return noneSignal;

  // Step 2: Check 15m MSS (the structural anchor of the setup)
  const mss = detectMSS(ctx.candles15m);
  if (!mss) return noneSignal;

  // Validate MSS direction matches bias
  if (bias === "bullish" && mss.direction !== "bullish") return noneSignal;
  if (bias === "bearish" && mss.direction !== "bearish") return noneSignal;

  // Step 3: Find the 15m liquidity sweep that PRECEDED this MSS. Anchoring the
  // sweep to the MSS (rather than detecting both independently) keeps the pair
  // causally linked — the sweep is the stop-run that displaced into the break.
  const sweep = detectLiquiditySweep(ctx.candles15m, 20, mss.time);
  if (!sweep) return noneSignal;

  // Validate sweep direction matches bias
  if (bias === "bullish" && sweep.type !== "sell-side") return noneSignal;
  if (bias === "bearish" && sweep.type !== "buy-side") return noneSignal;

  // Step 4: Find 5m FVG entry (must form at or after the MSS break)
  const entry = detectFvgEntry(ctx.candles5m, mss.direction, sweep, mss.time);
  if (!entry) return noneSignal;

  // Build chart drawings
  const drawings: ChartDrawing[] = [
    {
      id: `fvg-${entry.fvgZone.id}`,
      type: "box",
      label: `${entry.direction} FVG`,
      fromTime: entry.fvgZone.fromTime,
      toTime: entry.fvgZone.toTime,
      top: entry.fvgZone.top,
      bottom: entry.fvgZone.bottom,
      direction: entry.direction,
    },
    {
      id: `sweep-${sweep.time}`,
      type: "marker",
      label: `${sweep.type} sweep`,
      price: sweep.sweptLevel,
      fromTime: sweep.time,
    },
    {
      id: `mss-${mss.time}`,
      type: "line",
      label: `${mss.direction} MSS`,
      price: mss.breakLevel,
      fromTime: mss.time,
    },
  ];

  // Build reasons
  const reasons: string[] = [
    `4H ${bias} bias`,
    `15m ${sweep.type} liquidity sweep at ${sweep.sweptLevel.toFixed(1)}`,
    `15m ${mss.direction} MSS at ${mss.breakLevel.toFixed(1)}`,
    `5m ${entry.direction} FVG entry at ${entry.entry.toFixed(1)}`,
  ];

  return {
    side: bias === "bullish" ? "long" : "short",
    symbol: ctx.symbol,
    timeframe: "5m",
    signalTime: ctx.candles5m[ctx.candles5m.length - 1].time,
    entry: entry.entry,
    stopLoss: entry.stopLoss,
    takeProfit: entry.takeProfit,
    riskReward: entry.riskReward,
    reasons,
    drawings,
    metadata: {
      bias,
      sweep: { type: sweep.type, level: sweep.sweptLevel },
      mss: { direction: mss.direction, level: mss.breakLevel },
      entry: { direction: entry.direction, fvgZoneId: entry.fvgZone.id },
    },
  };
}
