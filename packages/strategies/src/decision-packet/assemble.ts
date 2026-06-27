import type { Candle, FvgZone } from "@ict-forward-lab/core";
import { classifyAmdPhase, type AmdResult } from "../amd";
import { detect4HBias } from "../bias";
import { ictModel2022Strategy } from "../ict-model-2022";
import type { BiasDirection, StrategyContext } from "../ict-model-2022/types";
import { classifyDraw, type IrlErlResult, type LiquidityTarget } from "../irl-erl";
import { detectMSS, detectStructureBreaks } from "../mss-choch";
import { buildNarrative } from "../narrative";
import { scoreSetup, type ScoreSignals } from "../scoring";
import { buildSessionProfile, type SessionProfileResult } from "../session-profile";
import { buildVolumeProfile, type VolumeProfile } from "../volume-profile";
import { buildWeeklyProfile, type WeeklyProfileResult } from "../weekly-profile";
import {
  asiaRange,
  currentDay,
  currentSession,
  currentWeek,
  previousDay,
  previousWeek,
  rangeOf,
} from "./segmentation";
import type {
  DecisionPacket,
  DecisionPacketInput,
  LayeredBias,
  PacketRisk,
  StructureBreakSummary,
} from "./types";

/**
 * Fuse every ICT engine into one compact decision packet for an AI agent.
 *
 * This is the "data brain" centerpiece: the server does the quant; the agent
 * receives a small, high-signal JSON instead of raw candles. Pure and
 * deterministic given the candles. Feed CLOSED candles only — the packet must
 * never reflect an unconfirmed bar (no-repaint rule).
 */
export function assembleDecisionPacket(input: DecisionPacketInput): DecisionPacket {
  const { symbol, candles5m, candles15m, candles1h, candles4h } = input;
  const last5m = candles5m[candles5m.length - 1];
  const timestamp = input.now ?? last5m?.time ?? 0;

  // --- Sessions / ranges --------------------------------------------------
  const session = currentSession(candles5m);
  const asia = asiaRange(candles5m);
  const pdRange = rangeOf(previousDay(candles5m));
  const pwRange = rangeOf(previousWeek(candles4h));
  const cwRange = rangeOf(currentWeek(candles5m));

  // --- Weekly profile -----------------------------------------------------
  const weeklyProfile = buildWeeklyProfile(
    currentWeek(candles4h),
    pwRange ?? undefined
  );

  // --- Session profile ----------------------------------------------------
  let sessionProfile: SessionProfileResult | null = null;
  if (session && asia) {
    sessionProfile = buildSessionProfile(session.name, session.candles, {
      high: asia.high,
      low: asia.low,
      highLabel: "asia_high",
      lowLabel: "asia_low",
    });
  }

  // --- AMD ----------------------------------------------------------------
  const amd: AmdResult = classifyAmdPhase(
    candles5m,
    asia ? { high: asia.high, low: asia.low } : undefined
  );

  // --- Volume profile -----------------------------------------------------
  const dailyVp = buildVolumeProfile(currentDay(candles5m), last5m?.close);
  const sessionVp = session
    ? buildVolumeProfile(session.candles, last5m?.close)
    : null;

  // --- Liquidity targets --------------------------------------------------
  const targets = buildTargets(input.fvgZones ?? [], {
    asia,
    pdRange,
    pwRange,
    cwRange,
    sessionPoc: sessionVp?.poc ?? dailyVp?.poc ?? null,
  });

  // --- IRL / ERL draw -----------------------------------------------------
  const irlErl: IrlErlResult = classifyDraw(candles5m, targets);

  // --- Structure ----------------------------------------------------------
  const breaks = detectStructureBreaks(candles15m, 5, 5);
  const lastBreak = breaks.length > 0 ? breaks[breaks.length - 1] : null;
  const mss = detectMSS(candles15m);
  // Real daily/weekly structure breaks when those candles are supplied; the
  // bias layer then reads actual D structure instead of a 1h proxy.
  const candles1d = input.candles1d ?? [];
  const candles1w = input.candles1w ?? [];
  const dailyBreak = lastBreakOf(candles1d);
  const weeklyBreak = lastBreakOf(candles1w);
  const dailyBias: BiasDirection =
    candles1d.length > 0 ? detect4HBias(candles1d) : detect4HBias(candles1h.slice(-30));

  // --- Bias (layered) -----------------------------------------------------
  const bias = buildLayeredBias({
    weekly: weeklyProfile,
    daily: dailyBias,
    fourH: detect4HBias(candles4h),
    structure15m: lastBreak ? lastBreak.direction : "neutral",
    session: sessionProfile,
    vp: dailyVp,
  });

  // --- Execution candidate (reuse the ICT A-Model for entry/SL/TP) --------
  const ctx: StrategyContext = {
    symbol,
    exchange: "binance",
    candles5m,
    candles15m,
    candles1h,
    candles4h,
  };
  const signal = ictModel2022Strategy(ctx);
  const intended: "long" | "short" | "none" =
    signal.side !== "none" ? signal.side : bias.final;

  const activeFvg = pickActiveFvg(input.fvgZones ?? [], intended);
  const risk = buildRisk(signal, intended, targets, last5m?.close ?? 0);

  // --- Score --------------------------------------------------------------
  const signals = buildScoreSignals({
    intended,
    fourHBias: detect4HBias(candles4h),
    weekly: weeklyProfile,
    sessionProfile,
    amd,
    irlErl,
    mssDirection: mss?.direction ?? null,
    activeFvg,
    dailyVp,
    risk,
    sessionLength: session?.candles.length ?? 0,
    lastClose: last5m?.close ?? 0,
  });
  const score = scoreSetup(signals);

  // --- Narrative ----------------------------------------------------------
  const narrative = buildNarrative({
    weekly: weeklyProfile,
    session: sessionProfile,
    amd,
    draw: irlErl,
    volumeProfile: dailyVp,
  });

  return {
    symbol,
    timestamp,
    inKillzone: session !== null,
    session: { name: session?.name ?? null, profile: sessionProfile },
    weeklyProfile,
    bias,
    amd,
    irlErl,
    structure: {
      last15m: lastBreak
        ? {
            type: lastBreak.type,
            direction: lastBreak.direction,
            breakLevel: lastBreak.breakLevel,
            time: lastBreak.time,
          }
        : null,
      daily: dailyBreak,
      weekly: weeklyBreak,
    },
    liquidity: { targets },
    fvg: activeFvg,
    volumeProfile: { session: sessionVp, daily: dailyVp },
    risk,
    narrative,
    score,
  };
}

