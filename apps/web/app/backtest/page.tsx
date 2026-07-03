"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { BacktestForm } from "../../components/backtest/BacktestForm";
import { BacktestResults } from "../../components/backtest/BacktestResults";
import { ReplayChart } from "../../components/backtest/ReplayChart";
import { PlaybackControls } from "../../components/backtest/PlaybackControls";
import { EquityCurve } from "../../components/backtest/EquityCurve";
import { LogoutButton } from "../../components/LogoutButton";

interface BacktestData {
  id: string;
  config: {
    initialBalance: number;
  };
  trades: Array<{
    id: string;
    side: "long" | "short";
    entryTime?: number;
    entryPrice?: number;
    exitTime?: number;
    exitPrice?: number;
    pnl?: number;
    rrResult?: number;
    exitReason?: string;
    status: string;
  }>;
  metrics: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    profitFactor: number | null;
    netPnl: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    averageRR: number;
  };
  equityCurve: Array<{ time: number; balance: number }>;
  candles?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
}

type Tab = "summary" | "replay";

export default function BacktestPage() {
  const [result, setResult] = useState<BacktestData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [replayPosition, setReplayPosition] = useState(0);

  const handleResult = useCallback(async (data: unknown) => {
    const response = data as { id: string; metrics: unknown };
    
    // Fetch the full result using the returned ID
    try {
      const res = await fetch(`/api/backtest/results/${response.id}`);
      if (!res.ok) throw new Error("Failed to fetch results");
      const fullResult = await res.json();
      setResult(fullResult as BacktestData);
      setActiveTab("summary");
      setReplayPosition(0);
    } catch {
      // Fallback: use what we have from the POST response
      setResult({ ...response, config: { initialBalance: 10000 }, trades: [], equityCurve: [] } as unknown as BacktestData);
      setActiveTab("summary");
    }
  }, []);

  const handlePositionChange = useCallback(
    (pos: number) => {
      if (result?.candles && pos >= 0 && pos < result.candles.length) {
        setReplayPosition(pos);
      }
    },
    [result]
  );

  return (
    <main className="min-h-screen bg-[#0b0f14] text-[#d1d4dc]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-200">Backtest</h1>
          <span className="text-xs text-gray-500">BTCUSDT</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Live Chart
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Form */}
        <BacktestForm onResult={handleResult} />

        {/* Results */}
        {result && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-800">
              <button
                onClick={() => setActiveTab("summary")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "summary"
                    ? "text-gray-200 border-b-2 border-blue-500"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setActiveTab("replay")}
                disabled={!result.candles || result.candles.length === 0}
                className={`px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeTab === "replay"
                    ? "text-gray-200 border-b-2 border-blue-500"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Replay
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "summary" && (
              <div className="space-y-6">
                <BacktestResults
                  metrics={result.metrics}
                  trades={result.trades}
                />
                <div className="h-[250px]">
                  <EquityCurve
                    data={result.equityCurve || []}
                    initialBalance={result.config?.initialBalance ?? 10000}
                  />
                </div>
              </div>
            )}

            {activeTab === "replay" && result.candles && result.candles.length > 0 && (
              <div className="space-y-4">
                <div className="h-[500px]">
                  <ReplayChart
                    candles={result.candles}
                    currentPosition={replayPosition}
                  />
                </div>
                <PlaybackControls
                  totalCandles={result.candles.length}
                  currentPosition={replayPosition}
                  onPositionChange={handlePositionChange}
                />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
