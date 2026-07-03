import type { FastifyInstance } from "fastify";

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/api/health", async (_request, reply) => {
    try {
      await fastify.db.query("SELECT 1");
    } catch {
      reply.status(503);
      return { status: "error", message: "Database unavailable" };
    }

    // Feed freshness — the forward-test is only valid while ticks flow, so a
    // stale stream degrades health even though the HTTP API itself is fine.
    const feed = fastify.marketDataService?.getFeedStatus() ?? null;

    return {
      status: feed?.stale ? "degraded" : "ok",
      db: "ok",
      feed,
    };
  });
}
