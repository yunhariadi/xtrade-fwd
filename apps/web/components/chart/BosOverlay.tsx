"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

interface StructureBreak {
  type: "MSS" | "BOS";
  direction: "bullish" | "bearish";
  breakLevel: number;
  time: number; // Unix seconds — candle that closed through the level
  fromTime: number; // Unix seconds — swing point that was broken
}

interface BosOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  symbol: string;
  timeframe: string;
  /**
   * When set (bar replay active), only reveal structure breaks whose break
   * candle has played at/before this Unix-seconds timestamp. Null/undefined
   * means show the live final state.
   */
  replayTime?: number | null;
}


const BULL_COLOR = "#00e6a1";
const BEAR_COLOR = "#e60400";

/**
 * Renders MSS / BOS structure breaks as horizontal lines spanning from the
 * broken swing point to the break candle, with a small type label.
 * Works on any timeframe — data comes from /api/structure.
 */
export function BosOverlay({ chart, series, symbol, timeframe, replayTime = null }: BosOverlayProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const [breaks, setBreaks] = useState<StructureBreak[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/structure?symbol=${symbol}&timeframe=${timeframe}`)
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => [])
      .then((data: StructureBreak[]) => {
        if (!cancelled) setBreaks(Array.isArray(data) ? data : []);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!chart || !series || !containerRef.current || breaks.length === 0) return;

    const container = containerRef.current;

    function render() {
      if (!chart || !series || !container) return;
      container.innerHTML = "";

      const timeScale = chart.timeScale();
      const width = timeScale.width();

      for (const b of breaks) {
        // In replay mode the break only exists once its break candle has played.
        if (replayTime !== null && b.time > replayTime) continue;

        const y = series.priceToCoordinate(b.breakLevel);

        const leftCoord = timeScale.timeToCoordinate(b.fromTime as never);
        const rightCoord = timeScale.timeToCoordinate(b.time as never);

        if (y === null || leftCoord === null || rightCoord === null) continue;

        const left = Math.min(leftCoord, rightCoord);
        // Clamp to the plotting area so lines never draw under the price axis
        const right = Math.min(Math.max(leftCoord, rightCoord), width);
        if (right < 0 || left > width) continue;


        const color = b.direction === "bullish" ? BULL_COLOR : BEAR_COLOR;

        // Break level line
        const line = document.createElement("div");
        line.style.position = "absolute";
        line.style.left = `${Math.max(left, 0)}px`;
        line.style.top = `${y}px`;
        line.style.width = `${Math.max(right - Math.max(left, 0), 4)}px`;
        line.style.height = "0px";
        line.style.borderTop = `1px ${b.type === "MSS" ? "solid" : "dashed"} ${color}`;
        line.style.pointerEvents = "none";
        container.appendChild(line);

        // Label
        const label = document.createElement("div");
        label.textContent = b.type;
        label.style.position = "absolute";
        label.style.left = `${Math.min(right + 2, width - 30)}px`;
        label.style.top = `${y - 7}px`;
        label.style.fontSize = "9px";
        label.style.fontWeight = "600";
        label.style.color = color;
        label.style.pointerEvents = "none";
        label.style.whiteSpace = "nowrap";
        container.appendChild(label);
      }
    }

    render();

    chart.timeScale().subscribeVisibleLogicalRangeChange(render);
    chart.subscribeCrosshairMove(render);

    return () => {
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(render);
        chart.unsubscribeCrosshairMove(render);
      } catch {}
      container.innerHTML = "";
    };
  }, [chart, series, breaks, replayTime]);


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
        zIndex: 12,
      }}
    />
  );
}
