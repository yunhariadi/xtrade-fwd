# BTC ICT Data Brain

A source-data and quant engine for BTC agents using ICT / SMC concepts.  
The system collects raw BTC market data, converts it into compact ICT-ready context, scores possible setups, and serves clean decision packets to AI agents such as **OpenClaw (OC)** and **Hermes-Agent (HA)**.

The core goal is simple:

> **The server does raw data, quant, structure detection, volume profile, and ICT narrative compression.  
> AI agents only receive compact, clean, high-signal packets.**

---

## 1. System Purpose

This project builds a **BTC Data Brain** for AI trading agents.

The agents should not analyze raw candles, orderbook streams, or long historical datasets directly because that wastes tokens and creates inconsistent reasoning.

Instead, the server should generate a clean ICT / SMC packet containing:

- Weekly profile
- Daily and 4H bias
- Killzone context
- AMD phase: Accumulation, Manipulation, Distribution
- IRL / ERL draw on liquidity
- Session profile
- Liquidity map
- Market structure
- MSS / CHOCH / BOS
- FVG / iFVG
- Volume Profile
- Risk context
- Server-side quant score
- Compact market narrative

The AI agents then answer high-level questions:

- Is this a valid ICT 2022 setup?
- Is the current draw IRL → ERL or ERL → IRL?
- Is the FVG entry clean?
- Should we wait for CE / deeper retracement?
- Is the setup too late in the killzone?
- Does Volume Profile support or reject the trade idea?

---

## 2. Target Architecture

```text
Exchange APIs
  ├── Binance Spot / Futures WebSocket
  ├── Binance REST historical data
  ├── Optional Deribit derivatives context
  └── Optional liquidation / funding / OI provider
        ↓
BTC Data Brain
  ├── Collector
  ├── Candle Engine
  ├── ICT / SMC Engine
  ├── Volume Profile Engine
  ├── Quant Scoring Engine
  ├── Narrative Engine
  ├── Redis Live State
  ├── PostgreSQL / TimescaleDB History
  └── REST / WebSocket Agent API
        ↓
AI Agents
  ├── OpenClaw / OC
  └── Hermes-Agent / HA
```

Recommended deployment:

```text
VPS a.b.c
  ├── BTC Data Brain
  ├── Redis
  ├── PostgreSQL / TimescaleDB
  └── OpenClaw

VPS x.y.z
  ├── Hermes-Agent
  └── Optional backup cache / observer
```

Use **WireGuard** or **Tailscale** between VPSs.  
Do not expose the internal data API publicly.

---

## 3. Recommended Tech Stack

### Backend

- Python 3.11+
- FastAPI
- Pydantic
- Uvicorn
- AsyncIO
- WebSockets
- APScheduler or custom async scheduler

### Data

- Redis for live state
- PostgreSQL / TimescaleDB for historical candles, events, setup logs
- Optional ClickHouse or QuestDB for very high-frequency trade/orderbook storage

### Market Data

- Binance WebSocket:
  - `btcusdt@kline_1m`
  - `btcusdt@aggTrade`
  - `btcusdt@depth`
  - `btcusdt@bookTicker`
- Binance REST:
  - backfill candles
  - historical aggregate trades
- Optional:
  - Deribit for BTC options/futures context
  - Open interest provider
  - Funding rate provider
  - Liquidation feed provider

### AI Agent Integration

- REST pull for snapshots and packets
- WebSocket push for important events
- HMAC or API-key authentication
- Allowlist OC / HA VPS IPs

---

## 4. Repository Structure