/** Most recent structure break on a timeframe, summarised (null if none). */
function lastBreakOf(candles: Candle[]): StructureBreakSummary | null {
  if (candles.length === 0) return null;
  const breaks = detectStructureBreaks(candles, 5, 5);
  const last = breaks.length > 0 ? breaks[breaks.length - 1] : null;
  return last
    ? { type: last.type, direction: last.direction, breakLevel: last.breakLevel, time: last.time }
    : null;
}

interface TargetRanges {
  asia: { high: number; low: number } | null;
  pdRange: { high: number; low: number } | null;
  pwRange: { high: number; low: number } | null;
  cwRange: { high: number; low: number } | null;
  sessionPoc: number | null;
}

/**
 * Rank a liquidity target by its sub-type so an agent can prioritise draws:
 * weekly (4) > daily (3) > session (2) > internal/swing (1). Weekly/daily pools
 * are the strongest magnets; FVG/POC internal liquidity is the weakest.
 */
function significanceOf(type: string): number {
  if (type.startsWith("previous_week")) return 4;
  if (type.startsWith("previous_day")) return 3;
  if (type.startsWith("session")) return 2;
  return 1;
}

function buildTargets(fvgZones: FvgZone[], r: TargetRanges): LiquidityTarget[] {
  const targets: LiquidityTarget[] = [];
  const add = (t: Omit<LiquidityTarget, "significance">) =>
    targets.push({ ...t, significance: significanceOf(t.type) });

  // ERL — external reference liquidity.
  if (r.pdRange) {
    add({ category: "ERL", label: "PDH", type: "previous_day_high", price: r.pdRange.high });
    add({ category: "ERL", label: "PDL", type: "previous_day_low", price: r.pdRange.low });
  }
  if (r.pwRange) {
    add({ category: "ERL", label: "PWH", type: "previous_week_high", price: r.pwRange.high });
    add({ category: "ERL", label: "PWL", type: "previous_week_low", price: r.pwRange.low });
  }
  if (r.asia) {
    add({ category: "ERL", label: "Asia High", type: "session_high", price: r.asia.high });
    add({ category: "ERL", label: "Asia Low", type: "session_low", price: r.asia.low });
  }

  // IRL — internal range liquidity.
  for (const z of fvgZones) {
    if (z.status !== "active") continue;
    add({
      category: "IRL",
      label: `${z.direction} FVG`,
      type: "fvg",
      price: (z.top + z.bottom) / 2,
      low: z.bottom,
      high: z.top,
    });
  }
  if (r.sessionPoc != null) {
    add({ category: "IRL", label: "Session POC", type: "poc", price: r.sessionPoc });
  }

  return targets;
}

