import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import { DeltaRecorder, type DeltaTrade } from "./delta-recorder";

const BUCKET = 300; // 5m
const T0 = 1_700_000_100_000; // arbitrary ms inside a bucket (100s past the boundary)

function makeRecorder() {
  const query = vi.fn().mockResolvedValue({ rowCount: 1 });
  const recorder = new DeltaRecorder({
    pool: { query } as unknown as Pool,
    exchange: "bybit",
    symbol: "BTCUSDT",
    timeframe: "5m",
    bucketSeconds: BUCKET,
  });
  return { recorder, query };
}

function trade(timeMs: number, side: DeltaTrade["side"], size: number): DeltaTrade {
  return { timeMs, side, size };
}

/** Params of the Nth flush: [exchange, symbol, tf, openTime, buy, sell, count, partial]. */
function flushParams(query: ReturnType<typeof vi.fn>, n = 0): unknown[] {
  return query.mock.calls[n][1] as unknown[];
}

describe("DeltaRecorder", () => {
  it("accumulates buy/sell volume and flushes when the next bucket starts", async () => {
    const { recorder, query } = makeRecorder();

    recorder.onTrade(trade(T0, "Buy", 0.5));
    recorder.onTrade(trade(T0 + 1000, "Sell", 0.2));
    recorder.onTrade(trade(T0 + 2000, "Buy", 0.3));
    expect(query).not.toHaveBeenCalled();

    // First trade of the next bucket triggers the flush of the previous one.
    recorder.onTrade(trade(T0 + BUCKET * 1000, "Sell", 1));
    await vi.waitFor(() => expect(query).toHaveBeenCalledOnce());

    const [, , , openTime, buy, sell, count] = flushParams(query);
    const expectedOpen =
      Math.floor(T0 / 1000 / BUCKET) * BUCKET * 1000;
    expect(new Date(openTime as string).getTime()).toBe(expectedOpen);
    expect(buy).toBeCloseTo(0.8);
    expect(sell).toBeCloseTo(0.2);
    expect(count).toBe(3);
  });

  it("flags the first bucket after connect as partial, later buckets complete", async () => {
    const { recorder, query } = makeRecorder();

    recorder.onTrade(trade(T0, "Buy", 1));
    recorder.onTrade(trade(T0 + BUCKET * 1000, "Buy", 1)); // flush #1 (first bucket)
    recorder.onTrade(trade(T0 + 2 * BUCKET * 1000, "Buy", 1)); // flush #2 (second bucket)
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));

    expect(flushParams(query, 0)[7]).toBe(true); // started mid-window
    expect(flushParams(query, 1)[7]).toBe(false); // fully observed
  });

  it("marks the current and next bucket partial after a stream gap", async () => {
    const { recorder, query } = makeRecorder();

    recorder.onTrade(trade(T0, "Buy", 1));
    recorder.onTrade(trade(T0 + BUCKET * 1000, "Buy", 1)); // roll into complete bucket #2

    recorder.onStreamGap(); // e.g. reconnect mid-bucket

    recorder.onTrade(trade(T0 + 2 * BUCKET * 1000, "Buy", 1)); // flush #2
    recorder.onTrade(trade(T0 + 3 * BUCKET * 1000, "Buy", 1)); // flush #3
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(3));

    expect(flushParams(query, 1)[7]).toBe(true); // bucket open during the gap
    expect(flushParams(query, 2)[7]).toBe(true); // first bucket after the gap
  });

  it("flushOpen persists the in-progress bucket as partial and clears it", async () => {
    const { recorder, query } = makeRecorder();

    recorder.onTrade(trade(T0 + BUCKET * 1000, "Sell", 0.7));
    await recorder.flushOpen();

    expect(query).toHaveBeenCalledOnce();
    const params = flushParams(query);
    expect(params[5]).toBeCloseTo(0.7); // sell volume
    expect(params[7]).toBe(true); // window hadn't elapsed

    // Nothing left to flush.
    await recorder.flushOpen();
    expect(query).toHaveBeenCalledOnce();
  });

  it("drops late trades belonging to an already-flushed bucket", async () => {
    const { recorder, query } = makeRecorder();

    recorder.onTrade(trade(T0, "Buy", 1));
    recorder.onTrade(trade(T0 + BUCKET * 1000, "Buy", 1)); // flushes bucket #1
    recorder.onTrade(trade(T0, "Sell", 5)); // replayed old trade — ignored

    await recorder.flushOpen();
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));

    const params = flushParams(query, 1); // bucket #2
    expect(params[4]).toBeCloseTo(1); // buy volume unaffected
    expect(params[5]).toBe(0); // late sell not counted
  });
});
