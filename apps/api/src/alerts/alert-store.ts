import type { Pool } from "pg";
import {
  dbRowToAlert,
  type CreatePriceAlertInput,
  type CreateIndicatorAlertInput,
  type PriceAlert,
  type UpdatePriceAlertInput,
} from "./types";
import type { ResolvedIndicatorTarget } from "./indicator-resolver";

export interface AlertStoreOptions {
  pool: Pool;
  exchange: string;
}

/**
 * Postgres-backed CRUD for price alerts. The monitor keeps its own in-memory
 * cache of active alerts for fast tick evaluation; this store is the durable
 * source of truth and survives restarts.
 */
export class AlertStore {
  constructor(private options: AlertStoreOptions) {}

  async create(input: CreatePriceAlertInput): Promise<PriceAlert> {
    const result = await this.options.pool.query(
      `INSERT INTO price_alerts
         (exchange, symbol, kind, target_kind, direction, target_price, repeat, note)
       VALUES ($1, $2, 'price', 'level', $3, $4, $5, $6)
       RETURNING *`,
      [
        this.options.exchange,
        input.symbol.toUpperCase(),
        input.direction,
        input.targetPrice,
        input.repeat ?? false,
        input.note ?? null,
      ],
    );
    return dbRowToAlert(result.rows[0]);
  }

  /** Persist an indicator alert from its create-time snapshotted target. */
  async createIndicator(
    input: CreateIndicatorAlertInput,
    resolved: ResolvedIndicatorTarget,
  ): Promise<PriceAlert> {
    const result = await this.options.pool.query(
      `INSERT INTO price_alerts
         (exchange, symbol, kind, target_kind, direction, target_price,
          price_low, price_high, trigger, indicator_kind, indicator_id,
          indicator_direction, timeframe, repeat, note)
       VALUES ($1, $2, 'indicator', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        this.options.exchange,
        input.symbol.toUpperCase(),
        resolved.targetKind,
        resolved.direction,
        resolved.targetPrice,
        resolved.priceLow,
        resolved.priceHigh,
        resolved.trigger,
        input.indicatorKind,
        input.indicatorId,
        resolved.indicatorDirection,
        input.timeframe,
        input.repeat ?? false,
        input.note ?? null,
      ],
    );
    return dbRowToAlert(result.rows[0]);
  }

  async list(symbol?: string): Promise<PriceAlert[]> {
    const result = symbol
      ? await this.options.pool.query(
          `SELECT * FROM price_alerts WHERE exchange = $1 AND symbol = $2 ORDER BY created_at DESC`,
          [this.options.exchange, symbol.toUpperCase()],
        )
      : await this.options.pool.query(
          `SELECT * FROM price_alerts WHERE exchange = $1 ORDER BY created_at DESC`,
          [this.options.exchange],
        );
    return result.rows.map(dbRowToAlert);
  }

  /** Active (armed) alerts for the live monitor cache. */
  async listActive(): Promise<PriceAlert[]> {
    const result = await this.options.pool.query(
      `SELECT * FROM price_alerts WHERE exchange = $1 AND status = 'active'`,
      [this.options.exchange],
    );
    return result.rows.map(dbRowToAlert);
  }

  async get(id: number): Promise<PriceAlert | null> {
    const result = await this.options.pool.query(
      `SELECT * FROM price_alerts WHERE id = $1 AND exchange = $2`,
      [id, this.options.exchange],
    );
    return result.rows.length ? dbRowToAlert(result.rows[0]) : null;
  }

  async update(id: number, input: UpdatePriceAlertInput): Promise<PriceAlert | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (input.direction !== undefined) {
      sets.push(`direction = $${i++}`);
      values.push(input.direction);
    }
    if (input.targetPrice !== undefined) {
      sets.push(`target_price = $${i++}`);
      values.push(input.targetPrice);
    }
    if (input.status !== undefined) {
      sets.push(`status = $${i++}`);
      values.push(input.status);
    }
    if (input.repeat !== undefined) {
      sets.push(`repeat = $${i++}`);
      values.push(input.repeat);
    }
    if (input.note !== undefined) {
      sets.push(`note = $${i++}`);
      values.push(input.note);
    }

    if (sets.length === 0) return this.get(id);

    sets.push(`updated_at = now()`);
    values.push(id, this.options.exchange);

    const result = await this.options.pool.query(
      `UPDATE price_alerts SET ${sets.join(", ")}
       WHERE id = $${i++} AND exchange = $${i}
       RETURNING *`,
      values,
    );
    return result.rows.length ? dbRowToAlert(result.rows[0]) : null;
  }

  /** Mark an alert as fired, recording the crossing price/time. */
  async markTriggered(id: number, price: number): Promise<PriceAlert | null> {
    const result = await this.options.pool.query(
      `UPDATE price_alerts
       SET status = 'triggered', triggered_at = now(), triggered_price = $2, updated_at = now()
       WHERE id = $1 AND exchange = $3
       RETURNING *`,
      [id, price, this.options.exchange],
    );
    return result.rows.length ? dbRowToAlert(result.rows[0]) : null;
  }

  /** Re-arm a repeating alert: record the fire but keep it active. */
  async recordRepeat(id: number, price: number): Promise<PriceAlert | null> {
    const result = await this.options.pool.query(
      `UPDATE price_alerts
       SET triggered_at = now(), triggered_price = $2, updated_at = now()
       WHERE id = $1 AND exchange = $3
       RETURNING *`,
      [id, price, this.options.exchange],
    );
    return result.rows.length ? dbRowToAlert(result.rows[0]) : null;
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.options.pool.query(
      `DELETE FROM price_alerts WHERE id = $1 AND exchange = $2`,
      [id, this.options.exchange],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