function pickActiveFvg(
  fvgZones: FvgZone[],
  intended: "long" | "short" | "none"
): FvgZone | null {
  const want = intended === "long" ? "bullish" : intended === "short" ? "bearish" : null;
  const active = fvgZones
    .filter((z) => z.status === "active" && (want === null || z.direction === want))
    .sort((a, b) => b.toTime - a.toTime);
  return active[0] ?? null;
}

interface BiasInputs {
  weekly: WeeklyProfileResult | null;
  daily: BiasDirection;
  fourH: BiasDirection;
  structure15m: BiasDirection;
  session: SessionProfileResult | null;
  vp: VolumeProfile | null;
}

function buildLayeredBias(b: BiasInputs): LayeredBias {
  const weekly: BiasDirection = b.weekly ? b.weekly.weeklyBias : "neutral";
  const sessionDir: BiasDirection = b.session
    ? b.session.direction === "neutral"
      ? "neutral"
      : b.session.direction
    : "neutral";
  const vpDir: BiasDirection = b.vp ? vpBiasToDirection(b.vp.bias) : "neutral";

  const layers: BiasDirection[] = [weekly, b.daily, b.fourH, b.structure15m, sessionDir, vpDir];
  const bull = layers.filter((d) => d === "bullish").length;
  const bear = layers.filter((d) => d === "bearish").length;

  let final: "long" | "short" | "none" = "none";
  if (bull > bear) final = "long";
  else if (bear > bull) final = "short";

  // Respect the weekly permission gate.
  if (b.weekly) {
    if (final === "long" && !b.weekly.permission.longAllowed) final = "none";
    if (final === "short" && !b.weekly.permission.shortAllowed) final = "none";
  }

  const winning = final === "long" ? bull : final === "short" ? bear : 0;
  const confidence = layers.length > 0 ? winning / layers.length : 0;

  return {
    weekly,
    daily: b.daily,
    fourH: b.fourH,
    structure15m: b.structure15m,
    session: sessionDir,
    volumeProfile: vpDir,
    final,
    confidence,
  };
}

function vpBiasToDirection(bias: VolumeProfile["bias"]): BiasDirection {
  if (bias === "bullish" || bias === "mild_bullish") return "bullish";
  if (bias === "bearish" || bias === "mild_bearish") return "bearish";
  return "neutral";
}

function buildRisk(
  signal: ReturnType<typeof ictModel2022Strategy>,
  intended: "long" | "short" | "none",
  targets: LiquidityTarget[],
  lastClose: number
): PacketRisk {
  if (signal.side !== "none" && signal.entry != null) {
    const erl = nearestErl(targets, signal.side, signal.entry);
    return {
      direction: signal.side,
      entryZone: signal.entry.toString(),
      preferredEntry: signal.entry,
      invalidation: signal.stopLoss ?? null,
      target1: signal.takeProfit ?? null,
      target2: erl?.price ?? null,
      rrToTarget1: signal.riskReward ?? null,
    };
  }
  return {
    direction: intended,
    entryZone: null,
    preferredEntry: null,
    invalidation: null,
    target1: intended !== "none" ? nearestErl(targets, intended, lastClose)?.price ?? null : null,
    target2: null,
    rrToTarget1: null,
  };
}

