import type { Pool } from "pg";

export interface DeltaTrade {
  timeMs: number; // trade time (ms)
  side: "Buy" | "Sell"; // taker side
  size: number; // base-asset size
}

export interface DeltaRecorderOptions {
  pool: Pool;
  exchange: string;
  symbol: string;
  timeframe: string; // label written to candle_deltas, e.g. "5m"
  bucketSeconds: number; // bucket width matching the timeframe, e.g. 300
  onError?: (err: Error) => void;
}

interface Bucket {
  openTime: number; // Unix seconds, aligned to bucketSeconds
  buyVolume: number;
  sellVolume: number;
  tradeCount: number;
  partial: boolean;
}

/**
 * Aggregates taker buy/sell volume from a live trade stream into
 * candle-aligned buckets and persists each bucket when the next one starts.
 *
 * Completeness tracking: a bucket that may be missing trades — the stream
 * (re)connected mid-window, or the process stopped before the window elapsed —
 * is written with is_partial = true so calibration can exclude it. The upsert
 * SUMS volumes on conflict, so a restart within one window combines both
 * halves of the bucket (still flagged partial, since the gap between the
 * flush and the reconnect is unrecorded).
 */
export class DeltaRecorder {
  private bucket: Bucket | null = null;
  // The first bucket after every (re)connect started mid-window (or we can't
  // prove it didn't), so it is flagged partial.
  private nextBucketPartial = true;

  constructor(private options: DeltaRecorderOptions) {}

  /**
   * Note a stream gap (disconnect or fresh connect): the in-progress bucket
   * and the next one to open can no longer be proven complete.
   */
  onStreamGap(): void {
    if (this.bucket) this.bucket.partial = true;
    this.nextBucketPartial = true;
  }

  onTrade(trade: DeltaTrade): void {
    const { bucketSeconds } = this.options;
    const openTime =
      Math.floor(trade.timeMs / 1000 / bucketSeconds) * bucketSeconds;

    if (this.bucket && openTime > this.bucket.openTime) {
      void this.flush(this.bucket);
      this.bucket = null;
    }

    if (!this.bucket) {
      this.bucket = {
        openTime,
        buyVolume: 0,
        sellVolume: 0,
        tradeCount: 0,
        partial: this.nextBucketPartial,
      };
      this.nextBucketPartial = false;
    }

    // Late trade for an already-flushed bucket — drop it (Bybit pushes are
    // ordered, so this only happens around reconnect replays).
    if (openTime < this.bucket.openTime) return;

    if (trade.side === "Buy") {
      this.bucket.buyVolume += trade.size;
    } else {
      this.bucket.sellVolume += trade.size;
    }
    this.bucket.tradeCount += 1;
  }

  /**
   * Persist the in-progress bucket (call on shutdown). Its window has not
   * elapsed, so it is written as partial; a restart within the same window
   * merges into it via the summing upsert.
   */
  async flushOpen(): Promise<void> {
    if (!this.bucket) return;
    this.bucket.partial = true;
    const bucket = this.bucket;
    this.bucket = null;
    await this.flush(bucket);
  }

  private async flush(bucket: Bucket): Promise<void> {
    try {
      await this.options.pool.query(
        `INSERT INTO candle_deltas
           (exchange, symbol, timeframe, open_time, buy_volume, sell_volume, trade_count, is_partial)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (exchange, symbol, timeframe, open_time) DO UPDATE SET
           buy_volume = candle_deltas.buy_volume + EXCLUDED.buy_volume,
           sell_volume = candle_deltas.sell_volume + EXCLUDED.sell_volume,
           trade_count = candle_deltas.trade_count + EXCLUDED.trade_count,
           is_partial = candle_deltas.is_partial OR EXCLUDED.is_partial`,
        [
          this.options.exchange,
          this.options.symbol.toUpperCase(),
          this.options.timeframe,
          new Date(bucket.openTime * 1000).toISOString(),
          bucket.buyVolume,
          bucket.sellVolume,
          bucket.tradeCount,
          bucket.partial,
        ],
      );
    } catch (err) {
      this.options.onError?.(err as Error);
    }
  }
}
