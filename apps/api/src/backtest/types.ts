import type { ForwardTrade } from "../forward-test/types";

export interface BacktestConfig {
  symbol: string;
  startDate: string;     // ISO date "2024-01-01"
  endDate: string;       // ISO date "2024-06-30"
  initialBalance: number;
  riskPerTradePercent: number;
  feePercent: number;
  slippagePercent: number;
  maxOpenTrades: number;
  maxTradesPerDay: number;
  minRiskReward: number;
  tradeTimeoutCandles: number;
  maxLeverage: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  /** null = undefined/infinite (wins, zero losses); kept JSON-safe for storage. */
  profitFactor: number | null;
  netPnl: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  averageRR: number;
  averageDurationCandles: number;
  bestTrade: number;
  worstTrade: number;
}

export interface EquityPoint {
  time: number;
  balance: number;
}

/** Lightweight OHLC point for chart replay. `time` is in Unix milliseconds. */
export interface ReplayCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface BacktestResult {
  id: string;
  symbol: string;
  startTime: number;
  endTime: number;
  config: BacktestConfig;
  trades: ForwardTrade[];
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  /**
   * 5m candles for the backtest window, attached on retrieval so the web UI
   * can render the replay chart. Not persisted with the result; sourced from
   * the candles table on demand.
   */
  candles?: ReplayCandle[];
  createdAt: number;
}

export interface BacktestSummary {
  id: string;
  symbol: string;
  startTime: number;
  endTime: number;
  tradeCount: number;
  netPnl: number;
  winRate: number;
  createdAt: number;
}
