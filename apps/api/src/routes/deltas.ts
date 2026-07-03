import type { FastifyInstance, FastifyRequest } from "fastify";
import { deltasSchema } from "../schemas";
import { getExchange } from "../market-data/market-source";

interface DeltaQuery {
  symbol?: string;
  limit?: string;
}

interface DeltaRow {
  open_time: string | Date;
  buy_volume: string;
  sell_volume: string;
  trade_count: number;
  is_partial: boolean;
}

export async function deltaRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/deltas",
    { schema: deltasSchema },
    async (request: FastifyRequest<{ Querystring: DeltaQuery }>, reply) => {
      const { symbol, limit } = request.query;

      if (!symbol) {
        reply.status(400);
        return {
          error: "bad_request",
          message: "Parameter 'symbol' is required",
          statusCode: 400,
        };
      }

      const parsedLimit = limit ? Number(limit) : 500;
      const cappedLimit = Math.min(
        Number.isNaN(parsedLimit) ? 500 : parsedLimit,
        1500,
      );

      const result = await fastify.db.query<DeltaRow>(
        `SELECT * FROM (
           SELECT open_time, buy_volume, sell_volume, trade_count, is_partial
           FROM candle_deltas
           WHERE exchange = $3 AND symbol = $1 AND timeframe = '5m'
           ORDER BY open_time DESC LIMIT $2
         ) sub ORDER BY open_time ASC`,
        [symbol.toUpperCase(), cappedLimit, getExchange()],
      );

      // CVD is a running sum with an arbitrary anchor; anchor it at the start
      // of the returned window (recording began 2026-07-03 — there is no
      // "true" zero to anchor to).
      let cvd = 0;
      return result.rows.map((row) => {
        const buyVolume = Number(row.buy_volume);
        const sellVolume = Number(row.sell_volume);
        const delta = buyVolume - sellVolume;
        cvd += delta;
        return {
          time: Math.floor(new Date(row.open_time as string).getTime() / 1000),
          buyVolume,
          sellVolume,
          delta,
          cvd,
          tradeCount: row.trade_count,
          isPartial: row.is_partial,
        };
      });
    },
  );
}
