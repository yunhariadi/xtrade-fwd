import type { FastifyInstance, FastifyRequest } from "fastify";
import { tickerSchema } from "../schemas";
import { getMarketSource } from "../market-data/market-source";
import { fetchTicker } from "../market-data/ticker-fetcher";

interface TickerQuery {
  symbol?: string;
}

/**
 * GET /api/ticker — live spot ticker fetched from the active exchange REST, so
 * an agent can read current price without pulling the last candle.
 */
export async function tickerRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/ticker",
    { schema: tickerSchema },
    async (request: FastifyRequest<{ Querystring: TickerQuery }>, reply) => {
      const symbol = (request.query.symbol ?? "BTCUSDT").toUpperCase();
      try {
        return await fetchTicker(getMarketSource(), symbol);
      } catch (err) {
        reply.status(502);
        return { error: "upstream_error", message: (err as Error).message };
      }
    }
  );
}
