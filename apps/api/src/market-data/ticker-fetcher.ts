import type { MarketSource } from "./market-source";

/** Normalised live ticker, source-agnostic. Prices/volumes absolute. */
export interface Ticker {
  symbol: string;
  source: MarketSource;
  /** Last traded price. */
  last: number;
  /** Best bid / ask, or null when the source's REST doesn't provide them. */
  bid: number | null;
  ask: number | null;
  /** Absolute 24h change (last − price 24h ago). */
  change: number;
  /** 24h change as a percent (e.g. 1.23 = +1.23%). */
  changePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  /** Unix seconds the ticker was fetched. */
  time: number;
}

/**
 * Fetch a live ticker from the active exchange REST. Bybit's tickers endpoint
 * carries bid/ask; Binance's 24hr endpoint does not, so those come back null.
 * One HTTP call; throws on a non-OK response or an empty result.
 */
export async function fetchTicker(source: MarketSource, symbol: string): Promise<Ticker> {
  const sym = symbol.toUpperCase();
  const time = Math.floor(Date.now() / 1000);
  return source === "bybit" ? fetchBybit(sym, time) : fetchBinance(sym, time);
}

async function fetchBybit(symbol: string, time: number): Promise<Ticker> {
  const url = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ticker HTTP ${res.status}`);
  const json = (await res.json()) as {
    retCode?: number;
    retMsg?: string;
    result?: { list?: Record<string, string>[] };
  };
  if (json.retCode !== 0) throw new Error(`Bybit retCode ${json.retCode}: ${json.retMsg}`);
  const t = json.result?.list?.[0];
  if (!t) throw new Error(`No ticker for ${symbol}`);

  const last = Number(t.lastPrice);
  const prev = Number(t.prevPrice24h);
  return {
    symbol,
    source: "bybit",
    last,
    bid: t.bid1Price != null ? Number(t.bid1Price) : null,
    ask: t.ask1Price != null ? Number(t.ask1Price) : null,
    change: last - prev,
    // Bybit returns price24hPcnt as a decimal fraction (0.0123 = 1.23%).
    changePercent: Number(t.price24hPcnt) * 100,
    high24h: Number(t.highPrice24h),
    low24h: Number(t.lowPrice24h),
    volume24h: Number(t.volume24h),
    time,
  };
}

async function fetchBinance(symbol: string, time: number): Promise<Ticker> {
  const url = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ticker HTTP ${res.status}`);
  const t = (await res.json()) as Record<string, string>;
  if (t.lastPrice == null) throw new Error(`No ticker for ${symbol}`);

  return {
    symbol,
    source: "binance",
    last: Number(t.lastPrice),
    // The 24hr endpoint carries no book; bid/ask would need a second call.
    bid: null,
    ask: null,
    change: Number(t.priceChange),
    changePercent: Number(t.priceChangePercent),
    high24h: Number(t.highPrice),
    low24h: Number(t.lowPrice),
    volume24h: Number(t.volume),
    time,
  };
}
