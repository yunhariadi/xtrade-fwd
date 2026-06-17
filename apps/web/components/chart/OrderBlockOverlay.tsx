"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

interface OrderBlock {
  id: string;
  direction: "bullish" | "bearish";
  top: number;
  bottom: number;
  time: number;
  fromTime: number;
  status: "active" | "breaker" | "broken";
  breakTime?: number;
  useBody: boolean;
}

interface OhlcCandle {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

interface OrderBlockOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  symbol: string;
  timeframe: string;
  /**
   * When set (bar replay active), only reveal blocks formed at/before this
   * Unix-seconds timestamp, and only treat a block as retested/broken if the
   * relevant candle has already played. Null/undefined means live final state.
   */
  replayTime?: number | null;
}

export function OrderBlockOverlay({ chart, series, symbol, timeframe, replayTime = null }: OrderBlockOverlayProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const [blocks, setBlocks] = useState<OrderBlock[]>([]);
  const [candles, setCandles] = useState<OhlcCandle[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/order-blocks?symbol=${symbol}&timeframe=${timeframe}`)
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
      fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}`)
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
    ]).then(([blks, cdls]) => {
      setBlocks(blks);
      setCandles(cdls);
    });
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!chart || !series || !containerRef.current || blocks.length === 0) return;

    const container = containerRef.current;

    function renderBoxes() {
      if (!chart || !series || !container) return;
      container.innerHTML = "";

      const timeScale = chart.timeScale();
      const plotWidth = timeScale.width();

      for (const ob of blocks) {
        // In replay mode the block only exists once its forming candle has played.
        const formedAt = Math.max(ob.fromTime, ob.time);
        if (replayTime !== null && formedAt > replayTime) continue;

        const leftCoord = timeScale.timeToCoordinate(ob.fromTime as any);
        const topCoord = series.priceToCoordinate(ob.top);
        const bottomCoord = series.priceToCoordinate(ob.bottom);

        if (leftCoord === null || topCoord === null || bottomCoord === null) continue;

        // Find the first RETEST of the OB zone (not the impulse/break candle).
        // Phase 1: wait until price has moved AWAY from the zone (a candle closes beyond the zone edge).
        // Phase 2: first candle that wicks back into the zone is the termination point.
        // In replay mode, only candles up to the playback head are considered.
        let terminationTime: number | null = null;
        let expandedAway = false;

        for (const c of candles) {
          if (c.time <= ob.fromTime) continue;
          if (replayTime !== null && c.time > replayTime) break;

          if (!expandedAway) {
            if (ob.direction === "bullish" && c.close > ob.top) expandedAway = true;
            else if (ob.direction === "bearish" && c.close < ob.bottom) expandedAway = true;
            continue;
          }

          if (ob.direction === "bullish" && c.low <= ob.top) {
            terminationTime = c.time;
            break;
          }
          if (ob.direction === "bearish" && c.high >= ob.bottom) {
            terminationTime = c.time;
            break;
          }
        }


        let rightCoord: number;
        const isTerminated = terminationTime !== null;

        if (isTerminated) {
          const r = timeScale.timeToCoordinate(terminationTime as any);
          rightCoord = r !== null ? r : plotWidth;
        } else {
          rightCoord = plotWidth;
        }

        // Clamp to the plotting area so boxes never draw under the price axis
        rightCoord = Math.min(rightCoord, plotWidth);

        // Skip if off-screen
        if (rightCoord < 0 || leftCoord > plotWidth) continue;


        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.left = `${Math.max(leftCoord, 0)}px`;
        box.style.top = `${Math.min(topCoord, bottomCoord)}px`;
        box.style.width = `${Math.max(rightCoord - Math.max(leftCoord, 0), 4)}px`;
        box.style.height = `${Math.abs(bottomCoord - topCoord)}px`;
        box.style.pointerEvents = "none";
        box.style.borderRadius = "2px";

        if (ob.direction === "bullish") {
          box.style.backgroundColor = isTerminated
            ? "rgba(62, 137, 250, 0.08)"
            : "rgba(62, 137, 250, 0.20)";
          box.style.border = isTerminated
            ? "1px dashed rgba(62, 137, 250, 0.3)"
            : "1px solid rgba(62, 137, 250, 0.5)";
        } else {
          box.style.backgroundColor = isTerminated
            ? "rgba(255, 49, 49, 0.08)"
            : "rgba(255, 49, 49, 0.20)";
          box.style.border = isTerminated
            ? "1px dashed rgba(255, 49, 49, 0.3)"
            : "1px solid rgba(255, 49, 49, 0.5)";
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
  }, [chart, series, blocks, candles, replayTime]);


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
        zIndex: 11,
      }}
    />
  );
}
