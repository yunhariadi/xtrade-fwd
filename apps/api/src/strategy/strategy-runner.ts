import type { Pool } from "pg";
import type { Candle } from "@ict-forward-lab/core";
import { dbRowToCandle } from "@ict-forward-lab/core";
import {
  ictModel2022Strategy,
  detect4HBias,
  detectLiquiditySweep,
  detectMSS,
  detectFvgEntry,
  assembleDecisionPacket,
  getKillzone,
  computePremiumDiscount,
} from "@ict-forward-lab/strategies";
import type { StrategyContext, StrategySignal, BiasDirection, LiquiditySweepResult, MSSResult } from "@ict-forward-lab/strategies";
import type { SignalGateInfo } from "../forward-test/types";
import type { WsServer } from "../market-data/ws-server";
import { getExchange } from "../market-data/market-source";
import { SignalStore } from "./signal-store";

export interface LiquidityLevel {
  /** Stable id: `liquidity-{type}-{time}` — used to reference a level in alerts. */
  id: string;
  type: "buy-side" | "sell-side";
  price: number;
  time: number;
  swept: boolean;
  sweptAt?: number;
}

export interface StrategyStatus {
  bias: BiasDirection;
  sweep: { detected: boolean; type?: string; level?: number };
  mss: { detected: boolean; direction?: string; level?: number };
  fvgEntry: { detected: boolean; direction?: string; entry?: number };
  lastEvaluatedAt: number | null;
}

export interface StrategyRunnerOptions {
  pool: Pool;
  wsServer: WsServer;
  symbol: string;
}

export class StrategyRunner {
  private signalStore: SignalStore = new SignalStore();
  private lastStatus: StrategyStatus = {
    bias: "neutral",
    sweep: { detected: false },
    mss: { detected: false },
    fvgEntry: { detected: false },
    lastEvaluatedAt: null,
  };

  constructor(private options: StrategyRunnerOptions) {}

  /**
   * Called on each candle close. Only runs strategy on 5m candle closes.
   * Returns the generated signal if side is not "none", otherwise null.
   */
  async onCandleClosed(candle: Candle, symbol: string, timeframe: string): Promise<StrategySignal | null> {
    if (!candle.isClosed) return null;
    if (timeframe !== "5m") return null;
    if (symbol.toUpperCase() !== this.options.symbol.toUpperCase()) return null;

    try {
      const ctx = await this.buildContext(symbol);
      const signal = ictModel2022Strategy(ctx);

      // Update status checklist
      this.lastStatus = this.buildStatus(ctx, Date.now());


      if (signal.side !== "none") {
        // Attach the confluence gate snapshot (score / killzone / premium-
        // discount) computed from the SAME context the signal came from, so
        // the forward-test engine can gate trade creation without re-fetching.
        signal.metadata = {
          ...signal.metadata,
          gate: this.buildGateInfo(ctx, candle.time),
        };
        this.signalStore.add(signal);
        this.options.wsServer.broadcastSignal(signal);
        return signal;
      }
    } catch (err) {
      console.error(`Strategy evaluation error: ${(err as Error).message}`);
    }

    return null;
  }

  /**
   * Confluence snapshot for trade gating. Score comes from the full decision
   * packet; the premium/discount dealing range uses the 1h candles (the
   * README's designated premium/discount context timeframe).
   */
  private buildGateInfo(ctx: StrategyContext, signalTime: number): SignalGateInfo {
    const packet = assembleDecisionPacket({
      symbol: ctx.symbol,
      candles5m: ctx.candles5m,
      candles15m: ctx.candles15m,
      candles1h: ctx.candles1h,
      candles4h: ctx.candles4h,
    });
    const killzone = getKillzone(signalTime);
    const pd = computePremiumDiscount(ctx.candles1h);

    return {
      score: packet.score.total,
      grade: packet.score.grade,
      recommendation: packet.score.recommendation,
      killzone: killzone?.name ?? null,
      premiumDiscount: pd ? { location: pd.location, zone: pd.zone } : null,
    };
  }

  getSignalStore(): SignalStore {
    return this.signalStore;
  }

  getStatus(): StrategyStatus {
    return this.lastStatus;
  }

  getSymbol(): string {
    return this.options.symbol;
  }


  /**
   * Compute the confluence checklist as of a historical point in time. Used by
   * the chart's bar-replay so the checklist tracks the playback head instead of
   * the live market. Builds context from candles closed at or before `atTime`
   * and does not mutate the live `lastStatus`.
   *
   * @param atTime Unix seconds — the replay playback head.
   */
  async computeStatusAt(symbol: string, atTime: number): Promise<StrategyStatus> {
    const ctx = await this.buildContext(symbol, atTime);
    return this.buildStatus(ctx, atTime * 1000);
  }

