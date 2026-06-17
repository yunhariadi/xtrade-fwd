import type { Candle } from "@ict-forward-lab/core";
import type { StrategySignal } from "@ict-forward-lab/strategies";
import type { WsServer } from "../market-data/ws-server";
import type { ForwardTestConfig, ForwardTrade } from "./types";
import { TradeStore } from "./trade-store";
import { AccountTracker } from "./account-tracker";
import { calculatePositionSize } from "./position-sizer";

export interface ForwardTestEngineOptions {
  config: ForwardTestConfig;
  tradeStore: TradeStore;
  accountTracker: AccountTracker;
  wsServer: WsServer;
}

export class ForwardTestEngine {
  private config: ForwardTestConfig;
  private tradeStore: TradeStore;
  private accountTracker: AccountTracker;
  private wsServer: WsServer;

  /** In-memory open trades for fast tick processing */
  private openTrades: Map<string, ForwardTrade> = new Map();
  /** Candle counter per trade for timeout tracking */
  private candleCounters: Map<string, number> = new Map();
  /**
   * Setup keys that have already produced a trade. Prevents the same ICT setup
   * from re-emitting a trade on consecutive 5m closes (signal de-duplication).
   * Bounded to the most recent {@link MAX_SEEN_SIGNAL_IDS} keys so a long-running
   * live engine doesn't leak memory — evicted setups are time-bound (their FVG
   * zone ids encode candle time) and won't recur once price has moved on.
   */
  private seenSignalIds: Set<string> = new Set();
  /** FIFO insertion order for {@link seenSignalIds}, used to evict the oldest. */
  private seenSignalOrder: string[] = [];
  private static readonly MAX_SEEN_SIGNAL_IDS = 5000;

  /**
   * Serializes all mutating engine operations. Binance ticks arrive faster than
   * an async exit/close round-trip completes, so overlapping `onTick` calls
   * could otherwise both observe a trade as `active` and close it twice
   * (double-applying PnL). Chaining through this promise guarantees one-at-a-time
   * processing without dropping events.
   */
  private processing: Promise<void> = Promise.resolve();

  constructor(options: ForwardTestEngineOptions) {
    this.config = options.config;
    this.tradeStore = options.tradeStore;
    this.accountTracker = options.accountTracker;
    this.wsServer = options.wsServer;
  }

  /** Record a setup key as seen, evicting the oldest once over the cap. */
  private rememberSignalId(id: string): void {
    if (this.seenSignalIds.has(id)) return;
    this.seenSignalIds.add(id);
    this.seenSignalOrder.push(id);
    if (this.seenSignalOrder.length > ForwardTestEngine.MAX_SEEN_SIGNAL_IDS) {
      const oldest = this.seenSignalOrder.shift();
      if (oldest !== undefined) this.seenSignalIds.delete(oldest);
    }
  }

  /** Run `fn` after any in-flight engine operation completes. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.processing.then(fn, fn);
    // Keep the chain alive regardless of success/failure of `fn`.
    this.processing = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Load open trades from DB on startup and reconstruct account balance.
   */
  async initialize(): Promise<void> {
    const openTrades = await this.tradeStore.getOpenTrades();
    for (const trade of openTrades) {
      this.openTrades.set(trade.id, trade);
      this.candleCounters.set(trade.id, 0);
      this.rememberSignalId(trade.signalId);
    }

    // Seed de-dup set from recent trades so a restart doesn't re-enter setups
    // that already produced (and possibly closed) a trade.
    try {
      const recent = await this.tradeStore.getAll({ limit: 200 });
      for (const t of recent) this.rememberSignalId(t.signalId);
    } catch {
      // Non-fatal — de-dup will still work for the current process lifetime.
    }
  }

  /**
   * Handle a new strategy signal — create a pending trade if limits allow.
   */
  async onSignal(signal: StrategySignal): Promise<ForwardTrade | null> {
    return this.enqueue(() => this.handleSignal(signal));
  }

