import type { FastifyInstance, FastifyRequest } from "fastify";
import { dbRowToCandle } from "@ict-forward-lab/core";
import { detectOrderBlocks } from "@ict-forward-lab/strategies";
import { orderBlocksSchema } from "../schemas";
import { getExchange } from "../market-data/market-source";

interface OBQuery {
  symbol?: string;
  timeframe?: string;
}

export async function orderBlockRoutes(fastify: FastifyInstance) {
  fastify.get("/order-blocks", { schema: orderBlocksSchema }, async (request: FastifyRequest<{ Querystring: OBQuery }>, reply) => {
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
      [symbol, timeframe, getExchange()]
    );

    const candles = result.rows.map(dbRowToCandle);
    const obs = detectOrderBlocks(candles, 10, true);

    return obs;
  });
}
