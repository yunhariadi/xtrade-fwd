import type { Candle } from "@ict-forward-lab/core";
import { bybitIntervalToTimeframe } from "./timeframe-utils";
import type { NormalizationResult } from "./kline-normalizer";

/**
 * Normalize a Bybit v5 kline push to the application's Candle interface.
 *
 * A single Bybit message carries `data: [...]` (usually one entry). The symbol
 * lives in the topic ("kline.5.BTCUSDT"), and `confirm` is the no-repaint flag
 * (true once the candle has closed). Returns one result per valid data entry.
 */
export function normalizeBybitKline(message: unknown): NormalizationResult[] {
  if (!message || typeof message !== "object") return [];
  const m = message as Record<string, unknown>;

  const topic = typeof m.topic === "string" ? m.topic : "";
  if (!topic.startsWith("kline.") || !Array.isArray(m.data)) return [];

  // topic = "kline.<interval>.<SYMBOL>"
  const parts = topic.split(".");
  const symbol = parts[2];
  if (!symbol) return [];

  const results: NormalizationResult[] = [];

  for (const entry of m.data as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const k = entry as Record<string, unknown>;

    if (typeof k.start !== "number" || typeof k.confirm !== "boolean") continue;
    if (!k.open || !k.high || !k.low || !k.close) continue;
    if (typeof k.interval !== "string") continue;

    const open = Number(k.open);
    const high = Number(k.high);
    const low = Number(k.low);
    const close = Number(k.close);
    const volume = Number(k.volume ?? 0);

    if ([open, high, low, close, volume].some(isNaN)) continue;

    results.push({
      candle: {
        time: Math.floor(k.start / 1000),
        open,
        high,
        low,
        close,
        volume,
        isClosed: k.confirm,
      },
      symbol,
      timeframe: bybitIntervalToTimeframe(k.interval),
    });
  }

  return results;
}
