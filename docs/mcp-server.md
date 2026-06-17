# MCP Server Reference (`apps/mcp`)

`@ict-forward-lab/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes the ICT Forward Lab API as **tools** for agent hosts
(Hermes-Agent, OpenClau, Claude Desktop/Code, and any MCP-compatible runtime).

It is a thin **stdio** client over the REST API (`apps/api`) — run the API first,
then point the MCP server at it. For cross-cutting topics (auth, time units,
live-vs-durable) see [api-and-agents.md](./api-and-agents.md).

```
Agent host ──spawns──► apps/mcp (stdio JSON-RPC) ──HTTP──► apps/api ──► Postgres / Binance feed
```

## Why MCP and not just REST?

- The agent host launches the server as a subprocess and gets **typed tools**
  with descriptions — no OpenAPI loader needed.
- Tool descriptions carry the unit/semantic caveats inline, so the model is less
  likely to misread (e.g.) seconds vs milliseconds.
- You control exactly which actions are exposed (read-only by default).

If your agent framework consumes OpenAPI/function specs directly instead, use the
[REST API](./rest-api.md) (`GET /api/openapi.json`) — same data.

---

## Configuration

Environment variables read at startup:

| Var | Default | Purpose |
|---|---|---|
| `API_BASE_URL` | `http://localhost:3001` | Base URL of `apps/api` |
| `API_KEY` | *(unset)* | Sent as `x-api-key` when the API requires auth |

Transport is **stdio**: stdout is the protocol channel, so all logging goes to
stderr.

---

## Build & run

```bash
# from repo root
pnpm --filter @ict-forward-lab/mcp build     # → apps/mcp/dist/index.js
node apps/mcp/dist/index.js                   # run the stdio server

# development (no build step)
pnpm --filter @ict-forward-lab/mcp dev
```

The package also declares a bin, `ict-forward-lab-mcp` → `dist/index.js`.

---

## Tool catalog

All tools return their payload as pretty-printed JSON text. On failure they
return an MCP error result with the message (`isError: true`).

| Tool | Args | Returns | Source |
|---|---|---|---|
| `get_candles` | `symbol`, `timeframe`, `limit?` | OHLCV array | durable |
| `get_market_structure` | `symbol`, `timeframe` | MSS/BOS breaks | computed |
| `get_fvg_zones` | `symbol`, `timeframe` | FVG zones | live |
| `get_order_blocks` | `symbol`, `timeframe` | order blocks | computed |
| `get_liquidity_levels` | `symbol`, `timeframe` | liquidity levels | computed |
| `get_signals` | `symbol?`, `limit?` | recent signals | live |
| `get_confluence_status` | `symbol?`, `at?` | ICT checklist | live |
| `get_forward_trades` | `status?`, `symbol?`, `side?`, `limit?` | trades + balance | durable |
| `list_backtests` | — | result summaries | durable |
| `get_backtest` | `id` | full result | durable |
| `run_backtest` | `startDate`, `endDate`, + config | id + metrics | durable |

### Argument detail

- **`symbol`** — trading pair, default `BTCUSDT` where applicable.
- **`timeframe`** — one of `5m` `15m` `1h` `4h`.
- **`limit`** — `get_candles` 1–1500 (def 500); `get_signals` 1–100 (def 20);
  `get_forward_trades` 1–500 (def 100).
- **`status`** (`get_forward_trades`) — `pending` `active` `closed_win`
  `closed_loss` `closed_breakeven` `closed_manual` `cancelled` `expired`.
- **`side`** — `long` | `short`.
- **`at`** (`get_confluence_status`) — Unix **seconds**; returns the checklist as
  of that historical moment (bar-replay) instead of live.
- **`run_backtest`** — `startDate`/`endDate` are ISO dates; optional engine knobs:
  `symbol`, `initialBalance`, `riskPerTradePercent`, `feePercent`,
  `slippagePercent`, `maxOpenTrades`, `maxTradesPerDay`, `minRiskReward`,
  `tradeTimeoutCandles`, `maxLeverage`.

Each tool maps 1:1 to a REST endpoint — see [rest-api.md](./rest-api.md) for the
full response field tables.

> **Units reminder:** candle/structure/FVG/OB/liquidity/signal times are Unix
> **seconds**; forward-trade and backtest-replay times are **milliseconds**. Each
> tool description repeats the relevant note.

---

## Wiring into an agent host

MCP hosts take a launch command + env. Generic `mcpServers` shape (used by Claude
Desktop, Claude Code, and most hosts):

```json
{
  "mcpServers": {
    "ict-forward-lab": {
      "command": "node",
      "args": ["/absolute/path/to/repo/apps/mcp/dist/index.js"],
      "env": {
        "API_BASE_URL": "http://localhost:3001",
        "API_KEY": ""
      }
    }
  }
}
```

- **Claude Code:** `claude mcp add ict-forward-lab -- node /abs/path/apps/mcp/dist/index.js`
  (set env with `-e API_BASE_URL=...`), or add the block above to your MCP config.
- **Claude Desktop:** add the block to `claude_desktop_config.json`.
- **Hermes-Agent / OpenClau / other hosts:** provide the same command + env via
  whatever MCP-server registration the host supports (stdio transport).

Make sure `apps/api` is running and reachable at `API_BASE_URL` before the agent
calls a tool.

---

## Exposing mutating tools

By default the MCP server is **read-only plus `run_backtest`** (which only writes
a backtest record). The trade-mutating REST endpoints —
`POST /forward-trades/:id/manual-close` and `.../cancel` — are intentionally
**not** registered as tools, so an agent cannot close or cancel forward-test
trades.

To opt them in, add tools in `apps/mcp/src/index.ts` that call `apiPost`, e.g.:

```ts
server.registerTool(
  "close_forward_trade",
  {
    title: "Manually close an active forward-test trade",
    description: "Closes an ACTIVE trade at currentPrice. Mutating — use with care.",
    inputSchema: { id: z.string(), currentPrice: z.number().positive() },
  },
  ({ id, currentPrice }) =>
    jsonTool(() => apiPost(`/forward-trades/${encodeURIComponent(id)}/manual-close`, { currentPrice })),
);
```

Consider gating these behind a separate write key, or a confirmation step in the
agent, before enabling.

---

## Smoke-testing

Verify the server end-to-end with the official MCP client (run from inside
`apps/mcp` so the SDK resolves):

```js
// apps/mcp/smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["--import", "tsx", "src/index.ts"],
  env: { ...process.env, API_BASE_URL: "http://localhost:3001" },
});
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);
console.log((await client.listTools()).tools.map((t) => t.name));
console.log(await client.callTool({ name: "get_confluence_status", arguments: {} }));
await client.close();
```

```bash
cd apps/mcp && node smoke.mjs   # API must be running
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Tool errors `→ 401` | API has `API_KEY` set; pass the same `API_KEY` to the MCP env |
| Tool errors `→ ECONNREFUSED` | `apps/api` not running or wrong `API_BASE_URL` |
| `get_confluence_status` all `false` / `get_signals` empty | API just (re)started; live engine hasn't ingested yet — these are in-memory |
| `Cannot find package '@modelcontextprotocol/sdk'` | Run from the package dir / after `pnpm install`; the SDK resolves from `apps/mcp` |
| JSON looks truncated in the host | Tools return full JSON as text content; check the host's display limit, not the server |

---

## Source

- Server: `apps/mcp/src/index.ts`
- Package README: `apps/mcp/README.md`
- Underlying REST contract: [rest-api.md](./rest-api.md)
