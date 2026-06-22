"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AlertTrigger,
  CreateIndicatorAlertInput,
  IndicatorKind,
} from "../../hooks/useAlertWebSocket";

interface IndicatorAlertFormProps {
  symbol: string;
  timeframe: string;
  onCreate: (input: CreateIndicatorAlertInput) => Promise<boolean>;
}

interface IndicatorInstance {
  id: string;
  label: string;
  isZone: boolean;
}

const KINDS: { value: IndicatorKind; label: string; zone: boolean }[] = [
  { value: "fvg", label: "FVG", zone: true },
  { value: "ob", label: "Order Block", zone: true },
  { value: "liquidity", label: "Liquidity", zone: false },
  { value: "bos", label: "BoS / MSS", zone: false },
];

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Fetch + normalize the selectable instances for an indicator kind. */
async function fetchInstances(
  kind: IndicatorKind,
  symbol: string,
  timeframe: string,
): Promise<IndicatorInstance[]> {
  const q = `symbol=${symbol}&timeframe=${timeframe}`;
  try {
    if (kind === "fvg") {
      const rows = await fetch(`/api/fvg?${q}`).then((r) => (r.ok ? r.json() : []));
      return (rows as { id: string; direction: string; top: number; bottom: number; status: string }[])
        .filter((z) => z.status === "active")
        .map((z) => ({ id: z.id, isZone: true, label: `${z.direction} ${fmt(z.bottom)}–${fmt(z.top)}` }));
    }
    if (kind === "ob") {
      const rows = await fetch(`/api/order-blocks?${q}`).then((r) => (r.ok ? r.json() : []));
      return (rows as { id: string; direction: string; top: number; bottom: number; status: string }[])
        .filter((o) => o.status === "active")
        .map((o) => ({ id: o.id, isZone: true, label: `${o.direction} ${fmt(o.bottom)}–${fmt(o.top)}` }));
    }
    if (kind === "liquidity") {
      const rows = await fetch(`/api/liquidity?${q}`).then((r) => (r.ok ? r.json() : []));
      return (rows as { id: string; type: string; price: number; swept: boolean }[])
        .filter((l) => !l.swept)
        .map((l) => ({ id: l.id, isZone: false, label: `${l.type} ${fmt(l.price)}` }));
    }
    // bos / mss — newest first, capped.
    const rows = await fetch(`/api/structure?${q}`).then((r) => (r.ok ? r.json() : []));
    return (rows as { id: string; type: string; direction: string; breakLevel: number }[])
      .slice(-15)
      .reverse()
      .map((b) => ({ id: b.id, isZone: false, label: `${b.type} ${b.direction} ${fmt(b.breakLevel)}` }));
  } catch {
    return [];
  }
}

export function IndicatorAlertForm({ symbol, timeframe, onCreate }: IndicatorAlertFormProps) {
  const [kind, setKind] = useState<IndicatorKind>("fvg");
  const [instances, setInstances] = useState<IndicatorInstance[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [trigger, setTrigger] = useState<AlertTrigger>("touch");
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isZone = KINDS.find((k) => k.value === kind)?.zone ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchInstances(kind, symbol, timeframe);
    setInstances(list);
    setSelectedId((prev) => (list.some((i) => i.id === prev) ? prev : list[0]?.id ?? ""));
    setLoading(false);
  }, [kind, symbol, timeframe]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      setError("Pick an indicator to watch");
      return;
    }
    setSubmitting(true);
    setError(null);
    const ok = await onCreate({
      symbol,
      timeframe,
      indicatorKind: kind,
      indicatorId: selectedId,
      trigger: isZone ? trigger : undefined,
      repeat,
      note: note.trim() || undefined,
    });
    setSubmitting(false);
    if (ok) {
      setNote("");
      await load();
    } else {
      setError("Failed to create alert (instance may have expired)");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase text-gray-400">New indicator alert</div>
        <span className="text-[10px] text-gray-600">{timeframe}</span>
      </div>

      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as IndicatorKind)}
        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>

      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        disabled={loading || instances.length === 0}
        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
      >
        {loading && <option>Loading…</option>}
        {!loading && instances.length === 0 && <option value="">No active {kind.toUpperCase()} found</option>}
        {!loading &&
          instances.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
      </select>

      {isZone && (
        <div className="flex gap-2 text-xs">
          {(["touch", "cross"] as AlertTrigger[]).map((t) => (
            <label key={t} className="flex items-center gap-1 text-gray-400">
              <input
                type="radio"
                name="trigger"
                checked={trigger === t}
                onChange={() => setTrigger(t)}
                className="accent-blue-500"
              />
              {t === "touch" ? "Touch (enter)" : "Cross (through)"}
            </label>
          ))}
        </div>
      )}

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
        disabled={submitting || !selectedId}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded px-2 py-1 transition-colors"
      >
        {submitting ? "Adding…" : "Add indicator alert"}
      </button>
    </form>
  );
}
