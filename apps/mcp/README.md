# @ict-forward-lab/mcp

An MCP (Model Context Protocol) server that exposes the ICT Forward Lab API as
tools for agents (Hermes-Agent, OpenClau, Claude Desktop/Code, …). It is a thin
stdio HTTP client over the Fastify API in `apps/api` — run that API first.

## Tools

| Tool | Source | Notes |
|---|---|---|
| `get_candles` | durable | OHLCV, time in **seconds** |
| `get_market_structure` | computed | MSS + BOS |
| `get_fvg_zones` | live | fair-value gaps (in-memory) |
| `get_order_blocks` | computed | order blocks |
| `get_liquidity_levels` | computed | swing levels + swept flag |
| `get_signals` | live | signals + reasons[] |
| `get_confluence_status` | live | bias → sweep → MSS → FVG checklist |
| `get_forward_trades` | durable | trades + balance, time in **ms** |
| `list_backtests` / `get_backtest` | durable | results & metrics |
| `run_backtest` | durable | runs the engine, returns metrics |

> Time units differ by tool — candles/structure/FVG/OB/liquidity are Unix
> **seconds**; forward-trade and backtest-replay times are **milliseconds**.
> Each tool description repeats the relevant note so the agent doesn't conflate them.

## Configuration (env)

- `API_BASE_URL` — base URL of the API (default `http://localhost:3001`)
- `API_KEY` — sent as `x-api-key` when the API has auth enabled

## Run

```bash
pnpm --filter @ict-forward-lab/mcp build   # → dist/index.js
node apps/mcp/dist/index.js                 # stdio server
# or, for development:
pnpm --filter @ict-forward-lab/mcp dev
```

## Wire into an agent host

Most MCP hosts take a command + env. Example (`mcpServers` config shape):

```json
{
  "mcpServers": {
    "ict-forward-lab": {
      "command": "node",
      "args": ["/absolute/path/to/apps/mcp/dist/index.js"],
      "env": {
        "API_BASE_URL": "http://localhost:3001",
        "API_KEY": ""
      }
    }
  }
}
```

The same API is also documented as OpenAPI 3.1 at `GET /api/openapi.json`
(Swagger UI at `/api/docs`) for agents/clients that consume REST specs directly.
