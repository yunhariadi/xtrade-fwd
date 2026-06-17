/**
 * Candle interface used at all application boundaries (API responses, chart rendering).
 * Time is expressed in Unix seconds to match Lightweight Charts' expected format.
 */
export interface Candle {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

/**
 * Raw database row shape returned by pg queries against the `candles` table.
 * PostgreSQL NUMERIC columns are returned as strings; TIMESTAMPTZ as string or Date
 * depending on pg driver configuration.
 */
export interface CandleRow {
  id: string | number;
  exchange: string;
  symbol: string;
  timeframe: string;
  open_time: string | Date;
  close_time: string | Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  is_closed: boolean;
  created_at: string | Date;
}
