"use client";

import { useEffect, useRef } from "react";
import type { ISeriesApi, IPriceLine } from "lightweight-charts";
import { LineStyle } from "lightweight-charts";
import type { PriceAlert } from "../../hooks/useAlertWebSocket";

interface AlertOverlayProps {
  series: ISeriesApi<"Candlestick"> | null;
  alerts: PriceAlert[];
}

const DIRECTION_LABEL: Record<PriceAlert["direction"], string> = {
  above: "▲",
  below: "▼",
  cross: "⇅",
};

/**
 * Draws a dashed horizontal price line on the candle series for each active
 * alert. Renders nothing itself; it just manages lightweight-charts price lines
 * and tears them down on change/unmount.
 */
export function AlertOverlay({ series, alerts }: AlertOverlayProps) {
  const linesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    if (!series) return;

    const active = alerts.filter((a) => a.status === "active");
    for (const alert of active) {
      const line = series.createPriceLine({
        price: alert.targetPrice,
        color: "#eab308",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${DIRECTION_LABEL[alert.direction]} ${alert.note ? alert.note : "alert"}`,
      });
      linesRef.current.push(line);
    }

    return () => {
      for (const line of linesRef.current) {
        try {
          series.removePriceLine(line);
        } catch {
          /* series may already be disposed */
        }
      }
      linesRef.current = [];
    };
  }, [series, alerts]);

  return null;
}
