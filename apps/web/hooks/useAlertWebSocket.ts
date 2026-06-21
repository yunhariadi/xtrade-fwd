"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

export type AlertDirection = "above" | "below" | "cross";
export type AlertStatus = "active" | "triggered" | "disabled";

export interface PriceAlert {
  id: number;
  exchange: string;
  symbol: string;
  direction: AlertDirection;
  targetPrice: number;
  status: AlertStatus;
  repeat: boolean;
  note: string | null;
  triggeredAt: string | null;
  triggeredPrice: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TriggeredAlert {
  id: number;
  symbol: string;
  direction: AlertDirection;
  targetPrice: number;
  triggeredPrice: number;
  triggeredAt: string;
  note: string | null;
}

export interface CreateAlertInput {
  symbol: string;
  direction: AlertDirection;
  targetPrice: number;
  repeat?: boolean;
  note?: string;
}

interface UseAlertWebSocketOptions {
  symbol: string;
}

/**
 * Loads price alerts over REST, subscribes to `alert:triggered` over the shared
 * WebSocket, and exposes CRUD helpers. `lastTriggered` carries the most recent
 * fired alert so the page can surface a toast.
 */
export function useAlertWebSocket({ symbol }: UseAlertWebSocketOptions) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [lastTriggered, setLastTriggered] = useState<TriggeredAlert | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/alerts?symbol=${symbol}`);
      if (!res.ok) return;
      const data: PriceAlert[] = await res.json();
      setAlerts(data);
    } catch {
      /* ignore */
    }
  }, [symbol]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === "alert:triggered" && msg.data) {
          const t = msg.data as TriggeredAlert;
          if (t.symbol === symbol) {
            setLastTriggered(t);
            // The fired alert changed server-side (triggered/re-armed); resync.
            void refresh();
          }
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [symbol, refresh]);

  const createAlert = useCallback(
    async (input: CreateAlertInput) => {
      const res = await fetch(`/api/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) await refresh();
      return res.ok;
    },
    [refresh],
  );

  const deleteAlert = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      if (res.ok) await refresh();
      return res.ok;
    },
    [refresh],
  );

  const setAlertStatus = useCallback(
    async (id: number, status: AlertStatus) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await refresh();
      return res.ok;
    },
    [refresh],
  );

  return {
    alerts,
    lastTriggered,
    dismissTriggered: () => setLastTriggered(null),
    createAlert,
    deleteAlert,
    setAlertStatus,
    refresh,
  };
}
