import type { Pool } from "pg";
import { getMarketSource, getExchange } from "../market-data/market-source";
import { timeframeToBybitInterval, timeframeToDuration } from "../market-data/timeframe-utils";

export interface FetchOptions {
  symbol: string;
  timeframes: string[];
  startTime: number;  // Unix ms
  endTime: number;    // Unix ms
}

/** Normalized row ready for storage (exchange-agnostic). */
interface RawCandle {
  openMs: number;
  closeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class HistoricalFetcher {
  constructor(private pool: Pool) {}

  async fetchRange(options: FetchOptions): Promise<{ fetched: number; stored: number }> {
    let totalFetched = 0;
    let totalStored = 0;
    const source = getMarketSource();

    for (const tf of options.timeframes) {
      const result =
        source === "bybit"
          ? await this.fetchBybitTimeframe(options.symbol, tf, options.startTime, options.endTime)
          : await this.fetchBinanceTimeframe(options.symbol, tf, options.startTime, options.endTime);
      totalFetched += result.fetched;
      totalStored += result.stored;
    }

    return { fetched: totalFetched, stored: totalStored };
  }

  // --- Binance: paginate forward by close time -------------------------------
  private async fetchBinanceTimeframe(symbol: string, interval: string, startTime: number, endTime: number) {
    let fetched = 0;
    let stored = 0;
    let currentStart = startTime;

    while (currentStart < endTime) {
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=1000`;

      const klines = (await this.fetchJsonWithRetry(url)) as unknown[][];
      if (!Array.isArray(klines) || klines.length === 0) break;

      fetched += klines.length;

      for (const k of klines) {
        const inserted = await this.storeCandle(symbol, interval, {
          openMs: Number(k[0]),
          closeMs: Number(k[6]),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: Number(k[5]),
        });
        if (inserted) stored++;
      }

      const lastKline = klines[klines.length - 1];
      currentStart = Number(lastKline[6]) + 1; // close time + 1ms

      await new Promise((r) => setTimeout(r, 200));
    }

    return { fetched, stored };
  }

  // --- Bybit: paginate backward by `end` (Bybit returns newest-first) --------
  private async fetchBybitTimeframe(symbol: string, timeframe: string, startTime: number, endTime: number) {
    let fetched = 0;
    let stored = 0;
    const interval = timeframeToBybitInterval(timeframe);
    const durationMs = timeframeToDuration(timeframe) * 1000;
    const now = Date.now();
    let cursorEnd = endTime;

    while (cursorEnd > startTime) {
      const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&start=${startTime}&end=${cursorEnd}&limit=1000`;

      const json = (await this.fetchJsonWithRetry(url)) as {
        retCode?: number;
        retMsg?: string;
        result?: { list?: string[][] };
      };
      if (json.retCode !== 0) throw new Error(`Bybit retCode ${json.retCode}: ${json.retMsg}`);

      const list = json.result?.list ?? [];
      if (list.length === 0) break;

      fetched += list.length;

      // Each row: [start, open, high, low, close, volume, turnover] (start in ms).
      let oldestStart = Infinity;
      for (const row of list) {
        const openMs = Number(row[0]);
        if (openMs < oldestStart) oldestStart = openMs;
        const closeMs = openMs + durationMs;
        if (closeMs > now) continue; // skip the in-progress bucket

        const inserted = await this.storeCandle(symbol, timeframe, {
          openMs,
          closeMs,
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: Number(row[5]),
        });
        if (inserted) stored++;
      }

      if (!isFinite(oldestStart) || oldestStart <= startTime) break;
      cursorEnd = oldestStart - 1; // step the window back before the oldest bar

      await new Promise((r) => setTimeout(r, 200));
    }

    return { fetched, stored };
  }

  private async fetchJsonWithRetry(url: string, retries = 3): Promise<unknown> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        if (!res.ok) throw new Error(`Market API ${res.status}`);
        return await res.json();
      } catch (err) {
        if (attempt === retries - 1) throw err;
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
    return [];
  }

  private async storeCandle(symbol: string, timeframe: string, c: RawCandle): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO candles (exchange, symbol, timeframe, open_time, close_time, open, high, low, close, volume, is_closed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
       ON CONFLICT (exchange, symbol, timeframe, open_time) DO NOTHING`,
      [
        getExchange(),
        symbol,
        timeframe,
        new Date(c.openMs).toISOString(),
        new Date(c.closeMs).toISOString(),
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
      ]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
