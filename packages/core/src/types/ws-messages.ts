import type { Candle } from "./candle";
import type { FvgZone } from "./fvg";

export type WsEventType = "candle:update" | "candle:closed";

export type WsFvgEventType = "fvg:created" | "fvg:mitigated" | "fvg:touched";

export interface WsFvgCreatedMessage {
  event: "fvg:created";
  data: {
    symbol: string;
    timeframe: string;
    zone: FvgZone;
  };
}

export interface WsFvgMitigatedMessage {
  event: "fvg:mitigated";
  data: {
    symbol: string;
    timeframe: string;
    zoneId: string;
    status: "mitigated";
  };
}

export interface WsFvgTouchedMessage {
  event: "fvg:touched";
  data: {
    symbol: string;
    timeframe: string;
    zoneId: string;
  };
}

export type WsFvgMessage =
  | WsFvgCreatedMessage
  | WsFvgMitigatedMessage
  | WsFvgTouchedMessage;

export type PriceAlertDirection = "above" | "below" | "cross";

/** Whether an alert watches a user price level or a detected indicator. */
export type AlertKind = "price" | "indicator";
/** A single price level, or a price band (zone). */
export type AlertTargetKind = "level" | "zone";
/** Zone trigger: `touch` = price enters the band; `cross` = passes through it. */
export type AlertTrigger = "touch" | "cross";
/** Indicator an alert can be snapshotted from. */
export type IndicatorKind = "fvg" | "ob" | "liquidity" | "bos";

export interface WsAlertTriggeredMessage {
  event: "alert:triggered";
  data: {
    id: number;
    symbol: string;
    direction: PriceAlertDirection;
    /** Null for zone (indicator) alerts, which use priceLow/priceHigh instead. */
    targetPrice: number | null;
    triggeredPrice: number;
    triggeredAt: string;
    note: string | null;
    /** 'price' for the original price-cross alerts; 'indicator' otherwise. */
    kind?: AlertKind;
    targetKind?: AlertTargetKind;
    trigger?: AlertTrigger;
    priceLow?: number | null;
    priceHigh?: number | null;
    indicatorKind?: IndicatorKind | null;
    indicatorId?: string | null;
    indicatorDirection?: string | null;
    timeframe?: string | null;
  };
}


export interface WsAlertExpiredMessage {
  event: "alert:expired";
  data: {
    id: number;
    symbol: string;
    /** Why the alert was auto-expired, e.g. "fvg-mitigated". */
    reason: string;
    indicatorKind?: IndicatorKind | null;
    indicatorId?: string | null;
  };
}

export interface WsCandleMessage {
  event: WsEventType;
  data: {
    symbol: string;
    timeframe: string;
    candle: Candle;
  };
}

/**
 * Serialize a WS message ensuring numeric fields stay as numbers.
 */
export function serializeWsMessage(message: WsCandleMessage): string {
  return JSON.stringify(message);
}

/**
 * Parse a raw WS message string into a typed message.
 * Returns null if parsing fails or structure is invalid.
 */
export function parseWsMessage(
  raw: string
): WsCandleMessage | WsFvgMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.event || !parsed.data) return null;

    if (
      parsed.event === "fvg:created" ||
      parsed.event === "fvg:mitigated" ||
      parsed.event === "fvg:touched"
    ) {
      return parsed as WsFvgMessage;
    }


    if (!parsed.data.candle) return null;
    return parsed as WsCandleMessage;
  } catch {
    return null;
  }
}
