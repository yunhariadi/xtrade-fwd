import type { FastifyInstance, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { authConfig, hasValidSession, SESSION_COOKIE, SESSION_VALUE } from "../auth";
import { checkLoginRate, recordLoginFailure, recordLoginSuccess } from "../login-rate-limit";

interface LoginBody {
  username?: string;
  password?: string;
}

const loginSchema = {
  tags: ["auth"],
  summary: "Log in (human) and receive a session cookie",
  description:
    "Verifies username + password against AUTH_USERNAME / AUTH_PASSWORD_HASH and sets a signed, httpOnly `session` cookie. Agents should use the `x-api-key` header instead.",
  body: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: { type: "string" },
      password: { type: "string" },
    },
  },
} as const;

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login
  fastify.post(
    "/auth/login",
    { schema: loginSchema },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply) => {
      const c = authConfig();
      if (!c.passwordHash) {
        reply.code(503);
        return { error: "auth_not_configured", message: "AUTH_PASSWORD_HASH is not set" };
      }

      // Brute-force throttle, keyed by client IP.
      const rate = checkLoginRate(request.ip);
      if (!rate.allowed) {
        reply.code(429).header("retry-after", String(rate.retryAfterSec ?? 60));
        return { error: "too_many_requests", message: "Too many login attempts. Try again later." };
      }

      const { username, password } = request.body ?? {};
      const ok =
        username === c.username && (await bcrypt.compare(String(password ?? ""), c.passwordHash));

      if (!ok) {
        recordLoginFailure(request.ip);
        reply.code(401);
        return { error: "unauthorized", message: "Invalid username or password" };
      }

      recordLoginSuccess(request.ip);
      reply.setCookie(SESSION_COOKIE, SESSION_VALUE, {
        signed: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: c.maxAgeSec,
      });
      return { ok: true };
    },
  );

  // POST /api/auth/logout
  fastify.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  // GET /api/auth/me — cheap session check for the web middleware/UI
  fastify.get("/auth/me", async (request, reply) => {
    if (hasValidSession(request)) return { authenticated: true };
    reply.code(401);
    return { authenticated: false };
  });
}
