import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { MarketDataService } from "../market-data/market-data-service";
import type { FvgTracker } from "../fvg/fvg-tracker";
import type { StrategyRunner } from "../strategy/strategy-runner";
import type { AlertStore, AlertMonitor } from "../alerts";

declare module "fastify" {
  interface FastifyInstance {
    fvgTracker: FvgTracker;
    strategyRunner: StrategyRunner;
    alertStore: AlertStore;
    alertMonitor: AlertMonitor;
  }
}

export const marketDataPlugin = fp(async (fastify: FastifyInstance) => {
  const binanceWsUrl =
    process.env.BINANCE_WS_URL ?? "wss://fstream.binance.com/ws";
  const symbol = process.env.MARKET_SYMBOL ?? "BTCUSDT";
  const timeframes = (process.env.MARKET_TIMEFRAMES ?? "5m,15m,1h,4h").split(
    ",",
  );

  const marketDataService = new MarketDataService({
    binanceWsUrl,
    symbol,
    timeframes,
    pool: fastify.db,
    fastify,
  });

  // Register WS route now (before boot) — routes can't be added after boot
  marketDataService.registerRoutes();

  // Decorate Fastify with fvgTracker for use in routes
  fastify.decorate("fvgTracker", marketDataService.getFvgTracker());

  // Decorate Fastify with strategyRunner for use in routes
  fastify.decorate("strategyRunner", marketDataService.getStrategyRunner());

  // Decorate Fastify with alert store + monitor for the alerts routes
  fastify.decorate("alertStore", marketDataService.getAlertStore());
  fastify.decorate("alertMonitor", marketDataService.getAlertMonitor());

  // Connect to Binance WS after server is ready, stop on close
  fastify.addHook("onReady", async () => {
    await marketDataService.connect();
  });

  fastify.addHook("onClose", async () => {
    await marketDataService.stop();
  });
});
