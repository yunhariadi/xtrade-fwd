import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  listAlertsSchema,
  createAlertSchema,
  updateAlertSchema,
  deleteAlertSchema,
} from "../schemas";
import type {
  CreatePriceAlertInput,
  PriceAlertDirection,
  PriceAlertStatus,
  UpdatePriceAlertInput,
} from "../alerts";

interface CreateBody {
  symbol: string;
  direction: PriceAlertDirection;
  targetPrice: number;
  repeat?: boolean;
  note?: string;
}

interface UpdateBody {
  direction?: PriceAlertDirection;
  targetPrice?: number;
  status?: PriceAlertStatus;
  repeat?: boolean;
  note?: string;
}

const VALID_DIRECTIONS: PriceAlertDirection[] = ["above", "below", "cross"];

export async function alertRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/alerts",
    { schema: listAlertsSchema },
    async (request: FastifyRequest<{ Querystring: { symbol?: string } }>) => {
      return fastify.alertStore.list(request.query.symbol);
    },
  );

  fastify.post(
    "/alerts",
    { schema: createAlertSchema },
    async (request: FastifyRequest<{ Body: CreateBody }>, reply) => {
      const { symbol, direction, targetPrice, repeat, note } = request.body;

      if (!symbol || !VALID_DIRECTIONS.includes(direction)) {
        reply.status(400);
        return { error: "bad_request", message: "symbol and a valid direction are required" };
      }
      if (typeof targetPrice !== "number" || !Number.isFinite(targetPrice)) {
        reply.status(400);
        return { error: "bad_request", message: "targetPrice must be a finite number" };
      }

      const input: CreatePriceAlertInput = {
        symbol,
        direction,
        targetPrice,
        repeat: repeat ?? false,
        note: note ?? null,
      };
      const alert = await fastify.alertStore.create(input);
      await fastify.alertMonitor.reload();
      reply.status(201);
      return alert;
    },
  );

  fastify.patch(
    "/alerts/:id",
    { schema: updateAlertSchema },
    async (request: FastifyRequest<{ Params: { id: string }; Body: UpdateBody }>, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        reply.status(400);
        return { error: "bad_request", message: "id must be an integer" };
      }

      const { direction, targetPrice, status, repeat, note } = request.body;
      if (direction !== undefined && !VALID_DIRECTIONS.includes(direction)) {
        reply.status(400);
        return { error: "bad_request", message: "invalid direction" };
      }

      const input: UpdatePriceAlertInput = { direction, targetPrice, status, repeat, note };
      const alert = await fastify.alertStore.update(id, input);
      if (!alert) {
        reply.status(404);
        return { error: "not_found", message: `alert ${id} not found` };
      }
      // Status/target/direction changes affect what the monitor watches.
      await fastify.alertMonitor.reload();
      return alert;
    },
  );

  fastify.delete(
    "/alerts/:id",
    { schema: deleteAlertSchema },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        reply.status(400);
        return { error: "bad_request", message: "id must be an integer" };
      }
      const removed = await fastify.alertStore.remove(id);
      if (!removed) {
        reply.status(404);
        return { error: "not_found", message: `alert ${id} not found` };
      }
      await fastify.alertMonitor.reload();
      return { ok: true };
    },
  );
}
