import "dotenv/config";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { securityPlugin } from "./plugins/security";
import { openapiPlugin } from "./plugins/openapi";
import { dbPlugin } from "./plugins/database";
import { marketDataPlugin } from "./plugins/market-data";
import { forwardTestPlugin } from "./plugins/forward-test";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { candleRoutes } from "./routes/candles";
import { fvgRoutes } from "./routes/fvg";
import { signalRoutes } from "./routes/signals";
import { forwardTradeRoutes } from "./routes/forward-trades";
import { backtestRoutes } from "./routes/backtest";
import { orderBlockRoutes } from "./routes/order-blocks";
import { structureRoutes } from "./routes/structure";
import { mtfAlignmentRoutes } from "./routes/mtf-alignment";
import { killzoneRoutes } from "./routes/killzones";
import { decisionPacketRoutes } from "./routes/decision-packet";
import { calibrationRoutes } from "./routes/calibration";
import { alertRoutes } from "./routes/alerts";


const app = Fastify({ logger: true });

// Register plugins. Security + OpenAPI go first: CORS/auth must wrap every
// route, and swagger must be registered before routes to collect their schemas.
app.register(websocket);
app.register(securityPlugin);
app.register(openapiPlugin);
app.register(dbPlugin);
app.register(marketDataPlugin);
app.register(forwardTestPlugin);

// Register routes
app.register(authRoutes, { prefix: "/api" });
app.register(healthRoutes);
app.register(candleRoutes, { prefix: "/api" });
app.register(fvgRoutes, { prefix: "/api" });
app.register(signalRoutes, { prefix: "/api" });
app.register(forwardTradeRoutes, { prefix: "/api" });
app.register(backtestRoutes, { prefix: "/api" });
app.register(orderBlockRoutes, { prefix: "/api" });
app.register(structureRoutes, { prefix: "/api" });
app.register(mtfAlignmentRoutes, { prefix: "/api" });
app.register(killzoneRoutes, { prefix: "/api" });
app.register(decisionPacketRoutes, { prefix: "/api" });
app.register(calibrationRoutes, { prefix: "/api" });
app.register(alertRoutes, { prefix: "/api" });

// Graceful shutdown

const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully...`);
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start server
const port = Number(process.env.API_PORT) || 3001;

app.listen({ port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});
