import type { FastifyInstance, FastifyRequest } from "fastify";
import { dbRowToCandle } from "@ict-forward-lab/core";
import type { CandleRow } from "@ict-forward-lab/core";
import { candlesSchema } from "../schemas";
import { getExchange } from "../market-data/market-source";

interface CandleQuery {
  symbol?: string;
  timeframe?: string;
  limit?: string;
}

export async function candleRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/candles",
    { schema: candlesSchema },
    async (request: FastifyRequest<{ Querystring: CandleQuery }>, reply) => {
      const { symbol, timeframe, limit } = request.query;

      if (!symbol) {
        reply.status(400);
        return {
          error: "bad_request",
          message: "Parameter 'symbol' is required",
          statusCode: 400,
        };
      }

      if (!timeframe) {
        reply.status(400);
        return {
          error: "bad_request",
          message: "Parameter 'timeframe' is required",
          statusCode: 400,
        };
      }

      const parsedLimit = limit ? Number(limit) : 500;
      const cappedLimit = Math.min(
        Number.isNaN(parsedLimit) ? 500 : parsedLimit,
        1500
      );

      const result = await fastify.db.query<CandleRow>(
        `SELECT * FROM (
           SELECT * FROM candles
           WHERE exchange = $4 AND symbol = $1 AND timeframe = $2 AND is_closed = true
           ORDER BY open_time DESC LIMIT $3
         ) sub ORDER BY open_time ASC`,
        [symbol, timeframe, cappedLimit, getExchange()]
      );

      return result.rows.map(dbRowToCandle);
    }
  );
}
