"use client";

import { useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

export interface Signal {
  side: "long" | "short";
  symbol: string;
  timeframe: string;
  signalTime: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
  reasons: string[];
}

interface UseSignalWebSocketOptions {
  symbol: string;
}

export function useSignalWebSocket({ symbol }: UseSignalWebSocketOptions) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial signals
  useEffect(() => {
    fetch(`/api/signals?symbol=${symbol}&limit=20`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Signal[]) => setSignals(data))
      .catch(() => setSignals([]));
  }, [symbol]);

  // Subscribe to WebSocket for real-time signals
  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === "signal:new" && msg.data) {
          const signal = msg.data as Signal;
          if (signal.symbol === symbol) {
            setSignals((prev) => [signal, ...prev].slice(0, 20));
          }
        }
      } catch {}
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [symbol]);

  return { signals };
}
