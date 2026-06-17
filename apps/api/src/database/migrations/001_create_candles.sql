-- Create candles table for storing OHLCV time-series data
CREATE TABLE IF NOT EXISTS candles (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  close_time TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  is_closed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exchange, symbol, timeframe, open_time)
);

-- Create index for common query pattern (symbol + timeframe + time ordering)
CREATE INDEX IF NOT EXISTS idx_candles_symbol_timeframe_time
  ON candles (symbol, timeframe, open_time ASC);
