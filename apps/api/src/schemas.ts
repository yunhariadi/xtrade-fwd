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
  enum: ["5m", "15m", "1h", "4h", "1d", "1w"],
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

export const deltasSchema = {
  tags: ["market-data"],
  summary: "Taker buy/sell volume delta per 5m bar (CVD source data)",
  description:
    "Per-5m-bucket taker buy/sell volume recorded live from the exchange trade stream (since 2026-07-03 — no earlier data exists). `delta` = buyVolume − sellVolume; `cvd` is the running sum anchored at the start of the returned window (CVD has no absolute zero). Rows with `isPartial: true` may be missing trades (stream gap) — exclude them from quantitative use. Ascending by time; `time` is **Unix seconds**.",
  querystring: {
    type: "object",
    required: ["symbol"],
    properties: {
      symbol,
      limit: { type: "integer", minimum: 1, maximum: 1500, default: 500 },
    },
  },
  response: {
    200: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "number", description: "Unix seconds (bucket open)" },
          buyVolume: { type: "number", description: "Taker-buy base volume" },
          sellVolume: { type: "number", description: "Taker-sell base volume" },
          delta: { type: "number", description: "buyVolume − sellVolume" },
          cvd: { type: "number", description: "Running sum of delta over the returned window" },
          tradeCount: { type: "number" },
          isPartial: { type: "boolean", description: "Bucket may be missing trades — exclude from calibration" },
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
  summary: "Order blocks with mitigation/invalidation state",
  description:
    "Order blocks detected over the most recent ~200 candles. Each carries lifecycle state: " +
    "`mitigated` (true once price tapped back into the zone, with `mitigatedAt`) and `status` " +
    "(`active`, or `breaker` once price closed fully through it = invalidated, with `breakTime`). " +
    "Skip blocks already mitigated/breakered to avoid setups on used liquidity. Times are " +
    "**Unix seconds**. Computed on each call.",
  querystring: symbolTimeframeQuery,
} as const;

export const mtfAlignmentSchema = {
  tags: ["analysis"],
  summary: "Multi-timeframe directional alignment in one call",
  description:
    "Collapses 5m/15m/1h/4h into a single alignment read so an agent doesn't have to call " +
    "structure/bias per timeframe. Returns each timeframe's swing `bias` and last structure " +
    "break, plus a resolved `direction` (majority side), `confidence` (0..1 fraction agreeing), " +
    "and `fullyAligned`. Times are **Unix seconds**. Computed on each call from closed candles.",
  querystring: {
    type: "object",
    properties: {
      symbol: { ...symbol, default: "BTCUSDT" },
    },
  },
} as const;

export const premiumDiscountSchema = {
  tags: ["analysis"],
  summary: "Premium/discount array (equilibrium, fib, EQH/EQL) for a timeframe",
  description:
    "The dealing range price is navigating on `timeframe` (extreme swing high → swing low), its " +
    "50% `equilibrium`, the standard fib array (0/0.25/0.5/0.75/1), explicit `premiumZone`/" +
    "`discountZone` boundaries, where the last close sits (`location` premium|discount|equilibrium " +
    "and a finer `zone`), plus clustered `equalHighs`/`equalLows` (EQH/EQL liquidity pools). Use a " +
    "higher `timeframe` (1d/1w) for the macro range. Prices absolute; times **Unix seconds**.",
  querystring: symbolTimeframeQuery,
} as const;

export const tickerSchema = {
  tags: ["market-data"],
  summary: "Live ticker — last price + 24h change",
  description:
    "Current `last` price with 24h `change`/`changePercent`, `high24h`/`low24h`/`volume24h`, and " +
    "`bid`/`ask` when the source provides them (Bybit yes; Binance returns null bid/ask). Fetched " +
    "live from the exchange REST on each call. `time` is **Unix seconds**. Saves fetching the last " +
    "candle just to read spot.",
  querystring: {
    type: "object",
    properties: {
      symbol: { ...symbol, default: "BTCUSDT" },
    },
  },
} as const;

export const killzonesSchema = {
  tags: ["analysis"],
  summary: "ICT session killzone windows (current + next)",
  description:
    "Resolves each killzone (Asian, London Open, New York, London Close) to its current-or-next " +
    "concrete occurrence in **Unix seconds**, with `active`, `secondsUntilStart`/`secondsUntilEnd`, " +
    "plus the single `current` (active) and `next` (soonest upcoming) windows. Lets an agent time " +
    "analysis to session transitions without hardcoding UTC hours. `at` overrides 'now' (Unix seconds).",
  querystring: {
    type: "object",
    properties: {
      at: { type: "integer", description: "Unix seconds; resolve windows around this time instead of now" },
    },
  },
} as const;

