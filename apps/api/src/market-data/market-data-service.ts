import type { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import type { Candle } from "@ict-forward-lab/core";
import { BinanceWsClient } from "./binance-ws-client";
import { BybitWsClient } from "./bybit-ws-client";
import { normalizeKline, type NormalizationResult } from "./kline-normalizer";
import { normalizeBybitKline } from "./bybit-kline-normalizer";
import { timeframeToBybitInterval, timeframeToDuration } from "./timeframe-utils";
import { CandleStore } from "./candle-store";
import { WsServer } from "./ws-server";
import { FvgTracker } from "../fvg/fvg-tracker";
import { StrategyRunner } from "../strategy/strategy-runner";
import { setWsServer } from "./get-ws-server";

type MarketSource = "binance" | "bybit";

interface SourceClient {
  connect(): void;
  disconnect(): void;
  on(event: "kline", listener: (raw: unknown) => void): void;
  on(event: "connected", listener: () => void): void;
  on(event: "disconnected", listener: (code: number, reason: string) => void): void;
  on(event: "reconnecting", listener: (attempt: number) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

export interface MarketDataServiceOptions {
  binanceWsUrl: string;
  symbol: string;
  timeframes: string[];
  pool: Pool;
  fastify: FastifyInstance;
}

export class MarketDataService {
  private source: MarketSource;
  private exchange: string;
  private wsClient: SourceClient;
  private parse: (raw: unknown) => NormalizationResult[];
  private candleStore: CandleStore;
  private wsServer: WsServer;
  private fvgTracker: FvgTracker;
  private strategyRunner: StrategyRunner;

  constructor(private options: MarketDataServiceOptions) {
    const requested = (process.env.MARKET_SOURCE ?? "binance").toLowerCase();
    this.source = requested === "bybit" ? "bybit" : "binance";
    this.exchange = this.source;

    const symbol = options.symbol.toUpperCase();

    if (this.source === "bybit") {
      const url =
        process.env.BYBIT_WS_URL ?? "wss://stream.bybit.com/v5/public/linear";
      const topics = options.timeframes.map(
        (tf) => `kline.${timeframeToBybitInterval(tf)}.${symbol}`,
      );
      this.wsClient = new BybitWsClient({
        url,
        topics,
        reconnectBaseDelay: 1000,
        reconnectMaxDelay: 60000,
      }) as unknown as SourceClient;
      this.parse = normalizeBybitKline;
    } else {
      const streams = options.timeframes.map(
        (tf) => `${options.symbol.toLowerCase()}@kline_${tf}`,
      );
      this.wsClient = new BinanceWsClient({
        url: options.binanceWsUrl,
        streams,
        reconnectBaseDelay: 1000,
        reconnectMaxDelay: 60000,
      }) as unknown as SourceClient;
      this.parse = (raw) => {
        const r = normalizeKline(raw);
        return r ? [r] : [];
      };
    }

    this.candleStore = new CandleStore({
      pool: options.pool,
      exchange: this.exchange,
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
   * Connect to the market-data source and start processing. Call after server is ready.
   */
  async connect(): Promise<void> {
    this.setupEventHandlers();
    this.wsClient.connect();

    this.options.fastify.log.info(`Market data source: ${this.source}`);

    // Load historical candles for FVG tracking.
    // Must match the window the chart renders (newest 500, see candleRoutes):
    // grab the most-recent 500 closed candles, then re-sort ASC for detection.
    for (const tf of this.options.timeframes) {
      const result = await this.options.pool.query(
        `SELECT * FROM (
           SELECT * FROM candles
           WHERE exchange = $1 AND symbol = $2 AND timeframe = $3 AND is_closed = true
           ORDER BY open_time DESC LIMIT 500
         ) sub ORDER BY open_time ASC`,
        [this.exchange, this.options.symbol.toUpperCase(), tf],
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
    this.wsClient.on("kline", (raw: unknown) => {
      for (const result of this.parse(raw)) {
        void this.processCandle(result);
      }
    });

    this.wsClient.on("connected", () => {
      this.options.fastify.log.info(`Connected to ${this.source} WS`);
      void this.handleReconnect();
    });

    this.wsClient.on("disconnected", (code, reason) => {
      this.options.fastify.log.warn(
        `${this.source} WS disconnected: ${code} ${reason}`,
      );
    });

    this.wsClient.on("reconnecting", (attempt) => {
      this.options.fastify.log.info(
        `${this.source} WS reconnecting (attempt ${attempt})`,
      );
    });

    this.wsClient.on("error", (err) => {
      this.options.fastify.log.error(`${this.source} WS error: ${err.message}`);
    });
  }

  private async processCandle(result: NormalizationResult): Promise<void> {
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
      await this.backfill(this.options.symbol.toUpperCase(), tf);
    }
  }

  private async backfill(symbol: string, timeframe: string): Promise<void> {
    const lastTime = await this.candleStore.getLastCandleTime(symbol, timeframe);

    try {
      const candles =
        this.source === "bybit"
          ? await this.fetchBybitKlines(symbol, timeframe, lastTime)
          : await this.fetchBinanceKlines(symbol, timeframe, lastTime);

      let backfilled = 0;
      for (const candle of candles) {
        if (!candle.isClosed) continue;
        const inserted = await this.candleStore.persist(candle, symbol, timeframe);
        if (inserted) {
          this.wsServer.broadcast("candle:closed", candle, symbol, timeframe);
          backfilled++;
        }
      }

      if (backfilled > 0) {
        this.options.fastify.log.info(
          `Backfilled ${backfilled} candles for ${symbol}/${timeframe}`,
        );
      }
    } catch (err) {
      this.options.fastify.log.error(
        `Backfill failed for ${symbol}/${timeframe}: ${(err as Error).message}`,
      );
    }
  }

  private async fetchBinanceKlines(
    symbol: string,
    timeframe: string,
    lastTime: number | null,
  ): Promise<Candle[]> {
    const url = lastTime
      ? `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&startTime=${(lastTime + 1) * 1000}&limit=1000`
      : `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=500`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Backfill HTTP ${response.status}`);

    const klines = (await response.json()) as unknown[][];
    const nowSec = Date.now() / 1000;
    const duration = timeframeToDuration(timeframe);

    const candles: Candle[] = [];
    for (const k of klines) {
      if (!Array.isArray(k) || k.length < 6) continue;
      const time = Math.floor(Number(k[0]) / 1000);
      candles.push({
        time,
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
        // Binance returns the in-progress bucket as the last row; only treat a
        // bucket as closed once its window has fully elapsed.
        isClosed: time + duration <= nowSec,
      });
    }
    return candles;
  }

  private async fetchBybitKlines(
    symbol: string,
    timeframe: string,
    lastTime: number | null,
  ): Promise<Candle[]> {
    const interval = timeframeToBybitInterval(timeframe);
    const base = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=1000`;
    const url = lastTime ? `${base}&start=${(lastTime + 1) * 1000}` : base;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Backfill HTTP ${response.status}`);

    const json = (await response.json()) as {
      retCode?: number;
      retMsg?: string;
      result?: { list?: string[][] };
    };
    if (json.retCode !== 0) {
      throw new Error(`Bybit retCode ${json.retCode}: ${json.retMsg}`);
    }

    const list = json.result?.list ?? [];
    const nowSec = Date.now() / 1000;
    const duration = timeframeToDuration(timeframe);

    // Bybit returns newest-first; re-sort ascending. Each row is
    // [start, open, high, low, close, volume, turnover] (strings, start in ms).
    const candles: Candle[] = list
      .map((k) => {
        const time = Math.floor(Number(k[0]) / 1000);
        return {
          time,
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: Number(k[5]),
          isClosed: time + duration <= nowSec,
        };
      })
      .sort((a, b) => a.time - b.time);

    return candles;
  }
}
