import type { FastifyInstance, FastifyRequest } from "fastify";
import { dbRowToCandle } from "@ict-forward-lab/core";
import { detectStructureBreaks } from "@ict-forward-lab/strategies";
import { structureSchema } from "../schemas";
import { getExchange } from "../market-data/market-source";

interface StructureQuery {
  symbol?: string;
  timeframe?: string;
}

/**
 * Returns market-structure breaks (MSS + BOS) for a symbol/timeframe.
 * Works for any timeframe — detection runs purely on the candles loaded here.
 */
export async function structureRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/structure",
    { schema: structureSchema },
    async (request: FastifyRequest<{ Querystring: StructureQuery }>, reply) => {
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
        [symbol, timeframe, getExchange()]
      );

      const candles = result.rows.map(dbRowToCandle);
      return detectStructureBreaks(candles, 5, 5);
    }
  );
}
