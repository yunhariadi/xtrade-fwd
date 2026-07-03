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
  /**
   * Cap on concurrently open agent shadow trades. Shadow trades live in their
   * own budget — they never consume maxOpenTrades / maxTradesPerDay slots and
   * never touch the strategy account balance.
   */
  maxOpenShadowTrades: number;
}

/**
 * A shadow trade placed by an external agent (Hermes). It runs through the
 * same tick lifecycle as strategy trades (entry fill, SL/TP, timeout) but is
 * fully isolated from the live forward-test: no confluence gates, no RR
 * minimum, its own open-trade cap, PnL sized against the fixed initialBalance
 * and never applied to the account tracker.
 */
export interface ShadowTradeRequest {
  symbol: string;
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  /**
   * "limit" (default): fills when price retraces to `entry` (long: low ≤ entry,
   * short: high ≥ entry). "market": fills at the next observed tick's close —
   * the agent's quoted entry is recorded but the real fill price wins.
   */
  entryType: "limit" | "market";
  /** Per-trade timeout in 5m bars; falls back to config.tradeTimeoutCandles. */
  timeoutCandles?: number;
  /** Idempotency key — replaying the same id returns the existing open trade. */
  clientOrderId?: string;
  /** Agent identity recorded in metadata; also drives strategyName. */
  agent?: string;
  notes?: string;
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
  // 1.5 / 48 / 70 per calibration run 7 (fvg-retrace population, Jan-Jul
  // 2026, 604 setups): ERL-targeted setups mostly land between 1.5R and 2R,
  // outcomes were measured over a 48-bar (4h) horizon, and every score
  // bucket >= 70 carried positive expectancy (70-79: WR .333 avgR +.302;
  // 80+: WR .324 avgR +.166) while <50 was clearly negative.
  minRiskReward: 1.5,
  tradeTimeoutCandles: 48,
  maxLeverage: 10,
  minSetupScore: 70,
  requireKillzone: true,
  requirePremiumDiscount: true,
  maxOpenShadowTrades: 5,
};
