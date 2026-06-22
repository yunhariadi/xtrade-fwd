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

const INDICATOR_LABEL: Record<NonNullable<PriceAlert["indicatorKind"]>, string> = {
  fvg: "FVG",
  ob: "OB",
  liquidity: "LIQ",
  bos: "BoS",
};

function indicatorLabel(alert: PriceAlert): string {
  if (alert.kind !== "indicator" || !alert.indicatorKind) return "";
  return INDICATOR_LABEL[alert.indicatorKind];
}

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
      const label = alert.note || indicatorLabel(alert) || "alert";

      if (alert.targetKind === "zone" && alert.priceLow !== null && alert.priceHigh !== null) {
        // Zone alert: bracket the band with two lines (touch/cross marker).
        const marker = alert.trigger === "cross" ? "⇲" : "◎";
        for (const [price, edge] of [
          [alert.priceHigh, "top"],
          [alert.priceLow, "bottom"],
        ] as const) {
          linesRef.current.push(
            series.createPriceLine({
              price,
              color: "#f59e0b",
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: edge === "top" ? `${marker} ${label}` : "",
            }),
          );
        }
        continue;
      }

      if (alert.targetPrice === null) continue;
      const marker = alert.kind === "indicator" ? "◆" : DIRECTION_LABEL[alert.direction];
      const line = series.createPriceLine({
        price: alert.targetPrice,
        color: "#eab308",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${marker} ${label}`,
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
