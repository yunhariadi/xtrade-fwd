"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { FvgZone } from "@ict-forward-lab/core";

interface FvgOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  zones: FvgZone[];
  symbol: string;
  timeframe: string;
  /**
   * When set (bar replay active), the overlay only reveals zones and computes
   * their mitigated/touched state as of this Unix-seconds timestamp. Null/undefined
   * means show the live final state.
   */
  replayTime?: number | null;
}

export function FvgOverlay({ chart, series, zones, replayTime = null }: FvgOverlayProps) {

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chart || !series || !containerRef.current) return;

    const container = containerRef.current;

    function renderBoxes() {
      if (!chart || !series || !container) return;
      container.innerHTML = "";

      const timeScale = chart.timeScale();
      const plotWidth = timeScale.width();

      for (const zone of zones) {
        // In replay mode the gap only exists once its forming candle has played.
        if (replayTime !== null && zone.toTime > replayTime) continue;

        const leftCoord = timeScale.timeToCoordinate(zone.fromTime as never);
        const topCoord = series.priceToCoordinate(zone.top);
        const bottomCoord = series.priceToCoordinate(zone.bottom);

        if (leftCoord === null || topCoord === null || bottomCoord === null) continue;

        // Drive rendering from the backend's authoritative status:
        //  - mitigated        → ends at mitigatedAt, faint styling
        //  - active + touched → solid fill, dashed border (wick/body partially entered)
        //  - active + untouched → solid fill, solid border (never touched)
        //
        // In replay mode the lifecycle is rewound to the playback head: a zone is
        // only "mitigated"/"touched" if that event happened at or before replayTime.
        const mitigatedNow =
          zone.status === "mitigated" &&
          zone.mitigatedAt !== undefined &&
          (replayTime === null || zone.mitigatedAt <= replayTime);
        const touchedNow =
          zone.touched === true &&
          (replayTime === null ||
            (zone.touchedAt !== undefined && zone.touchedAt <= replayTime));

        const isMitigated = mitigatedNow;
        const isTouched = !isMitigated && touchedNow;
        const borderStyle = isTouched ? "dashed" : "solid";


        let rightCoord = plotWidth;
        if (isMitigated && zone.mitigatedAt !== undefined) {
          const r = timeScale.timeToCoordinate(zone.mitigatedAt as never);
          if (r !== null) rightCoord = r;
        }


        // Clamp to the plotting area so boxes never draw under the price axis
        rightCoord = Math.min(rightCoord, plotWidth);

        // Skip if box is off-screen
        if (rightCoord < 0 || leftCoord > plotWidth) continue;

        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.left = `${Math.max(leftCoord, 0)}px`;
        box.style.top = `${Math.min(topCoord, bottomCoord)}px`;
        box.style.width = `${Math.max(rightCoord - Math.max(leftCoord, 0), 4)}px`;
        box.style.height = `${Math.abs(bottomCoord - topCoord)}px`;
        box.style.pointerEvents = "none";
        box.style.borderRadius = "2px";

        if (zone.direction === "bullish") {
          box.style.backgroundColor = isMitigated
            ? "rgba(0, 100, 80, 0.08)"
            : "rgba(0, 180, 150, 0.25)";
          box.style.border = isMitigated
            ? "1px solid rgba(0, 100, 80, 0.15)"
            : `1px ${borderStyle} rgba(0, 200, 170, 0.6)`;
        } else {
          box.style.backgroundColor = isMitigated
            ? "rgba(150, 40, 30, 0.08)"
            : "rgba(244, 67, 54, 0.25)";
          box.style.border = isMitigated
            ? "1px solid rgba(150, 40, 30, 0.15)"
            : `1px ${borderStyle} rgba(255, 80, 60, 0.6)`;
        }


        container.appendChild(box);
      }
    }

    renderBoxes();

    chart.timeScale().subscribeVisibleLogicalRangeChange(renderBoxes);
    chart.subscribeCrosshairMove(renderBoxes);

    return () => {
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(renderBoxes);
        chart.unsubscribeCrosshairMove(renderBoxes);
      } catch {}
      container.innerHTML = "";
    };
  }, [chart, series, zones, replayTime]);


  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 10,
      }}
    />
  );
}
