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
    direction: "above",
    targetPrice: 100,
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

/** Fake store that serves a fixed active set and records mutations. */
function makeStore(active: PriceAlert[]) {
  const triggered: number[] = [];
  const repeated: number[] = [];
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
  } as unknown as AlertStore;
  return { store, triggered, repeated };
}

function makeWsServer() {
  const sent: WsAlertTriggeredMessage[] = [];
  const wsServer = {
    broadcastAlert: (m: WsAlertTriggeredMessage) => sent.push(m),
  } as unknown as WsServer;
  return { wsServer, sent };
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
