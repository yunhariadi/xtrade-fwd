# Implementation Plan

## Overview

Phase 5.5 implements the backtesting system and replay UI. Work is organized as: types → database migration → historical fetcher → metrics calculator → backtest runner → persistence → REST API → frontend. The backtest runner reuses the existing `ForwardTestEngine` and `ictModel2022Strategy` in isolation, guaranteeing behavioral consistency with live forward-testing.

## Tasks

- [ ] 1. Create backtest types in `apps/api/src/backtest/types.ts`
  - [ ] 1.1 Define `BacktestConfig` interface (symbol, startDate, endDate, initialBalance, riskPerTradePercent, feePercent, slippagePercent, maxOpenTrades, maxTradesPerDay, minRiskReward, tradeTimeoutCandles)
  - [ ] 1.2 Define `BacktestMetrics` interface (totalTrades, wins, losses, breakeven, winRate, profitFactor, netPnl, maxDrawdown, maxDrawdownPercent, averageRR, averageDurationCandles, bestTrade, worstTrade)
  - [ ] 1.3 Define `EquityPoint` interface (time, balance)
  - [ ] 1.4 Define `BacktestResult` interface (id, symbol, startTime, endTime, config, trades, metrics, equityCurve, createdAt)
  - [ ] 1.5 Define `BacktestSummary` interface (id, symbol, startTime, endTime, tradeCount, netPnl, winRate, createdAt)
  - [ ] 1.6 Create `apps/api/src/backtest/index.ts` barrel export

- [ ] 2. Create database migration for `backtest_results` table
  - [ ] 2.1 Create `apps/api/src/database/migrations/003_create_backtest_results.sql` with BIGSERIAL id, symbol TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, config JSONB, trades JSONB, metrics JSONB, equity_curve JSONB, created_at TIMESTAMPTZ DEFAULT now()
  - [ ] 2.2 Run migration: `pnpm migrate` in apps/api to verify it applies cleanly

- [ ] 3. Implement HistoricalFetcher in `apps/api/src/backtest/historical-fetcher.ts`
  - [ ] 3.1 Implement `fetchFromBinance(symbol, interval, startTime, endTime)` that calls Binance REST API (`GET https://fapi.binance.com/fapi/v1/klines`) with limit=1000 and returns parsed candles
  - [ ] 3.2 Implement pagination logic: when date range exceeds 1000 candles, loop with advancing startTime until endTime is reached
  - [ ] 3.3 Implement retry with exponential backoff (1s, 2s, 4s) on 429/5xx responses, max 3 attempts
  - [ ] 3.4 Implement `fetchRange(options: FetchOptions)` that fetches all timeframes (5m, 15m, 1h, 4h) and stores candles in the candles table using ON CONFLICT DO NOTHING
  - [ ] 3.5 Implement gap detection: check existing candles in DB and only fetch missing time ranges
  - [ ] 3.6 Write property test for pagination coverage (Property 1): for any date range spanning N > 1000 candles, verify requests cover the full range with no gaps

- [ ] 4. Implement MetricsCalculator in `apps/api/src/backtest/metrics-calculator.ts`
  - [ ] 4.1 Implement `calculateMetrics(trades, initialBalance)` computing totalTrades, wins, losses, breakeven, winRate, netPnl, averageRR, averageDurationCandles, bestTrade, worstTrade
  - [ ] 4.2 Implement profit factor calculation: sum(positive PnLs) / abs(sum(negative PnLs)), return Infinity when no losses
  - [ ] 4.3 Implement max drawdown calculation: track peak equity through trade sequence, find largest peak-to-trough decline in absolute and percentage terms
  - [ ] 4.4 Implement `buildEquityCurve(trades, initialBalance)` producing time-ordered EquityPoint array where each point = previous balance + trade PnL
  - [ ] 4.5 Write property test for metrics arithmetic (Property 4): for any trade list, verify wins+losses+breakeven=total, winRate=wins/total, netPnl=sum(pnl), avgRR=mean(rrResult)
  - [ ] 4.6 Write property test for profit factor (Property 5): for any trade list with wins and losses, verify profitFactor = grossProfit/grossLoss
  - [ ] 4.7 Write property test for max drawdown (Property 6): for any equity curve, verify maxDrawdown is the largest peak-to-trough decline
  - [ ] 4.8 Write property test for equity curve construction (Property 7): for any initial balance and sorted trades, verify curve[i] = curve[i-1] + trades[i-1].pnl

