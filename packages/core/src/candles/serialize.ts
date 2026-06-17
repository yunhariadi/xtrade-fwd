import { Candle, CandleRow } from "../types/candle";

/**
 * Convert a raw database row to a Candle object.
 * - open_time (TIMESTAMPTZ string/Date) → Unix seconds
 * - NUMERIC columns (string) → JavaScript number
 * - is_closed → isClosed (rename for JS convention)
 */
export function dbRowToCandle(row: CandleRow): Candle {
  return {
    time: Math.floor(new Date(row.open_time as string).getTime() / 1000),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    isClosed: row.is_closed,
  };
}

/**
 * Serialize a Candle object to a JSON string.
 */
export function candleToJson(candle: Candle): string {
  return JSON.stringify(candle);
}

/**
 * Deserialize a JSON string back to a Candle object.
 */
export function jsonToCandle(json: string): Candle {
  return JSON.parse(json) as Candle;
}
