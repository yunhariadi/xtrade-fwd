/**
 * Execution-lever sweep for the fvg-retrace model.
 *
 *   tsx src/calibration/run-sweep.ts <startDate> <endDate>
 *
 * Replays the window ONCE (packet assembly per killzone bar, like the
 * calibration runner) and evaluates every execution variant on the same
 * sampled setups — a paired comparison across:
 *
 *   stop lookback:  6 / 12 (live) / 24 bars before the gap
 *   target policy:  nearest ERL (live) / fixed 1.5R / 2R / 3R
 *   horizon:        48 (live) / 96 / 288 five-minute bars
 *
 * Direction and zone selection stay fixed (packet layered bias, freshest
 * untouched gap) so cells differ ONLY by execution. Exploratory analysis:
 * 36 cells per window means winners must repeat across BOTH windows before
 * being taken seriously — see the multiple-testing note in the output.
 */
import { Pool } from "pg";
import "dotenv/config";
import type { Candle } from "@ict-forward-lab/core";
import { dbRowToCandle } from "@ict-forward-lab/core";
import {
  assembleDecisionPacket,
  buildFvgRetraceSetup,
  buildFvgZones,
  evaluateOutcome,
  getKillzone,
} from "@ict-forward-lab/strategies";
import { getExchange } from "../market-data/market-source";

const SETUP_KILLZONES = new Set(["London Open", "New York"]);
const WARMUP_4H_CANDLES = 60;
const MIN_RR = 1.5; // live engine's gate; applied per-variant

const STOP_LOOKBACKS = [6, 12, 24] as const;
const TARGETS = ["erl", "r1.5", "r2", "r3"] as const;
const HORIZONS = [48, 96, 288] as const;
const MAX_HORIZON = Math.max(...HORIZONS);

type TargetMode = (typeof TARGETS)[number];

interface Cell {
  n: number;
  filled: number;
  wins: number;
  losses: number;
  sumR: number; // over decided
}

function cellKey(sl: number, tgt: TargetMode, hz: number): string {
  return `sl${sl}|${tgt}|hz${hz}`;
}

async function loadCandles(
  pool: Pool,
  symbol: string,
  timeframe: string,
  startMs: number,
  endMs: number,
): Promise<Candle[]> {
  const result = await pool.query(
    `SELECT * FROM candles WHERE exchange = $5 AND symbol = $1 AND timeframe = $2
     AND open_time >= $3 AND open_time <= $4 AND is_closed = true
     ORDER BY open_time ASC`,
    [symbol, timeframe, new Date(startMs).toISOString(), new Date(endMs).toISOString(), getExchange()],
  );
  return result.rows.map(dbRowToCandle);
}

