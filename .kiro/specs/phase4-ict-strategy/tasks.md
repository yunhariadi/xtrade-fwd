# Implementation Plan

## Overview

Phase 4 implements the ICT / A-Model multi-timeframe strategy engine. The work is organized as: types → shared utilities → individual detection modules → orchestrator → API layer → frontend. Each detection module has corresponding property-based tests.

## Tasks

- [x] 1. Create `packages/strategies/src/ict-model-2022/types.ts` with SwingPoint, BiasDirection, LiquiditySweepResult, MSSResult, FvgEntryResult, StrategyContext, SignalSide, ChartDrawing, and StrategySignal interfaces
  - [x] 1.1 Define all type interfaces matching the design document data models
  - [x] 1.2 Create `packages/strategies/src/ict-model-2022/index.ts` barrel export
  - [x] 1.3 Update `packages/strategies/src/index.ts` to export from `./ict-model-2022`
  - [x] 1.4 Run `pnpm build` in packages/strategies to verify types compile
- [ ] 2. Implement Swing Point Detection utility in `packages/strategies/src/utils/swing-points.ts`
  - [x] 2.1 Implement `detectSwingPoints(candles, leftBars=5, rightBars=5)` that identifies local highs and lows by comparing a candle against N neighbors on each side
  - [x] 2.2 Create `packages/strategies/src/utils/index.ts` barrel export
  - [~] 2.3 Write property test for swing point correctness (Property 1): for any candle array with planted swing points, verify detection identifies them correctly and returned fields (type, price, time, index) are consistent with source candles
  - [~] 2.4 Run tests: `pnpm test` in packages/strategies
- [ ] 3. Implement 4H Bias Detection in `packages/strategies/src/bias/detect.ts`
  - [x] 3.1 Implement `detect4HBias(candles4h)` analyzing last 20 candles, detecting swing points, classifying HH/HL as bullish, LH/LL as bearish, else neutral
  - [x] 3.2 Create `packages/strategies/src/bias/index.ts` barrel export
  - [~] 3.3 Write property test for bias classification (Property 2): for any 4H candle array, verify bias matches swing structure pattern
  - [~] 3.4 Run tests: `pnpm test` in packages/strategies
- [ ] 4. Implement 15m Liquidity Sweep Detection in `packages/strategies/src/liquidity/detect.ts`
  - [x] 4.1 Implement `detectLiquiditySweep(candles15m)` checking most recent candle's wicks against swing point levels using 5-bar pivots
  - [x] 4.2 Create `packages/strategies/src/liquidity/index.ts` barrel export
  - [~] 4.3 Write property test for liquidity sweep correctness (Property 3): for any 15m array with a known sweep candle, verify direction and sweptLevel are correct
  - [~] 4.4 Run tests: `pnpm test` in packages/strategies
- [ ] 5. Implement 15m MSS/ChoCh Detection in `packages/strategies/src/mss-choch/detect.ts`
  - [x] 5.1 Implement `detectMSS(candles15m)` identifying breaks of structure (above last LH in downtrend = bullish MSS, below last HL in uptrend = bearish MSS), requiring 3+ swing points
  - [x] 5.2 Create `packages/strategies/src/mss-choch/index.ts` barrel export
  - [~] 5.3 Write property test for MSS detection (Property 4): for any 15m array with 3+ swing points forming a trend, verify break detection and direction
  - [~] 5.4 Run tests: `pnpm test` in packages/strategies
- [ ] 6. Implement 5m FVG Entry Detection in `packages/strategies/src/entry/fvg-entry.ts`
  - [x] 6.1 Implement `detectFvgEntry(candles5m, direction, sweepResult)` finding most recent FVG matching direction and calculating entry at correct edge, SL relative to sweep, TP at 2:1 RR
  - [x] 6.2 Create `packages/strategies/src/entry/index.ts` barrel export
  - [~] 6.3 Write property test for FVG entry placement (Property 5): verify entry equals correct FVG edge based on direction
  - [~] 6.4 Write property test for risk-reward calculation (Property 6): verify |TP - entry| / |entry - SL| == 2.0
  - [~] 6.5 Run tests: `pnpm test` in packages/strategies
