"use client";

import { useState } from "react";
import Link from "next/link";
import { CandlestickChart } from "../components/chart/CandlestickChart";
import { TimeframeSelector } from "../components/chart/TimeframeSelector";
import { IndicatorSettings, IndicatorConfig } from "../components/chart/IndicatorSettings";
import { SignalPanel } from "../components/chart/SignalPanel";
import { TradePanel } from "../components/chart/TradePanel";
import { useSignalWebSocket } from "../hooks/useSignalWebSocket";
import { useTradeWebSocket } from "../hooks/useTradeWebSocket";

export default function HomePage() {
  const [timeframe, setTimeframe] = useState("5m");
  const [indicators, setIndicators] = useState<IndicatorConfig>({
    showFvg: true,
    showLiquidity: true,
    showOB: true,
    showKZ: false,
    showBOS: false,
    showVP: false,
  });

  const [sidebarTab, setSidebarTab] = useState<"signals" | "trades">("signals");
  // Unix-seconds head of the chart's bar replay; null when replay is off. Drives
  // the confluence checklist to evaluate as of the playback head.
  const [replayTime, setReplayTime] = useState<number | null>(null);
  const { signals } = useSignalWebSocket({ symbol: "BTCUSDT" });

  const { activeTrades, recentTrades, balance } = useTradeWebSocket();

  return (
    <main className="h-screen w-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-200">BTCUSDT</h1>
          <span className="text-xs text-gray-500">Perp</span>
          <div className="w-px h-4 bg-gray-700" />
          <IndicatorSettings config={indicators} onChange={setIndicators} />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/backtest"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Backtest
          </Link>
          <TimeframeSelector active={timeframe} onChange={setTimeframe} />
        </div>
      </header>
      <div className="flex-1 flex">
        <div className="flex-1">
          <CandlestickChart
            symbol="BTCUSDT"
            timeframe={timeframe}
            indicators={indicators}
            onReplayTimeChange={setReplayTime}
          />

        </div>
        <aside className="w-72 border-l border-gray-800 flex flex-col">
          {/* Tab switcher */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setSidebarTab("signals")}
              className={`flex-1 px-3 py-2 text-xs font-semibold uppercase ${sidebarTab === "signals" ? "text-gray-200 border-b-2 border-blue-500" : "text-gray-500"}`}
            >
              Signals
            </button>
            <button
              onClick={() => setSidebarTab("trades")}
              className={`flex-1 px-3 py-2 text-xs font-semibold uppercase ${sidebarTab === "trades" ? "text-gray-200 border-b-2 border-blue-500" : "text-gray-500"}`}
            >
              Trades
            </button>
          </div>
          {/* Tab content */}
          {sidebarTab === "signals" ? (
            <SignalPanel signals={signals} symbol="BTCUSDT" replayTime={replayTime} />
          ) : (

            <TradePanel activeTrades={activeTrades} recentTrades={recentTrades} balance={balance} />
          )}
        </aside>
      </div>
    </main>
  );
}