export const decisionPacketSchema = {
  tags: ["analysis"],
  summary: "Compact ICT decision packet for AI agents",
  description:
    "Fuses every ICT engine (weekly/session profile, AMD, IRL/ERL draw, structure, " +
    "liquidity targets, volume profile, layered bias) into one compact JSON, plus a " +
    "deterministic quant `score` (0-100, with `recommendation` gating: ignore < 50, " +
    "monitor_only 50-64, internal_alert 65-69, send_to_oc 70-79, send_to_oc_and_ha 80+) " +
    "and a short natural-language `narrative`. Designed so an agent decides from a small, " +
    "high-signal packet instead of raw candles. Each `liquidity.targets[]` carries a " +
    "`significance` rank (4 weekly > 3 daily > 2 session > 1 internal/swing) for prioritising " +
    "draws. `structure` carries the latest 15m, daily and weekly breaks; the `daily` bias layer " +
    "reads real daily structure when 1d candles are ingested. `timestamp` and all level times " +
    "are **Unix seconds**. Computed on each call from " +
    "closed candles. NOTE: the volume profile is candle-approximated and the score weights are " +
    "an untuned heuristic.",
  querystring: {
    type: "object",
    properties: {
      symbol: { ...symbol, default: "BTCUSDT" },
    },
  },
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

export const calibrationRunSchema = {
  tags: ["analysis"],
  summary: "Start a background score-calibration run",
  description:
    "Kicks off a calibration replay over [startDate, endDate] and returns immediately with " +
    "`{ id, status: 'running' }` (202). The job assembles a decision packet at each " +
    "setup-killzone 5m close, derives a tradeable setup, and resolves its outcome against " +
    "the following candles. Poll `GET /api/calibration/runs/:id` for the report: overall " +
    "win rate / avg R, win rate by score bucket (do higher scores actually win?), and " +
    "per-signal predictive lift (to re-weight SCORE_WEIGHTS). Auto-fetches missing candles. " +
    "Only one run executes at a time (returns 409 if one is already running).",
  body: {
    type: "object",
    required: ["startDate", "endDate"],
    properties: {
      startDate: { type: "string", description: "ISO date, e.g. 2024-01-01" },
      endDate: { type: "string", description: "ISO date, exclusive upper bound" },
      symbol: { ...symbol, default: "BTCUSDT" },
      horizonCandles: {
        type: "integer",
        minimum: 1,
        maximum: 500,
        default: 48,
        description: "Future 5m candles to look ahead when resolving each setup (48 = 4h)",
      },
      minRiskReward: { type: "number", minimum: 0, default: 1.5 },
      killzonesOnly: {
        type: "boolean",
        default: true,
        description: "Sample only London/New York killzone bars",
      },
    },
  },
} as const;

export const calibrationRunsSchema = {
  tags: ["analysis"],
  summary: "List recent calibration runs",
  description:
    "Recent runs (newest first) with status (running | completed | failed) and headline win rate.",
} as const;

export const calibrationRunByIdSchema = {
  tags: ["analysis"],
  summary: "Get a calibration run (status + full report when completed)",
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
  },
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

const alertDirection = {
  type: "string",
  enum: ["above", "below", "cross"],
  description:
    "Crossing direction: `above` fires when price crosses up through the target, `below` when it crosses down, `cross` for either.",
} as const;

export const listAlertsSchema = {
  tags: ["alerts"],
  summary: "List price alerts",
  description: "Price-cross alerts for the active market source, newest first.",
  querystring: {
    type: "object",
    properties: { symbol },
  },
} as const;

export const createAlertSchema = {
  tags: ["alerts"],
  summary: "Create a price-cross alert",
  description:
    "Arms an alert that fires once (or repeatedly when `repeat` is true) when the live price crosses `targetPrice` in `direction`.",
  body: {
    type: "object",
    required: ["symbol", "direction", "targetPrice"],
    properties: {
      symbol,
      direction: alertDirection,
      targetPrice: { type: "number", description: "Price level to watch" },
      repeat: { type: "boolean", description: "Re-arm after firing (default false)" },
      note: { type: "string", description: "Optional label shown when the alert fires" },
    },
  },
} as const;

export const createIndicatorAlertSchema = {
  tags: ["alerts"],
  summary: "Create an indicator alert (FVG / OB / Liquidity / BoS)",
  description:
    "Arms an alert snapshotted from a detected indicator instance. Zone indicators " +
    "(FVG, OB) fire on `touch` (price enters the zone) or `cross` (price passes fully " +
    "through it); level indicators (Liquidity, BoS) fire when price crosses the level. " +
    "`indicatorId` comes from the matching analysis endpoint (`/fvg`, `/order-blocks`, " +
    "`/liquidity`, `/structure`). The level/zone is snapshotted at create time.",
  body: {
    type: "object",
    required: ["symbol", "timeframe", "indicatorKind", "indicatorId"],
    properties: {
      symbol,
      timeframe,
      indicatorKind: {
        type: "string",
        enum: ["fvg", "ob", "liquidity", "bos"],
        description: "Indicator family to snapshot the target from",
      },
      indicatorId: {
        type: "string",
        description: "Instance id from the matching analysis endpoint",
      },
      trigger: {
        type: "string",
        enum: ["touch", "cross"],
        description: "Zone indicators only: touch = enter the zone (default), cross = pass through it",
      },
      repeat: { type: "boolean", description: "Re-arm after firing (default false)" },
      note: { type: "string", description: "Optional label shown when the alert fires" },
    },
  },
} as const;

export const updateAlertSchema = {
  tags: ["alerts"],
  summary: "Update a price alert (edit, enable/disable, re-arm)",
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
  },
  body: {
    type: "object",
    properties: {
      direction: alertDirection,
      targetPrice: { type: "number" },
      status: { type: "string", enum: ["active", "triggered", "disabled"] },
      repeat: { type: "boolean" },
      note: { type: "string" },
    },
  },
} as const;

export const deleteAlertSchema = {
  tags: ["alerts"],
  summary: "Delete a price alert",
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
  },
} as const;
