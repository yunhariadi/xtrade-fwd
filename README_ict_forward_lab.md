# ICT Forward Lab

**ICT Forward Lab** is a web-based BTCUSDT Futures forward-testing system using **TradingView Lightweight Charts** and a custom **TypeScript Strategy Engine**.

The goal of this project is to build a clean foundation for testing ICT / A-Model / FVG-based trading strategies in real-time before connecting to live execution on Bybit or Binance.

> **API & agent integration:** the system can be consumed over REST/OpenAPI or as
> an MCP server (for AI agents). See [`docs/`](./docs/README.md) →
> [API & Agents overview](./docs/api-and-agents.md),
> [REST API reference](./docs/rest-api.md),
> [MCP server reference](./docs/mcp-server.md).

---

## 1. Project Goal

This system is designed for:

- Forward testing BTCUSDT Futures strategies.
- Visualizing price action using `lightweight-charts`.
- Converting Pine Script ideas into TypeScript strategy modules.
- Detecting ICT-style setups such as:
  - Fair Value Gap / FVG
  - Liquidity sweep
  - MSS / ChoCh
  - Multi-timeframe bias
  - London / New York Kill Zone
- Recording virtual trades.
- Building a trade journal and performance dashboard.
- Preparing the system for future exchange execution integration.

Version 1 is **forward-test only**.

No real trading should be executed in the first version.

---

## 2. Core Philosophy

This project follows **Option C**:

```text
Pine Script = prototype / visual validation in TradingView
TypeScript Strategy Engine = real engine for web-based forward testing
```

The system does **not** try to run Pine Script directly.

Instead, Pine Script logic is manually converted into TypeScript strategy modules.

Example:

```pine
bullishFvg = low > high[2]
```

Becomes:

```ts
export function isBullishFvg(candles: Candle[], i: number): boolean {
  return candles[i].low > candles[i - 2].high;
}
```

This approach is more realistic, testable, maintainable, and suitable for future exchange integration.

---

## 3. First Version Scope

Version 1 focuses only on:

```text
Symbol: BTCUSDT
Market: Futures
Mode: Forward test only
Execution: Virtual only
Exchange data source: Binance Futures or Bybit Futures
Trading style: ICT / A-Model / FVG
```

### Included in V1

- BTCUSDT Futures live chart.
- Historical candle loading.
- WebSocket candle updates.
- Timeframes:
  - 5m
  - 15m
  - 1H
  - 4H
- FVG detection.
- Liquidity sweep detection.
- MSS / ChoCh detection.
- Multi-timeframe strategy engine.
- Forward-test virtual trade engine.
- Trade journal.
- Basic performance dashboard.

### Not Included in V1

- Real trading.
- Multiple symbols.
- Multi-exchange execution.
- Full Pine Script interpreter.
- AI decision-making.
- Mobile app.
- Copy trading.
- Portfolio management.

---

## 4. Recommended Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- TradingView Lightweight Charts
- Tailwind CSS
- ShadCN UI
- Zustand for state management

### Backend

- Node.js
- TypeScript
- Fastify or NestJS
- WebSocket server
- REST API

### Database

Recommended for MVP:

- PostgreSQL
- TimescaleDB extension for time-series candle data

Optional:

- Redis for live candle cache, session state, and WebSocket fanout

### Strategy Engine

- TypeScript
- Pure functions
- Modular structure
- No direct exchange order execution inside strategy logic

### Future Exchange Integration

- Binance Futures API
- Bybit API
- Testnet first
- Real trading only after forward-test stability

---

## 5. System Architecture

```text
┌────────────────────────────┐
│ Binance / Bybit WebSocket  │
│ BTCUSDT Futures candles    │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Market Data Service         │
│ - Normalize candles         │
│ - Store closed candles      │
│ - Aggregate timeframes      │
│ - Broadcast live updates    │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Strategy Engine             │
│ - 4H bias                   │
│ - 15m setup                 │
│ - 5m entry                  │
│ - FVG / Sweep / MSS logic   │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Forward-Test Engine         │
│ - Virtual entry             │
│ - Stop loss                 │
│ - Take profit               │
│ - Fees / slippage           │
│ - Trade status tracking     │
└─────────────┬──────────────┘
              ↓
┌────────────────────────────┐
│ Web UI                      │
│ - Lightweight chart         │
│ - FVG boxes                 │
│ - Signal panel              │
│ - Trade journal             │
│ - Dashboard                 │
└────────────────────────────┘
```

