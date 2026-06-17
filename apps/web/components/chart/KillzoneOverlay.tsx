"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

interface Killzone {
  name: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  color: string;
}

const KILLZONES: Killzone[] = [
  { name: "Asian",        startHour: 1,  startMinute: 0, endHour: 5,  endMinute: 0, color: "rgba(233, 30, 99, 0.07)" },
  { name: "London Open",  startHour: 6,  startMinute: 0, endHour: 9,  endMinute: 0, color: "rgba(0, 188, 212, 0.07)" },
  { name: "New York",     startHour: 12, startMinute: 0, endHour: 14, endMinute: 0, color: "rgba(255, 93, 0, 0.07)" },
  { name: "London Close", startHour: 14, startMinute: 0, endHour: 16, endMinute: 0, color: "rgba(33, 87, 243, 0.07)" },
];

function isInKillzone(timeUnixSeconds: number, kz: Killzone): boolean {
  const date = new Date(timeUnixSeconds * 1000);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;
  const kzStart = kz.startHour * 60 + kz.startMinute;
  const kzEnd = kz.endHour * 60 + kz.endMinute;

  if (kzStart <= kzEnd) {
    return totalMinutes >= kzStart && totalMinutes < kzEnd;
  }
  return totalMinutes >= kzStart || totalMinutes < kzEnd;
}

interface KillzoneOverlayProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  candles: Array<{ time: number }>;
}

export function KillzoneOverlay({ chart, series, candles }: KillzoneOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chart || !series || !containerRef.current || candles.length === 0) return;

    const container = containerRef.current;

    function renderZones() {
      if (!chart || !series || !container) return;
      container.innerHTML = "";

      const timeScale = chart.timeScale();
      const chartHeight = container.clientHeight;
      const plotWidth = timeScale.width();


      // Derive the candle interval (in seconds) from the data so grouping and
      // box widths work on every timeframe (5m, 15m, 1h, 4h, ...).
      let interval = 300; // sensible 5m default
      if (candles.length >= 2) {
        let minDiff = Infinity;
        for (let i = 1; i < candles.length; i++) {
          const d = candles[i].time - candles[i - 1].time;
          if (d > 0 && d < minDiff) minDiff = d;
        }
        if (minDiff !== Infinity) interval = minDiff;
      }

      // Group consecutive candles by killzone. Two in-killzone candles belong to
      // the same region when they are at most one interval apart.
      type KzRegion = { kz: Killzone; startTime: number; endTime: number };
      const regions: KzRegion[] = [];

      for (const candle of candles) {
        for (const kz of KILLZONES) {
          if (isInKillzone(candle.time, kz)) {
            const last = regions[regions.length - 1];
            if (last && last.kz.name === kz.name && candle.time - last.endTime <= interval) {
              last.endTime = candle.time;
            } else {
              regions.push({ kz, startTime: candle.time, endTime: candle.time });
            }
            break;
          }
        }
      }

      for (const region of regions) {
        const leftCoord = timeScale.timeToCoordinate(region.startTime as any);
        // Extend the right edge by one interval so the box spans the full width
        // of the last candle in the region (single-candle regions still show).
        const rawRight = timeScale.timeToCoordinate((region.endTime + interval) as any);

        if (leftCoord === null || rawRight === null) continue;
        // Clamp to the plotting area so boxes never draw under the price axis
        const rightCoord = Math.min(rawRight, plotWidth);
        if (rightCoord < 0 || leftCoord > plotWidth) continue;



        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.left = `${Math.max(leftCoord, 0)}px`;
        box.style.top = "0px";
        box.style.width = `${Math.max(rightCoord - Math.max(leftCoord, 0), 4)}px`;
        box.style.height = `${chartHeight}px`;
        box.style.backgroundColor = region.kz.color;
        box.style.pointerEvents = "none";

        container.appendChild(box);
      }
    }

    renderZones();

    chart.timeScale().subscribeVisibleLogicalRangeChange(renderZones);

    return () => {
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(renderZones);
      } catch {}
      container.innerHTML = "";
    };
  }, [chart, series, candles]);

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
        zIndex: 1,
      }}
    />
  );
}
