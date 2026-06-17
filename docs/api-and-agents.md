# API & Agent Integration — Overview

ICT Forward Lab exposes its market data, ICT analysis, forward-test trades and
backtests through one HTTP API, and offers **two ways** for external programs and
AI agents to consume it:

| Path | Best for | Entry point |
|---|---|---|
| **OpenAPI / REST** | Any HTTP client, dashboards, agents that load an OpenAPI/function spec | `GET /api/openapi.json`, Swagger UI at `/api/docs` |
| **MCP server** | Agent hosts that speak the Model Context Protocol (Hermes-Agent, OpenClau, Claude Desktop/Code) | `apps/mcp` (stdio) |

Both surface the **same data** — the MCP server (`apps/mcp`) is a thin client
over the REST API (`apps/api`). Pick REST when your consumer talks HTTP/OpenAPI
directly; pick MCP when your agent host launches tools as subprocesses.

```
                         ┌─────────────────────────────┐
   Agent (MCP host) ───► │  apps/mcp  (stdio MCP tools) │ ──┐
                         └─────────────────────────────┘   │  HTTP
                                                            ▼
   REST / OpenAPI client ───────────────────────────►  apps/api  (Fastify)
                                                            │
                                              Postgres  ◄───┴───►  Binance WS feed
```

- **REST reference:** [rest-api.md](./rest-api.md)
- **MCP reference:** [mcp-server.md](./mcp-server.md)

---

## Cross-cutting concepts

These apply to **both** the REST API and the MCP tools.

### Base URL & prefix

Every endpoint is served under `/api` (default `http://localhost:3001`, set by
`API_PORT`). The public base URL advertised in the OpenAPI `servers` block is
`API_PUBLIC_URL` (default `http://localhost:3001`).

### Authentication

> Full reference: [authentication.md](./authentication.md). Summary below.

Auth is **opt-in**. The API accepts **two credential types**, and a protected
request passes if it presents **either**:

1. **API key (machine / agents)** — `x-api-key` header matching `API_KEY`.
2. **Session cookie (human / web app)** — a signed `session` cookie issued by
   `POST /api/auth/login`.

Auth is enforced when **either** `API_KEY` **or** `AUTH_PASSWORD_HASH` is set;
with neither configured the API stays open (frictionless local dev, logged as a
warning).

Always-public paths (never require a credential): `GET /api/health`,
`GET /api/openapi.json`, anything under `/api/docs`, the `/api/auth/*` routes, and
the `/ws` WebSocket. CORS preflight (`OPTIONS`) is also exempt.

For the MCP server / agents, set `API_KEY` in its environment — it forwards the
header. Agents do **not** use the cookie login.

#### Human login (single-user web app)

The web app (`apps/web`) logs a single user in via a signed, httpOnly cookie.
Because Next proxies `/api/*` to the API, the browser is same-origin and the
cookie "just works" (no CORS-credentials setup needed).

Setup:

```bash
# 1. Generate a bcrypt password hash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'your-password'

# 2. In .env, set (API side):
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=<hash from step 1>
AUTH_COOKIE_SECRET=<long random string>      # signs the session cookie

# 3. Turn the web page-gate on:
WEB_REQUIRE_LOGIN=true            # middleware redirects unauthenticated → /login
NEXT_PUBLIC_REQUIRE_LOGIN=true    # shows the "Sign out" button
```

Auth routes: `POST /api/auth/login` (`{username,password}` → sets cookie),
`POST /api/auth/logout` (clears it), `GET /api/auth/me` (`{authenticated:bool}`).
Sessions last 7 days; the cookie is `secure` when `NODE_ENV=production` (serve
over HTTPS in prod). The Next middleware does a presence check for redirect UX —
the API remains the real gate and rejects an invalid/forged cookie with `401`.

`POST /api/auth/login` is brute-force throttled in memory (per client IP): after
5 failed attempts within 15 minutes the IP is blocked for 15 minutes (`429` +
`Retry-After`). A successful login clears the counter; restarting the API also
clears it.

### CORS

Controlled by `CORS_ORIGINS` (comma-separated allow-list, default `*`). Only
relevant for browser-origin callers; server-to-server and MCP usage ignore it.

### Time units (read this — it's the #1 footgun)

The system mixes two time units, by design, depending on the source:

| Data | Unit |
|---|---|
| Candles (`time`) | **Unix seconds** |
| Structure breaks, FVG, order blocks, liquidity (`time`/`fromTime`/`toTime`) | **Unix seconds** |
| Strategy signals (`signalTime`) | **Unix seconds** |
| Forward trades (`entryTime`, `exitTime`, `createdAt`, `updatedAt`) | **Unix milliseconds** |
| Backtest results (`startTime`, `endTime`, replay `candles[].time`) | **Unix milliseconds** |
| `StrategyStatus.lastEvaluatedAt` | **Unix milliseconds** |

When correlating, e.g., a signal’s `signalTime` (seconds) to a forward trade’s
`entryTime` (ms), convert: `ms = seconds * 1000`. Every OpenAPI description and
every MCP tool description repeats the relevant unit so an agent doesn't conflate
them.

### Live vs durable data

Some endpoints read **in-process engine state** and are only meaningful while the
API has been running and ingesting the live Binance feed; others read **Postgres**
and are durable across restarts.

| Endpoint / tool | Source |
|---|---|
| `/signals`, `/signals/status`, `/fvg` | **live / in-memory** |
| `/candles`, `/structure`, `/order-blocks`, `/liquidity`, `/forward-trades`, `/backtest/*` | **durable (Postgres)** |

A freshly (re)started API returns an empty `/signals/status` checklist — that
means "engine just started", not "no setup".

### Error format

Errors return a JSON envelope:

```json
{ "error": "bad_request", "message": "human readable", "statusCode": 400 }
```

Common codes: `400` (validation / bad params), `401` (missing/invalid API key),
`404` (not found), `500` (internal), `503` (DB unavailable, from `/api/health`).
Request validation failures (e.g. a missing required query param) are produced by
Fastify's schema layer and return `400`.

### Mutating endpoints (caution for agents)

These change state and are intentionally **not** exposed as MCP tools by default:

- `POST /api/forward-trades/:id/manual-close`
- `POST /api/forward-trades/:id/cancel`

`POST /api/backtest/run` is exposed (it only writes a backtest record, never
touches live trades). See [mcp-server.md](./mcp-server.md#exposing-mutating-tools)
to opt the trade-mutating actions in.

---

## Quick start

```bash
# 1. Start infra + API
docker compose up -d            # Postgres + Redis
pnpm --filter @ict-forward-lab/api dev

# 2. Explore the REST API
open http://localhost:3001/api/docs            # Swagger UI
curl http://localhost:3001/api/openapi.json    # raw spec

# 3. Or run the MCP server for an agent
pnpm --filter @ict-forward-lab/mcp build
node apps/mcp/dist/index.js                     # stdio MCP server
```
