import type { FastifyInstance } from "fastify";
import type { WsServer } from "./ws-server";

/**
 * Registry to hold the WsServer reference so the forward-test plugin can access it.
 * Set by the market-data plugin during initialization.
 */
let wsServerInstance: WsServer | null = null;

export function setWsServer(ws: WsServer): void {
  wsServerInstance = ws;
}

export function getWsServer(_fastify: FastifyInstance): WsServer {
  if (!wsServerInstance) {
    throw new Error("WsServer not initialized. Ensure market-data plugin is registered first.");
  }
  return wsServerInstance;
}
