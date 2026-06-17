# Authentication

The API supports **two credential types**, used by different consumers, that
coexist:

| Credential | For | Mechanism |
|---|---|---|
| **Session cookie** | Humans (the web app) | Signed httpOnly `session` cookie from `POST /api/auth/login` |
| **API key** | Agents / MCP / scripts | `x-api-key` header matching `API_KEY` |

A protected request passes if it presents **either** a valid session cookie **or**
a matching API key. This document covers both, with focus on the single-user web
login. For where auth sits among the other cross-cutting concerns, see
[api-and-agents.md](./api-and-agents.md).

---

## When auth is enforced

Auth is **opt-in**. The gate is active when **either** of these env vars is set
on `apps/api`:

- `AUTH_PASSWORD_HASH` — enables human login.
- `API_KEY` — enables machine (agent) access.

With **neither** set, the API is open (frictionless local dev) and logs a warning
at startup. With either set, every non-public request must authenticate or
receive `401 { "error": "unauthorized" }`.

### Always-public paths

These never require a credential:

- `GET /api/health`
- `GET /api/openapi.json`
- anything under `/api/docs`
- the `/api/auth/*` routes
- the `/ws` WebSocket
- CORS preflight (`OPTIONS`)

---

## Environment variables

| Var | Side | Default | Purpose |
|---|---|---|---|
| `AUTH_USERNAME` | API | `admin` | The single login username |
| `AUTH_PASSWORD_HASH` | API | *(empty)* | bcrypt hash of the password; empty disables human login |
| `AUTH_COOKIE_SECRET` | API | falls back to `API_KEY`, then a dev string | Secret that signs the session cookie |
| `API_KEY` | API | *(empty)* | Machine credential (`x-api-key`); also enables auth |
| `WEB_REQUIRE_LOGIN` | Web | `false` | When `true`, middleware redirects unauthenticated page loads to `/login` |
| `NEXT_PUBLIC_REQUIRE_LOGIN` | Web | `false` | When `true`, shows the "Sign out" button |
| `NODE_ENV` | API | — | When `production`, the cookie is marked `secure` (HTTPS only) |

> Set `WEB_REQUIRE_LOGIN` and `NEXT_PUBLIC_REQUIRE_LOGIN` together with
> `AUTH_PASSWORD_HASH`; turning on the web gate without a configured password
> would lock you out (login would return `503`).

---

## Setup

```bash
# 1. Generate a bcrypt password hash (never store the plaintext)
node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'your-password'

# 2. In .env (API side):
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=<hash from step 1>
AUTH_COOKIE_SECRET=<a long random string>

# 3. Turn the web gate on:
WEB_REQUIRE_LOGIN=true
NEXT_PUBLIC_REQUIRE_LOGIN=true
```

Restart the API and web app. Visiting any page now redirects to `/login` until
you sign in.

To **disable** login again, clear `AUTH_PASSWORD_HASH` (or set the two web flags
to `false`).

---

## Auth endpoints

### `POST /api/auth/login`

Verifies `username` + `password` and, on success, sets the session cookie.

**Body:** `{ "username": string, "password": string }`

| Status | Meaning |
|---|---|
| `200` | `{ "ok": true }` + `Set-Cookie: session=…` |
| `401` | Invalid username or password |
| `429` | Rate-limited (see below); includes `Retry-After` |
| `503` | `AUTH_PASSWORD_HASH` is not configured |

```bash
curl -i -X POST http://localhost:3001/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"your-password"}'
```

### `POST /api/auth/logout`

Clears the session cookie. Returns `{ "ok": true }`.

### `GET /api/auth/me`

Cheap session check (used by the web middleware/UI).

- `200 { "authenticated": true }` — valid cookie
- `401 { "authenticated": false }` — no/invalid cookie

---

## The session cookie

| Attribute | Value | Why |
|---|---|---|
| name | `session` | |
| signed | yes (`AUTH_COOKIE_SECRET`) | the signature is the proof of issuance |
| `httpOnly` | true | not readable by JS (XSS-resistant) |
| `sameSite` | `Lax` | CSRF mitigation; fine because web↔API is same-site |
| `path` | `/` | |
| `secure` | `true` in production | HTTPS-only off localhost |
| `maxAge` | 7 days | session lifetime |

