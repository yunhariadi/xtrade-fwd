import type { FastifyInstance, FastifyRequest } from "fastify";
import { CalibrationRunner, CalibrationStore } from "../calibration";
import type { CalibrationConfig } from "../calibration";
import {
  calibrationRunSchema,
  calibrationRunsSchema,
  calibrationRunByIdSchema,
} from "../schemas";

interface RunBody {
  startDate: string;
  endDate: string;
  symbol?: string;
  horizonCandles?: number;
  minRiskReward?: number;
  killzonesOnly?: boolean;
  directionMode?: "packet" | "counterHtf";
}

interface IdParams {
  id: string;
}

/**
 * Calibration runs are CPU/IO-heavy (history fetch + full replay), so they run
 * in the background: POST starts a job and returns its id; the client polls
 * GET /runs/:id for the report. A module-level guard caps concurrency at one so
 * a small VPS isn't overwhelmed by parallel replays.
 */
export async function calibrationRoutes(fastify: FastifyInstance) {
  const runner = new CalibrationRunner(fastify.db);
  const store = new CalibrationStore(fastify.db);
  let running = false;

  fastify.post(
    "/calibration/run",
    { schema: calibrationRunSchema },
    async (request: FastifyRequest<{ Body: RunBody }>, reply) => {
      const body = request.body;
      if (!body.startDate || !body.endDate) {
        reply.status(400);
        return { error: "bad_request", message: "startDate and endDate are required" };
      }
      if (new Date(body.startDate) >= new Date(body.endDate)) {
        reply.status(400);
        return { error: "bad_request", message: "startDate must be before endDate" };
      }
      if (running) {
        reply.status(409);
        return { error: "conflict", message: "A calibration run is already in progress" };
      }

      const config: CalibrationConfig = {
        symbol: body.symbol || "BTCUSDT",
        startDate: body.startDate,
        endDate: body.endDate,
        horizonCandles: body.horizonCandles ?? 48,
        minRiskReward: body.minRiskReward ?? 1.5,
        killzonesOnly: body.killzonesOnly ?? true,
        directionMode: body.directionMode ?? "packet",
      };

      const startMs = new Date(config.startDate).getTime();
      const endMs = new Date(config.endDate).getTime();
      const id = await store.create(config, startMs, endMs);

      // Fire-and-forget: run the replay without holding the HTTP connection.
      running = true;
      void runner
        .run(config)
        .then((result) => store.markCompleted(id, result.sampleCount, result.report))
        .catch(async (err) => {
          fastify.log.error(`Calibration ${id} failed: ${(err as Error).message}`);
          await store.markFailed(id, (err as Error).message).catch(() => {});
        })
        .finally(() => {
          running = false;
        });

      reply.status(202);
      return { id, status: "running" as const };
    }
  );

  fastify.get("/calibration/runs", { schema: calibrationRunsSchema }, async () => {
    return store.list();
  });

  fastify.get(
    "/calibration/runs/:id",
    { schema: calibrationRunByIdSchema },
    async (request: FastifyRequest<{ Params: IdParams }>, reply) => {
      const record = await store.getById(request.params.id);
      if (!record) {
        reply.status(404);
        return { error: "not_found", message: "Calibration run not found" };
      }
      return record;
    }
  );
}
