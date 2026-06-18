/** Convert timeframe string to duration in seconds */
export function timeframeToDuration(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60,
    "3m": 180,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "2h": 7200,
    "4h": 14400,
    "6h": 21600,
    "8h": 28800,
    "12h": 43200,
    "1d": 86400,
    "1w": 604800,
  };
  return map[tf] ?? 300; // default to 5m if unknown
}

/** App timeframe (e.g. "5m", "1h") → Bybit kline interval token (e.g. "5", "60"). */
export function timeframeToBybitInterval(tf: string): string {
  const map: Record<string, string> = {
    "1m": "1",
    "3m": "3",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "6h": "360",
    "12h": "720",
    "1d": "D",
    "1w": "W",
  };
  return map[tf] ?? "5";
}

/** Bybit kline interval token (e.g. "5", "60") → app timeframe (e.g. "5m", "1h"). */
export function bybitIntervalToTimeframe(interval: string): string {
  const map: Record<string, string> = {
    "1": "1m",
    "3": "3m",
    "5": "5m",
    "15": "15m",
    "30": "30m",
    "60": "1h",
    "120": "2h",
    "240": "4h",
    "360": "6h",
    "720": "12h",
    D: "1d",
    W: "1w",
  };
  return map[interval] ?? interval;
}
