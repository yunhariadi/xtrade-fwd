"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CandlestickChart } from "../components/chart/CandlestickChart";
import { TimeframeSelector } from "../components/chart/TimeframeSelector";
import { IndicatorSettings, IndicatorConfig } from "../components/chart/IndicatorSettings";
import { SignalPanel } from "../components/chart/SignalPanel";
import { TradePanel } from "../components/chart/TradePanel";
import { AlertPanel } from "../components/chart/AlertPanel";
import { useSignalWebSocket } from "../hooks/useSignalWebSocket";
import { useTradeWebSocket } from "../hooks/useTradeWebSocket";
import { useAlertWebSocket, type TriggeredAlert } from "../hooks/useAlertWebSocket";
import { LogoutButton } from "../components/LogoutButton";

const INDICATOR_NAME: Record<string, string> = {
  fvg: "FVG",
  ob: "order block",
  liquidity: "liquidity",
  bos: "structure break",
};

/** Human phrase for a fired indicator alert, e.g. "touched FVG 105000–105200". */
function describeIndicatorTrigger(t: TriggeredAlert): string {
  const name = INDICATOR_NAME[t.indicatorKind ?? ""] ?? "indicator";
  const verb = t.targetKind === "zone" ? (t.trigger === "cross" ? "crossed through" : "touched") : "crossed";
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const where =
    t.targetKind === "zone" && t.priceLow != null && t.priceHigh != null
      ? `${fmt(t.priceLow)}–${fmt(t.priceHigh)}`
      : t.targetPrice != null
        ? fmt(t.targetPrice)
        : "";
  return `${verb} ${name} ${where}`.trim();
}

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

  const [sidebarTab, setSidebarTab] = useState<"signals" | "trades" | "alerts">("signals");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Unix-seconds head of the chart's bar replay; null when replay is off. Drives
  // the confluence checklist to evaluate as of the playback head.
  const [replayTime, setReplayTime] = useState<number | null>(null);
  const { signals } = useSignalWebSocket({ symbol: "BTCUSDT" });

  const { activeTrades, recentTrades, balance } = useTradeWebSocket();

  const {
    alerts,
    lastTriggered,
    dismissTriggered,
    createAlert,
    createIndicatorAlert,
    deleteAlert,
  } = useAlertWebSocket({ symbol: "BTCUSDT" });

  // Auto-dismiss the trigger toast after a few seconds.
  useEffect(() => {
    if (!lastTriggered) return;
    const id = setTimeout(dismissTriggered, 8000);
    return () => clearTimeout(id);
  }, [lastTriggered, dismissTriggered]);

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
          <LogoutButton />
        </div>
      </header>
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* min-w-0 lets this flex item shrink below the chart canvas's fixed
            pixel width when the sidebar reopens; without it the row overflows
            to the right instead of squeezing the chart. */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <CandlestickChart
            symbol="BTCUSDT"
            timeframe={timeframe}
            indicators={indicators}
            alerts={alerts}
            onReplayTimeChange={setReplayTime}
          />

        </div>
        {sidebarOpen ? (
          <aside className="w-72 shrink-0 border-l border-gray-800 flex flex-col">
            {/* Tab switcher */}
            <div className="flex items-stretch border-b border-gray-800">
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
              <button
                onClick={() => setSidebarTab("alerts")}
                className={`flex-1 px-3 py-2 text-xs font-semibold uppercase ${sidebarTab === "alerts" ? "text-gray-200 border-b-2 border-blue-500" : "text-gray-500"}`}
              >
                Alerts
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="px-2 text-gray-600 hover:text-gray-200 border-l border-gray-800"
                title="Hide panel"
                aria-label="Hide panel"
              >
                »
              </button>
            </div>
            {/* Tab content */}
            {sidebarTab === "signals" ? (
              <SignalPanel signals={signals} symbol="BTCUSDT" replayTime={replayTime} />
            ) : sidebarTab === "trades" ? (
              <TradePanel activeTrades={activeTrades} recentTrades={recentTrades} balance={balance} />
            ) : (
              <AlertPanel
                alerts={alerts}
                symbol="BTCUSDT"
                timeframe={timeframe}
                onCreate={createAlert}
                onCreateIndicator={createIndicatorAlert}
                onDelete={deleteAlert}
              />
            )}
          </aside>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-6 shrink-0 border-l border-gray-800 flex items-center justify-center text-gray-600 hover:text-gray-200 hover:bg-gray-900/60"
            title="Show panel"
            aria-label="Show panel"
          >
            «
          </button>
        )}
      </div>

      {/* Alert-triggered toast */}
      {lastTriggered && (
        <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-lg border border-amber-500/60 bg-gray-900/95 px-4 py-3 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-400">
                🔔 {lastTriggered.kind === "indicator" ? "Indicator alert" : "Price alert"}
              </div>
              <div className="mt-0.5 text-xs text-gray-300 tabular-nums">
                {lastTriggered.kind === "indicator"
                  ? `${lastTriggered.symbol} ${describeIndicatorTrigger(lastTriggered)} (@ ${lastTriggered.triggeredPrice})`
                  : `${lastTriggered.symbol} crossed ${
                      lastTriggered.direction === "above"
                        ? "above"
                        : lastTriggered.direction === "below"
                          ? "below"
                          : "through"
                    } ${lastTriggered.targetPrice} (@ ${lastTriggered.triggeredPrice})`}
              </div>
              {lastTriggered.note && (
                <div className="mt-0.5 text-xs text-gray-500">{lastTriggered.note}</div>
              )}
            </div>
            <button
              onClick={dismissTriggered}
              className="shrink-0 text-gray-500 hover:text-gray-300"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
