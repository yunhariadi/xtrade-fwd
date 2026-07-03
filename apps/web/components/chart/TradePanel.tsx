"use client";

import type { Trade } from "../../hooks/useTradeWebSocket";

interface TradePanelProps {
  activeTrades: Trade[];
  recentTrades: Trade[];
  balance: number;
}

/** Agent shadow trades — isolated from the strategy account, flagged in metadata. */
function isShadow(trade: Trade): boolean {
  return trade.metadata?.shadow === true;
}

function ShadowBadge() {
  return (
    <span className="px-1 py-px rounded text-[9px] font-semibold tracking-wide bg-purple-500/20 text-purple-300 border border-purple-500/40">
      SHADOW
    </span>
  );
}

export function TradePanel({ activeTrades, recentTrades, balance }: TradePanelProps) {
  return (
    <div className="overflow-y-auto max-h-full">
      {/* Account Balance */}
      <div className="p-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Balance</span>
          <span className="text-sm font-semibold text-gray-200">${balance.toFixed(2)}</span>
        </div>
      </div>

      {/* Active Trades */}
      <div className="p-3 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Active ({activeTrades.length})</h3>
        {activeTrades.length === 0 ? (
          <p className="text-xs text-gray-600">No active trades</p>
        ) : (
          activeTrades.map((trade) => (
            <ActiveTradeCard key={trade.id} trade={trade} />
          ))
        )}
      </div>

      {/* Recent Trades */}
      <div className="p-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Recent</h3>
        {recentTrades.length === 0 ? (
          <p className="text-xs text-gray-600">No closed trades yet</p>
        ) : (
          recentTrades.map((trade) => (
            <ClosedTradeCard key={trade.id} trade={trade} />
          ))
        )}
      </div>
    </div>
  );
}

function ActiveTradeCard({ trade }: { trade: Trade }) {
  const handleClose = async () => {
    // Use last known price (approximate)
    const price = trade.entryPrice || trade.stopLoss;
    await fetch(`/api/forward-trades/${trade.id}/manual-close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPrice: price }),
    });
  };

  const handleCancel = async () => {
    await fetch(`/api/forward-trades/${trade.id}/cancel`, { method: "POST" });
  };

  return (
    <div className={`p-2 mb-1 rounded bg-gray-900 border-l-2 ${trade.side === "long" ? "border-l-green-500" : "border-l-red-500"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`flex items-center gap-1.5 text-xs font-bold uppercase ${trade.side === "long" ? "text-green-400" : "text-red-400"}`}>
          {trade.side} {trade.status === "pending" ? "(pending)" : ""}
          {isShadow(trade) && <ShadowBadge />}
        </span>
        <span className="text-xs text-gray-500">{trade.positionSize.toFixed(4)}</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-xs">
        <div><span className="text-gray-500">Entry: </span><span className="text-gray-300">{trade.entryPrice?.toFixed(1) || "—"}</span></div>
        <div><span className="text-gray-500">SL: </span><span className="text-red-400">{trade.stopLoss.toFixed(1)}</span></div>
        <div><span className="text-gray-500">TP: </span><span className="text-green-400">{trade.takeProfit.toFixed(1)}</span></div>
      </div>
      <div className="flex gap-1 mt-1">
        {trade.status === "active" && (
          <button onClick={handleClose} className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded hover:bg-gray-700">Close</button>
        )}
        {trade.status === "pending" && (
          <button onClick={handleCancel} className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded hover:bg-gray-700">Cancel</button>
        )}
      </div>
    </div>
  );
}

function ClosedTradeCard({ trade }: { trade: Trade }) {
  const pnlColor = (trade.pnl ?? 0) > 0 ? "text-green-400" : (trade.pnl ?? 0) < 0 ? "text-red-400" : "text-gray-400";

  return (
    <div className="p-2 mb-1 rounded bg-gray-900/50 text-xs">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 font-bold uppercase ${trade.side === "long" ? "text-green-400/60" : "text-red-400/60"}`}>
          {trade.side}
          {isShadow(trade) && <ShadowBadge />}
        </span>
        <span className={`font-semibold ${pnlColor}`}>
          {(trade.pnl ?? 0) > 0 ? "+" : ""}{trade.pnl?.toFixed(2) || "0.00"}
        </span>
      </div>
      <div className="flex items-center justify-between text-gray-500 mt-0.5">
        <span>{trade.exitReason || trade.status}</span>
        <span>RR: {trade.rrResult?.toFixed(2) || "—"}</span>
      </div>
    </div>
  );
}
