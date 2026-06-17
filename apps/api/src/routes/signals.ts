import type { FastifyInstance, FastifyRequest } from "fastify";
import { signalsSchema, signalStatusSchema, liquiditySchema } from "../schemas";

interface SignalsQuery {
  symbol?: string;
  limit?: string;
}

export async function signalRoutes(fastify: FastifyInstance) {
  fastify.get("/signals", { schema: signalsSchema }, async (request: FastifyRequest<{ Querystring: SignalsQuery }>, reply) => {
    const { symbol, limit } = request.query;
    const parsedLimit = limit ? Math.min(Number(limit) || 20, 100) : 20;

    const store = fastify.strategyRunner.getSignalStore();

    if (symbol) {
      return store.getBySymbol(symbol, parsedLimit);
    }
    return store.getRecent(parsedLimit);
  });

  fastify.get("/signals/status", { schema: signalStatusSchema }, async (request: FastifyRequest<{ Querystring: { at?: string; symbol?: string } }>, _reply) => {
    const { at, symbol } = request.query;
    // `at` (Unix seconds) drives bar-replay: return the checklist as of that
    // historical moment instead of the live state.
    if (at) {
      const atTime = Number(at);
      if (Number.isFinite(atTime)) {
        const sym = symbol || fastify.strategyRunner.getSymbol();
        return fastify.strategyRunner.computeStatusAt(sym, atTime);
      }
    }
    return fastify.strategyRunner.getStatus();
  });


  fastify.get("/liquidity", { schema: liquiditySchema }, async (request: FastifyRequest<{ Querystring: { symbol?: string; timeframe?: string } }>, reply) => {
    const { symbol, timeframe } = request.query;
    if (!symbol || !timeframe) {
      reply.status(400);
      return { error: "bad_request", message: "symbol and timeframe required" };
    }
    return fastify.strategyRunner.getLiquidityLevels(symbol, timeframe);
  });
}
