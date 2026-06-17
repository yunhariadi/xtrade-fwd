import type { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import type { Candle } from "@ict-forward-lab/core";
import { BinanceWsClient, BinanceKlineEvent } from "./binance-ws-client";
import { normalizeKline } from "./kline-normalizer";
import { CandleStore } from "./candle-store";
import { WsServer } from "./ws-server";
import { FvgTracker } from "../fvg/fvg-tracker";
import { StrategyRunner } from "../strategy/strategy-runner";
import { setWsServer } from "./get-ws-server";

export interface MarketDataServiceOptions {
  binanceWsUrl: string;
  symbol: string;
  timeframes: string[];
  pool: Pool;
  fastify: FastifyInstance;
}

export class MarketDataService {
  private wsClient: BinanceWsClient;
  private candleStore: CandleStore;
  private wsServer: WsServer;
  private fvgTracker: FvgTracker;
  private strategyRunner: StrategyRunner;

  constructor(private options: MarketDataServiceOptions) {
    const streams = options.timeframes.map(
      (tf) => `${options.symbol.toLowerCase()}@kline_${tf}`,
    );

    this.wsClient = new BinanceWsClient({
      url: options.binanceWsUrl,
      streams,
      reconnectBaseDelay: 1000,
      reconnectMaxDelay: 60000,
    });

    this.candleStore = new CandleStore({
      pool: options.pool,
      exchange: "binance",
    });

    this.wsServer = new WsServer(options.fastify);
    setWsServer(this.wsServer);

    this.fvgTracker = new FvgTracker({ wsServer: this.wsServer });

    this.strategyRunner = new StrategyRunner({
      pool: options.pool,
      wsServer: this.wsServer,
      symbol: options.symbol,
    });
  }

  async start(): Promise<void> {
    this.registerRoutes();
    await this.connect();
  }

  /**
   * Register WebSocket routes. Must be called during plugin registration (before boot).
   */
  registerRoutes(): void {
    this.wsServer.register();
  }

  /**
   * Connect to Binance WS and start processing. Call after server is ready.
   */
  async connect(): Promise<void> {
    this.setupEventHandlers();
    this.wsClient.connect();

    // Load historical candles for FVG tracking.
    // Must match the window the chart renders (newest 500, see candleRoutes):
    // grab the most-recent 500 closed candles, then re-sort ASC for detection.
    for (const tf of this.options.timeframes) {
      const result = await this.options.pool.query(
        `SELECT * FROM (
           SELECT * FROM candles
           WHERE exchange = 'binance' AND symbol = $1 AND timeframe = $2 AND is_closed = true
           ORDER BY open_time DESC LIMIT 500
         ) sub ORDER BY open_time ASC`,
        [this.options.symbol.toUpperCase(), tf],
      );

      if (result.rows.length > 0) {
        const { dbRowToCandle } = await import("@ict-forward-lab/core");
        const candles = result.rows.map(dbRowToCandle);
        this.fvgTracker.loadHistory(candles, this.options.symbol, tf);
        this.options.fastify.log.info(
          `Loaded ${candles.length} candles for FVG tracking (${this.options.symbol}/${tf})`,
        );
      }
    }

    this.options.fastify.log.info("MarketDataService started");
  }

  async stop(): Promise<void> {
    this.wsClient.disconnect();
    this.options.fastify.log.info("MarketDataService stopped");
  }

  getFvgTracker(): FvgTracker {
    return this.fvgTracker;
  }

  getStrategyRunner(): StrategyRunner {
    return this.strategyRunner;
  }

  private setupEventHandlers(): void {
    this.wsClient.on("kline", (event: BinanceKlineEvent) => {
      this.handleKline(event);
    });

    this.wsClient.on("connected", () => {
      this.options.fastify.log.info("Connected to Binance WS");
      this.handleReconnect();
    });

    this.wsClient.on("disconnected", (code, reason) => {
      this.options.fastify.log.warn(
        `Binance WS disconnected: ${code} ${reason}`,
      );
    });

    this.wsClient.on("reconnecting", (attempt) => {
      this.options.fastify.log.info(
        `Binance WS reconnecting (attempt ${attempt})`,
      );
    });

    this.wsClient.on("error", (err) => {
      this.options.fastify.log.error(`Binance WS error: ${err.message}`);
    });
  }

  private async handleKline(event: BinanceKlineEvent): Promise<void> {
    const result = normalizeKline(event);
    if (!result) return;

    const { candle, symbol, timeframe } = result;

    if (candle.isClosed) {
      await this.candleStore.persist(candle, symbol, timeframe);
      this.wsServer.broadcast("candle:closed", candle, symbol, timeframe);
      this.fvgTracker.onCandleClosed(candle, symbol, timeframe);

      const signal = await this.strategyRunner.onCandleClosed(candle, symbol, timeframe);

      // Forward-test engine: evaluate the closing candle, forward the signal,
      // then check timeouts.
      try {
        const engine = this.options.fastify.forwardTestEngine;
        if (engine) {
          // Evaluate existing pending/active trades against the final candle
          // range BEFORE creating a trade from this candle's signal. This
          // guarantees SL/TP/entry are checked on the close even if no live
          // tick carried the same high/low, and avoids look-ahead on the
          // candle that just generated the signal.
          await engine.onTick(candle);
          if (signal) await engine.onSignal(signal);
          await engine.onCandleClosed(candle);
        }
      } catch {
        // Engine may not be initialized yet
      }
    } else {
      this.wsServer.broadcast("candle:update", candle, symbol, timeframe);

      // Forward-test engine: check entry/exit on every tick
      try {
        const engine = this.options.fastify.forwardTestEngine;
        if (engine) await engine.onTick(candle);
      } catch {
        // Engine may not be initialized yet
      }
    }
  }

  private async handleReconnect(): Promise<void> {
    for (const tf of this.options.timeframes) {
      await this.backfill(this.options.symbol, tf);
    }
  }

  private async backfill(symbol: string, timeframe: string): Promise<void> {
    const lastTime = await this.candleStore.getLastCandleTime(symbol, timeframe);

    // If no rows exist yet, do an initial fetch of the most recent 500 closed candles.
    // If rows exist, fetch everything from the last stored candle up to now.
    const url = lastTime
      ? `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&startTime=${(lastTime + 1) * 1000}&limit=1000`
      : `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=500`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Backfill HTTP ${response.status}`);

      const klines = (await response.json()) as unknown[][];
      let backfilled = 0;

      for (const k of klines) {
        const candle = this.restKlineToCandle(k);
        if (candle && candle.isClosed) {
          const inserted = await this.candleStore.persist(candle, symbol, timeframe);
          if (inserted) {
            this.wsServer.broadcast("candle:closed", candle, symbol, timeframe);
            backfilled++;
          }
        }
      }

      if (backfilled > 0) {
        this.options.fastify.log.info(`Backfilled ${backfilled} candles for ${symbol}/${timeframe}`);
      }
    } catch (err) {
      this.options.fastify.log.error(`Backfill failed for ${symbol}/${timeframe}: ${(err as Error).message}`);
    }
  }

  private restKlineToCandle(k: unknown[]): Candle | null {
    if (!Array.isArray(k) || k.length < 11) return null;
    return {
      time: Math.floor(Number(k[0]) / 1000),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
      isClosed: true,
    };
  }
}