- [ ] 7. Implement Strategy Orchestrator in `packages/strategies/src/ict-model-2022/strategy.ts`
  - [x] 7.1 Implement `ictModel2022Strategy(ctx)` calling bias → liquidity → MSS → entry in sequence, returning StrategySignal with appropriate side, reasons, and drawings
  - [~] 7.2 Write property test for strategy confluence (Property 7): verify signal side matches presence/absence of all four confluence factors
  - [~] 7.3 Write property test for signal structure invariant (Property 8): verify non-none signals have complete data and none signals have empty arrays
  - [~] 7.4 Write property test for no-repaint timing (Property 9): verify signalTime equals last closed candle time
  - [~] 7.5 Run tests: `pnpm test` in packages/strategies
- [x] 8. Update package exports and verify build
  - [x] 8.1 Update `packages/strategies/src/index.ts` to export all new modules: utils, bias, liquidity, mss-choch, entry, ict-model-2022
  - [x] 8.2 Run `pnpm build` in packages/strategies to confirm all exports compile cleanly
- [ ] 9. Implement Signal Store in `apps/api/src/strategy/signal-store.ts`
  - [x] 9.1 Implement SignalStore class with bounded ring buffer (max 100), add(), getRecent(limit), getBySymbol(symbol, limit) methods
  - [~] 9.2 Write unit test for SignalStore verifying add/get behavior, overflow eviction, and symbol filtering
- [x] 10. Implement Strategy Runner in `apps/api/src/strategy/strategy-runner.ts`
  - [x] 10.1 Implement StrategyRunner class that builds StrategyContext from DB candles, calls ictModel2022Strategy, stores signal if side != none, broadcasts via WsServer
  - [x] 10.2 Add `onCandleClosed` method gating on `isClosed === true` and timeframe === "5m" before invoking strategy
  - [x] 10.3 Integrate StrategyRunner into MarketDataService: instantiate in constructor, call onCandleClosed when a 5m candle closes
  - [x] 10.4 Extend WsServer broadcast to support "signal:new" event type
- [ ] 11. Add Signals REST Endpoint in `apps/api/src/routes/signals.ts`
  - [x] 11.1 Create GET /api/signals route accepting optional symbol and limit query params, returning signals from SignalStore
  - [x] 11.2 Register signals route in the Fastify server
  - [~] 11.3 Write integration test verifying GET /api/signals returns seeded signals correctly
- [ ] 12. Implement Frontend Signal Panel
  - [x] 12.1 Create `apps/web/hooks/useSignalWebSocket.ts` hook listening for "signal:new" WebSocket events
  - [x] 12.2 Create `apps/web/components/chart/SignalPanel.tsx` displaying recent signals (side, entry, SL, TP, RR, reasons, time)
  - [~] 12.3 Add chart annotation rendering from signal.drawings on CandlestickChart (FVG box, sweep marker, MSS line)
  - [x] 12.4 Integrate SignalPanel into the main page layout
- [ ] 13. Build and Integration Verification
  - [x] 13.1 Run full monorepo build: `pnpm build` from root
  - [~] 13.2 Run all strategy tests: `pnpm test` in packages/strategies
  - [~] 13.3 Verify API starts without errors and /api/signals endpoint responds
  - [~] 13.4 Verify WebSocket signal:new broadcast works with a manual test candle

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2", "9.1"] },
    { "id": 2, "tasks": ["3.1", "3.2", "4.1", "4.2", "5.1", "5.2", "6.1", "6.2"] },
    { "id": 3, "tasks": ["7.1"] },
    { "id": 4, "tasks": ["8.1", "8.2", "10.1", "10.2", "10.3", "10.4"] },
    { "id": 5, "tasks": ["11.1", "11.2"] },
    { "id": 6, "tasks": ["12.1", "12.2", "12.3", "12.4"] },
    { "id": 7, "tasks": ["13.1", "13.2", "13.3", "13.4"] }
  ]
}
```

## Notes

- `fast-check` is already installed as a devDependency in packages/strategies
- The existing FVG detection in `packages/strategies/src/fvg/` is reused by the entry module
- Signal persistence to PostgreSQL (signals table) is deferred to a follow-up; V1 uses in-memory store
- All strategy modules are pure functions — no I/O, no mutation, deterministic outputs
- The StrategyRunner is the only stateful component, bridging the pure strategy with the API layer
