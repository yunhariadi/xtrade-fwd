# Implementation Plan

## Overview

Phase 5 implements the Forward-Test Engine for virtual trade execution. The work is organized as: types → position sizer → account tracker → trade store (with DB migration) → forward-test engine → REST routes → WsServer extension → frontend. Property-based tests cover the core calculation and logic modules.

## Tasks

- [ ] 1. Create types and config in `apps/api/src/forward-test/types.ts`
  - [ ] 1.1 Define TradeStatus type, ForwardTestConfig interface, ForwardTrade interface, and defaultForwardTestConfig constant matching the design document
  - [ ] 1.2 Create `apps/api/src/forward-test/index.ts` barrel export
  - [ ] 1.3 Verify types compile: run `pnpm build` in apps/api

- [ ] 2. Implement Position Sizer in `apps/api/src/forward-test/position-sizer.ts`
  - [ ] 2.1 Implement `calculatePositionSize(params)` returning `{ positionSize, riskAmount }` using formula: positionSize = (accountBalance * riskPercent / 100) / |entry - stopLoss|, riskAmount = accountBalance * riskPercent / 100. Return zero/throw if entry === stopLoss.
  - [ ] 2.2 Write property test (Property 1) in `apps/api/src/forward-test/__tests__/position-sizer.test.ts`: for any valid (balance > 0, riskPercent > 0, entry, stopLoss where entry ≠ stopLoss), verify formula correctness. Include edge case: entry === stopLoss returns zero or throws.
  - [ ] 2.3 Run tests: `pnpm test` in apps/api

- [ ] 3. Implement Account Tracker in `apps/api/src/forward-test/account-tracker.ts`
  - [ ] 3.1 Implement AccountTracker class with constructor(initialBalance), getBalance(), applyPnl(pnl), isAccountDepleted(), and reset(balance) methods
  - [ ] 3.2 Write property test (Property 6) in `apps/api/src/forward-test/__tests__/account-tracker.test.ts`: for any sequence of PnL values applied to initialBalance, final balance equals initialBalance + sum(pnls)
  - [ ] 3.3 Run tests: `pnpm test` in apps/api

- [ ] 4. Create DB migration for forward_trades table
  - [ ] 4.1 Create `apps/api/src/database/migrations/002_create_forward_trades.sql` with the table schema, indexes on status, symbol, and created_at
  - [ ] 4.2 Run migration: `pnpm migrate` in apps/api to verify it applies cleanly

- [ ] 5. Implement Trade Store in `apps/api/src/forward-test/trade-store.ts`
  - [ ] 5.1 Implement TradeStore class with constructor(pool), create(trade), update(trade), getById(id), getAll(filters), getOpenTrades(), getTodayTradeCount() methods using parameterized SQL queries
  - [ ] 5.2 Implement camelCase ↔ snake_case mapping helper for DB row conversion
  - [ ] 5.3 Write integration test in `apps/api/src/forward-test/__tests__/trade-store.test.ts`: verify CRUD operations, filtering, and sorting against test database

- [ ] 6. Implement Forward-Test Engine in `apps/api/src/forward-test/forward-test-engine.ts`
  - [ ] 6.1 Implement constructor accepting config, tradeStore, accountTracker, wsServer. Add initialize() method that loads open trades from DB and reconstructs account balance.
  - [ ] 6.2 Implement `onSignal(signal)`: validate limits (max open, max daily, min RR, account balance), calculate position size, create pending trade, persist, broadcast trade:created
  - [ ] 6.3 Implement `onTick(candle)`: for each pending trade check entry trigger (with slippage), for each active trade check SL/TP (SL priority when both hit), close trade with PnL calculation
  - [ ] 6.4 Implement `onCandleClosed(candle)`: increment candle counters, check timeout for active trades, check expiration for pending trades
  - [ ] 6.5 Implement `manualClose(tradeId, currentPrice)`: validate trade is active, close with exitReason "manual", calculate PnL
  - [ ] 6.6 Implement `cancelTrade(tradeId)`: validate trade is pending, set status "cancelled"
  - [ ] 6.7 Implement private helper `closeTrade(trade, exitPrice, exitReason, candle)`: calculate PnL, fees, status, update account, persist, broadcast

- [ ] 7. Write property tests for Forward-Test Engine core logic
  - [ ] 7.1 Write property test (Property 2) in `apps/api/src/forward-test/__tests__/entry-trigger.test.ts`: for any pending trade and candle, verify entry activation condition based on side and price comparison
  - [ ] 7.2 Write property test (Property 3) in `apps/api/src/forward-test/__tests__/slippage.test.ts`: for any (price, slippagePercent, side), verify slippage formulas for entry and exit
  - [ ] 7.3 Write property test (Property 4) in `apps/api/src/forward-test/__tests__/sl-tp-monitoring.test.ts`: for any active trade and candle, verify SL/TP detection logic and SL priority rule
  - [ ] 7.4 Write property test (Property 5) in `apps/api/src/forward-test/__tests__/pnl-calculation.test.ts`: for any closed trade parameters, verify rawPnl, fees, netPnl, pnlPercent, rrResult, and status classification
  - [ ] 7.5 Write property test (Property 7) in `apps/api/src/forward-test/__tests__/trade-limits.test.ts`: for any engine state and signal, verify acceptance/rejection based on limits
  - [ ] 7.6 Write property test (Property 8) in `apps/api/src/forward-test/__tests__/timeout.test.ts`: for any trade with candle count at/above threshold, verify timeout/expiration behavior
  - [ ] 7.7 Run all property tests: `pnpm test` in apps/api

