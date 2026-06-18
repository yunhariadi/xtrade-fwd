import type { CalibrationReport } from "@ict-forward-lab/strategies";

export interface CalibrationConfig {
  symbol: string;
  startDate: string; // ISO date "2024-01-01"
  endDate: string; // ISO date, exclusive upper bound
  /** Future 5m candles to look ahead when resolving each setup. Default 48 (4h). */
  horizonCandles: number;
  /** Reject derived setups whose reward:risk is below this. Default 1.5. */
  minRiskReward: number;
  /** Only sample bars inside London/New York killzones (where setups form). Default true. */
  killzonesOnly: boolean;
}

export interface CalibrationRunResult {
  symbol: string;
  startTime: number; // Unix ms
  endTime: number; // Unix ms
  config: CalibrationConfig;
  /** How many bars were scored and resolved into samples. */
  sampleCount: number;
  report: CalibrationReport;
  createdAt: number;
}

export type CalibrationStatus = "running" | "completed" | "failed";

/** A persisted calibration run; `report`/`sampleCount` fill in once completed. */
export interface CalibrationRunRecord {
  id: string;
  symbol: string;
  startTime: number; // Unix ms
  endTime: number; // Unix ms
  config: CalibrationConfig;
  status: CalibrationStatus;
  sampleCount: number | null;
  report: CalibrationReport | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CalibrationRunSummary {
  id: string;
  symbol: string;
  startTime: number;
  endTime: number;
  status: CalibrationStatus;
  sampleCount: number | null;
  /** Headline win rate once completed, else null. */
  winRate: number | null;
  createdAt: number;
}
