"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
} from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  MouseEventParams,
  Time,
} from "lightweight-charts";
import type { Candle } from "@ict-forward-lab/core";
import { useMarketWebSocket, ConnectionStatus } from "../../hooks/useMarketWebSocket";
import { useFvgWebSocket } from "../../hooks/useFvgWebSocket";
import { FvgOverlay } from "./FvgOverlay";
import { LiquidityOverlay } from "./LiquidityOverlay";
import { OrderBlockOverlay } from "./OrderBlockOverlay";
import { KillzoneOverlay } from "./KillzoneOverlay";
import { BosOverlay } from "./BosOverlay";
import { VolumeProfileOverlay } from "./VolumeProfileOverlay";

import { AlertOverlay } from "./AlertOverlay";
import { BarReplayControls, type ReplaySpeed } from "./BarReplayControls";
import type { IndicatorConfig } from "./IndicatorSettings";
import type { PriceAlert } from "../../hooks/useAlertWebSocket";



interface CandlestickChartProps {
  symbol: string;
  timeframe: string;
  indicators?: IndicatorConfig;
  /** Active price alerts to draw as horizontal lines on the series. */
  alerts?: PriceAlert[];
  /**
   * Fired whenever the bar-replay playback head moves. Emits the Unix-seconds
   * timestamp at the head, or null when replay is off. Lets sibling panels
   * (e.g. the confluence checklist) follow the replay.
   */
  onReplayTimeChange?: (time: number | null) => void;
}


const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

/** Convert a timeframe label (e.g. "5m", "1h", "4h") to seconds. */
function timeframeToSeconds(tf: string): number {
  const m = tf.match(/^(\d+)([mhdw])$/);
  if (!m) return 60;
  const n = Number(m[1]);
  switch (m[2]) {
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86400;
    case "w":
      return n * 604800;
    default:
      return 60;
  }
}

/** Format seconds remaining as H:MM:SS (or MM:SS when under an hour). */
function formatCountdown(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (x: number) => String(x).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}


