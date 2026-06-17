import type { Pool } from "pg";
import type { ForwardTrade, TradeStatus } from "./types";

export interface TradeFilters {
  status?: TradeStatus;
  symbol?: string;
  side?: "long" | "short";
  limit?: number;
}

interface TradeRow {
  id: string;
  signal_id: string;
  strategy_name: string;
  strategy_version: string;
  exchange: string;
  symbol: string;
  side: string;
  status: string;
  entry_time: string | Date | null;
  entry_price: string | null;
  stop_loss: string;
  take_profit: string;
  exit_time: string | Date | null;
  exit_price: string | null;
  exit_reason: string | null;
  risk_amount: string | null;
  position_size: string | null;
  pnl: string | null;
  pnl_percent: string | null;
  rr_result: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function rowToTrade(row: TradeRow): ForwardTrade {
  return {
    id: String(row.id),
    signalId: row.signal_id,
    strategyName: row.strategy_name,
    strategyVersion: row.strategy_version,
    exchange: row.exchange,
    symbol: row.symbol,
    side: row.side as "long" | "short",
    status: row.status as ForwardTrade["status"],
    entryTime: row.entry_time ? new Date(row.entry_time).getTime() : undefined,
    entryPrice: row.entry_price ? Number(row.entry_price) : undefined,
    stopLoss: Number(row.stop_loss),
    takeProfit: Number(row.take_profit),
    exitTime: row.exit_time ? new Date(row.exit_time).getTime() : undefined,
    exitPrice: row.exit_price ? Number(row.exit_price) : undefined,
    exitReason: row.exit_reason as ForwardTrade["exitReason"],
    riskAmount: row.risk_amount ? Number(row.risk_amount) : 0,
    positionSize: row.position_size ? Number(row.position_size) : 0,
    pnl: row.pnl ? Number(row.pnl) : undefined,
    pnlPercent: row.pnl_percent ? Number(row.pnl_percent) : undefined,
    rrResult: row.rr_result ? Number(row.rr_result) : undefined,
    notes: row.notes ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export class TradeStore {
  constructor(private pool: Pool) {}

  async create(trade: ForwardTrade): Promise<ForwardTrade> {
    const result = await this.pool.query<TradeRow>(
      `INSERT INTO forward_trades (
        signal_id, strategy_name, strategy_version, exchange, symbol, side, status,
        entry_time, entry_price, stop_loss, take_profit, exit_time, exit_price,
        exit_reason, risk_amount, position_size, pnl, pnl_percent, rr_result,
        notes, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23
      ) RETURNING *`,
      [
        trade.signalId,
        trade.strategyName,
        trade.strategyVersion,
        trade.exchange,
        trade.symbol,
        trade.side,
        trade.status,
        trade.entryTime ? new Date(trade.entryTime).toISOString() : null,
        trade.entryPrice ?? null,
        trade.stopLoss,
        trade.takeProfit,
        trade.exitTime ? new Date(trade.exitTime).toISOString() : null,
        trade.exitPrice ?? null,
        trade.exitReason ?? null,
        trade.riskAmount,
        trade.positionSize,
        trade.pnl ?? null,
        trade.pnlPercent ?? null,
        trade.rrResult ?? null,
        trade.notes ?? null,
        trade.metadata ? JSON.stringify(trade.metadata) : null,
        new Date(trade.createdAt).toISOString(),
        new Date(trade.updatedAt).toISOString(),
      ],
    );

    return rowToTrade(result.rows[0]);
  }

  async update(trade: ForwardTrade): Promise<ForwardTrade> {
    const result = await this.pool.query<TradeRow>(
      `UPDATE forward_trades SET
        status = $1, entry_time = $2, entry_price = $3, exit_time = $4,
        exit_price = $5, exit_reason = $6, pnl = $7, pnl_percent = $8,
        rr_result = $9, notes = $10, metadata = $11, updated_at = $12
      WHERE id = $13 RETURNING *`,
      [
        trade.status,
        trade.entryTime ? new Date(trade.entryTime).toISOString() : null,
        trade.entryPrice ?? null,
        trade.exitTime ? new Date(trade.exitTime).toISOString() : null,
        trade.exitPrice ?? null,
        trade.exitReason ?? null,
        trade.pnl ?? null,
        trade.pnlPercent ?? null,
        trade.rrResult ?? null,
        trade.notes ?? null,
        trade.metadata ? JSON.stringify(trade.metadata) : null,
        new Date(trade.updatedAt).toISOString(),
        trade.id,
      ],
    );

    return rowToTrade(result.rows[0]);
  }

  async getById(id: string): Promise<ForwardTrade | null> {
    const result = await this.pool.query<TradeRow>(
      `SELECT * FROM forward_trades WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return rowToTrade(result.rows[0]);
  }

  async getAll(filters?: TradeFilters): Promise<ForwardTrade[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters?.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters?.symbol) {
      conditions.push(`symbol = $${paramIdx++}`);
      params.push(filters.symbol);
    }
    if (filters?.side) {
      conditions.push(`side = $${paramIdx++}`);
      params.push(filters.side);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit ? Math.min(filters.limit, 500) : 100;

    const result = await this.pool.query<TradeRow>(
      `SELECT * FROM forward_trades ${where} ORDER BY created_at DESC LIMIT $${paramIdx}`,
      [...params, limit],
    );

    return result.rows.map(rowToTrade);
  }

  async getOpenTrades(): Promise<ForwardTrade[]> {
    const result = await this.pool.query<TradeRow>(
      `SELECT * FROM forward_trades WHERE status IN ('pending', 'active') ORDER BY created_at ASC`,
    );
    return result.rows.map(rowToTrade);
  }

  async getTodayTradeCount(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM forward_trades WHERE created_at >= (now() AT TIME ZONE 'UTC')::date`,
    );
    return Number(result.rows[0].count);
  }
}
