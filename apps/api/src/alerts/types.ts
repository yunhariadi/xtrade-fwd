import type {
  PriceAlertDirection,
  AlertKind,
  AlertTargetKind,
  AlertTrigger,
  IndicatorKind,
} from "@ict-forward-lab/core";

export type { PriceAlertDirection, AlertKind, AlertTargetKind, AlertTrigger, IndicatorKind };

export type PriceAlertStatus = "active" | "triggered" | "disabled";

export interface PriceAlert {
  id: number;
  exchange: string;
  symbol: string;
  kind: AlertKind;
  /** 'level' watches targetPrice; 'zone' watches [priceLow, priceHigh]. */
  targetKind: AlertTargetKind;
  direction: PriceAlertDirection;
  /** Level alerts (price + Liquidity/BoS indicators). Null for zone alerts. */
  targetPrice: number | null;
  /** Zone alerts (FVG/OB). Null for level alerts. */
  priceLow: number | null;
  priceHigh: number | null;
  /** Zone trigger semantics. Null for level alerts. */
  trigger: AlertTrigger | null;
  /** Indicator provenance (null for plain price alerts). */
  indicatorKind: IndicatorKind | null;
  indicatorId: string | null;
  indicatorDirection: string | null;
  timeframe: string | null;
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

/** Snapshotted indicator alert, resolved from a detected instance at create time. */
export interface CreateIndicatorAlertInput {
  symbol: string;
  timeframe: string;
  indicatorKind: IndicatorKind;
  indicatorId: string;
  /** Zone alerts only: 'touch' (enter band) or 'cross' (through far edge). */
  trigger?: AlertTrigger;
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

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/** Map a price_alerts DB row to the API shape (camelCase, numeric coercion). */
export function dbRowToAlert(row: Record<string, unknown>): PriceAlert {
  return {
    id: Number(row.id),
    exchange: String(row.exchange),
    symbol: String(row.symbol),
    kind: (row.kind as AlertKind) ?? "price",
    targetKind: (row.target_kind as AlertTargetKind) ?? "level",
    direction: row.direction as PriceAlertDirection,
    targetPrice: numOrNull(row.target_price),
    priceLow: numOrNull(row.price_low),
    priceHigh: numOrNull(row.price_high),
    trigger: (strOrNull(row.trigger) as AlertTrigger | null) ?? null,
    indicatorKind: (strOrNull(row.indicator_kind) as IndicatorKind | null) ?? null,
    indicatorId: strOrNull(row.indicator_id),
    indicatorDirection: strOrNull(row.indicator_direction),
    timeframe: strOrNull(row.timeframe),
    status: row.status as PriceAlertStatus,
    repeat: Boolean(row.repeat),
    note: strOrNull(row.note),
    triggeredAt: row.triggered_at ? new Date(row.triggered_at as string).toISOString() : null,
    triggeredPrice: numOrNull(row.triggered_price),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}
