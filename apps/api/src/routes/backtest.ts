import type { FastifyInstance, FastifyRequest } from "fastify";
import { dbRowToCandle } from "@ict-forward-lab/core";
import type { CandleRow } from "@ict-forward-lab/core";
import { BacktestRunner } from "../backtest/backtest-runner";
import { BacktestStore } from "../backtest/backtest-store";
import { getExchange } from "../market-data/market-source";
import type { BacktestConfig, ReplayCandle } from "../backtest/types";
import { backtestRunSchema, backtestResultsSchema, backtestResultByIdSchema } from "../schemas";

interface RunBody {
  startDate: string;
  endDate: string;
  symbol?: string;
  initialBalance?: number;
  riskPerTradePercent?: number;
  feePercent?: number;
  slippagePercent?: number;
  maxOpenTrades?: number;
  maxTradesPerDay?: number;
  minRiskReward?: number;
  tradeTimeoutCandles?: number;
  maxLeverage?: number;
}

interface IdParams { id: string; }

export async function backtestRoutes(fastify: FastifyInstance) {
  const store = new BacktestStore(fastify.db);
  const runner = new BacktestRunner(fastify.db);

  /**
   * Load the 5m candles spanning a backtest window for chart replay.
   * Returned with `time` in Unix milliseconds (the web ReplayChart expects ms).
   */
  async function loadReplayCandles(
    symbol: string,
    startMs: number,
    endMs: number,
  ): Promise<ReplayCandle[]> {
    const result = await fastify.db.query<CandleRow>(
      `SELECT * FROM candles
       WHERE exchange = $4 AND symbol = $1 AND timeframe = '5m' AND is_closed = true
         AND open_time >= $2 AND open_time <= $3
       ORDER BY open_time ASC`,
      [symbol, new Date(startMs).toISOString(), new Date(endMs).toISOString(), getExchange()],
    );
    return result.rows.map((row) => {
      const c = dbRowToCandle(row);
      return {
        time: c.time * 1000, // seconds → milliseconds for the replay chart
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      };
    });
  }

  // POST /api/backtest/run
  fastify.post("/backtest/run", { schema: backtestRunSchema }, async (request: FastifyRequest<{ Body: RunBody }>, reply) => {
    const body = request.body;

    if (!body.startDate || !body.endDate) {
      reply.status(400);
      return { error: "bad_request", message: "startDate and endDate are required" };
    }

    if (new Date(body.startDate) >= new Date(body.endDate)) {
      reply.status(400);
      return { error: "bad_request", message: "startDate must be before endDate" };
    }

    const config: BacktestConfig = {
      symbol: body.symbol || "BTCUSDT",
      startDate: body.startDate,
      endDate: body.endDate,
      initialBalance: body.initialBalance ?? 10000,
      riskPerTradePercent: body.riskPerTradePercent ?? 1,
      feePercent: body.feePercent ?? 0.04,
      slippagePercent: body.slippagePercent ?? 0.02,
      maxOpenTrades: body.maxOpenTrades ?? 1,
      maxTradesPerDay: body.maxTradesPerDay ?? 3,
      minRiskReward: body.minRiskReward ?? 2,
      tradeTimeoutCandles: body.tradeTimeoutCandles ?? 24,
      maxLeverage: body.maxLeverage ?? 10,
    };

    try {
      const result = await runner.run(config);
      const id = await store.save(result);
      return { id, metrics: result.metrics };
    } catch (err) {
      fastify.log.error(`Backtest failed: ${(err as Error).message}`);
      reply.status(500);
      return { error: "internal_error", message: (err as Error).message };
    }
  });

  // GET /api/backtest/results
  fastify.get("/backtest/results", { schema: backtestResultsSchema }, async () => {
    return store.list();
  });

  // GET /api/backtest/results/:id
  fastify.get("/backtest/results/:id", { schema: backtestResultByIdSchema }, async (request: FastifyRequest<{ Params: IdParams }>, reply) => {
    const result = await store.getById(request.params.id);
    if (!result) {
      reply.status(404);
      return { error: "not_found", message: "Backtest result not found" };
    }

    // Attach replay candles so the web UI can render the replay tab.
    try {
      result.candles = await loadReplayCandles(result.symbol, result.startTime, result.endTime);
    } catch (err) {
      fastify.log.warn(`Could not load replay candles: ${(err as Error).message}`);
      result.candles = [];
    }

    return result;
  });
}