---

## 6. Project Folder Structure

Recommended monorepo structure:

```text
ict-forward-lab/
  apps/
    web/
      app/
      components/
      components/chart/
      components/journal/
      components/dashboard/
      components/strategy/
      lib/
      stores/
      types/

    api/
      src/
        server.ts
        config/
        database/
        market-data/
        websocket/
        strategies/
        forward-test/
        exchange/
        routes/
        services/

  packages/
    core/
      src/
        types/
        candles/
        indicators/
        timeframe/
        risk/
        utils/

    strategies/
      src/
        ict-model-2022/
        fvg/
        liquidity/
        mss-choch/
        bias/
        sessions/

    chart-drawings/
      src/
        fvg-box/
        markers/
        price-lines/
        session-zone/

  docker-compose.yml
  package.json
  pnpm-workspace.yaml
  README.md
```

---

## 7. Core Data Types

### Candle

```ts
export interface Candle {
  time: number;        // Unix timestamp in seconds or milliseconds. Choose one standard.
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}
```

### Multi-Timeframe Context

```ts
export interface StrategyContext {
  symbol: string;
  exchange: "binance" | "bybit";
  candles5m: Candle[];
  candles15m: Candle[];
  candles1h: Candle[];
  candles4h: Candle[];
}
```

### Strategy Signal

```ts
export type SignalSide = "long" | "short" | "none";

export interface StrategySignal {
  side: SignalSide;
  symbol: string;
  timeframe: string;
  signalTime: number;

  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;

  reasons: string[];
  drawings: ChartDrawing[];

  metadata?: Record<string, unknown>;
}
```

### Chart Drawing

```ts
export type ChartDrawingType =
  | "box"
  | "line"
  | "marker"
  | "label"
  | "session-zone";

export interface ChartDrawing {
  id: string;
  type: ChartDrawingType;
  label?: string;

  fromTime?: number;
  toTime?: number;

  price?: number;
  top?: number;
  bottom?: number;

  direction?: "bullish" | "bearish";
  status?: "active" | "mitigated" | "expired";

  metadata?: Record<string, unknown>;
}
```

---

## 8. Strategy Engine Design

The strategy engine should be built using pure functions.

A strategy should:

- Receive candle data.
- Calculate market structure.
- Return signal and chart drawings.
- Never directly place orders.
- Never call exchange APIs.
- Never mutate global state.

Example:

```ts
export function ictAmodelStrategy(ctx: StrategyContext): StrategySignal {
  const bias4h = detect4HBias(ctx.candles4h);
  const setup15m = detectLiquiditySweepAndMss(ctx.candles15m);
  const entry5m = detectFvgEntry(ctx.candles5m);

  if (bias4h === "bullish" && setup15m.bullish && entry5m.bullish) {
    return {
      side: "long",
      symbol: ctx.symbol,
      timeframe: "5m",
      signalTime: entry5m.time,
      entry: entry5m.entry,
      stopLoss: entry5m.stopLoss,
      takeProfit: entry5m.takeProfit,
      riskReward: entry5m.riskReward,
      reasons: [
        "4H bullish bias",
        "15m sell-side liquidity sweep",
        "15m bullish MSS",
        "5m bullish FVG entry"
      ],
      drawings: entry5m.drawings,
      metadata: {
        bias4h,
        setup15m,
        entry5m
      }
    };
  }

  return {
    side: "none",
    symbol: ctx.symbol,
    timeframe: "5m",
    signalTime: Date.now(),
    reasons: [],
    drawings: []
  };
}
```

---

## 9. ICT / A-Model Logic

### Long Setup

```text
1. 4H bullish bias.
2. Price sweeps sell-side liquidity on 15m.
3. 15m bullish MSS / ChoCh appears.
4. 5m bullish FVG appears.
5. Entry at FVG retracement.
6. Stop loss below swept low.
7. Take profit at external liquidity or fixed RR target.
```