```text
btc-ict-data-brain/
├── README.md
├── docker-compose.yml
├── .env.example
├── pyproject.toml
├── alembic.ini
├── app/
│   ├── main.py
│   ├── config.py
│   ├── logging_config.py
│   │
│   ├── api/
│   │   ├── routes_health.py
│   │   ├── routes_snapshot.py
│   │   ├── routes_decision_packet.py
│   │   ├── routes_ict.py
│   │   ├── routes_volume_profile.py
│   │   └── websocket_events.py
│   │
│   ├── collectors/
│   │   ├── binance_ws.py
│   │   ├── binance_rest.py
│   │   ├── deribit_client.py
│   │   └── reconnect.py
│   │
│   ├── storage/
│   │   ├── postgres.py
│   │   ├── redis.py
│   │   ├── repositories.py
│   │   └── migrations/
│   │
│   ├── models/
│   │   ├── candle.py
│   │   ├── market_event.py
│   │   ├── liquidity.py
│   │   ├── fvg.py
│   │   ├── volume_profile.py
│   │   ├── bias.py
│   │   ├── narrative.py
│   │   └── decision_packet.py
│   │
│   ├── engines/
│   │   ├── candle_engine.py
│   │   ├── session_engine.py
│   │   ├── swing_engine.py
│   │   ├── structure_engine.py
│   │   ├── liquidity_engine.py
│   │   ├── fvg_engine.py
│   │   ├── amd_engine.py
│   │   ├── irl_erl_engine.py
│   │   ├── weekly_profile_engine.py
│   │   ├── session_profile_engine.py
│   │   ├── bias_engine.py
│   │   ├── volume_profile_engine.py
│   │   ├── scoring_engine.py
│   │   └── narrative_engine.py
│   │
│   ├── services/
│   │   ├── snapshot_service.py
│   │   ├── setup_service.py
│   │   ├── packet_service.py
│   │   ├── event_bus.py
│   │   └── agent_auth.py
│   │
│   ├── tasks/
│   │   ├── scheduler.py
│   │   ├── backfill.py
│   │   ├── retention.py
│   │   └── outcome_tracker.py
│   │
│   └── tests/
│       ├── test_fvg_engine.py
│       ├── test_liquidity_engine.py
│       ├── test_amd_engine.py
│       ├── test_irl_erl_engine.py
│       ├── test_volume_profile.py
│       ├── test_scoring_engine.py
│       └── test_decision_packet.py
└── docs/
    ├── api.md
    ├── ict_concepts.md
    ├── scoring.md
    └── deployment.md
```

---

## 5. Environment Variables

Create `.env` from `.env.example`.

```env
APP_NAME=btc-ict-data-brain
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000

SYMBOL=BTCUSDT
QUOTE_ASSET=USDT

BINANCE_SPOT_WS_BASE=wss://stream.binance.com:9443/ws
BINANCE_FUTURES_WS_BASE=wss://fstream.binance.com/ws
BINANCE_REST_BASE=https://api.binance.com

DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/btc_ict
REDIS_URL=redis://redis:6379/0

TIMEZONE_LOCAL=Asia/Jakarta
TIMEZONE_ICT=America/New_York

AGENT_API_KEY=change_me
ALLOWED_AGENT_IPS=a.b.c,x.y.z

SNAPSHOT_INTERVAL_SECONDS=30
KILLZONE_ACTIVE_ONLY=true

SCORE_THRESHOLD_NOTIFY=65
SCORE_THRESHOLD_AGENT=70
SCORE_THRESHOLD_STRONG=80
```

---

## 6. Docker Compose

```yaml
version: "3.9"

services:
  app:
    build: .
    container_name: btc_ict_data_brain
    env_file:
      - .env
    ports:
      - "8000:8000"
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  redis:
    image: redis:7
    container_name: btc_ict_redis
    ports:
      - "6379:6379"
    restart: unless-stopped

  postgres:
    image: timescale/timescaledb:latest-pg16
    container_name: btc_ict_postgres
    environment:
      POSTGRES_DB: btc_ict
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

---

## 7. Main Data Flow

```text
1. Collector receives Binance WebSocket data
2. Candle Engine builds 1m candles
3. Candle Engine resamples into 5m, 15m, 1h, 4h, daily, weekly
4. Session Engine marks Asia, London, New York sessions
5. ICT Engines detect structure, liquidity, FVG, AMD, IRL/ERL
6. Volume Profile Engine calculates POC, VAH, VAL, HVN, LVN
7. Bias Engine combines weekly, daily, 4H, 15m, 5m, session, VP bias
8. Narrative Engine compresses all context into readable market story
9. Scoring Engine gives numerical setup quality
10. Packet Service builds compact JSON for agents
11. WebSocket sends event only if setup passes threshold
12. Agent decisions and setup outcomes are stored for research
```

---

## 8. Candles and Timeframes

Required candles:

```text
1m
5m
15m
1h
4h
1d
1w
```

Use 1m candles as the source of truth for resampling.

Suggested candle model:

```python
class Candle(BaseModel):
    symbol: str
    timeframe: str
    open_time: datetime
    close_time: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    quote_volume: Decimal | None = None
    trade_count: int | None = None
    taker_buy_base_volume: Decimal | None = None
    taker_buy_quote_volume: Decimal | None = None
    closed: bool