  private async handleSignal(signal: StrategySignal): Promise<ForwardTrade | null> {
    if (signal.side === "none") return null;

    // Validate signal completeness
    if (signal.entry == null || signal.stopLoss == null || signal.takeProfit == null) {
      console.warn("[ForwardTest] Rejected: incomplete signal (missing entry/SL/TP)");
      return null;
    }

    if (signal.entry === signal.stopLoss) {
      console.warn("[ForwardTest] Rejected: invalid SL distance (entry === stopLoss)");
      return null;
    }

    // Validate RR minimum
    if (signal.riskReward != null && signal.riskReward < this.config.minRiskReward) {
      console.warn(`[ForwardTest] Rejected: RR ${signal.riskReward} below minimum ${this.config.minRiskReward}`);
      return null;
    }

    // De-duplicate per setup: a single ICT setup (identified by its FVG zone)
    // must not produce multiple trades across consecutive candle closes.
    const signalId = this.deriveSignalId(signal);
    if (this.seenSignalIds.has(signalId)) {
      return null;
    }

    // Check account depleted
    if (this.accountTracker.isAccountDepleted()) {
      console.warn("[ForwardTest] Rejected: account depleted");
      return null;
    }

    // Check max open trades
    const openCount = this.openTrades.size;
    if (openCount >= this.config.maxOpenTrades) {
      return null;
    }

    // Check max trades per day
    try {
      const todayCount = await this.tradeStore.getTodayTradeCount();
      if (todayCount >= this.config.maxTradesPerDay) {
        return null;
      }
    } catch (err) {
      console.error(`[ForwardTest] DB error checking daily count: ${(err as Error).message}`);
    }

    // Calculate position size
    const { positionSize, riskAmount } = calculatePositionSize({
      accountBalance: this.accountTracker.getBalance(),
      riskPercent: this.config.riskPerTradePercent,
      entry: signal.entry,
      stopLoss: signal.stopLoss,
      maxLeverage: this.config.maxLeverage,
    });

    if (positionSize === 0) {
      console.warn("[ForwardTest] Rejected: position size is zero");
      return null;
    }

    const now = Date.now();

    const trade: ForwardTrade = {
      id: "", // Will be assigned by DB
      signalId,
      strategyName: "ict-model-2022",
      strategyVersion: "1.0.0",
      exchange: "binance",
      symbol: signal.symbol,
      side: signal.side as "long" | "short",
      status: "pending",
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      riskAmount,
      positionSize,
      metadata: { ...signal.metadata, signalEntry: signal.entry },
      createdAt: now,
      updatedAt: now,
    };

    try {
      const persisted = await this.tradeStore.create(trade);
      this.openTrades.set(persisted.id, persisted);
      this.candleCounters.set(persisted.id, 0);
      this.rememberSignalId(signalId);
      this.wsServer.broadcastTrade("trade:created", persisted);
      return persisted;
    } catch (err) {
      console.error(`[ForwardTest] DB error creating trade: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Derive a stable per-setup signal id. Uses the FVG zone id from the strategy
   * metadata when available (stable across consecutive closes of the same
   * setup); falls back to signalTime if metadata is missing.
   */
  private deriveSignalId(signal: StrategySignal): string {
    const entryMeta = signal.metadata?.entry as { fvgZoneId?: string } | undefined;
    const setupKey = entryMeta?.fvgZoneId ?? String(signal.signalTime);
    return `${signal.symbol}-${signal.side}-${setupKey}`;
  }

  /**
   * Check entry triggers and SL/TP on each candle tick (live or closed).
   */
  async onTick(candle: Candle): Promise<void> {
    return this.enqueue(() => this.processTick(candle));
  }

  private async processTick(candle: Candle): Promise<void> {
    for (const [, trade] of this.openTrades) {
      if (trade.status === "pending") {
        await this.checkEntry(trade, candle);
      }
      // A pending trade that just filled is now "active" — check its exit on the
      // SAME candle. The bar that reached the limit entry can also reach SL/TP,
      // so deferring the exit check to the next candle would hand every fill a
      // free bar and optimistically bias results. `checkExit` resolves the
      // both-hit case conservatively (SL wins).
      if (trade.status === "active") {
        await this.checkExit(trade, candle);
      }
    }
  }

  /**
   * On each closed candle, increment candle counters and check timeouts.
   */
  async onCandleClosed(candle: Candle): Promise<void> {
    return this.enqueue(() => this.processCandleClosed(candle));
  }

  private async processCandleClosed(candle: Candle): Promise<void> {
    for (const [id, trade] of this.openTrades) {
      const count = (this.candleCounters.get(id) ?? 0) + 1;
      this.candleCounters.set(id, count);

      if (count >= this.config.tradeTimeoutCandles) {
        if (trade.status === "pending") {
          // Expire pending trade
          trade.status = "expired";
          trade.exitReason = "cancelled";
          trade.updatedAt = Date.now();
          try {
            await this.tradeStore.update(trade);
          } catch (err) {
            console.error(`[ForwardTest] DB error expiring trade: ${(err as Error).message}`);
          }
          this.openTrades.delete(id);
          this.candleCounters.delete(id);
          this.wsServer.broadcastTrade("trade:closed", trade);
        } else if (trade.status === "active") {
          // Close active trade due to timeout (candle.time is seconds → ms)
          await this.closeTrade(trade, candle.close, "timeout", candle.time * 1000);
        }
      }
    }
  }

  /**
   * Manually close a trade at the given price.
   */
  async manualClose(tradeId: string, currentPrice: number): Promise<ForwardTrade> {
    return this.enqueue(async () => {
      const trade = this.openTrades.get(tradeId);
      if (!trade) {
        const dbTrade = await this.tradeStore.getById(tradeId);
        if (!dbTrade) throw new Error("Trade not found");
        if (dbTrade.status !== "active") throw new Error("Trade is not active");
        throw new Error("Trade not in memory");
      }

      if (trade.status !== "active") {
        throw new Error("Trade is not active");
      }

      return this.closeTrade(trade, currentPrice, "manual", Date.now());
    });
  }

  /**
   * Cancel a pending trade.
   */
  async cancelTrade(tradeId: string): Promise<ForwardTrade> {
    return this.enqueue(async () => {
      const trade = this.openTrades.get(tradeId);
      if (!trade) {
        const dbTrade = await this.tradeStore.getById(tradeId);
        if (!dbTrade) throw new Error("Trade not found");
        if (dbTrade.status !== "pending") throw new Error("Trade is not pending");
        throw new Error("Trade not in memory");
      }

      if (trade.status !== "pending") {
        throw new Error("Trade is not pending");
      }

      trade.status = "cancelled";
      trade.exitReason = "cancelled";
      trade.updatedAt = Date.now();

      try {
        await this.tradeStore.update(trade);
      } catch (err) {
        console.error(`[ForwardTest] DB error cancelling trade: ${(err as Error).message}`);
      }

      this.openTrades.delete(tradeId);
      this.candleCounters.delete(tradeId);
      this.wsServer.broadcastTrade("trade:closed", trade);

      return trade;
    });
  }

  getOpenTrades(): ForwardTrade[] {
    return Array.from(this.openTrades.values());
  }

  getConfig(): ForwardTestConfig {
    return this.config;
  }

  getAccountBalance(): number {
    return this.accountTracker.getBalance();
  }

  // --- Private helpers ---

  private async checkEntry(trade: ForwardTrade, candle: Candle): Promise<void> {
    const entryTarget = this.getSignalEntry(trade);
    let triggered = false;

    if (trade.side === "long") {
      // Long is a retracement (limit) entry at the top edge of a bullish FVG.
      // Price sits above the gap after it forms, so the fill happens when price
      // retraces DOWN into the level: candle low reaches the entry price.
      triggered = candle.low <= entryTarget;
    } else {
      // Short is a retracement (limit) entry at the bottom edge of a bearish FVG.
      // Price sits below the gap after it forms, so the fill happens when price
      // retraces UP into the level: candle high reaches the entry price.
      triggered = candle.high >= entryTarget;
    }


    if (!triggered) return;

    // Apply entry slippage
    const slippage = this.config.slippagePercent;
    if (trade.side === "long") {
      trade.entryPrice = entryTarget * (1 + slippage / 100);
    } else {
      trade.entryPrice = entryTarget * (1 - slippage / 100);
    }

    trade.entryTime = candle.time * 1000; // convert seconds to ms
    trade.status = "active";
    trade.updatedAt = Date.now();

    // Persist the fill within the serialized engine chain (see `enqueue`) and
    // before this same candle's exit is evaluated. A DB failure is logged but
    // non-fatal — the in-memory trade is already active either way.
    try {
      await this.tradeStore.update(trade);
    } catch (err) {
      console.error(`[ForwardTest] DB error activating trade: ${(err as Error).message}`);
    }

    this.wsServer.broadcastTrade("trade:updated", trade);
  }

  private async checkExit(trade: ForwardTrade, candle: Candle): Promise<void> {
    if (!trade.entryPrice) return;

    let slHit = false;
    let tpHit = false;

    if (trade.side === "long") {
      slHit = candle.low <= trade.stopLoss;
      tpHit = candle.high >= trade.takeProfit;
    } else {
      slHit = candle.high >= trade.stopLoss;
      tpHit = candle.low <= trade.takeProfit;
    }

    // Worst-case: if both triggered, SL wins. `candle.time` is Unix seconds;
    // closeTrade expects milliseconds.
    if (slHit) {
      await this.closeTrade(trade, trade.stopLoss, "sl", candle.time * 1000);
    } else if (tpHit) {
      await this.closeTrade(trade, trade.takeProfit, "tp", candle.time * 1000);
    }
  }

  /**
   * Close a trade: apply slippage to exit, calculate PnL, update account, persist.
   */
  private async closeTrade(
    trade: ForwardTrade,
    rawExitPrice: number,
    reason: "tp" | "sl" | "timeout" | "manual",
    exitTimeMs: number,
  ): Promise<ForwardTrade> {
    // Guard against a double-close racing through before the map delete lands.
    if (trade.status !== "active") {
      return trade;
    }

    // Apply exit slippage
    let exitPrice = rawExitPrice;
    const slippage = this.config.slippagePercent;

    if (reason === "sl") {
      if (trade.side === "long") {
        exitPrice = rawExitPrice * (1 - slippage / 100);
      } else {
        exitPrice = rawExitPrice * (1 + slippage / 100);
      }
    } else if (reason === "tp") {
      if (trade.side === "long") {
        exitPrice = rawExitPrice * (1 - slippage / 100);
      } else {
        exitPrice = rawExitPrice * (1 + slippage / 100);
      }
    }
    // For timeout/manual, use raw price (no slippage on market close)

    const entryPrice = trade.entryPrice!;
    const positionSize = trade.positionSize;
    const feePercent = this.config.feePercent;

    // Calculate PnL
    const rawPnl =
      trade.side === "long"
        ? (exitPrice - entryPrice) * positionSize
        : (entryPrice - exitPrice) * positionSize;

    const entryFee = (entryPrice * positionSize * feePercent) / 100;
    const exitFee = (exitPrice * positionSize * feePercent) / 100;
    const netPnl = rawPnl - entryFee - exitFee;

    // Determine status
    let status: ForwardTrade["status"];
    if (reason === "manual") {
      status = "closed_manual";
    } else if (netPnl > 0) {
      status = "closed_win";
    } else if (netPnl < 0) {
      status = "closed_loss";
    } else {
      status = "closed_breakeven";
    }

    // Calculate percentages
    const balance = this.accountTracker.getBalance();
    const pnlPercent = balance > 0 ? (netPnl / balance) * 100 : 0;
    const rrResult = trade.riskAmount > 0 ? netPnl / trade.riskAmount : 0;

    // Update trade
    trade.exitPrice = exitPrice;
    trade.exitTime = exitTimeMs;
    trade.exitReason = reason;
    trade.status = status;
    trade.pnl = netPnl;
    trade.pnlPercent = pnlPercent;
    trade.rrResult = rrResult;
    trade.updatedAt = Date.now();

    // Apply PnL to account
    this.accountTracker.applyPnl(netPnl);

    // Remove from open trades
    this.openTrades.delete(trade.id);
    this.candleCounters.delete(trade.id);

    // Persist
    try {
      await this.tradeStore.update(trade);
    } catch (err) {
      console.error(`[ForwardTest] DB error closing trade: ${(err as Error).message}`);
    }

    this.wsServer.broadcastTrade("trade:closed", trade);

    return trade;
  }

  private getSignalEntry(trade: ForwardTrade): number {
    // Signal entry is stored in metadata during trade creation
    // Fall back to a midpoint between SL and TP if not available
    const metaEntry = trade.metadata?.signalEntry as number | undefined;
    if (metaEntry != null) return metaEntry;

    // Fallback: calculate from SL/TP (shouldn't happen with proper signal data)
    if (trade.side === "long") {
      return trade.stopLoss + (trade.takeProfit - trade.stopLoss) / 3;
    } else {
      return trade.stopLoss - (trade.stopLoss - trade.takeProfit) / 3;
    }
  }
}
