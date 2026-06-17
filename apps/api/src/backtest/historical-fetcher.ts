import type { Pool } from "pg";

export interface FetchOptions {
  symbol: string;
  timeframes: string[];
  startTime: number;  // Unix ms
  endTime: number;    // Unix ms
}

export class HistoricalFetcher {
  constructor(private pool: Pool) {}

  async fetchRange(options: FetchOptions): Promise<{ fetched: number; stored: number }> {
    let totalFetched = 0;
    let totalStored = 0;

    for (const tf of options.timeframes) {
      const result = await this.fetchTimeframe(options.symbol, tf, options.startTime, options.endTime);
      totalFetched += result.fetched;
      totalStored += result.stored;
    }

    return { fetched: totalFetched, stored: totalStored };
  }

  private async fetchTimeframe(symbol: string, interval: string, startTime: number, endTime: number) {
    let fetched = 0;
    let stored = 0;
    let currentStart = startTime;

    while (currentStart < endTime) {
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=1000`;

      const klines = await this.fetchWithRetry(url);
      if (klines.length === 0) break;

      fetched += klines.length;

      // Store in DB
      for (const k of klines) {
        const inserted = await this.storeCandle(symbol, interval, k);
        if (inserted) stored++;
      }

      // Move start to after the last candle
      const lastKline = klines[klines.length - 1];
      currentStart = Number(lastKline[6]) + 1; // close time + 1ms

      // Rate limit: small delay between requests
      await new Promise(r => setTimeout(r, 200));
    }

    return { fetched, stored };
  }

  private async fetchWithRetry(url: string, retries = 3): Promise<unknown[][]> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 429 || res.status >= 500) {
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (!res.ok) throw new Error(`Binance API ${res.status}`);
        return (await res.json()) as unknown[][];
      } catch (err) {
        if (attempt === retries - 1) throw err;
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    return [];
  }

  private async storeCandle(symbol: string, timeframe: string, k: unknown[]): Promise<boolean> {
    const openTime = new Date(Number(k[0])).toISOString();
    const closeTime = new Date(Number(k[6])).toISOString();

    const result = await this.pool.query(
      `INSERT INTO candles (exchange, symbol, timeframe, open_time, close_time, open, high, low, close, volume, is_closed)
       VALUES ('binance', $1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       ON CONFLICT (exchange, symbol, timeframe, open_time) DO NOTHING`,
      [symbol, timeframe, openTime, closeTime, Number(k[1]), Number(k[2]), Number(k[3]), Number(k[4]), Number(k[5])]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
