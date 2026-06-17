import type { ForwardTrade } from "../forward-test/types";
import type { BacktestMetrics, EquityPoint } from "./types";

/**
 * Compute aggregate backtest metrics from the closed trades.
 *
 * @param candleIntervalMs Bar length in ms (e.g. 5m = 300000). When provided,
 *   `averageDurationCandles` is derived from each trade's entry→exit span.
 *   Trades without both timestamps are excluded from the duration average.
 */
export function calculateMetrics(
  trades: ForwardTrade[],
  initialBalance: number,
  candleIntervalMs?: number,
): BacktestMetrics {
  const closed = trades.filter(t => t.pnl != null);
  const totalTrades = closed.length;

  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      winRate: 0,
      profitFactor: 0,
      netPnl: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      averageRR: 0,
      averageDurationCandles: 0,
      bestTrade: 0,
      worstTrade: 0,
    };
  }

  const wins = closed.filter(t => (t.pnl ?? 0) > 0).length;
  const losses = closed.filter(t => (t.pnl ?? 0) < 0).length;
  const breakeven = closed.filter(t => (t.pnl ?? 0) === 0).length;
  const winRate = wins / totalTrades;

  const grossProfit = closed
    .filter(t => (t.pnl ?? 0) > 0)
    .reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(
    closed
      .filter(t => (t.pnl ?? 0) < 0)
      .reduce((s, t) => s + (t.pnl ?? 0), 0)
  );
  // `null` represents an undefined (infinite) profit factor — wins but zero
  // losses. Unlike `Infinity`, null survives JSON.stringify, so it persists
  // correctly through the backtest store instead of decaying to null→0 on reload.
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? null : 0) : grossProfit / grossLoss;

  const netPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const averageRR = closed.reduce((s, t) => s + (t.rrResult ?? 0), 0) / totalTrades;

  // Max drawdown
  let peak = initialBalance;
  let maxDD = 0;
  let maxDDPercent = 0;
  let balance = initialBalance;
  for (const trade of closed) {
    balance += trade.pnl ?? 0;
    if (balance > peak) peak = balance;
    const dd = peak - balance;
    if (dd > maxDD) maxDD = dd;
    // Track the largest *percentage* drawdown independently of the largest
    // absolute one — a deep dip from a low peak can exceed the percent of the
    // biggest dollar dip from a high peak.
    const ddPercent = peak > 0 ? dd / peak : 0;
    if (ddPercent > maxDDPercent) maxDDPercent = ddPercent;
  }

  const pnls = closed.map(t => t.pnl ?? 0);
  const bestTrade = Math.max(...pnls);
  const worstTrade = Math.min(...pnls);

  // Average holding time in candles, measured from entry to exit. Only trades
  // that actually filled (have an entryTime) and closed (have an exitTime) count.
  let averageDurationCandles = 0;
  if (candleIntervalMs && candleIntervalMs > 0) {
    const durations = closed
      .filter(t => t.entryTime != null && t.exitTime != null)
      .map(t => Math.max(0, ((t.exitTime as number) - (t.entryTime as number)) / candleIntervalMs));
    if (durations.length > 0) {
      averageDurationCandles = durations.reduce((s, d) => s + d, 0) / durations.length;
    }
  }

  return {
    totalTrades,
    wins,
    losses,
    breakeven,
    winRate,
    profitFactor,
    netPnl,
    maxDrawdown: maxDD,
    maxDrawdownPercent: maxDDPercent,
    averageRR,
    averageDurationCandles,
    bestTrade,
    worstTrade,
  };
}

export function buildEquityCurve(trades: ForwardTrade[], initialBalance: number): EquityPoint[] {
  const curve: EquityPoint[] = [{ time: 0, balance: initialBalance }];
  let balance = initialBalance;

  const closed = trades
    .filter(t => t.pnl != null && t.exitTime != null)
    .sort((a, b) => (a.exitTime ?? 0) - (b.exitTime ?? 0));

  for (const trade of closed) {
    balance += trade.pnl ?? 0;
    curve.push({ time: trade.exitTime ?? 0, balance });
  }

  return curve;
}
