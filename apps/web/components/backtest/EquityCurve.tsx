"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
} from "lightweight-charts";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";

interface EquityPoint {
  time: number;
  balance: number;
}

interface EquityCurveProps {
  data: EquityPoint[];
  initialBalance: number;
}

export function EquityCurve({ data, initialBalance }: EquityCurveProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0f14" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
    });

    // Build chart data — prepend initial balance point
    const chartData = data.length > 0
      ? data.map((p) => ({
          time: (p.time / 1000) as UTCTimestamp,
          value: p.balance,
        }))
      : [];

    if (chartData.length > 0) {
      lineSeries.setData(chartData);
      chart.timeScale().fitContent();
    }

    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data, initialBalance]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No equity data available
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-[250px]" />
  );
}
