import type { FastifyInstance, FastifyRequest } from "fastify";
import { dbRowToCandle, type Candle } from "@ict-forward-lab/core";
import { assembleDecisionPacket } from "@ict-forward-lab/strategies";
import { decisionPacketSchema } from "../schemas";

interface DecisionPacketQuery {
  symbol?: string;
}

/**
 * GET /api/decision-packet — the agent-facing "data brain" endpoint.
 *
 * Loads the multi-timeframe candle context from Postgres, pulls active FVG
 * zones from the live tracker, and runs the pure packet assembler. The route
 * stays thin: all ICT/quant logic lives in @ict-forward-lab/strategies.
 */
export async function decisionPacketRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/decision-packet",
    { schema: decisionPacketSchema },
    async (request: FastifyRequest<{ Querystring: DecisionPacketQuery }>) => {
      const symbol = (request.query.symbol ?? "BTCUSDT").toUpperCase();

      // 4h reaches back ~33 days so weekly + previous-week ranges exist.
      const [candles5m, candles15m, candles1h, candles4h] = await Promise.all([
        loadCandles(fastify, symbol, "5m", 300),
        loadCandles(fastify, symbol, "15m", 300),
        loadCandles(fastify, symbol, "1h", 200),
        loadCandles(fastify, symbol, "4h", 200),
      ]);

      // Active FVG zones are tracked live in-memory; empty until the feed warms up.
      const fvgZones = fastify.fvgTracker?.getZones(symbol, "5m") ?? [];

      return assembleDecisionPacket({
        symbol,
        candles5m,
        candles15m,
        candles1h,
        candles4h,
        fvgZones,
      });
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
       WHERE exchange = 'binance' AND symbol = $1 AND timeframe = $2 AND is_closed = true
       ORDER BY open_time DESC LIMIT $3
     ) sub ORDER BY open_time ASC`,
    [symbol, timeframe, limit]
  );
  return result.rows.map(dbRowToCandle);
}
