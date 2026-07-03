import type { Pool } from "pg";
import type { Candle } from "@ict-forward-lab/core";
import { dbRowToCandle } from "@ict-forward-lab/core";
import { ictModel2022Strategy } from "@ict-forward-lab/strategies";
import type { StrategyContext } from "@ict-forward-lab/strategies";
import { ForwardTestEngine } from "../forward-test/forward-test-engine";
import { AccountTracker } from "../forward-test/account-tracker";
import type { ForwardTestConfig, ForwardTrade } from "../forward-test/types";
import { HistoricalFetcher } from "./historical-fetcher";
import { getExchange } from "../market-data/market-source";
import { calculateMetrics, buildEquityCurve } from "./metrics-calculator";
import type { BacktestConfig, BacktestResult } from "./types";

// No-op WsServer stub for backtesting (no real broadcasting needed)
const noopWsServer = {
  broadcast: () => {},
  broadcastFvg: () => {},
  broadcastSignal: () => {},
  broadcastTrade: () => {},
  register: () => {},
  getClientCount: () => 0,
} as unknown;

/** 5m timeframe interval in milliseconds — used for duration metrics. */
const CANDLE_INTERVAL_MS = 5 * 60 * 1000;

export class BacktestRunner {
  constructor(private pool: Pool) {}

  async run(config: BacktestConfig): Promise<BacktestResult> {
    const startMs = new Date(config.startDate).getTime();
    const endMs = new Date(config.endDate).getTime();

    // 1. Fetch historical candles
    const fetcher = new HistoricalFetcher(this.pool);
    await fetcher.fetchRange({
      symbol: config.symbol,
      timeframes: ["5m", "15m", "1h", "4h"],
      startTime: startMs,
      endTime: endMs,
    });

    // 2. Load candles from DB
    const [candles5m, candles15m, candles1h, candles4h] = await Promise.all([
      this.loadCandles(config.symbol, "5m", startMs, endMs),
      this.loadCandles(config.symbol, "15m", startMs, endMs),
      this.loadCandles(config.symbol, "1h", startMs, endMs),
      this.loadCandles(config.symbol, "4h", startMs, endMs),
    ]);

    // 3. Create isolated engine
    const fwdConfig: ForwardTestConfig = {
      initialBalance: config.initialBalance,
      riskPerTradePercent: config.riskPerTradePercent,
      feePercent: config.feePercent,
      slippagePercent: config.slippagePercent,
      maxOpenTrades: config.maxOpenTrades,
      maxTradesPerDay: config.maxTradesPerDay,
      minRiskReward: config.minRiskReward,
      tradeTimeoutCandles: config.tradeTimeoutCandles,
      maxLeverage: config.maxLeverage,
      // Backtest signals carry no gate metadata (raw strategy output), so the
      // confluence gates cannot apply here — disabled explicitly.
      minSetupScore: 0,
      requireKillzone: false,
      requirePremiumDiscount: false,
      // Shadow trades are a live-engine concept; backtests never receive them.
      maxOpenShadowTrades: 0,
    };

    const accountTracker = new AccountTracker(config.initialBalance);

    // Use in-memory trade store (no DB writes for backtest trades).
    //
    // Daily-cap support: live counts trades created on the current UTC calendar
    // day (TradeStore.getTodayTradeCount). The engine stamps `createdAt` with
    // wall-clock `Date.now()`, which is useless in a backtest of historical
    // candles, so we bucket created trades by the simulated day instead. The run
    // loop sets `currentDayKey` to the UTC date of the candle being processed
    // before each tick; `getTodayTradeCount` then returns that day's count.
    const inMemoryTrades: ForwardTrade[] = [];
    const tradesByDay = new Map<string, number>();
    let currentDayKey = "";
    const mockTradeStore = {
      create: async (trade: ForwardTrade) => {
        trade.id = String(inMemoryTrades.length + 1);
        inMemoryTrades.push(trade);
        tradesByDay.set(currentDayKey, (tradesByDay.get(currentDayKey) ?? 0) + 1);
        return trade;
      },
      update: async (trade: ForwardTrade) => {
        const idx = inMemoryTrades.findIndex(t => t.id === trade.id);
        if (idx >= 0) inMemoryTrades[idx] = trade;
        return trade;
      },
      getById: async (id: string) => inMemoryTrades.find(t => t.id === id) || null,
      getAll: async () => inMemoryTrades,
      getOpenTrades: async () => inMemoryTrades.filter(t => t.status === "pending" || t.status === "active"),
      getTodayTradeCount: async () => tradesByDay.get(currentDayKey) ?? 0,
    };

    const engine = new ForwardTestEngine({
      config: fwdConfig,
      tradeStore: mockTradeStore as any,
      accountTracker,
      wsServer: noopWsServer as any,
    });

    // 4. Process 5m candles sequentially
    for (let i = 0; i < candles5m.length; i++) {
      const candle = candles5m[i];
      const currentTime = candle.time;

      // Bucket the daily-cap count by this candle's UTC day (candle.time is
      // Unix seconds). Mirrors live's "trades created today (UTC)" semantics.
      currentDayKey = new Date(candle.time * 1000).toISOString().slice(0, 10);

      // Build strategy context with only candles available at this point
      const ctx: StrategyContext = {
        symbol: config.symbol,
        exchange: getExchange(),
        candles5m: candles5m.slice(0, i + 1).slice(-100),
        candles15m: candles15m.filter(c => c.time <= currentTime).slice(-100),
        candles1h: candles1h.filter(c => c.time <= currentTime).slice(-50),
        candles4h: candles4h.filter(c => c.time <= currentTime).slice(-30),
      };

      // Run strategy on the just-closed candle
      const signal = ictModel2022Strategy(ctx);

      // Evaluate existing pending/active trades against THIS candle BEFORE
      // acting on the new signal. This mirrors the live pipeline and, crucially,
      // prevents look-ahead bias: a trade created from candle `i`'s close must
      // not fill (or hit SL/TP) using candle `i`'s own high/low — that price
      // action already occurred. A new trade can only fill from candle `i + 1`
      // onward, which is realistic for a limit entry decided at the close.
      await engine.onTick(candle);

      if (signal.side !== "none") {
        await engine.onSignal(signal);
      }

      await engine.onCandleClosed(candle);
    }

    // 5. Collect results
    const trades = inMemoryTrades;
    const metrics = calculateMetrics(trades, config.initialBalance, CANDLE_INTERVAL_MS);
    const equityCurve = buildEquityCurve(trades, config.initialBalance);

    return {
      id: "", // Will be assigned by store
      symbol: config.symbol,
      startTime: startMs,
      endTime: endMs,
      config,
      trades,
      metrics,
      equityCurve,
      createdAt: Date.now(),
    };
  }

  private async loadCandles(symbol: string, timeframe: string, startMs: number, endMs: number): Promise<Candle[]> {
    const result = await this.pool.query(
      `SELECT * FROM candles WHERE exchange = $5 AND symbol = $1 AND timeframe = $2
       AND open_time >= $3 AND open_time <= $4 AND is_closed = true
       ORDER BY open_time ASC`,
      [symbol, timeframe, new Date(startMs).toISOString(), new Date(endMs).toISOString(), getExchange()]
    );
    return result.rows.map(dbRowToCandle);
  }
}
