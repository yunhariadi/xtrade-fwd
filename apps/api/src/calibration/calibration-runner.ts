import type { Pool } from "pg";
import type { Candle } from "@ict-forward-lab/core";
import { dbRowToCandle } from "@ict-forward-lab/core";
import {
  assembleDecisionPacket,
  buildCalibrationReport,
  buildFvgRetraceSetup,
  buildFvgZones,
  evaluateOutcome,
  getKillzone,
  type CalibrationSample,
  type DecisionPacket,
  type ScoreSignals,
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
 * Setup model: the packet's layered bias picks the direction and the
 * FVG-retracement model picks the execution (limit at a fresh gap edge, stop
 * beyond the displacement leg, target at nearest ERL). This trades at a
 * realistic cadence — unlike the strict A-Model (a handful of fires per year)
 * or the old market-entry-every-bar fallback — and each gap is sampled once,
 * matching the live engine's per-zone de-duplication.
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
    // One sample per gap: consecutive bars would otherwise re-emit the same
    // untouched zone as near-identical (correlated) samples.
    const sampledZoneIds = new Set<string>();

    for (let i = 0; i < candles5m.length; i++) {
      const candle = candles5m[i];
      const t = candle.time;

      if (config.killzonesOnly) {
        const kz = getKillzone(t);
        if (!kz || !SETUP_KILLZONES.has(kz.name)) continue;
      }

      const ctx4h = candles4h.filter((c) => c.time <= t);
      if (ctx4h.length < WARMUP_4H_CANDLES) continue;

      const ctx5m = candles5m.slice(0, i + 1).slice(-300);
      // Reconstruct the 5m FVG zones the live tracker would hold at bar i
      // (same window the packet sees) so IRL targets, active-FVG selection,
      // and the fvg-dependent score signals fire in calibration as in live.
      const fvgZones = buildFvgZones(ctx5m);

      const packet = assembleDecisionPacket({
        symbol: config.symbol,
        candles5m: ctx5m,
        candles15m: candles15m.filter((c) => c.time <= t).slice(-300),
        candles1h: candles1h.filter((c) => c.time <= t).slice(-200),
        candles4h: ctx4h.slice(-200),
        fvgZones,
      });

      // Direction: packet layered bias by default; "counterHtf" trades
      // against the 4h bias instead (see CalibrationConfig.directionMode).
      // Note for lift interpretation in counterHtf mode: the recorded
      // signals/score still describe the packet's own intended direction,
      // while the outcome describes the counter-trade — read the headline
      // WR/avgR, not per-signal lift.
      let direction: "long" | "short";
      if (config.directionMode === "counterHtf") {
        const fourH = packet.bias.fourH;
        if (fourH === "bullish") direction = "short";
        else if (fourH === "bearish") direction = "long";
        else continue;
      } else {
        const packetDirection = packet.risk.direction;
        if (packetDirection === "none") continue;
        direction = packetDirection;
      }

      const setup = buildFvgRetraceSetup({
        direction,
        candles5m: ctx5m,
        fvgZones,
        erlTargets: packet.liquidity.targets
          .filter((tgt) => tgt.category === "ERL")
          .map((tgt) => tgt.price),
      });
      if (!setup) continue;
      if (setup.riskReward < config.minRiskReward) continue;
      if (sampledZoneIds.has(setup.fvgZone.id)) continue;
      sampledZoneIds.add(setup.fvgZone.id);

      const future = candles5m.slice(i + 1);
      const outcome = evaluateOutcome(
        {
          direction,
          entry: setup.entry,
          stopLoss: setup.stopLoss,
          takeProfit: setup.takeProfit,
          time: packet.timestamp,
        },
        future,
        { horizonCandles: config.horizonCandles }
      );

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

/** Reconstruct boolean signals from the packet's score breakdown (fired = present). */
function breakdownToSignals(packet: DecisionPacket): ScoreSignals {
  const signals: ScoreSignals = {};
  for (const key of Object.keys(packet.score.breakdown) as (keyof ScoreSignals)[]) {
    signals[key] = true;
  }
  return signals;
}
