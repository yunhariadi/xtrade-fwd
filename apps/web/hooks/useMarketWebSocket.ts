"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Candle } from "@ict-forward-lab/core";
import { parseWsMessage } from "@ict-forward-lab/core";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface UseMarketWebSocketOptions {
  url: string;
  symbol: string;
  timeframe: string;
  onCandleUpdate?: (candle: Candle) => void;
  onCandleClosed?: (candle: Candle) => void;
}

export function useMarketWebSocket(options: UseMarketWebSocketOptions) {
  const { url, symbol, timeframe, onCandleUpdate, onCandleClosed } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      const msg = parseWsMessage(event.data);
      if (!msg) return;
      if (msg.data.symbol !== symbol || msg.data.timeframe !== timeframe) return;

      if (msg.event === "candle:update") {
        onCandleUpdate?.(msg.data.candle);
      } else if (msg.event === "candle:closed") {
        onCandleClosed?.(msg.data.candle);
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [url, symbol, timeframe, onCandleUpdate, onCandleClosed]);

  const scheduleReconnect = useCallback(() => {
    const delay = getReconnectDelay(reconnectAttemptRef.current);
    reconnectAttemptRef.current++;
    reconnectTimerRef.current = setTimeout(connect, delay);
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { status };
}

export function getReconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 60000);
}
