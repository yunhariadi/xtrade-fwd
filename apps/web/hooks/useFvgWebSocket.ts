"use client";

import { useEffect, useRef, useState } from "react";
import type { FvgZone } from "@ict-forward-lab/core";
import { parseWsMessage } from "@ict-forward-lab/core";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

interface UseFvgWebSocketOptions {
  symbol: string;
  timeframe: string;
}

export function useFvgWebSocket({ symbol, timeframe }: UseFvgWebSocketOptions) {
  const [zones, setZones] = useState<FvgZone[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial FVG zones
  useEffect(() => {
    fetch(`/api/fvg?symbol=${symbol}&timeframe=${timeframe}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: FvgZone[]) => setZones(data))
      .catch(() => setZones([]));
  }, [symbol, timeframe]);

  // Subscribe to WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
      const msg = parseWsMessage(event.data);
      if (!msg) return;

      if (msg.event === "fvg:created") {
        const data = msg.data as {
          symbol: string;
          timeframe: string;
          zone: FvgZone;
        };
        if (data.symbol === symbol && data.timeframe === timeframe) {
          setZones((prev) => [...prev, data.zone]);
        }
      }

      if (msg.event === "fvg:mitigated") {
        const data = msg.data as {
          symbol: string;
          timeframe: string;
          zoneId: string;
        };
        if (data.symbol === symbol && data.timeframe === timeframe) {
          setZones((prev) =>
            prev.map((z) =>
              z.id === data.zoneId
                ? { ...z, status: "mitigated" as const }
                : z
            )
          );
        }
      }

      if (msg.event === "fvg:touched") {
        const data = msg.data as {
          symbol: string;
          timeframe: string;
          zoneId: string;
        };
        if (data.symbol === symbol && data.timeframe === timeframe) {
          setZones((prev) =>
            prev.map((z) =>
              z.id === data.zoneId ? { ...z, touched: true } : z
            )
          );
        }
      }

    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [symbol, timeframe]);

  return { zones };
}
