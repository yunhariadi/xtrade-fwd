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