```

---

## 9. Session and Killzone Engine

Use timezone-aware logic.

Internal ICT timezone:

```text
America/New_York
```

Local display timezone:

```text
Asia/Jakarta
```

Suggested killzones:

```text
London Killzone: 02:00–05:00 New York time
New York AM Killzone: 07:00–10:00 New York time
New York PM Killzone: 13:30–16:00 New York time
```

Do not hardcode Jakarta time because New York daylight saving time changes the offset.

Session engine output:

```json
{
  "current_session": "London Killzone",
  "ny_time": "02:15",
  "local_time": "13:15",
  "minutes_since_open": 15,
  "asia_high": 68420,
  "asia_low": 68180,
  "session_open": 68290,
  "session_high": 68540,
  "session_low": 68120
}
```

---

## 10. ICT / SMC Engines

### 10.1 Swing Engine

Purpose:

- detect swing highs
- detect swing lows
- classify internal vs external structure

Config:

```python
SWING_LEFT_BARS = 2
SWING_RIGHT_BARS = 2
MIN_SWING_DISTANCE_ATR = 0.25
```

Output:

```json
{
  "swing_type": "high",
  "timeframe": "5m",
  "price": 68620,
  "time": "2026-05-27T13:10:00+07:00",
  "classification": "internal"
}
```

---

### 10.2 Market Structure Engine

Detect:

- BOS
- MSS
- CHOCH
- internal structure
- external structure
- bullish / bearish displacement

Output:

```json
{
  "15m": "bullish_mss_confirmed",
  "5m": "bullish_displacement_after_sweep",
  "last_event": "swept_asia_low_then_reclaimed",
  "confidence": 0.76
}
```

---

### 10.3 Liquidity Engine

Detect:

- previous day high / low
- previous week high / low
- Asia high / low
- London high / low
- New York high / low
- equal highs / equal lows
- old swing highs / lows
- buy-side liquidity
- sell-side liquidity

Output:

```json
{
  "swept": "Asia Low",
  "nearest_above": [
    {"label": "Asia High", "price": 68620, "distance": 95},
    {"label": "PDH", "price": 68980, "distance": 455}
  ],
  "nearest_below": [
    {"label": "Manipulation Low", "price": 68120, "distance": 280}
  ]
}
```

---

### 10.4 FVG / iFVG Engine

Bullish FVG:

```text
Candle 1 high < Candle 3 low
```

Bearish FVG:

```text
Candle 1 low > Candle 3 high
```

Track:

- timeframe
- high
- low
- CE / midpoint
- creation time
- age
- mitigation status
- invalidation
- whether it formed after a liquidity sweep
- whether it aligns with discount/premium
- whether it aligns with Volume Profile

Output:

```json
{
  "active": true,
  "type": "bullish",
  "timeframe": "5m",
  "low": 68320,
  "high": 68410,
  "ce": 68365,
  "status": "unmitigated",
  "created_after": "sell_side_liquidity_sweep"
}
```

---

### 10.5 AMD Engine

AMD = Accumulation, Manipulation, Distribution.

The engine should classify the current market phase.

Accumulation signs:

- tight range
- overlapping candles
- low displacement
- Asia range forming
- volume balanced
- no clear expansion

Manipulation signs:

- sweep of Asia high / low
- sweep of PDH / PDL
- false breakout
- quick reclaim
- displacement after sweep

Distribution signs:

- expansion after manipulation
- structure break
- FVG created
- price targeting external liquidity
- volume or range expansion

Output:

```json
{
  "asia": "accumulation",
  "london": "sell_side_manipulation",
  "current": "bullish_distribution_attempt",
  "manipulated_side": "sell_side",
  "swept_level": "Asia Low",
  "reclaim": true
}
```

---

### 10.6 IRL / ERL Engine

IRL = Internal Range Liquidity.  
ERL = External Range Liquidity.

IRL examples:

- FVG
- iFVG
- order block
- breaker
- mitigation block
- internal swing high / low
- volume imbalance
- consequent encroachment
- POC / VWAP if used as internal magnet

ERL examples:

- previous day high / low
- previous week high / low
- Asia high / low
- London high / low
- equal highs / lows
- major swing high / low
- buy-side liquidity
- sell-side liquidity

Output:

```json
{
  "current_draw": "IRL_to_ERL",
  "from": {
    "type": "5m bullish FVG",
    "low": 68320,
    "high": 68410,
    "ce": 68365
  },
  "to": {
    "type": "buy_side_liquidity",
    "label": "Asia High",
    "price": 68620
  },
  "status": "waiting_for_retrace_to_irl"
}
```

---

### 10.7 Weekly Profile Engine

Purpose:

- identify current weekly story
- define weekly bias
- decide if long / short is allowed
- identify weekly draw

Profiles:

```text
classic_bullish_week
classic_bearish_week
consolidation_week
reversal_week
expansion_week
```

Output:

```json
{
  "week_open": 68100,
  "current_week_high": 69200,
  "current_week_low": 67400,
  "price_vs_week_open": "above",
  "weekly_bias": "bullish",
  "weekly_range_position": "middle_discount",
  "likely_profile": "classic_bullish_week",
  "weekly_draw": "previous_week_high",
  "permission": {
    "long_allowed": true,
    "short_allowed": false,
    "reason": "Price is above weekly open and draw is previous week high."
  }
}
```

---

### 10.8 Session Profile Engine

Detect:

- Asia accumulation
- London Judas swing
- London continuation
- London reversal
- New York continuation
- New York reversal
- New York AM expansion
- New York PM retracement
- range day
- trend day
- double distribution day

Output:

```json
{
  "current_session": "London",
  "session_phase": "manipulation",
  "range_expansion": "above_asia_range",
  "swept_liquidity": "asia_low",
  "active_draw": "asia_high",
  "profile_type": "sweep_reclaim_expand",
  "label": "London sell-side sweep then bullish expansion"
}
```

---

### 10.9 Bias Engine

Bias should be layered, not single-source.

Inputs:

- weekly bias
- daily bias
- 4H bias
- 15m structure
- 5m execution state
- session profile
- Volume Profile
- IRL / ERL draw

Output:

```json
{
  "weekly": "bullish",
  "daily": "bullish",
  "4h": "bullish",
  "15m": "bullish_after_mss",
  "5m": "waiting_for_long_retrace",
  "session": "bullish_after_sell_side_sweep",
  "volume_profile": "bullish_above_session_poc",
  "final": "long_only",
  "confidence": 0.78
}
```

---

## 11. Volume Profile Engine

Calculate Volume Profile on these scopes:

- session
- daily
- weekly
- rolling 24h
- killzone

Levels:

- POC = Point of Control
- VAH = Value Area High
- VAL = Value Area Low
- HVN = High Volume Node
- LVN = Low Volume Node
- Volume imbalance
- Poor high / poor low

Suggested default:

```python
VOLUME_PROFILE_TICK_SIZE = 10
VALUE_AREA_PERCENT = 0.70
```

Output:

```json
{
  "session": {
    "poc": 68380,
    "vah": 68520,
    "val": 68240,
    "price_location": "above_poc_below_vah",
    "bias": "mild_bullish"
  },
  "daily": {
    "poc": 68190,
    "vah": 68680,
    "val": 67850,
    "price_location": "inside_value",
    "bias": "neutral_to_bullish"
  },
  "weekly": {
    "poc": 67550,
    "vah": 68900,
    "val": 66800,
    "price_location": "upper_value",
    "bias": "bullish_but_near_resistance"
  },
  "nodes": {
    "nearest_hvn_above": 68850,
    "nearest_lvn_above": 68600,
    "nearest_hvn_below": 68120,
    "nearest_lvn_below": 67980
  }
}
```

---

## 12. Narrative Engine

The Narrative Engine compresses all server-side analysis into a short story for AI agents.

Output:

```json
{
  "short": "BTC accumulated during Asia, swept Asia Low in London, reclaimed the range, created bullish displacement and a 5m FVG. Current draw is from internal FVG to external buy-side liquidity at Asia High and PDH.",
  "trade_idea": "Prefer long from 5m bullish FVG or CE if price retraces while 15m structure remains bullish.",
  "invalid_if": "Price breaks below the manipulation low and accepts below Asia range.",
  "avoid_if": "Price reaches Asia High before retracing into FVG.",
  "agent_task": "Validate whether this is a clean ICT 2022 long model or wait for deeper retracement."
}
```

---

## 13. Quant Scoring Engine

The server must score the setup before sending it to AI.

Suggested score:

```text
HTF bias aligned                           +15
Weekly profile supports direction          +10
Session profile supports direction         +10
AMD phase clear                            +10
Manipulation detected                      +15
IRL → ERL draw clear                       +15
MSS / CHOCH confirmed                      +15
Displacement present                       +10
Valid FVG / iFVG                           +10
FVG aligns with Volume Profile level        +10
Price above/below POC in direction          +5
Clear ERL target                            +10
RR > 2                                      +10