### Short Setup

```text
1. 4H bearish bias.
2. Price sweeps buy-side liquidity on 15m.
3. 15m bearish MSS / ChoCh appears.
4. 5m bearish FVG appears.
5. Entry at FVG retracement.
6. Stop loss above swept high.
7. Take profit at external liquidity or fixed RR target.
```

### Recommended Timeframe Roles

```text
4H  = directional bias
1H  = liquidity map / premium-discount context
15m = setup confirmation
5m  = execution entry
```

---

## 10. FVG Detection

### Bullish FVG

```ts
export function isBullishFvg(candles: Candle[], i: number): boolean {
  if (i < 2) return false;
  return candles[i].low > candles[i - 2].high;
}
```

### Bearish FVG

```ts
export function isBearishFvg(candles: Candle[], i: number): boolean {
  if (i < 2) return false;
  return candles[i].high < candles[i - 2].low;
}
```

### FVG Object

```ts
export interface FvgZone {
  id: string;
  direction: "bullish" | "bearish";
  fromTime: number;
  toTime: number;
  top: number;
  bottom: number;
  status: "active" | "mitigated" | "expired";
}
```

### Bullish FVG Zone

```ts
export function createBullishFvgZone(candles: Candle[], i: number): FvgZone | null {
  if (!isBullishFvg(candles, i)) return null;

  return {
    id: `bullish-fvg-${candles[i].time}`,
    direction: "bullish",
    fromTime: candles[i - 2].time,
    toTime: candles[i].time,
    top: candles[i].low,
    bottom: candles[i - 2].high,
    status: "active"
  };
}
```

### Bearish FVG Zone

```ts
export function createBearishFvgZone(candles: Candle[], i: number): FvgZone | null {
  if (!isBearishFvg(candles, i)) return null;

  return {
    id: `bearish-fvg-${candles[i].time}`,
    direction: "bearish",
    fromTime: candles[i - 2].time,
    toTime: candles[i].time,
    top: candles[i - 2].low,
    bottom: candles[i].high,
    status: "active"
  };
}
```

---

## 11. Repainting Prevention

This is one of the most important rules.

The strategy engine should only generate signals from **closed candles**.

Live candles may update the chart, but they should not trigger final strategy signals.

Example:

```ts
if (!latestCandle.isClosed) {
  updateChartOnly(latestCandle);
  return;
}

const signal = runStrategy(context);
```

Rules:

```text
- Do not create final signal from an unfinished candle.
- Do not mark FVG confirmed before candle close.
- Do not confirm MSS / ChoCh before candle close.
- Do not backfill signals that were not visible in real time.
- Store signal creation time exactly when signal was generated.
```

---

## 12. Forward-Test Engine

The forward-test engine simulates trade execution.

### Trade Lifecycle

```text
Signal generated
      ↓
Pending trade
      ↓
Entry triggered
      ↓
Active trade
      ↓
Closed by TP / SL / timeout / manual close
```

### Trade Status

```ts
export type TradeStatus =
  | "pending"
  | "active"
  | "closed_win"
  | "closed_loss"
  | "closed_breakeven"
  | "closed_manual"
  | "cancelled"
  | "expired";
```

### Forward-Test Configuration

```ts
export interface ForwardTestConfig {
  initialBalance: number;
  riskPerTradePercent: number;
  feePercent: number;
  slippagePercent: number;
  maxOpenTrades: number;
  maxTradesPerDay: number;
  minRiskReward: number;
  tradeTimeoutCandles: number;
}
```

Suggested default:

```ts
export const defaultForwardTestConfig: ForwardTestConfig = {
  initialBalance: 10_000,
  riskPerTradePercent: 1,
  feePercent: 0.04,
  slippagePercent: 0.02,
  maxOpenTrades: 1,
  maxTradesPerDay: 3,
  minRiskReward: 2,
  tradeTimeoutCandles: 24
};
```

### Virtual Trade

