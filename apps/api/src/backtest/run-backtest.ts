import "dotenv/config";
import { Pool } from "pg";
import { BacktestRunner } from "./backtest-runner";
import type { BacktestConfig } from "./types";

/**
 * Standalone backtest CLI. Runs the ICT A-Model 2022 strategy over a historical
 * date range through the exact ForwardTestEngine code path used live, then
 * prints the resulting metrics. Auto-fetches missing candles from Binance.
 *
 * Usage:
 *   tsx src/backtest/run-backtest.ts [startDate] [endDate] [symbol]
 *
 * Defaults: a 1-month window on BTCUSDT.
 */
async function main() {
  const [, , startArg, endArg, symbolArg] = process.argv;

  const config: BacktestConfig = {
    symbol: symbolArg ?? "BTCUSDT",
    startDate: startArg ?? "2024-01-01",
    endDate: endArg ?? "2024-02-01",
    initialBalance: 10_000,
    riskPerTradePercent: 1,
    feePercent: 0.04,
    slippagePercent: 0.02,
    maxOpenTrades: 1,
    maxTradesPerDay: 3,
    minRiskReward: 2,
    tradeTimeoutCandles: 24,
    maxLeverage: 10,
  };

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5433/ict_forward_lab",
  });

  console.log(
    `Running backtest: ${config.symbol} ${config.startDate} → ${config.endDate}`,
  );
  console.log("Fetching candles (this may take a moment on first run)...");

  const runner = new BacktestRunner(pool);
  const t0 = Date.now();
  const result = await runner.run(config);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const m = result.metrics;
  console.log(`\nDone in ${elapsed}s\n`);
  console.log("=== Backtest Metrics ===");
  console.log(`Total trades:        ${m.totalTrades}`);
  console.log(`Wins / Losses / BE:  ${m.wins} / ${m.losses} / ${m.breakeven}`);
  console.log(`Win rate:            ${(m.winRate * 100).toFixed(1)}%`);
  console.log(`Profit factor:       ${m.profitFactor == null ? "∞" : m.profitFactor.toFixed(2)}`);
  console.log(`Net PnL:             ${m.netPnl.toFixed(2)} (${((m.netPnl / config.initialBalance) * 100).toFixed(2)}%)`);
  console.log(`Max drawdown:        ${m.maxDrawdown.toFixed(2)} (${m.maxDrawdownPercent.toFixed(2)}%)`);
  console.log(`Average RR:          ${m.averageRR.toFixed(2)}`);
  console.log(`Avg duration:        ${m.averageDurationCandles.toFixed(1)} candles`);
  console.log(`Best / Worst trade:  ${m.bestTrade.toFixed(2)} / ${m.worstTrade.toFixed(2)}`);
  console.log("========================");

  await pool.end();
}

main().catch((err) => {
  console.error("Backtest failed:", err);
  process.exit(1);
});
