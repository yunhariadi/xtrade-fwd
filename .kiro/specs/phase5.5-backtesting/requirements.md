# Requirements Document

## Introduction

Phase 5.5 adds a full backtesting system with a replay UI to the ICT Forward Lab. The system enables users to run the existing ICT/A-Model strategy against historical BTCUSDT candle data, producing performance metrics, equity curves, and trade lists. A replay UI allows users to visually step through backtest results as if watching the market in real-time, with all FVG overlays, liquidity markers, and trade annotations appearing at the correct time.

The backtest runner reuses the same pure strategy engine (`ictModel2022Strategy`) and forward-test logic (`ForwardTestEngine`) used in live mode, ensuring consistency between forward-test and backtest results. Historical candles are fetched from Binance REST API and stored in the existing PostgreSQL candle table.

## Glossary

- **Backtest_Runner**: The backend service that executes a backtest by processing historical candles sequentially through the strategy engine and forward-test engine.
- **Historical_Fetcher**: The component responsible for fetching historical candle data from the Binance REST API and persisting it in the database.
- **Backtest_Store**: The persistence layer for storing and retrieving backtest results, metrics, and equity curves.
- **Metrics_Calculator**: The pure function module that computes performance metrics (win rate, profit factor, max drawdown, etc.) from a list of closed trades.
- **Replay_Chart**: The frontend chart component that visually plays back backtest results candle-by-candle with overlays and trade markers.
- **Playback_Controller**: The frontend component providing play, pause, step-forward, and speed controls for the replay chart.
- **Backtest_Form**: The frontend component for configuring backtest parameters (date range, balance, risk, fees).
- **Performance_Summary**: The frontend component displaying metrics cards, equity curve chart, and trade table.
- **Equity_Curve**: A time-series of account balance values representing the account value after each trade close.
- **No_Repaint**: The guarantee that the strategy only sees candle data that would have been available at that point in time — no future data is ever exposed.
- **ForwardTestEngine**: The existing virtual trade execution engine with onSignal(), onTick(), and onCandleClosed() methods.
- **BacktestResult**: The aggregate output of a backtest run containing trades, metrics, and equity curve.
- **BacktestMetrics**: Computed performance statistics including win rate, profit factor, max drawdown, average RR, and net PnL.

## Requirements

### Requirement 1: Historical Data Fetching

**User Story:** As a trader, I want the system to fetch historical candle data from Binance for a specified date range, so that I can run backtests on past market data.

#### Acceptance Criteria

1. WHEN a backtest is initiated for a date range, THE Historical_Fetcher SHALL fetch candles from the Binance REST API for the specified symbol and timeframes (5m, 15m, 1h, 4h)
2. WHEN fetching candles that exceed the Binance per-request limit of 1000, THE Historical_Fetcher SHALL paginate requests automatically until the full date range is covered
3. WHEN historical candles are fetched, THE Historical_Fetcher SHALL store them in the existing candles table using the same schema as live candles
4. WHEN candles already exist in the database for the requested range, THE Historical_Fetcher SHALL skip re-fetching those candles and use the stored data
5. IF the Binance API returns an error or rate-limits the request, THEN THE Historical_Fetcher SHALL retry with exponential backoff up to 3 attempts before failing with a descriptive error

### Requirement 2: Backtest Execution

**User Story:** As a trader, I want to run a backtest over a historical date range using the same strategy and trade engine as live mode, so that I can evaluate strategy performance on past data.

#### Acceptance Criteria

1. WHEN a backtest is triggered with a start date, end date, symbol, and config, THE Backtest_Runner SHALL create an isolated in-memory ForwardTestEngine instance with the provided config
2. WHEN processing historical candles, THE Backtest_Runner SHALL feed candles one-by-one in chronological order to the strategy engine and forward-test engine
3. WHILE processing candles, THE Backtest_Runner SHALL enforce the no-repaint rule by only providing the strategy with candles that have closed prior to the current evaluation point
4. WHEN a 5m candle closes, THE Backtest_Runner SHALL evaluate the strategy with the full multi-timeframe context (5m, 15m, 1h, 4h candles available up to that point)
5. WHEN the strategy produces a signal, THE Backtest_Runner SHALL pass the signal to the in-memory ForwardTestEngine via onSignal()
6. WHEN a candle updates, THE Backtest_Runner SHALL call onTick() on the ForwardTestEngine to check entry triggers and SL/TP exits
7. WHEN a candle closes, THE Backtest_Runner SHALL call onCandleClosed() on the ForwardTestEngine to check timeout conditions
8. WHEN all candles in the date range have been processed, THE Backtest_Runner SHALL produce a BacktestResult containing all trades, equity curve, and computed metrics

### Requirement 3: Performance Metrics Calculation

**User Story:** As a trader, I want comprehensive performance metrics computed from backtest results, so that I can objectively evaluate strategy effectiveness.

#### Acceptance Criteria

1. WHEN a backtest completes, THE Metrics_Calculator SHALL compute total trades, wins, losses, and win rate from the list of closed trades
2. WHEN computing profit factor, THE Metrics_Calculator SHALL calculate it as gross profit divided by gross loss (absolute value), returning infinity when gross loss is zero
3. WHEN computing max drawdown, THE Metrics_Calculator SHALL track the peak equity and compute the largest decline from peak to trough in both absolute and percentage terms
4. WHEN computing net PnL, THE Metrics_Calculator SHALL sum all individual trade PnLs including fees and slippage already applied by the forward-test engine
5. WHEN computing average RR, THE Metrics_Calculator SHALL calculate the mean of rrResult values across all closed trades
6. WHEN computing average trade duration, THE Metrics_Calculator SHALL calculate the mean number of candles between trade creation and trade close
7. WHEN building the equity curve, THE Metrics_Calculator SHALL produce a time-ordered array of balance snapshots where each point corresponds to a trade close event