async function main(): Promise<void> {
  const [startDate, endDate] = process.argv.slice(2);
  if (!startDate || !endDate) {
    console.error("usage: tsx run-sweep.ts <startDate> <endDate>");
    process.exit(1);
  }
  const symbol = "BTCUSDT";
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/ict_forward_lab",
  });

  console.error(`loading candles ${startDate}..${endDate} (${getExchange()})...`);
  const [candles5m, candles15m, candles1h, candles4h] = await Promise.all([
    loadCandles(pool, symbol, "5m", startMs, endMs),
    loadCandles(pool, symbol, "15m", startMs, endMs),
    loadCandles(pool, symbol, "1h", startMs, endMs),
    loadCandles(pool, symbol, "4h", startMs, endMs),
  ]);
  console.error(`5m=${candles5m.length} 15m=${candles15m.length} 1h=${candles1h.length} 4h=${candles4h.length}`);

  const cells = new Map<string, Cell>();
  for (const sl of STOP_LOOKBACKS)
    for (const tgt of TARGETS)
      for (const hz of HORIZONS)
        cells.set(cellKey(sl, tgt, hz), { n: 0, filled: 0, wins: 0, losses: 0, sumR: 0 });

  // One sample per (stop-variant, gap) — mirrors the live per-zone de-dup.
  const sampledZoneIds = new Map<number, Set<string>>(
    STOP_LOOKBACKS.map((sl) => [sl, new Set<string>()]),
  );

  let bars = 0;
  for (let i = 0; i < candles5m.length; i++) {
    const t = candles5m[i].time;
    const kz = getKillzone(t);
    if (!kz || !SETUP_KILLZONES.has(kz.name)) continue;

    const ctx4h = candles4h.filter((c) => c.time <= t);
    if (ctx4h.length < WARMUP_4H_CANDLES) continue;

    const ctx5m = candles5m.slice(0, i + 1).slice(-300);
    const fvgZones = buildFvgZones(ctx5m);

    const packet = assembleDecisionPacket({
      symbol,
      candles5m: ctx5m,
      candles15m: candles15m.filter((c) => c.time <= t).slice(-300),
      candles1h: candles1h.filter((c) => c.time <= t).slice(-200),
      candles4h: ctx4h.slice(-200),
      fvgZones,
    });
    bars++;
    if (bars % 2000 === 0) console.error(`  ...${bars} killzone bars`);

    const direction = packet.risk.direction;
    if (direction === "none") continue;

    const erlTargets = packet.liquidity.targets
      .filter((tgt) => tgt.category === "ERL")
      .map((tgt) => tgt.price);
    const future = candles5m.slice(i + 1, i + 1 + MAX_HORIZON + 1);

    for (const sl of STOP_LOOKBACKS) {
      const setup = buildFvgRetraceSetup({
        direction,
        candles5m: ctx5m,
        fvgZones,
        erlTargets,
        stopLookbackCandles: sl,
      });
      if (!setup) continue;
      const seen = sampledZoneIds.get(sl)!;
      if (seen.has(setup.fvgZone.id)) continue;
      seen.add(setup.fvgZone.id);

      const risk = Math.abs(setup.entry - setup.stopLoss);
      const isLong = direction === "long";

      for (const tgt of TARGETS) {
        const takeProfit =
          tgt === "erl"
            ? setup.takeProfit
            : isLong
              ? setup.entry + risk * Number(tgt.slice(1))
              : setup.entry - risk * Number(tgt.slice(1));
        const rr = Math.abs(takeProfit - setup.entry) / risk;
        if (rr < MIN_RR) continue;

        for (const hz of HORIZONS) {
          const out = evaluateOutcome(
            { direction, entry: setup.entry, stopLoss: setup.stopLoss, takeProfit, time: t },
            future,
            { horizonCandles: hz },
          );
          const cell = cells.get(cellKey(sl, tgt, hz))!;
          cell.n++;
          if (out.filled) cell.filled++;
          if (out.outcome === "win") {
            cell.wins++;
            cell.sumR += out.rMultiple ?? 0;
          } else if (out.outcome === "loss") {
            cell.losses++;
            cell.sumR += -1;
          }
        }
      }
    }
  }

  await pool.end();

  // Report: one row per stop×target, columns per horizon.
  console.log(`\n=== execution-lever sweep ${startDate}..${endDate} (${bars} killzone bars) ===`);
  console.log("cell = winRate/avgR (decided n); live config is sl12|erl|hz48\n");
  const header = ["variant".padEnd(12), ...HORIZONS.map((h) => `hz${h}`.padEnd(22))].join("");
  console.log(header);
  for (const sl of STOP_LOOKBACKS) {
    for (const tgt of TARGETS) {
      const row = [`sl${sl}|${tgt}`.padEnd(12)];
      for (const hz of HORIZONS) {
        const c = cells.get(cellKey(sl, tgt, hz))!;
        const decided = c.wins + c.losses;
        const wr = decided > 0 ? (c.wins / decided).toFixed(3) : "—";
        const avgR = decided > 0 ? (c.sumR / decided).toFixed(3) : "—";
        row.push(`${wr}/${avgR} (${decided})`.padEnd(22));
      }
      console.log(row.join(""));
    }
  }
  console.log(
    "\nNOTE: 36 cells — exploratory. Only trust variants that repeat across BOTH windows.",
  );
}

main().catch((err) => {
  console.error("sweep failed:", err);
  process.exit(1);
});
