import type { FastifyInstance } from "fastify";

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/api/health", async (_request, reply) => {
    try {
      await fastify.db.query("SELECT 1");
      return { status: "ok" };
    } catch {
      reply.status(503);
      return { status: "error", message: "Database unavailable" };
    }
  });
}
