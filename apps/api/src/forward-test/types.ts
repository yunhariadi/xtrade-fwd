export type TradeStatus =
  | "pending"
  | "active"
  | "closed_win"
  | "closed_loss"
  | "closed_breakeven"
  | "closed_manual"
  | "cancelled"
  | "expired";

export interface ForwardTestConfig {
  initialBalance: number;
  riskPerTradePercent: number;
  feePercent: number;
  slippagePercent: number;
  maxOpenTrades: number;
  maxTradesPerDay: number;
  minRiskReward: number;
  tradeTimeoutCandles: number;
  /** Notional cap as a multiple of account balance (margin-account realism). */
  maxLeverage: number;
  /**
   * Reject signals whose decision-packet score is below this (0 disables).
   * Buckets: <50 ignore, 50-64 monitor, 65-69 internal, 70+ actionable.
   */
  minSetupScore: number;
  /** Only trade signals that fired inside a setup killzone (London Open / New York). */
  requireKillzone: boolean;
  /** Reject longs in premium and shorts in discount (equilibrium passes both). */
  requirePremiumDiscount: boolean;
}

/**
 * Confluence snapshot attached to a signal's metadata (as `gate`) by the
 * StrategyRunner at signal time. The forward-test engine enforces its
 * configured gates against this. Signals without it (tests, manual injection)
 * bypass gating — the live path always attaches it.
 */
export interface SignalGateInfo {
  /** Decision-packet confluence score, 0-100. */
  score: number;
  grade: string;
  recommendation: string;
  /** Killzone name the signal candle closed in, or null when outside all. */
  killzone: string | null;
  /** Premium/discount location from the 1h dealing range, or null if uncomputable. */
  premiumDiscount: {
    location: "premium" | "discount" | "equilibrium";
    zone: string;
  } | null;
}

export interface ForwardTrade {
  id: string;
  signalId: string;
  strategyName: string;
  strategyVersion: string;
  exchange: string;
  symbol: string;
  side: "long" | "short";
  status: TradeStatus;
  entryTime?: number;
  entryPrice?: number;
  stopLoss: number;
  takeProfit: number;
  exitTime?: number;
  exitPrice?: number;
  exitReason?: "tp" | "sl" | "timeout" | "manual" | "cancelled";
  riskAmount: number;
  positionSize: number;
  pnl?: number;
  pnlPercent?: number;
  rrResult?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export const defaultForwardTestConfig: ForwardTestConfig = {
  initialBalance: 10_000,
  riskPerTradePercent: 1,
  feePercent: 0.04,
  slippagePercent: 0.02,
  maxOpenTrades: 1,
  maxTradesPerDay: 3,
  minRiskReward: 2,
  tradeTimeoutCandles: 24,
  maxLeverage: 10,
  minSetupScore: 70,
  requireKillzone: true,
  requirePremiumDiscount: true,
};