### Requirement 4: Backtest Result Persistence

**User Story:** As a trader, I want backtest results stored in the database, so that I can review past backtests without re-running them.

#### Acceptance Criteria

1. WHEN a backtest completes, THE Backtest_Store SHALL persist the BacktestResult including id, symbol, date range, config, trades, metrics, and equity curve
2. WHEN a user requests a list of past backtests, THE Backtest_Store SHALL return backtest summaries ordered by creation time descending
3. WHEN a user requests a specific backtest by id, THE Backtest_Store SHALL return the full BacktestResult including all trades, metrics, and equity curve

### Requirement 5: REST API Endpoints

**User Story:** As a frontend application, I want REST endpoints to trigger backtests and retrieve results, so that the UI can interact with the backtest system.

#### Acceptance Criteria

1. WHEN a POST request is sent to /api/backtest/run with startDate, endDate, symbol, and optional config overrides, THE API SHALL trigger a backtest and return the backtest id with a 202 Accepted status
2. WHEN a GET request is sent to /api/backtest/results, THE API SHALL return a list of past backtest summaries with id, symbol, date range, trade count, and net PnL
3. WHEN a GET request is sent to /api/backtest/results/:id, THE API SHALL return the full BacktestResult with trades, metrics, and equity curve
4. IF a backtest is requested with an invalid date range (start >= end), THEN THE API SHALL return a 400 Bad Request with a descriptive error message
5. IF a backtest result is requested with a non-existent id, THEN THE API SHALL return a 404 Not Found

### Requirement 6: Replay Chart Visualization

**User Story:** As a trader, I want to replay a backtest visually on a chart, so that I can see how the strategy behaved candle-by-candle as if in real-time.

#### Acceptance Criteria

1. WHEN a backtest result is loaded for replay, THE Replay_Chart SHALL display candles one-by-one in chronological order based on the current playback position
2. WHEN a candle is revealed during replay, THE Replay_Chart SHALL draw FVG boxes, liquidity lines, and signal markers at the correct time they would have appeared
3. WHEN a trade entry occurs during replay, THE Replay_Chart SHALL display entry price line, stop-loss line, and take-profit line on the chart
4. WHEN a trade closes during replay, THE Replay_Chart SHALL visually mark the exit point with the trade outcome (win/loss/timeout)
5. WHILE replay is active, THE Replay_Chart SHALL display the current trade status (pending, active, or last close result) alongside the chart

### Requirement 7: Playback Controls

**User Story:** As a trader, I want playback controls for the replay chart, so that I can step through the backtest at my own pace.

#### Acceptance Criteria

1. WHEN the Play button is pressed, THE Playback_Controller SHALL advance candles automatically at the selected speed interval
2. WHEN the Pause button is pressed, THE Playback_Controller SHALL stop automatic candle advancement and maintain the current position
3. WHEN the Step Forward button is pressed, THE Playback_Controller SHALL advance exactly one candle and remain paused
4. WHEN a speed is selected (1x, 2x, 5x, 10x), THE Playback_Controller SHALL adjust the interval between candle advances proportionally (1x = 1 second per candle, 2x = 500ms, 5x = 200ms, 10x = 100ms)
5. WHEN the replay reaches the last candle, THE Playback_Controller SHALL automatically pause and disable the Play and Step Forward buttons

### Requirement 8: Backtest Configuration Form

**User Story:** As a trader, I want a configuration form to set backtest parameters, so that I can customize the test conditions.

#### Acceptance Criteria

1. THE Backtest_Form SHALL provide inputs for start date, end date, initial balance, risk percentage, fee percentage, slippage percentage, and max trades per day
2. WHEN the "Run Backtest" button is pressed, THE Backtest_Form SHALL validate all inputs and send a POST request to /api/backtest/run
3. WHILE a backtest is running, THE Backtest_Form SHALL display a progress indicator and disable the Run button
4. WHEN the backtest completes, THE Backtest_Form SHALL transition to display the results view

### Requirement 9: Performance Summary Display

**User Story:** As a trader, I want a clear performance summary after a backtest completes, so that I can quickly assess strategy viability.

#### Acceptance Criteria

1. WHEN backtest results are available, THE Performance_Summary SHALL display stats cards for Win Rate, Profit Factor, Net PnL, Max Drawdown, and Average RR
2. WHEN backtest results are available, THE Performance_Summary SHALL display an equity curve as a line chart showing balance over time
3. WHEN backtest results are available, THE Performance_Summary SHALL display a trade table with columns for entry time, side, entry price, exit price, PnL, RR, duration, and exit reason
4. WHEN the trade table is displayed, THE Performance_Summary SHALL allow sorting by PnL, RR, and duration columns

### Requirement 10: Backtest Isolation

**User Story:** As a developer, I want each backtest to run in complete isolation from the live system, so that backtests never interfere with live forward-testing.

#### Acceptance Criteria

1. THE Backtest_Runner SHALL create a new in-memory ForwardTestEngine instance for each backtest run, independent of the live engine
2. THE Backtest_Runner SHALL use its own AccountTracker instance initialized with the config's initial balance
3. WHEN a backtest writes trades, THE Backtest_Store SHALL store them in a separate backtest_results table, not in the forward_trades table
4. WHEN a backtest accesses historical candles, THE Backtest_Runner SHALL query the shared candles table without modifying any existing candle records
