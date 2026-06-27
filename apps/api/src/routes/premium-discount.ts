import type { FastifyInstance, FastifyRequest } from "fastify";
import { dbRowToCandle } from "@ict-forward-lab/core";
import { computePremiumDiscount } from "@ict-forward-lab/strategies";
import { premiumDiscountSchema } from "../schemas";
import { getExchange } from "../market-data/market-source";

interface PremiumDiscountQuery {
  symbol?: string;
  timeframe?: string;
}

/**
 * GET /api/premium-discount — equilibrium / premium / discount array for a
 * symbol+timeframe, computed on the most recent ~200 closed candles. Thin
 * route; the ICT math lives in @ict-forward-lab/strategies.
 */
export async function premiumDiscountRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/premium-discount",
    { schema: premiumDiscountSchema },
    async (request: FastifyRequest<{ Querystring: PremiumDiscountQuery }>, reply) => {
      const { symbol, timeframe } = request.query;
      if (!symbol || !timeframe) {
        reply.status(400);
        return { error: "bad_request", message: "symbol and timeframe required" };
      }

      const result = await fastify.db.query(
        `SELECT * FROM (
           SELECT * FROM candles WHERE exchange = $3 AND symbol = $1 AND timeframe = $2 AND is_closed = true
           ORDER BY open_time DESC LIMIT 200
         ) sub ORDER BY open_time ASC`,
        [symbol.toUpperCase(), timeframe, getExchange()]
      );

      const candles = result.rows.map(dbRowToCandle);
      return computePremiumDiscount(candles);
    }
  );
}