- [ ] 5. Implement BacktestRunner in `apps/api/src/backtest/backtest-runner.ts`
  - [ ] 5.1 Implement `run(config)` method that creates isolated ForwardTestEngine with fresh AccountTracker(config.initialBalance) and a no-op WsServer stub
  - [ ] 5.2 Implement candle loading: query all closed candles from DB for the date range, grouped by timeframe, sorted chronologically
  - [ ] 5.3 Implement sequential processing loop: iterate 5m candles, build StrategyContext with only candles closed at or before current time, call ictModel2022Strategy
  - [ ] 5.4 Implement signal handling: when strategy returns side !== "none", call engine.onSignal(signal)
  - [ ] 5.5 Implement tick/close handling: call engine.onTick(candle) and engine.onCandleClosed(candle) for each 5m candle
  - [ ] 5.6 Implement result assembly: after all candles processed, collect trades from engine, compute metrics, build equity curve, return BacktestResult
  - [ ] 5.7 Write property test for no-repaint (Property 2): for any evaluation point T, verify strategy context contains only candles with close time ≤ T
  - [ ] 5.8 Write property test for multi-timeframe context (Property 3): for any 5m close at time T, verify all timeframe candles in context have close time ≤ T

- [ ] 6. Implement BacktestStore in `apps/api/src/backtest/backtest-store.ts`
  - [ ] 6.1 Implement `save(result)` that inserts into backtest_results table with JSONB fields, returns generated id
  - [ ] 6.2 Implement `list()` that returns BacktestSummary array ordered by created_at DESC
  - [ ] 6.3 Implement `getById(id)` that returns full BacktestResult or null

- [ ] 7. Implement REST endpoints in `apps/api/src/routes/backtest.ts`
  - [ ] 7.1 Implement POST /api/backtest/run: validate input (start < end, required fields), call HistoricalFetcher.fetchRange, then BacktestRunner.run, save result, return 202 with id
  - [ ] 7.2 Implement GET /api/backtest/results: call BacktestStore.list(), return array of summaries
  - [ ] 7.3 Implement GET /api/backtest/results/:id: call BacktestStore.getById(), return result or 404
  - [ ] 7.4 Add input validation: return 400 if startDate >= endDate or missing required fields
  - [ ] 7.5 Register backtest routes in `apps/api/src/server.ts` with prefix "/api"

- [ ] 8. Implement BacktestForm component in `apps/web/components/backtest/BacktestForm.tsx`
  - [ ] 8.1 Create form with inputs: start date, end date, initial balance, risk %, fee %, slippage %, max trades/day
  - [ ] 8.2 Implement client-side validation (start < end, numeric ranges valid)
  - [ ] 8.3 Implement submit handler: POST to /api/backtest/run, show loading state, disable button during run
  - [ ] 8.4 On completion, call onResult callback with the backtest id to transition to results view

- [ ] 9. Implement BacktestResults component in `apps/web/components/backtest/BacktestResults.tsx`
  - [ ] 9.1 Create metrics cards displaying: Win Rate, Profit Factor, Net PnL, Max Drawdown, Average RR, Total Trades
  - [ ] 9.2 Create trade table with columns: entry time, side, entry price, exit price, PnL, RR, duration, exit reason
  - [ ] 9.3 Implement column sorting (PnL, RR, duration) with ascending/descending toggle
  - [ ] 9.4 Write property test for sort ordering (Property 9): for any trade list and sort column, verify rows are correctly ordered