export function CandlestickChart({ symbol, timeframe, indicators, alerts, onReplayTimeChange }: CandlestickChartProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [candleTimes, setCandleTimes] = useState<Array<{ time: number }>>([]);

  // Full candle dataset, kept for bar replay clipping
  const candlesRef = useRef<Candle[]>([]);

  // Bar replay state
  const [replayMode, setReplayMode] = useState(false);
  const [selectingBar, setSelectingBar] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  // -1 means no start bar selected yet
  const [replayPosition, setReplayPosition] = useState(-1);

  // Refs mirror state so the chart click handler (registered once) reads fresh values
  const selectingBarRef = useRef(selectingBar);
  selectingBarRef.current = selectingBar;

  const totalCandles = candleTimes.length;
  const hasStartBar = replayPosition >= 0;
  const atEnd = hasStartBar && replayPosition >= totalCandles - 1;

  // Timestamp at the playback head — overlays use this to rewind indicator
  // lifecycle (FVG mitigation, liquidity sweeps, OB retests, structure breaks)
  // to the candle currently shown. Null when not actively replaying.
  const replayTime =
    replayMode && hasStartBar
      ? candleTimes[Math.min(replayPosition, totalCandles - 1)]?.time ?? null
      : null;


  // Notify the parent whenever the playback head moves so sibling panels
  // (confluence checklist) can follow the replay.
  useEffect(() => {
    onReplayTimeChange?.(replayTime);
  }, [replayTime, onReplayTimeChange]);

  // Candle-close countdown + its vertical position (tracks last price on the axis)
  const [countdown, setCountdown] = useState<number>(0);

  const [countdownY, setCountdownY] = useState<number | null>(null);
  const [lastDirectionUp, setLastDirectionUp] = useState(true);
  const lastCloseRef = useRef<number | null>(null);

  // FVG zones from WebSocket
  const { zones } = useFvgWebSocket({ symbol, timeframe });

  // Tick the candle-close countdown every second.
  // Bar boundaries align to the UTC epoch, so this works on every timeframe.
  useEffect(() => {
    const intervalSec = timeframeToSeconds(timeframe);

    const tick = () => {
      const nowSec = Date.now() / 1000;
      setCountdown(intervalSec - (nowSec % intervalSec));
      // Keep the badge pinned to the latest price level on the axis
      const series = seriesRef.current;
      if (series && lastCloseRef.current !== null) {
        setCountdownY(series.priceToCoordinate(lastCloseRef.current));
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timeframe]);




  // Initialize chart
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

    const candleSeries = chart.addSeries(CandlestickSeries);
    chartRef.current = chart;
    seriesRef.current = candleSeries;
    setChartReady(true);

    // Fetch initial historical data
    fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch candles: ${res.status}`);
        return res.json();
      })
      .then((data: Candle[]) => {
        candlesRef.current = data;
        if (data.length > 0) {
          const last = data[data.length - 1];
          lastCloseRef.current = last.close;
          setLastDirectionUp(last.close >= last.open);
        }
        candleSeries.setData(

          data.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
        setCandleTimes(data.map((c) => ({ time: c.time })));
        chart.timeScale().fitContent();
      })
      .catch((err) => setError(err.message));

    // Click handler — pick a start bar while "select bar" is armed
    const handleClick = (param: MouseEventParams<Time>) => {
      if (!selectingBarRef.current || param.time === undefined) return;
      const clickedTime = param.time as number;
      const candles = candlesRef.current;
      const idx = candles.findIndex((c) => c.time === clickedTime);
      if (idx >= 0) {
        setReplayPosition(idx);
        setSelectingBar(false);
      }
    };
    chart.subscribeClick(handleClick);

    // Resize handler

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    // Also track container size changes (e.g. the sidebar collapsing) which
    // don't fire a window resize.
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setChartReady(false);
    };
  }, [symbol, timeframe]);

  // Live updates are paused while in replay mode
  const replayModeRef = useRef(replayMode);
  replayModeRef.current = replayMode;

  // WebSocket handlers
  const handleCandleUpdate = useCallback((candle: Candle) => {
    if (replayModeRef.current || !seriesRef.current) return;
    // Keep the full dataset in sync (updates the last candle in place)
    const candles = candlesRef.current;
    if (candles.length > 0 && candles[candles.length - 1].time === candle.time) {
      candles[candles.length - 1] = candle;
    }
    lastCloseRef.current = candle.close;
    setLastDirectionUp(candle.close >= candle.open);
    if (seriesRef.current) {
      setCountdownY(seriesRef.current.priceToCoordinate(candle.close));
    }
    seriesRef.current.update({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
  }, []);

  const handleCandleClosed = useCallback((candle: Candle) => {
    if (replayModeRef.current || !seriesRef.current) return;
    const candles = candlesRef.current;
    if (candles.length > 0 && candles[candles.length - 1].time === candle.time) {
      candles[candles.length - 1] = candle;
    } else {
      candles.push(candle);
      setCandleTimes((prev) => [...prev, { time: candle.time }]);
    }
    lastCloseRef.current = candle.close;
    setLastDirectionUp(candle.close >= candle.open);
    seriesRef.current.update({

      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
  }, []);

  // Clip the series to the replay position (or restore full data when off)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const toSeriesData = (c: Candle) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    });

    if (replayMode && hasStartBar) {
      series.setData(
        candlesRef.current.slice(0, replayPosition + 1).map(toSeriesData)
      );
    } else if (!replayMode) {
      series.setData(candlesRef.current.map(toSeriesData));
    }
  }, [replayMode, hasStartBar, replayPosition]);

  // Auto-advance playback
  useEffect(() => {
    if (!isPlaying || !hasStartBar) return;
    const interval = setInterval(() => {
      setReplayPosition((pos) => {
        if (pos >= totalCandles - 1) return pos;
        return pos + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(interval);
  }, [isPlaying, hasStartBar, speed, totalCandles]);

  // Stop playback at the end
  useEffect(() => {
    if (atEnd && isPlaying) setIsPlaying(false);
  }, [atEnd, isPlaying]);

  // Replay control handlers
  const handleToggleReplay = useCallback(() => {
    setReplayMode((on) => {
      const next = !on;
      if (!next) {
        // Exiting: reset replay state, full data restored by the clip effect
        setSelectingBar(false);
        setIsPlaying(false);
        setReplayPosition(-1);
      }
      return next;
    });
  }, []);

  const handleSelectBar = useCallback(() => {
    setIsPlaying(false);
    setSelectingBar((on) => !on);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!hasStartBar) return;
    setIsPlaying((p) => !p);
  }, [hasStartBar]);

  const handleStep = useCallback(() => {
    setReplayPosition((pos) =>
      pos >= 0 && pos < totalCandles - 1 ? pos + 1 : pos
    );
  }, [totalCandles]);


  // Connect WebSocket
  const { status } = useMarketWebSocket({
    url: WS_URL,
    symbol,
    timeframe,
    onCandleUpdate: handleCandleUpdate,
    onCandleClosed: handleCandleClosed,
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className={`w-full h-full ${selectingBar ? "cursor-crosshair" : ""}`}
      >

        {chartReady && (
          <>
            <AlertOverlay series={seriesRef.current} alerts={alerts ?? []} />
            {indicators?.showFvg !== false && (
              <FvgOverlay chart={chartRef.current} series={seriesRef.current} zones={zones} symbol={symbol} timeframe={timeframe} replayTime={replayTime} />
            )}
            {indicators?.showLiquidity !== false && (
              <LiquidityOverlay chart={chartRef.current} series={seriesRef.current} symbol={symbol} timeframe={timeframe} replayTime={replayTime} />
            )}
            {indicators?.showOB && (
              <OrderBlockOverlay chart={chartRef.current} series={seriesRef.current} symbol={symbol} timeframe={timeframe} replayTime={replayTime} />
            )}
            {indicators?.showKZ && (
              <KillzoneOverlay chart={chartRef.current} series={seriesRef.current} candles={candleTimes} />
            )}
            {indicators?.showBOS && (
              <BosOverlay chart={chartRef.current} series={seriesRef.current} symbol={symbol} timeframe={timeframe} replayTime={replayTime} />
            )}
            {indicators?.showVP && (
              <VolumeProfileOverlay chart={chartRef.current} series={seriesRef.current} candles={candlesRef.current} replayTime={replayTime} />
            )}

          </>

        )}
      </div>
      <ConnectionIndicator status={status} />

      {/* Candle-close countdown — pinned to the last price on the right axis */}
      {!replayMode && countdownY !== null && (
        <div
          className="absolute right-0 z-10 px-1.5 py-0.5 text-[11px] font-medium text-white rounded-l pointer-events-none tabular-nums"
          style={{
            top: countdownY,
            transform: "translateY(6px)",
            backgroundColor: lastDirectionUp ? "#089981" : "#f23645",
          }}
        >
          {formatCountdown(countdown)}
        </div>
      )}

      {/* Bar replay toolbar */}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
        <BarReplayControls
          replayMode={replayMode}
          selectingBar={selectingBar}
          isPlaying={isPlaying}
          speed={speed}
          hasStartBar={hasStartBar}
          atEnd={atEnd}
          currentPosition={replayPosition + 1}
          totalCandles={totalCandles}
          onToggleReplay={handleToggleReplay}
          onSelectBar={handleSelectBar}
          onPlayPause={handlePlayPause}
          onStep={handleStep}
          onSpeedChange={setSpeed}
        />
      </div>

      {/* Select-bar hint */}
      {selectingBar && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-amber-600/90 text-white text-xs rounded shadow">
          Click a candle to set the replay start point
        </div>
      )}
    </div>
  );
}


function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const colorMap: Record<ConnectionStatus, string> = {
    connected: "bg-green-500",
    connecting: "bg-yellow-500",
    disconnected: "bg-red-500",
  };

  const labelMap: Record<ConnectionStatus, string> = {
    connected: "Live",
    connecting: "Connecting...",
    disconnected: "Disconnected",
  };

  return (
    <div className="absolute top-3 right-3 flex items-center gap-2 px-2 py-1 bg-black/60 rounded text-xs">
      <span className={`w-2 h-2 rounded-full ${colorMap[status]}`} />
      <span className="text-gray-300">{labelMap[status]}</span>
    </div>
  );
}
