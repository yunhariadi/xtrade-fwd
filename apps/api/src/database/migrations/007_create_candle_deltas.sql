-- Per-candle taker buy/sell volume aggregated live from the exchange trade
-- stream (Bybit publicTrade). Bybit klines carry no taker-buy split, so this
-- data cannot be backfilled after the fact — it exists to let a future
-- CVD/delta signal be calibrated against real recorded history.
CREATE TABLE IF NOT EXISTS candle_deltas (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  buy_volume NUMERIC NOT NULL,
  sell_volume NUMERIC NOT NULL,
  trade_count INTEGER NOT NULL,
  -- True when the bucket may be missing trades (stream connected mid-bucket,
  -- dropped during it, or the process stopped before the window elapsed).
  -- Exclude these rows from calibration.
  is_partial BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exchange, symbol, timeframe, open_time)
);

CREATE INDEX IF NOT EXISTS idx_candle_deltas_symbol_timeframe_time
  ON candle_deltas (symbol, timeframe, open_time ASC);
