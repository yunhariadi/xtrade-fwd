import type { Pool } from "pg";
import type { Candle } from "@ict-forward-lab/core";
import { timeframeToDuration } from "./timeframe-utils";

export interface CandleStoreOptions {
  pool: Pool;
  exchange: string; // "binance"
}

export class CandleStore {
  constructor(private options: CandleStoreOptions) {}

  /**
   * Persist a closed candle. Returns true if inserted, false if already existed or not closed.
   * Only persists candles where isClosed === true (no-repaint rule).
   */
  async persist(candle: Candle, symbol: string, timeframe: string): Promise<boolean> {
    if (!candle.isClosed) return false;

    const openTime = new Date(candle.time * 1000).toISOString();
    const duration = timeframeToDuration(timeframe);
    const closeTime = new Date((candle.time + duration) * 1000).toISOString();

    const result = await this.options.pool.query(
      `INSERT INTO candles (exchange, symbol, timeframe, open_time, close_time, open, high, low, close, volume, is_closed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (exchange, symbol, timeframe, open_time) DO NOTHING`,
      [
        this.options.exchange,
        symbol.toUpperCase(),
        timeframe,
        openTime,
        closeTime,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
        true,
      ]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get the timestamp of the last persisted closed candle for a given symbol/timeframe.
   * Returns Unix seconds or null if no candles exist.
   */
  async getLastCandleTime(symbol: string, timeframe: string): Promise<number | null> {
    const result = await this.options.pool.query(
      `SELECT open_time FROM candles 
       WHERE exchange = $1 AND symbol = $2 AND timeframe = $3 AND is_closed = true
       ORDER BY open_time DESC LIMIT 1`,
      [this.options.exchange, symbol.toUpperCase(), timeframe]
    );

    if (result.rows.length === 0) return null;
    return Math.floor(new Date(result.rows[0].open_time).getTime() / 1000);
  }
}