```ts
export interface ForwardTrade {
  id: string;
  signalId: string;
  symbol: string;
  side: "long" | "short";

  status: TradeStatus;

  entryTime?: number;
  entryPrice?: number;

  stopLoss: number;
  takeProfit: number;

  exitTime?: number;
  exitPrice?: number;
  exitReason?: "tp" | "sl" | "timeout" | "manual" | "cancelled";

  riskAmount: number;
  positionSize: number;

  pnl?: number;
  pnlPercent?: number;
  rrResult?: number;

  reasons: string[];
  metadata?: Record<string, unknown>;
}
```

---

## 13. Risk Management Rules

For forward testing, every trade should include:

```text
- Entry price
- Stop loss
- Take profit
- Risk amount
- Position size
- Risk-reward ratio
- Fees
- Slippage
- Maximum open trade limit
- Maximum trades per day
```

Recommended rules for V1:

```text
Risk per trade: 1%
Minimum RR: 2R
Maximum open trades: 1
Maximum trades per day: 3
Trading session filter: optional
```

Position size formula:

```ts
export function calculatePositionSize(params: {
  accountBalance: number;
  riskPercent: number;
  entry: number;
  stopLoss: number;
}) {
  const riskAmount = params.accountBalance * (params.riskPercent / 100);
  const priceRisk = Math.abs(params.entry - params.stopLoss);

  if (priceRisk <= 0) {
    throw new Error("Invalid stop loss distance");
  }

  return riskAmount / priceRisk;
}
```

---

## 14. Database Schema

### Candles

```sql
CREATE TABLE candles (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  close_time TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  is_closed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(exchange, symbol, timeframe, open_time)
);
```

### Signals

```sql
CREATE TABLE signals (
  id BIGSERIAL PRIMARY KEY,
  strategy_name TEXT NOT NULL,
  strategy_version TEXT,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  signal_time TIMESTAMPTZ NOT NULL,
  side TEXT NOT NULL,
  entry NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  risk_reward NUMERIC,
  reasons JSONB,
  drawings JSONB,
  raw_context JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Forward Trades

```sql
CREATE TABLE forward_trades (
  id BIGSERIAL PRIMARY KEY,
  signal_id BIGINT REFERENCES signals(id),
  strategy_name TEXT NOT NULL,
  strategy_version TEXT,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,

  status TEXT NOT NULL,

  entry_time TIMESTAMPTZ,
  entry_price NUMERIC,

  stop_loss NUMERIC NOT NULL,
  take_profit NUMERIC NOT NULL,

  exit_time TIMESTAMPTZ,
  exit_price NUMERIC,
  exit_reason TEXT,

  risk_amount NUMERIC,
  position_size NUMERIC,

  pnl NUMERIC,
  pnl_percent NUMERIC,
  rr_result NUMERIC,

  notes TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Strategy Runs

```sql
CREATE TABLE strategy_runs (
  id BIGSERIAL PRIMARY KEY,
  strategy_name TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  run_time TIMESTAMPTZ NOT NULL,
  candle_time TIMESTAMPTZ NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 15. REST API Design

### Market Data

```text
GET /api/candles?symbol=BTCUSDT&timeframe=5m&limit=500
GET /api/candles/latest?symbol=BTCUSDT&timeframe=5m
```

### Strategy

```text
GET /api/strategies
GET /api/strategies/:id/config
POST /api/strategies/:id/run
POST /api/strategies/:id/enable
POST /api/strategies/:id/disable
```

### Signals

```text
GET /api/signals?symbol=BTCUSDT
GET /api/signals/:id
```

### Forward Trades

```text
GET /api/forward-trades
GET /api/forward-trades/:id
POST /api/forward-trades/:id/manual-close
POST /api/forward-trades/:id/cancel
```

### Dashboard

```text
GET /api/dashboard/performance
GET /api/dashboard/equity-curve
GET /api/dashboard/session-performance
GET /api/dashboard/strategy-comparison
```

---

## 16. WebSocket Events

### Server to Client

```text
candle:update
candle:closed
signal:new
trade:created
trade:updated
trade:closed
strategy:run
```

### Example Payload

```json
{
  "event": "signal:new",
  "data": {
    "symbol": "BTCUSDT",
    "side": "long",
    "entry": 68250,
    "stopLoss": 67980,
    "takeProfit": 68850,
    "riskReward": 2.22,
    "reasons": [
      "4H bullish bias",
      "15m sell-side liquidity sweep",
      "5m bullish FVG"
    ]
  }
}
```

---

## 17. Frontend Pages

### 1. Live Chart

Main features:

- BTCUSDT candlestick chart.
- Timeframe selector.
- Strategy selector.
- FVG boxes.
- Liquidity markers.
- MSS / ChoCh labels.
- Entry / SL / TP lines.
- Signal side panel.
- Active trade panel.

### 2. Forward-Test Journal

Table columns:

```text
Date
Session
Side
Entry
SL
TP
Exit
PnL
RR
Status
Reason
Notes
```

### 3. Strategy Config

Configurable items:

```text
Risk per trade
Minimum RR
Trading sessions
Use 4H bias
Use 15m MSS
Use 5m FVG
Max trades per day
Max open trades
Trade timeout
```

### 4. Performance Dashboard

Metrics:

```text
Total trades
Win rate
Profit factor
Average RR
Maximum drawdown
Best session
Worst session
Long vs short performance
Strategy version comparison
```

### 5. Signal Replay

Features:

```text
Review past signals
Replay chart at signal time
Show why signal was created
Compare expected vs actual result
Add manual notes
```

---

## 18. Lightweight Charts Usage

Basic chart setup:

```ts
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries
} from "lightweight-charts";

