# Deployment

Turnkey deploy of ICT Forward Lab (Postgres + Redis + Fastify API + Next.js web)
to a single VPS using Docker Compose.

> The API is an analysis/decision-support service. It holds **no exchange keys**
> and places **no orders**. Still, treat it as sensitive: the decision-packet and
> calibration endpoints expose your strategy. Prefer keeping it off the public
> internet (WireGuard/Tailscale); if you must expose it, complete the security
> checklist below.

## 1. Prerequisites

- A Linux VPS with Docker Engine + the Docker Compose plugin.
- Ports: 3000 (web), 3001 (api) — or front them with a reverse proxy + TLS.

## 2. Configure

```bash
git clone <your-repo> && cd xtrade-fwd
cp .env.example .env
```

Edit `.env` and complete the **PRODUCTION CHECKLIST** at the top of the file:

| Variable | Why |
|----------|-----|
| `API_KEY` | Empty = open API. Set a long random secret; the web app and MCP send it as `x-api-key`. |
| `CORS_ORIGINS` | Replace `*` with your web origin(s). |
| `AUTH_PASSWORD_HASH` + `WEB_REQUIRE_LOGIN=true` | Gate the web UI. Generate a hash: `node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'your-password'` |
| `AUTH_COOKIE_SECRET` | Replace `change-me…` with a long random string. |
| `DATABASE_URL` | Use a strong DB password (and change it in `docker-compose.yml`). |
| `NEXT_PUBLIC_WS_URL` | The **public** WS URL the browser connects to, e.g. `wss://lab.example.com/ws`. Baked at build time. |

## 3. Run

```bash
# Full stack (builds api + web images, starts everything):
docker compose --profile app up -d --build

# Just the datastores (e.g. when running the Node apps on the host for dev):
docker compose up -d postgres redis
```

The `api` container runs the database migrations (idempotent —
`CREATE TABLE IF NOT EXISTS`) on every start before launching the server, so the
schema is created automatically on first boot.

Check it:

```bash
curl localhost:3001/health
# {"status":"ok","exchange_ws":...,"redis":"ok","postgres":"ok"}
docker compose logs -f api
```

Web UI: `http://<vps>:3000`. The web server proxies `/api/*` to the `api`
service in-network (`API_PROXY_TARGET=http://api:3001`, set in compose).

## 4. Seed market data

Live data flows in once the API's market-data feed connects. To backfill history
(needed before calibration/backtests), either let those endpoints auto-fetch, or
run a backtest over your target window first.

## 5. Calibrating scores

Calibration runs in the **background** (they replay history and are CPU/IO heavy):

```bash
# Start a run — returns { id, status: "running" } immediately:
curl -X POST localhost:3001/api/calibration/run \
  -H 'content-type: application/json' -H "x-api-key: $API_KEY" \
  -d '{"startDate":"2024-01-01","endDate":"2024-03-01"}'

# Poll until status is "completed":
curl localhost:3001/api/calibration/runs/<id> -H "x-api-key: $API_KEY"
```

Read `report.byScoreBucket` (do higher scores win more?) and
`report.bySignal` (sorted by predictive lift) to re-weight `SCORE_WEIGHTS` in
`packages/strategies/src/scoring/score.ts`. Only one run executes at a time
(a second concurrent request returns 409). Start with a modest window — wide
ranges fetch a lot from Binance (throttled to ~5 req/s).

## 6. MCP (agent bridge)

The MCP server (`apps/mcp`) is a **stdio subprocess** launched by an agent host
(Claude Desktop, etc.), not a long-running service — it is not in compose. Point
it at the API:

```jsonc
{
  "command": "node",
  "args": ["/path/to/xtrade-fwd/apps/mcp/dist/index.js"],
  "env": { "API_BASE_URL": "http://<vps>:3001", "API_KEY": "<same-as-api>" }
}
```

Tools include `get_decision_packet`, `run_calibration`, `get_calibration`,
`list_calibrations`.

## 7. Updating

```bash
git pull
docker compose --profile app up -d --build
```

## Reverse proxy + TLS (recommended)

Terminate TLS at nginx/Caddy/Traefik and route `https://lab.example.com` → web
(:3000) and `wss://lab.example.com/ws` → api (:3001). Set `NEXT_PUBLIC_WS_URL` to
the public `wss://…/ws` URL and rebuild the web image.
