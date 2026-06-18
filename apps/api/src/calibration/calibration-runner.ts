import type { Pool } from "pg";
import type { Candle } from "@ict-forward-lab/core";
import { dbRowToCandle } from "@ict-forward-lab/core";
import {
  assembleDecisionPacket,
  buildCalibrationReport,
  evaluateOutcome,
  getKillzone,
  type CalibrationSample,
  type DecisionPacket,
  type ScoreSignals,
  type SetupForOutcome,
} from "@ict-forward-lab/strategies";
import { HistoricalFetcher } from "../backtest/historical-fetcher";
import { getExchange } from "../market-data/market-source";
import type { CalibrationConfig, CalibrationRunResult } from "./types";

/** Killzones where ICT setups form; calibration samples only these by default. */
const SETUP_KILLZONES = new Set(["London Open", "New York"]);

/** Require this much 4h history before sampling so weekly context is populated. */
const WARMUP_4H_CANDLES = 60; // ~10 days

/**
 * Replays a historical window, assembles a decision packet at each setup-killzone
 * 5m close, derives a tradeable setup from the packet, and measures its outcome
 * against the following candles. The resulting (score, signals, outcome) samples
 * feed buildCalibrationReport — so you can see whether higher scores actually win
 * and which signals carry predictive lift.
 *
 * Mirrors BacktestRunner's at-time context construction to avoid look-ahead: at
 * bar i, only candles closed at or before bar i feed the packet; only candles
 * after bar i resolve its outcome.
 */
export class CalibrationRunner {
  constructor(private pool: Pool) {}

  async run(config: CalibrationConfig): Promise<CalibrationRunResult> {
    const startMs = new Date(config.startDate).getTime();
    const endMs = new Date(config.endDate).getTime();

    const fetcher = new HistoricalFetcher(this.pool);
    await fetcher.fetchRange({
      symbol: config.symbol,
      timeframes: ["5m", "15m", "1h", "4h"],
      startTime: startMs,
      endTime: endMs,
    });

    const [candles5m, candles15m, candles1h, candles4h] = await Promise.all([
      this.loadCandles(config.symbol, "5m", startMs, endMs),
      this.loadCandles(config.symbol, "15m", startMs, endMs),
      this.loadCandles(config.symbol, "1h", startMs, endMs),
      this.loadCandles(config.symbol, "4h", startMs, endMs),
    ]);

    const samples: CalibrationSample[] = [];

    for (let i = 0; i < candles5m.length; i++) {
      const candle = candles5m[i];
      const t = candle.time;

      if (config.killzonesOnly) {
        const kz = getKillzone(t);
        if (!kz || !SETUP_KILLZONES.has(kz.name)) continue;
      }

      const ctx4h = candles4h.filter((c) => c.time <= t);
      if (ctx4h.length < WARMUP_4H_CANDLES) continue;

      const packet = assembleDecisionPacket({
        symbol: config.symbol,
        candles5m: candles5m.slice(0, i + 1).slice(-300),
        candles15m: candles15m.filter((c) => c.time <= t).slice(-300),
        candles1h: candles1h.filter((c) => c.time <= t).slice(-200),
        candles4h: ctx4h.slice(-200),
      });

      const setup = deriveCalibrationSetup(packet, candle.close, config.minRiskReward);
      if (!setup) continue;

      const future = candles5m.slice(i + 1);
      const outcome = evaluateOutcome(setup, future, {
        horizonCandles: config.horizonCandles,
      });

      samples.push({
        score: packet.score.total,
        signals: breakdownToSignals(packet),
        outcome: outcome.outcome,
        rMultiple: outcome.rMultiple,
      });
    }

    return {
      symbol: config.symbol,
      startTime: startMs,
      endTime: endMs,
      config,
      sampleCount: samples.length,
      report: buildCalibrationReport(samples),
      createdAt: Date.now(),
    };
  }

  private async loadCandles(
    symbol: string,
    timeframe: string,
    startMs: number,
    endMs: number
  ): Promise<Candle[]> {
    const result = await this.pool.query(
      `SELECT * FROM candles WHERE exchange = $5 AND symbol = $1 AND timeframe = $2
       AND open_time >= $3 AND open_time <= $4 AND is_closed = true
       ORDER BY open_time ASC`,
      [symbol, timeframe, new Date(startMs).toISOString(), new Date(endMs).toISOString(), getExchange()]
    );
    return result.rows.map(dbRowToCandle);
  }
}

/**
 * Turn a packet into a measurable setup. Prefers the strict ICT model's
 * entry/stop/target; otherwise falls back to a market entry at `lastClose` with
 * the stop at the packet's invalidation (swept level / structure) and the target
 * at the nearest external liquidity. Returns null when no clean, RR-valid setup
 * can be formed.
 */
function deriveCalibrationSetup(
  packet: DecisionPacket,
  lastClose: number,
  minRiskReward: number
): SetupForOutcome | null {
  const direction = packet.risk.direction;
  if (direction === "none") return null;
  const isLong = direction === "long";

  const entry = packet.risk.preferredEntry ?? lastClose;
  const stopLoss = packet.risk.invalidation ?? inferStop(packet, isLong);
  const takeProfit =
    packet.risk.target1 ?? nearestErlPrice(packet, isLong, entry);
  if (stopLoss == null || takeProfit == null) return null;

  // Levels must sit on the correct side of entry.
  if (isLong && !(stopLoss < entry && takeProfit > entry)) return null;
  if (!isLong && !(stopLoss > entry && takeProfit < entry)) return null;

  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;
  const rr = Math.abs(takeProfit - entry) / risk;
  if (rr < minRiskReward) return null;

  return { direction, entry, stopLoss, takeProfit, time: packet.timestamp };
}

/** Stop from the swept level or last structure break, whichever sits on the stop side. */
function inferStop(packet: DecisionPacket, isLong: boolean): number | null {
  const candidates: number[] = [];
  if (packet.amd.sweptLevel != null) candidates.push(packet.amd.sweptLevel);
  if (packet.structure.last15m) candidates.push(packet.structure.last15m.breakLevel);
  const ref = packet.risk.preferredEntry ?? packet.risk.target1;
  const pivot = ref ?? packet.amd.sweptLevel ?? null;
  if (pivot == null) return candidates[0] ?? null;
  const onSide = candidates.filter((p) => (isLong ? p < pivot : p > pivot));
  if (onSide.length === 0) return null;
  // Nearest protective level to the pivot.
  return isLong ? Math.max(...onSide) : Math.min(...onSide);
}

function nearestErlPrice(
  packet: DecisionPacket,
  isLong: boolean,
  entry: number
): number | null {
  const erl = packet.liquidity.targets.filter((tgt) => tgt.category === "ERL");
  const pool = isLong
    ? erl.filter((tgt) => tgt.price > entry).sort((a, b) => a.price - b.price)
    : erl.filter((tgt) => tgt.price < entry).sort((a, b) => b.price - a.price);
  return pool[0]?.price ?? null;
}

/** Reconstruct boolean signals from the packet's score breakdown (fired = present). */
function breakdownToSignals(packet: DecisionPacket): ScoreSignals {
  const signals: ScoreSignals = {};
  for (const key of Object.keys(packet.score.breakdown) as (keyof ScoreSignals)[]) {
    signals[key] = true;
  }
  return signals;
}
