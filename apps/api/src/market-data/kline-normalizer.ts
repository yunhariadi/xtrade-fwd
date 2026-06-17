import type { Candle } from "@ict-forward-lab/core";

export interface BinanceKlineEvent {
  e: "kline";
  E: number;
  s: string;
  k: {
    t: number; // kline start time (ms)
    T: number; // kline close time (ms)
    s: string; // symbol
    i: string; // interval (e.g., "5m")
    o: string; // open price
    h: string; // high price
    l: string; // low price
    c: string; // close price
    v: string; // volume
    x: boolean; // is this kline closed?
    q: string; // quote volume
    n: number; // number of trades
  };
}

export interface NormalizationResult {
  candle: Candle;
  symbol: string;
  timeframe: string;
}

/**
 * Normalize a Binance kline event to the application's Candle interface.
 * Returns null if the event is malformed.
 */
export function normalizeKline(event: unknown): NormalizationResult | null {
  // Validate structure
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  if (e.e !== "kline") return null;

  const k = (e as any).k;
  if (!k || typeof k !== "object") return null;

  // Validate required fields
  if (typeof k.t !== "number" || typeof k.x !== "boolean") return null;
  if (!k.o || !k.h || !k.l || !k.c || !k.v) return null;
  if (!k.i || !k.s) return null;

  const open = Number(k.o);
  const high = Number(k.h);
  const low = Number(k.l);
  const close = Number(k.c);
  const volume = Number(k.v);

  if ([open, high, low, close, volume].some(isNaN)) return null;

  return {
    candle: {
      time: Math.floor(k.t / 1000),
      open,
      high,
      low,
      close,
      volume,
      isClosed: k.x,
    },
    symbol: typeof e.s === "string" ? e.s : k.s,
    timeframe: k.i,
  };
}
