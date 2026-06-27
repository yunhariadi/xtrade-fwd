import type { FastifyInstance, FastifyRequest } from "fastify";
import { getKillzoneWindows } from "@ict-forward-lab/strategies";
import { killzonesSchema } from "../schemas";

interface KillzonesQuery {
  at?: string;
}

/**
 * GET /api/killzones — current + next ICT session killzone windows in Unix
 * seconds. Pure time math; no DB access. `at` overrides "now" for backtesting.
 */
export async function killzoneRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/killzones",
    { schema: killzonesSchema },
    async (request: FastifyRequest<{ Querystring: KillzonesQuery }>) => {
      const at = request.query.at ? Number(request.query.at) : NaN;
      const now = Number.isFinite(at) ? at : Math.floor(Date.now() / 1000);
      return getKillzoneWindows(now);
    }
  );
}
