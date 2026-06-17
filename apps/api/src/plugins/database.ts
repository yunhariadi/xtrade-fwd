import { Pool } from "pg";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    db: Pool;
  }
}

export const dbPlugin = fp(async (fastify: FastifyInstance) => {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5433/ict_forward_lab",
  });

  fastify.decorate("db", pool);
  fastify.addHook("onClose", async () => {
    await pool.end();
  });
});
