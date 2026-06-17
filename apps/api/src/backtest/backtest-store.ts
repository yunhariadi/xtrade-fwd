import type { Pool } from "pg";
import type { BacktestResult, BacktestSummary } from "./types";

export class BacktestStore {
  constructor(private pool: Pool) {}

  async save(result: BacktestResult): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO backtest_results (symbol, start_time, end_time, config, trades, metrics, equity_curve)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        result.symbol,
        new Date(result.startTime).toISOString(),
        new Date(result.endTime).toISOString(),
        JSON.stringify(result.config),
        JSON.stringify(result.trades),
        JSON.stringify(result.metrics),
        JSON.stringify(result.equityCurve),
      ]
    );
    return String(res.rows[0].id);
  }

  async list(): Promise<BacktestSummary[]> {
    const res = await this.pool.query(
      `SELECT id, symbol, start_time, end_time, metrics, created_at FROM backtest_results ORDER BY created_at DESC LIMIT 50`
    );
    return res.rows.map(row => ({
      id: String(row.id),
      symbol: row.symbol,
      startTime: new Date(row.start_time).getTime(),
      endTime: new Date(row.end_time).getTime(),
      tradeCount: row.metrics?.totalTrades ?? 0,
      netPnl: row.metrics?.netPnl ?? 0,
      winRate: row.metrics?.winRate ?? 0,
      createdAt: new Date(row.created_at).getTime(),
    }));
  }

  async getById(id: string): Promise<BacktestResult | null> {
    const res = await this.pool.query(`SELECT * FROM backtest_results WHERE id = $1`, [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: String(row.id),
      symbol: row.symbol,
      startTime: new Date(row.start_time).getTime(),
      endTime: new Date(row.end_time).getTime(),
      config: row.config,
      trades: row.trades,
      metrics: row.metrics,
      equityCurve: row.equity_curve,
      createdAt: new Date(row.created_at).getTime(),
    };
  }
}
