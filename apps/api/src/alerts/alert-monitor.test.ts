import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AlertMonitor } from "./alert-monitor";
import type { AlertStore } from "./alert-store";
import type { WsServer } from "../market-data/ws-server";
import type { PriceAlert } from "./types";
import type { WsAlertTriggeredMessage } from "@ict-forward-lab/core";

function makeAlert(partial: Partial<PriceAlert>): PriceAlert {
  return {
    id: 1,
    exchange: "bybit",
    symbol: "BTCUSDT",
    kind: "price",
    targetKind: "level",
    direction: "above",
    targetPrice: 100,
    priceLow: null,
    priceHigh: null,
    trigger: null,
    indicatorKind: null,
    indicatorId: null,
    indicatorDirection: null,
    timeframe: null,
    status: "active",
    repeat: false,
    note: null,
    triggeredAt: null,
    triggeredPrice: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

/** Helper to build a zone (indicator) alert. */
function makeZoneAlert(partial: Partial<PriceAlert>): PriceAlert {
  return makeAlert({
    kind: "indicator",
    targetKind: "zone",
    targetPrice: null,
    priceLow: 100,
    priceHigh: 110,
    trigger: "touch",
    indicatorKind: "fvg",
    indicatorId: "bullish-fvg-1",
    timeframe: "15m",
    ...partial,
  });
}

/** Fake store that serves a fixed active set and records mutations. */
function makeStore(active: PriceAlert[]) {
  const triggered: number[] = [];
  const repeated: number[] = [];
  const disabled: number[] = [];
  const store = {
    listActive: async () => active,
    markTriggered: async (id: number) => {
      triggered.push(id);
      return null;
    },
    recordRepeat: async (id: number) => {
      repeated.push(id);
      return null;
    },
    update: async (id: number, input: { status?: string }) => {
      if (input.status === "disabled") disabled.push(id);
      return null;
    },
  } as unknown as AlertStore;
  return { store, triggered, repeated, disabled };
}

function makeWsServer() {
  const sent: WsAlertTriggeredMessage[] = [];
  const expired: { id: number }[] = [];
  const wsServer = {
    broadcastAlert: (m: WsAlertTriggeredMessage) => sent.push(m),
    broadcastAlertExpired: (m: { data: { id: number } }) => expired.push(m.data),
  } as unknown as WsServer;
  return { wsServer, sent, expired };
}

describe("AlertMonitor — crossing detection", () => {
  let triggered: number[];
  let repeated: number[];
  let sent: WsAlertTriggeredMessage[];

  function setup(alerts: PriceAlert[]) {
    const s = makeStore(alerts);
    const w = makeWsServer();
    triggered = s.triggered;
    repeated = s.repeated;
    sent = w.sent;
    return new AlertMonitor({ store: s.store, wsServer: w.wsServer });
  }

  beforeEach(() => {
    triggered = [];
    repeated = [];
    sent = [];
  });

  it("does not fire on the first observation (no previous price)", async () => {
    const monitor = setup([makeAlert({ direction: "above", targetPrice: 100 })]);
    await monitor.reload();
    await monitor.onPrice("BTCUSDT", 150); // above target, but no prior reference
    expect(sent).toHaveLength(0);
  });

  it("fires an 'above' alert when price crosses up through the target", async () => {
    const monitor = setup([makeAlert({ id: 7, direction: "above", targetPrice: 100 })]);
    await monitor.reload();
    await monitor.onPrice("BTCUSDT", 99);
    await monitor.onPrice("BTCUSDT", 101);
    expect(sent).toHaveLength(1);
    expect(sent[0].data.id).toBe(7);
    expect(sent[0].data.triggeredPrice).toBe(101);
    expect(triggered).toEqual([7]);
  });

  it("does not fire an 'above' alert when price moves down through the target", async () => {
    const monitor = setup([makeAlert({ direction: "above", targetPrice: 100 })]);
    await monitor.reload();
    await monitor.onPrice("BTCUSDT", 101);
    await monitor.onPrice("BTCUSDT", 99);
    expect(sent).toHaveLength(0);
  });

  it("fires a 'below' alert when price crosses down through the target", async () => {
    const monitor = setup([makeAlert({ direction: "below", targetPrice: 100 })]);
    await monitor.reload();
    await monitor.onPrice("BTCUSDT", 101);
    await monitor.onPrice("BTCUSDT", 100);
    expect(sent).toHaveLength(1);
    expect(triggered).toHaveLength(1);
  });

  it("fires a 'cross' alert in either direction", async () => {
    const monitor = setup([makeAlert({ direction: "cross", targetPrice: 100 })]);
    await monitor.reload();
    await monitor.onPrice("BTCUSDT", 99);
    await monitor.onPrice("BTCUSDT", 101);
    expect(sent).toHaveLength(1);
  });

  it("one-shot alerts fire only once even if price oscillates", async () => {
    const monitor = setup([makeAlert({ direction: "above", targetPrice: 100 })]);
    await monitor.reload();
    await monitor.onPrice("BTCUSDT", 99);
    await monitor.onPrice("BTCUSDT", 101); // fires
    await monitor.onPrice("BTCUSDT", 99);
    await monitor.onPrice("BTCUSDT", 101); // would cross again, but disarmed
    expect(sent).toHaveLength(1);
  });

  it("repeat alerts re-arm and fire on each crossing", async () => {
    const monitor = setup([
      makeAlert({ id: 3, direction: "above", targetPrice: 100, repeat: true }),
    ]);
    await monitor.reload();
    await monitor.onPrice("BTCUSDT", 99);
    await monitor.onPrice("BTCUSDT", 101); // fires
    await monitor.onPrice("BTCUSDT", 99);
    await monitor.onPrice("BTCUSDT", 101); // fires again
    expect(sent).toHaveLength(2);
    expect(repeated).toEqual([3, 3]);
    expect(triggered).toHaveLength(0);
  });

  it("ignores alerts for a different symbol", async () => {
    const monitor = setup([makeAlert({ symbol: "ETHUSDT", direction: "above", targetPrice: 100 })]);
    await monitor.reload();
    await monitor.onPrice("BTCUSDT", 99);
    await monitor.onPrice("BTCUSDT", 101);
    expect(sent).toHaveLength(0);
  });

  describe("zone alerts — touch", () => {
    it("fires when price enters the band from below", async () => {
      const monitor = setup([makeZoneAlert({ id: 11, trigger: "touch", priceLow: 100, priceHigh: 110 })]);
      await monitor.reload();
      await monitor.onPrice("BTCUSDT", 95);
      await monitor.onPrice("BTCUSDT", 105); // enters [100,110]
      expect(sent).toHaveLength(1);
      expect(sent[0].data.id).toBe(11);
      expect(sent[0].data.targetKind).toBe("zone");
    });

    it("fires when price enters the band from above", async () => {
      const monitor = setup([makeZoneAlert({ trigger: "touch", priceLow: 100, priceHigh: 110 })]);
      await monitor.reload();
      await monitor.onPrice("BTCUSDT", 120);
      await monitor.onPrice("BTCUSDT", 108); // enters from above
      expect(sent).toHaveLength(1);
    });

    it("fires when price jumps clean across the band", async () => {
      const monitor = setup([makeZoneAlert({ trigger: "touch", priceLow: 100, priceHigh: 110 })]);
      await monitor.reload();
      await monitor.onPrice("BTCUSDT", 90);
      await monitor.onPrice("BTCUSDT", 120); // jumps through [100,110]
      expect(sent).toHaveLength(1);
    });

    it("does not fire while price stays outside the band", async () => {
      const monitor = setup([makeZoneAlert({ trigger: "touch", priceLow: 100, priceHigh: 110 })]);
      await monitor.reload();
      await monitor.onPrice("BTCUSDT", 90);
      await monitor.onPrice("BTCUSDT", 95);
      expect(sent).toHaveLength(0);
    });

    it("does not re-fire (one-shot) while price stays inside the band", async () => {
      const monitor = setup([makeZoneAlert({ trigger: "touch", priceLow: 100, priceHigh: 110 })]);
      await monitor.reload();
      await monitor.onPrice("BTCUSDT", 95);
      await monitor.onPrice("BTCUSDT", 105); // fires
      await monitor.onPrice("BTCUSDT", 107); // still inside, disarmed
      expect(sent).toHaveLength(1);
    });
  });

  describe("zone alerts — cross", () => {
    it("fires only when price passes fully through the band", async () => {
      const monitor = setup([makeZoneAlert({ trigger: "cross", priceLow: 100, priceHigh: 110 })]);
      await monitor.reload();
      await monitor.onPrice("BTCUSDT", 95);
      await monitor.onPrice("BTCUSDT", 105); // entered but did not exit far side
      expect(sent).toHaveLength(0);
      await monitor.onPrice("BTCUSDT", 115); // now through the far edge
      expect(sent).toHaveLength(1);
    });

    it("fires on a single tick that traverses the whole band", async () => {
      const monitor = setup([makeZoneAlert({ trigger: "cross", priceLow: 100, priceHigh: 110 })]);
      await monitor.reload();
      await monitor.onPrice("BTCUSDT", 90);
      await monitor.onPrice("BTCUSDT", 120);
      expect(sent).toHaveLength(1);
    });
  });
});

describe("AlertMonitor — outbound webhook", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the fired alert to the configured webhook with the secret header", async () => {
    const s = makeStore([makeAlert({ id: 9, direction: "above", targetPrice: 100 })]);
    const w = makeWsServer();
    const monitor = new AlertMonitor({
      store: s.store,
      wsServer: w.wsServer,
      webhook: { url: "https://hermes.example.com/hooks/price-alert", secret: "shh" },
    });
    await monitor.reload();
    await monitor.onPrice("BTCUSDT", 99);
    await monitor.onPrice("BTCUSDT", 101); // crosses → fires
    // Fire-and-forget: let the microtask running the POST settle.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hermes.example.com/hooks/price-alert");
    expect(init.method).toBe("POST");
    expect(init.headers["x-webhook-secret"]).toBe("shh");
    const body = JSON.parse(init.body);
    expect(body.event).toBe("alert:triggered");
    expect(body.data.id).toBe(9);
    expect(body.data.triggeredPrice).toBe(101);
  });

  it("does not POST anything when no webhook is configured", async () => {
    const s = makeStore([makeAlert({ direction: "above", targetPrice: 100 })]);
    const w = makeWsServer();
    const monitor = new AlertMonitor({ store: s.store, wsServer: w.wsServer });
    await monitor.reload();
    await monitor.onPrice("BTCUSDT", 99);
    await monitor.onPrice("BTCUSDT", 101);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AlertMonitor — FVG auto-expiry", () => {
  it("disables and broadcasts a matching FVG alert when its zone is mitigated", async () => {
    const s = makeStore([
      makeZoneAlert({ id: 21, indicatorKind: "fvg", indicatorId: "bullish-fvg-1", timeframe: "15m", repeat: true }),
    ]);
    const w = makeWsServer();
    const monitor = new AlertMonitor({ store: s.store, wsServer: w.wsServer });
    await monitor.reload();

    await monitor.expireFvgZones("BTCUSDT", "15m", ["bullish-fvg-1"]);

    expect(s.disabled).toEqual([21]);
    expect(w.expired.map((e) => e.id)).toEqual([21]);
  });

  it("ignores zone ids / timeframes that don't match", async () => {
    const s = makeStore([
      makeZoneAlert({ id: 22, indicatorId: "bullish-fvg-1", timeframe: "15m" }),
    ]);
    const w = makeWsServer();
    const monitor = new AlertMonitor({ store: s.store, wsServer: w.wsServer });
    await monitor.reload();

    await monitor.expireFvgZones("BTCUSDT", "5m", ["bullish-fvg-1"]); // wrong tf
    await monitor.expireFvgZones("BTCUSDT", "15m", ["other-zone"]); // wrong id

    expect(s.disabled).toEqual([]);
    expect(w.expired.map((e) => e.id)).toEqual([]);
  });

  it("does not expire plain price alerts", async () => {
    const s = makeStore([makeAlert({ id: 23, kind: "price", targetKind: "level", targetPrice: 100 })]);
    const w = makeWsServer();
    const monitor = new AlertMonitor({ store: s.store, wsServer: w.wsServer });
    await monitor.reload();

    await monitor.expireFvgZones("BTCUSDT", "15m", ["bullish-fvg-1"]);

    expect(s.disabled).toEqual([]);
  });
});
