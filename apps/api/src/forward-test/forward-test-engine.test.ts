import { describe, it, expect, beforeEach } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import type { StrategySignal } from "@ict-forward-lab/strategies";
import { ForwardTestEngine } from "./forward-test-engine";
import { AccountTracker } from "./account-tracker";
import type { ForwardTestConfig, ForwardTrade } from "./types";

/** Minimal in-memory trade store matching the subset the engine uses. */
class FakeTradeStore {
  trades: ForwardTrade[] = [];
  private seq = 0;
  todayCount = 0;

  async create(trade: ForwardTrade): Promise<ForwardTrade> {
    trade.id = String(++this.seq);
    this.trades.push({ ...trade });
    return trade;
  }
  async update(trade: ForwardTrade): Promise<ForwardTrade> {
    const idx = this.trades.findIndex((t) => t.id === trade.id);
    if (idx >= 0) this.trades[idx] = { ...trade };
    return trade;
  }
  async getById(id: string): Promise<ForwardTrade | null> {
    return this.trades.find((t) => t.id === id) ?? null;
  }
  async getAll(): Promise<ForwardTrade[]> {
    return this.trades;
  }
  async getOpenTrades(): Promise<ForwardTrade[]> {
    return this.trades.filter((t) => t.status === "pending" || t.status === "active");
  }
  async getTodayTradeCount(): Promise<number> {
    return this.todayCount;
  }
}

/** Captures broadcast events for assertions. */
class FakeWsServer {
  events: Array<{ event: string; trade: ForwardTrade }> = [];
  broadcast() {}
  broadcastFvg() {}
  broadcastSignal() {}
  broadcastTrade(event: string, trade: ForwardTrade) {
    this.events.push({ event, trade: { ...trade } });
  }
  register() {}
  getClientCount() {
    return 0;
  }
}

const config: ForwardTestConfig = {
  initialBalance: 10_000,
  riskPerTradePercent: 1,
  feePercent: 0,        // simplify PnL assertions
  slippagePercent: 0,   // simplify entry/exit assertions
  maxOpenTrades: 1,
  maxTradesPerDay: 3,
  minRiskReward: 2,
  tradeTimeoutCandles: 24,
  maxLeverage: 10,
  minSetupScore: 0,             // gating exercised in its own describe block
  requireKillzone: false,
  requirePremiumDiscount: false,
  maxOpenShadowTrades: 5,
};

function makeEngine(cfg: Partial<ForwardTestConfig> = {}) {
  const store = new FakeTradeStore();
  const ws = new FakeWsServer();
  const account = new AccountTracker(config.initialBalance);
  const engine = new ForwardTestEngine({
    config: { ...config, ...cfg },
    tradeStore: store as never,
    accountTracker: account,
    wsServer: ws as never,
  });
  return { engine, store, ws, account };
}

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 1, isClosed: true };
}

/** A complete long signal: entry 100, SL 90, TP 120 → RR 2. */
function longSignal(overrides: Partial<StrategySignal> = {}): StrategySignal {
  return {
    side: "long",
    symbol: "BTCUSDT",
    timeframe: "5m",
    signalTime: 1000,
    entry: 100,
    stopLoss: 90,
    takeProfit: 120,
    riskReward: 2,
    reasons: [],
    drawings: [],
    metadata: { entry: { fvgZoneId: "bullish-fvg-1000" }, signalEntry: 100 },
    ...overrides,
  };
}

