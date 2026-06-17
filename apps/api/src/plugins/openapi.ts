import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

/**
 * Serves an OpenAPI 3.1 document (built from the per-route JSON schemas) plus a
 * Swagger UI, so REST consumers and agents can discover the API surface.
 *
 * Must be registered BEFORE the route plugins so swagger can collect their
 * schemas. The raw document is also exposed at GET /api/openapi.json.
 */
export const openapiPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "ICT Forward Lab API",
        version: "0.1.0",
        description:
          "Read + analysis API for the ICT A-Model forward-test engine on BTCUSDT Futures.\n\n" +
          "**Time units (important):** candle, structure, FVG, order-block and liquidity times are Unix **seconds**; " +
          "forward-trade `entryTime`/`exitTime` and backtest replay-candle times are Unix **milliseconds**.\n\n" +
          "**Live vs durable:** `/signals`, `/signals/status` and `/fvg` read in-process engine state " +
          "(meaningful only while the API has been running and ingesting the feed). All other reads are Postgres-backed.",
      },
      servers: [{ url: process.env.API_PUBLIC_URL || "http://localhost:3001" }],
      tags: [
        { name: "market-data", description: "OHLCV candles" },
        { name: "analysis", description: "ICT structure: FVG, order blocks, liquidity, MSS/BOS" },
        { name: "strategy", description: "Live ICT A-Model signals + confluence checklist (in-memory)" },
        { name: "forward-test", description: "Simulated trades + account balance" },
        { name: "backtest", description: "Historical backtests" },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            name: "x-api-key",
            in: "header",
            description: "Set when the API_KEY env var is configured on the server.",
          },
        },
      },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: "/api/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  // Raw spec for programmatic consumers (e.g. an agent's OpenAPI tool loader).
  fastify.get("/api/openapi.json", { schema: { hide: true } }, async () => fastify.swagger());
});
