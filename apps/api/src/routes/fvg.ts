import type { FastifyInstance, FastifyRequest } from "fastify";
import { fvgSchema } from "../schemas";

interface FvgQuery {
  symbol?: string;
  timeframe?: string;
}

export async function fvgRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/fvg",
    { schema: fvgSchema },
    async (request: FastifyRequest<{ Querystring: FvgQuery }>, reply) => {
      const { symbol, timeframe } = request.query;

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

      // Access FvgTracker via the decorated fastify instance
      const zones = fastify.fvgTracker.getZones(symbol, timeframe);
      return zones;
    },
  );
}