- [ ] 10. Implement EquityCurve component in `apps/web/components/backtest/EquityCurve.tsx`
  - [ ] 10.1 Create line chart using Lightweight Charts displaying balance over time from EquityPoint array
  - [ ] 10.2 Style with green fill below line, responsive sizing

- [ ] 11. Implement ReplayChart component in `apps/web/components/backtest/ReplayChart.tsx`
  - [ ] 11.1 Create Lightweight Charts candlestick chart that renders candles[0..currentPosition]
  - [ ] 11.2 Implement overlay rendering: draw FVG boxes, liquidity lines at the candle time they appeared
  - [ ] 11.3 Implement trade markers: entry line (dashed), SL line (red), TP line (green) when trade enters
  - [ ] 11.4 Implement exit markers: colored dot at exit point with win/loss/timeout label
  - [ ] 11.5 Display current trade status badge (pending/active/last result)

- [ ] 12. Implement PlaybackControls component in `apps/web/components/backtest/PlaybackControls.tsx`
  - [ ] 12.1 Create Play, Pause, Step Forward buttons with appropriate icons
  - [ ] 12.2 Create speed selector buttons: 1x, 2x, 5x, 10x
  - [ ] 12.3 Implement auto-advance timer using setInterval with interval = 1000/speed ms
  - [ ] 12.4 Implement Step Forward: increment position by 1 and stay paused
  - [ ] 12.5 Implement auto-pause when position reaches last candle, disable Play and Step buttons
  - [ ] 12.6 Display progress bar showing currentPosition / totalCandles

- [ ] 13. Create backtest page in `apps/web/app/backtest/page.tsx`
  - [ ] 13.1 Create page layout with BacktestForm on top, conditionally showing results section
  - [ ] 13.2 Implement state management: form → loading → results with tabs (Summary, Replay)
  - [ ] 13.3 Wire BacktestResults with fetched data from GET /api/backtest/results/:id
  - [ ] 13.4 Wire ReplayChart + PlaybackControls with candle data and trade events
  - [ ] 13.5 Add navigation link to backtest page in the main layout/header

- [ ] 14. Integration testing and verification
  - [ ] 14.1 Run database migration and verify backtest_results table exists
  - [ ] 14.2 Run full monorepo build: `pnpm build` from root
  - [ ] 14.3 Test HistoricalFetcher with a small date range (e.g., 1 day of 5m candles)
  - [ ] 14.4 Test full backtest flow: fetch → run → verify results persisted with correct metrics
  - [ ] 14.5 Verify frontend renders: form submission → results display → replay playback
  - [ ] 14.6 Run all property tests: `pnpm vitest run` in apps/api

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "4.1", "4.2", "4.3", "4.4"] },
    { "id": 3, "tasks": ["3.6", "4.5", "4.6", "4.7", "4.8", "5.1", "5.2", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 4, "tasks": ["5.7", "5.8", "6.1", "6.2", "6.3"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.3", "8.4", "9.1", "9.2", "9.3", "10.1", "10.2"] },
    { "id": 7, "tasks": ["9.4", "11.1", "11.2", "11.3", "11.4", "11.5", "12.1", "12.2", "12.3", "12.4", "12.5", "12.6"] },
    { "id": 8, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5"] },
    { "id": 9, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5", "14.6"] }
  ]
}
```

## Notes

- `fast-check` is already installed as a devDependency in `apps/api`
- The existing `ForwardTestEngine` expects a `WsServer` and `TradeStore` — for backtest mode, use a no-op stub for WsServer and an in-memory TradeStore implementation
- The HistoricalFetcher reuses the same candles table schema; ON CONFLICT DO NOTHING prevents duplication
- The `ictModel2022Strategy` is a pure function imported from `@ict-forward-lab/strategies` — no modifications needed
- Binance futures klines endpoint: `https://fapi.binance.com/fapi/v1/klines` (no API key required for public data)
- Lightweight Charts v5 is already installed in apps/web
- The backtest is synchronous (runs to completion in one request) — for backtests > 6 months, consider adding a job queue in a future iteration
- All property tests use the tag format: `// Feature: phase5.5-backtesting, Property N: <description>`