const chart = createChart(container, {
  layout: {
    background: { type: "solid", color: "#0b0f14" },
    textColor: "#d1d4dc"
  },
  grid: {
    vertLines: { color: "#1f2937" },
    horzLines: { color: "#1f2937" }
  },
  timeScale: {
    timeVisible: true,
    secondsVisible: false
  }
});

const candleSeries = chart.addSeries(CandlestickSeries);
candleSeries.setData(candles);
```

Suggested chart drawings:

```text
FVG box = custom primitive / plugin layer
Entry = marker
Stop loss = price line
Take profit = price line
Liquidity sweep = marker
MSS / ChoCh = label
Kill Zone = background session zone
```

---

## 19. Development Roadmap

### Phase 1 — Foundation

- Initialize monorepo.
- Create Next.js app.
- Create API service.
- Add PostgreSQL.
- Add basic candle schema.
- Render static BTCUSDT candles on Lightweight Charts.

### Phase 2 — Live Market Data

- Connect Binance or Bybit WebSocket.
- Normalize candle format.
- Store closed candles.
- Broadcast candle updates to frontend.
- Display live updating chart.

### Phase 3 — FVG Module

- Detect bullish FVG.
- Detect bearish FVG.
- Track active FVG.
- Track mitigated FVG.
- Draw FVG boxes on chart.

### Phase 4 — ICT / A-Model Strategy

- Add 4H bias module.
- Add 15m liquidity sweep module.
- Add 15m MSS / ChoCh module.
- Add 5m FVG entry module.
- Generate structured strategy signals.

### Phase 5 — Forward-Test Engine

- Create virtual trade from signal.
- Track pending / active / closed trade.
- Calculate PnL.
- Include fees and slippage.
- Store trade result.

### Phase 6 — Journal and Dashboard

- Build trade journal.
- Add performance metrics.
- Add equity curve.
- Add session-based performance.
- Add strategy version comparison.

### Phase 7 — Exchange Testnet

Only after forward test is stable:

- Add exchange adapter.
- Add Binance testnet or Bybit testnet.
- Add order simulation vs testnet orders.
- Add risk engine.
- Add kill switch.

### Phase 8 — Real Trading

Only after testnet validation:

- Add encrypted API key storage.
- Add order manager.
- Add exchange reconciliation.
- Add position monitor.
- Add max daily loss rule.
- Add manual emergency stop.

---

## 20. Future Exchange Execution Architecture

Do not let strategy modules directly place orders.

Use this flow:

```text
Strategy Signal
      ↓
Risk Engine
      ↓
Order Intent
      ↓
Execution Gateway
      ↓
Exchange Adapter
      ↓
Binance / Bybit
```

### Exchange Adapter Interface

```ts
export interface ExchangeAdapter {
  getName(): string;

