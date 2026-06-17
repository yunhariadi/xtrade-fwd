"use client";

import { useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

export interface Trade {
  id: string;
  symbol: string;
  side: "long" | "short";
  status: string;
  entryPrice?: number;
  stopLoss: number;
  takeProfit: number;
  exitPrice?: number;
  exitReason?: string;
  positionSize: number;
  riskAmount: number;
  pnl?: number;
  pnlPercent?: number;
  rrResult?: number;
  createdAt: number;
  updatedAt: number;
}

export function useTradeWebSocket() {
  const [activeTrades, setActiveTrades] = useState<Trade[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [balance, setBalance] = useState<number>(10000);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial trades
  useEffect(() => {
    fetch("/api/forward-trades?limit=50")
      .then((res) => res.ok ? res.json() : { trades: [], balance: 10000 })
      .then((data) => {
        const all = data.trades || [];
        setActiveTrades(all.filter((t: Trade) => t.status === "pending" || t.status === "active"));
        setRecentTrades(all.filter((t: Trade) => t.status !== "pending" && t.status !== "active").slice(0, 20));
        setBalance(data.balance || 10000);
      })
      .catch(() => {});
  }, []);

  // Subscribe to WebSocket
  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === "trade:created") {
          const trade = msg.data as Trade;
          setActiveTrades((prev) => [...prev, trade]);
        } else if (msg.event === "trade:updated") {
          const trade = msg.data as Trade;
          setActiveTrades((prev) => prev.map((t) => t.id === trade.id ? trade : t));
        } else if (msg.event === "trade:closed") {
          const trade = msg.data as Trade;
          setActiveTrades((prev) => prev.filter((t) => t.id !== trade.id));
          setRecentTrades((prev) => [trade, ...prev].slice(0, 20));
        }
      } catch {}
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;
    return () => { ws.close(); };
  }, []);

  return { activeTrades, recentTrades, balance };
}
