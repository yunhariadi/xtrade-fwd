-- Stores score-calibration replay runs. Runs execute in the background, so each
-- row tracks status (running | completed | failed) and is filled in on completion.
CREATE TABLE IF NOT EXISTS calibration_runs (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  sample_count INTEGER,
  report JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calibration_runs_created_at
  ON calibration_runs (created_at DESC);
