import type { FastifyInstance, FastifyRequest } from "fastify";
import { dbRowToCandle, type Candle } from "@ict-forward-lab/core";
import { computeMtfAlignment } from "@ict-forward-lab/strategies";
import { mtfAlignmentSchema } from "../schemas";
import { getExchange } from "../market-data/market-source";

interface MtfAlignmentQuery {
  symbol?: string;
}

/** Timeframes scanned for alignment, low → high. */
const MTF_TIMEFRAMES = ["5m", "15m", "1h", "4h"] as const;

/**
 * GET /api/mtf-alignment — multi-timeframe directional alignment in one shot.
 * Loads recent closed candles per timeframe and runs the pure alignment scan,
 * so an agent gets bias + structure across TFs without N separate calls.
 */
export async function mtfAlignmentRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/mtf-alignment",
    { schema: mtfAlignmentSchema },
    async (request: FastifyRequest<{ Querystring: MtfAlignmentQuery }>) => {
      const symbol = (request.query.symbol ?? "BTCUSDT").toUpperCase();

      const inputs = await Promise.all(
        MTF_TIMEFRAMES.map(async (timeframe) => ({
          timeframe,
          candles: await loadCandles(fastify, symbol, timeframe, 200),
        }))
      );

      return { symbol, ...computeMtfAlignment(inputs) };
    }
  );
}

async function loadCandles(
  fastify: FastifyInstance,
  symbol: string,
  timeframe: string,
  limit: number
): Promise<Candle[]> {
  const result = await fastify.db.query(
    `SELECT * FROM (
       SELECT * FROM candles
       WHERE exchange = $4 AND symbol = $1 AND timeframe = $2 AND is_closed = true
       ORDER BY open_time DESC LIMIT $3
     ) sub ORDER BY open_time ASC`,
    [symbol, timeframe, limit, getExchange()]
  );
  return result.rows.map(dbRowToCandle);
}
