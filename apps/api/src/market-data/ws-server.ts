import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type {
  Candle,
  WsFvgMessage,
  WsAlertTriggeredMessage,
  WsAlertExpiredMessage,
} from "@ict-forward-lab/core";
import type { StrategySignal } from "@ict-forward-lab/strategies";
import type { ForwardTrade } from "../forward-test/types";
import "@fastify/websocket";

export interface WsBroadcastMessage {
  event: "candle:update" | "candle:closed";
  data: {
    symbol: string;
    timeframe: string;
    candle: Candle;
  };
}

export class WsServer {
  private clients: Set<WebSocket> = new Set();

  constructor(private fastify: FastifyInstance) {}

  /**
   * Register the /ws route with @fastify/websocket
   */
  register(): void {
    this.fastify.get("/ws", { websocket: true }, (socket, _request) => {
      this.clients.add(socket as unknown as WebSocket);
      this.fastify.log.info(
        `WS client connected (total: ${this.clients.size})`,
      );

      socket.on("close", () => {
        this.clients.delete(socket as unknown as WebSocket);
        this.fastify.log.info(
          `WS client disconnected (total: ${this.clients.size})`,
        );
      });

      socket.on("error", (err: Error) => {
        this.fastify.log.warn(`WS client error: ${err.message}`);
        this.clients.delete(socket as unknown as WebSocket);
      });
    });
  }

  /**
   * Broadcast a candle event to all connected clients.
   */
  broadcast(
    event: "candle:update" | "candle:closed",
    candle: Candle,
    symbol: string,
    timeframe: string,
  ): void {
    const message: WsBroadcastMessage = {
      event,
      data: { symbol, timeframe, candle },
    };

    const payload = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Broadcast an FVG event (created or mitigated) to all connected clients.
   */
  broadcastFvg(message: WsFvgMessage): void {
    const payload = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Broadcast a strategy signal to all connected clients.
   */
  broadcastSignal(signal: StrategySignal): void {
    const payload = JSON.stringify({ event: "signal:new", data: signal });
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Broadcast a trade lifecycle event to all connected clients.
   */
  broadcastTrade(event: "trade:created" | "trade:updated" | "trade:closed", trade: ForwardTrade): void {
    const payload = JSON.stringify({ event, data: trade });
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Broadcast a fired price alert to all connected clients.
   */
  broadcastAlert(message: WsAlertTriggeredMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Broadcast an auto-expired alert (e.g. its source FVG zone was mitigated).
   */
  broadcastAlertExpired(message: WsAlertExpiredMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
