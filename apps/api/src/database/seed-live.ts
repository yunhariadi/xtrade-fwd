import { Client } from "pg";
import "dotenv/config";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/ict_forward_lab";

const EXCHANGE = "binance";
const SYMBOL = "BTCUSDT";
const TIMEFRAMES = ["5m", "15m", "1h", "4h"];
const LIMIT = 500; // max per request from Binance

interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

function timeframeToDuration(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400,
  };
  return map[tf] ?? 300;
}

async function fetchKlines(symbol: string, timeframe: string, limit: number): Promise<BinanceKline[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
  console.log(`Fetching ${limit} ${timeframe} candles from Binance...`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Binance API error: ${response.status}`);

  const data = (await response.json()) as unknown[][];

  return data.map((k) => ({
    openTime: Number(k[0]),
    open: String(k[1]),
    high: String(k[2]),
    low: String(k[3]),
    close: String(k[4]),
    volume: String(k[5]),
    closeTime: Number(k[6]),
  }));
}

async function seed(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log("Connected to database");

    // Clear old seed data
    await client.query("DELETE FROM candles WHERE exchange = $1 AND symbol = $2", [EXCHANGE, SYMBOL]);
    console.log("Cleared old candle data");

    for (const tf of TIMEFRAMES) {
      const klines = await fetchKlines(SYMBOL, tf, LIMIT);
      const duration = timeframeToDuration(tf);
      let inserted = 0;

      // Insert in batches of 50
      const batchSize = 50;
      for (let i = 0; i < klines.length; i += batchSize) {
        const batch = klines.slice(i, i + batchSize);
        const values: unknown[] = [];
        const placeholders: string[] = [];
        const colsPerRow = 11;

        batch.forEach((k, idx) => {
          const offset = idx * colsPerRow;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
          );

          const openTime = new Date(k.openTime).toISOString();
          const closeTime = new Date(k.openTime + duration * 1000).toISOString();

          values.push(
            EXCHANGE,
            SYMBOL,
            tf,
            openTime,
            closeTime,
            Number(k.open),
            Number(k.high),
            Number(k.low),
            Number(k.close),
            Number(k.volume),
            true,
          );
        });

        const sql = `
          INSERT INTO candles (exchange, symbol, timeframe, open_time, close_time, open, high, low, close, volume, is_closed)
          VALUES ${placeholders.join(", ")}
          ON CONFLICT (exchange, symbol, timeframe, open_time) DO NOTHING
        `;

        const result = await client.query(sql, values);
        inserted += result.rowCount ?? 0;
      }

      console.log(`  ${tf}: ${inserted} candles inserted (${klines.length} fetched)`);
    }

    console.log("\nSeed with live Binance data completed!");
  } catch (error) {
    console.error("Seed failed:", (error as Error).message);
    console.error("Full error:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
