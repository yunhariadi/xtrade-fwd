"use client";

interface BacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number | null;
  netPnl: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  averageRR: number;
}

interface Trade {
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
}

interface BacktestResultsProps {
  metrics: BacktestMetrics;
  trades: Trade[];
}

export function BacktestResults({ metrics, trades }: BacktestResultsProps) {
  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Win Rate"
          value={`${((metrics.winRate ?? 0) * 100).toFixed(1)}%`}
          color={(metrics.winRate ?? 0) >= 0.5 ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label="Profit Factor"
          value={metrics.profitFactor == null ? "∞" : metrics.profitFactor.toFixed(2)}
          color={metrics.profitFactor == null || metrics.profitFactor > 1 ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label="Net PnL"
          value={`$${(metrics.netPnl ?? 0).toFixed(2)}`}
          color={(metrics.netPnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label="Max Drawdown"
          value={`${((metrics.maxDrawdownPercent ?? 0) * 100).toFixed(1)}%`}
          color="text-red-400"
        />
        <MetricCard
          label="Avg RR"
          value={(metrics.averageRR ?? 0).toFixed(2)}
          color={(metrics.averageRR ?? 0) > 0 ? "text-green-400" : "text-red-400"}
        />
        <MetricCard
          label="Total Trades"
          value={String(metrics.totalTrades ?? 0)}
          color="text-gray-200"
        />
      </div>

      {/* Trade Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-3 py-2 text-gray-400 font-medium">#</th>
              <th className="px-3 py-2 text-gray-400 font-medium">Side</th>
              <th className="px-3 py-2 text-gray-400 font-medium">Entry</th>
              <th className="px-3 py-2 text-gray-400 font-medium">Exit</th>
              <th className="px-3 py-2 text-gray-400 font-medium">PnL</th>
              <th className="px-3 py-2 text-gray-400 font-medium">RR</th>
              <th className="px-3 py-2 text-gray-400 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr key={trade.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <span className={trade.side === "long" ? "text-green-400" : "text-red-400"}>
                    {trade.side.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-300">
                  {trade.entryPrice?.toFixed(2) ?? "—"}
                  {trade.entryTime && (
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(trade.entryTime).toLocaleDateString()}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-300">
                  {trade.exitPrice?.toFixed(2) ?? "—"}
                  {trade.exitTime && (
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(trade.exitTime).toLocaleDateString()}
                    </span>
                  )}
                </td>
                <td className={`px-3 py-2 font-medium ${(trade.pnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {trade.pnl != null ? `$${trade.pnl.toFixed(2)}` : "—"}
                </td>
                <td className={`px-3 py-2 ${(trade.rrResult ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {trade.rrResult != null ? `${trade.rrResult.toFixed(2)}R` : "—"}
                </td>
                <td className="px-3 py-2 text-gray-400 capitalize">
                  {trade.exitReason ?? "—"}
                </td>
              </tr>
            ))}
            {trades.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No trades executed
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
