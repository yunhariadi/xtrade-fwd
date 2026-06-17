/**
 * Shared JSON schemas attached to routes so `@fastify/swagger` can emit a
 * meaningful OpenAPI document (param discovery + semantics) for API consumers
 * and agents. Response schemas are deliberately loose (no strict `response`
 * blocks on the analysis arrays) so Fastify's serializer never strips fields an
 * agent might need; the agent-critical notes live in `description`.
 */

/** Standard error envelope returned by 4xx/5xx paths. */
const errorResponse = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    statusCode: { type: "integer" },
  },
} as const;

const symbol = { type: "string", description: "Trading pair, e.g. BTCUSDT" } as const;
const timeframe = {
  type: "string",
  enum: ["5m", "15m", "1h", "4h"],
  description: "Candle timeframe",
} as const;

/** symbol + timeframe, both required — the common analysis query. */
const symbolTimeframeQuery = {
  type: "object",
  required: ["symbol", "timeframe"],
  properties: { symbol, timeframe },
} as const;

export const candlesSchema = {
  tags: ["market-data"],
  summary: "Historical OHLCV candles",
  description:
    "Closed candles, ascending by time. `time` is **Unix seconds** (Lightweight-Charts convention). Source: Postgres (durable).",
  querystring: {
    type: "object",
    required: ["symbol", "timeframe"],
    properties: {
      symbol,
      timeframe,
      limit: { type: "integer", minimum: 1, maximum: 1500, default: 500 },
    },
  },
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "number", description: "Unix seconds" },
          open: { type: "number" },
          high: { type: "number" },
          low: { type: "number" },
          close: { type: "number" },
          volume: { type: "number" },
          isClosed: { type: "boolean" },
        },
      },
    },
    400: errorResponse,
  },
} as const;

export const structureSchema = {
  tags: ["analysis"],
  summary: "Market-structure breaks (MSS + BOS)",
  description:
    "Detected structure breaks over the most recent ~300 candles. Each item has `type` (MSS|BOS), `direction`, `breakLevel`, and `time`/`fromTime` in **Unix seconds**. Computed on each call.",
  querystring: symbolTimeframeQuery,
} as const;

export const fvgSchema = {
  tags: ["analysis"],
  summary: "Fair-value-gap zones",
  description:
    "Active FVG zones tracked live in-memory for the configured market. Times are **Unix seconds**. Returns [] until the market-data feed has populated zones.",
  querystring: symbolTimeframeQuery,
} as const;

export const orderBlocksSchema = {
  tags: ["analysis"],
  summary: "Order blocks",
  description:
    "Order blocks detected over the most recent ~200 candles. Times are **Unix seconds**. Computed on each call.",
  querystring: symbolTimeframeQuery,
} as const;

export const liquiditySchema = {
  tags: ["analysis"],
  summary: "Liquidity levels (swing highs/lows) with swept status",
  description:
    "Swing-point liquidity levels with a `swept` flag and `sweptAt` time. `type` is buy-side (swing high) or sell-side (swing low). Times are **Unix seconds**.",
  querystring: symbolTimeframeQuery,
} as const;

export const signalsSchema = {
  tags: ["strategy"],
  summary: "Recent ICT A-Model signals",
  description:
    "Most recent generated signals (entry/SL/TP/riskReward + natural-language `reasons[]`). **In-memory/live** — only populated while the API has been running and ingesting the feed. `signalTime` is **Unix seconds**.",
  querystring: {
    type: "object",
    properties: {
      symbol,
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
} as const;

export const signalStatusSchema = {
  tags: ["strategy"],
  summary: "ICT confluence checklist (bias → sweep → MSS → FVG)",
  description:
    "The live confluence checklist, or — when `at` (Unix seconds) is given — the checklist as it stood at that historical moment (bar-replay). **In-memory/live** for the no-arg form.",
  querystring: {
    type: "object",
    properties: {
      symbol,
      at: { type: "integer", description: "Unix seconds; compute checklist as of this time" },
    },
  },
} as const;

export const forwardTradesListSchema = {
  tags: ["forward-test"],
  summary: "List simulated forward-test trades",
  description:
    "Trades with the running account `balance`. `entryTime`/`exitTime` are **Unix milliseconds** (note: differs from candle times, which are seconds).",
  querystring: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: [
          "pending",
          "active",
          "closed_win",
          "closed_loss",
          "closed_breakeven",
          "closed_manual",
          "cancelled",
          "expired",
        ],
      },
      symbol,
      side: { type: "string", enum: ["long", "short"] },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    },
  },
} as const;

export const forwardTradeByIdSchema = {
  tags: ["forward-test"],
  summary: "Get a single forward-test trade",
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
  },
} as const;

export const backtestRunSchema = {
  tags: ["backtest"],
  summary: "Run a backtest over a historical window",
  description:
    "Runs the ICT A-Model through the exact forward-test engine over [startDate, endDate]. Auto-fetches missing candles. Returns the stored result `id` and summary `metrics`. `profitFactor` is `null` when there are wins and zero losses (infinite).",
  body: {
    type: "object",
    required: ["startDate", "endDate"],
    properties: {
      startDate: { type: "string", description: "ISO date, e.g. 2024-01-01" },
      endDate: { type: "string", description: "ISO date, exclusive upper bound" },
      symbol: { ...symbol, default: "BTCUSDT" },
      initialBalance: { type: "number", default: 10000 },
      riskPerTradePercent: { type: "number", default: 1 },
      feePercent: { type: "number", default: 0.04 },
      slippagePercent: { type: "number", default: 0.02 },
      maxOpenTrades: { type: "integer", default: 1 },
      maxTradesPerDay: { type: "integer", default: 3 },
      minRiskReward: { type: "number", default: 2 },
      tradeTimeoutCandles: { type: "integer", default: 24 },
      maxLeverage: { type: "number", default: 10 },
    },
  },
} as const;

export const backtestResultsSchema = {
  tags: ["backtest"],
  summary: "List recent backtest result summaries",
} as const;

export const backtestResultByIdSchema = {
  tags: ["backtest"],
  summary: "Get a full backtest result (with replay candles)",
  description: "Replay candle `time` values are **Unix milliseconds**.",
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
  },
} as const;
