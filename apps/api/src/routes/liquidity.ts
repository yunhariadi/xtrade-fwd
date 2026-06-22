import type { FastifyInstance, FastifyRequest } from "fastify";
import { dbRowToCandle } from "@ict-forward-lab/core";
import { detectLiquidityLevels } from "@ict-forward-lab/strategies";
import { liquiditySchema } from "../schemas";
import { getExchange } from "../market-data/market-source";

interface LiquidityQuery {
  symbol?: string;
  timeframe?: string;
}

/**
 * Returns resting liquidity levels (swing highs = buy-side, swing lows =
 * sell-side) with a `swept` flag, for a symbol/timeframe. Feeds the chart's
 * liquidity overlay and snapshot resolution of liquidity alerts.
 */
export async function liquidityRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/liquidity",
    { schema: liquiditySchema },
    async (request: FastifyRequest<{ Querystring: LiquidityQuery }>, reply) => {
      const { symbol, timeframe } = request.query;
      if (!symbol || !timeframe) {
        reply.status(400);
        return { error: "bad_request", message: "symbol and timeframe required" };
      }

      const result = await fastify.db.query(
        `SELECT * FROM (
           SELECT * FROM candles WHERE exchange = $3 AND symbol = $1 AND timeframe = $2 AND is_closed = true
           ORDER BY open_time DESC LIMIT 300
         ) sub ORDER BY open_time ASC`,
        [symbol, timeframe, getExchange()],
      );

      const candles = result.rows.map(dbRowToCandle);
      return detectLiquidityLevels(candles, 5, 5);
    },
  );
}
