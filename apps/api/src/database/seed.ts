import { Client } from "pg";
import "dotenv/config";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/ict_forward_lab";

const EXCHANGE = "binance";
const SYMBOL = "BTCUSDT";
const TIMEFRAME = "5m";
const CANDLE_COUNT = 500;
const TIMEFRAME_SECONDS = 300; // 5 minutes

interface SeedCandle {
  exchange: string;
  symbol: string;
  timeframe: string;
  open_time: Date;
  close_time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  is_closed: boolean;
}

function generateCandles(): SeedCandle[] {
  const candles: SeedCandle[] = [];
  const startTime = new Date("2024-01-01T00:00:00Z");

  // Start with a base price around 67000-68000
  let price = 67000 + Math.random() * 1000;

  for (let i = 0; i < CANDLE_COUNT; i++) {
    const openTime = new Date(startTime.getTime() + i * TIMEFRAME_SECONDS * 1000);
    const closeTime = new Date(openTime.getTime() + TIMEFRAME_SECONDS * 1000 - 1);

    const open = price;

    // Random walk: price change between -0.5% and +0.5%
    const change = (Math.random() - 0.5) * 0.01 * open;
    const close = open + change;

    // High is the max of open/close plus a small wick (0-0.2%)
    const wickUp = Math.random() * 0.002 * open;
    const high = Math.max(open, close) + wickUp;

    // Low is the min of open/close minus a small wick (0-0.2%)
    const wickDown = Math.random() * 0.002 * open;
    const low = Math.min(open, close) - wickDown;

    // Volume between 50 and 500
    const volume = 50 + Math.random() * 450;

    candles.push({
      exchange: EXCHANGE,
      symbol: SYMBOL,
      timeframe: TIMEFRAME,
      open_time: openTime,
      close_time: closeTime,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume * 100) / 100,
      is_closed: true,
    });

    // Next candle opens at the current close price
    price = close;
  }

  return candles;
}

async function seed(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log("Connected to database");
    console.log(`Generating ${CANDLE_COUNT} ${SYMBOL} ${TIMEFRAME} candles...`);

    const candles = generateCandles();
    let inserted = 0;

    // Insert in batches of 50 for better performance
    const batchSize = 50;
    const totalBatches = Math.ceil(candles.length / batchSize);

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * batchSize;
      const end = Math.min(start + batchSize, candles.length);
      const batchCandles = candles.slice(start, end);

      // Build a multi-row INSERT with parameterized values
      const values: unknown[] = [];
      const placeholders: string[] = [];
      const colsPerRow = 11;

      batchCandles.forEach((candle, idx) => {
        const offset = idx * colsPerRow;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
        );
        values.push(
          candle.exchange,
          candle.symbol,
          candle.timeframe,
          candle.open_time.toISOString(),
          candle.close_time.toISOString(),
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
          candle.is_closed
        );
      });

      const sql = `
        INSERT INTO candles (exchange, symbol, timeframe, open_time, close_time, open, high, low, close, volume, is_closed)
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (exchange, symbol, timeframe, open_time) DO NOTHING
      `;

      const result = await client.query(sql, values);
      inserted += result.rowCount ?? 0;

      if ((batch + 1) % 5 === 0 || batch === totalBatches - 1) {
        console.log(`  Progress: ${end}/${candles.length} candles processed`);
      }
    }

    console.log(`\nSeed completed successfully:`);
    console.log(`  Total generated: ${candles.length}`);
    console.log(`  Rows inserted:   ${inserted}`);
    console.log(`  Skipped (duplicates): ${candles.length - inserted}`);
    console.log(`  Exchange: ${EXCHANGE}`);
    console.log(`  Symbol:   ${SYMBOL}`);
    console.log(`  Timeframe: ${TIMEFRAME}`);
    console.log(`  Time range: ${candles[0].open_time.toISOString()} → ${candles[candles.length - 1].close_time.toISOString()}`);
  } catch (error) {
    console.error("Seed failed:", (error as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
