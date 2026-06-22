import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  listAlertsSchema,
  createAlertSchema,
  createIndicatorAlertSchema,
  updateAlertSchema,
  deleteAlertSchema,
} from "../schemas";
import {
  resolveIndicatorAlert,
  type CreatePriceAlertInput,
  type CreateIndicatorAlertInput,
  type PriceAlertDirection,
  type PriceAlertStatus,
  type UpdatePriceAlertInput,
  type AlertTrigger,
  type IndicatorKind,
} from "../alerts";
import { IndicatorNotFoundError } from "../alerts/indicator-resolver";
import { getExchange } from "../market-data/market-source";

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

interface CreateIndicatorBody {
  symbol: string;
  timeframe: string;
  indicatorKind: IndicatorKind;
  indicatorId: string;
  trigger?: AlertTrigger;
  repeat?: boolean;
  note?: string;
}

const VALID_DIRECTIONS: PriceAlertDirection[] = ["above", "below", "cross"];
const VALID_INDICATORS: IndicatorKind[] = ["fvg", "ob", "liquidity", "bos"];
const VALID_TRIGGERS: AlertTrigger[] = ["touch", "cross"];

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

  fastify.post(
    "/alerts/indicator",
    { schema: createIndicatorAlertSchema },
    async (request: FastifyRequest<{ Body: CreateIndicatorBody }>, reply) => {
      const { symbol, timeframe, indicatorKind, indicatorId, trigger, repeat, note } =
        request.body;

      if (!symbol || !timeframe || !indicatorId) {
        reply.status(400);
        return { error: "bad_request", message: "symbol, timeframe and indicatorId are required" };
      }
      if (!VALID_INDICATORS.includes(indicatorKind)) {
        reply.status(400);
        return { error: "bad_request", message: `indicatorKind must be one of ${VALID_INDICATORS.join(", ")}` };
      }
      if (trigger !== undefined && !VALID_TRIGGERS.includes(trigger)) {
        reply.status(400);
        return { error: "bad_request", message: "trigger must be 'touch' or 'cross'" };
      }

      const input: CreateIndicatorAlertInput = {
        symbol,
        timeframe,
        indicatorKind,
        indicatorId,
        trigger,
        repeat: repeat ?? false,
        note: note ?? null,
      };

      try {
        const resolved = await resolveIndicatorAlert(input, {
          pool: fastify.db,
          exchange: getExchange(),
          fvgTracker: fastify.fvgTracker,
          strategyRunner: fastify.strategyRunner,
        });
        const alert = await fastify.alertStore.createIndicator(input, resolved);
        await fastify.alertMonitor.reload();
        reply.status(201);
        return alert;
      } catch (err) {
        if (err instanceof IndicatorNotFoundError) {
          reply.status(404);
          return { error: "not_found", message: err.message };
        }
        throw err;
      }
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
