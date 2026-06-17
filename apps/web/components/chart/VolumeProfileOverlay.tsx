"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Candle } from "@ict-forward-lab/core";

interface VolumeProfileOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  /** Full OHLCV dataset; the profile is built from the candles in view. */
  candles: Candle[];
  /**
   * When set (bar replay active), only candles at or before this Unix-seconds
   * timestamp contribute to the profile. Null/undefined uses the full dataset.
   */
  replayTime?: number | null;
  /** Number of horizontal price buckets (rows) in the profile. */
  rows?: number;
  /** Fraction of total volume that defines the value area (TradingView uses 0.70). */
  valueAreaPct?: number;
}

/**
 * Visible-range Volume Profile (VPVR).
 *
 * Builds a horizontal histogram of traded volume per price level using whatever
 * candles are currently visible on the time scale. Each candle's volume is spread
 * evenly across the price buckets its high→low range spans. The bucket with the
 * most volume is the Point of Control (POC); the contiguous band of buckets around
 * it that holds `valueAreaPct` of the volume is the Value Area (VAH/VAL).
 *
 * Bars are anchored to the right edge of the plotting area, TradingView style.
 */
export function VolumeProfileOverlay({
  chart,
  series,
  candles,
  replayTime = null,
  rows = 64,
  valueAreaPct = 0.7,
}: VolumeProfileOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chart || !series || !containerRef.current || candles.length === 0) return;

    const container = containerRef.current;
    const timeScale = chart.timeScale();

    function renderProfile() {
      if (!chart || !series || !container) return;
      container.innerHTML = "";

      const plotWidth = timeScale.width();
      if (plotWidth <= 0) return;

      // Restrict the source candles to the visible time range (VPVR). Fall back
      // to the full dataset when the range can't be read yet.
      const range = timeScale.getVisibleRange();
      const from = range ? (range.from as number) : -Infinity;
      const to = range ? (range.to as number) : Infinity;

      const visible = candles.filter((c) => {
        if (c.time < from || c.time > to) return false;
        if (replayTime !== null && c.time > replayTime) return false;
        return true;
      });
      if (visible.length === 0) return;

      // Price range covered by the visible candles.
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      for (const c of visible) {
        if (c.low < minPrice) minPrice = c.low;
        if (c.high > maxPrice) maxPrice = c.high;
      }
      if (!isFinite(minPrice) || !isFinite(maxPrice) || maxPrice <= minPrice) return;

      const bucketCount = Math.max(8, rows);
      const bucketSize = (maxPrice - minPrice) / bucketCount;
      const buckets = new Array<number>(bucketCount).fill(0);

      // Distribute each candle's volume evenly across the buckets its range spans.
      for (const c of visible) {
        const lowIdx = Math.min(
          bucketCount - 1,
          Math.max(0, Math.floor((c.low - minPrice) / bucketSize))
        );
        const highIdx = Math.min(
          bucketCount - 1,
          Math.max(0, Math.floor((c.high - minPrice) / bucketSize))
        );
        const span = highIdx - lowIdx + 1;
        const perBucket = c.volume / span;
        for (let i = lowIdx; i <= highIdx; i++) buckets[i] += perBucket;
      }

      const maxVolume = Math.max(...buckets);
      if (maxVolume <= 0) return;

      // Point of Control — bucket with the most volume.
      let pocIdx = 0;
      for (let i = 1; i < bucketCount; i++) {
        if (buckets[i] > buckets[pocIdx]) pocIdx = i;
      }

      // Value Area — expand outward from the POC, always taking the larger of the
      // two neighbouring buckets, until we've accumulated valueAreaPct of volume.
      const totalVolume = buckets.reduce((a, b) => a + b, 0);
      const target = totalVolume * valueAreaPct;
      let acc = buckets[pocIdx];
      let lo = pocIdx;
      let hi = pocIdx;
      while (acc < target && (lo > 0 || hi < bucketCount - 1)) {
        const below = lo > 0 ? buckets[lo - 1] : -1;
        const above = hi < bucketCount - 1 ? buckets[hi + 1] : -1;
        if (above >= below) {
          hi += 1;
          acc += buckets[hi];
        } else {
          lo -= 1;
          acc += buckets[lo];
        }
      }

      // Profile occupies the right ~30% of the plot, growing leftward.
      const maxBarWidth = plotWidth * 0.3;

      for (let i = 0; i < bucketCount; i++) {
        const vol = buckets[i];
        if (vol <= 0) continue;

        const bucketLow = minPrice + i * bucketSize;
        const bucketHigh = bucketLow + bucketSize;
        const topCoord = series.priceToCoordinate(bucketHigh);
        const bottomCoord = series.priceToCoordinate(bucketLow);
        if (topCoord === null || bottomCoord === null) continue;

        const barWidth = (vol / maxVolume) * maxBarWidth;
        const inValueArea = i >= lo && i <= hi;
        const isPoc = i === pocIdx;

        const bar = document.createElement("div");
        bar.style.position = "absolute";
        bar.style.right = "0px";
        bar.style.top = `${Math.min(topCoord, bottomCoord)}px`;
        bar.style.width = `${Math.max(barWidth, 1)}px`;
        bar.style.height = `${Math.max(Math.abs(bottomCoord - topCoord) - 1, 1)}px`;
        bar.style.pointerEvents = "none";

        if (isPoc) {
          bar.style.backgroundColor = "rgba(245, 158, 11, 0.55)";
        } else if (inValueArea) {
          bar.style.backgroundColor = "rgba(96, 165, 250, 0.35)";
        } else {
          bar.style.backgroundColor = "rgba(148, 163, 184, 0.18)";
        }

        container.appendChild(bar);
      }
    }

    renderProfile();

    timeScale.subscribeVisibleLogicalRangeChange(renderProfile);

    return () => {
      try {
        timeScale.unsubscribeVisibleLogicalRangeChange(renderProfile);
      } catch {}
      container.innerHTML = "";
    };
  }, [chart, series, candles, replayTime, rows, valueAreaPct]);

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
        zIndex: 2,
      }}
    />
  );
}
