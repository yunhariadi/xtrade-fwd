"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

interface LiquidityLevel {
  type: "buy-side" | "sell-side";
  price: number;
  time: number; // Unix seconds
}

interface OhlcCandle {
  time: number; // Unix seconds
  high: number;
  low: number;
}

interface LiquidityOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  symbol: string;
  timeframe: string;
  /**
   * When set (bar replay active), only reveal levels formed at/before this
   * Unix-seconds timestamp, and only treat a level as swept if the sweep
   * candle has already played. Null/undefined means show the live final state.
   */
  replayTime?: number | null;
}

export function LiquidityOverlay({ chart, series, symbol, timeframe, replayTime = null }: LiquidityOverlayProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const [levels, setLevels] = useState<LiquidityLevel[]>([]);
  const [candles, setCandles] = useState<OhlcCandle[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/liquidity?symbol=${symbol}&timeframe=${timeframe}`)
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
      fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}`)
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
    ]).then(([lvls, cdls]) => {
      setLevels(lvls);
      setCandles(cdls);
    });
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!chart || !series || !containerRef.current || levels.length === 0) return;

    const container = containerRef.current;

    function renderLines() {
      if (!chart || !series || !container) return;
      container.innerHTML = "";

      const timeScale = chart.timeScale();
      const plotWidth = timeScale.width();

      for (const level of levels) {
        // In replay mode the level only exists once its swing candle has played.
        if (replayTime !== null && level.time > replayTime) continue;

        const y = series.priceToCoordinate(level.price);
        if (y === null) continue;

        const leftCoord = timeScale.timeToCoordinate(level.time as any);
        if (leftCoord === null) continue;

        // Find the first candle after the swing whose wick or body touches the level.
        // candles is sorted ASC by time so we can break on first match.
        // In replay mode, only candles up to the playback head count as a sweep.
        let terminationTime: number | null = null;
        for (const c of candles) {
          if (c.time <= level.time) continue;
          if (replayTime !== null && c.time > replayTime) break;
          if (level.type === "buy-side" && c.high >= level.price) {
            terminationTime = c.time;
            break;
          }
          if (level.type === "sell-side" && c.low <= level.price) {
            terminationTime = c.time;
            break;
          }
        }


        let rightCoord: number;
        const isTerminated = terminationTime !== null;

        if (isTerminated) {
          const r = timeScale.timeToCoordinate(terminationTime as any);
          // If the termination candle is off the right edge of the viewport, clamp to edge.
          // If it's off the left edge, the level isn't visible — skip.
          if (r !== null) {
            rightCoord = r;
          } else {
            // timeToCoordinate returns null when the bar is outside the logical range.
            // If terminationTime > level.time and both are "recent", it's likely off-right.
            rightCoord = plotWidth;
          }
        } else {
          rightCoord = plotWidth;
        }

        // Clamp to the plotting area so lines never draw under the price axis
        rightCoord = Math.min(rightCoord, plotWidth);

        // Skip levels entirely off-screen
        if (rightCoord < 0 || leftCoord > plotWidth) continue;


        const line = document.createElement("div");
        line.style.position = "absolute";
        line.style.left = `${Math.max(leftCoord, 0)}px`;
        line.style.top = `${y}px`;
        line.style.width = `${Math.max(rightCoord - Math.max(leftCoord, 0), 4)}px`;
        line.style.height = "1px";
        line.style.pointerEvents = "none";

        if (isTerminated) {
          line.style.borderTop =
            level.type === "buy-side"
              ? "1px dotted rgba(0, 200, 100, 0.3)"
              : "1px dotted rgba(255, 80, 80, 0.3)";
        } else {
          line.style.borderTop =
            level.type === "buy-side"
              ? "1px solid rgba(0, 220, 120, 0.7)"
              : "1px solid rgba(255, 60, 60, 0.7)";
        }

        container.appendChild(line);
      }
    }

    renderLines();

    chart.timeScale().subscribeVisibleLogicalRangeChange(renderLines);
    chart.subscribeCrosshairMove(renderLines);

    return () => {
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(renderLines);
        chart.unsubscribeCrosshairMove(renderLines);
      } catch {}
      container.innerHTML = "";
    };
  }, [chart, series, levels, candles, replayTime]);


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
        zIndex: 9,
      }}
    />
  );
}