function nearestErl(
  targets: LiquidityTarget[],
  direction: "long" | "short",
  price: number
): LiquidityTarget | null {
  const erl = targets.filter((t) => t.category === "ERL");
  const pool =
    direction === "long"
      ? erl.filter((t) => t.price > price).sort((a, b) => a.price - b.price)
      : erl.filter((t) => t.price < price).sort((a, b) => b.price - a.price);
  return pool[0] ?? null;
}

interface ScoreInputs {
  intended: "long" | "short" | "none";
  fourHBias: BiasDirection;
  weekly: WeeklyProfileResult | null;
  sessionProfile: SessionProfileResult | null;
  amd: AmdResult;
  irlErl: IrlErlResult;
  mssDirection: "bullish" | "bearish" | null;
  activeFvg: FvgZone | null;
  dailyVp: VolumeProfile | null;
  risk: PacketRisk;
  sessionLength: number;
  lastClose: number;
}

function buildScoreSignals(s: ScoreInputs): ScoreSignals {
  const dir = s.intended;
  const wantBias: BiasDirection = dir === "long" ? "bullish" : dir === "short" ? "bearish" : "neutral";
  const vpDir = s.dailyVp ? vpBiasToDirection(s.dailyVp.bias) : "neutral";
  const sessionDir: BiasDirection = s.sessionProfile
    ? s.sessionProfile.direction === "neutral"
      ? "neutral"
      : s.sessionProfile.direction
    : "neutral";

  const erlTarget = nearestErl(buildErlOnly(s.irlErl), dir === "none" ? "long" : dir, s.lastClose);

  return {
    htfBiasAligned: dir !== "none" && s.fourHBias === wantBias,
    weeklyProfileSupports: dir !== "none" && s.weekly?.weeklyBias === wantBias,
    sessionProfileSupports: dir !== "none" && sessionDir === wantBias,
    amdPhaseClear: s.amd.phase !== "unknown",
    manipulationDetected: s.amd.manipulatedSide !== null,
    irlToErlClear: s.irlErl.currentDraw === "IRL_to_ERL" && s.irlErl.to !== null,
    mssConfirmed: dir !== "none" && s.mssDirection === wantBias,
    displacementPresent: s.amd.displacement !== "none",
    validFvg: s.activeFvg !== null || s.risk.preferredEntry !== null,
    fvgAlignsVolumeProfile: s.activeFvg !== null && dir !== "none" && vpDir === wantBias,
    priceWithPocDirection:
      s.dailyVp != null &&
      ((dir === "long" && s.lastClose > s.dailyVp.poc) ||
        (dir === "short" && s.lastClose < s.dailyVp.poc)),
    clearErlTarget: erlTarget !== null,
    rrAboveTwo: (s.risk.rrToTarget1 ?? 0) >= 2,

    againstWeeklyBias:
      dir !== "none" &&
      ((dir === "long" && s.weekly?.permission.longAllowed === false) ||
        (dir === "short" && s.weekly?.permission.shortAllowed === false)),
    noClearAmd: s.amd.phase === "unknown",
    irlErlUnclear: s.irlErl.currentDraw === "unclear",
    trappedInValueArea: s.dailyVp?.priceLocation === "inside_value",
    alreadyReachedErl:
      dir !== "none" &&
      s.irlErl.currentDraw === "IRL_to_ERL" &&
      s.irlErl.to !== null &&
      ((dir === "long" && s.lastClose >= s.irlErl.to.price) ||
        (dir === "short" && s.lastClose <= s.irlErl.to.price)),
    lateInSession: s.sessionLength > 30,
    volumeProfileOpposes: dir !== "none" && vpDir !== "neutral" && vpDir !== wantBias,
    noCleanInvalidation: s.risk.preferredEntry !== null && s.risk.invalidation == null,
  };
}

/** The IRL/ERL result only exposes a single `to`; rebuild an ERL pool from it. */
function buildErlOnly(irlErl: IrlErlResult): LiquidityTarget[] {
  return irlErl.to && irlErl.to.category === "ERL" ? [irlErl.to] : [];
}