describe("ForwardTestEngine — signal acceptance", () => {
  let h: ReturnType<typeof makeEngine>;
  beforeEach(() => {
    h = makeEngine();
  });

  it("creates a pending trade from a valid signal", async () => {
    const trade = await h.engine.onSignal(longSignal());
    expect(trade).not.toBeNull();
    expect(trade!.status).toBe("pending");
    expect(trade!.stopLoss).toBe(90);
    expect(trade!.takeProfit).toBe(120);
    // riskAmount = 1% of 10000 = 100; positionSize = 100 / |100-90| = 10
    expect(trade!.riskAmount).toBe(100);
    expect(trade!.positionSize).toBe(10);
    expect(h.ws.events.some((e) => e.event === "trade:created")).toBe(true);
  });

  it("rejects an incomplete signal (missing TP)", async () => {
    const trade = await h.engine.onSignal(longSignal({ takeProfit: undefined }));
    expect(trade).toBeNull();
  });

  it("rejects a signal below the minimum RR", async () => {
    const trade = await h.engine.onSignal(longSignal({ riskReward: 1.5 }));
    expect(trade).toBeNull();
  });

  it("rejects a signal where entry equals stopLoss", async () => {
    const trade = await h.engine.onSignal(longSignal({ entry: 90, stopLoss: 90 }));
    expect(trade).toBeNull();
  });

  it("de-duplicates the same setup (same FVG zone id)", async () => {
    const first = await h.engine.onSignal(longSignal({ signalTime: 1000 }));
    // Same fvgZoneId but a later signalTime — should be rejected as a dup.
    const second = await h.engine.onSignal(longSignal({ signalTime: 2000 }));
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("respects maxOpenTrades", async () => {
    const first = await h.engine.onSignal(longSignal({ metadata: { entry: { fvgZoneId: "a" }, signalEntry: 100 } }));
    const second = await h.engine.onSignal(longSignal({ metadata: { entry: { fvgZoneId: "b" }, signalEntry: 100 } }));
    expect(first).not.toBeNull();
    expect(second).toBeNull(); // already 1 open, max is 1
  });

  it("respects maxTradesPerDay", async () => {
    const handle = makeEngine({ maxTradesPerDay: 0 });
    const trade = await handle.engine.onSignal(longSignal());
    expect(trade).toBeNull();
  });
});

/** Gate metadata as the StrategyRunner attaches it (SignalGateInfo shape). */
function withGate(
  gate: Partial<{
    score: number;
    killzone: string | null;
    location: "premium" | "discount" | "equilibrium";
  }> = {},
  fvgZoneId = "bullish-fvg-1000",
): Partial<StrategySignal> {
  return {
    metadata: {
      entry: { fvgZoneId },
      signalEntry: 100,
      gate: {
        score: gate.score ?? 85,
        grade: "A",
        recommendation: "send_to_oc_and_ha",
        killzone: gate.killzone === undefined ? "London Open" : gate.killzone,
        premiumDiscount:
          gate.location === undefined
            ? { location: "discount", zone: "middle_discount" }
            : { location: gate.location, zone: gate.location },
      },
    },
  };
}

describe("ForwardTestEngine — confluence gating", () => {
  it("rejects a signal whose score is below minSetupScore", async () => {
    const { engine } = makeEngine({ minSetupScore: 70 });
    const trade = await engine.onSignal(longSignal(withGate({ score: 65 })));
    expect(trade).toBeNull();
  });

  it("accepts a signal at or above minSetupScore", async () => {
    const { engine } = makeEngine({ minSetupScore: 70 });
    const trade = await engine.onSignal(longSignal(withGate({ score: 70 })));
    expect(trade).not.toBeNull();
  });

  it("rejects a signal outside the setup killzones", async () => {
    const { engine } = makeEngine({ requireKillzone: true });
    expect(await engine.onSignal(longSignal(withGate({ killzone: null }, "a")))).toBeNull();
    expect(await engine.onSignal(longSignal(withGate({ killzone: "Asian" }, "b")))).toBeNull();
  });

  it("accepts a signal inside a setup killzone", async () => {
    const { engine } = makeEngine({ requireKillzone: true });
    const trade = await engine.onSignal(longSignal(withGate({ killzone: "New York" })));
    expect(trade).not.toBeNull();
  });

  it("rejects a long in premium and a short in discount", async () => {
    const { engine } = makeEngine({ requirePremiumDiscount: true });
    expect(await engine.onSignal(longSignal(withGate({ location: "premium" }, "a")))).toBeNull();
    const short = await engine.onSignal(
      longSignal({
        side: "short",
        entry: 100,
        stopLoss: 110,
        takeProfit: 80,
        ...withGate({ location: "discount" }, "b"),
      }),
    );
    expect(short).toBeNull();
  });

  it("accepts a long in discount and either side at equilibrium", async () => {
    const { engine } = makeEngine({ requirePremiumDiscount: true, maxOpenTrades: 2 });
    expect(await engine.onSignal(longSignal(withGate({ location: "discount" }, "a")))).not.toBeNull();
    expect(await engine.onSignal(longSignal(withGate({ location: "equilibrium" }, "b")))).not.toBeNull();
  });

  it("bypasses gating for signals without gate metadata", async () => {
    const { engine } = makeEngine({
      minSetupScore: 70,
      requireKillzone: true,
      requirePremiumDiscount: true,
    });
    const trade = await engine.onSignal(longSignal());
    expect(trade).not.toBeNull();
  });
});

describe("ForwardTestEngine — entry & exit", () => {
  it("fills a long entry when price retraces to the entry level", async () => {
    const { engine } = makeEngine();
    await engine.onSignal(longSignal());

    // Price hasn't retraced yet — stays pending.
    await engine.onTick(candle(1100, 105, 108, 101, 107));
    expect(engine.getOpenTrades()[0].status).toBe("pending");

    // Candle low touches 100 → fills.
    await engine.onTick(candle(1200, 104, 106, 99, 103));
    expect(engine.getOpenTrades()[0].status).toBe("active");
    expect(engine.getOpenTrades()[0].entryPrice).toBe(100);
  });

  it("closes a long at TP with correct PnL", async () => {
    const { engine, account } = makeEngine();
    await engine.onSignal(longSignal());
    await engine.onTick(candle(1200, 104, 106, 99, 103)); // fill at 100

    await engine.onTick(candle(1300, 110, 121, 108, 119)); // high 121 >= TP 120
    const open = engine.getOpenTrades();
    expect(open.length).toBe(0);
    // PnL = (120 - 100) * 10 = 200, no fees/slippage
    expect(account.getBalance()).toBe(10_200);
  });

  it("closes a long at SL with correct loss", async () => {
    const { engine, account } = makeEngine();
    await engine.onSignal(longSignal());
    await engine.onTick(candle(1200, 104, 106, 99, 103)); // fill at 100

    await engine.onTick(candle(1300, 99, 100, 89, 91)); // low 89 <= SL 90
    expect(engine.getOpenTrades().length).toBe(0);
    // PnL = (90 - 100) * 10 = -100
    expect(account.getBalance()).toBe(9_900);
  });

  it("treats SL as the winner when a single candle hits both SL and TP", async () => {
    const { engine, account } = makeEngine();
    await engine.onSignal(longSignal());
    await engine.onTick(candle(1200, 104, 106, 99, 103)); // fill at 100

    // Candle spans both 89 (SL) and 121 (TP) → SL wins (worst case).
    await engine.onTick(candle(1300, 100, 121, 89, 100));
    expect(account.getBalance()).toBe(9_900);
  });

  it("exits on the same candle that fills the entry (no free bar)", async () => {
    const { engine, account } = makeEngine();
    await engine.onSignal(longSignal());

    // One bar drops to the entry (low 99 ≤ 100, fills at 100) and, in the same
    // bar, breaches the stop (low 89 ≤ SL 90). The fill candle must close the
    // trade at SL rather than handing it a free bar to survive in.
    await engine.onTick(candle(1200, 101, 102, 89, 95));
    expect(engine.getOpenTrades().length).toBe(0);
    // PnL = (90 - 100) * 10 = -100
    expect(account.getBalance()).toBe(9_900);
  });
});

describe("ForwardTestEngine — concurrency & lifecycle", () => {
  it("does not double-close when ticks overlap", async () => {
    const { engine, account } = makeEngine();
    await engine.onSignal(longSignal());
    await engine.onTick(candle(1200, 104, 106, 99, 103)); // fill at 100

    // Fire two exit-triggering ticks without awaiting the first.
    const tpCandle = candle(1300, 110, 121, 108, 119);
    const p1 = engine.onTick(tpCandle);
    const p2 = engine.onTick(tpCandle);
    await Promise.all([p1, p2]);

    // PnL applied exactly once.
    expect(account.getBalance()).toBe(10_200);
    expect(engine.getOpenTrades().length).toBe(0);
  });

  it("expires a pending trade after the timeout window", async () => {
    const { engine } = makeEngine({ tradeTimeoutCandles: 2 });
    await engine.onSignal(longSignal());

    await engine.onCandleClosed(candle(1100, 105, 106, 104, 105));
    expect(engine.getOpenTrades().length).toBe(1); // 1 candle, not yet expired
    await engine.onCandleClosed(candle(1200, 105, 106, 104, 105));
    expect(engine.getOpenTrades().length).toBe(0); // expired at 2
  });

  it("cancels a pending trade", async () => {
    const { engine } = makeEngine();
    const trade = await engine.onSignal(longSignal());
    const cancelled = await engine.cancelTrade(trade!.id);
    expect(cancelled.status).toBe("cancelled");
    expect(engine.getOpenTrades().length).toBe(0);
  });

  it("manually closes an active trade at the given price", async () => {
    const { engine, account } = makeEngine();
    const trade = await engine.onSignal(longSignal());
    await engine.onTick(candle(1200, 104, 106, 99, 103)); // fill at 100

    const closed = await engine.manualClose(trade!.id, 110);
    expect(closed.status).toBe("closed_manual");
    // PnL = (110 - 100) * 10 = 100
    expect(account.getBalance()).toBe(10_100);
  });
});

describe("ForwardTestEngine — agent shadow trades", () => {
  /** A coherent long shadow request: entry 100, SL 90, TP 120. */
  function shadowReq(overrides: Record<string, unknown> = {}) {
    return {
      symbol: "BTCUSDT",
      side: "long" as const,
      entry: 100,
      stopLoss: 90,
      takeProfit: 120,
      entryType: "limit" as const,
      ...overrides,
    };
  }

  it("fills a limit shadow trade on retrace and auto-closes at TP without touching the account", async () => {
    const { engine, account } = makeEngine();
    const trade = await engine.openShadowTrade(shadowReq());
    expect(trade.status).toBe("pending");
    expect(trade.strategyName).toBe("hermes-shadow");

    await engine.onTick(candle(1200, 104, 106, 99, 103)); // low 99 ≤ 100 → fill
    expect(engine.getOpenTrades()[0].status).toBe("active");

    await engine.onTick(candle(1300, 110, 121, 108, 119)); // high ≥ TP 120
    expect(engine.getOpenTrades().length).toBe(0);
    // Shadow PnL (+200) must NOT move the strategy account.
    expect(account.getBalance()).toBe(10_000);
  });

  it("auto-closes at SL, also without touching the account", async () => {
    const { engine, account } = makeEngine();
    await engine.openShadowTrade(shadowReq());
    await engine.onTick(candle(1200, 104, 106, 99, 103)); // fill at 100
    await engine.onTick(candle(1300, 99, 100, 89, 91)); // low ≤ SL 90
    expect(engine.getOpenTrades().length).toBe(0);
    expect(account.getBalance()).toBe(10_000);
  });

  it("fills a market shadow trade at the next tick's close", async () => {
    const { engine } = makeEngine();
    await engine.openShadowTrade(shadowReq({ entryType: "market" }));

    await engine.onTick(candle(1200, 105, 106, 104, 105.5));
    const open = engine.getOpenTrades()[0];
    expect(open.status).toBe("active");
    expect(open.entryPrice).toBe(105.5); // observed price, not the quoted 100
  });

  it("does not consume the strategy's open-trade slot", async () => {
    const { engine } = makeEngine({ maxOpenTrades: 1 });
    await engine.openShadowTrade(shadowReq());

    // The strategy's own signal must still get its slot.
    const strategyTrade = await engine.onSignal(longSignal());
    expect(strategyTrade).not.toBeNull();
  });

  it("caps concurrent shadow trades at maxOpenShadowTrades", async () => {
    const { engine } = makeEngine({ maxOpenShadowTrades: 1 });
    await engine.openShadowTrade(shadowReq({ clientOrderId: "a" }));
    await expect(engine.openShadowTrade(shadowReq({ clientOrderId: "b" }))).rejects.toThrow(
      /max open shadow trades/,
    );
  });

  it("rejects incoherent price geometry", async () => {
    const { engine } = makeEngine();
    await expect(
      engine.openShadowTrade(shadowReq({ stopLoss: 110 })), // long with SL above entry
    ).rejects.toThrow(/long requires/);
    await expect(
      engine.openShadowTrade(shadowReq({ side: "short" })), // short with long geometry
    ).rejects.toThrow(/short requires/);
  });

  it("replaying a clientOrderId returns the existing open trade", async () => {
    const { engine } = makeEngine();
    const first = await engine.openShadowTrade(shadowReq({ clientOrderId: "retry-1" }));
    const second = await engine.openShadowTrade(shadowReq({ clientOrderId: "retry-1" }));
    expect(second.id).toBe(first.id);
    expect(engine.getOpenTrades().length).toBe(1);
  });

  it("honors a per-trade timeoutCandles override", async () => {
    // Engine default is 24 bars; the shadow trade asks for 2.
    const { engine } = makeEngine();
    await engine.openShadowTrade(shadowReq({ timeoutCandles: 2 }));
    await engine.onTick(candle(1100, 104, 106, 99, 103)); // fill at 100

    await engine.onCandleClosed(candle(1200, 105, 106, 104, 105));
    expect(engine.getOpenTrades().length).toBe(1);
    await engine.onCandleClosed(candle(1300, 105, 106, 104, 105));
    expect(engine.getOpenTrades().length).toBe(0); // timed out at 2 bars
  });
});