  getCandles(params: GetCandlesParams): Promise<Candle[]>;

  placeOrder(order: OrderRequest): Promise<OrderResult>;

  cancelOrder(orderId: string): Promise<void>;

  getOpenPositions(symbol: string): Promise<Position[]>;

  getAccountBalance(): Promise<AccountBalance>;
}
```

### Important Safety Rules

```text
- API keys must be encrypted.
- Never enable withdrawal permission.
- Use IP whitelist.
- Start with testnet.
- Add maximum position size.
- Add maximum daily loss.
- Add maximum trades per day.
- Add kill switch.
- Log every order request and response.
```

---

## 21. Testing Strategy

### Unit Tests

Test every strategy module:

```text
FVG detection
Liquidity sweep
MSS / ChoCh
Bias detection
Risk calculation
Position size calculation
Trade lifecycle
```

### Integration Tests

Test:

```text
Market data ingestion
Candle storage
Strategy run
Signal creation
Forward trade creation
Trade close logic
```

### Replay Tests

Use historical candles to replay market conditions and ensure the strategy does not repaint.

Rules:

```text
- Process candles one by one.
- Never expose future candles to the strategy.
- Generate signal only when candle closes.
- Save the signal at the exact candle where it appears.
```

---

## 22. Coding Rules

General rules:

```text
- Use TypeScript everywhere.
- Use pure functions for strategy logic.
- Keep strategy logic separate from UI.
- Keep strategy logic separate from exchange execution.
- Use closed candles for signal generation.
- Log every signal decision.
- Version every strategy.
- Store raw context for every signal.
```

Naming convention:

```text
detectBullishFvg()
detectBearishFvg()
detectLiquiditySweep()
detectMarketStructureShift()
detect4HBias()
createForwardTrade()
updateForwardTradeStatus()
calculatePositionSize()
calculateRiskReward()
```

---

## 23. Environment Variables

Example:

```env
NODE_ENV=development

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ict_forward_lab

REDIS_URL=redis://localhost:6379

EXCHANGE=binance
SYMBOL=BTCUSDT

BINANCE_WS_URL=wss://fstream.binance.com/ws
BYBIT_WS_URL=wss://stream.bybit.com/v5/public/linear

FORWARD_TEST_INITIAL_BALANCE=10000
FORWARD_TEST_RISK_PER_TRADE_PERCENT=1
FORWARD_TEST_MIN_RR=2
```

---

## 24. Docker Compose Example

```yaml
version: "3.9"

services:
  postgres:
    image: timescale/timescaledb:latest-pg16
    container_name: ict-forward-lab-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ict_forward_lab
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    container_name: ict-forward-lab-redis
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

---

## 25. Definition of Done for V1

V1 is complete when:

```text
- BTCUSDT candles load on the chart.
- Live candles update through WebSocket.
- Closed candles are stored in database.
- FVG boxes are drawn on chart.
- Strategy engine generates signals from closed candles only.
- Virtual trades are created from valid signals.
- Forward trades are updated when entry / SL / TP is touched.
- Journal records every trade.
- Dashboard shows basic performance statistics.
- No real exchange order is sent.
```

---

## 26. Important Notes

This system is for research, education, and forward testing.

Forward-test results do not guarantee live trading profitability.

Before real trading:

```text
- Validate strategy with replay.
- Validate strategy with forward test.
- Validate strategy with testnet.
- Add strong risk management.
- Use small capital first.
```

---

## 27. Suggested Project Name

Recommended name:

```text
ICT Forward Lab
```

Alternative names:

```text
btc-forward-lab
fvg-lab
amodex
trading-lab-btc
ict-execution-lab
```

---

## 28. Summary

This project should be built around one key idea:

```text
Do not run Pine Script inside the web chart.
Convert Pine strategy ideas into a real TypeScript strategy engine.
```

This gives the system:

```text
- Better testing
- Better debugging
- Better performance
- Better control
- Easier forward testing
- Easier future exchange integration
```

Version 1 should stay focused:

```text
BTCUSDT Futures
Forward test only
Lightweight Charts
TypeScript strategy engine
ICT / A-Model / FVG logic
Trade journal
Performance dashboard
```