- [ ] 8. Extend WsServer with trade broadcast method
  - [ ] 8.1 Add `broadcastTrade(event: "trade:created" | "trade:updated" | "trade:closed", trade: ForwardTrade)` method to `apps/api/src/market-data/ws-server.ts`
  - [ ] 8.2 Update WsBroadcastMessage type to include trade events

- [ ] 9. Integrate Forward-Test Engine into MarketDataService
  - [ ] 9.1 Instantiate ForwardTestEngine in MarketDataService constructor (or create a new plugin), wire config, tradeStore, accountTracker, wsServer
  - [ ] 9.2 In `handleKline()`: on candle:update call `forwardTestEngine.onTick(candle)`, on candle:closed call `forwardTestEngine.onCandleClosed(candle)`
  - [ ] 9.3 In StrategyRunner `onCandleClosed()`: after signal produced with side ≠ "none", call `forwardTestEngine.onSignal(signal)`
  - [ ] 9.4 Call `forwardTestEngine.initialize()` during service startup to load open trades from DB

- [ ] 10. Implement REST routes in `apps/api/src/routes/forward-trades.ts`
  - [ ] 10.1 Create GET /api/forward-trades route with optional query params: status, symbol, side, limit (default 50). Returns trades sorted by created_at descending.
  - [ ] 10.2 Create GET /api/forward-trades/:id route returning single trade or 404
  - [ ] 10.3 Create POST /api/forward-trades/:id/manual-close route: validate trade is active, invoke engine.manualClose(), return updated trade or 400 if invalid state
  - [ ] 10.4 Create POST /api/forward-trades/:id/cancel route: validate trade is pending, invoke engine.cancelTrade(), return updated trade or 400 if invalid state
  - [ ] 10.5 Register routes in `apps/api/src/server.ts` with prefix "/api"

- [ ] 11. Implement frontend WebSocket hook `apps/web/hooks/useTradeWebSocket.ts`
  - [ ] 11.1 Create useTradeWebSocket hook that listens for "trade:created", "trade:updated", "trade:closed" events on the existing WebSocket connection
  - [ ] 11.2 Maintain state arrays: activeTrades (status pending or active) and recentTrades (last 20 closed trades)
  - [ ] 11.3 On mount, fetch initial trades from GET /api/forward-trades

- [ ] 12. Implement frontend Trade Panel `apps/web/components/chart/TradePanel.tsx`
  - [ ] 12.1 Create TradePanel component displaying active trades: symbol, side badge, entry price, unrealized PnL, SL, TP, time since entry, "Close" button
  - [ ] 12.2 Display recent closed trades: exit reason badge, PnL (color-coded green/red), RR result, duration
  - [ ] 12.3 Wire "Close" button to POST /api/forward-trades/:id/manual-close and "Cancel" button to POST /api/forward-trades/:id/cancel
  - [ ] 12.4 Integrate TradePanel into the main page layout (apps/web/app/page.tsx)

- [ ] 13. Build verification and integration testing
  - [ ] 13.1 Run full monorepo build: `pnpm build` from root
  - [ ] 13.2 Run all tests: `pnpm test` in apps/api
  - [ ] 13.3 Verify API starts without errors and GET /api/forward-trades responds
  - [ ] 13.4 Verify WebSocket trade:created broadcast works end-to-end with a test signal
  - [ ] 13.5 Verify DB migration applied and forward_trades table exists with correct schema

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "3.3", "4.2"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "8.1", "8.2"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3", "9.4"] },
    { "id": 7, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 9, "tasks": ["12.1", "12.2", "12.3", "12.4"] },
    { "id": 10, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5"] }
  ]
}
```

## Notes

- `fast-check` needs to be added as a devDependency in `apps/api/package.json`
- The ForwardTestEngine uses in-memory state for open trades (loaded from DB on startup) for fast tick processing
- All PnL calculations use the same slippage/fee formulas regardless of exit reason (TP, SL, timeout, manual)
- The candle counter for timeout is tracked per-trade in memory (not stored in DB) — resets on restart by reloading from DB
- Position sizing uses the CURRENT account balance, not the initial balance — this means consecutive losses reduce position sizes automatically
- The REST endpoints do not require authentication in V1 (forward-test only, no real capital)
- WebSocket trade events use the same /ws endpoint as candle and signal events
