import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import {
  ForwardTestEngine,
  TradeStore,
  AccountTracker,
  defaultForwardTestConfig,
} from "../forward-test";
import type { ForwardTestConfig } from "../forward-test";

declare module "fastify" {
  interface FastifyInstance {
    forwardTestEngine: ForwardTestEngine;
  }
}

/**
 * Parse a numeric env var, falling back to `fallback` only when the var is
 * unset or not a finite number. A legitimate `0` is preserved (unlike the
 * `Number(x) || default` idiom, which treats 0 as missing).
 */
function envNumber(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const forwardTestPlugin = fp(async (fastify: FastifyInstance) => {
  const config: ForwardTestConfig = {
    initialBalance: envNumber(process.env.FORWARD_TEST_INITIAL_BALANCE, defaultForwardTestConfig.initialBalance),
    riskPerTradePercent: envNumber(process.env.FORWARD_TEST_RISK_PER_TRADE_PERCENT, defaultForwardTestConfig.riskPerTradePercent),
    feePercent: envNumber(process.env.FORWARD_TEST_FEE_PERCENT, defaultForwardTestConfig.feePercent),
    slippagePercent: envNumber(process.env.FORWARD_TEST_SLIPPAGE_PERCENT, defaultForwardTestConfig.slippagePercent),
    maxOpenTrades: envNumber(process.env.FORWARD_TEST_MAX_OPEN_TRADES, defaultForwardTestConfig.maxOpenTrades),
    maxTradesPerDay: envNumber(process.env.FORWARD_TEST_MAX_TRADES_PER_DAY, defaultForwardTestConfig.maxTradesPerDay),
    minRiskReward: envNumber(process.env.FORWARD_TEST_MIN_RR, defaultForwardTestConfig.minRiskReward),
    tradeTimeoutCandles: envNumber(process.env.FORWARD_TEST_TIMEOUT_CANDLES, defaultForwardTestConfig.tradeTimeoutCandles),
    maxLeverage: envNumber(process.env.FORWARD_TEST_MAX_LEVERAGE, defaultForwardTestConfig.maxLeverage),
  };

  const tradeStore = new TradeStore(fastify.db);
  const accountTracker = new AccountTracker(config.initialBalance);

  // Reconstruct balance from existing closed trades
  try {
    const allTrades = await tradeStore.getAll({ limit: 500 });
    const closedPnls = allTrades
      .filter((t) => t.pnl != null)
      .reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    if (closedPnls !== 0) {
      accountTracker.reset(config.initialBalance + closedPnls);
      fastify.log.info(
        `[ForwardTest] Reconstructed balance: ${accountTracker.getBalance().toFixed(2)} (initial: ${config.initialBalance}, PnL: ${closedPnls.toFixed(2)})`,
      );
    }
  } catch (err) {
    fastify.log.warn(`[ForwardTest] Could not reconstruct balance: ${(err as Error).message}`);
  }

  // We need wsServer from market-data service — it's available on the fastify instance
  // via the market-data plugin. We'll access it through a lazy getter after ready.
  // For now, create a placeholder and wire after ready.
  let engine: ForwardTestEngine | null = null;

  fastify.addHook("onReady", async () => {
    // Access the WsServer through market data service internals
    // The WsServer is instantiated inside MarketDataService but we can access
    // it through the wsServer passed to strategy runner
    const { getWsServer } = await import("../market-data/get-ws-server");
    const wsServer = getWsServer(fastify);

    engine = new ForwardTestEngine({
      config,
      tradeStore,
      accountTracker,
      wsServer,
    });

    await engine.initialize();
    fastify.log.info(
      `[ForwardTest] Engine initialized. Balance: ${accountTracker.getBalance().toFixed(2)}, Open trades: ${engine.getOpenTrades().length}`,
    );
  });

  // Decorate with a proxy that delegates to the engine once initialized
  const engineProxy = new Proxy({} as ForwardTestEngine, {
    get(_target, prop) {
      if (!engine) {
        if (prop === "onSignal" || prop === "onTick" || prop === "onCandleClosed") {
          return async () => null;
        }
        if (prop === "getOpenTrades") return () => [];
        if (prop === "getConfig") return () => config;
        if (prop === "getAccountBalance") return () => accountTracker.getBalance();
        return undefined;
      }
      const value = (engine as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof value === "function") {
        return value.bind(engine);
      }
      return value;
    },
  });

  fastify.decorate("forwardTestEngine", engineProxy);
});
