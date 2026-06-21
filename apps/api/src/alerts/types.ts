import type { PriceAlertDirection } from "@ict-forward-lab/core";

export type { PriceAlertDirection };

export type PriceAlertStatus = "active" | "triggered" | "disabled";

export interface PriceAlert {
  id: number;
  exchange: string;
  symbol: string;
  direction: PriceAlertDirection;
  targetPrice: number;
  status: PriceAlertStatus;
  repeat: boolean;
  note: string | null;
  triggeredAt: string | null;
  triggeredPrice: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePriceAlertInput {
  symbol: string;
  direction: PriceAlertDirection;
  targetPrice: number;
  repeat?: boolean;
  note?: string | null;
}

export interface UpdatePriceAlertInput {
  direction?: PriceAlertDirection;
  targetPrice?: number;
  status?: PriceAlertStatus;
  repeat?: boolean;
  note?: string | null;
}

/** Map a price_alerts DB row to the API shape (camelCase, numeric coercion). */
export function dbRowToAlert(row: Record<string, unknown>): PriceAlert {
  return {
    id: Number(row.id),
    exchange: String(row.exchange),
    symbol: String(row.symbol),
    direction: row.direction as PriceAlertDirection,
    targetPrice: Number(row.target_price),
    status: row.status as PriceAlertStatus,
    repeat: Boolean(row.repeat),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    triggeredAt: row.triggered_at ? new Date(row.triggered_at as string).toISOString() : null,
    triggeredPrice:
      row.triggered_price === null || row.triggered_price === undefined
        ? null
        : Number(row.triggered_price),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}