The cookie value itself is a constant placeholder — validity is decided entirely
by the signature, so a forged or tampered cookie is rejected.

**Same-origin convenience:** the Next app proxies `/api/*` to the API
(`next.config.ts` rewrite), so the browser treats everything as one origin and
the cookie flows without any CORS-credentials configuration.

---

## Login rate limiting

`POST /api/auth/login` is brute-force throttled in memory, keyed by client IP:

- **5 failed attempts within 15 minutes → the IP is blocked for 15 minutes.**
- Blocked requests get `429` + a `Retry-After` header (seconds).
- A successful login clears the counter; restarting the API also clears it.
- While blocked, even a correct password is rejected (wait out the window or
  restart the API).

Implementation: `apps/api/src/login-rate-limit.ts`. It is **in-memory and
single-process** — right for one API instance. If you ever run multiple instances
behind a load balancer, move to `@fastify/rate-limit` backed by Redis (already in
the stack). If you put the API behind a reverse proxy, enable Fastify
`trustProxy` so `request.ip` reflects the real client.

---

## Web app integration

| Piece | File | Behavior |
|---|---|---|
| Login page | `apps/web/app/login/page.tsx` | Posts to `/api/auth/login` (same-origin), then redirects to `?next=` or `/` |
| Page gate | `apps/web/middleware.ts` | When `WEB_REQUIRE_LOGIN=true`, redirects unauthenticated page loads to `/login`. Presence-checks the `session` cookie for UX; the API is the real gate |
| Logout | `apps/web/components/LogoutButton.tsx` | Shown when `NEXT_PUBLIC_REQUIRE_LOGIN=true`; calls `/api/auth/logout` |

The middleware `matcher` excludes `/login`, `/api`, Next internals and static
assets, so those aren't redirected.

---

## How humans and agents coexist

- **Web app** → cookie login. The browser hits same-origin `/api/*` (proxied),
  carrying the cookie automatically.
- **Agents / MCP / scripts** → `x-api-key`. They do **not** use the cookie. Set
  `API_KEY` on both the API and the [MCP server](./mcp-server.md) env.

You can run with only one credential type, or both. Enabling either one turns the
gate on for everyone.

---

## Security notes

- Passwords are **bcrypt-hashed**; plaintext is never stored or transmitted at
  rest. Only the hash lives in `.env`.
- Use a strong, random `AUTH_COOKIE_SECRET`. If it falls back to the dev default,
  cookies are forgeable — set it explicitly in any non-local deployment.
- **Serve over HTTPS in production** so the `secure` cookie is actually
  transmitted; over plain HTTP off localhost the cookie won't be sent.
- `sameSite=Lax` covers the common CSRF vectors for this same-site setup.
- Scope is **single-user**. Multi-user accounts (per-user data isolation) would
  require a `users` table and `user_id` scoping across the schema — out of scope
  here.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Login returns `503` | `AUTH_PASSWORD_HASH` not set on the API |
| Login returns `429` | Rate-limited; wait out `Retry-After` or restart the API |
| Locked out after typos | Same as above — the throttle blocks the IP for 15 min |
| Redirect loop to `/login` | Web gate on but cookie not sticking — in prod, ensure HTTPS (the `secure` cookie needs it); check the API is reachable via the `/api` proxy |
| Agents get `401` | API has auth enabled; pass the matching `API_KEY` as `x-api-key` |
| Web pages never gate | `WEB_REQUIRE_LOGIN` is not `true`, or the middleware matcher excludes the path |

---

## Source

- API auth helpers: `apps/api/src/auth.ts`
- Auth routes: `apps/api/src/routes/auth.ts`
- Security/CORS/gate plugin: `apps/api/src/plugins/security.ts`
- Login throttle: `apps/api/src/login-rate-limit.ts`
- Web: `apps/web/app/login/page.tsx`, `apps/web/middleware.ts`,
  `apps/web/components/LogoutButton.tsx`
