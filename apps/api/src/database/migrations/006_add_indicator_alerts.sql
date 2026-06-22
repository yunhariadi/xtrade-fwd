-- Extend price_alerts to support indicator-based alerts (FVG / OB / Liquidity / BoS).
-- A 'price' alert watches a single user-set level (the original behaviour).
-- An 'indicator' alert is snapshotted from a detected indicator instance at
-- create time: a 'level' indicator (Liquidity, BoS) reuses target_price; a
-- 'zone' indicator (FVG, OB) watches the band [price_low, price_high] and fires
-- on 'touch' (price enters the band) or 'cross' (price passes through it).
ALTER TABLE price_alerts
  ALTER COLUMN target_price DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'price',          -- 'price' | 'indicator'
  ADD COLUMN IF NOT EXISTS target_kind TEXT NOT NULL DEFAULT 'level',   -- 'level' | 'zone'
  ADD COLUMN IF NOT EXISTS price_low NUMERIC,                           -- zone lower bound
  ADD COLUMN IF NOT EXISTS price_high NUMERIC,                          -- zone upper bound
  ADD COLUMN IF NOT EXISTS trigger TEXT,                                -- 'touch' | 'cross' (zones)
  ADD COLUMN IF NOT EXISTS indicator_kind TEXT,                         -- 'fvg' | 'ob' | 'liquidity' | 'bos'
  ADD COLUMN IF NOT EXISTS indicator_id TEXT,                           -- source instance id (for context/expiry)
  ADD COLUMN IF NOT EXISTS indicator_direction TEXT,                    -- 'bullish' | 'bearish'
  ADD COLUMN IF NOT EXISTS timeframe TEXT;                              -- timeframe the indicator was detected on

CREATE INDEX IF NOT EXISTS idx_price_alerts_kind ON price_alerts(kind);
