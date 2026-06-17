import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { authConfig, authEnabled, isAuthorized } from "../auth";

/**
 * Cross-origin + auth gating for external/agent and human consumers.
 *
 * - CORS: allow-list from `CORS_ORIGINS` (comma-separated) or `*` by default.
 * - Cookies: registered so the auth routes can issue/read the signed `session`.
 * - Auth: when any credential is configured (`AUTH_PASSWORD_HASH` for humans
 *   and/or `API_KEY` for machines), every request must present a valid session
 *   cookie OR a matching `x-api-key`. With neither configured the API stays open
 *   (frictionless local dev).
 *
 * Always-public paths (health probe, docs, raw spec, the auth routes, and the
 * market-data WebSocket) are exempt.
 */
export const securityPlugin = fp(async (fastify: FastifyInstance) => {
  const origins = (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim());
  await fastify.register(cors, {
    origin: origins.length === 1 && origins[0] === "*" ? true : origins,
    credentials: true,
  });

  await fastify.register(cookie, { secret: authConfig().cookieSecret });

  if (!authEnabled()) {
    fastify.log.warn("[security] no API_KEY / AUTH_PASSWORD_HASH set — API is unauthenticated (dev mode)");
    return;
  }

  const isPublic = (url: string): boolean => {
    const path = url.split("?")[0];
    return (
      path === "/api/health" ||
      path === "/api/openapi.json" ||
      path.startsWith("/api/docs") ||
      path.startsWith("/api/auth/") ||
      path === "/ws"
    );
  };

  fastify.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return; // CORS preflight
    if (isPublic(request.url)) return;
    if (!isAuthorized(request)) {
      // Must `return` the reply so the async hook aborts the lifecycle; calling
      // send() alone would let the request fall through to the route handler.
      return reply.code(401).send({ error: "unauthorized", message: "Authentication required" });
    }
  });
  fastify.log.info("[security] auth enabled (session cookie and/or API key)");
});
