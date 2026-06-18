export type MarketSource = "binance" | "bybit";

/**
 * Active market-data source, from MARKET_SOURCE (default "binance").
 * Single source of truth for both the live feed and historical backfill so the
 * `exchange` column stays consistent across writes and reads.
 */
export function getMarketSource(): MarketSource {
  return (process.env.MARKET_SOURCE ?? "binance").toLowerCase() === "bybit"
    ? "bybit"
    : "binance";
}

/** Exchange label stored in / queried from the candles table. */
export function getExchange(): MarketSource {
  return getMarketSource();
}
