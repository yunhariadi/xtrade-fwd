import type { Candle } from "@ict-forward-lab/core";
import { classifyAmdPhase } from "../amd";
import type {
  RangeExpansion,
  ReferenceRange,
  SessionPhase,
  SessionProfileResult,
  SessionProfileType,
} from "./types";

/**
 * Classify the current session's behaviour relative to a prior reference range
 * (typically the Asia range for London/NY).
 *
 * Composes the AMD engine for the phase/sweep read, then layers session-specific
 * profile classification (Judas swing, sweep-reclaim-expand, continuation, …).
 * Feed the closed candles of the current session.
 */
export function buildSessionProfile(
  sessionName: string,
  sessionCandles: Candle[],
  reference: ReferenceRange
): SessionProfileResult | null {
  if (sessionCandles.length < 2) return null;

  const open = sessionCandles[0].open;
  const close = sessionCandles[sessionCandles.length - 1].close;
  const high = Math.max(...sessionCandles.map((c) => c.high));
  const low = Math.min(...sessionCandles.map((c) => c.low));
  const meanRange =
    sessionCandles.reduce((a, c) => a + (c.high - c.low), 0) / sessionCandles.length;

  const direction =
    close - open > meanRange * 0.5
      ? "bullish"
      : open - close > meanRange * 0.5
        ? "bearish"
        : "neutral";

  const amd = classifyAmdPhase(sessionCandles, {
    high: reference.high,
    low: reference.low,
  });
  const sessionPhase: SessionPhase = amd.phase;

  const brokeAbove = high > reference.high;
  const brokeBelow = low < reference.low;
  const rangeExpansion: RangeExpansion = brokeAbove && brokeBelow
    ? "expanded_both_sides"
    : brokeAbove
      ? "above_reference_range"
      : brokeBelow
        ? "below_reference_range"
        : "inside_reference_range";

  const sweptLiquidity =
    amd.manipulatedSide === "sell_side"
      ? reference.lowLabel
      : amd.manipulatedSide === "buy_side"
        ? reference.highLabel
        : null;

  // After sweeping a side, the draw flips to the opposite liquidity.
  const activeDraw =
    amd.manipulatedSide === "sell_side"
      ? reference.highLabel
      : amd.manipulatedSide === "buy_side"
        ? reference.lowLabel
        : direction === "bullish"
          ? reference.highLabel
          : direction === "bearish"
            ? reference.lowLabel
            : null;

  const profileType = deriveProfileType(amd.manipulatedSide, amd.phase, direction, rangeExpansion);
  const label = deriveLabel(sessionName, amd.manipulatedSide, direction, profileType);

  return {
    sessionName,
    sessionPhase,
    rangeExpansion,
    sweptLiquidity,
    activeDraw,
    profileType,
    direction,
    label,
    confidence: amd.confidence,
  };
}

function deriveProfileType(
  swept: "buy_side" | "sell_side" | null,
  phase: SessionPhase,
  direction: "bullish" | "bearish" | "neutral",
  expansion: RangeExpansion
): SessionProfileType {
  if (swept) {
    const reversedUp = swept === "sell_side" && direction === "bullish";
    const reversedDown = swept === "buy_side" && direction === "bearish";
    if ((reversedUp || reversedDown) && phase === "distribution") {
      return "sweep_reclaim_expand";
    }
    if (reversedUp || reversedDown) return "judas_swing";
    return "reversal";
  }
  if (expansion === "inside_reference_range") return "range";
  if (direction !== "neutral") return "continuation";
  return "unknown";
}

function deriveLabel(
  session: string,
  swept: "buy_side" | "sell_side" | null,
  direction: "bullish" | "bearish" | "neutral",
  profile: SessionProfileType
): string {
  if (profile === "range") return `${session} ranging inside reference range`;
  const sweepText = swept ? `${swept.replace("_", "-")} sweep` : "no sweep";
  const moveText =
    direction === "neutral" ? "no clear expansion" : `${direction} expansion`;
  return `${session} ${sweepText} then ${moveText}`;
}
