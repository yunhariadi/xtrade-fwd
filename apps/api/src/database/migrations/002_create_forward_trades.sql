-- Create forward_trades table for virtual trade execution tracking
CREATE TABLE IF NOT EXISTS forward_trades (
  id BIGSERIAL PRIMARY KEY,
  signal_id TEXT NOT NULL,
  strategy_name TEXT NOT NULL DEFAULT 'ict-model-2022',
  strategy_version TEXT DEFAULT '1.0.0',
  exchange TEXT NOT NULL DEFAULT 'binance',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  status TEXT NOT NULL,
  entry_time TIMESTAMPTZ,
  entry_price NUMERIC,
  stop_loss NUMERIC NOT NULL,
  take_profit NUMERIC NOT NULL,
  exit_time TIMESTAMPTZ,
  exit_price NUMERIC,
  exit_reason TEXT,
  risk_amount NUMERIC,
  position_size NUMERIC,
  pnl NUMERIC,
  pnl_percent NUMERIC,
  rr_result NUMERIC,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forward_trades_status ON forward_trades(status);
CREATE INDEX IF NOT EXISTS idx_forward_trades_symbol ON forward_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_forward_trades_created_at ON forward_trades(created_at);
