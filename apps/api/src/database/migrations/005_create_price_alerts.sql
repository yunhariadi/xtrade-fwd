-- Create price_alerts table for user-defined price-cross alerts.
-- An alert fires when the live price crosses `target_price` in `direction`.
CREATE TABLE IF NOT EXISTS price_alerts (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL DEFAULT 'bybit',
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,        -- 'above' | 'below' | 'cross'
  target_price NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'triggered' | 'disabled'
  repeat BOOLEAN NOT NULL DEFAULT false, -- re-arm after firing instead of one-shot
  note TEXT,
  triggered_at TIMESTAMPTZ,
  triggered_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_symbol ON price_alerts(symbol);
CREATE INDEX IF NOT EXISTS idx_price_alerts_status ON price_alerts(status);
