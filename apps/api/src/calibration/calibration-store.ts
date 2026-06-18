import type { Pool } from "pg";
import type { CalibrationReport } from "@ict-forward-lab/strategies";
import type {
  CalibrationConfig,
  CalibrationRunRecord,
  CalibrationRunSummary,
} from "./types";

/** Persists background calibration runs in the `calibration_runs` table. */
export class CalibrationStore {
  constructor(private pool: Pool) {}

  /** Insert a run in the `running` state and return its id. */
  async create(config: CalibrationConfig, startMs: number, endMs: number): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO calibration_runs (symbol, start_time, end_time, config, status)
       VALUES ($1, $2, $3, $4, 'running') RETURNING id`,
      [
        config.symbol,
        new Date(startMs).toISOString(),
        new Date(endMs).toISOString(),
        JSON.stringify(config),
      ]
    );
    return String(res.rows[0].id);
  }

  async markCompleted(id: string, sampleCount: number, report: CalibrationReport): Promise<void> {
    await this.pool.query(
      `UPDATE calibration_runs
       SET status = 'completed', sample_count = $2, report = $3, updated_at = now()
       WHERE id = $1`,
      [id, sampleCount, JSON.stringify(report)]
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE calibration_runs
       SET status = 'failed', error = $2, updated_at = now()
       WHERE id = $1`,
      [id, error]
    );
  }

  async list(): Promise<CalibrationRunSummary[]> {
    const res = await this.pool.query(
      `SELECT id, symbol, start_time, end_time, status, sample_count, report, created_at
       FROM calibration_runs ORDER BY created_at DESC LIMIT 50`
    );
    return res.rows.map((row) => ({
      id: String(row.id),
      symbol: row.symbol,
      startTime: new Date(row.start_time).getTime(),
      endTime: new Date(row.end_time).getTime(),
      status: row.status,
      sampleCount: row.sample_count ?? null,
      winRate: row.report?.winRate ?? null,
      createdAt: new Date(row.created_at).getTime(),
    }));
  }

  async getById(id: string): Promise<CalibrationRunRecord | null> {
    const res = await this.pool.query(`SELECT * FROM calibration_runs WHERE id = $1`, [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: String(row.id),
      symbol: row.symbol,
      startTime: new Date(row.start_time).getTime(),
      endTime: new Date(row.end_time).getTime(),
      config: row.config,
      status: row.status,
      sampleCount: row.sample_count ?? null,
      report: row.report ?? null,
      error: row.error ?? null,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }
}