  private buildStatus(ctx: StrategyContext, evaluatedAtMs: number): StrategyStatus {
    const bias = detect4HBias(ctx.candles4h);
    const mss = detectMSS(ctx.candles15m);
    // Anchor the sweep to the MSS exactly as the strategy does — the most recent
    // sweep that PRECEDED the break — so the checklist matches what would fire.
    const sweep = detectLiquiditySweep(ctx.candles15m, 20, mss?.time);

    // Mirror the real strategy's confluence gating so the checklist never lights
    // up an FVG entry the strategy itself would reject:
    //  - bias must be directional (not neutral) and match the MSS direction
    //  - sweep direction must align with bias
    //  - sweep precedes the MSS (enforced by the `beforeTime` anchor above), and
    //    the FVG must form at/after the MSS
    let fvgEntry = null;
    const biasMatchesMss =
      (bias === "bullish" && mss?.direction === "bullish") ||
      (bias === "bearish" && mss?.direction === "bearish");
    const sweepMatchesBias =
      (bias === "bullish" && sweep?.type === "sell-side") ||
      (bias === "bearish" && sweep?.type === "buy-side");

    if (sweep && mss && biasMatchesMss && sweepMatchesBias) {
      fvgEntry = detectFvgEntry(ctx.candles5m, mss.direction, sweep, mss.time);
    }

    return {
      bias,
      sweep: sweep
        ? { detected: true, type: sweep.type, level: sweep.sweptLevel }
        : { detected: false },
      mss: mss
        ? { detected: true, direction: mss.direction, level: mss.breakLevel }
        : { detected: false },
      fvgEntry: fvgEntry
        ? { detected: true, direction: fvgEntry.direction, entry: fvgEntry.entry }
        : { detected: false },
      lastEvaluatedAt: evaluatedAtMs,
    };
  }

  /**
   * Build multi-timeframe context. When `atTime` (Unix seconds) is provided,
   * only candles that closed at or before it are included, so the strategy
   * evaluates exactly as it would have at that historical moment.
   */
  private async buildContext(symbol: string, atTime?: number): Promise<StrategyContext> {
    const [candles5m, candles15m, candles1h, candles4h] = await Promise.all([
      this.fetchCandles(symbol, "5m", 100, atTime),
      this.fetchCandles(symbol, "15m", 100, atTime),
      this.fetchCandles(symbol, "1h", 50, atTime),
      this.fetchCandles(symbol, "4h", 30, atTime),
    ]);

    return {
      symbol,
      exchange: "binance",
      candles5m,
      candles15m,
      candles1h,
      candles4h,
    };
  }

  private async fetchCandles(symbol: string, timeframe: string, limit: number, atTime?: number): Promise<Candle[]> {
    // When `atTime` is set, take the most recent `limit` candles up to that
    // moment (DESC + outer ASC re-sort) so the strategy sees only past data.
    if (atTime !== undefined) {
      const result = await this.options.pool.query(
        `SELECT * FROM (
           SELECT * FROM candles
           WHERE exchange = $5 AND symbol = $1 AND timeframe = $2 AND is_closed = true
             AND open_time <= to_timestamp($3)
           ORDER BY open_time DESC LIMIT $4
         ) sub ORDER BY open_time ASC`,
        [symbol.toUpperCase(), timeframe, atTime, limit, getExchange()]
      );
      return result.rows.map(dbRowToCandle);
    }

    // Most recent `limit` candles (DESC + outer ASC re-sort). A plain
    // `ORDER BY open_time ASC LIMIT n` would return the OLDEST n rows and
    // freeze the live strategy on the earliest ingested window.
    const result = await this.options.pool.query(
      `SELECT * FROM (
         SELECT * FROM candles
         WHERE exchange = $4 AND symbol = $1 AND timeframe = $2 AND is_closed = true
         ORDER BY open_time DESC LIMIT $3
       ) sub ORDER BY open_time ASC`,
      [symbol.toUpperCase(), timeframe, limit, getExchange()]
    );
    return result.rows.map(dbRowToCandle);
  }


  /**
   * Get liquidity levels (swing highs/lows) with swept status.
   */
  async getLiquidityLevels(symbol: string, timeframe: string): Promise<LiquidityLevel[]> {
    const result = await this.options.pool.query(
      `SELECT * FROM (
         SELECT * FROM candles WHERE exchange = $3 AND symbol = $1 AND timeframe = $2 AND is_closed = true
         ORDER BY open_time DESC LIMIT 200
       ) sub ORDER BY open_time ASC`,
      [symbol.toUpperCase(), timeframe, getExchange()]
    );
    const candles = result.rows.map(dbRowToCandle);
    if (candles.length < 12) return [];

    const { detectSwingPoints } = await import("@ict-forward-lab/strategies");
    const swings = detectSwingPoints(candles, 5, 5);

    // Determine which levels have been swept by checking if any subsequent candle wicked beyond
    const levels: LiquidityLevel[] = swings.map((swing) => {
      const type = swing.type === "high" ? "buy-side" : "sell-side";
      const level: LiquidityLevel = {
        id: `liquidity-${type}-${swing.time}`,
        type,
        price: swing.price,
        time: swing.time,
        swept: false,
      };

      // Check if subsequent candles touched or went beyond this level (wick or body)
      for (let j = swing.index + 1; j < candles.length; j++) {
        if (swing.type === "high" && candles[j].high >= swing.price) {
          level.swept = true;
          level.sweptAt = candles[j].time;
          break;
        }
        if (swing.type === "low" && candles[j].low <= swing.price) {
          level.swept = true;
          level.sweptAt = candles[j].time;
          break;
        }
      }

      return level;
    });

    return levels;
  }
}
