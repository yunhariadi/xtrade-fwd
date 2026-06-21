"use client";

import { useState } from "react";
import type {
  AlertDirection,
  CreateAlertInput,
  PriceAlert,
} from "../../hooks/useAlertWebSocket";

interface AlertPanelProps {
  alerts: PriceAlert[];
  symbol: string;
  onCreate: (input: CreateAlertInput) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
}

const DIRECTIONS: { value: AlertDirection; label: string }[] = [
  { value: "above", label: "Crosses up ▲" },
  { value: "below", label: "Crosses down ▼" },
  { value: "cross", label: "Crosses ⇅" },
];

export function AlertPanel({ alerts, symbol, onCreate, onDelete }: AlertPanelProps) {
  const [price, setPrice] = useState("");
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = alerts.filter((a) => a.status === "active");
  const triggered = alerts.filter((a) => a.status === "triggered");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPrice = Number(price);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      setError("Enter a valid price");
      return;
    }
    setSubmitting(true);
    setError(null);
    const ok = await onCreate({
      symbol,
      direction,
      targetPrice,
      repeat,
      note: note.trim() || undefined,
    });
    setSubmitting(false);
    if (ok) {
      setPrice("");
      setNote("");
    } else {
      setError("Failed to create alert");
    }
  };

  return (
    <div className="flex flex-col overflow-y-auto text-gray-200">
      {/* Create form */}
      <form onSubmit={handleSubmit} className="p-3 border-b border-gray-800 space-y-2">
        <div className="text-xs font-semibold uppercase text-gray-400">New alert</div>
        <input
          type="number"
          step="any"
          inputMode="decimal"
          placeholder="Target price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm tabular-nums focus:outline-none focus:border-blue-500"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as AlertDirection)}
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
        >
          {DIRECTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
        />
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
            className="accent-blue-500"
          />
          Repeat (re-arm after firing)
        </label>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded px-2 py-1 transition-colors"
        >
          {submitting ? "Adding…" : "Add alert"}
        </button>
      </form>

      {/* Active alerts */}
      <div className="p-3 space-y-2">
        <div className="text-xs font-semibold uppercase text-gray-400">
          Active ({active.length})
        </div>
        {active.length === 0 && <div className="text-xs text-gray-600">No active alerts</div>}
        {active.map((a) => (
          <AlertRow key={a.id} alert={a} onDelete={onDelete} />
        ))}
      </div>

      {/* Triggered history */}
      {triggered.length > 0 && (
        <div className="p-3 space-y-2 border-t border-gray-800">
          <div className="text-xs font-semibold uppercase text-gray-400">Triggered</div>
          {triggered.map((a) => (
            <AlertRow key={a.id} alert={a} onDelete={onDelete} dimmed />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertRow({
  alert,
  onDelete,
  dimmed = false,
}: {
  alert: PriceAlert;
  onDelete: (id: number) => Promise<boolean>;
  dimmed?: boolean;
}) {
  const arrow = alert.direction === "above" ? "▲" : alert.direction === "below" ? "▼" : "⇅";
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded border border-gray-800 px-2 py-1.5 ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm tabular-nums">
          <span className="text-amber-400">{arrow}</span> {alert.targetPrice}
          {alert.repeat && <span className="ml-1 text-[10px] text-gray-500">↻</span>}
        </div>
        {alert.note && <div className="truncate text-xs text-gray-500">{alert.note}</div>}
        {alert.status === "triggered" && alert.triggeredPrice !== null && (
          <div className="text-[10px] text-gray-500">
            fired @ {alert.triggeredPrice}
          </div>
        )}
      </div>
      <button
        onClick={() => onDelete(alert.id)}
        className="shrink-0 text-xs text-gray-500 hover:text-red-400 transition-colors"
        aria-label="Delete alert"
      >
        ✕
      </button>
    </div>
  );
}
