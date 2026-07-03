import type { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import type { Candle } from "@ict-forward-lab/core";
import { BinanceWsClient } from "./binance-ws-client";
import { BybitWsClient, type BybitTradeMessage } from "./bybit-ws-client";
import { DeltaRecorder } from "./delta-recorder";
import { normalizeKline, type NormalizationResult } from "./kline-normalizer";
import { normalizeBybitKline } from "./bybit-kline-normalizer";
import { timeframeToBybitInterval, timeframeToDuration } from "./timeframe-utils";
import { getMarketSource, type MarketSource } from "./market-source";
import { CandleStore } from "./candle-store";
import { WsServer } from "./ws-server";
import { FvgTracker } from "../fvg/fvg-tracker";
import { StrategyRunner } from "../strategy/strategy-runner";
import { AlertStore, AlertMonitor } from "../alerts";
import { setWsServer } from "./get-ws-server";

interface SourceClient {
  connect(): void;
  disconnect(): void;
  on(event: "kline", listener: (raw: unknown) => void): void;
  on(event: "trade", listener: (raw: unknown) => void): void;
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

/**
 * The forward-test engine simulates fills/exits/timeouts exclusively on this
 * timeframe. Feeding it candles from higher timeframes is unsound: a live 4h/1d
 * candle's high/low includes price action from BEFORE a trade existed (phantom
 * fills), and every extra timeframe's close would inflate the per-trade candle
 * counter that `tradeTimeoutCandles` is denominated in (5m bars).
 */
const EXECUTION_TIMEFRAME = "5m";

export class MarketDataService {
  private source: MarketSource;
  private exchange: string;
  private wsClient: SourceClient;
  private parse: (raw: unknown) => NormalizationResult[];
  private candleStore: CandleStore;
  private wsServer: WsServer;
  private fvgTracker: FvgTracker;
  private strategyRunner: StrategyRunner;
  private alertStore: AlertStore;
  private alertMonitor: AlertMonitor;
  // Records taker buy/sell volume per 5m bar from the Bybit trade stream, for
  // future CVD/delta calibration. Bybit only — klines carry no taker split.
  private deltaRecorder: DeltaRecorder | null = null;

  constructor(private options: MarketDataServiceOptions) {
    this.source = getMarketSource();
    this.exchange = this.source;

    const symbol = options.symbol.toUpperCase();

    if (this.source === "bybit") {
      const url =
        process.env.BYBIT_WS_URL ?? "wss://stream.bybit.com/v5/public/linear";
      const topics = options.timeframes.map(
        (tf) => `kline.${timeframeToBybitInterval(tf)}.${symbol}`,
      );
      topics.push(`publicTrade.${symbol}`);
      this.deltaRecorder = new DeltaRecorder({
        pool: options.pool,
        exchange: this.exchange,
        symbol,
        timeframe: EXECUTION_TIMEFRAME,
        bucketSeconds: timeframeToDuration(EXECUTION_TIMEFRAME),
        onError: (err) =>
          options.fastify.log.error(`Delta flush failed: ${err.message}`),
      });
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

    this.alertStore = new AlertStore({
      pool: options.pool,
      exchange: this.exchange,
    });
    const webhookUrl = process.env.ALERT_WEBHOOK_URL?.trim();
    this.alertMonitor = new AlertMonitor({
      store: this.alertStore,
      wsServer: this.wsServer,
      logger: options.fastify.log,
      webhook: webhookUrl
        ? { url: webhookUrl, secret: process.env.ALERT_WEBHOOK_SECRET?.trim() || undefined }
        : undefined,
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

    // Warm the alert monitor's cache with any active alerts from a prior run.
    await this.alertMonitor.reload();

    this.options.fastify.log.info("MarketDataService started");
  }

  async stop(): Promise<void> {
    this.wsClient.disconnect();
    // Persist the in-progress delta bucket (as partial) so its trades survive
    // a restart; the summing upsert merges the post-restart half back in.
    await this.deltaRecorder?.flushOpen();
    this.options.fastify.log.info("MarketDataService stopped");
  }

  getFvgTracker(): FvgTracker {
    return this.fvgTracker;
  }

  getStrategyRunner(): StrategyRunner {
    return this.strategyRunner;
  }

  getAlertStore(): AlertStore {
    return this.alertStore;
  }

  getAlertMonitor(): AlertMonitor {
    return this.alertMonitor;
  }

  private setupEventHandlers(): void {
    this.wsClient.on("kline", (raw: unknown) => {
      for (const result of this.parse(raw)) {
        void this.processCandle(result);
      }
    });

    if (this.deltaRecorder) {
      const recorder = this.deltaRecorder;
      const symbol = this.options.symbol.toUpperCase();
      this.wsClient.on("trade", (raw: unknown) => {
        const msg = raw as BybitTradeMessage;
        for (const t of msg.data) {
          if (t.s !== symbol) continue;
          recorder.onTrade({ timeMs: t.T, side: t.S, size: Number(t.v) });
        }
      });
    }

    this.wsClient.on("connected", () => {
      this.options.fastify.log.info(`Connected to ${this.source} WS`);
      // Klines are backfilled below, but the trade stream has no history API —
      // buckets spanning the gap can't be completed, so flag them.
      this.deltaRecorder?.onStreamGap();
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

    // Feed the latest price to the alert monitor on every tick (open + closed
    // candles both carry a fresh close), so price-cross alerts fire intra-bar.
    void this.alertMonitor.onPrice(symbol, candle.close);

    if (candle.isClosed) {
      await this.candleStore.persist(candle, symbol, timeframe);
      this.wsServer.broadcast("candle:closed", candle, symbol, timeframe);
      const mitigated = this.fvgTracker.onCandleClosed(candle, symbol, timeframe);
      // A mitigated FVG zone invalidates any alert bound to it — auto-expire.
      if (mitigated.length > 0) {
        void this.alertMonitor.expireFvgZones(symbol, timeframe, mitigated);
      }

      const signal = await this.strategyRunner.onCandleClosed(candle, symbol, timeframe);

      // Forward-test engine: evaluate the closing candle, forward the signal,
      // then check timeouts. Only the execution timeframe drives the engine —
      // see EXECUTION_TIMEFRAME.
      if (timeframe === EXECUTION_TIMEFRAME) {
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
      }
    } else {
      this.wsServer.broadcast("candle:update", candle, symbol, timeframe);

      // Forward-test engine: check entry/exit on every tick of the execution
      // timeframe only. A live higher-timeframe candle's high/low spans hours
      // and can predate the trade — using it would create phantom fills.
      if (timeframe === EXECUTION_TIMEFRAME) {
        try {
          const engine = this.options.fastify.forwardTestEngine;
          if (engine) await engine.onTick(candle);
        } catch {
          // Engine may not be initialized yet
        }
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
