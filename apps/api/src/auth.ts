import type { FastifyRequest } from "fastify";

/**
 * Single-user auth primitives shared by the security hook and the auth routes.
 *
 * Two credential types are accepted anywhere a protected route is hit:
 *  - a signed `session` cookie (humans, issued by POST /api/auth/login), or
 *  - the `x-api-key` header (agents / MCP / scripts).
 *
 * Auth is only enforced when at least one of `AUTH_PASSWORD_HASH` (human login)
 * or `API_KEY` (machine) is configured; otherwise the API stays open for local
 * dev.
 */

export const SESSION_COOKIE = "session";
/** Signed cookie payload — its value is irrelevant; the signature is the proof. */
export const SESSION_VALUE = "ok";

export function authConfig() {
  return {
    username: process.env.AUTH_USERNAME || "admin",
    /** bcrypt hash of the password; empty = human login disabled. */
    passwordHash: process.env.AUTH_PASSWORD_HASH || "",
    apiKey: process.env.API_KEY || "",
    /** Secret used to sign the session cookie. */
    cookieSecret:
      process.env.AUTH_COOKIE_SECRET || process.env.API_KEY || "dev-insecure-cookie-secret",
    /** Session lifetime (seconds). */
    maxAgeSec: 60 * 60 * 24 * 7, // 7 days
    /**
     * Whether the session cookie is `Secure` (HTTPS-only). Defaults on in
     * production, but a `Secure` cookie is silently dropped over plain HTTP, so
     * set AUTH_COOKIE_SECURE=false when serving the UI over http:// (no TLS yet).
     */
    cookieSecure:
      (process.env.AUTH_COOKIE_SECURE ??
        (process.env.NODE_ENV === "production" ? "true" : "false")) === "true",
  };
}

/** True when any auth credential is configured (else the API is open dev mode). */
export function authEnabled(): boolean {
  const c = authConfig();
  return Boolean(c.apiKey || c.passwordHash);
}

/** Valid signed session cookie? (Requires @fastify/cookie to be registered.) */
export function hasValidSession(request: FastifyRequest): boolean {
  const raw = request.cookies?.[SESSION_COOKIE];
  if (!raw) return false;
  const result = request.unsignCookie(raw);
  return result.valid && result.value === SESSION_VALUE;
}

/** Matching `x-api-key` header? */
export function hasValidApiKey(request: FastifyRequest): boolean {
  const { apiKey } = authConfig();
  return Boolean(apiKey) && request.headers["x-api-key"] === apiKey;
}

export function isAuthorized(request: FastifyRequest): boolean {
  return hasValidSession(request) || hasValidApiKey(request);
}
