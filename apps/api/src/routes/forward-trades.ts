import type { FastifyInstance, FastifyRequest } from "fastify";
import { TradeStore } from "../forward-test/trade-store";
import type { TradeStatus } from "../forward-test/types";
import {
  forwardTradesListSchema,
  forwardTradeByIdSchema,
  shadowTradeSchema,
} from "../schemas";

interface TradeListQuery {
  status?: string;
  symbol?: string;
  side?: string;
  limit?: string;
}

interface TradeIdParams {
  id: string;
}

interface ManualCloseBody {
  currentPrice: number;
}

interface ShadowTradeBody {
  symbol?: string;
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  entryType?: "limit" | "market";
  timeoutCandles?: number;
  clientOrderId?: string;
  agent?: string;
  notes?: string;
}

export async function forwardTradeRoutes(fastify: FastifyInstance) {
  const tradeStore = new TradeStore(fastify.db);

  // GET /api/forward-trades — list trades with optional filters
  fastify.get(
    "/forward-trades",
    { schema: forwardTradesListSchema },
    async (request: FastifyRequest<{ Querystring: TradeListQuery }>) => {
      const { status, symbol, side, limit } = request.query;
      const parsedLimit = limit ? Math.min(Number(limit) || 100, 500) : 100;

      const trades = await tradeStore.getAll({
        status: status as TradeStatus | undefined,
        symbol: symbol || undefined,
        side: side as "long" | "short" | undefined,
        limit: parsedLimit,
      });

      return {
        trades,
        count: trades.length,
        balance: fastify.forwardTestEngine.getAccountBalance(),
      };
    },
  );

  // GET /api/forward-trades/:id — get a single trade by ID
  fastify.get(
    "/forward-trades/:id",
    { schema: forwardTradeByIdSchema },
    async (request: FastifyRequest<{ Params: TradeIdParams }>, reply) => {
      const { id } = request.params;
      const trade = await tradeStore.getById(id);

      if (!trade) {
        reply.status(404);
        return { error: "not_found", message: "Trade not found" };
      }

      return trade;
    },
  );

  // POST /api/forward-trades/shadow — open an agent shadow trade. It enters
  // the live engine's tick lifecycle: limit entries fill on retrace, market
  // entries at the next tick, SL/TP resolve automatically, timeout applies.
  fastify.post(
    "/forward-trades/shadow",
    { schema: shadowTradeSchema },
    async (request: FastifyRequest<{ Body: ShadowTradeBody }>, reply) => {
      const b = request.body;

      try {
        const trade = await fastify.forwardTestEngine.openShadowTrade({
          symbol: b.symbol ?? "BTCUSDT",
          side: b.side,
          entry: b.entry,
          stopLoss: b.stopLoss,
          takeProfit: b.takeProfit,
          entryType: b.entryType ?? "limit",
          // Default horizon 288 five-minute bars (24h) — agents typically
          // think in longer holds than the strategy's calibrated 4h.
          timeoutCandles: b.timeoutCandles ?? 288,
          clientOrderId: b.clientOrderId,
          agent: b.agent,
          notes: b.notes,
        });
        reply.status(201);
        return trade;
      } catch (err) {
        reply.status(400);
        return { error: "bad_request", message: (err as Error).message };
      }
    },
  );

  // POST /api/forward-trades/:id/manual-close — manually close an active trade
  fastify.post(
    "/forward-trades/:id/manual-close",
    async (
      request: FastifyRequest<{ Params: TradeIdParams; Body: ManualCloseBody }>,
      reply,
    ) => {
      const { id } = request.params;
      const { currentPrice } = request.body ?? {};

      if (!currentPrice || typeof currentPrice !== "number") {
        reply.status(400);
        return { error: "bad_request", message: "currentPrice is required and must be a number" };
      }

      try {
        const trade = await fastify.forwardTestEngine.manualClose(id, currentPrice);
        return trade;
      } catch (err) {
        const message = (err as Error).message;
        if (message === "Trade not found") {
          reply.status(404);
          return { error: "not_found", message };
        }
        reply.status(400);
        return { error: "bad_request", message };
      }
    },
  );

  // POST /api/forward-trades/:id/cancel — cancel a pending trade
  fastify.post(
    "/forward-trades/:id/cancel",
    async (request: FastifyRequest<{ Params: TradeIdParams }>, reply) => {
      const { id } = request.params;

      try {
        const trade = await fastify.forwardTestEngine.cancelTrade(id);
        return trade;
      } catch (err) {
        const message = (err as Error).message;
        if (message === "Trade not found") {
          reply.status(404);
          return { error: "not_found", message };
        }
        reply.status(400);
        return { error: "bad_request", message };
      }
    },
  );
}
