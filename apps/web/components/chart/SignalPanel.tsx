"use client";

import { useEffect, useState } from "react";
import type { Signal } from "../../hooks/useSignalWebSocket";

interface StrategyStatus {
  bias: "bullish" | "bearish" | "neutral";
  sweep: { detected: boolean; type?: string; level?: number };
  mss: { detected: boolean; direction?: string; level?: number };
  fvgEntry: { detected: boolean; direction?: string; entry?: number };
  lastEvaluatedAt: number | null;
}

interface SignalPanelProps {
  signals: Signal[];
  symbol?: string;
  /**
   * Unix-seconds head of the chart's bar replay. When set, the checklist is
   * fetched as of that historical moment instead of live-polled, so it tracks
   * the playback head. Null/undefined resumes live polling.
   */
  replayTime?: number | null;
}

export function SignalPanel({ signals, symbol = "BTCUSDT", replayTime = null }: SignalPanelProps) {
  const [status, setStatus] = useState<StrategyStatus | null>(null);

  // Live polling — only while not replaying.
  useEffect(() => {
    if (replayTime !== null) return;

    const fetchStatus = () => {
      fetch("/api/signals/status")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setStatus(data))
        .catch(() => {});
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [replayTime]);

  // Replay — fetch the checklist as of the playback head whenever it moves.
  useEffect(() => {
    if (replayTime === null) return;

    let cancelled = false;
    fetch(`/api/signals/status?symbol=${symbol}&at=${replayTime}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [replayTime, symbol]);


  return (
    <div className="overflow-y-auto max-h-full">
      {/* Strategy Checklist */}
      <div className="p-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase">
            Confluence Checklist
          </h3>
          {replayTime !== null && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-600/80 text-white">
              REPLAY
            </span>
          )}
        </div>

        {status ? (
          <div className="space-y-1.5">
            <ChecklistItem
              label="4H Bias"
              checked={status.bias !== "neutral"}
              detail={status.bias !== "neutral" ? status.bias : "neutral"}
              color={status.bias === "bullish" ? "green" : status.bias === "bearish" ? "red" : "gray"}
            />
            <ChecklistItem
              label="15m Liquidity Sweep"
              checked={status.sweep.detected}
              detail={status.sweep.detected ? `${status.sweep.type} @ ${status.sweep.level?.toFixed(1)}` : "—"}
              color={status.sweep.detected ? "blue" : "gray"}
            />
            <ChecklistItem
              label="15m MSS / ChoCh"
              checked={status.mss.detected}
              detail={status.mss.detected ? `${status.mss.direction} @ ${status.mss.level?.toFixed(1)}` : "—"}
              color={status.mss.detected ? "blue" : "gray"}
            />
            <ChecklistItem
              label="5m FVG Entry"
              checked={status.fvgEntry.detected}
              detail={status.fvgEntry.detected ? `${status.fvgEntry.direction} @ ${status.fvgEntry.entry?.toFixed(1)}` : "—"}
              color={status.fvgEntry.detected ? "green" : "gray"}
            />
          </div>
        ) : (
          <p className="text-xs text-gray-600">Loading...</p>
        )}
        {status?.lastEvaluatedAt && (
          <p className="text-xs text-gray-600 mt-2">
            Last eval: {new Date(status.lastEvaluatedAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Signals List */}
      <div className="p-3 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">
          Recent Signals
        </h3>
      </div>

      {signals.length === 0 ? (
        <div className="p-3 text-center text-gray-500 text-xs">
          No signals yet. Waiting for all confluence to align...
        </div>
      ) : (
        signals.map((signal, idx) => (
          <div
            key={`${signal.signalTime}-${idx}`}
            className={`p-3 border-b border-gray-800 ${
              signal.side === "long"
                ? "border-l-2 border-l-green-500"
                : "border-l-2 border-l-red-500"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className={`text-xs font-bold uppercase ${
                  signal.side === "long" ? "text-green-400" : "text-red-400"
                }`}
              >
                {signal.side}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(signal.signalTime * 1000).toLocaleTimeString()}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 text-xs mb-1">
              <div>
                <span className="text-gray-500">Entry: </span>
                <span className="text-gray-300">{signal.entry?.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-gray-500">SL: </span>
                <span className="text-red-400">{signal.stopLoss?.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-gray-500">TP: </span>
                <span className="text-green-400">{signal.takeProfit?.toFixed(1)}</span>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              RR: {signal.riskReward?.toFixed(1)} | {signal.reasons[0] || ""}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ChecklistItem({
  label,
  checked,
  detail,
  color,
}: {
  label: string;
  checked: boolean;
  detail: string;
  color: "green" | "red" | "blue" | "gray";
}) {
  const iconColor = checked ? "text-green-400" : "text-gray-600";
  const detailColorMap = {
    green: "text-green-400",
    red: "text-red-400",
    blue: "text-blue-400",
    gray: "text-gray-600",
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm ${iconColor}`}>{checked ? "✓" : "○"}</span>
      <span className="text-xs text-gray-300 flex-1">{label}</span>
      <span className={`text-xs ${detailColorMap[color]}`}>{detail}</span>
    </div>
  );
}