Against weekly bias                        -20
No clear AMD phase                         -10
IRL/ERL unclear                            -10
Price trapped inside value area             -10
Setup already reached ERL                  -20
Late in session                            -10
Volume Profile opposes direction            -10
No clean invalidation                       -20
```

Output:

```json
{
  "total": 82,
  "grade": "A-",
  "recommendation": "send_to_agent",
  "breakdown": {
    "htf_bias": 15,
    "weekly_profile": 10,
    "session_profile": 10,
    "amd": 10,
    "manipulation": 15,
    "irl_erl": 15,
    "mss": 12,
    "fvg": 8,
    "volume_profile": 7
  }
}
```

Thresholds:

```text
< 50   ignore
50-64  monitor only
65-69  internal alert only
70-79  send to OC
80+    send to OC and HA
```

---

## 14. Decision Packet

Main endpoint:

```http
GET /btc/decision-packet?mode=compact
```

Example response:

```json
{
  "symbol": "BTCUSDT",
  "timestamp": "2026-05-27T13:15:00+07:00",
  "session": {
    "name": "London Killzone",
    "phase": "manipulation_to_distribution",
    "profile": "sell_side_sweep_then_bullish_reclaim"
  },
  "weekly_profile": {
    "bias": "bullish",
    "profile": "classic_bullish_week",
    "current_draw": "previous_week_high",
    "price_vs_week_open": "above",
    "permission": "long_preferred"
  },
  "bias": {
    "weekly": "bullish",
    "daily": "bullish",
    "4h": "bullish",
    "15m": "bullish_after_mss",
    "5m": "waiting_for_fvg_retrace",
    "final": "long_only",
    "confidence": 0.78
  },
  "amd": {
    "asia": "accumulation",
    "london": "sell_side_manipulation",
    "current": "bullish_distribution_attempt"
  },
  "irl_erl": {
    "current_draw": "IRL_to_ERL",
    "from": "5m bullish FVG",
    "to": "Asia High / PDH",
    "status": "waiting_for_retrace_to_irl"
  },
  "structure": {
    "15m": "bullish_mss_confirmed",
    "5m": "bullish_displacement_after_sweep"
  },
  "liquidity": {
    "swept": "Asia Low",
    "nearest_above": [
      {"label": "Asia High", "price": 68620},
      {"label": "PDH", "price": 68980}
    ],
    "nearest_below": [
      {"label": "Manipulation Low", "price": 68120}
    ]
  },
  "fvg": {
    "active": true,
    "type": "bullish",
    "timeframe": "5m",
    "low": 68320,
    "high": 68410,
    "ce": 68365,
    "status": "unmitigated"
  },
  "volume_profile": {
    "session_poc": 68380,
    "session_vah": 68520,
    "session_val": 68240,
    "price_location": "above_session_poc",
    "vp_bias": "mild_bullish",
    "nearest_lvn_above": 68600,
    "nearest_hvn_above": 68850
  },
  "risk": {
    "entry_zone": "68320-68410",
    "preferred_entry": "CE 68365",
    "invalidation": 68120,
    "target_1": 68620,
    "target_2": 68980,
    "rr_to_target_1": 2.1,
    "rr_to_target_2": 4.8
  },
  "narrative": {
    "short": "BTC accumulated during Asia, swept Asia Low in London, reclaimed the range, created bullish displacement and a 5m FVG. Current draw is from internal FVG to external buy-side liquidity at Asia High and PDH.",
    "agent_task": "Validate whether this is a clean ICT 2022 long model or wait for deeper retracement."
  },
  "server_score": {
    "total": 82,
    "grade": "A-",
    "recommendation": "send_to_agent"
  }
}
```

---

## 15. API Endpoints

### Health

```http
GET /health
```

Response:

```json
{
  "status": "ok",
  "symbol": "BTCUSDT",
  "exchange_ws": "connected",
  "redis": "ok",
  "postgres": "ok"
}
```

### Snapshot

```http
GET /btc/snapshot
```

Small, cheap, current state only.

### Current setup

```http
GET /btc/setup/current
```

Medium-size setup data if a candidate exists.

### Main decision packet

```http
GET /btc/decision-packet?mode=compact
GET /btc/decision-packet?mode=full
```

### ICT modules

```http
GET /btc/amd
GET /btc/irl-erl
GET /btc/weekly-profile
GET /btc/session-profile
GET /btc/bias
GET /btc/narrative
GET /btc/structure
GET /btc/liquidity-map
GET /btc/fvg/active
```

### Volume Profile

```http
GET /btc/volume-profile/session
GET /btc/volume-profile/daily
GET /btc/volume-profile/weekly
GET /btc/volume-profile/rolling-24h
```

### WebSocket events

```http
WS /ws/events
```

Event examples:

```json
{
  "event": "SETUP_CANDIDATE",
  "symbol": "BTCUSDT",
  "direction": "long",
  "score": 82,
  "reason": "Asia low swept + bullish MSS + 5m FVG + IRL to ERL"
}
```

Event types:

```text
SESSION_START
SESSION_END
LIQUIDITY_SWEEP
MSS_CONFIRMED
CHOCH_CONFIRMED
FVG_CREATED
FVG_MITIGATED
AMD_PHASE_CHANGED
IRL_ERL_DRAW_CHANGED
VOLUME_PROFILE_SHIFT
BIAS_CHANGED
SETUP_CANDIDATE
SETUP_INVALIDATED
TARGET_HIT
```

---

## 16. Database Schema

### candles

```sql
CREATE TABLE candles (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    open_time TIMESTAMPTZ NOT NULL,
    close_time TIMESTAMPTZ NOT NULL,
    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    volume NUMERIC NOT NULL,
    quote_volume NUMERIC,
    trade_count INTEGER,
    taker_buy_base_volume NUMERIC,
    taker_buy_quote_volume NUMERIC,
    closed BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(symbol, timeframe, open_time)
);
```

### market_structure_events

```sql
CREATE TABLE market_structure_events (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    event_type TEXT NOT NULL,
    direction TEXT,
    price NUMERIC,
    related_level TEXT,
    confidence NUMERIC,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

### liquidity_levels

```sql
CREATE TABLE liquidity_levels (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    level_time TIMESTAMPTZ NOT NULL,
    label TEXT NOT NULL,
    liquidity_type TEXT NOT NULL,
    side TEXT NOT NULL,
    price NUMERIC NOT NULL,
    swept BOOLEAN DEFAULT FALSE,
    swept_time TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

### fvg_zones

```sql
CREATE TABLE fvg_zones (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    direction TEXT NOT NULL,
    low NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    ce NUMERIC NOT NULL,
    status TEXT NOT NULL,
    mitigated_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    created_after TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);
```

### volume_profile_levels

```sql
CREATE TABLE volume_profile_levels (
    id BIGSERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    scope TEXT NOT NULL,
    profile_start TIMESTAMPTZ NOT NULL,
    profile_end TIMESTAMPTZ NOT NULL,
    poc NUMERIC NOT NULL,
    vah NUMERIC NOT NULL,
    val NUMERIC NOT NULL,
    hvn JSONB DEFAULT '[]'::jsonb,
    lvn JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(symbol, scope, profile_start, profile_end)
);
```

### setup_candidates

```sql
CREATE TABLE setup_candidates (
    id BIGSERIAL PRIMARY KEY,
    setup_uid TEXT UNIQUE NOT NULL,
    symbol TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    session_name TEXT,
    direction TEXT NOT NULL,
    htf_bias TEXT,
    weekly_profile TEXT,
    session_profile TEXT,
    amd_phase TEXT,
    irl_erl_draw TEXT,
    sweep_type TEXT,
    mss_confirmed BOOLEAN,
    fvg_low NUMERIC,
    fvg_high NUMERIC,
    fvg_ce NUMERIC,
    entry_price NUMERIC,
    invalidation_price NUMERIC,
    target_1 NUMERIC,
    target_2 NUMERIC,
    rr_to_target_1 NUMERIC,
    rr_to_target_2 NUMERIC,
    server_score NUMERIC,
    packet JSONB NOT NULL,
    oc_decision TEXT,
    oc_confidence NUMERIC,
    ha_decision TEXT,
    ha_confidence NUMERIC,
    final_decision TEXT,
    outcome_15m TEXT,
    outcome_60m TEXT,
    outcome_final TEXT
);
```

---

## 17. Agent Workflow

### Normal operation

```text
Outside killzone:
  - Collect data
  - Build context
  - No AI calls unless manually requested

Before killzone:
  - Build Asia range
  - Mark PDH / PDL
  - Mark weekly and daily bias
  - Generate pre-session summary

During killzone:
  - Watch for sweep
  - Watch for reclaim
  - Watch for displacement
  - Watch for MSS / CHOCH
  - Watch for FVG / iFVG
  - Check IRL / ERL draw
  - Check Volume Profile
  - Score setup
  - Send to OC if score >= 70
  - Send to HA if score >= 80 or OC is uncertain
```

### AI call condition

```text
Call AI only when:
1. Current time is inside London or New York killzone
2. AMD phase is Manipulation or Distribution
3. IRL / ERL draw is clear
4. Bias is aligned
5. Score >= 70
6. Setup has not already reached ERL
7. There is a clean invalidation level
```

---

## 18. OpenClaw / Hermes Prompt Contract

When sending a packet to an AI agent, use a fixed prompt.

```text
You are validating a BTC ICT / SMC setup.

Use only the provided decision packet.
Do not invent candle data.
Do not ask for raw data.
Judge whether the setup is valid, invalid, or should wait.

Return JSON only:
{
  "decision": "valid" | "invalid" | "wait",
  "direction": "long" | "short" | "none",
  "confidence": 0-100,
  "reason": "...",
  "preferred_entry": "...",
  "invalidation": "...",
  "target": "...",
  "warnings": ["..."]
}
```

Recommended OC / HA logic:

```text
OC:
  - first-pass validation
  - stricter on ICT model structure

HA:
  - second-pass validation
  - stricter on risk, timing, and Volume Profile

Final decision:
  - valid only if OC and HA agree
  - wait if one says valid and one says wait
  - invalid if either detects major contradiction
```

---

## 19. Backtesting and Feedback Loop

Every setup and agent decision must be stored.

Track:

- server score
- OC decision
- HA decision
- final decision
- whether entry was reached
- whether invalidation was hit
- whether target 1 was hit
- whether target 2 was hit
- max favorable excursion
- max adverse excursion
- time to target
- session
- weekly profile
- AMD phase
- IRL / ERL draw
- Volume Profile condition

Questions to answer later:

```text
Which weekly profile performs best?
Which session profile performs best?
Does Asia sweep + 5m MSS work better in London or NY?
Is CE entry better than full FVG entry?
Does Volume Profile improve win rate?
Do setups above POC perform better for longs?
Do setups inside value area perform worse?
Does HA improve or reduce final performance?
```

---

## 20. Development Phases

### Phase 1 — Infrastructure

Build:

- FastAPI app
- Docker Compose
- Redis connection
- PostgreSQL / TimescaleDB connection
- Health endpoint
- `.env` config
- logging

Acceptance criteria:

```text
docker compose up works
GET /health returns ok
Redis and Postgres are connected
```

---

### Phase 2 — Market Data Collector

Build:

- Binance WebSocket collector
- reconnect logic
- 1m candle builder
- REST backfill for missing candles
- write candles to database
- latest candle in Redis

Acceptance criteria:

```text
1m BTCUSDT candles are stored
5m / 15m / 1h / 4h candles are resampled
Collector reconnects automatically
No duplicated candles
```

---

### Phase 3 — Session and Killzone Engine

Build:

- New York timezone conversion
- Asia range
- London killzone
- New York AM killzone
- New York PM killzone
- session highs/lows
- session state in Redis

Acceptance criteria:

```text
Server correctly identifies current session
Server stores Asia high/low
Killzone times adjust for daylight saving time
```

---

### Phase 4 — ICT Engines

Build:

- swing engine
- liquidity engine
- market structure engine
- FVG / iFVG engine
- AMD engine
- IRL / ERL engine
- weekly profile engine
- session profile engine
- bias engine

Acceptance criteria:

```text
Server can identify:
- liquidity sweep
- MSS / CHOCH
- active FVG
- AMD phase
- IRL / ERL draw
- weekly bias
- session profile
```

---

### Phase 5 — Volume Profile

Build:

- session VP
- daily VP
- weekly VP
- rolling 24h VP
- POC / VAH / VAL
- HVN / LVN

Acceptance criteria:

```text
Volume Profile updates every completed candle
POC / VAH / VAL are available from API
Bias engine can use VP context
```

---

### Phase 6 — Scoring and Narrative

Build:

- scoring engine
- narrative engine
- compact packet builder
- full packet builder

Acceptance criteria:

```text
GET /btc/decision-packet returns compact ICT-ready JSON
Narrative is short and useful
Server score is deterministic
```

---

### Phase 7 — Agent Integration

Build:

- agent auth
- REST pull
- WebSocket push
- OC request adapter
- HA request adapter
- decision storage

Acceptance criteria:

```text
OC receives packet only when score >= 70
HA receives packet only when score >= 80 or OC is uncertain
Agent JSON responses are stored
```

---

### Phase 8 — Research and Backtest

Build:

- historical replay
- setup outcome tracker
- strategy analytics
- CSV export
- performance dashboard

Acceptance criteria:

```text
Can replay one week of BTC data
Can compare setup outcomes by session, AMD phase, weekly profile, and VP condition
```

---

## 21. Testing Requirements

Unit tests:

```text
test_fvg_engine.py
test_liquidity_engine.py
test_swing_engine.py
test_structure_engine.py
test_amd_engine.py
test_irl_erl_engine.py
test_weekly_profile_engine.py
test_session_profile_engine.py
test_bias_engine.py
test_volume_profile_engine.py
test_scoring_engine.py
test_decision_packet.py
```

Integration tests:

```text
test_binance_collector.py
test_candle_resampling.py
test_api_snapshot.py
test_api_decision_packet.py
test_websocket_events.py
```

Minimum acceptance:

```text
pytest passes
mypy or pyright passes
ruff passes
docker compose starts cleanly
```

---

## 22. Security

Required:

- API key for all agent endpoints
- IP allowlist for OC and HA VPSs
- TLS if exposed outside private network
- WireGuard or Tailscale preferred
- no exchange private keys needed for this service
- no trading execution inside Data Brain at first
- no public dashboard without authentication

---

## 23. Observability

Log these events:

```text
collector_connected
collector_disconnected
collector_reconnected
candle_closed
session_started
session_ended
liquidity_swept
mss_confirmed
fvg_created
fvg_mitigated
amd_phase_changed
irl_erl_draw_changed
volume_profile_shift
setup_candidate_created
agent_packet_sent
agent_decision_received
target_hit
invalidation_hit
```

Add metrics later:

```text
candles_per_minute
ws_reconnect_count
setup_candidates_per_day
agent_calls_per_day
average_server_score
oc_approval_rate
ha_approval_rate
setup_win_rate
```

---

## 24. Build Instructions for AI Code Generator

Use this instruction with Codex or another AI code generator:

```text
Build a Python FastAPI project named btc-ict-data-brain.

Follow the README exactly.

Implement in phases:
1. FastAPI app, Docker Compose, Redis, PostgreSQL/TimescaleDB, health endpoint.
2. Binance WebSocket collector for BTCUSDT 1m candles and aggregate trades.
3. Candle resampling for 5m, 15m, 1h, 4h, 1d, 1w.
4. Session and killzone engine using America/New_York and Asia/Jakarta timezones.
5. ICT engines: swings, liquidity, structure, FVG/iFVG, AMD, IRL/ERL, weekly profile, session profile, bias.
6. Volume Profile engine with POC, VAH, VAL, HVN, LVN.
7. Scoring engine and narrative engine.
8. REST endpoints and WebSocket event stream.
9. Setup candidate storage and agent decision storage.
10. Tests for every engine.

Prioritize clean architecture, typed Python, Pydantic models, deterministic functions, and unit tests.

Do not implement live trading execution yet.
Only implement data, analysis, packets, scoring, and agent integration.
```

---

## 25. Important Design Rule

Do not send raw data to AI agents.

Send this:

```text
Weekly bias bullish.
Asia accumulated.
London swept sell-side liquidity.
Price reclaimed Asia range.
15m MSS bullish.
5m bullish FVG created.
Current draw is IRL to ERL.
Volume Profile supports long above session POC.
Preferred entry is FVG CE.
Invalidation is manipulation low.
Target is Asia High then PDH.
```

Not this:

```text
Here are 500 candles. Analyze them.
```

The system is successful when the AI receives a small, clean, high-signal packet and can make a decision with minimal token usage.

---

## 26. Disclaimer

This system is for research, analytics, and decision support.  
It should not be considered financial advice.  
Do not connect live trade execution until the data engine, backtests, risk controls, and monitoring are stable.
