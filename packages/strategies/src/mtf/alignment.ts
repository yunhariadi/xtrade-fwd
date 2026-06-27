import type { Candle } from "@ict-forward-lab/core";
import type { BiasDirection } from "../ict-model-2022/types";
import { detect4HBias } from "../bias";
import { detectStructureBreaks } from "../mss-choch";

/** Per-timeframe candle context for the alignment scan. */
export interface MtfTimeframeInput {
  timeframe: string;
  candles: Candle[];
}

/** Resolved directional read for a single timeframe. */
export interface MtfTimeframeAlignment {
  timeframe: string;
  /** Swing-structure bias (HH/HL = bullish, LH/LL = bearish). */
  bias: BiasDirection;
  /** Direction of the most recent structure break (MSS/BOS), if any. */
  lastStructure: { type: string; direction: BiasDirection; breakLevel: number; time: number } | null;
  /** Whether this timeframe's bias agrees with the resolved `direction`. */
  aligned: boolean;
}

export interface MtfAlignmentResult {
  /** Unix seconds of the latest candle considered (0 if none). */
  timestamp: number;
  /** Resolved direction across timeframes: the side with more agreeing TFs. */
  direction: "long" | "short" | "none";
  /** 0..1 — fraction of timeframes whose bias matches `direction`. */
  confidence: number;
  /** True when every non-neutral timeframe points the same way. */
  fullyAligned: boolean;
  timeframes: MtfTimeframeAlignment[];
}

/**
 * Collapse multiple timeframes into a single alignment read in one shot, so an
 * agent doesn't have to call structure/bias per timeframe and reconcile them
 * itself. Pure and deterministic given closed candles. Each timeframe's bias is
 * derived from swing structure; `direction` is the majority side and
 * `confidence` the fraction of timeframes that agree.
 */
export function computeMtfAlignment(inputs: MtfTimeframeInput[]): MtfAlignmentResult {
  const perTf = inputs.map((tf): Omit<MtfTimeframeAlignment, "aligned"> & { bias: BiasDirection } => {
    const bias = detect4HBias(tf.candles);
    const breaks = detectStructureBreaks(tf.candles, 5, 5);
    const last = breaks.length > 0 ? breaks[breaks.length - 1] : null;
    return {
      timeframe: tf.timeframe,
      bias,
      lastStructure: last
        ? {
            type: last.type,
            direction: last.direction as BiasDirection,
            breakLevel: last.breakLevel,
            time: last.time,
          }
        : null,
    };
  });

  const bull = perTf.filter((t) => t.bias === "bullish").length;
  const bear = perTf.filter((t) => t.bias === "bearish").length;

  let direction: "long" | "short" | "none" = "none";
  if (bull > bear) direction = "long";
  else if (bear > bull) direction = "short";

  const want: BiasDirection = direction === "long" ? "bullish" : direction === "short" ? "bearish" : "neutral";
  const timeframes: MtfTimeframeAlignment[] = perTf.map((t) => ({
    ...t,
    aligned: direction !== "none" && t.bias === want,
  }));

  const agreeing = timeframes.filter((t) => t.aligned).length;
  const confidence = timeframes.length > 0 ? agreeing / timeframes.length : 0;
  const nonNeutral = perTf.filter((t) => t.bias !== "neutral").length;
  const fullyAligned = direction !== "none" && nonNeutral > 0 && agreeing === nonNeutral;

  const timestamp = inputs.reduce((max, tf) => {
    const last = tf.candles[tf.candles.length - 1];
    return last && last.time > max ? last.time : max;
  }, 0);

  return { timestamp, direction, confidence, fullyAligned, timeframes };
}
