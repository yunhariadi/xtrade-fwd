#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * MCP server exposing the ICT Forward Lab API as tools for agents
 * (Hermes-Agent, OpenClau, Claude, …). It is a thin HTTP client over the
 * Fastify API — run that API separately and point this server at it via env:
 *
 *   API_BASE_URL  default http://localhost:3001
 *   API_KEY       optional; sent as the `x-api-key` header when set
 *
 * Transport is stdio, so an agent host launches this as a subprocess.
 */

const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const API_KEY = process.env.API_KEY;

const TIME_UNITS_NOTE =
  "Times on candles, structure, FVG, order-blocks and liquidity are Unix SECONDS; " +
  "forward-trade entryTime/exitTime and backtest replay candles are Unix MILLISECONDS.";

function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  if (API_KEY) h["x-api-key"] = API_KEY;
  return h;
}

/** GET `/api{path}` with query params; returns parsed JSON or throws. */
async function apiGet(path: string, query: Record<string, unknown> = {}): Promise<unknown> {
  const url = new URL(`${API_BASE_URL}/api${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: headers() });
  const body = await res.text();
  if (!res.ok) throw new Error(`GET ${url.pathname} → ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

/** POST `/api{path}` with a JSON body; returns parsed JSON or throws. */
async function apiPost(path: string, payload: unknown): Promise<unknown> {
  const url = `${API_BASE_URL}/api${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

/** Wrap a JSON-returning call into the MCP text-content envelope. */
async function jsonTool(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
    };
  }
}

const symbol = z.string().describe("Trading pair, e.g. BTCUSDT").default("BTCUSDT");
const timeframe = z
  .enum(["5m", "15m", "1h", "4h"])
  .describe("Candle timeframe");

const server = new McpServer({ name: "ict-forward-lab", version: "0.1.0" });

server.registerTool(
  "get_candles",
  {
    title: "Get OHLCV candles",
    description: `Historical closed candles (ascending). ${TIME_UNITS_NOTE}`,
    inputSchema: {
      symbol,
      timeframe,
      limit: z.number().int().min(1).max(1500).default(500).describe("Max candles"),
    },
  },
  ({ symbol, timeframe, limit }) => jsonTool(() => apiGet("/candles", { symbol, timeframe, limit })),
);

server.registerTool(
  "get_market_structure",
  {
    title: "Get market-structure breaks (MSS + BOS)",
    description:
      "Detected structure breaks over recent candles: each has type (MSS|BOS), direction, breakLevel, and times (Unix seconds).",
    inputSchema: { symbol, timeframe },
  },
  ({ symbol, timeframe }) => jsonTool(() => apiGet("/structure", { symbol, timeframe })),
);

server.registerTool(
  "get_fvg_zones",
  {
    title: "Get fair-value-gap zones",
    description:
      "Active FVG zones tracked live in-memory. Returns [] until the API's market-data feed has populated them.",
    inputSchema: { symbol, timeframe },
  },
  ({ symbol, timeframe }) => jsonTool(() => apiGet("/fvg", { symbol, timeframe })),
);

server.registerTool(
  "get_order_blocks",
  {
    title: "Get order blocks",
    description: "Order blocks detected over recent candles (times in Unix seconds).",
    inputSchema: { symbol, timeframe },
  },
  ({ symbol, timeframe }) => jsonTool(() => apiGet("/order-blocks", { symbol, timeframe })),
);

server.registerTool(
  "get_liquidity_levels",
  {
    title: "Get liquidity levels with swept status",
    description:
      "Swing-point liquidity levels with a `swept` flag. type = buy-side (swing high) or sell-side (swing low).",
    inputSchema: { symbol, timeframe },
  },
  ({ symbol, timeframe }) => jsonTool(() => apiGet("/liquidity", { symbol, timeframe })),
);

server.registerTool(
  "get_signals",
  {
    title: "Get recent ICT A-Model signals",
    description:
      "Most recent generated signals with entry/SL/TP/riskReward and natural-language reasons[]. LIVE/in-memory — only populated while the API has been running and ingesting the feed.",
    inputSchema: {
      symbol: symbol.optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
  },
  ({ symbol, limit }) => jsonTool(() => apiGet("/signals", { symbol, limit })),
);

server.registerTool(
  "get_confluence_status",
  {
    title: "Get ICT confluence checklist (bias → sweep → MSS → FVG)",
    description:
      "The live confluence checklist, or — when `at` (Unix seconds) is given — the checklist as of that historical moment. LIVE/in-memory for the no-arg form.",
    inputSchema: {
      symbol: symbol.optional(),
      at: z.number().int().optional().describe("Unix seconds; checklist as of this time"),
    },
  },
  ({ symbol, at }) => jsonTool(() => apiGet("/signals/status", { symbol, at })),
);

server.registerTool(
  "get_forward_trades",
  {
    title: "List simulated forward-test trades",
    description: `Trades plus the running account balance. ${TIME_UNITS_NOTE}`,
    inputSchema: {
      status: z
        .enum([
          "pending",
          "active",
          "closed_win",
          "closed_loss",
          "closed_breakeven",
          "closed_manual",
          "cancelled",
          "expired",
        ])
        .optional(),
      symbol: symbol.optional(),
      side: z.enum(["long", "short"]).optional(),
      limit: z.number().int().min(1).max(500).default(100),
    },
  },
  ({ status, symbol, side, limit }) =>
    jsonTool(() => apiGet("/forward-trades", { status, symbol, side, limit })),
);

server.registerTool(
  "list_backtests",
  {
    title: "List recent backtest result summaries",
    description: "Recent backtest runs with their headline metrics.",
    inputSchema: {},
  },
  () => jsonTool(() => apiGet("/backtest/results")),
);

server.registerTool(
  "get_backtest",
  {
    title: "Get a full backtest result",
    description: "Full result incl. trades, metrics, equity curve and replay candles (replay times in Unix ms).",
    inputSchema: { id: z.string().describe("Backtest result id") },
  },
  ({ id }) => jsonTool(() => apiGet(`/backtest/results/${encodeURIComponent(id)}`)),
);

server.registerTool(
  "run_backtest",
  {
    title: "Run a backtest over a historical window",
    description:
      "Runs the ICT A-Model through the forward-test engine over [startDate, endDate]. Auto-fetches missing candles. Returns the stored id and headline metrics. profitFactor is null when there are wins and zero losses (infinite).",
    inputSchema: {
      startDate: z.string().describe("ISO date, e.g. 2024-01-01"),
      endDate: z.string().describe("ISO date, exclusive upper bound"),
      symbol: symbol.optional(),
      initialBalance: z.number().positive().optional(),
      riskPerTradePercent: z.number().positive().optional(),
      feePercent: z.number().min(0).optional(),
      slippagePercent: z.number().min(0).optional(),
      maxOpenTrades: z.number().int().positive().optional(),
      maxTradesPerDay: z.number().int().positive().optional(),
      minRiskReward: z.number().positive().optional(),
      tradeTimeoutCandles: z.number().int().positive().optional(),
      maxLeverage: z.number().positive().optional(),
    },
  },
  (args) => jsonTool(() => apiPost("/backtest/run", args)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logs must go to stderr — stdout is the MCP protocol channel.
  console.error(`[ict-forward-lab-mcp] connected; proxying ${API_BASE_URL}`);
}

main().catch((err) => {
  console.error("[ict-forward-lab-mcp] fatal:", err);
  process.exit(1);
});
